import { useState } from "react";
import { api } from "../services/api";
import { useAction, useLoad } from "../hooks/useAsync";
import type { Profile } from "../types";
import { Card, Empty, ErrorBox, Field, Notice, Spinner } from "../components/ui";

const blank = { name: "My CV", summary: "", raw_text: "", skills: "", achievements: "" };

export function ProfilePage() {
  const list = useLoad(() => api.get<Profile[]>("/api/profile"));
  const [editing, setEditing] = useState<number | null>(null);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState("");
  const up = useAction();
  const save = useAction();
  const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

  async function upload(file?: File) {
    if (!file) return;
    const r = await up.run(() => api.upload<{ text: string; note: string }>("/api/documents/cv/parse", file, file.name));
    if (r) { setF((x) => ({ ...x, raw_text: r.text })); setMsg(r.note); }
  }
  async function submit() {
    const body = { name: f.name, summary: f.summary, raw_text: f.raw_text, skills: lines(f.skills), achievements: lines(f.achievements) };
    const ok = await save.run(() => (editing ? api.put(`/api/profile/${editing}`, body) : api.post("/api/profile", body)));
    if (ok) { setF(blank); setEditing(null); setMsg("Saved."); list.reload(); }
  }
  return (
    <div className="stack">
      <p className="muted">Information here comes from you. The AI never adds experience, employers or qualifications that you did not provide.</p>
      <Card title={editing ? "Edit CV version" : "New CV version"}>
        <Field label="Import PDF, DOCX or TXT (read locally; text is shown for review)"><input type="file" accept=".pdf,.docx,.txt" onChange={(e) => upload(e.target.files?.[0])} /></Field>
        {up.busy && <Spinner label="Extracting text…" />}
        {up.error && <ErrorBox message={up.error} />}
        <Field label="Version name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Professional summary"><textarea rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
        <Field label="Technical skills (comma or line separated)"><textarea rows={2} value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} /></Field>
        <Field label="Achievements (one per line)"><textarea rows={2} value={f.achievements} onChange={(e) => setF({ ...f, achievements: e.target.value })} /></Field>
        <Field label="Full CV text (experience, projects, education)"><textarea rows={10} value={f.raw_text} onChange={(e) => setF({ ...f, raw_text: e.target.value })} /></Field>
        <div className="row">
          <button className="btn primary" disabled={save.busy || !f.name.trim()} onClick={submit}>Save CV version</button>
          {editing && <button className="btn" onClick={() => { setEditing(null); setF(blank); }}>Cancel</button>}
        </div>
        {save.error && <ErrorBox message={save.error} />}
        {msg && <Notice>{msg}</Notice>}
      </Card>
      <Card title="Saved CV versions">
        {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} />
          : !list.data?.length ? <Empty title="No CV saved yet" hint="Practice works without one; add a CV for personalised questions." />
          : list.data.map((p) => (
            <div key={p.id} className="row between item">
              <span><b>{p.name}</b> · {p.skills.length} skills</span>
              <span className="row">
                <button className="btn small" onClick={() => { setEditing(p.id); setF({ name: p.name, summary: p.summary, raw_text: p.raw_text, skills: p.skills.join(", "), achievements: p.achievements.join("\n") }); }}>Edit</button>
                <button className="btn small danger" onClick={async () => { if (confirm(`Delete "${p.name}" and its extracted text?`)) { await api.del(`/api/profile/${p.id}`); list.reload(); } }}>Delete</button>
              </span>
            </div>))}
      </Card>
    </div>
  );
}
