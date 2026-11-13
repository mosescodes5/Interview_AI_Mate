const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  setContentProtection: (enabled) => ipcRenderer.invoke("set-content-protection", enabled),
  getContentProtection: () => ipcRenderer.invoke("get-content-protection"),
});
