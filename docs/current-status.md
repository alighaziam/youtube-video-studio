# Current implementation status

Updated: 2026-11-10

## Implemented

| Capability | Status | Notes |
|---|---|---|
| React/TypeScript editor shell | Initial | RTL/LTR, scene list, inspector, responsive dark UI |
| Project persistence | Implemented | SQLite CRUD API; scene edits autosave through REST |
| Script-to-storyboard | Initial | Converts paragraphs/sentences to suggested scenes; editable title, type, duration and narration |
| Project media library | Initial | Frontend upload/list/delete; image previews; scene-level media references and image/video preview; backend MIME allowlist, 250 MB cap, project isolation, path confinement and file streaming |
| Local voice-over | Initial | Piper voice catalog, one-action script → storyboard → per-scene WAV synthesis → MP4 render, scene audio references, audio preview and voice track; requires user-installed engine and licensed models |
| MP4 audio mix | Initial | FFmpeg mixes generated scene narration at scene offsets, extends scene timing when narration exceeds its planned duration, and validates the final MP4 |
| Subtitle conversion | Implemented | SRT/VTT parsing and export endpoints; full editor/preview not complete |
| Publishing pack | Initial | Draft titles, description, chapters, tags and thumbnail brief |
| MP4 rendering | Initial | FFmpeg scene composition for attached images/videos and deterministic static layouts for architecture/code/comparison scenes; timed title/caption overlays, narration mix, 16:9 and 9:16 profiles, ffprobe validation and download |
| Capability detection | Implemented | FFmpeg, ffprobe, subtitles filter and libx264 checks |
| CI workflow | Configured | Backend pytest and frontend TypeScript/Vite build; recent GitHub Actions runs reported startup_failure without creating jobs, so latest CI result is not verified |

## Known limitations

- Rendering composes one attached image/video as each scene's visual background and adds static template geometry for architecture, code and comparison scene types. It is not yet a multi-layer canvas compositor.
- The preview remains a sample composition and is not WYSIWYG.
- Scene image/video attachments are composed into the exported MP4 with contain-to-fill crop. Arbitrary uploaded audio assets are not yet mixed; only generated voice-over clips are mixed.
- Timeline is a visual placeholder: no clip trimming, splitting, dragging, snapping, or multi-track editing.
- Browser microphone recording, external audio import, waveform editing, trimming, noise reduction and loudness normalization are not implemented. Generated Piper voice-overs are mixed into MP4; arbitrary audio assets are not yet mixed.
- Sentence-level captions are split into readable chunks and timed proportionally by word count; this is approximate timing, not phoneme/word alignment. Subtitle editor, style controls, preview overlay and Persian visual QA are incomplete.
- Render jobs are in-memory; process restart loses job status. Persistent queue, progress streaming, cancellation and segment retry are not implemented.
- Undo/redo, crash recovery, version history, templates/brand kit, local Whisper adapter, and Windows/Linux packaging remain outstanding.
- Persian glyph shaping still requires visual inspection on a supported machine; no pixel-parity claim is made.

## Next implementation order

1. Add a multi-layer scene canvas for separate image/video, code, SVG and diagram layers with explicit transforms and no automatic movement/zoom.
3. Replace the placeholder timeline with editable multi-track clips and scene timing controls.
4. Add audio recording/import, waveform editing, mixdown, normalization and audio mux.
5. Complete caption editing, styling, overlay preview and verified Persian shaping.
6. Persist render jobs and add progress, cancellation, retry and output validation.
7. Add optional local speech-to-text, improve voice selection/preview and add audio recording/import/editing with model/license guidance.
8. Add recovery/versioning, backup/export, packaging and end-to-end installation checks.

A phase is not complete merely because files are committed. It needs passing automated checks and a reproducible end-to-end verification.
