import { createTicker } from "./ticker";

export type Utterance = { blob: Blob; durationMs: number };

export function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
}

export const extForMime = (mime: string) => (mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : "webm");

export interface RecorderOptions {
  onUtterance: (u: Utterance) => void;
  onLevel?: (level: number, speaking: boolean) => void;
  onError?: (message: string) => void;
  silenceMs?: number;   // pause that ends an utterance
  minSpeechMs?: number; // shorter bursts are treated as noise
  maxMs?: number;       // hard cap per utterance
}

type Segment = { start: number; speechMs: number; lastVoice: number; keep: boolean };

/**
 * Splits a continuous audio stream into utterances at natural pauses (instead of fixed clips that cut sentences in half)
 * and hands each utterance to onUtterance as a self-contained audio file. Silence is never recorded or uploaded.
 * The audio is analysed only; it is not routed to the speakers, so there is no echo.
 */
export class UtteranceRecorder {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data = new Float32Array(1024);
  private stopTick: (() => void) | null = null;
  private rec: MediaRecorder | null = null;
  private seg: Segment = { start: 0, speechMs: 0, lastVoice: 0, keep: false };
  private audioStream: MediaStream | null = null;
  private floor = 0.004;
  private active = false;
  private readonly silenceMs: number;
  private readonly minSpeechMs: number;
  private readonly maxMs: number;

  constructor(private source: MediaStream, private opts: RecorderOptions) {
    this.silenceMs = opts.silenceMs ?? 900;
    this.minSpeechMs = opts.minSpeechMs ?? 400;
    this.maxMs = opts.maxMs ?? 25000;
  }

  start() {
    const tracks = this.source.getAudioTracks();
    if (!tracks.length) throw new Error("This source has no audio track.");
    if (typeof MediaRecorder === "undefined") throw new Error("This browser cannot record audio (MediaRecorder is missing).");
    this.audioStream = new MediaStream(tracks);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    void this.ctx.resume();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.audioStream).connect(this.analyser);
    this.data = new Float32Array(this.analyser.fftSize);
    this.active = true;
    this.begin();
    this.stopTick = createTicker(100, () => this.tick());
  }

  private begin() {
    if (!this.audioStream) return;
    const mime = pickMime();
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(this.audioStream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined); }
    catch (e) { this.opts.onError?.("Could not start audio recording: " + (e instanceof Error ? e.message : String(e))); this.active = false; return; }
    const chunks: Blob[] = [];
    const seg: Segment = { start: performance.now(), speechMs: 0, lastVoice: 0, keep: false };
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onerror = () => this.opts.onError?.("The audio recorder reported an error.");
    rec.onstop = () => {
      if (seg.keep && chunks.length) this.opts.onUtterance({ blob: new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }), durationMs: seg.speechMs });
    };
    this.seg = seg;
    this.rec = rec;
    rec.start();
  }

  private cut(keep: boolean) {
    const rec = this.rec;
    if (!rec || rec.state === "inactive") return;
    this.seg.keep = keep;
    rec.stop();
    if (this.active) this.begin();
  }

  private tick() {
    if (!this.active || !this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) sum += this.data[i] * this.data[i];
    const rms = Math.sqrt(sum / this.data.length);
    const threshold = Math.max(0.012, this.floor * 3.5);
    const speaking = rms > threshold;
    const now = performance.now();
    const seg = this.seg;
    if (speaking) { seg.speechMs += 100; seg.lastVoice = now; }
    else this.floor = Math.min(0.05, this.floor * 0.95 + rms * 0.05); // adapt to room / system noise
    this.opts.onLevel?.(Math.min(1, rms * 8), speaking);

    const silentFor = now - seg.lastVoice;
    if (seg.speechMs >= this.minSpeechMs && silentFor > this.silenceMs) this.cut(true);
    else if (now - seg.start > this.maxMs) this.cut(seg.speechMs >= this.minSpeechMs);
    else if (seg.speechMs === 0 && now - seg.start > 3000) this.cut(false);                       // drop idle silence
    else if (seg.speechMs > 0 && seg.speechMs < this.minSpeechMs && silentFor > this.silenceMs) this.cut(false); // noise blip
  }

  stop() {
    this.active = false;
    this.stopTick?.();
    this.stopTick = null;
    if (this.rec && this.rec.state !== "inactive") { this.seg.keep = false; try { this.rec.stop(); } catch { /* ignore */ } }
    this.rec = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.analyser = null;
    this.audioStream = null; // tracks belong to the caller's stream; the caller stops them
  }
}

/* ---------- Browser speech recognition (microphone only; instant, no server needed) ---------- */
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SRInstance {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SRCtor = new () => SRInstance;

const srCtor = (): SRCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
export const browserSpeechSupported = () => typeof window !== "undefined" && !!srCtor();

export class BrowserSpeech {
  private rec: SRInstance | null = null;
  private active = false;
  constructor(private o: { lang: string; onInterim: (t: string) => void; onFinal: (t: string) => void; onError: (m: string) => void }) {}

  start() {
    const Ctor = srCtor();
    if (!Ctor) throw new Error("This browser has no built-in speech recognition. Use the server (Whisper) engine or Chrome/Edge.");
    this.active = true;
    const make = () => {
      const r = new Ctor();
      r.lang = this.o.lang; r.continuous = true; r.interimResults = true;
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) this.o.onFinal(res[0].transcript.trim()); else interim += res[0].transcript;
        }
        this.o.onInterim(interim.trim());
      };
      r.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        if (e.error === "not-allowed" || e.error === "service-not-allowed") this.o.onError("Microphone / speech recognition permission was denied.");
        else if (e.error === "network") this.o.onError("Browser speech recognition needs an internet connection (it uses the browser vendor's service).");
        else this.o.onError(`Speech recognition error: ${e.error}`);
        if (e.error !== "network") this.active = false;
      };
      r.onend = () => { if (this.active) setTimeout(() => { if (this.active) { try { this.rec = make(); this.rec.start(); } catch { /* already running */ } } }, 250); };
      return r;
    };
    this.rec = make();
    this.rec.start();
  }

  stop() {
    this.active = false;
    try { this.rec?.abort(); } catch { /* ignore */ }
    this.rec = null;
  }
}
