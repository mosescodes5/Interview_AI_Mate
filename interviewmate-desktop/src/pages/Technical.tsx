import { useState } from "react";
import { ImageUp } from "lucide-react";
import { api } from "../services/api";
import { useAction } from "../hooks/useAsync";
import { Card, ErrorBox, Field, Notice, Spinner } from "../components/ui";
import { Interview } from "../components/Interview";

function ScreenTool() {
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [mode, setMode] = useState<"explain" | "practice">("explain");
  const ocr = useAction();
  const ai = useAction();

  async function choose(f: File | undefined) {
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setResult("");
    const r = await ocr.run(() => api.upload<{ text: string }>("/api/screen/analyze", f, f.name));
    if (r) setText(r.text);
  }
  return (
    <Card title="Screenshot study tool (OCR)">
      <p className="muted">Choose an image of practice material you want to study. It is read locally by Tesseract, kept in memory only, and never captured in the background.</p>
      <Field label="Choose image"><input type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(e) => choose(e.target.files?.[0])} /></Field>
      {preview && <img className="preview" src={preview} alt="Selected screenshot preview" />}
      {ocr.busy && <Spinner label="Running OCR…" />}
      {ocr.error && <ErrorBox message={ocr.error} />}
      {(text || preview) && (
        <>
          <Field label="Extracted text (edit any OCR mistakes)"><textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <div className="row">
            <select aria-label="Action" value={mode} onChange={(e) => setMode(e.target.value as "explain" | "practice")}>
              <option value="explain">Explain this</option><option value="practice">Turn into a practice question</option></select>
            <button className="btn primary" disabled={ai.busy || !text.trim()} onClick={async () => {
              const r = await ai.run(() => api.post<{ result: string }>("/api/screen/explain", { text, purpose: mode }));
              if (r) setResult(r.result);
            }}><ImageUp size={16} aria-hidden /> Analyse</button>
          </div>
          {ai.busy && <Spinner label="The local model is thinking…" />}
          {ai.error && <ErrorBox message={ai.error} />}
          {result && <Notice><span className="pre">{result}</span></Notice>}
        </>
      )}
    </Card>
  );
}

export function Technical() {
  return (
    <div className="stack">
      <Interview defaultType="technical" title="Technical" intro="Technical interview practice. Pick a stack-specific type such as React, PHP, SQL or system design." />
      <ScreenTool />
    </div>
  );
}
