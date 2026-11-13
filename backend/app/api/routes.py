import csv
import io
import json
import time
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool

from ..database import db, jloads, now
from ..schemas.models import (AnswerIn, CodingGenerateIn, CodingProblem, CodingReview, CodingReviewIn, EvaluateIn,
                              ExplainIn, InterviewStart, JobIn, LiveAnswerIn, ProfileIn, SettingsIn)
from ..services import (ai, analytics_service, document_service, interview_service, llm, ollama_service, prompts,
                        screen_service, settings_service, transcription_service)

router = APIRouter()


# ---------- health / models ----------
@router.get("/health")
def health():
    return {"status": "ok", "ollama": ollama_service.health()}


@router.get("/api/models")
def models():
    s = settings_service.get_settings()
    if s["provider"] != "ollama":
        ready = bool(s["cloud_consent"] and s["api_key_set"])
        return {"provider": s["provider"], "reachable": ready, "version": None, "models": [],
                "selected": s["cloud_model"] or llm.default_model(s["provider"]), "selected_installed": ready,
                "install_hint": "Add your free API key and tick the consent box in Settings."}
    selected = s["model"]
    h = ollama_service.health()
    installed: list[dict] = []
    if h["reachable"]:
        try:
            installed = ollama_service.list_models()
        except ollama_service.AIError:
            pass
    names = [m["name"] for m in installed]
    return {"provider": "ollama", "reachable": h["reachable"], "version": h["version"], "models": installed, "selected": selected,
            "selected_installed": selected in names or f"{selected}:latest" in names,
            "install_hint": f"ollama pull {selected}"}


@router.post("/api/models/test")
def test_model():
    s = settings_service.get_settings()
    t = time.time()
    reply = llm.generate("You are a test.", "Reply with the single word: ready", 10)
    return {"ok": True, "provider": s["provider"],
            "model": s["model"] if s["provider"] == "ollama" else (s["cloud_model"] or llm.default_model(s["provider"])), "latency_ms": int((time.time() - t) * 1000), "reply": reply.strip()}


# ---------- profile ----------
def _profile_out(r) -> dict:
    d = dict(r)
    for k in ("skills", "experience", "projects", "education", "achievements"):
        d[k] = jloads(d[k], [])
    return d


def _pvals(p: ProfileIn):
    return (p.name, p.summary, p.raw_text, json.dumps(p.skills), json.dumps(p.experience), json.dumps(p.projects),
            json.dumps(p.education), json.dumps(p.achievements))


@router.get("/api/profile")
def list_profiles():
    with db() as c:
        return [_profile_out(r) for r in c.execute("SELECT * FROM profiles ORDER BY updated_at DESC")]


