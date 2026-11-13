from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator

InterviewType = Literal[
    "hr", "behavioural", "technical", "frontend", "backend", "fullstack", "wordpress",
    "react", "javascript", "php", "sql", "api", "debugging", "project", "system_design",
    "mixed", "custom",
]
Difficulty = Literal["easy", "medium", "hard"]
CoachingStyle = Literal["short", "technical", "beginner", "star"]


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=5000)
    raw_text: str = Field(default="", max_length=100_000)
    skills: list[str] = Field(default_factory=list, max_length=100)
    experience: list[dict[str, str]] = Field(default_factory=list, max_length=50)
    projects: list[dict[str, str]] = Field(default_factory=list, max_length=50)
    education: list[dict[str, str]] = Field(default_factory=list, max_length=20)
    achievements: list[str] = Field(default_factory=list, max_length=50)


class JobIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    company: str = Field(default="", max_length=200)
    description: str = Field(min_length=1, max_length=20_000)
    required_skills: list[str] = Field(default_factory=list, max_length=60)
    url: Optional[str] = Field(default=None, max_length=500)
    notes: str = Field(default="", max_length=5000)
    profile_id: Optional[int] = None


class InterviewStart(BaseModel):
    preset: Optional[Literal["micro1", "turing", "mercor"]] = None
    interview_type: InterviewType = "mixed"
    role: str = Field(default="Software Developer", min_length=1, max_length=200)
    level: str = Field(default="mid", max_length=50)
    company: str = Field(default="", max_length=200)
    difficulty: Difficulty = "medium"
    num_questions: Literal[5, 10, 15, 30] = 5
    language: str = Field(default="", max_length=50)
    spoken: bool = False
    profile_id: Optional[int] = None
    job_id: Optional[int] = None


class AnswerIn(BaseModel):
    answer: str = Field(min_length=1, max_length=10_000)
    style: CoachingStyle = "technical"
    seconds_taken: Optional[int] = Field(default=None, ge=0, le=7200)


class EvaluateIn(BaseModel):
    question: str = Field(min_length=3, max_length=3000)
    answer: str = Field(min_length=1, max_length=10_000)
    style: CoachingStyle = "technical"


class Evaluation(BaseModel):
    technical_accuracy: float = 0
    relevance: float = 0
    clarity: float = 0
    structure: float = 0
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    missed_concepts: list[str] = Field(default_factory=list)
    improved_answer: str = ""
    follow_up: str = ""

    @field_validator("technical_accuracy", "relevance", "clarity", "structure", mode="before")
    @classmethod
    def _score(cls, v):
        try:
            return max(0.0, min(10.0, float(v)))
        except (TypeError, ValueError):
            raise ValueError("score must be numeric")

    @field_validator("strengths", "improvements", "missed_concepts", mode="before")
    @classmethod
    def _list(cls, v):
        if v is None or v == "":
            return []
        if isinstance(v, str):
            return [v]
        return [str(x) for x in v]

    @field_validator("improved_answer", "follow_up", mode="before")
    @classmethod
    def _str(cls, v):
        return "" if v is None else str(v)

    @property
    def overall(self) -> float:
        return round((self.technical_accuracy + self.relevance + self.clarity + self.structure) * 2.5, 1)


class GeneratedQuestion(BaseModel):
    question: str = Field(min_length=5)
    category: str = "General"
    hint: str = ""


class CodingGenerateIn(BaseModel):
    topic: Literal["javascript", "typescript", "react", "html_css", "php", "wordpress", "sql", "rest_api", "general"] = "javascript"
    difficulty: Difficulty = "medium"


class CodingProblem(BaseModel):
    title: str
    statement: str
    constraints: list[str] = Field(default_factory=list)
    examples: list[dict[str, str]] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)


class CodingReviewIn(BaseModel):
    topic: str = Field(max_length=50)
    problem: str = Field(min_length=1, max_length=5000)
    code: str = Field(min_length=1, max_length=20_000)


class CodingReview(BaseModel):
    correctness_notes: str = ""
    time_complexity: str = ""
    space_complexity: str = ""
    issues: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    score: float = 0

    @field_validator("score", mode="before")
    @classmethod
    def _s(cls, v):
        try:
            return max(0.0, min(10.0, float(v)))
        except (TypeError, ValueError):
            return 0.0


class LiveAnswerIn(BaseModel):
    question: str = Field(min_length=3, max_length=8000)
    role: str = Field(default="Software Developer", max_length=200)
    profile_id: Optional[int] = None


class ExplainIn(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    purpose: Literal["explain", "practice"] = "explain"


class SettingsIn(BaseModel):
    provider: Optional[Literal["ollama", "groq", "gemini", "openrouter", "custom"]] = None
    cloud_model: Optional[str] = Field(default=None, max_length=120)
    custom_base_url: Optional[str] = Field(default=None, max_length=300, pattern=r"^$|^https://\S+$|^http://(localhost|127\.0\.0\.1)(:\d+)?\S*$")
    cloud_consent: Optional[bool] = None
    api_key: Optional[str] = Field(default=None, max_length=300)
    model: Optional[str] = Field(default=None, max_length=100)
    response_length: Optional[Literal["short", "medium", "long"]] = None
    answer_timer_seconds: Optional[int] = Field(default=None, ge=0, le=1800)
    default_questions: Optional[Literal[5, 10, 15, 30]] = None
    whisper_model: Optional[Literal["tiny", "base", "small"]] = None
    microphone_device: Optional[str] = Field(default=None, max_length=200)
    screenshot_retention: Optional[Literal["delete_immediately", "session", "keep"]] = None
    transcript_retention: Optional[Literal["discard", "session", "keep"]] = None
    history_retention_days: Optional[int] = Field(default=None, ge=0, le=3650)
    vision_enabled: Optional[bool] = None
    vision_model: Optional[str] = Field(default=None, max_length=100)
    theme: Optional[Literal["dark", "system"]] = None
