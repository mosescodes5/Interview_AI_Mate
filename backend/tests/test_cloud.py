import json

import httpx

from app.services import cloud_service


def _ok(content):
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


EVAL = json.dumps({"technical_accuracy": 8, "relevance": 8, "clarity": 8, "structure": 8})


def test_cloud_requires_consent_and_key(client):
    client.put("/api/settings", json={"provider": "groq"})
    r = client.post("/api/answers/evaluate", json={"question": "What is REST?", "answer": "x"})
    assert r.status_code == 400 and r.json()["code"] == "cloud_consent_required"
    client.put("/api/settings", json={"cloud_consent": True})
    r = client.post("/api/answers/evaluate", json={"question": "What is REST?", "answer": "x"})
    assert r.status_code == 400 and r.json()["code"] == "api_key_missing"


def test_api_key_never_returned_and_can_be_cleared(client):
    s = client.put("/api/settings", json={"api_key": "sk-secret-123"}).json()
    assert s["api_key_set"] is True and "sk-secret-123" not in json.dumps(s)
    assert "sk-secret-123" not in client.get("/api/settings").text
    assert client.put("/api/settings", json={"api_key": ""}).json()["api_key_set"] is False


def test_cloud_generation_sends_bearer_and_parses(client, monkeypatch):
    seen = {}

    def fake_post(url, headers, body):
        seen.update(url=url, auth=headers["Authorization"], model=body["model"], fmt=body.get("response_format"))
        return _ok(EVAL)
    monkeypatch.setattr(cloud_service, "_post", fake_post)
    client.put("/api/settings", json={"provider": "groq", "cloud_consent": True, "api_key": "k1"})
    r = client.post("/api/answers/evaluate", json={"question": "What is REST?", "answer": "An API style."})
    assert r.status_code == 200 and r.json()["overall"] == 80.0
    assert seen["url"] == "https://api.groq.com/openai/v1/chat/completions" and seen["auth"] == "Bearer k1"
    assert seen["model"] == "llama-3.3-70b-versatile" and seen["fmt"] == {"type": "json_object"}
    m = client.get("/api/models").json()
    assert m["provider"] == "groq" and m["selected_installed"] is True


def test_cloud_errors_are_friendly(client, monkeypatch):
    client.put("/api/settings", json={"provider": "gemini", "cloud_consent": True, "api_key": "bad"})
    for status, code in [(401, "api_key_rejected"), (429, "rate_limited")]:
        monkeypatch.setattr(cloud_service, "_post", lambda *a, s=status: httpx.Response(s, json={}))
        r = client.post("/api/answers/evaluate", json={"question": "What is REST?", "answer": "x"})
        assert r.status_code == status and r.json()["code"] == code


def test_json_mode_retry_without_response_format(client, monkeypatch):
    calls = []

    def fake_post(url, headers, body):
        calls.append("response_format" in body)
        return httpx.Response(400, json={}) if "response_format" in body else _ok(EVAL)
    monkeypatch.setattr(cloud_service, "_post", fake_post)
    client.put("/api/settings", json={"provider": "openrouter", "cloud_consent": True, "api_key": "k"})
    assert client.post("/api/answers/evaluate", json={"question": "What is REST?", "answer": "x"}).status_code == 200
    assert calls == [True, False]


def test_custom_base_url_validation(client):
    assert client.put("/api/settings", json={"custom_base_url": "http://evil.example/v1"}).status_code == 422
    assert client.put("/api/settings", json={"custom_base_url": "https://api.cerebras.ai/v1"}).status_code == 200


def test_turing_and_mercor_presets(client, monkeypatch):
    monkeypatch.setenv("OLLAMA_URL", "http://127.0.0.1:9")  # no AI needed for the opener
    for p, name in [("turing", "Turing"), ("mercor", "Mercor")]:
        r = client.post("/api/interviews/start", json={"preset": p})
        assert r.status_code == 201
        assert f"Not affiliated with {name}" in r.json()["disclaimer"]
