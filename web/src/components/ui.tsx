import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

export const Card = ({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>{title && <h3>{title}</h3>}{children}</section>
);

export const Spinner = ({ label = "Working…" }: { label?: string }) => (
  <div className="spinner" role="status"><Loader2 className="spin" size={18} aria-hidden /> {label}</div>
);

export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="alert error" role="alert">
    <AlertTriangle size={18} aria-hidden /> <span><strong>Error:</strong> {message}</span>
    {onRetry && <button className="btn small" onClick={onRetry}><RefreshCw size={14} aria-hidden /> Retry</button>}
  </div>
);

export const Notice = ({ children }: { children: ReactNode }) => (
  <div className="alert ok" role="status"><CheckCircle2 size={18} aria-hidden /> <span>{children}</span></div>
);

export const Empty = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="empty"><strong>{title}</strong>{hint && <p>{hint}</p>}</div>
);

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field"><span>{label}</span>{children}</label>
);

export const Bar = ({ value, max = 10, label }: { value: number; max?: number; label: string }) => (
  <div className="bar" aria-label={`${label}: ${value} of ${max}`}>
    <span>{label}</span><div className="track"><div style={{ width: `${(value / max) * 100}%` }} /></div><b>{value}/{max}</b>
  </div>
);

export const fmtDate = (s: string) => new Date(s).toLocaleString();
