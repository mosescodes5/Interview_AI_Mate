import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dashboard } from "../pages/Dashboard";
import { AnalyticsPage } from "../pages/Analytics";
import { Interview } from "../components/Interview";

const ok = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("frontend states", () => {
  it("shows a clear error when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fail"))));
    render(<AnalyticsPage />);
    expect(screen.getByRole("status")).toBeTruthy(); // loading
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Cannot reach the local backend"));
  });

  it("shows an honest empty state with no data (no fabricated stats)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok({ has_data: false, sessions_completed: 0 })));
    render(<AnalyticsPage />);
    expect(await screen.findByText("No analytics yet")).toBeTruthy();
  });

  it("dashboard reports Ollama not running", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/api/models")) return ok({ reachable: false, models: [], selected: "qwen2.5:3b", selected_installed: false, install_hint: "ollama pull qwen2.5:3b", version: null });
      if (url.includes("/analytics")) return ok({ has_data: false, recent_feedback: [], weak_topics: [] });
      return ok([]);
    }));
    render(<Dashboard go={() => {}} />);
    expect(await screen.findByText(/Ollama is not running/)).toBeTruthy();
    expect(screen.getByText("No completed sessions yet")).toBeTruthy();
  });

  it("interview: start shows backend error message and allows retry", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return ok({ detail: "Ollama is not reachable.", code: "ollama_unavailable" }, 503);
      return ok(url.includes("settings") ? { default_questions: 5, answer_timer_seconds: 0 } : []);
    }));
    render(<Interview title="t" intro="intro" />);
    fireEvent.click(screen.getByText("Start practice interview"));
    expect(await screen.findByText(/Ollama is not reachable/)).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("interview: full happy path through first question and feedback", async () => {
    const turn = { id: 1, idx: 0, question: "What is a closure?", category: "JS", hint: "scope", is_follow_up: false, answer: null, feedback: null, score: null };
    const ev = { technical_accuracy: 7, relevance: 8, clarity: 6, structure: 7, strengths: ["clear"], improvements: [], missed_concepts: [], improved_answer: "Better", follow_up: "" };
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/interviews/start")) return ok({ id: "s1", turns: [turn], num_questions: 5, disclaimer: "Practice simulation." });
      if (url.endsWith("/answer")) return ok({ evaluation: ev, score: 70 });
      if (init?.method === "POST") return ok({});
      return ok(url.includes("settings") ? { default_questions: 5, answer_timer_seconds: 0 } : []);
    }));
    render(<Interview title="t" intro="intro" />);
    fireEvent.click(screen.getByText("Start practice interview"));
    expect(await screen.findByText("What is a closure?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "A function with scope." } });
    fireEvent.click(screen.getByText("Submit answer"));
    await waitFor(() => expect(screen.getByText(/Feedback · 70\/100/)).toBeTruthy());
  });
});
