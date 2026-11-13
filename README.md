# InterviewMate AI (web)

AI interview assistant that runs in the browser. It reads questions from a shared screen/window/tab (OCR), listens to
interview audio or your microphone (speech-to-text), detects new questions, and drafts answers from your CV automatically.
It also includes the original practice simulators (mock interviews, coding, analytics). Independent project, **not affiliated with Micro1, Turing, Mercor or any employer**.

> Use the live copilot only where the interview/assessment rules allow outside assistance. Answers are drafts: verify them and make them your own.

## Quick start

```bash
./run-web.sh          # Linux/macOS      (Windows: .\run-web.ps1)
# open http://localhost:8765
```

This builds the UI and starts one process (FastAPI) that serves both the UI and the API, same-origin, so there is no CORS setup.
Screen/mic capture needs a **secure context**: `http://localhost` or HTTPS.

Prerequisites: Python 3.10+, Node 18+, an AI provider ([Ollama](https://ollama.com) + `ollama pull qwen2.5:3b`, or a free cloud key in Settings),
**Tesseract OCR** (`apt install tesseract-ocr` / `brew install tesseract` / [Windows installer](https://github.com/UB-Mannheim/tesseract/wiki)),
and for server-side transcription `pip install -r backend/requirements-audio.txt` (faster-whisper; downloads its model on first use, so the first transcription is slow).

## Live Interview Copilot

1. Open **Live Interview Copilot**, pick inputs, choose your CV profile, click **Start listening**.
2. The browser asks what to share. Pick the interview **window or tab**. For tab audio in Chrome/Edge tick *Also share tab audio* (on Windows, *Entire screen* + *Also share system audio* also works).
3. New questions appear with answers automatically. Everything can also be typed/pasted manually.

How it works:
- **Screen**: a frame is sampled every N seconds (1-15, configurable). OCR only runs when the picture changed *and* settled, so static screens cost nothing. Dark-mode screens are inverted and small captures upscaled before Tesseract. You can restrict reading to the top/bottom/left/right half.
- **Question detection**: OCR noise (menus, buttons, wrapped lines) is filtered; the newest question-like sentence wins; coding prompts keep their constraints.
- **No repeats**: handled questions are remembered with fuzzy matching (survives OCR typos and truncation). The app's own answers are also remembered so it never answers itself when the whole screen is shared.
- **Audio**: speech is cut into utterances at natural pauses (not fixed clips that split sentences), silence is never uploaded, short utterances are merged, filler/Whisper hallucinations ("Thank you.") are dropped, then transcribed by the backend (faster-whisper). Microphone can alternatively use the browser's instant speech recognition (Chrome/Edge; audio goes to the browser vendor).
- **Answers**: generated one at a time; if the model is busy the request waits and retries instead of failing. If more than 3 questions pile up the oldest are skipped.
- Monitoring keeps running while the interview window is in front (timers run in a Worker so background-tab throttling doesn't stop it). Navigating to another page *inside* InterviewMate ends the session.

Browser support: screen share + tab audio = desktop Chrome/Edge (best), Firefox (screen only, no tab audio), Safari (limited). Phones/tablets cannot share a screen from the browser.

## Deploying beyond your own machine

Set `INTERVIEWMATE_HOST=0.0.0.0`, `INTERVIEWMATE_PORT`, and `INTERVIEWMATE_ORIGINS=https://your.domain` and put it behind HTTPS (a reverse proxy such as Caddy/nginx; raise the proxy upload limit above 10 MB for screenshots).
**There is no login**: anyone who can reach the server can read your CV profiles and use your saved API key. Only expose it on a private network or behind your own authentication.

## Tests

```bash
cd backend && python -m pytest          # 35 tests (includes real Tesseract OCR when installed)
cd web && npm test                      # 31 tests
# optional real-browser end-to-end (needs: pip install playwright && playwright install chromium; server + web/e2e/fake_ollama.py running)
python web/e2e/screen_e2e.py ; python web/e2e/audio_e2e.py
```

The desktop shells (Electron/Tauri) were moved to `legacy-desktop/` and are no longer used. ## "Hide from screen share" (privacy overlay, not OS-level exclusion)

The header button toggles a full-page **privacy overlay** inside the browser tab (Esc or "Show app again" reveals the app).
It only covers the page content. A web page **cannot** exclude its window from the operating system's or the meeting app's
screen-share picker or from screen capture; that needs a native app using OS APIs (e.g. Windows `SetWindowDisplayAffinity`),
which this web build does not do. While the overlay is on, the app is hidden from you as well. If you share a different
window or tab instead, nothing of InterviewMate is shown.

## AI providers

Default is local Ollama. For a free hosted option, open **Settings > AI provider** and pick Groq, Google Gemini, OpenRouter, or a custom
OpenAI-compatible endpoint, paste your own free API key, and tick the consent box. These providers received no card-free signup requirement
when last checked, but free limits and model names change often, so verify on the provider's site. Your questions, answers and any CV/job
text are sent to that provider, so it is off by default. The key is stored in the local SQLite file and is never returned to the UI.
Free tiers are rate limited (about 20-30 requests per minute); a 5-question practice interview needs roughly 12-15 calls.

## Turing and Mercor practice

Sidebar entries **Turing Practice** and **Mercor Practice**

## Run the backend (PowerShell)

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# optional, for voice transcription:
pip install -r requirements-audio.txt
python -m pytest
python -m app.main        # http://127.0.0.1:8765  (docs at /docs)
```

Prerequisites on your machine: [Ollama](https://ollama.com), then `ollama pull qwen2.5:3b` (you run this; the app never downloads models).
For OCR install [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) and add it to PATH.

## Privacy

Inference is local via Ollama. Backend listens on 127.0.0.1 only, CORS limited to the local app origins, no telemetry.
Uploaded CVs and screenshots are processed in memory and not stored unless you save the extracted text to a profile.
Audio is written to a temp file only during transcription and deleted immediately. Installed libraries and OS services may have their own behaviour.

## Troubleshooting

- `ollama_unavailable` (503): start Ollama. `model_missing` (409): run the shown `ollama pull` command.
- `ollama_busy` (429): one generation runs at a time; wait and retry.
- OCR 503: Tesseract not installed/on PATH. Transcription 503: install `requirements-audio.txt`.

- Screen share picker never appears / "Could not start screen sharing": use desktop Chrome/Edge on http://localhost or HTTPS, and allow the permission in the address bar.
- No tab audio: pick a *Tab* (not a window) and tick "Also share tab audio"; windows have no audio track.
- First transcription is very slow: faster-whisper is downloading its model; use the *tiny* model in Settings for speed.

## Floating answers window

On **Live Interview Copilot**, "Floating answers" opens a small always-on-top window (Document Picture-in-Picture in Chrome/Edge 116+, otherwise a normal popup)
that shows the newest questions and answers. It is an ordinary window, **not** excluded from capture by the operating system. It stays out of a
Meet/Zoom share only if you share a single **tab or window** (not "Entire screen") and that tab/window is not the floating one.

## Server transcription (Windows)

`run-web.ps1` uses `backend\.venv`. To enable Whisper in that same environment:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements-audio.txt
```


## Native desktop mode: exclude InterviewMate from entire-screen sharing (Windows)

If you need the InterviewMate window itself not to appear when you share your **entire display**, use the native Electron desktop shell, not the browser-only web mode. From PowerShell, run `\.\run-desktop.ps1` from the project root. The launcher builds the web UI, starts the local backend, then opens the Electron app. The Electron window enables `BrowserWindow.setContentProtection(true)` before loading the app. On supported Windows versions this uses the operating-system capture-exclusion facility so the protected window is omitted/blanked in supported screen-capture paths, including many meeting-app whole-screen shares.

The header control in the desktop app toggles native capture protection. It starts **ON**. Choose “Allow screen capture” only when you intentionally want the app visible in captures. In ordinary browser mode the same control can only show a privacy cover inside the page; it cannot exclude the browser window from OS capture.

**Compatibility and verification:** Electron/OS support varies. Windows 10 version 2004 or newer is recommended. Some capture methods, remote-desktop tools, graphics drivers, or meeting-app implementations may ignore OS capture-exclusion flags. macOS and Linux behaviour differs. Test with a trusted second device/account before sharing sensitive material; do not assume protection is universal. The feature does not hide the app from a person physically looking at your monitor, nor from screenshots taken inside the app itself.
