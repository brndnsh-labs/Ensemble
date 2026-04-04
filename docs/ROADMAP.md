# Roadmap

These are the current product and audio work streams, ordered by user-facing impact.

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

- Add new soloist sounds.
- Revisit synthesis for chords, bass, and harmony as separate design passes.
- Current audit note: the shared backing-bed interlock pass landed; Jazz chord body / low-mid is the next planned audit.

## 5. Dynamic Head simplification

- Look for ways to simplify the session seed / Dynamic Head logic.
- Prefer smaller helpers and clearer flow over more branching, while preserving the seeded head behavior.

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

## Notes

- The Dynamic Head refactor is the riskiest item because it is tightly coupled to seeded playback and export behavior.
- Audio synthesis changes should be checked against both live playback and export output.
