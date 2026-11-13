import { useEffect, useState } from "react";
import { api } from "../services/api";
import { useAction } from "../hooks/useAsync";
import type { CodingProblem, CodingReview } from "../types";
import { Card, ErrorBox, Field, Notice, Spinner } from "../components/ui";

const TOPICS = ["javascript", "typescript", "react", "html_css", "php", "wordpress", "sql", "rest_api", "general"];

export function Coding() {
  const [topic, setTopic] = useState("javascript");
  const [difficulty, setDifficulty] = useState("medium");
  const [problem, setProblem] = useState<CodingProblem | null>(null);
  const [code, setCode] = useState("");
  const [review, setReview] = useState<CodingReview | null>(null);
  const [hints, setHints] = useState(0);
  const [timerOn, setTimerOn] = useState(false);
  const [secs, setSecs] = useState(0);
  const gen = useAction();
  const rev = useAction();

  useEffect(() => {
    if (!timerOn) return;
    const id = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerOn]);

  return (
    <div className="stack">
      <p className="muted">Practice mode only; it is not connected to any live assessment. Code is reviewed by the AI and is <b>never executed</b>.</p>
      <Card title="Problem">
        <div className="row">
          <Field label="Topic"><select value={topic} onChange={(e) => setTopic(e.target.value)}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Difficulty"><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>{["easy", "medium", "hard"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <button className="btn primary" disabled={gen.busy} onClick={async () => {
            const p = await gen.run(() => api.post<CodingProblem>("/api/coding/generate", { topic, difficulty }));
            if (p) { setProblem(p); setReview(null); setHints(0); setSecs(0); setCode(""); }
          }}>Generate problem</button>
        </div>
        {gen.busy && <Spinner label="Generating a problem…" />}
        {gen.error && <ErrorBox message={gen.error} />}
        {problem && (
          <div className="stack">
            <h3>{problem.title}</h3>
            <p className="pre">{problem.statement}</p>
            {problem.constraints.length > 0 && <><h4>Constraints</h4><ul>{problem.constraints.map((c) => <li key={c}>{c}</li>)}</ul></>}
            {problem.examples.map((e, i) => <pre key={i} className="code">{`Input:  ${e.input}\nOutput: ${e.output}`}</pre>)}
            <div className="row">
              <button className="btn small" disabled={hints >= problem.hints.length} onClick={() => setHints((h) => h + 1)}>Show hint ({hints}/{problem.hints.length})</button>
              <button className="btn small" onClick={() => setTimerOn((t) => !t)}>{timerOn ? "Pause timer" : "Start timer"}</button>
              <span className="pill" role="timer">⏱ {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
            </div>
            {problem.hints.slice(0, hints).map((h) => <Notice key={h}>{h}</Notice>)}
          </div>
        )}
      </Card>
      {problem && (
        <Card title="Your solution">
          <Field label="Code"><textarea className="mono" rows={14} spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <button className="btn primary" disabled={rev.busy || !code.trim()} onClick={async () => {
            const r = await rev.run(() => api.post<CodingReview>("/api/coding/review", { topic, problem: problem.statement, code }));
            if (r) setReview(r);
          }}>Review my code</button>
          {rev.busy && <Spinner label="Reviewing (not executing) your code…" />}
          {rev.error && <ErrorBox message={rev.error} />}
          {review && (
            <div className="stack">
              <h4>Review · {review.score}/10</h4>
              <p>{review.correctness_notes}</p>
              <p><b>Time:</b> {review.time_complexity || "n/a"} · <b>Space:</b> {review.space_complexity || "n/a"}</p>
              {review.issues.length > 0 && <><h4>Issues</h4><ul>{review.issues.map((x) => <li key={x}>{x}</li>)}</ul></>}
              {review.improvements.length > 0 && <><h4>Improvements</h4><ul>{review.improvements.map((x) => <li key={x}>{x}</li>)}</ul></>}
              {review.follow_up_questions.length > 0 && <><h4>Follow-up questions</h4><ul>{review.follow_up_questions.map((x) => <li key={x}>{x}</li>)}</ul></>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
