const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  setContentProtection: (enabled) => ipcRenderer.invoke("set-content-protection", enabled),
  getDesktopSources: () => ipcRenderer.invoke("get-desktop-sources"),
});
