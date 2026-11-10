# Persian subtitle spike

Run from the repository root:

```bash
python spike/run_spike.py
```

Requires FFmpeg with the libass `subtitles` filter and an H.264 encoder (typically libx264). The script writes an MP4 and a JSON report under `spike/output/` and `spike/report.json`.

Open `preview.html` in a browser for the browser-side comparison. Visual inspection is still required; a successful encode alone does not prove correct Persian shaping.
