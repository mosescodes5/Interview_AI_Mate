import json
import uuid
from collections import Counter

from fastapi import HTTPException

from ..database import db, jloads, now
from ..schemas.models import AnswerIn, Evaluation, GeneratedQuestion, InterviewStart
from . import ai, prompts

MICRO1_OPENER = GeneratedQuestion(
    question="Thanks for joining this practice session. To start, please tell me about yourself and your professional "
             "background as a software developer.",
    category="Introduction",
    hint="Cover your current focus, key technologies, and one concrete project or result.",
)

OPENERS = {
    "micro1": MICRO1_OPENER,
    "turing": GeneratedQuestion(
        question="Welcome to this practice session. To begin, please walk me through your background as a developer and "
                 "the kinds of projects you have worked on most recently.",
        category="Introduction", hint="Mention your main stack and one project where you owned a concrete outcome."),
    "mercor": GeneratedQuestion(
        question="Thanks for joining this practice screening. Please introduce yourself and describe the work experience "
                 "that is most relevant to the role you are applying for.",
        category="Introduction", hint="Pick one or two relevant roles or projects and say what you personally did."),
}
NAMES = {"micro1": "Micro1", "turing": "Turing", "mercor": "Mercor"}

SCORING_NOTE = (
    "Each answer is scored by a local AI model on four criteria (technical accuracy, relevance, clarity, structure), "
    "each 0-10. An answer's score is the average of the four, scaled to 0-100. The overall score is the average of all "
    "answered questions. These are practice indicators from a small local model, not an objective measure and not a "
    "prediction of hiring outcomes. Delivery confidence is not measured."
)


def _row(table: str, id_, col: str = "id"):
    with db() as c:
        return c.execute(f"SELECT * FROM {table} WHERE {col}=?", (id_,)).fetchone()


def _profile(pid):
    if not pid:
        return None
    r = _row("profiles", pid)
    if not r:
        raise HTTPException(404, "Profile not found.")
    return {"summary": r["summary"], "raw_text": r["raw_text"], "skills": jloads(r["skills"], []),
            "projects": jloads(r["projects"], []), "experience": jloads(r["experience"], [])}


def _job(jid):
    if not jid:
        return None
    r = _row("jobs", jid)
    if not r:
        raise HTTPException(404, "Job description not found.")
    return {"title": r["title"], "company": r["company"], "description": r["description"]}


def _turn_dict(t) -> dict:
    return {"id": t["id"], "idx": t["idx"], "question": t["question"], "category": t["category"], "hint": t["hint"],
            "is_follow_up": bool(t["is_follow_up"]), "answer": t["answer"],
            "feedback": jloads(t["feedback"], None), "score": t["score"]}


def _session(sid: str):
    s = _row("sessions", sid)
    if not s:
        raise HTTPException(404, "Interview session not found.")
    return s


def _turns(sid: str) -> list:
    with db() as c:
        return c.execute("SELECT * FROM turns WHERE session_id=? ORDER BY idx", (sid,)).fetchall()


def _history(turns) -> list[dict]:
    return [{"question": t["question"], "answer": t["answer"]} for t in turns]


def _gen_question(cfg: dict, history: list[dict]) -> GeneratedQuestion:
    profile = _profile(cfg.get("profile_id"))
    job = _job(cfg.get("job_id"))
    return ai.ask_json(prompts.QUESTION_SYSTEM, prompts.question_prompt(cfg, profile, job, history), GeneratedQuestion, 300)


def start(req: InterviewStart) -> dict:
    cfg = req.model_dump()
    first = OPENERS[req.preset] if req.preset else _gen_question(cfg, [])
    sid = uuid.uuid4().hex
    with db() as c:
        c.execute("INSERT INTO sessions(id,preset,interview_type,role,config,num_questions,status,started_at) VALUES(?,?,?,?,?,?,?,?)",
                  (sid, req.preset, req.interview_type, req.role, json.dumps(cfg), req.num_questions, "active", now()))
        c.execute("INSERT INTO turns(session_id,idx,question,category,hint) VALUES(?,?,?,?,?)",
                  (sid, 0, first.question, first.category, first.hint))
    return get(sid)


def submit_answer(sid: str, body: AnswerIn) -> dict:
    s = _session(sid)
    if s["status"] != "active":
        raise HTTPException(409, "This interview is already finished.")
    turns = _turns(sid)
    current = turns[-1] if turns else None
    if not current or current["answer"] is not None:
        raise HTTPException(409, "No unanswered question. Request the next question first.")
    cfg = json.loads(s["config"])
    ev = evaluate(current["question"], body.answer, body.style, _profile(cfg.get("profile_id")))
    with db() as c:
        c.execute("UPDATE turns SET answer=?, feedback=?, score=?, answered_at=? WHERE id=?",
                  (body.answer, ev.model_dump_json(), ev.overall, now(), current["id"]))
    return {"turn_idx": current["idx"], "evaluation": ev.model_dump(), "score": ev.overall,
            "has_follow_up": bool(ev.follow_up.strip())}


