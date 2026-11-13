import { useEffect, useState } from "react";
import { Lightbulb, Play, Send, SkipForward, Square, Volume2 } from "lucide-react";
import { api } from "../services/api";
import { useAction, useLoad } from "../hooks/useAsync";
import type { Evaluation, Job, Profile, Report, Session, Settings, Turn } from "../types";
import { Bar, Card, ErrorBox, Field, Notice, Spinner } from "./ui";
import { Recorder } from "./Recorder";
import { ReportView } from "./ReportView";

const TYPES: [string, string][] = [
  ["mixed", "Mixed technical + behavioural"], ["hr", "HR"], ["behavioural", "Behavioural (STAR)"], ["technical", "Technical"],
  ["frontend", "Frontend"], ["backend", "Backend"], ["fullstack", "Full-stack"], ["wordpress", "WordPress"], ["react", "React"],
  ["javascript", "JavaScript"], ["php", "PHP"], ["sql", "SQL & databases"], ["api", "APIs"], ["debugging", "Debugging"],
  ["project", "Project explanation"], ["system_design", "System design"], ["custom", "Custom (from job description)"],
];

interface Props { preset?: "micro1" | "turing" | "mercor"; defaultType?: string; title: string; intro: string }

export function Interview({ preset, defaultType = "mixed", intro }: Props) {
  const settings = useLoad(() => api.get<Settings>("/api/settings"));
  const profiles = useLoad(() => api.get<Profile[]>("/api/profile"));
  const jobs = useLoad(() => api.get<Job[]>("/api/jobs"));
  const [cfg, setCfg] = useState({
    interview_type: defaultType, role: "Software Developer", level: "mid", company: preset ? ({ micro1: "Micro1", turing: "Turing", mercor: "Mercor" }[preset] + " (practice)") : "",
    difficulty: "medium", num_questions: 5, language: "", spoken: false, profile_id: "", job_id: "",
  });
  const [session, setSession] = useState<Session | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [answer, setAnswer] = useState("");
  const [style, setStyle] = useState("technical");
  const [feedback, setFeedback] = useState<Evaluation | null>(null);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const { busy, error, run, setError } = useAction();

  useEffect(() => {
    if (settings.data) setCfg((c) => ({ ...c, num_questions: settings.data!.default_questions }));
  }, [settings.data]);

  // answer timer (display only; does not auto-submit)
  useEffect(() => {
    const total = settings.data?.answer_timer_seconds ?? 0;
    if (!turn || feedback || !total) { setLeft(null); return; }
    setLeft(total);
    const id = window.setInterval(() => setLeft((l) => (l === null ? l : Math.max(0, l - 1))), 1000);
    return () => window.clearInterval(id);
  }, [turn, feedback, settings.data?.answer_timer_seconds]);

  const speak = (text: string) => {
    if ("speechSynthesis" in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }
  };
  useEffect(() => { if (cfg.spoken && turn && !feedback) speak(turn.question); /* eslint-disable-next-line */ }, [turn?.id]);

  const start = () => run(async () => {
    const s = await api.post<Session>("/api/interviews/start", {
      ...cfg, preset, profile_id: cfg.profile_id ? Number(cfg.profile_id) : null, job_id: cfg.job_id ? Number(cfg.job_id) : null,
    });
    setSession(s); setTurn(s.turns[s.turns.length - 1]); setAnswer(""); setFeedback(null); setReport(null); setShowHint(false);
  });

  const submit = () => run(async () => {
    const r = await api.post<{ evaluation: Evaluation; score: number }>(`/api/interviews/${session!.id}/answer`, { answer, style });
    setFeedback(r.evaluation); setScore(r.score);
  });

  const next = () => run(async () => {
    const r = await api.post<{ done: boolean; turn: Turn | null }>(`/api/interviews/${session!.id}/next-question`);
    if (r.done || !r.turn) { await finish(); return; }
    setTurn(r.turn); setAnswer(""); setFeedback(null); setShowHint(false);
  });

  const finish = async () => {
    window.speechSynthesis?.cancel();
    const rep = await api.post<Report>(`/api/interviews/${session!.id}/finish`);
    setReport(rep); setTurn(null);
  };

  const reset = () => { setSession(null); setTurn(null); setReport(null); setFeedback(null); setError(null); };

  if (report && session) {
    return (<><ReportView report={report} disclaimer={session.disclaimer} /><button className="btn primary" onClick={reset}>Start a new practice</button></>);
  }

  if (session && turn) {
    return (
      <div className="stack">
        <p className="muted">{session.disclaimer}</p>
        <Card>
          <div className="row between">
            <span className="pill">Question {turn.idx + 1} of {session.num_questions}{turn.is_follow_up ? " · follow-up" : ""} · {turn.category}</span>
            {left !== null && <span className={`pill ${left === 0 ? "warn" : ""}`} role="timer">⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>}
          </div>
          <h2 className="question">{turn.question}</h2>
          <div className="row">
            <button className="btn small" onClick={() => speak(turn.question)}><Volume2 size={14} aria-hidden /> Read aloud</button>
            {turn.hint && <button className="btn small" onClick={() => setShowHint(true)}><Lightbulb size={14} aria-hidden /> Hint</button>}
          </div>
          {showHint && <Notice>{turn.hint}</Notice>}
        </Card>

        {!feedback ? (
          <Card title="Your answer">
            {cfg.spoken && <Recorder onTranscript={(t) => setAnswer((a) => (a ? a + " " : "") + t)} />}
            <Field label={cfg.spoken ? "Answer (edit the transcript before submitting)" : "Answer"}>
              <textarea rows={8} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer…" />
            </Field>
            <div className="row">
              <Field label="Feedback style">
                <select value={style} onChange={(e) => setStyle(e.target.value)}>
                  <option value="short">Short and direct</option><option value="technical">Detailed technical</option>
                  <option value="beginner">Beginner-friendly</option><option value="star">STAR-method</option>
                </select>
              </Field>
              <button className="btn primary" disabled={busy || !answer.trim()} onClick={submit}><Send size={16} aria-hidden /> Submit answer</button>
              <button className="btn" disabled={busy} onClick={() => run(finish)}><Square size={16} aria-hidden /> End interview</button>
            </div>
            {busy && <Spinner label="The local model is evaluating your answer…" />}
          </Card>
        ) : (
          <Card title={`Feedback · ${score}/100`}>
            <Bar label="Technical accuracy" value={feedback.technical_accuracy} /><Bar label="Relevance" value={feedback.relevance} />
            <Bar label="Clarity" value={feedback.clarity} /><Bar label="Structure" value={feedback.structure} />
            <div className="grid2">
              <div><h4>Your answer</h4><p className="pre">{answer}</p></div>
              <div><h4>Suggested stronger answer</h4><p className="pre">{feedback.improved_answer || "No suggestion returned."}</p></div>
            </div>
            {feedback.strengths.length > 0 && <><h4>Strengths</h4><ul>{feedback.strengths.map((s) => <li key={s}>{s}</li>)}</ul></>}
            {feedback.improvements.length > 0 && <><h4>To improve</h4><ul>{feedback.improvements.map((s) => <li key={s}>{s}</li>)}</ul></>}
            {feedback.missed_concepts.length > 0 && <><h4>Missed concepts</h4><ul>{feedback.missed_concepts.map((s) => <li key={s}>{s}</li>)}</ul></>}
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={next}><SkipForward size={16} aria-hidden /> {turn.idx + 1 >= session.num_questions ? "Finish and see report" : "Next question"}</button>
              <button className="btn" disabled={busy} onClick={() => run(finish)}>End interview</button>
            </div>
            {busy && <Spinner label="Preparing the next step…" />}
          </Card>
        )}
        {error && <ErrorBox message={error} onRetry={feedback ? next : submit} />}
      </div>
    );
  }

  const set = (k: string, v: string | number | boolean) => setCfg((c) => ({ ...c, [k]: v }));
  return (
    <div className="stack">
      <p className="muted">{intro}</p>
      <Card title="Set up your practice">
        <div className="grid3">
          <Field label="Interview type"><select value={cfg.interview_type} onChange={(e) => set("interview_type", e.target.value)}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Job title"><input value={cfg.role} onChange={(e) => set("role", e.target.value)} /></Field>
          <Field label="Experience level"><select value={cfg.level} onChange={(e) => set("level", e.target.value)}>
            {["junior", "mid", "senior"].map((l) => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Company / platform (optional)"><input value={cfg.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label="Difficulty"><select value={cfg.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
            {["easy", "medium", "hard"].map((l) => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Number of questions"><select value={cfg.num_questions} onChange={(e) => set("num_questions", Number(e.target.value))}>
            {[5, 10, 15, 30].map((n) => <option key={n}>{n}</option>)}</select></Field>
          <Field label="Programming language (optional)"><input value={cfg.language} onChange={(e) => set("language", e.target.value)} placeholder="e.g. JavaScript" /></Field>
          <Field label="CV / profile (optional)"><select value={cfg.profile_id} onChange={(e) => set("profile_id", e.target.value)}>
            <option value="">None</option>{profiles.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Job description (optional)"><select value={cfg.job_id} onChange={(e) => set("job_id", e.target.value)}>
            <option value="">None</option>{jobs.data?.map((j) => <option key={j.id} value={j.id}>{j.title} {j.company && `· ${j.company}`}</option>)}</select></Field>
        </div>
        <label className="check"><input type="checkbox" checked={cfg.spoken} onChange={(e) => set("spoken", e.target.checked)} />
          Spoken mode: read questions aloud and answer by voice (recording only starts when you click Start)</label>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={start}><Play size={16} aria-hidden /> Start practice interview</button>
        </div>
        {busy && <Spinner label="Generating your first question with the local model…" />}
        {error && <ErrorBox message={error} onRetry={start} />}
      </Card>
    </div>
  );
}
