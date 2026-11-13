import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../App";

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Hide from screen share (in-page privacy overlay)", () => {
  const setup = () => {
    vi.stubGlobal("fetch", vi.fn(() => ok([])));
    render(<App />);
  };

  it("covers the whole page when enabled and states it is not OS-level exclusion", () => {
    setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /hide from screen share/i }));
    const cover = screen.getByRole("dialog");
    expect(cover.textContent).toMatch(/Privacy screen enabled/);
    expect(cover.textContent).toMatch(/does not remove the window from your system/);
  });

  it("is revealed again by the button and by the Escape key", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /hide from screen share/i }));
    fireEvent.click(screen.getByRole("button", { name: /show app again/i }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /hide from screen share/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
