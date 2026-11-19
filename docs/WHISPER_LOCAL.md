# Optional offline speech-to-text

The editor can transcribe an uploaded or browser-recorded scene audio asset using a local faster-whisper model. It does not call a hosted API and does not download model weights.

1. Install the optional Python dependency into the studio virtual environment:

   ```bash
   .venv/bin/python -m pip install -r backend/requirements-whisper.txt
   ```

   Windows PowerShell:

   ```powershell
   .\.venv\Scripts\python.exe -m pip install -r backend\requirements-whisper.txt
   ```

2. Download or copy a faster-whisper compatible model directory to your machine using your own approved method.
3. Set `WHISPER_MODEL_PATH` to that existing local directory before starting the backend. For example:

   Linux:
   ```bash
   export WHISPER_MODEL_PATH="$HOME/models/faster-whisper-small"
   ```

   Windows PowerShell:
   ```powershell
   $env:WHISPER_MODEL_PATH = "$HOME\models\faster-whisper-small"
   ```

4. Restart the backend. The Audio inspector's **Transcribe** action will populate the selected scene narration and return segment/word timestamps.

Optional tuning:
- `WHISPER_DEVICE=cpu` (default) or `cuda` when a compatible CUDA runtime is installed.
- `WHISPER_COMPUTE_TYPE=int8` (default) or a supported compute type for the chosen device.

The model must already exist on disk. A missing package or model disables transcription with a clear API/UI message; the studio never silently downloads model weights.
