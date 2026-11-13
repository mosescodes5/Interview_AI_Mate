from collections import Counter
from datetime import datetime, timedelta, timezone

from ..database import db, jloads


def purge_old_history(days: int) -> int:
    if days <= 0:
        return 0
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with db() as c:
        return c.execute("DELETE FROM sessions WHERE started_at < ?", (cutoff,)).rowcount


def summary() -> dict:
    with db() as c:
        sessions = c.execute("SELECT * FROM sessions WHERE status='completed' ORDER BY started_at").fetchall()
        turns = c.execute("SELECT t.* FROM turns t JOIN sessions s ON s.id=t.session_id "
                          "WHERE s.status='completed' AND t.answer IS NOT NULL").fetchall()
        coding = c.execute("SELECT COUNT(*) n FROM coding_submissions").fetchone()["n"]
    if not sessions:
        return {"has_data": False, "sessions_completed": 0, "practice_minutes": 0, "average_score": None,
                "score_history": [], "by_topic": [], "weak_topics": [], "common_missed_concepts": [],
                "recent_feedback": [], "coding_submissions": coding}
    minutes = 0.0
    history = []
    for s in sessions:
        rep = jloads(s["report"], {}) or {}
        if s["finished_at"]:
            minutes += (datetime.fromisoformat(s["finished_at"]) - datetime.fromisoformat(s["started_at"])).total_seconds() / 60
        if rep.get("overall_score") is not None:
            history.append({"date": s["started_at"], "score": rep["overall_score"], "type": s["interview_type"]})
    topics: dict[str, list[float]] = {}
    missed: Counter = Counter()
    for t in turns:
        fb = jloads(t["feedback"], {})
        topics.setdefault(t["category"], []).append(t["score"])
        missed.update(m.strip() for m in fb.get("missed_concepts", []) if m.strip())
    by_topic = sorted(({"topic": k, "average": round(sum(v) / len(v), 1), "answers": len(v)} for k, v in topics.items()),
                      key=lambda x: x["average"])
    recent = []
    for t in sorted(turns, key=lambda t: t["answered_at"] or "", reverse=True)[:3]:
        fb = jloads(t["feedback"], {})
        recent.append({"question": t["question"], "score": t["score"], "improvements": fb.get("improvements", [])[:2]})
    avg = round(sum(h["score"] for h in history) / len(history), 1) if history else None
    return {"has_data": True, "sessions_completed": len(sessions), "practice_minutes": round(minutes),
            "average_score": avg, "score_history": history, "by_topic": by_topic,
            "weak_topics": [t["topic"] for t in by_topic if t["average"] < 70][:5],
            "common_missed_concepts": [m for m, _ in missed.most_common(5)], "recent_feedback": recent,
            "coding_submissions": coding}
