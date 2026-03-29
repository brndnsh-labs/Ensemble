# Remaining Backlog

These are the open UI/system tasks left after the hi-hat, visualizer, and flaky-test work was completed.

## 1. Library redesign with filtering

- Redesign the progression library to make browsing and discovery easier.
- Add filtering and search so users can narrow progressions by mood, genre, complexity, or other useful tags.
- Preserve fast access to favorite or frequently used progressions.
- Keep the library workflow aligned with the arranger so discovery and insertion feel like one flow.

## 2. Mixer reverb defaults and auto-adjustment

- Done: reverb no longer changes itself with band intensity.
- The mixer now starts from fixed per-track defaults, and those values persist once the user edits them.
- The old feedback loop was rooted in conductor-side state mutation plus persisted auto-adjusted sends.

## Flaky tests

- `npm run validate` can still fail in the Vitest phase because of unrelated soloist benchmarks.
- Recent reruns bounced between `tests/unit/engine/soloist-modes.test.js`, `tests/integration/soloist-seeder-hook-shape.test.js`, and `tests/standards/blues-soloist-authenticity.test.js`.
- Those same three files passed when run individually and together, so the failure pattern looks suite-level and intermittent rather than a deterministic reverb regression.
- The failures were threshold-based and changed from run to run, so treat them as baseline instability rather than a mixer bug.