@router.post("/api/profile", status_code=201)
def create_profile(p: ProfileIn):
    with db() as c:
        cur = c.execute("INSERT INTO profiles(name,summary,raw_text,skills,experience,projects,education,achievements,"
                        "created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (*_pvals(p), now(), now()))
        return _profile_out(c.execute("SELECT * FROM profiles WHERE id=?", (cur.lastrowid,)).fetchone())


@router.put("/api/profile/{pid}")
def update_profile(pid: int, p: ProfileIn):
    with db() as c:
        if not c.execute("SELECT 1 FROM profiles WHERE id=?", (pid,)).fetchone():
            raise HTTPException(404, "Profile not found.")
        c.execute("UPDATE profiles SET name=?,summary=?,raw_text=?,skills=?,experience=?,projects=?,education=?,"
                  "achievements=?,updated_at=? WHERE id=?", (*_pvals(p), now(), pid))
        return _profile_out(c.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone())


@router.delete("/api/profile/{pid}", status_code=204)
def delete_profile(pid: int):
    with db() as c:
        if not c.execute("DELETE FROM profiles WHERE id=?", (pid,)).rowcount:
            raise HTTPException(404, "Profile not found.")
    return Response(status_code=204)


@router.post("/api/documents/cv/parse")
async def parse_cv(file: UploadFile = File(...)):
    data = await file.read(document_service.MAX_DOC_BYTES + 1)
    try:
        text = document_service.extract_text(file.filename or "", data)
    except document_service.DocumentError as e:
        raise HTTPException(422, str(e))
    return {"filename": file.filename, "text": text, "characters": len(text),
            "note": "Extracted locally and not saved. Review and edit before saving it to a profile."}


# ---------- jobs ----------
def _job_out(r) -> dict:
    d = dict(r)
    d["required_skills"] = jloads(d["required_skills"], [])
    return d


@router.get("/api/jobs")
def list_jobs():
    with db() as c:
        return [_job_out(r) for r in c.execute("SELECT * FROM jobs ORDER BY saved_at DESC")]


@router.post("/api/jobs", status_code=201)
def create_job(j: JobIn):
    with db() as c:
        if j.profile_id and not c.execute("SELECT 1 FROM profiles WHERE id=?", (j.profile_id,)).fetchone():
            raise HTTPException(404, "Profile not found.")
        cur = c.execute("INSERT INTO jobs(title,company,description,required_skills,url,notes,profile_id,saved_at) "
                        "VALUES(?,?,?,?,?,?,?,?)", (j.title, j.company, j.description, json.dumps(j.required_skills),
                                                    j.url, j.notes, j.profile_id, now()))
        return _job_out(c.execute("SELECT * FROM jobs WHERE id=?", (cur.lastrowid,)).fetchone())


@router.put("/api/jobs/{job_id}")
def update_job(job_id: int, j: JobIn):
    with db() as c:
        if not c.execute("SELECT 1 FROM jobs WHERE id=?", (job_id,)).fetchone():
            raise HTTPException(404, "Job not found.")
        c.execute("UPDATE jobs SET title=?,company=?,description=?,required_skills=?,url=?,notes=?,profile_id=? WHERE id=?",
                  (j.title, j.company, j.description, json.dumps(j.required_skills), j.url, j.notes, j.profile_id, job_id))
        return _job_out(c.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone())


@router.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: int):
    with db() as c:
        if not c.execute("DELETE FROM jobs WHERE id=?", (job_id,)).rowcount:
            raise HTTPException(404, "Job not found.")
    return Response(status_code=204)


@router.post("/api/jobs/{job_id}/analyze")
def analyze_job(job_id: int):
    with db() as c:
        r = c.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if not r:
            raise HTTPException(404, "Job not found.")
    text = ai.ask_text(
        "You help a candidate prepare for an interview from a job description. Produce: important skills to prepare, "
        "likely topic areas, sample practice questions, a short study plan, and projects worth preparing to explain. "
        "You do not know the employer's real questions; say these are practice suggestions.",
        ai.untrusted("job", f"{r['title']} at {r['company']}\n{r['description']}", 6000), 900)
    return {"analysis": text, "note": "AI-generated practice suggestions, not the employer's actual questions."}


# ---------- interviews ----------
@router.post("/api/interviews/start", status_code=201)
def start_interview(req: InterviewStart):
    return interview_service.start(req)


@router.post("/api/interviews/{sid}/answer")
def answer(sid: str, body: AnswerIn):
    return interview_service.submit_answer(sid, body)


@router.post("/api/interviews/{sid}/next-question")
def next_question(sid: str):
    return interview_service.next_question(sid)


@router.post("/api/interviews/{sid}/finish")
def finish(sid: str):
    return interview_service.finish(sid)


@router.get("/api/interviews/history")
def history():
    return interview_service.history()


@router.get("/api/interviews/{sid}")
def get_interview(sid: str):
    return interview_service.get(sid)


@router.delete("/api/interviews/{sid}", status_code=204)
def delete_interview(sid: str):
    interview_service.delete(sid)
    return Response(status_code=204)


@router.post("/api/answers/evaluate")
def evaluate_answer(body: EvaluateIn):
    ev = interview_service.evaluate(body.question, body.answer, body.style)
    return {**ev.model_dump(), "overall": ev.overall}


# ---------- coding ----------
@router.post("/api/coding/generate")
def coding_generate(body: CodingGenerateIn):
    return ai.ask_json(prompts.CODING_SYSTEM, f"Topic: {body.topic}. Difficulty: {body.difficulty}.", CodingProblem, 700).model_dump()


@router.post("/api/coding/review")
def coding_review(body: CodingReviewIn):
    prompt = f"Problem:\n{ai.untrusted('problem', body.problem, 5000)}\n\nSubmitted code:\n{ai.untrusted('code', body.code, 12000)}"
    review = ai.ask_json(prompts.REVIEW_SYSTEM, prompt, CodingReview, 800)
    with db() as c:
        c.execute("INSERT INTO coding_submissions(topic,problem,code,review,created_at) VALUES(?,?,?,?,?)",
                  (body.topic, body.problem, body.code, review.model_dump_json(), now()))
    return review.model_dump()


