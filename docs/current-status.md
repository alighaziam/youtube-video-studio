# Current implementation status

Updated: 2026-11-19

## Implemented

| Capability | Status | Notes |
|---|---|---|
| React/TypeScript editor shell | Initial | RTL/LTR, scene list, inspector, responsive dark UI |
| Project persistence | Implemented | SQLite CRUD, autosave, duplicate with media copy, JSON document import/export, versioned ZIP backup/restore including source media with ID remapping, and named snapshots with restore/automatic pre-restore snapshot (30 retained per project) |
| Script-to-storyboard | Initial | Converts paragraphs/sentences to suggested scenes; editable title, type, duration and narration |
| Project media library | Initial | Frontend upload/list/delete; image previews; scene-level media references and image/video preview; backend MIME allowlist, 250 MB cap, project isolation, path confinement and file streaming |
| Local voice-over | Implemented | Optional Piper synthesis, browser microphone recording, local faster-whisper transcription, scene audio assignment, playback, and automatic duration probing; Piper/Whisper require user-installed engines and local licensed model files |
| MP4 audio mix | Implemented | FFmpeg supports per-scene trim start/end, linear gain, fade-in/fade-out, optional afftdn noise reduction, scene offsets, duration probing, and final audio-stream validation |
| Subtitle conversion | Implemented | SRT/VTT endpoints, editable narration page, SRT download, word preview |
| Publishing pack | Implemented | Draft titles, description, chapters, tags, thumbnail brief, and Markdown download |
| MP4 rendering | Initial | FFmpeg scene composition for attached media and layers; deterministic diagrams; 16:9/9:16 output; captions and voice processing; ffprobe validation; content-addressed scene checkpoints reused only after media validation |
| Capability detection | Implemented | FFmpeg, ffprobe, subtitles filter and libx264 checks |
| CI workflow | Verified on main | Main commit `c89fd651` passed on 2026-11-15: backend unit, integration and FFmpeg smoke pytest; frontend Vitest and production build |

## Known limitations

- Diagram choice is keyword-based and local. It is not a language model. Labels still need a human pass.
- The preview mirrors the encoder composition order: image/video media layers are composited first, then text/code/diagram overlays. Exact pixel parity for fonts, text metrics, and video decoding still needs visual regression coverage.
- Uploaded audio and browser-recorded WebM can be attached per scene. The editor displays a local waveform for supported files under 32 MB and supports trim, gain, fade-in/out, optional FFmpeg noise reduction, and local Whisper transcription when a model is configured. Automatic loudness normalization and phoneme-level caption alignment remain open.
- The timeline reorders scenes, resizes duration, and shows voice and word lanes. It does not split a clip or snap to a grid.
- Captions are readable word groups timed from the scene length, or from the probed voice length at render time. The caption block can sit at the lower edge, the middle, or the upper edge; preview and ASS use that same placement. There is no phoneme alignment.
- Render jobs are stored in SQLite with progress, cancel, and retry. Completed scene segments are cached by content fingerprint and revalidated with ffprobe before reuse across later jobs.
- ZIP backup/restore includes the editable document and source media; JSON export/import remains document-only. There is no brand kit or Whisper adapter. Persistent project snapshots are available (30 retained per project). One-command local launch scripts exist for Linux and Windows, but fresh-machine validation on both OSes remains open.
- Persian title and subtitle glyph shaping and reading order were visually inspected from a reproducible Linux CI MP4/frame artifact using the bundled font. Target-OS font QA and exact preview/export pixel parity remain open.
- Publishing stays a draft. The studio does not upload to YouTube or LinkedIn.

## Next implementation order

1. Timeline split/snap and cross-plane layer ordering so preview and FFmpeg output match.
2. Persistent version history and brand-kit support.
3. Optional local Whisper/noise-reduction adapters with explicit user-installed models.
4. Fresh-machine startup and packaging validation on Windows and Linux.
5. Loudness normalization and accessibility/performance hardening.

A phase is not complete merely because files are committed. It needs passing automated checks and a reproducible end-to-end verification.


## Semantic visual engine (2026-11-10)

- Scene title, narration and kind are inspected locally using deterministic keyword rules.
- The renderer selects labeled diagrams for event-driven messaging, API gateway routing, database access, modular monolith boundaries, microservices and authentication/request sequences.
- Diagram nodes and edge labels are rendered as static ASS text over FFmpeg vector geometry in both landscape and portrait profiles. Code and comparison scenes retain dedicated templates.
- No network request, paid API, generated stock art, zoom or pan is used. Semantic selection and layout need local runtime tests and visual review before being treated as production-verified.


## Editable diagram layer (2026-11-10)

- Each scene can store its own diagram model in the project document: node IDs, labels, X/Y percentage positions, edge labels and accent color.
- The inspector supports editing node text, moving nodes numerically, changing connection labels and accent color, adding/removing nodes, and resetting to the suggested semantic diagram.
- The editor preview reads the same saved scene diagram model. The FFmpeg renderer consumes that model for node positions, labels, connectors and accent color.
- Custom diagram data is bounded and sanitized on the rendering side (maximum 12 nodes, bounded coordinates and validated hex color). The feature remains static: no automatic zoom or pan.
- Automated tests cover custom diagram labels, positions, edge text and color. The renderer smoke suite runs in GitHub Actions; OS-specific visual review remains a separate gate.


## Multi-layer canvas (2026-11-10)

- Scenes can store independent image, video, text, code and diagram layer records in the existing project document; no database migration is needed.
- The editor provides layer creation, media assignment, visibility, deletion, z-order controls, percentage-based X/Y/width/height, opacity and editable text/code/diagram content.
- Layer transforms are percentage-based and are intended to remain stable across 16:9 and 9:16 output profiles. The canvas is static; there is no automatic zoom or pan.
- Frontend preview supports the layer stack. FFmpeg rendering normalizes layer metadata, draws visible text/code/diagram layers as timed ASS overlays, and composites image/video layers with scaled, opacity-aware overlays in z-order. The output remains static apart from intentionally supplied video media.
- The renderer composites media layers in z-order, then emits text/code/diagram layers in the top overlay plane. The editor preview now uses the same two-plane ordering. Pointer drag/resize is supported with canvas-bound clamping and pointer-cancel cleanup. Exact pixel parity for font metrics and video decode remains open.
- Regression coverage verifies diagram label splitting, custom geometry, multi-layer composition, and media validation. These tests execute in the current GitHub Actions workflow.
- The remaining visual limitation is cross-plane z-order parity: text/code/diagram overlays are still rendered in a top plane rather than interleaved with media layers.

## Verification checkpoint (2026-11-19)

- The `main` branch at this checkpoint includes the Persian render visual artifact, media-inclusive ZIP backup/restore, named project version history, browser microphone recording, waveform/trim/gain/fade controls, content-addressed render segment checkpoints, and one-command Linux/Windows launch scripts.
- GitHub Actions has passed backend unit/integration tests, FFmpeg smoke rendering, frontend unit tests/build, and CodeQL for these changes.
- The Persian Shorts sample was generated by CI and its rendered title/subtitle glyph shaping and reading order were visually inspected from the PNG artifact.
- The one-command Linux/Windows startup scripts are in the current documentation branch; CI checks Linux shell syntax. A clean install on actual Windows and Linux machines is still required.
- Exact font/video pixel parity, brand kit, and release packaging remain open. Timeline split/one-second snap, pointer drag/resize, local Whisper transcription, and optional noise reduction are implemented. A green CI run is not a claim of production readiness.
