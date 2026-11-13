# Dev mode: backend in a new window + Vite dev server (hot reload) at http://localhost:1420, which proxies /api to the backend.
$root = $PSScriptRoot
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\backend'; .\.venv\Scripts\Activate.ps1; python -m app.main"
Set-Location "$root\web"
npm run dev