# ---------- audio / screen ----------
@router.post("/api/transcription/transcribe")
async def transcribe(file: UploadFile = File(...)):
    data = await file.read(transcription_service.MAX_AUDIO_BYTES + 1)
    size = settings_service.get_settings()["whisper_model"]
    try:
        text = await run_in_threadpool(transcription_service.transcribe, data, Path(file.filename or "a.wav").suffix.lower(), size)
    except transcription_service.TranscriptionError as e:
        raise HTTPException(e.status, e.message)
    return {"text": text, "model": size, "note": "Review and correct the transcript before submitting."}


@router.post("/api/screen/analyze")
async def screen_analyze(file: UploadFile = File(...)):
    data = await file.read(screen_service.MAX_IMAGE_BYTES + 1)
    try:
        text = await run_in_threadpool(screen_service.ocr_image, data)
    except screen_service.ScreenError as e:
        raise HTTPException(e.status, e.message)
    return {"text": text, "stored": False, "note": "Image processed in memory and not saved. Edit the text if OCR made mistakes."}


@router.post("/api/live/answer")
def live_answer(body: LiveAnswerIn):
    profile_text = ""
    if body.profile_id:
        with db() as c:
            profile = c.execute("SELECT name,summary,raw_text,skills,experience,projects,education,achievements FROM profiles WHERE id=?", (body.profile_id,)).fetchone()
        if not profile:
            raise HTTPException(404, "Selected CV/profile was not found.")
        profile_text = "\n".join(str(profile[k] or "") for k in profile.keys())
    prompt = (
        f"Role: {body.role}\nCandidate background (may be empty):\n{ai.untrusted('candidate_profile', profile_text, 6000)}\n\n"
        f"Question heard or read: {ai.untrusted('interview_question', body.question, 8000)}\n\n"
        "Give the candidate a concise, natural first-person sample answer they can adapt. "
        "Start with the answer, not an introduction. For technical questions, explain the key idea and give a small example when useful. "
        "For behavioural questions, use STAR only when relevant. Use simple spoken English. "
        "Do not claim experience, projects, employers, metrics, or skills absent from the supplied profile. "
        "If the question asks about personal experience and the profile has no relevant evidence, clearly mark the part the candidate must personalize rather than inventing it. "
        "If the captured text is not actually an interview question, say what was detected and ask for a clearer capture."
    )
    answer_text = ai.ask_text("You are an interview preparation copilot. Produce truthful suggested answers, not fabricated credentials.", prompt, 700)
    return {"question": body.question, "answer": answer_text, "source": "live-copilot"}


@router.post("/api/screen/explain")
def screen_explain(body: ExplainIn):
    goal = ("Explain this text (for example a coding exercise or error) clearly for a developer."
            if body.purpose == "explain" else "Turn this material into a practice question and outline a strong answer.")
    return {"result": ai.ask_text(goal, ai.untrusted("ocr_text", body.text, 8000))}


# ---------- analytics / settings / data ----------
@router.get("/api/analytics/summary")
def analytics():
    return analytics_service.summary()


@router.get("/api/analytics/export")
def export(format: str = Query("json", pattern="^(json|csv)$")):
    sessions = [interview_service.get(h["id"]) for h in interview_service.history()]
    if format == "json":
        return {"exported_at": now(), "sessions": sessions}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["session_id", "date", "type", "role", "question", "answer", "score"])
    for s in sessions:
        for t in s["turns"]:
            w.writerow([s["id"], s["started_at"], s["interview_type"], s["role"], t["question"], t["answer"] or "", t["score"] or ""])
    return Response(buf.getvalue(), media_type="text/csv")


@router.get("/api/settings")
def get_settings():
    return settings_service.get_settings()


@router.put("/api/settings")
def put_settings(body: SettingsIn):
    return settings_service.update_settings(body)


@router.delete("/api/data")
def delete_all(confirm: bool = Query(False)):
    if not confirm:
        raise HTTPException(400, "Pass ?confirm=true to delete all saved data.")
    with db() as c:
        for t in ("turns", "sessions", "coding_submissions", "jobs", "profiles"):
            c.execute(f"DELETE FROM {t}")
    return {"deleted": True}
