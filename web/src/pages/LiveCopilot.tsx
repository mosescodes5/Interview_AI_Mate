import { useEffect, useRef, useState } from "react";
import { Camera, Copy, Mic, Monitor, PictureInPicture2, RefreshCw, Send, Square, Trash2, Volume2, Wand2, X } from "lucide-react";
import { api } from "../services/api";
import { useLoad } from "../hooks/useAsync";
import type { Profile } from "../types";
import { Card, Empty, ErrorBox, Field, Notice, Spinner } from "../components/ui";
import { useLiveSession, type Entry, type LiveConfig } from "../live/useLiveSession";
import type { Focus } from "../live/screenWatcher";
import { browserSpeechSupported } from "../live/audioListener";
import { PopoutFeed, createPortal, popoutSupported, usePopout } from "../live/popout";

const KEY = "im.live.settings.v2";
const DEFAULTS: LiveConfig = {
  screen: true, tabAudio: true, mic: false, micEngine: "server", intervalSec: 3, focus: "full",
  auto: true, questionsOnly: true, role: "Software Developer", profileId: "", lang: "en-US",
};

function loadSettings(): LiveConfig {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULTS; }
}

const SOURCE_LABEL = { screen: "Screen", tab: "Tab audio", mic: "Microphone", manual: "Typed" } as const;

