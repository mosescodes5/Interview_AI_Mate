"""Thin client for the local Ollama HTTP API. Never assumes Ollama is running."""
import threading

import httpx

from ..config import ollama_url


class AIError(Exception):
    status = 502
    code = "ai_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class OllamaUnavailable(AIError):
    status = 503
    code = "ollama_unavailable"


class ModelMissing(AIError):
    status = 409
    code = "model_missing"


class OllamaBusy(AIError):
    status = 429
    code = "ollama_busy"


class AITimeout(AIError):
    status = 504
    code = "ai_timeout"


class BadAIResponse(AIError):
    status = 502
    code = "bad_ai_response"


_gen_lock = threading.Lock()
UNAVAILABLE_MSG = "Ollama is not reachable. Start Ollama (open the Ollama app or run `ollama serve`) and try again."


def _client(timeout: float = 180) -> httpx.Client:
    return httpx.Client(base_url=ollama_url(), timeout=httpx.Timeout(timeout, connect=3))


def health() -> dict:
    try:
        with _client(3) as c:
            r = c.get("/api/version")
            r.raise_for_status()
            return {"reachable": True, "version": r.json().get("version")}
    except (httpx.HTTPError, ValueError):
        return {"reachable": False, "version": None}


def list_models() -> list[dict]:
    try:
        with _client(5) as c:
            r = c.get("/api/tags")
            r.raise_for_status()
            return [{"name": m.get("name", ""), "size": m.get("size", 0)} for m in r.json().get("models", [])]
    except (httpx.HTTPError, ValueError):
        raise OllamaUnavailable(UNAVAILABLE_MSG)


def generate(system: str, prompt: str, model: str, max_tokens: int = 600, json_mode: bool = False) -> str:
    """One generation at a time: a second concurrent call is refused rather than queued."""
    if not _gen_lock.acquire(blocking=False):
        raise OllamaBusy("The model is still working on another request. Please wait for it to finish.")
    try:
        body = {
            "model": model,
            "stream": False,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "options": {"num_predict": max_tokens, "temperature": 0.4},
        }
        if json_mode:
            body["format"] = "json"
        try:
            with _client() as c:
                r = c.post("/api/chat", json=body)
        except httpx.ConnectError:
            raise OllamaUnavailable(UNAVAILABLE_MSG)
        except httpx.TimeoutException:
            raise AITimeout("The model took too long to respond. Try a shorter response length or a smaller model.")
        except httpx.HTTPError as e:
            raise AIError(f"Could not talk to Ollama: {e}")
        if r.status_code == 404:
            raise ModelMissing(f"Model '{model}' is not installed. Run: ollama pull {model}")
        if r.status_code >= 400:
            raise AIError(f"Ollama returned an error ({r.status_code}).")
        try:
            return r.json()["message"]["content"]
        except (KeyError, ValueError):
            raise BadAIResponse("Ollama returned an unexpected response.")
    finally:
        _gen_lock.release()
