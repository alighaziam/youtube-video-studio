# Technical Spike: Persian Subtitle Rendering

## Goal

Validate that the local FFmpeg build exposes the `subtitles` filter (libass), can render a Persian sample, and produces a viewable output. A browser preview is provided for a visual side-by-side check.

## Run

1. Install FFmpeg with libass support and ensure `ffmpeg` is on PATH.
2. Install Python 3.10+.
3. From the repository root run:

   ```bash
   python spike/run_spike.py
   ```

4. Open `spike/preview.html` in a browser and compare its text placement and shaping with `spike/output/persian-subtitle.mp4`.

The script writes a machine-readable report to `spike/report.json`. It records actual command output and does not claim success when FFmpeg or its subtitle filter is missing.

## Sample

The sample is 1280x720, 3 seconds, with a centered Persian sentence near the lower safe area. The ASS style requests a locally installed Arabic-capable font. Font fallback differs by operating system; the report records the selected font when Fontconfig is available.

## Acceptance criteria

- FFmpeg is discoverable.
- FFmpeg exposes the `subtitles` filter.
- The sample render exits successfully and creates a non-empty MP4.
- Persian characters are connected and ordered correctly in the rendered video.
- Browser preview shows the same sentence and intended alignment.

The last two criteria require visual inspection. This harness deliberately does not claim pixel-identical browser and FFmpeg output: shaping engines, font fallback, hinting, and rasterization can differ. The production editor should share subtitle geometry/style data and validate layout within a documented tolerance.

## Known limitations

- This is a validation harness, not the editor.
- The browser uses system font fallback; FFmpeg/libass may resolve a different font.
- For reproducible output, a licensed font file and explicit font registration will be added after font licensing and packaging are finalized.
- This spike does not bundle FFmpeg or fonts.
