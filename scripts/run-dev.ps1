$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
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
if (-not (Test-Path ".\frontend\node_modules")) {
    & npm --prefix frontend install
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -or -not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    Write-Warning "FFmpeg/ffprobe is missing; editing works but MP4 rendering will be unavailable."
}

New-Item -ItemType Directory -Force -Path ".data" | Out-Null
$Api = $null
$Ui = $null
try {
    $Api = Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList @("-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", "8000") -PassThru -NoNewWindow
    $Ui = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm --prefix frontend run dev -- --host 127.0.0.1") -PassThru -NoNewWindow
    Write-Host "FrameLab API: http://127.0.0.1:8000"
    Write-Host "FrameLab UI:  http://127.0.0.1:5173"
    Write-Host "Press Ctrl+C to stop both services."
    while (-not $Api.HasExited -and -not $Ui.HasExited) {
        Start-Sleep -Seconds 1
        $Api.Refresh()
        $Ui.Refresh()
    }
    throw "A development service exited; stopping the other service."
}
finally {
    foreach ($Process in @($Api, $Ui)) {
        if ($null -ne $Process -and -not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
