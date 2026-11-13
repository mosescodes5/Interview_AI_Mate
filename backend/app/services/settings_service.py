import json

from ..database import db
from ..schemas.models import SettingsIn

PRESETS = {
    "groq": ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"),
    "openrouter": ("https://openrouter.ai/api/v1", "meta-llama/llama-3.3-70b-instruct:free"),
}

DEFAULTS = {
    "provider": "ollama",
    "cloud_model": "",
    "custom_base_url": "",
    "cloud_consent": False,
    "model": "qwen2.5:3b",
    "response_length": "medium",
    "answer_timer_seconds": 120,
    "default_questions": 5,
    "whisper_model": "base",
    "microphone_device": "",
    "screenshot_retention": "delete_immediately",
    "transcript_retention": "discard",
    "history_retention_days": 0,
    "vision_enabled": False,
    "vision_model": "qwen2.5vl:3b",
    "theme": "dark",
}
TOKENS = {"short": 300, "medium": 600, "long": 1000}


def get_settings() -> dict:
    out = dict(DEFAULTS)
    with db() as c:
        for row in c.execute("SELECT key, value FROM settings"):
            if row["key"] in out:
                try:
                    out[row["key"]] = json.loads(row["value"])
                except ValueError:
                    pass
    out["api_key_set"] = bool(get_api_key())
    return out


def get_api_key() -> str:
    with db() as c:
        row = c.execute("SELECT value FROM settings WHERE key='api_key'").fetchone()
    try:
        return json.loads(row["value"]) if row else ""
    except ValueError:
        return ""


def update_settings(patch: SettingsIn) -> dict:
    changes = patch.model_dump(exclude_none=True)
    with db() as c:
        if "api_key" in changes:
            key = changes.pop("api_key").strip()
            if key:
                c.execute("INSERT INTO settings(key,value) VALUES('api_key',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                          (json.dumps(key),))
            else:
                c.execute("DELETE FROM settings WHERE key='api_key'")
        for k, v in changes.items():
            c.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                      (k, json.dumps(v)))
    return get_settings()


def max_tokens() -> int:
    return TOKENS[get_settings()["response_length"]]
