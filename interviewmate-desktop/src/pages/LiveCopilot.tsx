import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Monitor, Square, Volume2 } from "lucide-react";
import { api, errText } from "../services/api";
import { useLoad } from "../hooks/useAsync";
import type { Profile } from "../types";
import { Card, ErrorBox, Field, Spinner } from "../components/ui";

type AnswerResult = { question: string; answer: string };

export function LiveCopilot() {
  const profiles = useLoad(() => api.get<Profile[]>("/api/profile"));
  const [profileId, setProfileId] = useState("");
  const [role, setRole] = useState("Software Developer");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [micFallback, setMicFallback] = useState(false);
  const [captureLabel, setCaptureLabel] = useState("");
  const screenStream = useRef<MediaStream | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const audioRecorder = useRef<MediaRecorder | null>(null);
  const audioTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const stopping = useRef(false);

  useEffect(() => () => stopCapture(), []);

  async function generateAnswer(text: string) {
    const clean = text.trim();
    if (clean.length < 3) return;
    setQuestion(clean);
    setBusy(true);
    setError("");
    try {
      const data = await api.post<AnswerResult>("/api/live/answer", {
        question: clean, role, profile_id: profileId ? Number(profileId) : null,
      });
      setResult(data);
    } catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  }

  async function captureScreen() {
    if (!videoRef.current || !screenStream.current) return;
    setError("");
    setBusy(true);
    try {
      const video = videoRef.current;
      if (video.readyState < 2) await new Promise<void>((resolve) => { video.onloadeddata = () => resolve(); });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      if (!canvas.width || !canvas.height) throw new Error("The shared screen is not ready. Try again.");
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Could not capture the screen.")), "image/jpeg", 0.88));
      const ocr = await api.upload<{ text: string }>("/api/screen/analyze", blob, "screen.jpg");
      if (!ocr.text.trim()) throw new Error("No readable text found. Make the interview question larger and clearly visible, then try again.");
      setQuestion(ocr.text);
      const data = await api.post<AnswerResult>("/api/live/answer", { question: ocr.text, role, profile_id: profileId ? Number(profileId) : null });
      setResult(data);
    } catch (e) { setError(errText(e)); }
    finally { setBusy(false); }
  }

  async function processAudio(blob: Blob) {
    if (!blob.size || stopping.current) return;
    try {
      const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
      const transcript = await api.upload<{ text: string }>("/api/transcription/transcribe", blob, `interviewer.${ext}`);
      if (transcript.text.trim().length >= 5 && !stopping.current) await generateAnswer(transcript.text);
    } catch (e) { if (!stopping.current) setError(errText(e)); }
  }

  function startAudioSegments(audioStream: MediaStream) {
    const mime = ["audio/webm;codecs=opus", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(audioStream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const clip = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (clip.size && !stopping.current) queue.current = queue.current.then(() => processAudio(clip));
      if (!stopping.current && screenStream.current?.getVideoTracks().some((track) => track.readyState === "live")) {
        startAudioSegments(audioStream);
      }
    };
    recorder.start();
    audioRecorder.current = recorder;
    audioTimer.current = window.setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 8000);
  }

  async function startCapture() {
    setError("");
    stopping.current = false;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen sharing is not supported in this browser. Use the latest Chrome or Edge over HTTPS or localhost.");
      return;
    }
    try {
      // Browser security requires the user to choose what to share. Shared-tab audio is
      // available in Chromium browsers when the user enables the audio-sharing option.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: audioEnabled,
      });
      screenStream.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      setCaptureLabel(videoTrack?.label || "Shared screen or tab");
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      videoTrack?.addEventListener("ended", stopCapture, { once: true });

      let audioTracks = audioEnabled ? stream.getAudioTracks() : [];
      if (audioEnabled && audioTracks.length === 0 && micFallback) {
        micStream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        audioTracks = micStream.current.getAudioTracks();
        setError("This share did not provide tab/system audio. Listening through your microphone instead.");
      } else if (audioEnabled && audioTracks.length === 0) {
        setError("Screen sharing is active, but this browser/share did not provide audio. Stop and share a Chrome/Edge tab with 'Share tab audio' enabled, or enable microphone fallback before starting again.");
      }
      if (audioTracks.length) startAudioSegments(new MediaStream(audioTracks));
      setListening(true);
    } catch (e) {
      stopCapture();
      const message = errText(e);
      setError(message.toLowerCase().includes("permission") || message.toLowerCase().includes("denied")
        ? "Screen/audio permission was not granted. Allow sharing in the browser prompt and try again."
        : message);
    }
  }

  function stopCapture() {
    stopping.current = true;
    if (audioTimer.current !== null) window.clearTimeout(audioTimer.current);
    audioTimer.current = null;
    if (audioRecorder.current && audioRecorder.current.state !== "inactive") audioRecorder.current.stop();
    audioRecorder.current = null;
    screenStream.current?.getTracks().forEach((track) => track.stop());
    micStream.current?.getTracks().forEach((track) => track.stop());
    screenStream.current = null;
    micStream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setListening(false);
    setCaptureLabel("");
  }

  return <div className="stack">
    <p className="muted">Browser-based interview copilot. Share a tab, window or screen to read visible questions, or share audio to transcribe spoken questions. Review and adapt every suggested answer so it accurately reflects your own experience.</p>
    <Card title="Browser capture settings">
      <div className="grid3">
        <Field label="Your role"><input value={role} onChange={(e) => setRole(e.target.value)} /></Field>
        <Field label="Use your CV/profile">
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">No profile selected</option>{profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Audio input">
          <select value={audioEnabled ? "shared" : "off"} onChange={(e) => setAudioEnabled(e.target.value === "shared")} disabled={listening}>
            <option value="shared">Shared tab/system audio</option><option value="off">Screen only (no audio)</option>
          </select>
        </Field>
      </div>
      <label className="check"><input type="checkbox" checked={micFallback} onChange={(e) => setMicFallback(e.target.checked)} disabled={listening} /> Use microphone if shared audio is unavailable</label>
      <div className="row">
        {!listening ? <button className="btn primary" onClick={startCapture}><Monitor size={16} /> Share screen / tab</button> : <button className="btn danger" onClick={stopCapture}><Square size={16} /> Stop sharing</button>}
        <button className="btn" onClick={captureScreen} disabled={!listening || busy}><Camera size={16} /> Read screen now</button>
      </div>
      {listening && <p className="pill"><span className="rec-dot">●</span> Sharing active · {captureLabel || "Browser capture"}</p>}
      <video ref={videoRef} muted playsInline style={{ display: "none" }} />
      <div className="muted small"><strong>For best audio results:</strong> In Chrome or Edge, choose the interview tab in the share dialog and enable “Share tab audio”. Sharing an entire screen or another app may not include its audio. Microphone fallback records nearby sound, not computer playback.</div>
    </Card>
    <Card title="Question and suggested answer">
      <Field label="Detected question (you can edit this)"><textarea rows={5} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="A question detected from the shared screen or audio will appear here…" /></Field>
      <div className="row"><button className="btn primary" disabled={busy || question.trim().length < 3} onClick={() => generateAnswer(question)}><Volume2 size={16} /> Generate answer</button></div>
      {busy && <Spinner label="Preparing a suggested answer…" />}
      {result && <div className="stack"><h3>Suggested answer</h3><p className="pre">{result.answer}</p><button className="btn" onClick={() => navigator.clipboard?.writeText(result.answer)}>Copy answer</button></div>}
    </Card>
    {error && <ErrorBox message={error} onRetry={() => setError("")} />}
    <p className="muted">Screen frames are processed in memory and not saved. Audio clips are sent to the configured transcription service. The browser will show a sharing indicator; stop sharing whenever you want. Only capture interviews when you have permission to do so.</p>
  </div>;
}
