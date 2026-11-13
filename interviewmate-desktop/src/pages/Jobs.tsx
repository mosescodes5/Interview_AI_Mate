import { useState } from "react";
import { api } from "../services/api";
import { useAction, useLoad } from "../hooks/useAsync";
import type { Job, Profile } from "../types";
import { Card, Empty, ErrorBox, Field, fmtDate, Notice, Spinner } from "../components/ui";

const blank = { title: "", company: "", description: "", skills: "", url: "", notes: "", profile_id: "" };

export function Jobs() {
  const list = useLoad(() => api.get<Job[]>("/api/jobs"));
  const profiles = useLoad(() => api.get<Profile[]>("/api/profile"));
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<{ id: number; text: string } | null>(null);
  const save = useAction();
  const an = useAction();

  async function submit() {
    const body = {
      title: f.title, company: f.company, description: f.description, notes: f.notes, url: f.url || null,
      required_skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean), profile_id: f.profile_id ? Number(f.profile_id) : null,
    };
    const ok = await save.run(() => (editing ? api.put(`/api/jobs/${editing}`, body) : api.post("/api/jobs", body)));
    if (ok) { setF(blank); setEditing(null); list.reload(); }
  }
  return (
    <div className="stack">
      <p className="muted">Paste job descriptions (including ones from recruitment platforms) as practice source material. The AI cannot know an employer's real questions.</p>
      <Card title={editing ? "Edit job" : "Save a job description"}>
        <div className="grid2">
          <Field label="Job title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Company"><input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
          <Field label="Required skills (comma separated)"><input value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} /></Field>
          <Field label="URL (optional)"><input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
          <Field label="Associated CV"><select value={f.profile_id} onChange={(e) => setF({ ...f, profile_id: e.target.value })}>
            <option value="">None</option>{profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
        <Field label="Job description"><textarea rows={8} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Preparation notes"><textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <button className="btn primary" disabled={save.busy || !f.title.trim() || !f.description.trim()} onClick={submit}>Save job</button>
        {save.error && <ErrorBox message={save.error} />}
      </Card>
      <Card title="Saved jobs">
        {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} />
          : !list.data?.length ? <Empty title="No job descriptions yet" />
          : list.data.map((j) => (
            <div key={j.id} className="item">
              <div className="row between">
                <span><b>{j.title}</b> {j.company && `· ${j.company}`} · <span className="muted">{fmtDate(j.saved_at)}</span></span>
                <span className="row">
                  <button className="btn small" disabled={an.busy} onClick={async () => {
                    const r = await an.run(() => api.post<{ analysis: string }>(`/api/jobs/${j.id}/analyze`));
                    if (r) setAnalysis({ id: j.id, text: r.analysis });
                  }}>Prepare</button>
                  <button className="btn small" onClick={() => { setEditing(j.id); setF({ title: j.title, company: j.company, description: j.description, skills: j.required_skills.join(", "), url: j.url ?? "", notes: j.notes, profile_id: j.profile_id ? String(j.profile_id) : "" }); }}>Edit</button>
                  <button className="btn small danger" onClick={async () => { if (confirm("Delete this job?")) { await api.del(`/api/jobs/${j.id}`); list.reload(); } }}>Delete</button>
                </span>
              </div>
              {an.busy && <Spinner label="Analysing with the local model…" />}
              {analysis?.id === j.id && <Notice><span className="pre">{analysis.text}</span></Notice>}
            </div>))}
        {an.error && <ErrorBox message={an.error} />}
      </Card>
    </div>
  );
}
