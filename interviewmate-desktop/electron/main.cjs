// Electron shell with explicit, user-selected display capture for the live copilot.
const { app, BrowserWindow, ipcMain, desktopCapturer } = require("electron");
const path = require("path");

const URL = process.env.IM_URL || "http://127.0.0.1:8765";
let win;

function create() {
  win = new BrowserWindow({
    title: "InterviewMate AI",
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    backgroundColor: "#0f0a1f",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setContentProtection(true);
  win.setMenuBarVisibility(false);
  const load = () => win.loadURL(URL).catch(() => {
    win.loadURL("data:text/html,<body style='font-family:sans-serif;background:%230f0a1f;color:white;padding:40px'><h2>Backend not running</h2><p>Start it with <code>python -m app.main</code> in the backend folder, then restart this app.</p></body>");
  });
  load();
}

ipcMain.handle("set-content-protection", (_e, enabled) => {
  if (win) win.setContentProtection(Boolean(enabled));
  return true;
});

ipcMain.handle("get-desktop-sources", async () => {
  const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 0, height: 0 } });
  return sources.map(({ id, name }) => ({ id, name }));
});

app.whenReady().then(create);
app.on("window-all-closed", () => app.quit());
