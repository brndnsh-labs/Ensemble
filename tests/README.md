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

*   **Environment**: Most tests require a DOM environment. Add `// @vitest-environment happy-dom` to the top of your test file.
*   **Mocking**: Use `vi.mock()` to isolate dependencies, especially for global state (`public/state.ts`) or browser APIs (`AudioContext`).
*   **Canvas**: For visualizer tests, mock the Canvas API and `ResizeObserver` as `happy-dom` support for these is limited.
