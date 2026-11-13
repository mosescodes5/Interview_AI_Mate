import type { Report } from "../types";
import { Bar, Card, Empty } from "./ui";

export function ReportView({ report, disclaimer }: { report: Report; disclaimer?: string }) {
  if (report.overall_score === null) return <Empty title="No answered questions" hint={report.next_session} />;
  return (
    <div className="stack">
      {disclaimer && <p className="muted">{disclaimer}</p>}
      <Card title={`Practice score: ${report.overall_score}/100`}>
        {report.criteria && Object.entries(report.criteria).map(([k, v]) => <Bar key={k} label={k.replace("_", " ")} value={v} />)}
        <p className="muted">{report.scoring_explanation}</p>
      </Card>
      <div className="grid2">
        <Card title="Strongest answers">{report.strongest.map((s) => <p key={s.question}>{s.question}<br /><b>{s.score}</b> · {s.category}</p>)}</Card>
        <Card title="Weakest answers">{report.weakest.map((s) => <p key={s.question}>{s.question}<br /><b>{s.score}</b> · {s.category}</p>)}</Card>
      </div>
      {report.missed_concepts.length > 0 && <Card title="Missed concepts"><ul>{report.missed_concepts.map((m) => <li key={m}>{m}</li>)}</ul></Card>}
      {report.improved_answers.length > 0 && (
        <Card title="Suggested improved answers">
          {report.improved_answers.map((a) => (<div key={a.question}><h4>{a.question}</h4><p className="pre">{a.suggested || "No suggestion returned."}</p></div>))}
        </Card>
      )}
      <Card title="Topics to revise and next session">
        <p>{report.topics_to_revise.length ? report.topics_to_revise.join(", ") : "No weak topics identified."}</p>
        <p>{report.next_session}</p>
      </Card>
    </div>
  );
}
