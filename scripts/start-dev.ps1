$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Python 3.11+ is required." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 20+ is required." }
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm --prefix frontend install
Write-Host "API: .\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000"
Write-Host "UI:  npm --prefix frontend run dev"
