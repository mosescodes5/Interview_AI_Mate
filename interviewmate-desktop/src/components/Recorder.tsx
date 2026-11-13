import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { api, errText } from "../services/api";
import { Spinner } from "./ui";

const MAX_SECONDS = 120;

/** Records only between an explicit Start and Stop click; shows a visible indicator; never records in the background. */
export function Recorder({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);

  const cleanup = () => {
    if (timer.current) window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => cleanup, []);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording is not supported here. Type your answer instead.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was denied or no microphone was found. Check Windows Settings > Privacy > Microphone, or type your answer.");
      return;
    }
    chunks.current = [];
    const r = new MediaRecorder(stream.current);
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = async () => {
      cleanup();
      setState("transcribing");
      try {
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        const out = await api.upload<{ text: string }>("/api/transcription/transcribe", blob, "answer.webm");
        onTranscript(out.text);
        setState("idle");
      } catch (e) {
        setError(errText(e) + " You can type your answer instead.");
        setState("idle");
      }
    };
    rec.current = r;
    r.start();
    setSecs(0);
    setState("recording");
    timer.current = window.setInterval(() => {
      setSecs((s) => {
        if (s + 1 >= MAX_SECONDS) rec.current?.stop();
        return s + 1;
      });
    }, 1000);
  }

  return (
    <div className="recorder">
      {state === "idle" && <button className="btn" onClick={start}><Mic size={16} aria-hidden /> Start recording</button>}
      {state === "recording" && (
        <>
          <span className="rec-dot" role="status" aria-label="Recording in progress">● Recording {secs}s</span>
          <button className="btn danger" onClick={() => rec.current?.stop()}><Square size={16} aria-hidden /> Stop recording</button>
        </>
      )}
      {state === "transcribing" && <Spinner label="Transcribing locally (this can take a while on CPU)…" />}
      {error && <div className="alert error" role="alert">{error}</div>}
    </div>
  );
}
