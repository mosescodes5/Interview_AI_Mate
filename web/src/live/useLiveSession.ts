import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, errText } from "../services/api";
import { BrowserSpeech, UtteranceRecorder, browserSpeechSupported, extForMime } from "./audioListener";
import { QuestionMemory, UtteranceAggregator, extractQuestion, isJunkTranscript } from "./questionDetector";
import { ScreenWatcher, type Focus, type WatcherState } from "./screenWatcher";

export type Source = "screen" | "tab" | "mic" | "manual";
export type EntryStatus = "detected" | "queued" | "generating" | "done" | "error" | "skipped";
export interface Entry {
  id: number; question: string; source: Source; status: EntryStatus;
  answer?: string; error?: string; at: number; ms?: number;
}

export interface LiveConfig {
  screen: boolean; tabAudio: boolean; mic: boolean;
  micEngine: "server" | "browser";
  intervalSec: number; focus: Focus;
  auto: boolean; questionsOnly: boolean;
  role: string; profileId: string; lang: string;
}

const BUSY_CODES = new Set(["ollama_busy", "ai_busy", "rate_limited"]);
const MAX_QUEUED = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useLiveSession(config: LiveConfig) {
  const cfg = useRef(config);
  cfg.current = config; // callbacks always see the latest settings (auto-answer, role, profile…)

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [watcherState, setWatcherState] = useState<WatcherState>("idle");
  const [levels, setLevels] = useState({ tab: 0, mic: 0 });
  const [interim, setInterim] = useState("");
  const [lastHeard, setLastHeard] = useState("");
  const [lastOcr, setLastOcr] = useState("");
  const [pendingTranscripts, setPendingTranscripts] = useState(0);
  const [ignored, setIgnored] = useState(0);

  const memory = useRef(new QuestionMemory());
  const nextId = useRef(1);
  const entriesRef = useRef<Entry[]>([]);
  const pumping = useRef(false);
  const alive = useRef(true);
  const display = useRef<MediaStream | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const watcher = useRef<ScreenWatcher | null>(null);
  const recorders = useRef<UtteranceRecorder[]>([]);
  const speech = useRef<BrowserSpeech | null>(null);
  const aggregators = useRef<UtteranceAggregator[]>([]);
  const transcribeChain = useRef<Promise<void>>(Promise.resolve());
  const levelTimer = useRef(0);
  const levelRef = useRef({ tab: 0, mic: 0 });
  const runningRef = useRef(false);

  const update = useCallback((fn: (e: Entry[]) => Entry[]) => {
    entriesRef.current = fn(entriesRef.current);
    if (alive.current) setEntries(entriesRef.current);
  }, []);
  const patch = useCallback((id: number, p: Partial<Entry>) => update((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e))), [update]);

  /* ---------- answer generation (one at a time; waits out "model busy" instead of failing) ---------- */
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      for (;;) {
        const next = entriesRef.current.find((e) => e.status === "queued");
        if (!next || !alive.current) break;
        patch(next.id, { status: "generating", error: undefined });
        const t0 = performance.now();
        try {
          let res: { answer: string } | null = null;
          for (let attempt = 0; attempt < 8 && !res; attempt++) {
            try {
              res = await api.post<{ answer: string }>("/api/live/answer", {
                question: next.question, role: cfg.current.role || "Software Developer",
                profile_id: cfg.current.profileId ? Number(cfg.current.profileId) : null,
              });
            } catch (e) {
              if (e instanceof ApiError && e.code && BUSY_CODES.has(e.code) && attempt < 7) { await sleep(e.code === "rate_limited" ? 5000 : 1500); continue; }
              throw e;
            }
          }
          memory.current.rememberOwn(res!.answer);
          patch(next.id, { status: "done", answer: res!.answer, ms: Math.round(performance.now() - t0) });
        } catch (e) {
          patch(next.id, { status: "error", error: errText(e) });
        }
      }
    } finally { pumping.current = false; }
  }, [patch]);

  const addQuestion = useCallback((question: string, source: Source, opts?: { force?: boolean }) => {
    const q = question.trim();
    if (q.length < 3) return;
    if (!opts?.force) {
      if (memory.current.isOwnText(q) || memory.current.isDuplicate(q)) { setIgnored((n) => n + 1); return; }
    }
    memory.current.remember(q);
    const auto = cfg.current.auto || source === "manual";
    const entry: Entry = { id: nextId.current++, question: q, source, status: auto ? "queued" : "detected", at: Date.now() };
    update((es) => {
      const out = [entry, ...es];
      // Keep the queue short: if the interviewer moved on, stale unanswered questions are skipped.
      let queued = 0;
      return out.map((e) => (e.status === "queued" && ++queued > MAX_QUEUED ? { ...e, status: "skipped" as const } : e));
    });
    if (auto) void pump();
  }, [pump, update]);

  const answerEntry = useCallback((id: number) => {
    patch(id, { status: "queued", error: undefined, answer: undefined });
    void pump();
  }, [patch, pump]);

  const removeEntry = useCallback((id: number) => update((es) => es.filter((e) => e.id !== id)), [update]);
  const clearEntries = useCallback(() => { update(() => []); memory.current.clear(); setIgnored(0); }, [update]);

  /* ---------- inputs ---------- */
  const handleSpeech = useCallback((text: string, source: Source) => {
    setLastHeard(text);
    const q = cfg.current.questionsOnly ? extractQuestion(text, "speech") : text;
    if (q) addQuestion(q, source);
  }, [addQuestion]);

  const makeAggregator = useCallback((source: Source) => {
    const a = new UtteranceAggregator(1200, (t) => handleSpeech(t, source));
    aggregators.current.push(a);
    return a;
  }, [handleSpeech]);

  const transcribeUtterance = useCallback((blob: Blob, agg: UtteranceAggregator) => {
    setPendingTranscripts((n) => n + 1);
    transcribeChain.current = transcribeChain.current.then(async () => {
      try {
        if (!runningRef.current) return;
        const out = await api.upload<{ text: string }>("/api/transcription/transcribe", blob, `speech.${extForMime(blob.type)}`);
        const text = (out.text ?? "").trim();
        if (runningRef.current && text && !isJunkTranscript(text)) agg.add(text);
      } catch (e) {
        if (alive.current) setError(errText(e));
        if (e instanceof ApiError && e.status === 503 && alive.current) setNotice("Server transcription is unavailable. Install requirements-audio.txt, or use the browser engine for the microphone.");
      } finally { if (alive.current) setPendingTranscripts((n) => Math.max(0, n - 1)); }
    });
  }, []);

  const pushLevel = useCallback((key: "tab" | "mic", v: number) => {
    levelRef.current[key] = v;
    const now = performance.now();
    if (now - levelTimer.current > 250 && alive.current) { levelTimer.current = now; setLevels({ ...levelRef.current }); }
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    watcher.current?.stop(); watcher.current = null;
    recorders.current.forEach((r) => r.stop()); recorders.current = [];
    speech.current?.stop(); speech.current = null;
    aggregators.current.forEach((a) => a.cancel()); aggregators.current = [];
    display.current?.getTracks().forEach((t) => t.stop()); display.current = null;
    micStream.current?.getTracks().forEach((t) => t.stop()); micStream.current = null;
    if (alive.current) {
      setPreview(null); setRunning(false); setWatcherState("idle"); setInterim("");
      levelRef.current = { tab: 0, mic: 0 }; setLevels({ tab: 0, mic: 0 });
    }
  }, []);

  const start = useCallback(async () => {
    const c = cfg.current;
    setError(""); setNotice("");
    if (!c.screen && !c.tabAudio && !c.mic) { setError("Choose at least one input: screen, tab/window audio, or microphone."); return; }
    if (!window.isSecureContext) { setError("Screen and microphone capture only work on HTTPS or http://localhost. Open the app from one of those addresses."); return; }
    setStarting(true);
    try {
      const wantDisplay = c.screen || c.tabAudio;
      if (wantDisplay) {
        if (!navigator.mediaDevices?.getDisplayMedia) { setError("This browser cannot share a screen (no getDisplayMedia). Use desktop Chrome, Edge or Firefox, or type questions manually."); return; }
        try {
          // Chrome-only hints are ignored elsewhere. selfBrowserSurface:"exclude" keeps this app out of the picker so it can't read its own answers.
          const constraints = {
            video: { frameRate: { ideal: 5, max: 10 } },
            audio: c.tabAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
            selfBrowserSurface: "exclude", systemAudio: "include", surfaceSwitching: "include",
          } as unknown as DisplayMediaStreamOptions;
          display.current = await navigator.mediaDevices.getDisplayMedia(constraints);
        } catch (e) {
          const name = e instanceof DOMException ? e.name : "";
          setError(name === "NotAllowedError" ? "Screen sharing was cancelled or blocked. Click Start again and choose a screen, window or tab to share." : `Could not start screen sharing: ${errText(e)}`);
          return;
        }
      }
      const d = display.current;
      const vt = d?.getVideoTracks()[0];
      if (d && vt) {
        setPreview(d);
        vt.onended = () => { if (alive.current) setNotice("Screen sharing was stopped from the browser, so the session ended."); stop(); };
      }

      let started = 0;
      runningRef.current = true;

      if (c.screen && vt) {
        const w = new ScreenWatcher({
          track: vt, intervalMs: c.intervalSec * 1000, focus: c.focus,
          onState: (s) => alive.current && setWatcherState(s),
          onText: (text) => {
            setLastOcr(text);
            const q = extractQuestion(text, "screen");
            if (q) addQuestion(q, "screen");
          },
          onError: (m, fatal) => { if (alive.current) setError(fatal ? m + " Screen reading was switched off." : m); },
        });
        watcher.current = w;
        await w.start();
        started++;
      }

      if (c.tabAudio) {
        if (!d || !d.getAudioTracks().length) {
          setNotice("No audio was shared with the screen. In Chrome/Edge choose a Tab and tick “Also share tab audio” (or choose Entire screen + “Also share system audio” on Windows). Firefox cannot share tab audio.");
        } else {
          const aggTab = makeAggregator("tab");
          const rec = new UtteranceRecorder(d, { onUtterance: (u) => transcribeUtterance(u.blob, aggTab), onLevel: (l) => pushLevel("tab", l), onError: (m) => setError(m) });
          rec.start(); recorders.current.push(rec); started++;
        }
      }

      if (c.mic) {
        let engine = c.micEngine;
        if (engine === "browser" && !browserSpeechSupported()) { engine = "server"; setNotice("Instant browser transcription isn’t available in this browser, so the microphone is using the server (Whisper) engine."); }
        const aggMic = makeAggregator("mic");
        if (engine === "browser") {
          const sp = new BrowserSpeech({
            lang: c.lang || "en-US",
            onInterim: (t) => alive.current && setInterim(t),
            onFinal: (t) => { if (t && !isJunkTranscript(t)) aggMic.add(t); },
            onError: (m) => alive.current && setError(m),
          });
          sp.start(); speech.current = sp; started++;
        } else {
          try {
            micStream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            const rec = new UtteranceRecorder(micStream.current, { onUtterance: (u) => transcribeUtterance(u.blob, aggMic), onLevel: (l) => pushLevel("mic", l), onError: (m) => setError(m) });
            rec.start(); recorders.current.push(rec); started++;
          } catch (e) {
            setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone access was denied. Allow it in the browser’s site settings and start again." : `Microphone unavailable: ${errText(e)}`);
          }
        }
      }

      if (!started) { stop(); return; }
      setRunning(true);
    } catch (e) {
      setError(errText(e));
      stop();
    } finally { setStarting(false); }
  }, [addQuestion, makeAggregator, pushLevel, stop, transcribeUtterance]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; stop(); };
  }, [stop]);

  // Live-adjust the capture settings without restarting the session.
  useEffect(() => { watcher.current?.setInterval(config.intervalSec * 1000); }, [config.intervalSec]);
  useEffect(() => { watcher.current?.setFocus(config.focus); }, [config.focus]);

  const scanNow = useCallback(() => watcher.current?.scanNow(), []);

  return {
    running, starting, entries, error, notice, preview, watcherState, levels, interim, lastHeard, lastOcr,
    pendingTranscripts, ignored, start, stop, addQuestion, answerEntry, removeEntry, clearEntries, scanNow,
    setError, setNotice,
  };
}
