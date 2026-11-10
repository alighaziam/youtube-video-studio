# Local voice-over setup

The studio uses Piper locally. No text is sent to a cloud voice service.

## 1. Install the optional engine

Activate the project's Python virtual environment, then run:

```bash
pip install -r backend/requirements-voice.txt
```

Confirm that the `piper` command is available on PATH. If it is installed elsewhere, set `PIPER_BIN` to the full executable path before starting the API.

## 2. Install voice models

Create the local model directory:

```bash
mkdir -p .data/voices
```

Download a Piper `.onnx` model and its matching `.onnx.json` metadata file from the [Piper voice collection](https://huggingface.co/rhasspy/piper-voices). Read and follow the voice's license before using it, especially for monetized videos. Place both files directly in `.data/voices`.

Example layout:

```text
.data/voices/
  en_US-lessac-medium.onnx
  en_US-lessac-medium.onnx.json
  fa_IR-your-selected-voice.onnx
  fa_IR-your-selected-voice.onnx.json
```

The example names are illustrative; only models you actually download appear in the voice picker. Model availability and quality vary by language.

## 3. Generate narration

Restart the local API after installing the engine and models. The editor's **Local AI voice-over** section lists installed models. Paste your script, generate the storyboard, review each scene's narration, choose a voice, and select **Generate all scene voice-overs**.

Each generated WAV is stored in the current project's local media library and linked to its scene. The MP4 renderer mixes those WAV files into the final video at the start time of each scene. If no scene has generated narration audio, the render remains silent.

## Notes

- Voice generation is local and can be slower on CPU, particularly for long scripts.
- Generate in batches of up to 30 scenes. Each scene narration is limited to 8,000 characters.
- This is a deterministic TTS workflow, not voice cloning. Only use voices whose licenses permit your intended use.
- The studio does not automatically download model files or accept model licenses on your behalf.
