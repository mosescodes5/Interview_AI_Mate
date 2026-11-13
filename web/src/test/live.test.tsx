import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LiveCopilot } from "../pages/LiveCopilot";

const ok = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => { localStorage.clear(); Object.defineProperty(window, "isSecureContext", { value: true, configurable: true }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Live copilot (web)", () => {
  it("answers a typed question using the backend", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/profile")) return ok([]);
      if (url.endsWith("/api/live/answer")) { calls.push(JSON.parse(String(init?.body))); return ok({ question: "q", answer: "Use const by default." }); }
      return ok({});
    }));
    render(<LiveCopilot />);
    fireEvent.change(screen.getByPlaceholderText(/Explain the difference/), { target: { value: "What is the difference between let and const?" } });
    fireEvent.click(screen.getByText("Get answer"));
    expect(await screen.findByText("Use const by default.")).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { question: string }).question).toBe("What is the difference between let and const?");
  });

  it("waits out a busy model and retries instead of showing an error", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let n = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.endsWith("/api/profile")) return ok([]);
      if (url.endsWith("/api/live/answer")) return ++n < 3 ? ok({ detail: "busy", code: "ollama_busy" }, 429) : ok({ question: "q", answer: "Finally answered." });
      return ok({});
    }));
    render(<LiveCopilot />);
    fireEvent.change(screen.getByPlaceholderText(/Explain the difference/), { target: { value: "Describe how HTTP caching works." } });
    fireEvent.click(screen.getByText("Get answer"));
    await vi.advanceTimersByTimeAsync(4000);
    expect(await screen.findByText("Finally answered.")).toBeTruthy();
    expect(n).toBe(3);
  });

  it("shows a clear message when the browser cannot share a screen", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok([])));
    Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    render(<LiveCopilot />);
    fireEvent.click(screen.getByRole("button", { name: /Start listening/ }));
    expect(await screen.findByText(/cannot share a screen/)).toBeTruthy();
  });

  it("explains what to do when screen sharing is cancelled, and stays usable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok([])));
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn(() => Promise.reject(new DOMException("denied", "NotAllowedError"))) }, configurable: true,
    });
    render(<LiveCopilot />);
    fireEvent.click(screen.getByRole("button", { name: /Start listening/ }));
    expect(await screen.findByText(/cancelled or blocked/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start listening/ })).toBeTruthy(); // can retry
  });

  it("requires at least one input", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok([])));
    render(<LiveCopilot />);
    fireEvent.click(screen.getByLabelText(/Read questions on screen/));
    fireEvent.click(screen.getByLabelText(/Listen to shared tab/));
    fireEvent.click(screen.getByRole("button", { name: /Start listening/ }));
    expect(await screen.findByText(/Choose at least one input/)).toBeTruthy();
  });

  it("refuses capture on an insecure origin with an actionable message", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok([])));
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    render(<LiveCopilot />);
    fireEvent.click(screen.getByRole("button", { name: /Start listening/ }));
    await waitFor(() => expect(screen.getByText(/HTTPS or http:\/\/localhost/)).toBeTruthy());
  });
});
