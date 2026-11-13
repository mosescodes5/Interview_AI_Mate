"""Chooses the active AI backend: local Ollama (default) or an opt-in OpenAI-compatible cloud provider."""
from . import cloud_service, ollama_service
from .ollama_service import AIError
from .settings_service import PRESETS, get_api_key, get_settings


class CloudConsentRequired(AIError):
    status = 400
    code = "cloud_consent_required"


class ApiKeyMissing(AIError):
    status = 400
    code = "api_key_missing"


def default_model(provider: str) -> str:
    return PRESETS.get(provider, ("", ""))[1]


def generate(system: str, prompt: str, max_tokens: int, json_mode: bool = False) -> str:
    s = get_settings()
    if s["provider"] == "ollama":
        return ollama_service.generate(system, prompt, s["model"], max_tokens, json_mode)
    if not s["cloud_consent"]:
        raise CloudConsentRequired(
            "Cloud AI is off. Tick the consent box in Settings to allow your practice text to be sent to the provider, "
            "or switch back to local Ollama.")
    key = get_api_key()
    if not key:
        raise ApiKeyMissing("No API key saved for the cloud provider. Add one in Settings.")
    base = PRESETS[s["provider"]][0] if s["provider"] in PRESETS else s["custom_base_url"]
    if not base:
        raise ApiKeyMissing("No base URL set for the custom provider. Add one in Settings.")
    model = s["cloud_model"] or default_model(s["provider"])
    if not model:
        raise ApiKeyMissing("No model name set. Add one in Settings.")
    return cloud_service.generate(base, key, model, system, prompt, max_tokens, json_mode)
