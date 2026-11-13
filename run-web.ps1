# One-process web mode (Windows): builds the UI, then serves UI + API at http://localhost:8765
# Run from PowerShell:  .\run-web.ps1
# If scripts are blocked:  powershell -ExecutionPolicy Bypass -File .\run-web.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# --- frontend ---
Set-Location "$root\web"
if (-not (Test-Path node_modules)) {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
}
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

# --- backend (uses whatever Python 3.10+ is installed, not a fixed version) ---
Set-Location "$root\backend"
if (-not (Test-Path .venv)) {
  if (Get-Command py -ErrorAction SilentlyContinue) { py -3 -m venv .venv } else { python -m venv .venv }
  if ($LASTEXITCODE -ne 0) { throw "Could not create the Python virtual environment" }
}
. .\.venv\Scripts\Activate.ps1
python -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

# Open the browser only once the server answers (a background job polls /health)
Start-Job -ScriptBlock {
  for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8765/health" -TimeoutSec 5 | Out-Null; Start-Process "http://localhost:8765"; break }
    catch { Start-Sleep -Seconds 1 }
  }
} | Out-Null

Write-Host "Starting InterviewMate AI at http://localhost:8765  (Ctrl+C to stop)"
python -m app.main
