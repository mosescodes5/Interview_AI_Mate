import { api } from "../services/api";
import { useLoad } from "../hooks/useAsync";
import type { Analytics } from "../types";
import { Bar, Card, Empty, ErrorBox, Spinner } from "../components/ui";

function Trend({ points }: { points: number[] }) {
  if (points.length < 2) return <p className="muted">Complete at least two sessions to see a trend.</p>;
  const w = 400, h = 100, step = w / (points.length - 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - (p / 100) * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="trend" role="img" aria-label={`Scores over time: ${points.join(", ")}`}>
      <path d={d} fill="none" stroke="var(--purple)" strokeWidth="2.5" />
      {points.map((p, i) => <circle key={i} cx={i * step} cy={h - (p / 100) * h} r="3.5" fill="var(--purple)" />)}
    </svg>
  );
}

export function AnalyticsPage() {
  const { data, error, loading, reload } = useLoad(() => api.get<Analytics>("/api/analytics/summary"));
  if (loading) return <Spinner label="Loading analytics…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data?.has_data) return <Empty title="No analytics yet" hint="Finish a practice interview (use End interview or finish all questions) to see real progress here." />;
  return (
    <div className="stack">
      <div className="grid3">
        <Card title="Sessions"><p className="big">{data.sessions_completed}</p></Card>
        <Card title="Average score"><p className="big">{data.average_score ?? "—"}</p></Card>
        <Card title="Coding reviews"><p className="big">{data.coding_submissions}</p></Card>
      </div>
      <Card title="Score over time"><Trend points={data.score_history.map((s) => s.score)} /></Card>
      <div className="grid2">
        <Card title="Progress by topic (lowest first)">
          {data.by_topic.map((t) => <Bar key={t.topic} label={t.topic} value={t.average} max={100} />)}
        </Card>
        <Card title="Common missed concepts">
          {data.common_missed_concepts.length ? <ul>{data.common_missed_concepts.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="muted">None recorded.</p>}
          <h4>Recommended next topics</h4>
          <p>{data.weak_topics.length ? data.weak_topics.join(", ") : "No weak topics identified."}</p>
        </Card>
      </div>
    </div>
  );
}
