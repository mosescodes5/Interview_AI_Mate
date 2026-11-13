"""Runtime configuration. Values are read at call time so tests can override env vars."""
import os
from pathlib import Path

ALLOWED_ORIGINS = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8765",
    "http://127.0.0.1:8765",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
]
def extra_origins() -> list[str]:
    """Extra allowed browser origins for a deployed web app, comma separated in INTERVIEWMATE_ORIGINS."""
    return [o.strip().rstrip("/") for o in os.environ.get("INTERVIEWMATE_ORIGINS", "").split(",") if o.strip()]


def host() -> str:
    return os.environ.get("INTERVIEWMATE_HOST", "127.0.0.1")


def port() -> int:
    try:
        return int(os.environ.get("INTERVIEWMATE_PORT", "8765"))
    except ValueError:
        return 8765


MAX_DOC_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_AUDIO_BYTES = 25 * 1024 * 1024


def data_dir() -> Path:
    default = Path(__file__).resolve().parents[2] / "local-data"
    p = Path(os.environ.get("INTERVIEWMATE_DATA", str(default)))
    p.mkdir(parents=True, exist_ok=True)
    return p


def db_path() -> Path:
    return data_dir() / "interviewmate.db"


def ollama_url() -> str:
    return os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
