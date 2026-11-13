import { Cpu } from "lucide-react";
import { api } from "../services/api";
import { useLoad } from "../hooks/useAsync";
import type { ModelsInfo } from "../types";

export function ModelStatus() {
  const { data, error } = useLoad(() => api.get<ModelsInfo>("/api/models"));
  let text = "Checking local AI…";
  let ok = false;
  if (error) text = "Backend offline";
  else if (data) {
    if (data.provider !== "ollama") { ok = data.selected_installed; text = ok ? `${data.provider} · ${data.selected}` : `${data.provider}: finish setup in Settings`; }
    else if (!data.reachable) text = "Ollama not running";
    else if (!data.selected_installed) text = `Model missing: ${data.install_hint}`;
    else { text = `${data.selected} ready`; ok = true; }
  }
  return <div className={`status ${ok ? "good" : "bad"}`} title={text}><Cpu size={14} aria-hidden /> {ok ? "●" : "○"} {text}</div>;
}
