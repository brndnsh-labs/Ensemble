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

- Let the maximized lead-sheet view stretch vertically.
- Use the extra room to increase font size and improve legibility.

## 4. Audio identity refresh

- Add new soloist sounds.
- Revisit synthesis for chords, bass, and harmony as separate design passes.

## 5. Dynamic Head simplification

- Look for ways to simplify the session seed / Dynamic Head logic.
- Prefer smaller helpers and clearer flow over more branching, while preserving the seeded head behavior.

## 6. Progression library discovery

- Keep the library redesign moving toward better browsing and discovery.
- Add filtering and search by mood, genre, complexity, and favorites.
- Preserve quick access to frequently used progressions.

## 7. Rendered-audio ensemble audit follow-up

- Pair the new symbolic `npm run ensemble:report` audit with a slower rendered-audio pass so we can catch issues that only show up once the synths, timing offsets, and mix interact.
- Reuse `scripts/mix-report.js` rather than creating a second browser/render harness. Prefer a JSON or JSONL output mode, or extract shared render/analyze helpers if that keeps the contract cleaner.
- Keep the rendered pass machine-readable and seed-aware:
  - accept a small multi-seed sample
  - focus on a compact scene/preset set rather than exhaustive sweeps
  - let the symbolic audit shortlist interesting seeds before we pay the render cost
- Candidate rendered metrics:
  - RMS / crest balance
  - transient spike rate
  - spectral probe bands
  - schedule overlap / voice pressure
  - per-stem comparisons for drums, bass, chords, harmony, and full mix
- Goal: explain when a performance looks structurally sound in symbolic analysis but still feels wrong once rendered through the actual audio path.
- Progress:
  - symbolic full-band audit shipped as `npm run ensemble:report`
  - first behavior-tuning pass landed on tension-class bars, with harmony now yielding more often on cadence / altered-dominant pressure

## Notes

- The Dynamic Head refactor is the riskiest item because it is tightly coupled to seeded playback and export behavior.
- Audio synthesis changes should be checked against both live playback and export output.
