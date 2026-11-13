// Native desktop shell. Content protection excludes this window from supported OS screen captures.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const URL = process.env.IM_URL || "http://127.0.0.1:8765";
let win;
let contentProtectionEnabled = true;

function create() {
  win = new BrowserWindow({
    title: "InterviewMate AI",
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f0a1f",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Enabled by default before page content is loaded to avoid an initial capture leak.
  win.setContentProtection(true);
  win.setMenuBarVisibility(false);
  win.loadURL(URL).catch(() => {
    win.loadURL("data:text/html,<body style='font-family:sans-serif;background:%230f0a1f;color:white;padding:40px'><h2>InterviewMate AI server is not running</h2><p>Start the app with the supplied run-desktop.ps1 launcher.</p></body>");
  });
  win.on("closed", () => { win = null; });
}

ipcMain.handle("set-content-protection", (_event, enabled) => {
  contentProtectionEnabled = Boolean(enabled);
  if (win && !win.isDestroyed()) win.setContentProtection(contentProtectionEnabled);
  return contentProtectionEnabled;
});
ipcMain.handle("get-content-protection", () => contentProtectionEnabled);

app.whenReady().then(create);
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) create(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
