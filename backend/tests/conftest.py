import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("INTERVIEWMATE_DATA", str(tmp_path))
    from app.main import app
    with TestClient(app) as c:
        yield c


EVAL = {"technical_accuracy": 7, "relevance": 8, "clarity": 6, "structure": 7, "strengths": ["clear"],
        "improvements": ["add example"], "missed_concepts": ["closures"], "improved_answer": "Better answer.",
        "follow_up": "Can you give an example?"}


@pytest.fixture
def fake_ai(monkeypatch):
    """Replace the Ollama generate call so no model or server is needed."""
    from app.services import ollama_service
    calls = []

    def fake(system, prompt, model, max_tokens=600, json_mode=False):
        calls.append({"system": system, "prompt": prompt, "model": model})
        if "ONE question" in system:
            return json.dumps({"question": f"Question number {len(calls)}?", "category": "React", "hint": "Think hooks"})
        return json.dumps(EVAL)

    monkeypatch.setattr(ollama_service, "generate", fake)
    return calls
