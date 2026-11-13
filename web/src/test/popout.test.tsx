import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { PopoutFeed, usePopout } from "../live/popout";
import type { Entry } from "../live/useLiveSession";

const entry = (over: Partial<Entry>): Entry => ({ id: 1, question: "What is a closure?", source: "manual", status: "done", at: 1, answer: "A function that remembers its scope.", ...over });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.querySelectorAll("iframe").forEach((f) => f.remove()); });

// jsdom has no real popup windows, so an iframe's window stands in for one.
function fakePopup() {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const w = iframe.contentWindow!;
  return w;
}

describe("floating answers window", () => {
  it("renders the newest answers and states it is not hidden from capture", () => {
    const { container } = render(<PopoutFeed kind="popup" entries={[entry({ id: 2 }), entry({ id: 3, question: "skipped one", status: "skipped" })]} />);
    expect(container.textContent).toContain("A function that remembers its scope.");
    expect(container.textContent).not.toContain("skipped one");
    expect(container.textContent).toMatch(/entire screen/);
  });

  it("opens a popup when Picture-in-Picture is unavailable, and closes it", async () => {
    const w = fakePopup();
    vi.stubGlobal("open", vi.fn(() => w));
    const { result } = renderHook(() => usePopout());
    await act(async () => { await result.current.open(); });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.kind).toBe("popup");
    expect(w.document.body.className).toBe("popout");
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it("prefers Document Picture-in-Picture when the browser has it", async () => {
    const w = fakePopup();
    const requestWindow = vi.fn(() => Promise.resolve(w));
    Object.defineProperty(window, "documentPictureInPicture", { value: { requestWindow }, configurable: true });
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const { result } = renderHook(() => usePopout());
    await act(async () => { await result.current.open(); });
    expect(requestWindow).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(result.current.kind).toBe("pip");
    delete (window as unknown as Record<string, unknown>).documentPictureInPicture;
  });

  it("explains a blocked popup instead of failing silently", async () => {
    vi.stubGlobal("open", vi.fn(() => null));
    const { result } = renderHook(() => usePopout());
    await act(async () => { await result.current.open(); });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.error).toMatch(/blocked/i);
  });
});
