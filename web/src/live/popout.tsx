import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Entry } from "./useLiveSession";

/**
 * A small separate window for answers. It uses the Document Picture-in-Picture API
 * (Chrome/Edge 116+, always on top) and falls back to a normal popup window.
 *
 * IMPORTANT: this is just another window on your desktop. It is NOT excluded from capture by the
 * operating system. It is left out of a Meet/Zoom share only when you share a single tab or window
 * (not "Entire screen") and that shared tab/window is not this one.
 */
interface PipApi { requestWindow(o?: { width?: number; height?: number }): Promise<Window> }

export function popoutSupported(): boolean {
  return typeof window !== "undefined" && (!!(window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture || typeof window.open === "function");
}

function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      const el = target.document.createElement("style");
      el.textContent = css;
      target.document.head.appendChild(el);
    } catch {
      if (sheet.href) {
        const link = target.document.createElement("link");
        link.rel = "stylesheet"; link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  }
}

export function usePopout() {
  const winRef = useRef<Window | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [kind, setKind] = useState<"pip" | "popup" | null>(null);
  const [error, setError] = useState("");

  const close = useCallback(() => {
    const w = winRef.current;
    winRef.current = null;
    setContainer(null); setKind(null);
    try { if (w && !w.closed) w.close(); } catch { /* already closed */ }
  }, []);

  const open = useCallback(async () => {
    setError("");
    if (winRef.current && !winRef.current.closed) { winRef.current.focus?.(); return; }
    let w: Window | null = null;
    let k: "pip" | "popup" = "pip";
    const pip = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
    if (pip) {
      try { w = await pip.requestWindow({ width: 420, height: 560 }); } catch { w = null; }
    }
    if (!w) {
      k = "popup";
      w = window.open("", "interviewmate-answers", "popup=yes,width=420,height=560");
    }
    if (!w) { setError("The browser blocked the pop-out window. Allow pop-ups for this site and try again."); return; }
    w.document.title = "InterviewMate answers";
    copyStyles(w);
    w.document.body.className = "popout";
    const root = w.document.createElement("div");
    w.document.body.appendChild(root);
    w.addEventListener("pagehide", () => { if (winRef.current === w) { winRef.current = null; setContainer(null); setKind(null); } });
    winRef.current = w;
    setKind(k);
    setContainer(root);
  }, []);

  useEffect(() => close, [close]); // close with the page
  return { open, close, container, kind, error, isOpen: !!container };
}

export function PopoutFeed({ entries, kind }: { entries: Entry[]; kind: "pip" | "popup" | null }) {
  const shown = entries.filter((e) => e.status !== "skipped").slice(0, 4);
  return (
    <div className="popout-feed" aria-label="Answers">
      {shown.length === 0 && <p className="muted">Waiting for the next question…</p>}
      {shown.map((e, i) => (
        <article key={e.id} className={`popout-entry ${i === 0 ? "newest" : ""}`}>
          <p className="popout-q">{e.question}</p>
          {e.status === "generating" || e.status === "queued" ? <p className="muted">Writing answer…</p> : null}
          {e.answer && <p className="popout-a">{e.answer}</p>}
          {e.error && <p className="muted" role="alert">⚠ {e.error}</p>}
        </article>
      ))}
      <p className="popout-hint">
        {kind === "pip" ? "Floating window." : "Pop-up window."} It is a normal window: others see it if you share your <strong>entire screen</strong>. Share a single tab or window instead.
      </p>
    </div>
  );
}

export { createPortal };
