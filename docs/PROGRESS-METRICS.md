# Standardized Progress Assessment

- Assessment date: 2026-11-19
- Assessed commit: `cc25f82eae095fe88e462c4a3f62aa914f493f57` on `main`
- Status: evidence-based baseline; category ratings are reviewer scores against the rubric below, not raw GitHub counters.
- Overall weighted score: **86.25%**

## Scoring rubric

| Dimension | Weight | Score | Weighted contribution |
|---|---:|---:|---:|
| Product capabilities (40%) | 85% | 34.00 |
| Tests and code quality (20%) | 90% | 18.00 |
| CI/CD and build (15%) | 100% | 15.00 |
| Security (10%) | 85% | 8.50 |
| Documentation (5%) | 95% | 4.75 |
| Deployment / production readiness (10%) | 60% | 6.00 |
| **Total** | **100%** | — | **86.25%** |

Formula: overall progress = sum(category score × category weight). A category score is based on implemented scope and its verification evidence. Documentation alone does not count as implementation. A green workflow proves only the checks included in that workflow; it does not prove production readiness.

## Evidence checked

`docs/current-status.md` and `docs/roadmap.md` document project/storyboard persistence, media, Piper/Whisper, FFmpeg rendering, captions, publishing-pack export and known limitations. CI and CodeQL passed 2026-11-19. PR #27 also verified the one-command startup flow on both Linux and Windows.

- Latest CI/build evidence: https://github.com/alighaziam/youtube-video-studio/actions/runs/44573287590
- Latest CodeQL/security workflow evidence: https://github.com/alighaziam/youtube-video-studio/actions/runs/44573287857

## Remaining release gates

Fresh-machine Piper model execution; preview/export pixel parity and typography/video visual regression; phoneme-level caption alignment and loudness normalization; accessibility/performance and release packaging. Publishing pack is exported but upload to YouTube/LinkedIn is not implemented.

## Rules for future updates

1. Recalculate the same six dimensions with the same weights; do not change the denominator between reports.
2. Mark a capability complete only when implementation exists and the relevant automated test or reproducible manual check passes.
3. Treat missing, skipped, or unavailable checks as unverified, never as passed.
4. Keep production-only integrations, external services, deployment validation and manual QA separate from local mocks/sandboxes.
5. Record the assessed commit SHA and link the exact workflow run used as evidence.
6. Update this file when evidence changes; do not infer progress from commit count.

This is a consistent engineering assessment baseline, not a claim that a single objectively exact percentage exists independent of the scoring rubric.


## Evidence-based reassessment — 23 November 2026

- Assessed commit: `eee8e260929dc634617055722e3d1a0c8ad47433` on `main`.
- Overall weighted score: **90.35%**.

| Dimension | Weight | Score | Weighted contribution |
|---|---:|---:|---:|
| Product capabilities | 40% | 90% | 36.00 |
| Tests and code quality | 20% | 95% | 19.00 |
| CI/CD and build | 15% | 100% | 15.00 |
| Security | 10% | 85% | 8.50 |
| Documentation | 5% | 97% | 4.85 |
| Deployment / production readiness | 10% | 70% | 7.00 |
| **Total** | **100%** | — | **90.35%** |

The score crosses the 90% target under the same six-dimension weighted rubric. Product capabilities increased for the newly covered editable vector-shape workflows and safer render-cache lifecycle; tests/code quality increased for regression coverage including actual FFmpeg output; deployment readiness increased for reproducible source packaging and its CI artifact. CI/CD remains capped at 100%; security remains 85% because production credential handling and external publishing are still unverified. The source ZIP is not a self-contained binary installer.

### Merged implementation evidence

