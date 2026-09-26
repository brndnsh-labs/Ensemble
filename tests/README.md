# Ensemble Test Suite

This directory contains the automated tests for the Ensemble application, powered by [Vitest](https://vitest.dev/). The band engine's own tests live beside it in `band/` (its critique claims and invariant suite — see `band/CLAUDE.md`); the old engine's critique suite was deleted with it (#1404).

## Structure

*   **`unit/`**: Tests for individual modules, functions, and logic.
    *   *Examples:* Music theory rules in `chords.js`, synthesis logic in `synth-*.js`, or isolated component logic.
    *   *Environment:* `happy-dom` (simulates browser APIs like `window`, `document`, `Canvas`).
*   **`integration/`**: Tests that verify the interaction between multiple modules.
*   **`standards/`**: Genre and routing guards (the 13-genre canon, soloist style routing), plus the
    [Critique Guidelines](./standards/CRITIQUE_GUIDELINES.md) the band's claims follow.
*   **`browser/`**: Vitest browser mode (real Chromium, and WebKit for the sync suite) for what
    needs a real `OfflineAudioContext` or IndexedDB — `npm run test:browser`, `npm run test:sync`.
*   **End-to-end UI tests** live with the app: `prototypes/v2/checks/` (Playwright), gated in CI
    by `v2-checks`. We avoid pixel-perfect visual regression (snapshots) to prevent CI flakiness
    across different OS environments.

## Running Tests

### Run Core Suite (Vitest)
```bash
npm test
```

### Run the app's end-to-end suite (Playwright)
```bash
npm run build --prefix prototypes/v2
npm run test:e2e --prefix prototypes/v2
```

### Run Specific Tests
You can filter by filename or test name using the `--` argument:

```bash
# Run only the songbook codec tests
npm run test:vitest -- songbook/

# Run the band engine's critique claims
npm run test:vitest -- band/test/critique.test.ts
```

### Watch Mode
To run tests in watch mode (re-run on file change):
```bash
npx vitest
```

## Writing Tests

Musicality changes must preserve dependable practice backing (#1134): check authored chord,
section and loop boundaries, keep a muted part silent while the rest of the band plays on, and
leave the player's part room. The band's claims and invariant suite are where these live now
(`band/test/`). Automated evidence does not establish subjective practice usability or replace a
required pre-merge listening gate: record a human play-along comparison (chart, seed, tempo,
intensity, muted part, old/new build) before merging a musical change.
