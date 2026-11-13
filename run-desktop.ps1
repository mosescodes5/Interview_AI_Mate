$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# Build the UI that the protected native window will display.
Set-Location "$root\web"
if (-not (Test-Path node_modules)) { npm ci; if ($LASTEXITCODE -ne 0) { throw "Frontend npm ci failed" } }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }

# Prepare and start the local API.
Set-Location "$root\backend"
if (-not (Test-Path .venv)) { py -3 -m venv .venv; if ($LASTEXITCODE -ne 0) { throw "Could not create Python environment" } }
& "$root\backend\.venv\Scripts\python.exe" -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed" }
$existing = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
  Start-Process -FilePath "$root\backend\.venv\Scripts\python.exe" -ArgumentList "-m app.main" -WorkingDirectory "$root\backend" -WindowStyle Hidden
}
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8765/health" -TimeoutSec 2 | Out-Null; $ready = $true; break }
  catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { throw "InterviewMate backend did not start on port 8765" }

# Install and start Electron desktop shell.
Set-Location "$root\legacy-desktop"
if (-not (Test-Path node_modules)) { npm install; if ($LASTEXITCODE -ne 0) { throw "Desktop npm install failed" } }
npm start
if ($LASTEXITCODE -ne 0) { throw "Desktop app failed to start" }