- PR [#33](https://github.com/alighaziam/youtube-video-studio/pull/33): clean up browser-recorded WebM audio when deleting a project; regression test covers both filesystem and database cleanup. Post-merge CI [45118466141](https://github.com/alighaziam/youtube-video-studio/actions/runs/45118466141) and CodeQL [45118466063](https://github.com/alighaziam/youtube-video-studio/actions/runs/45118466063) passed.
- PR [#34](https://github.com/alighaziam/youtube-video-studio/pull/34): 30-day / 2 GiB LRU render-checkpoint retention and stale temporary-file cleanup; deterministic tests cover age and size eviction. PR-head CI [45118766024](https://github.com/alighaziam/youtube-video-studio/actions/runs/45118766024) and CodeQL [45118766165](https://github.com/alighaziam/youtube-video-studio/actions/runs/45118766165) passed.
- PR [#35](https://github.com/alighaziam/youtube-video-studio/pull/35): deterministic source ZIP with SHA-256 manifest, secret/runtime exclusions, reproducibility tests, and CI artifact. PR-head CI [45119277968](https://github.com/alighaziam/youtube-video-studio/actions/runs/45119277968) and CodeQL [45119277880](https://github.com/alighaziam/youtube-video-studio/actions/runs/45119277880) passed.
- PR [#37](https://github.com/alighaziam/youtube-video-studio/pull/37): editable rectangle and ellipse layers, preview/export rendering, inspector controls, validation, and real FFmpeg smoke coverage. PR-head CI [45119843476](https://github.com/alighaziam/youtube-video-studio/actions/runs/45119843476) and CodeQL [45119843465](https://github.com/alighaziam/youtube-video-studio/actions/runs/45119843465) passed.
- PR [#38](https://github.com/alighaziam/youtube-video-studio/pull/38): line and arrow vector layers, preview/export rendering, and real FFmpeg coverage for all four shape types. Post-merge CI [45120487027](https://github.com/alighaziam/youtube-video-studio/actions/runs/45120487027) and CodeQL [45120487002](https://github.com/alighaziam/youtube-video-studio/actions/runs/45120487002) passed on the assessed main commit.

### Remaining non-substitutable release gates

- SVG import/layers and exact preview/export parity for typography and video decoding.
- Phoneme-level caption alignment and accessibility/performance validation.
- Fresh-machine manual Windows/Linux installation and actual Piper execution with a locally installed licensed voice model.
- Real YouTube/LinkedIn upload remains unimplemented; publishing-pack export is not platform publishing.
- The source archive is source-only and requires Python, Node/npm, FFmpeg, and optional local voice models. It is not an installer or a release deployment.
- External services and production environments remain unverified.

This repository is now above the portfolio's 90% target by the agreed weighted rubric, but the listed release gates remain open and must not be described as complete.

## Latest merged increment — 19 November 2026

- PR #27 merged as `cc25f82eae095fe88e462c4a3f62aa914f493f57`.
- Linux and Windows one-command startup smoke checks passed; backend unit/integration and FFmpeg smoke tests passed; frontend unit tests/build passed.
- CodeQL passed on the PR head. The Persian subtitle visual sample was generated and uploaded as the `persian-subtitle-visual-sample` CI artifact.
- Direct Linux launch now runs Vite without the npm wrapper and the smoke-test cleanup uses a catchable TERM signal to avoid leaving background processes behind.
- Production readiness remains limited by real Piper execution, full fresh-machine manual validation, visual parity, accessibility/performance, and release packaging.


## Latest merged increment — 20 November 2026

- PR #29 merged after CI and CodeQL passed on head `1730ceceb0aa8f83852d46cc05a7e526c44c2ba8`.
- FFmpeg narration mastering applies `loudnorm` targeting -16 LUFS integrated loudness, -1.5 dBTP true peak, and 11 LU loudness range. Contract tests cover the filter configuration; validation with diverse real-world narration inputs remains a release gate.


## Latest merged increment — Windows startup smoke cleanup — 20 November 2026

- PR #30 merged as `59a9c88c72b762ea3023d1edf491f02d48ae78a9` from exact head `f36b55508085198abd8ca74d4d1f0943896df1a2`.
- The Windows smoke-test cleanup now tolerates an already-exited child process and suppresses the benign `taskkill` message instead of turning a successful API/UI readiness check into a CI failure.
- YouTube Video Studio CI run 44715453485 passed Windows startup smoke, backend unit/integration and FFmpeg smoke tests, frontend tests/build; CodeQL run 44715453391 passed JavaScript/TypeScript, Python and Actions analyses on the exact PR head.
- This fixes the false-negative cleanup failure only; fresh-machine manual Windows validation and real Piper model execution remain separate release gates. No overall score increase is claimed.

## Daily repository audit — 20 November 2026

- Audited default branch main at b492dffa83a960219cdf8c5caace3d3fe18f2db6.
- Latest YouTube Video Studio CI: [run 44716241024](https://github.com/alighaziam/youtube-video-studio/actions/runs/44716241024) — passed.
- Latest CodeQL: [run 44716240822](https://github.com/alighaziam/youtube-video-studio/actions/runs/44716240822) — passed.
- No open pull requests were found. PR #30 (Windows smoke cleanup false-failure) and the earlier startup verification PR #27 are merged; do not repeat those fixes.
- Loudness normalization, project backup/version history, scene split/checkpoint work and Persian subtitle artifact work are already represented in merged history.
- No progress percentage is changed. Fresh-machine Piper model execution, diverse narration validation, preview/export visual parity, subtitle timing/visual regression, accessibility/performance and release packaging remain open gates. Publishing to YouTube/LinkedIn is not claimed as implemented.
- The hourly PR Guardian source uses explicit repository context and strict merge gates; scheduled post-update confirmation remains in progress.
