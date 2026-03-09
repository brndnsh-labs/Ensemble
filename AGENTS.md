# AI Agent Protocols for Ensemble

> **MANDATORY CHECKLIST FOR ALL AGENTS:**
> 1. **State Writes:** ALWAYS use `dispatch(ACTIONS.TYPE, payload)`. NEVER mutate `state` objects directly.
> 2. **UI Updates:** Check `public/components/` first. Use Preact components; avoid direct DOM manipulation.
> 3. **Testing:** Run `npm test` for logic AND `npm run test:e2e` for any UI changes.
> 4. **Visuals:** If UI changes are intentional, update baselines via `npm run test:e2e:update`.
> 5. **Refactoring:** Before moving code, `grep` the entire project for usages. Update imports immediately.

## 1. Refactoring & File Movements
**Context:** Recent refactors caused widespread `TypeError` failures because test imports were not updated when functions moved from `soloist.js` to `theory-scales.js`.

*   **Global Search is Mandatory:** Before moving a function or constant, you MUST search the **entire** codebase (including `tests/` and `scripts/`) for usages.
    *   *Command:* `grep -r "functionName" .`
*   **Update Imports Immediately:** Do not rely on IDE auto-imports. Manually verify and update import paths in all consuming files.
*   **Verify Exports:** Ensure the function is properly exported from its new location and that there are no circular dependency issues.

## 2. Testing Mandates
**Context:** Logic changes (e.g., Music Theory improvements) were committed without updating the corresponding test expectations, leading to "false positive" failures where the code was correct but the test was outdated.

*   **Run Tests BEFORE Committing:** Always run `npm test` after your changes.
    *   If tests fail, **diagnose** whether the Code is broken or the Test is outdated.
*   **Test Globals Enabled:** The test environment (Vitest) is configured with `globals: true`. You can use `describe`, `it`, and `expect` without importing them.
*   **Logic Changes require Test Updates:** If you intentionally improve logic (e.g., "Use Lydian instead of Major for Jazz"), you **MUST** update the test expectations to reflect this new behavior.
    *   *Do not* leave tests failing.
    *   *Do not* revert correct logic to satisfy an outdated test. Update the test.
*   **New Features need New Tests:** If adding a new style (e.g., `Country`), add a specific test case for it (e.g., in `genre-expansion.test.js`) to verify unique behaviors.

## 3. Musical Logic & Hardcoding
**Context:** Some tests failed because they expected hardcoded integer arrays (e.g., `[0, 2, 4, 5, 7, 9, 11]`) that didn't account for context-aware changes (like `bandIntensity` or `genreFeel`).

*   **Avoid Fragile Assertions:** When possible, test for *properties* (e.g., "contains a minor 3rd") rather than exact array equality, unless verifying a specific strict algorithm.
*   **Respect "Smart" Context:** Remember that functions like `getScaleForChord` behave differently based on `groove.genreFeel`. Ensure your test setup mocks this state correctly.

## 4. Modular Architecture & State
**Context:** The codebase has transitioned from monolithic "God Classes" to domain-specific controllers and state slices.

*   **Respect State Boundaries:** State is decomposed into `public/state/`. Use the corresponding slice (e.g., `playback`, `arranger`, `instruments`) for reads.
*   **Dispatch for Writes:** ALWAYS use `dispatch(ACTIONS.TYPE, payload)` for writes. Never modify state objects directly.
*   **Hybrid Controller Pattern:**
    *   **UI Reads:** Use `useEnsembleState` hook to read state reactively.
    *   **Simple Writes:** Use `dispatch(ACTIONS.SET_PARAM, ...)` for simple value updates.
    *   **Complex Actions:** For actions with audio side effects (e.g., `togglePlay`, `setBpm`), import the specific controller function (e.g., from `scheduler-core.js` or `app-controller.js`) instead of dispatching raw actions.

## 5. Final Verification
*   **Biome Check:** Run `npm run lint` to catch unused variables or formatting issues introduced during refactoring. Biome handles both linting and formatting in a single pass.
*   **Build:** Ensure the project builds/transpiles if applicable.
> 4. **State Integrity:** Verify that any changes to state schema are reflected in the domain slices in `public/state/`.
> 5. **Musical Coordination:** ALWAYS pass the `CoordinationContext` to instrument generators. In `logic-worker.js`, ensure all notes are processed through `enforceRegisterSlotting` to maintain the interactive register slots defined in `ENSEMBLE_COORDINATION.md`.

