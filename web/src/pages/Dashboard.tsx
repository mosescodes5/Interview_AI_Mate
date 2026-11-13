import { api } from "../services/api";
import { useLoad } from "../hooks/useAsync";
import type { Analytics, HistoryItem, Job, ModelsInfo, Profile } from "../types";
import { Card, Empty, ErrorBox, fmtDate, Spinner } from "../components/ui";

export function Dashboard({ go }: { go: (p: string) => void }) {
  const models = useLoad(() => api.get<ModelsInfo>("/api/models"));
  const stats = useLoad(() => api.get<Analytics>("/api/analytics/summary"));
  const hist = useLoad(() => api.get<HistoryItem[]>("/api/interviews/history"));
  const profiles = useLoad(() => api.get<Profile[]>("/api/profile"));
  const jobs = useLoad(() => api.get<Job[]>("/api/jobs"));

  if (stats.loading && models.loading) return <Spinner label="Loading dashboard…" />;
  if (stats.error) return <ErrorBox message={stats.error} onRetry={() => { stats.reload(); models.reload(); hist.reload(); }} />;
  const m = models.data;
  const s = stats.data;
  return (
    <div className="stack">
      <h2>Welcome back</h2>
      <div className="grid3">
        <Card title="Local AI">
          {!m ? <Spinner /> : !m.reachable ? <p>Ollama is not running. Start Ollama, then reload.</p>
            : m.selected_installed ? <p>Connected · model <b>{m.selected}</b> is installed.</p>
            : <p>Connected, but <b>{m.selected}</b> is not installed. Run <code>{m.install_hint}</code> in PowerShell.</p>}
          <button className="btn small" onClick={models.reload}>Re-check</button>
        </Card>
        <Card title="Start practising">
          <div className="stack">
            <button className="btn primary" onClick={() => go("practice")}>Start practice interview</button>
            <button className="btn" onClick={() => go("micro1")}>Start Micro1 practice</button>
          </div>
        </Card>
        <Card title="Your materials">
          <p>{profiles.data?.length ?? 0} CV version(s) · {jobs.data?.length ?? 0} job description(s)</p>
          <div className="row"><button className="btn small" onClick={() => go("profile")}>CV</button><button className="btn small" onClick={() => go("jobs")}>Jobs</button></div>
        </Card>
      </div>
      {!s?.has_data ? <Empty title="No completed sessions yet" hint="Finish a practice interview and your readiness overview, weak skills and progress will appear here." /> : (
        <div className="grid3">
          <Card title="Readiness (practice average)"><p className="big">{s.average_score ?? "—"}<small>/100</small></p><p className="muted">Practice indicator, not a hiring prediction.</p></Card>
          <Card title="Practice time"><p className="big">{s.practice_minutes}<small> min</small></p><p>{s.sessions_completed} session(s)</p></Card>
          <Card title="Skills to improve">{s.weak_topics.length ? <ul>{s.weak_topics.map((t) => <li key={t}>{t}</li>)}</ul> : <p>No weak topics yet.</p>}</Card>
        </div>
      )}
      <div className="grid2">
        <Card title="Recent sessions">
          {!hist.data?.length ? <p className="muted">Nothing yet.</p> : hist.data.slice(0, 5).map((h) => (
            <p key={h.id}>{h.role} · {h.interview_type} · {fmtDate(h.started_at)} · {h.overall_score ?? (h.status === "active" ? "in progress" : "—")}</p>))}
        </Card>
        <Card title="Recent feedback">
          {!s?.recent_feedback.length ? <p className="muted">Feedback from your answers will show here.</p> : s.recent_feedback.map((f) => (
            <p key={f.question}><b>{f.score}</b> · {f.question}<br /><span className="muted">{f.improvements.join(" · ")}</span></p>))}
        </Card>
      </div>
    </div>
  );
}
