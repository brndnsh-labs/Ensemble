# Ensemble Test Suite

This directory contains the automated tests for the Ensemble application, powered by [Vitest](https://vitest.dev/).

## Structure

*   **`unit/`**: Tests for individual modules, functions, and logic.
    *   *Examples:* Music theory rules in `chords.js`, synthesis logic in `synth-*.js`, or isolated component logic.
    *   *Environment:* `happy-dom` (simulates browser APIs like `window`, `document`, `Canvas`).
*   **`integration/`**: Tests that verify the interaction between multiple modules or the full system lifecycle.
    *   *Examples:* "Song Creation to Playback" flows, Worker synchronization.
*   **`perf/`**: Performance benchmarks and stress tests.
    *   *Examples:* Measuring render loop times or high-frequency calculation overhead.
*   **`standards/`**: Musical validity checks.
    *   *Examples:* Ensuring generated bass lines adhere to genre rules (e.g., Reggae "One Drop") over thousands of measures.
    *   *Critique Tests:* Advanced statistical analysis of musical authenticity (e.g., Jazz Charleston frequency, Soloist melodic smoothness). See [Critique Guidelines](./standards/CRITIQUE_GUIDELINES.md) for details.
*   **`e2e/`**: Functional Smoke tests powered by [Playwright](https://playwright.dev/).
    *   *Examples:* Mobile header title visibility, Modal opening/closing, Performance Modal interaction.
    *   *Decision Matrix:*
        *   **Use Vitest** for structural logic, component state changes, and accessibility (A11y).
        *   **Use Playwright** for functional user flows, cross-browser behavior, and verifying that elements are visible and interactive.
        *   **Note:** We avoid pixel-perfect visual regression (snapshots) to prevent CI flakiness across different OS environments.

## Running Tests

### Run Core Suite (Vitest)
```bash
npm test
```

### Run Functional E2E Suite (Playwright)
```bash
# Requires local build (started automatically via npm run build:quiet)
npm run test:e2e
```

### Run Specific Tests
You can filter by filename or test name using the `--` argument:

```bash
# Run only visualizer tests
npm test -- visualizer

# Run only standards tests
npm test -- standards/
```

### Watch Mode
To run tests in watch mode (re-run on file change):
```bash
npx vitest
```

## Writing Tests

### Practice Reliability Acceptance

Musicality changes must preserve dependable practice backing (#1134). Use
`integration/practice-reliability.test.ts` for the fixed `PRACTICE_RELIABILITY` seed:
Rock at 118 BPM (`C | G`, then `Am | F`), Jazz at 138 BPM (`Dm7 | G7`, then
`Cmaj7 | Cmaj7`), and Blues at 120 BPM in 6/8 (`G7 | C7`, then
`Eb7#9 D7alt | G7`). Each scene runs two chart passes at intensity 0.7.

- Compare fresh event traces, not frozen pitch snapshots or identical successive
  choruses. The replay test varies ambient randomness after explicit seed creation;
  it does not claim seed-bootstrap independence from every global input.
- Check authored chord/section/loop boundaries and elapsed time, including the split
  6/8 bar. Anticipations may precede a chord change; chart ownership must not move.
- Keep disabled soloist/harmony lanes silent while bass, chords and drums continue.
  New responses must not automatically fill the human's reserved part. This does not
  freeze all existing mute-dependent voicing choices.
- Reuse `unit/engine/scheduler.test.ts` for live scheduling and mute seams,
  `unit/engine/section-practice-fold.test.ts` for drill wrapping,
  `standards/swing-ratio-audit.test.ts` and
  `standards/band-pocket-palette-critique.test.ts` for swing and bounded pocket,
  and `standards/generation-run-isolation-critique.test.ts` for detached render resets.
- Each musical issue names the applicable fixtures and its additional critique.
  Preserve existing idiomatic space; do not enforce an attack on every beat.
- Record a human play-along comparison with chart, seed, tempo, intensity, muted
  part and old/new build revisions. Can the player follow pulse, changes and arrivals
  without compensating for the band? Does their part still have room? Automated
  evidence does not establish subjective practice usability or replace a required
  pre-merge listening gate.

*   **Environment**: Most tests require a DOM environment. Add `// @vitest-environment happy-dom` to the top of your test file.
*   **Mocking**: Use `vi.mock()` to isolate dependencies, especially for global state (`public/state.ts`) or browser APIs (`AudioContext`).
*   **Canvas**: For visualizer tests, mock the Canvas API and `ResizeObserver` as `happy-dom` support for these is limited.
