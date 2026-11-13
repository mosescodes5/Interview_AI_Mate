import { ApiError, api, errText } from "../services/api";
import { createTicker } from "./ticker";

export type Focus = "full" | "top" | "bottom" | "left" | "right";
export type WatcherState = "watching" | "changed" | "reading" | "idle";

export interface WatcherOptions {
  track: MediaStreamTrack;
  intervalMs: number;
  focus: Focus;
  onText: (text: string) => void;
  onState?: (s: WatcherState) => void;
  onError: (message: string, fatal: boolean) => void;
}

const THUMB_W = 96, THUMB_H = 54, CHANGE = 3, MAX_W = 1600, FORCE_AFTER = 4;

type Source = { src: CanvasImageSource; w: number; h: number; close?: () => void };

function cropRect(w: number, h: number, f: Focus) {
  switch (f) {
    case "top": return { x: 0, y: 0, w, h: Math.round(h / 2) };
    case "bottom": return { x: 0, y: Math.round(h / 2), w, h: h - Math.round(h / 2) };
    case "left": return { x: 0, y: 0, w: Math.round(w / 2), h };
    case "right": return { x: Math.round(w / 2), y: 0, w: w - Math.round(w / 2), h };
    default: return { x: 0, y: 0, w, h };
  }
}

/**
 * Samples frames of a shared screen/window/tab at an interval and only runs OCR when the picture has changed AND
 * settled (so we don't OCR mid-transition). Frames are processed in memory and never stored.
 */
export class ScreenWatcher {
  private stopTick: (() => void) | null = null;
  private prev: Uint8ClampedArray | null = null;
  private dirty = false;
  private dirtyTicks = 0;
  private busy = false;
  private running = false;
  private video: HTMLVideoElement | null = null;
  private capture: { grabFrame: () => Promise<ImageBitmap> } | null = null;
  private thumbCanvas = document.createElement("canvas");
  private lastError = "";
  private opts: WatcherOptions;

  constructor(opts: WatcherOptions) { this.opts = opts; }

  async start() {
    this.running = true;
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture;
    if (IC) { try { this.capture = new IC(this.opts.track); } catch { this.capture = null; } }
    if (!this.capture) await this.ensureVideo();
    this.thumbCanvas.width = THUMB_W; this.thumbCanvas.height = THUMB_H;
    this.schedule();
    void this.tick();
  }

  private schedule() { this.stopTick?.(); this.stopTick = createTicker(this.opts.intervalMs, () => void this.tick()); }

  setInterval(ms: number) { this.opts.intervalMs = ms; if (this.running) this.schedule(); }
  setFocus(f: Focus) { this.opts.focus = f; this.dirty = true; }

  /** Read the screen right now regardless of change detection. */
  scanNow() { this.dirty = true; this.dirtyTicks = FORCE_AFTER; void this.tick(true); }

  stop() {
    this.running = false;
    this.stopTick?.(); this.stopTick = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; this.video = null; }
    this.capture = null;
    this.opts.onState?.("idle");
  }

  private async ensureVideo() {
    if (this.video) return;
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true;
    v.srcObject = new MediaStream([this.opts.track]);
    await v.play().catch(() => undefined);
    this.video = v;
  }

  private async grab(): Promise<Source | null> {
    if (this.capture) {
      try { const bmp = await this.capture.grabFrame(); return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() }; }
      catch { this.capture = null; }
    }
    await this.ensureVideo();
    const v = this.video!;
    if (v.readyState < 2 || !v.videoWidth) return null;
    return { src: v, w: v.videoWidth, h: v.videoHeight };
  }

  private thumb(f: Source): Uint8ClampedArray {
    const ctx = this.thumbCanvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(f.src, 0, 0, THUMB_W, THUMB_H);
    const px = ctx.getImageData(0, 0, THUMB_W, THUMB_H).data;
    const lum = new Uint8ClampedArray(THUMB_W * THUMB_H);
    for (let i = 0; i < lum.length; i++) lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0;
    return lum;
  }

  private async tick(force = false) {
    if (!this.running || this.busy) return;
    if (this.opts.track.readyState === "ended") return;
    this.busy = true;
    let frame: Source | null = null;
    try {
      frame = await this.grab();
      if (!frame) return;
      const cur = this.thumb(frame);
      let diff = 255;
      if (this.prev) { let s = 0; for (let i = 0; i < cur.length; i++) s += Math.abs(cur[i] - this.prev[i]); diff = s / cur.length; }
      this.prev = cur;
      if (diff > CHANGE) { this.dirty = true; this.dirtyTicks++; this.opts.onState?.("changed"); }
      const settled = diff <= CHANGE;
      if (this.dirty && (force || settled || this.dirtyTicks >= FORCE_AFTER)) {
        this.dirty = false; this.dirtyTicks = 0;
        this.opts.onState?.("reading");
        const blob = await this.toBlob(frame);
        const out = await api.upload<{ text: string }>("/api/screen/analyze", blob, "screen.jpg");
        this.lastError = "";
        this.opts.onText(out.text ?? "");
      }
      if (!this.dirty) this.opts.onState?.("watching");
    } catch (e) {
      // 503 = OCR engine not installed on the server: retrying every tick would just spam the same error.
      const fatal = e instanceof ApiError && e.status === 503;
      const msg = errText(e);
      if (msg !== this.lastError || fatal) { this.lastError = msg; this.opts.onError(msg, fatal); }
      if (fatal) this.stop();
      else this.opts.onState?.("watching");
    } finally {
      frame?.close?.();
      this.busy = false;
    }
  }

  private toBlob(f: Source): Promise<Blob> {
    const r = cropRect(f.w, f.h, this.opts.focus);
    const scale = Math.min(1, MAX_W / r.w);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(r.w * scale)); c.height = Math.max(1, Math.round(r.h * scale));
    c.getContext("2d")!.drawImage(f.src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the captured frame."))), "image/jpeg", 0.92));
  }
}
