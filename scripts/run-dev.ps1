$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root "frontend"
Set-Location $Root

$Python = Get-Command python -ErrorAction SilentlyContinue
$Node = Get-Command node -ErrorAction SilentlyContinue
$Npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $Python) { throw "Python 3.11+ is required." }
if (-not $Node -or -not $Npm) { throw "Node.js 20+ and npm are required." }

$PythonVersion = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ([version]$PythonVersion -lt [version]"3.11") { throw "Python 3.11 or newer is required (found $PythonVersion)." }
$NodeMajor = [int]((& node -p "Number(process.versions.node.split('.')[0])"))
if ($NodeMajor -lt 20) { throw "Node.js 20 or newer is required." }

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    & python -m venv .venv
}
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }

if (-not (Test-Path (Join-Path $Frontend "package-lock.json"))) {
    throw "frontend/package-lock.json is required for a reproducible startup."
}
Push-Location $Frontend
try {
    & npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
}
finally {
    Pop-Location
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    Write-Warning "FFmpeg/ffprobe is missing; editing works but MP4 rendering will be unavailable."
}

New-Item -ItemType Directory -Force -Path ".data" | Out-Null
$Api = $null
$Ui = $null
$ApiOut = Join-Path $Root ".data\api.stdout.log"
$ApiErr = Join-Path $Root ".data\api.stderr.log"
$UiOut = Join-Path $Root ".data\vite.stdout.log"
$UiErr = Join-Path $Root ".data\vite.stderr.log"
try {
    $Api = Start-Process -FilePath (Join-Path $Root ".\.venv\Scripts\python.exe") -ArgumentList @("-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", "8000") -WorkingDirectory $Root -PassThru -NoNewWindow -RedirectStandardOutput $ApiOut -RedirectStandardError $ApiErr
    $Ui = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm run dev -- --host 127.0.0.1") -WorkingDirectory $Frontend -PassThru -NoNewWindow -RedirectStandardOutput $UiOut -RedirectStandardError $UiErr
    Write-Host "FrameLab API: http://127.0.0.1:8000"
    Write-Host "FrameLab UI:  http://127.0.0.1:5173"
    Write-Host "Press Ctrl+C to stop both services."
    while (-not $Api.HasExited -and -not $Ui.HasExited) {
        Start-Sleep -Seconds 1
        $Api.Refresh()
        $Ui.Refresh()
    }
    if ($Api.HasExited) {
        Write-Host "API process exited. Output:"
        if (Test-Path $ApiOut) { Get-Content $ApiOut }
        if (Test-Path $ApiErr) { Get-Content $ApiErr }
    }
    if ($Ui.HasExited) {
        Write-Host "Vite process exited. Output:"
        if (Test-Path $UiOut) { Get-Content $UiOut }
        if (Test-Path $UiErr) { Get-Content $UiErr }
    }
    throw "A development service exited; stopping the other service."
}
finally {
    foreach ($Process in @($Api, $Ui)) {
        if ($null -ne $Process -and -not $Process.HasExited) {
            taskkill.exe /PID $Process.Id /T /F | Out-Null
        }
    }
}
