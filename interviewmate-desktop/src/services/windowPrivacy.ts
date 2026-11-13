// Screen-capture protection for the desktop window (Electron or Tauri).
// Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) on Win10 2004+ (older builds show a black box).
// macOS: window sharing type = none. No-op in a plain browser.
const KEY = "im.contentProtected";

type ElectronBridge = { setContentProtection: (enabled: boolean) => Promise<boolean> };
const electron = () => (window as unknown as { electronAPI?: ElectronBridge }).electronAPI;
const isTauriEnv = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isDesktop = () => typeof window !== "undefined" && (!!electron() || isTauriEnv());
export const isTauri = isDesktop; // kept so existing imports keep working

/** Saved preference; defaults to ON. */
export const getProtectionPref = () => localStorage.getItem(KEY) !== "false";

export async function setContentProtection(enabled: boolean): Promise<boolean> {
  localStorage.setItem(KEY, String(enabled));
  const e = electron();
  if (e) return e.setContentProtection(enabled);
  if (isTauriEnv()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setContentProtected(enabled);
    return true;
  }
  return false;
}

/** Call once at startup so the saved preference wins over the default. */
export async function applyStoredProtection() {
  try { await setContentProtection(getProtectionPref()); } catch { /* window API unavailable */ }
}
