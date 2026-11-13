import { useState } from "react";
import { api, BASE } from "../services/api";
import { useLoad } from "../hooks/useAsync";
import type { HistoryItem, Session } from "../types";
import { Card, Empty, ErrorBox, fmtDate, Spinner } from "../components/ui";
import { ReportView } from "../components/ReportView";

export function History() {
  const list = useLoad(() => api.get<HistoryItem[]>("/api/interviews/history"));
  const [open, setOpen] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (list.loading) return <Spinner label="Loading history…" />;
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;

  if (open) {
    return (
      <div className="stack">
        <button className="btn small" onClick={() => setOpen(null)}>← Back</button>
        <h3>{open.role} · {open.interview_type} · {fmtDate(open.started_at)}</h3>
        {open.report && <ReportView report={open.report} disclaimer={open.disclaimer} />}
        <Card title="Questions and answers">
          {open.turns.map((t) => (
            <div key={t.id} className="item"><b>{t.idx + 1}. {t.question}</b>
              <p className="pre">{t.answer ?? "(not answered)"}</p>{t.score !== null && <span className="pill">{t.score}/100</span>}</div>))}
        </Card>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="row">
        <a className="btn small" href={`${BASE}/api/analytics/export?format=json`} target="_blank" rel="noreferrer">Export JSON</a>
        <a className="btn small" href={`${BASE}/api/analytics/export?format=csv`} target="_blank" rel="noreferrer">Export CSV</a>
      </div>
      {err && <ErrorBox message={err} />}
      {!list.data?.length ? <Empty title="No sessions yet" hint="Completed and in-progress practice sessions will be listed here." /> : (
        <Card>
          {list.data.map((h) => (
            <div key={h.id} className="row between item">
              <span><b>{h.role}</b> · {h.interview_type}{h.preset ? " · Micro1 practice" : ""} · {fmtDate(h.started_at)} · {h.status} · {h.overall_score ?? "—"}</span>
              <span className="row">
                <button className="btn small" onClick={() => api.get<Session>(`/api/interviews/${h.id}`).then(setOpen).catch((e) => setErr(e.message))}>View</button>
                <button className="btn small danger" onClick={async () => { if (confirm("Delete this session?")) { await api.del(`/api/interviews/${h.id}`); list.reload(); } }}>Delete</button>
              </span>
            </div>))}
        </Card>
      )}
    </div>
  );
}