def evaluate(question: str, answer: str, style: str, profile: dict | None = None) -> Evaluation:
    return ai.ask_json(prompts.EVAL_SYSTEM, prompts.eval_prompt(question, answer, style, profile), Evaluation)


def next_question(sid: str) -> dict:
    s = _session(sid)
    if s["status"] != "active":
        raise HTTPException(409, "This interview is already finished.")
    turns = _turns(sid)
    last = turns[-1]
    if last["answer"] is None:
        raise HTTPException(409, "Answer the current question first.")
    if len(turns) >= s["num_questions"]:
        return {"done": True, "turn": None}
    cfg = json.loads(s["config"])
    fb = jloads(last["feedback"], {})
    follow = (fb.get("follow_up") or "").strip()
    if follow and not last["is_follow_up"]:
        q = GeneratedQuestion(question=follow, category=last["category"], hint="")
        is_fu = 1
    else:
        q = _gen_question(cfg, _history(turns))
        is_fu = 0
    with db() as c:
        c.execute("INSERT INTO turns(session_id,idx,question,category,hint,is_follow_up) VALUES(?,?,?,?,?,?)",
                  (sid, len(turns), q.question, q.category, q.hint, is_fu))
        t = c.execute("SELECT * FROM turns WHERE session_id=? AND idx=?", (sid, len(turns))).fetchone()
    return {"done": False, "turn": _turn_dict(t)}


def build_report(turns: list[dict]) -> dict:
    answered = [t for t in turns if t["answer"] is not None and t["feedback"]]
    base = {"scoring_explanation": SCORING_NOTE, "questions_total": len(turns), "questions_answered": len(answered)}
    if not answered:
        return {**base, "overall_score": None, "criteria": None, "strongest": [], "weakest": [], "missed_concepts": [],
                "improved_answers": [], "topics_to_revise": [], "next_session": "Answer at least one question to get a report."}
    crit = {k: round(sum(t["feedback"][k] for t in answered) / len(answered), 1)
            for k in ("technical_accuracy", "relevance", "clarity", "structure")}
    overall = round(sum(t["score"] for t in answered) / len(answered), 1)
    ranked = sorted(answered, key=lambda t: t["score"], reverse=True)
    brief = lambda t: {"question": t["question"], "score": t["score"], "category": t["category"]}
    weakest = sorted(answered, key=lambda t: t["score"])[:3]
    missed = Counter(m.strip() for t in answered for m in t["feedback"].get("missed_concepts", []) if m.strip())
    cat_scores: dict[str, list[float]] = {}
    for t in answered:
        cat_scores.setdefault(t["category"], []).append(t["score"])
    weak_topics = [c for c, v in sorted(cat_scores.items(), key=lambda kv: sum(kv[1]) / len(kv[1])) if sum(v) / len(v) < 70]
    lowest = min(crit, key=crit.get)
    nxt = f"Repeat this interview type focusing on {', '.join(weak_topics[:3]) or 'harder questions'}; " \
          f"work especially on {lowest.replace('_', ' ')} (average {crit[lowest]}/10)."
    return {**base, "overall_score": overall, "criteria": crit,
            "strongest": [brief(t) for t in ranked[:3]], "weakest": [brief(t) for t in weakest],
            "missed_concepts": [m for m, _ in missed.most_common(8)],
            "improved_answers": [{"question": t["question"], "your_answer": t["answer"],
                                  "suggested": t["feedback"].get("improved_answer", "")} for t in weakest],
            "topics_to_revise": weak_topics, "next_session": nxt}


def finish(sid: str) -> dict:
    s = _session(sid)
    if s["status"] == "completed":
        return jloads(s["report"], {})
    turns = [_turn_dict(t) for t in _turns(sid)]
    report = build_report(turns)
    with db() as c:
        c.execute("UPDATE sessions SET status='completed', finished_at=?, report=? WHERE id=?",
                  (now(), json.dumps(report), sid))
    return report


def get(sid: str) -> dict:
    s = _session(sid)
    return {"id": s["id"], "preset": s["preset"], "interview_type": s["interview_type"], "role": s["role"],
            "config": jloads(s["config"], {}), "num_questions": s["num_questions"], "status": s["status"],
            "started_at": s["started_at"], "finished_at": s["finished_at"], "report": jloads(s["report"], None),
            "turns": [_turn_dict(t) for t in _turns(sid)],
            "disclaimer": (f"Practice simulation. Not affiliated with {NAMES[s['preset']]} or any employer; "
                           "it does not access any real assessment.") if s["preset"] in NAMES else "Practice simulation."}


def history() -> list[dict]:
    with db() as c:
        rows = c.execute("SELECT * FROM sessions ORDER BY started_at DESC").fetchall()
    out = []
    for r in rows:
        rep = jloads(r["report"], None)
        out.append({"id": r["id"], "preset": r["preset"], "interview_type": r["interview_type"], "role": r["role"],
                    "status": r["status"], "started_at": r["started_at"], "finished_at": r["finished_at"],
                    "overall_score": rep.get("overall_score") if rep else None})
    return out


def delete(sid: str) -> None:
    _session(sid)
    with db() as c:
        c.execute("DELETE FROM sessions WHERE id=?", (sid,))
