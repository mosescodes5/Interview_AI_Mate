export interface Health { status: string; ollama: { reachable: boolean; version: string | null } }
export interface ModelsInfo {
  provider: string;
  reachable: boolean; version: string | null; models: { name: string; size: number }[];
  selected: string; selected_installed: boolean; install_hint: string;
}
export interface Settings {
  provider: "ollama" | "groq" | "gemini" | "openrouter" | "custom"; cloud_model: string; custom_base_url: string;
  cloud_consent: boolean; api_key_set: boolean;
  model: string; response_length: "short" | "medium" | "long"; answer_timer_seconds: number; default_questions: number;
  whisper_model: "tiny" | "base" | "small"; microphone_device: string;
  screenshot_retention: string; transcript_retention: string; history_retention_days: number;
  vision_enabled: boolean; vision_model: string; theme: string;
}
export interface Evaluation {
  technical_accuracy: number; relevance: number; clarity: number; structure: number;
  strengths: string[]; improvements: string[]; missed_concepts: string[]; improved_answer: string; follow_up: string;
}
export interface Turn {
  id: number; idx: number; question: string; category: string; hint: string; is_follow_up: boolean;
  answer: string | null; feedback: Evaluation | null; score: number | null;
}
export interface Report {
  overall_score: number | null; criteria: Record<string, number> | null; questions_total: number; questions_answered: number;
  strongest: { question: string; score: number; category: string }[]; weakest: { question: string; score: number; category: string }[];
  missed_concepts: string[]; improved_answers: { question: string; your_answer: string; suggested: string }[];
  topics_to_revise: string[]; next_session: string; scoring_explanation: string;
}
export interface Session {
  id: string; preset: string | null; interview_type: string; role: string; status: string; started_at: string;
  finished_at: string | null; report: Report | null; turns: Turn[]; disclaimer: string; num_questions: number;
}
export interface HistoryItem {
  id: string; preset: string | null; interview_type: string; role: string; status: string; started_at: string;
  finished_at: string | null; overall_score: number | null;
}
export interface Profile {
  id: number; name: string; summary: string; raw_text: string; skills: string[];
  experience: Record<string, string>[]; projects: Record<string, string>[]; education: Record<string, string>[]; achievements: string[];
}
export interface Job {
  id: number; title: string; company: string; description: string; required_skills: string[]; url: string | null;
  notes: string; profile_id: number | null; saved_at: string;
}
export interface Analytics {
  has_data: boolean; sessions_completed: number; practice_minutes: number; average_score: number | null;
  score_history: { date: string; score: number; type: string }[];
  by_topic: { topic: string; average: number; answers: number }[]; weak_topics: string[];
  common_missed_concepts: string[]; recent_feedback: { question: string; score: number; improvements: string[] }[];
  coding_submissions: number;
}
export interface CodingProblem { title: string; statement: string; constraints: string[]; examples: Record<string, string>[]; hints: string[] }
export interface CodingReview {
  correctness_notes: string; time_complexity: string; space_complexity: string; issues: string[];
  improvements: string[]; follow_up_questions: string[]; score: number;
}
