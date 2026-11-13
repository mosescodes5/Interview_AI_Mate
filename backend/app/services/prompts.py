from .ai import untrusted

STYLE = {
    "short": "Keep feedback short and direct.",
    "technical": "Give detailed technical feedback.",
    "beginner": "Explain concepts in a beginner-friendly way.",
    "star": "Coach the answer into STAR format (Situation, Task, Action, Result) using only facts the candidate gave.",
}

QUESTION_SYSTEM = (
    "You are a professional interviewer running a practice interview (a simulation, not a real hiring process). "
    "Ask exactly ONE question. Make it specific to the role, level and difficulty. Do not repeat earlier questions. "
    'Return JSON: {"question": str, "category": short topic label, "hint": one-sentence hint without giving the full answer}.'
)

EVAL_SYSTEM = (
    "You are an interview coach. Evaluate the candidate's answer to the question. Score each of "
    "technical_accuracy, relevance, clarity, structure from 0 to 10 (be honest; vague answers score low). "
    "Check: did it address the question, is it technically correct, is it clear, does it include a concrete example, "
    "is it structured, too short/long. Never invent experience for the candidate. "
    'Return JSON: {"technical_accuracy": n, "relevance": n, "clarity": n, "structure": n, '
    '"strengths": [str], "improvements": [str], "missed_concepts": [str], '
    '"improved_answer": str (a stronger answer using only facts the candidate provided; if they lack knowledge, '
    'explain the concept and how to learn it), "follow_up": str (one probing follow-up question, or "" if none needed)}.'
)

CODING_SYSTEM = (
    'You create coding practice problems. Return JSON: {"title": str, "statement": str, "constraints": [str], '
    '"examples": [{"input": str, "output": str}], "hints": [str]}. Do not include the solution.'
)

REVIEW_SYSTEM = (
    "You review code written for a practice problem. You do NOT run the code; reason about it. "
    'Return JSON: {"correctness_notes": str, "time_complexity": str, "space_complexity": str, "issues": [str], '
    '"improvements": [str], "follow_up_questions": [str], "score": 0-10}.'
)


def question_prompt(cfg: dict, profile: dict | None, job: dict | None, history: list[dict]) -> str:
    parts = [
        f"Role: {cfg['role']} | Level: {cfg['level']} | Type: {cfg['interview_type']} | Difficulty: {cfg['difficulty']}",
    ]
    if cfg.get("company"):
        parts.append(f"Practising for: {cfg['company']}")
    if cfg.get("language"):
        parts.append(f"Programming language focus: {cfg['language']}")
    styles = {
        "micro1": "AI-led recruitment screening for software developers; conversational, one question at a time, ask for concrete examples; mix technical and behavioural.",
        "turing": "Remote developer vetting: practical engineering skills in the candidate's stack, problem-solving, and clear communication of trade-offs.",
        "mercor": "AI-led screening interview: probe real work experience, project ownership, and impact; ask for specific examples and follow up on vague claims.",
    }
    if cfg.get("preset") in styles:
        parts.append("Style (general practice format only, not the platform's real questions): " + styles[cfg["preset"]])
    if profile:
        cv = f"Summary: {profile['summary']}\nSkills: {', '.join(profile['skills'])}\nProjects: {profile['projects']}\n" \
             f"Experience: {profile['experience']}\nRaw: {profile['raw_text'][:2000]}"
        parts.append("Candidate CV (use for personalised questions; do not add facts):\n" + untrusted("cv", cv))
    if job:
        parts.append("Job description:\n" + untrusted("job", f"{job['title']} at {job['company']}\n{job['description']}", 3000))
    if history:
        lines = []
        for h in history[-6:]:
            lines.append(f"Q: {h['question']}\nA: {(h.get('answer') or '(unanswered)')[:600]}")
        parts.append("Previous questions and answers (do not repeat; adapt to them):\n" + untrusted("history", "\n".join(lines)))
    parts.append("Ask the next question.")
    return "\n\n".join(parts)


def eval_prompt(question: str, answer: str, style: str, profile: dict | None = None) -> str:
    p = f"{STYLE[style]}\n\nQuestion:\n{untrusted('question', question, 3000)}\n\nCandidate answer:\n{untrusted('answer', answer, 8000)}"
    if profile:
        p += "\n\nCandidate CV facts (only these may be referenced):\n" + untrusted("cv", f"{profile['summary']} Skills: {', '.join(profile['skills'])}", 2000)
    return p
