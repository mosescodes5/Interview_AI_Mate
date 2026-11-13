"""OpenAI-compatible chat client for optional free cloud providers (Groq, Gemini, OpenRouter, custom)."""
import threading

import httpx

from .ollama_service import AIError, AITimeout, BadAIResponse

_lock = threading.Lock()


class CloudBusy(AIError):
    status = 429
    code = "ai_busy"


class CloudAuthError(AIError):
    status = 401
    code = "api_key_rejected"


class CloudRateLimited(AIError):
    status = 429
    code = "rate_limited"


def _post(url: str, headers: dict, body: dict) -> httpx.Response:
    return httpx.post(url, headers=headers, json=body, timeout=httpx.Timeout(90, connect=8))


def generate(base_url: str, api_key: str, model: str, system: str, prompt: str, max_tokens: int, json_mode: bool) -> str:
    if not _lock.acquire(blocking=False):
        raise CloudBusy("Another request is still running. Please wait for it to finish.")
    try:
        body = {"model": model, "temperature": 0.4, "max_tokens": max_tokens,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        url = base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        try:
            r = _post(url, headers, body)
            if r.status_code == 400 and json_mode:  # some free models reject response_format; retry without it
                body.pop("response_format")
                r = _post(url, headers, body)
        except httpx.TimeoutException:
            raise AITimeout("The cloud provider took too long to respond. Try again.")
        except httpx.HTTPError:
            raise AIError("Could not reach the cloud provider. Check your internet connection.")
        if r.status_code in (401, 403):
            raise CloudAuthError("The provider rejected your API key. Check it in Settings.")
        if r.status_code == 429:
            raise CloudRateLimited("Free-tier rate limit reached. Wait a minute and retry, or switch provider.")
        if r.status_code == 404:
            raise AIError(f"Model '{model}' was not found at this provider. Check the model name in Settings.")
        if r.status_code >= 400:
            raise AIError(f"The provider returned an error ({r.status_code}).")
        try:
            return r.json()["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, ValueError, TypeError):
            raise BadAIResponse("The provider returned an unexpected response.")
    finally:
        _lock.release()
