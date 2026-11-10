# UX and Visual System

## Product shell
Use a dark, low-glare workspace with restrained accent color. It should feel like a focused creator tool, not a generic dashboard. Avoid decorative motion and controls that shift layout unexpectedly.

## Main navigation
- Home / Recent Projects
- Create Video
- Brand & Templates
- Assets
- Render Queue
- Settings

## Editor layout
- Top bar: project name, save state, undo/redo, preview profile, export.
- Left rail: scenes, assets, templates, script, captions, audio.
- Center: fixed-aspect preview canvas with safe-area overlays and editor-only viewport zoom.
- Right inspector: selected scene/layer properties; Design, Motion, Audio, Timing.
- Bottom panel: scene strip in MVP; expandable timeline with waveform and caption lanes in the next milestone.

The canvas preserves aspect ratio. Resizing the app window must not alter composition coordinates.

## First-run experience
Detect OS/architecture, FFmpeg and filters/encoders, Python/backend health, optional fonts, and writable project/render directories. Show exact install instructions for missing capabilities. Missing Whisper, RNNoise, or TTS must not block basic slide editing.

## Create-project flow
Offer three starts: Educational explainer (default), Code walkthrough, Architecture / system-design diagram. Ask for title, language, aspect ratio, and target duration; allow optional fields to be skipped.

## Scene types
- Title / chapter opener
- Concept explanation
- Two-column comparison
- Code walkthrough
- Architecture diagram
- Step-by-step process
- Quote / key takeaway
- Recap / CTA

Templates contain editable named placeholders, not flattened screenshots.

## Motion model
Motion is explicit and opt-in. MVP presets: fade, directional slide, text-line reveal, code-line highlight, connector draw, crossfade. Static is the default. Never apply automatic camera movement to still images, backgrounds, code panels, or diagrams. Editor viewport zoom is not part of rendered composition.

## Brand system
Brand kit contains primary/secondary colors, surfaces, heading/body font stacks, logo/watermark, caption preset, intro/outro, lower-third, and CTA presets. Provide a neutral technology theme.

## Internationalization
Persian-first interface with English switch. Full RTL for Persian UI and LTR for English. Text direction is stored per text layer. Mixed-direction text isolates English terms, URLs, and code. Never reverse strings to fake RTL.
