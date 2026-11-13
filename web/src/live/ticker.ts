/**
 * Interval that keeps firing when the tab is in the background. Browsers throttle setInterval on hidden tabs
 * (down to once a minute), which would silently stop screen/audio monitoring while the user is looking at the
 * interview window. A Worker's timer is not throttled the same way. Falls back to setInterval if Workers are blocked.
 */
export function createTicker(ms: number, cb: () => void): () => void {
  let stopped = false;
  let fallback: ReturnType<typeof setInterval> | null = null;
  const useFallback = () => { if (!stopped && fallback === null) fallback = setInterval(cb, ms); };
  let worker: Worker | null = null;
  let url = "";
  try {
    url = URL.createObjectURL(new Blob([`const t=setInterval(()=>postMessage(0),${Math.max(20, Math.floor(ms))});onmessage=e=>{if(e.data==="stop"){clearInterval(t);close();}};`], { type: "text/javascript" }));
    worker = new Worker(url);
    worker.onmessage = () => { if (!stopped) cb(); };
    worker.onerror = () => { worker?.terminate(); worker = null; useFallback(); };
  } catch { useFallback(); }
  return () => {
    stopped = true;
    if (fallback !== null) clearInterval(fallback);
    if (worker) { try { worker.postMessage("stop"); } catch { /* already closed */ } worker.terminate(); }
    if (url) URL.revokeObjectURL(url);
  };
}
