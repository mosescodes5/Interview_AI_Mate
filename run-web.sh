#!/usr/bin/env bash
# One-process web mode (Linux/macOS): builds the UI, then serves UI + API at http://127.0.0.1:8765
set -e
root="$(cd "$(dirname "$0")" && pwd)"
cd "$root/web" && { [ -d node_modules ] || npm install; } && npm run build
cd "$root/backend"
[ -d .venv ] || { python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt; }
. .venv/bin/activate
python -m app.main
