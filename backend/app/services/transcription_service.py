"""Local speech-to-text with faster-whisper (CPU, INT8). Audio is processed via a temp file that is always removed."""
import os
import tempfile
import threading

from ..config import MAX_AUDIO_BYTES


class TranscriptionError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


_model_cache: dict = {}
_load_lock = threading.Lock()  # concurrent requests must not load the model twice
_infer_lock = threading.Lock()  # one CPU transcription at a time; the rest queue instead of thrashing
ALLOWED_SUFFIXES = {".wav", ".webm", ".mp3", ".m4a", ".mp4", ".ogg"}


def _load(size: str):
    with _load_lock:
        return _load_locked(size)


def _load_locked(size: str):
    if size in _model_cache:
        return _model_cache[size]
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise TranscriptionError(
            "faster-whisper is not installed. Run: pip install -r requirements-audio.txt. "
            "You can type your answer instead.", 503)
    _model_cache.clear()  # keep only one model in memory
    _model_cache[size] = WhisperModel(size, device="cpu", compute_type="int8")
    return _model_cache[size]


def transcribe(data: bytes, suffix: str, model_size: str) -> str:
    if not data:
        raise TranscriptionError("The recording is empty.")
    if len(data) > MAX_AUDIO_BYTES:
        raise TranscriptionError("Recording is too large (limit 25 MB). Record shorter clips.")
    model = _load(model_size)
    fd, path = tempfile.mkstemp(suffix=suffix if suffix in ALLOWED_SUFFIXES else ".wav")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        with _infer_lock:
            segments, _ = model.transcribe(path, beam_size=1, vad_filter=True, condition_on_previous_text=False)
            return " ".join(s.text.strip() for s in segments).strip()
    except TranscriptionError:
        raise
    except Exception:
        raise TranscriptionError("Transcription failed. The audio may be corrupted or in an unsupported format.", 500)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
