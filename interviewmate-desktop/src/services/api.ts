export const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new ApiError("Cannot reach the local backend. Start it with: python -m app.main (in the backend folder).", 0, "backend_down");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    let code: string | undefined;
    try {
      const body = await res.json();
      code = body.code;
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = "Invalid input: " + body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch { /* keep default message */ }
    throw new ApiError(message, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  get: <T,>(p: string) => request<T>(p),
  post: <T,>(p: string, b?: unknown) => request<T>(p, json("POST", b ?? {})),
  put: <T,>(p: string, b: unknown) => request<T>(p, json("PUT", b)),
  del: <T = void,>(p: string) => request<T>(p, { method: "DELETE" }),
  upload: <T,>(p: string, file: Blob, name: string) => {
    const fd = new FormData();
    fd.append("file", file, name);
    return request<T>(p, { method: "POST", body: fd });
  },
};

export const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
