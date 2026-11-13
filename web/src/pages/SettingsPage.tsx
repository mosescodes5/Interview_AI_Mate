import { useEffect, useState } from "react";
import { api, BASE } from "../services/api";
import { useAction, useLoad } from "../hooks/useAsync";
import type { Health, ModelsInfo, Settings } from "../types";
import { Card, ErrorBox, Field, Notice, Spinner } from "../components/ui";

export function SettingsPage() {
  const s = useLoad(() => api.get<Settings>("/api/settings"));
  const m = useLoad(() => api.get<ModelsInfo>("/api/models"));
  const h = useLoad(() => api.get<Health>("/health"));
  const [f, setF] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");
  const [key, setKey] = useState("");
  const save = useAction();
  const test = useAction();
  const [testRes, setTestRes] = useState("");
  useEffect(() => { if (s.data) setF(s.data); }, [s.data]);

  if (s.loading) return <Spinner label="Loading settings…" />;
  if (s.error || !f) return <ErrorBox message={s.error ?? "Settings unavailable"} onRetry={s.reload} />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF({ ...f, [k]: v });
  const installed = m.data?.models.map((x) => x.name) ?? [];

  return (
    <div className="stack">
      <Card title="AI provider">
        <Field label="Provider">
          <select value={f.provider} onChange={(e) => set("provider", e.target.value as Settings["provider"])}>
            <option value="ollama">Local Ollama (default, private)</option>
            <option value="groq">Groq (free tier, cloud)</option>
            <option value="gemini">Google Gemini (free tier, cloud)</option>
            <option value="openrouter">OpenRouter free models (cloud)</option>
            <option value="custom">Custom OpenAI-compatible (cloud)</option>
          </select>
        </Field>
        {f.provider !== "ollama" && (
          <>
            <div className="alert error" role="note">Cloud providers receive your questions, answers and any CV or job text used in a session. Free tiers may log or use data per the provider's terms. Keep CVs and private details out if that matters to you.</div>
            <div className="grid2">
              <Field label={`API key ${f.api_key_set ? "(saved; type to replace)" : ""}`}>
                <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={f.api_key_set ? "••••••••" : "Paste your free API key"} />
              </Field>
              <Field label="Model (blank = default; free-tier model names change over time)">
                <input value={f.cloud_model} onChange={(e) => set("cloud_model", e.target.value)} placeholder="e.g. llama-3.3-70b-versatile" />
              </Field>
              {f.provider === "custom" && <Field label="Base URL (https://…/v1)"><input value={f.custom_base_url} onChange={(e) => set("custom_base_url", e.target.value)} /></Field>}
            </div>
            <p className="muted">Get a free key: Groq console.groq.com/keys · Gemini aistudio.google.com/apikey · OpenRouter openrouter.ai/keys. Limits are small and can change; check the provider's page.</p>
            <label className="check"><input type="checkbox" checked={f.cloud_consent} onChange={(e) => set("cloud_consent", e.target.checked)} />
              I understand my practice text will be sent to this provider over the internet</label>
          </>
        )}
      </Card>
      <Card title="Local AI model (Ollama)">
        <p>Ollama: {m.data?.provider === "ollama" && m.data.reachable ? `running (v${m.data.version})` : "not reachable"} · Selected model {m.data?.selected_installed ? "is installed" : "is NOT installed"}.</p>
        <Field label="Model (installed models listed; type another name if needed)">
          <input list="models" value={f.model} onChange={(e) => set("model", e.target.value)} />
          <datalist id="models">{installed.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        {!m.data?.selected_installed && <p>Install it yourself in PowerShell: <code>ollama pull {f.model}</code> (the app never downloads models automatically).</p>}
        <div className="row">
          <button className="btn" disabled={test.busy} onClick={async () => {
            await api.put("/api/settings", { ...(key ? { api_key: key } : {}), provider: f.provider, cloud_model: f.cloud_model, custom_base_url: f.custom_base_url, cloud_consent: f.cloud_consent, model: f.model });
            setKey("");
            const r = await test.run(() => api.post<{ latency_ms: number; reply: string }>("/api/models/test"));
            setTestRes(r ? `Model replied "${r.reply}" in ${r.latency_ms} ms.` : "");
            m.reload();
          }}>Test connection</button>
          {test.busy && <Spinner label="Loading the model (first run can be slow)…" />}
        </div>
        {test.error && <ErrorBox message={test.error} />}
        {testRes && <Notice>{testRes}</Notice>}
      </Card>
      <Card title="Practice and privacy defaults">
        <div className="grid3">
          <Field label="AI response length"><select value={f.response_length} onChange={(e) => set("response_length", e.target.value as Settings["response_length"])}>
            <option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></Field>
          <Field label="Answer timer (seconds, 0 = off)"><input type="number" min={0} max={1800} value={f.answer_timer_seconds} onChange={(e) => set("answer_timer_seconds", Number(e.target.value))} /></Field>
          <Field label="Default questions"><select value={f.default_questions} onChange={(e) => set("default_questions", Number(e.target.value))}>{[5, 10, 15, 30].map((n) => <option key={n}>{n}</option>)}</select></Field>
          <Field label="Whisper model (CPU, INT8)"><select value={f.whisper_model} onChange={(e) => set("whisper_model", e.target.value as Settings["whisper_model"])}>
            <option value="tiny">tiny (fastest)</option><option value="base">base (default)</option><option value="small">small (slower)</option></select></Field>
          <Field label="Screenshot retention"><select value={f.screenshot_retention} onChange={(e) => set("screenshot_retention", e.target.value)}>
            <option value="delete_immediately">Delete immediately (default)</option><option value="session">Until app closes</option></select></Field>
          <Field label="History retention (days, 0 = keep until I delete)"><input type="number" min={0} value={f.history_retention_days} onChange={(e) => set("history_retention_days", Number(e.target.value))} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.vision_enabled} onChange={(e) => set("vision_enabled", e.target.checked)} />
          Enable optional vision model (<code>{f.vision_model}</code>, about 3 GB+ of disk and more RAM; not used yet, OCR is the default)</label>
        <button className="btn primary" disabled={save.busy} onClick={async () => { const { api_key_set: _unused, ...body } = f; void _unused;
          const r = await save.run(() => api.put<Settings>("/api/settings", { ...body, ...(key ? { api_key: key } : {}) })); if (r) { s.setData(r); setKey(""); setMsg("Settings saved."); m.reload(); } }}>Save settings</button>
        {save.error && <ErrorBox message={save.error} />}{msg && <Notice>{msg}</Notice>}
      </Card>
      <Card title="Your data">
        <p>Everything is stored locally in the <code>local-data</code> folder (SQLite). No telemetry. Local processing is the default, but installed libraries and Windows services may behave independently.</p>
        <div className="row">
          <a className="btn small" href={`${BASE}/api/analytics/export?format=json`} target="_blank" rel="noreferrer">Export all (JSON)</a>
          <button className="btn small danger" onClick={async () => { if (confirm("Delete ALL sessions, CVs, jobs and coding reviews? This cannot be undone.")) { await api.del("/api/data?confirm=true"); setMsg("All data deleted."); } }}>Delete all data</button>
        </div>
      </Card>
      <Card title="Diagnostics"><p>Backend: {h.data ? "online" : h.error ? "offline" : "checking…"} · Ollama: {h.data?.ollama.reachable ? "reachable" : "unreachable"}</p></Card>
    </div>
  );
}