function EntryCard({ e, onAnswer, onRemove }: { e: Entry; onAnswer: () => void; onRemove: () => void }) {
  const badge = e.status === "done" ? <span className="badge ok">answered{e.ms ? ` · ${(e.ms / 1000).toFixed(1)}s` : ""}</span>
    : e.status === "error" ? <span className="badge err">failed</span>
    : e.status === "generating" ? <span className="badge wait">writing answer…</span>
    : e.status === "queued" ? <span className="badge wait">queued</span>
    : e.status === "skipped" ? <span className="badge">skipped (newer question arrived)</span>
    : <span className="badge">detected</span>;
  return (
    <article className={`entry ${e.status === "done" && Date.now() - e.at < 20000 ? "fresh" : ""}`} aria-live="polite">
      <div className="row between">
        <span className="statline"><span className="badge">{SOURCE_LABEL[e.source]}</span>{badge}<span className="muted">{new Date(e.at).toLocaleTimeString()}</span></span>
        <span className="row">
          {(e.status === "detected" || e.status === "skipped" || e.status === "error" || e.status === "done") && (
            <button className="btn small" onClick={onAnswer}>{e.status === "done" ? <><RefreshCw size={13} /> Regenerate</> : <><Wand2 size={13} /> Generate answer</>}</button>
          )}
          {e.answer && <button className="btn small" onClick={() => void navigator.clipboard?.writeText(e.answer!)}><Copy size={13} /> Copy</button>}
          <button className="btn small" onClick={onRemove} aria-label="Remove"><Trash2 size={13} /></button>
        </span>
      </div>
      <p className="q">{e.question}</p>
      {e.status === "generating" && <Spinner label="Preparing your answer…" />}
      {e.answer && <p className="a">{e.answer}</p>}
      {e.error && <p className="muted" role="alert">⚠ {e.error}</p>}
    </article>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return <span className="statline" style={{ flex: 1 }}><span className="muted" style={{ minWidth: 70 }}>{label}</span><span className="meter" aria-label={`${label} level`}><div style={{ width: `${Math.round(value * 100)}%` }} /></span></span>;
}

export function LiveCopilot() {
  const profiles = useLoad(() => api.get<Profile[]>("/api/profile"));
  const [cfg, setCfg] = useState<LiveConfig>(loadSettings);
  const [manual, setManual] = useState("");
  const set = <K extends keyof LiveConfig>(k: K, v: LiveConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* storage blocked */ } }, [cfg]);

  const s = useLiveSession(cfg);
  const pop = usePopout();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = s.preview;
    if (s.preview) void v.play().catch(() => undefined);
  }, [s.preview]);

  const displayOn = cfg.screen || cfg.tabAudio;
  const lock = s.running || s.starting;
  const stateText = { idle: "idle", watching: "watching for a new question", changed: "screen changed…", reading: "reading text…" }[s.watcherState];

  const ask = () => { const q = manual.trim(); if (q.length < 3) return; s.addQuestion(q, "manual", { force: true }); setManual(""); };

  return (
    <div className="stack">
      <p className="muted">
        Share an interview window or tab and InterviewMate reads new questions from the screen, listens to the audio, and drafts an answer from your CV automatically.
        You choose exactly what is shared and can stop at any time. Treat every answer as a draft: check it is accurate and in your own words, and only use this where the interview or assessment rules allow it.
      </p>

      <div className="live-top">
        <Card title="1 · Inputs">
          <div className="grid3">
            <label className="check"><input type="checkbox" checked={cfg.screen} disabled={lock} onChange={(e) => set("screen", e.target.checked)} /> <Monitor size={15} /> Read questions on screen (OCR)</label>
            <label className="check"><input type="checkbox" checked={cfg.tabAudio} disabled={lock} onChange={(e) => set("tabAudio", e.target.checked)} /> <Volume2 size={15} /> Listen to shared tab / system audio</label>
            <label className="check"><input type="checkbox" checked={cfg.mic} disabled={lock} onChange={(e) => set("mic", e.target.checked)} /> <Mic size={15} /> Listen to my microphone</label>
          </div>
          <div className="grid3">
            <Field label="Check the screen every">
              <select value={cfg.intervalSec} onChange={(e) => set("intervalSec", Number(e.target.value))}>
                {[1, 2, 3, 5, 10, 15].map((n) => <option key={n} value={n}>{n} second{n > 1 ? "s" : ""}</option>)}
              </select>
            </Field>
            <Field label="Area to read">
              <select value={cfg.focus} onChange={(e) => set("focus", e.target.value as Focus)}>
                <option value="full">Whole shared screen</option><option value="top">Top half</option><option value="bottom">Bottom half</option>
                <option value="left">Left half</option><option value="right">Right half</option>
              </select>
            </Field>
            <Field label="Microphone transcription">
              <select value={cfg.micEngine} disabled={lock} onChange={(e) => set("micEngine", e.target.value as LiveConfig["micEngine"])}>
                <option value="server">Server (Whisper, private)</option>
                <option value="browser" disabled={!browserSpeechSupported()}>Browser (instant, sends audio to browser vendor)</option>
              </select>
            </Field>
            <Field label="Spoken language (browser engine)"><input value={cfg.lang} disabled={lock} onChange={(e) => set("lang", e.target.value)} placeholder="en-US" /></Field>
            <Field label="Your role"><input value={cfg.role} onChange={(e) => set("role", e.target.value)} /></Field>
            <Field label="Answer from this CV / profile">
              <select value={cfg.profileId} onChange={(e) => set("profileId", e.target.value)}>
                <option value="">No profile selected</option>
                {profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="row">
            <label className="check"><input type="checkbox" checked={cfg.auto} onChange={(e) => set("auto", e.target.checked)} /> Answer new questions automatically</label>
            <label className="check"><input type="checkbox" checked={cfg.questionsOnly} onChange={(e) => set("questionsOnly", e.target.checked)} /> Only react to questions / prompts</label>
          </div>
          <div className="row">
            {!s.running
              ? <button className="btn primary" onClick={() => void s.start()} disabled={s.starting}>{s.starting ? <Spinner label="Starting…" /> : <><Camera size={16} /> Start listening{displayOn ? " (choose what to share)" : ""}</>}</button>
              : <button className="btn danger" onClick={s.stop}><Square size={16} /> Stop</button>}
            <button className="btn" onClick={s.scanNow} disabled={!s.running || !cfg.screen}><Camera size={16} /> Read screen now</button>
          </div>
          {cfg.screen && !s.running && <p className="muted">Tip: share the interview <strong>window or tab</strong> rather than your whole screen, so only the question area is read. The browser always asks first.</p>}
        </Card>

        <Card title="Status">
          {s.running ? <p className="statline"><span className="rec-dot">●</span> Live</p> : <p className="muted">Not running.</p>}
          {s.preview && <video ref={videoRef} className="live-preview" muted playsInline aria-label="Preview of what you are sharing" />}
          {s.running && cfg.screen && <p className="statline">Screen: <span className="pill">{stateText}</span></p>}
          {s.running && cfg.tabAudio && <Meter label="Tab audio" value={s.levels.tab} />}
          {s.running && cfg.mic && cfg.micEngine === "server" && <Meter label="Microphone" value={s.levels.mic} />}
          {s.pendingTranscripts > 0 && <Spinner label={`Transcribing ${s.pendingTranscripts}…`} />}
          {s.interim && <p className="muted">Hearing: “{s.interim}”</p>}
          {s.lastHeard && <p className="muted">Last heard: “{s.lastHeard.slice(0, 140)}”</p>}
          {s.ignored > 0 && <p className="muted">{s.ignored} repeated question{s.ignored > 1 ? "s" : ""} ignored.</p>}
        </Card>
      </div>

      {s.error && <ErrorBox message={s.error} onRetry={() => s.setError("")} />}
      {s.notice && <Notice>{s.notice}</Notice>}

      <Card title="2 · Type or paste a question">
        <Field label="Question (Ctrl+Enter to send)">
          <textarea rows={3} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. Explain the difference between let and const…"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ask(); } }} />
        </Field>
        <div className="row"><button className="btn primary" onClick={ask} disabled={manual.trim().length < 3}><Send size={16} /> Get answer</button></div>
      </Card>

      <Card title="3 · Questions and answers">
        <div className="row between">
          <span className="muted">Newest first. Repeated questions are only answered once.</span>
          <span className="row">
            {popoutSupported() && (pop.isOpen
              ? <button className="btn small" onClick={pop.close}><X size={13} /> Close floating answers</button>
              : <button className="btn small" onClick={() => void pop.open()}><PictureInPicture2 size={13} /> Floating answers</button>)}
            {s.entries.length > 0 && <button className="btn small" onClick={s.clearEntries}><Trash2 size={13} /> Clear all</button>}
          </span>
        </div>
        {pop.error && <p className="muted" role="alert">⚠ {pop.error}</p>}
        {pop.isOpen && <Notice>Answers are also shown in the floating window. It is a normal window, not hidden from capture: share a single tab or window (not your entire screen) in your call.</Notice>}
        {s.entries.length === 0
          ? <Empty title="Nothing yet" hint={s.running ? "Waiting for the next question…" : "Start listening, or type a question above."} />
          : <div className="feed">{s.entries.map((e) => <EntryCard key={e.id} e={e} onAnswer={() => s.answerEntry(e.id)} onRemove={() => s.removeEntry(e.id)} />)}</div>}
        <details className="dbg"><summary>What was read from the screen (for troubleshooting)</summary><pre className="code pre">{s.lastOcr || "(nothing read yet)"}</pre></details>
      </Card>
      <p className="muted">Screen frames and audio are processed in memory and sent only to your own backend; nothing is saved. With a cloud AI provider selected in Settings, the detected question and your CV text are sent to that provider.</p>
      {pop.container && createPortal(<PopoutFeed entries={s.entries} kind={pop.kind} />, pop.container)}
    </div>
  );
}
