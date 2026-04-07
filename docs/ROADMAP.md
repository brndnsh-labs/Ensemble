# Roadmap

These are the current product and audio work streams, ordered by user-facing impact.

Open work items:
- Audio identity refresh
- Naming conventions cleanup

## 1. Resolution balance fix

- Status: Done (2026-04-02)
- Summary: Final resolution velocities softened so final notes blend with preceding material in both live playback and MIDI export.
- Commits: b6249ac — "Flatten resolution cadence: soften final-note velocities and add regression tests"
- Tests: Regression tests added; full repo validation (npm run validate) passed.
- Notes: Export uses precomputed n.midiVelocity; fix implemented in generateResolutionNotes so live and export match. Consider a subjective DAW check or an optional UI preference to tune resolution intensity.

## 2. Studio workspace polish

- Status: Done (2026-04-02)
- Summary: Container-aware two-column Live Mix using a mobile-derived fixed card width (~20rem / 320px). Tightened mixer and settings surfaces for denser, consistent per-instrument controls. Playwright E2E updated to assert two-column layout.
- Commits: 190c7db9 — "Studio workspace polish: container-aware two-column Live Mix, tightened mixer/settings surfaces, updated E2E tests"
- Tests: Full validation (npm run validate) passed; Playwright E2E (tests/e2e/workspace-surfaces.spec.js) passed locally.
- Notes: Uses CSS container queries; consider adding a graceful fallback for older browsers if needed.

## 3. Arranger readability pass

- Status: Done (2026-04-03)
- Summary: Maximized lead-sheet mode now reclaims the global header area, adds an in-chart start/stop + exit toolbar, and uses the extra height to enlarge chord cards and typography across representative charts.
- Commits: 6b97050f — "Arranger readability pass: maximize arranger layout, in-chart playback toolbar" (branch `arranger-readability-pass`)
- Tests: Full validation (`npm run validate`) passed; full Playwright E2E (`npm run test:e2e`) passed. Arranger coverage now checks maximized readability and playback access across Autumn Leaves, All The Things You Are, Pop (Standard), and Jazz Blues.
- Notes: The layout profile now reserves space for the compact maximized controls instead of a full header, so dense charts stay guided while short charts stretch further on both desktop and mobile.

## 4. Audio identity refresh

- Status: Active
- Completed so far: the shared backing-bed interlock pass, the unity-default hidden-trim pass, the Jazz chord-body / low-mid retune, the soloist/harmony headroom nudge, and the headroom-neutral chord/harmony rebalance.
- Remaining: add new soloist sounds, then revisit chords/bass/harmony synthesis only if the next audit turns up a new outlier.
- Current audit note: keep using the existing rendered/symbolic audit flow for any follow-up tuning instead of reopening the global default-mix sweep.

## 5. Dynamic Head follow-through

- Status: Done (2026-04-07)
- Summary: Added cross-loop form-arc recall, style-aware `'form'` response handling, motif-reinforcing later-loop devices, and audit coverage that keeps Rock/Shred straight while letting Jazz/Bird/Blues/Neo-Soul/Bossa converse across longer arcs.
- Commits: Implemented on branch `dynamic-head-follow-through`.
- Tests: Focused Dynamic Head integration suite, soloist rhythm/device unit tests, and relevant soloist standards/authenticity suites passed; `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Notes: Rock/Shred remains the regression-protected control lane. The audit helpers now score structural phrase skeletons and last-sounding section cadences so decorative aftershocks do not skew musical readouts.

## 6. Progression library discovery

- Status: Done (2026-04-03)
- Summary: The arranger Progression Library is now search-first, with genre filters, pinned favorites, recent picks, richer preset cards, opaque sticky shelves for cross-browser legibility, and a compact full-bleed mobile sheet across built-in and user presets.
- Commits: Implemented on branch `arranger-library-redesign-plan` and ready to merge.
- Tests: Full validation (`npm run validate`) passed; full Playwright E2E (`npm run test:e2e`) passed. PresetLibrary unit coverage and arranger desktop/mobile E2E now exercise search, genre filters, favorites, and recents.
- Notes: Explicit mood/complexity tagging was intentionally deferred, but the library view model and UI affordances are ready for that later metadata pass without reworking the current discovery flow. The mobile modal now trades frosted-glass chrome for a denser, scroll-efficient layout.

## 7. Rendered-audio ensemble audit follow-up

- Status: Done (2026-04-04)
- Summary: `npm run mix:report` now emits machine-readable JSON/JSONL, supports compact multi-seed rendered sweeps with scene filters, and can rerender `ensemble:report` focus seeds through the existing Playwright/offline-audio harness.
- Commits: Implemented on branch `rendered-audio-audit-followup`.
- Tests: Focused reporting-script coverage now exercises symbolic/rendered contracts; full validation (`npm run validate`) and full Playwright E2E (`npm run test:e2e`) passed.
- Notes:
  - `ensemble:report` now includes a reusable `renderScene` payload plus JSONL `focus` rows so the rendered pass can reconstruct the audited scene instead of reusing the seed in an unrelated preset.
  - `mix:report` still reuses `scripts/mix-report.js` and the existing dist + browser/offline-audio harness rather than introducing a second renderer.
  - The rendered audit stays backing-band focused for per-stem comparisons across drums, bass, chords, harmony, and the full mix, while using the symbolic audit to decide which seeds are worth the slower render pass.
  - The reporting flow enabled the broad cross-genre sweep above and should stay in place for the next genre-specific audit passes.

## 8. Naming conventions cleanup

- Status: Active
- Summary: Standardize canonical names across code, docs, tests, configs, and persisted surfaces so one concept has one internal key and a documented alias map.
- Why now: The recent Dynamic Head work exposed how much time alias pairs and mixed naming burn in tuning and audit work. `Rock`/`Shred` and `Neo-Soul`/`Neo` are the obvious examples, but the cleanup should inventory the whole repo before renaming anything.
- Scope:
  - Build a naming inventory across `public/`, `tests/`, `scripts/`, `docs/`, and `.github/`.
  - Decide canonical internal names vs user-facing labels for genres, styles, instrument labels, preset IDs, and audit/report terminology.
  - Centralize alias resolution in the owning config or normalization helper instead of scattering string checks through components and tests.
  - Update persistence/share/hydration surfaces together so old links and saved sessions keep working.
  - Align docs (`AI.md`, `docs/guides/REFERENCE_TUNING.md`, and this roadmap entry) with the canonical vocabulary used in code.
- Guardrails:
  - Do not change musical behavior as a side effect of renaming.
  - Preserve compatibility shims until old inputs are explicitly migrated.
  - Keep display labels readable; only make them canonical when the runtime keys need to change.
- References:
  - `AI.md` -> "Naming, Canonicalization & Aliases"
  - `docs/guides/REFERENCE_TUNING.md` -> concrete tuning examples and alias lessons
  - `AI_MAP.md` -> navigation only, not naming authority
- Completion criteria:
  - A single canonical vocabulary is documented and used in runtime keys.
  - Alias handling lives in one place per domain.
  - Regression tests cover canonical and alias inputs.
  - Legacy labels are removed from active code paths, while compatibility remains where needed.

## Notes

- Audio identity refresh work is still the riskiest item because it is tightly coupled to the rendered mix and instrument synthesis.
- Audio synthesis changes should be checked against both live playback and export output.
