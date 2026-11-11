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

Restart the local API after installing the engine and models. The editor's **Local AI voice-over** section lists installed models. Paste your script, choose an installed voice, and select **Produce video automatically to final MP4**. The app creates the storyboard, synthesizes each scene, saves the voice assets and starts the MP4 render. You can also generate the storyboard separately first and edit each scene's narration before running the automatic production button.

Each generated WAV is stored in the current project's local media library and linked to its scene. The MP4 renderer mixes those WAV files into the final video at the start time of each scene. If no scene has generated narration audio, the render remains silent.


### Batch failure behavior

A multi-scene voice-over request is atomic from the editor's perspective. If Piper fails, times out, or cannot start for a later scene, WAV files and asset records created earlier in that same request are rolled back. The user can correct the problem and retry the batch without manually cleaning orphaned generated voice assets. Existing assets from earlier successful requests are not touched.

## Add visuals to scenes

Upload PNG/JPEG/WebP images or MP4/WebM clips to the Media Library. Select a scene, then choose its image/video from the **Scene media** selector. The renderer places that asset behind the scene title and timed narration captions. Images stay completely still; video clips play normally and loop if the scene is longer than the source clip. The renderer crops to fill the selected 16:9 or 9:16 frame, so keep important subjects near the center. Scenes without an attached asset use a dark designed background; Architecture/Diagram, Code and Comparison scene types receive different static geometric templates. No automatic zoom or pan is applied.

Captions are divided into sentence/12-word chunks and timed proportionally by word count. This is a readable approximation, not precise word-level speech alignment; review subtitles before publishing.

## Notes

- Voice generation is local and can be slower on CPU, particularly for long scripts.
- Generate in batches of up to 30 scenes. Each scene narration is limited to 8,000 characters.
- This is a deterministic TTS workflow, not voice cloning. Only use voices whose licenses permit your intended use.
- The studio does not automatically download model files or accept model licenses on your behalf.
