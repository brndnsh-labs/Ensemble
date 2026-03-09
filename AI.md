# Ensemble AI Operational Protocols

This document is the primary operational guide for AI agents working on the Ensemble codebase. It consolidates architectural standards, refactoring rules, and musical logic principles to ensure stable and autonomous evolution.

## 1. Mandatory Checklist

> [!IMPORTANT]
> **Before every task, verify these five pillars:**
> 1. **State Writes:** ALWAYS use `dispatch(ACTIONS.TYPE, payload)`. NEVER mutate `state` objects directly.
> 2. **UI Updates:** Check `public/components/` first. Use Preact components; avoid direct DOM manipulation.
> 3. **Testing:** Run `npm test` (Logic) AND `npm run test:e2e` (UI) before concluding any task.
> 4. **Visuals:** If UI changes are intentional, update baselines via `npm run test:e2e:update`.
> 5. **Refactoring:** `grep` the entire project for usages before moving code. Update all imports immediately.

---

## 2. Core Protocols

### A. Refactoring & File Movements
*   **Global Search is Mandatory:** Before moving a function or constant, search the **entire** codebase (including `tests/` and `scripts/`) for usages.
*   **Update Imports Immediately:** Do not rely on IDE auto-imports. Manually verify and update import paths in all consuming files.
*   **Verify Exports:** Ensure symbols are properly exported and check for circular dependencies.

### B. State Management (Redux-ish)
*   **Domain Slices:** State is decomposed into `public/state/` (e.g., `playback.js`, `arranger.js`).
*   **Writes:** ALWAYS use `dispatch(ACTIONS.TYPE, payload)`.
*   **Hybrid Bridge:** Use the `useEnsembleState` hook in `public/ui-bridge.js` for reactive component updates.
*   **Complex Actions:** For actions with audio side effects (e.g., `togglePlay`, `setBpm`), import the specific controller function from `app-controller.js` or `scheduler-core.js` rather than dispatching raw actions.

### C. UI & Component Architecture
*   **Preact (v10):** All new UI logic must be encapsulated in functional components within `public/components/`.
*   **Animations:** Use CSS variables from `variables.css`. For exit animations (modals/toasts), use the lifecycle pattern:
    1.  Maintain a `shouldRender` state.
    2.  Apply a `.closing` class.
    3.  `setTimeout` to unmount after the CSS duration.
*   **Deterministic Selectors:** Prefer `data-testid="unique-id"` for Playwright/Vitest selectors over volatile CSS classes.

---

## 3. Musical Logic & Generative Standards

### A. The "Musical Intent" Rule
In generative logic (bass, drums, soloist), always add JSDoc comments explaining **why** a specific probability or offset exists (e.g., `// 15% probability to add a 'ghost' note on step 14 for Jazz feel`). This prevents future agents from "optimizing" away intentional nuances.

### B. Deterministic Phrasing
Prioritize **Deterministic Motifs** (using `barIndex` or `sectionId` seeds) over raw `Math.random()`. This ensures structural cohesion and professional musical phrasing. Reference `getDrumMotif` in `groove-engine.js`.

### C. Coordination & Register Slotting
Always pass the `CoordinationContext` to instrument generators. In `logic-worker.js`, ensure all notes are processed through `enforceRegisterSlotting` to maintain interactive register slots:
*   **Bass:** 28–51
*   **Chords:** 52–84
*   **Soloist:** 60–90

---

## 4. Testing & Verification

### A. Vitest (Logic & Unit)
*   **Globals Enabled:** `describe`, `it`, and `expect` are available globally.
*   **Mocking:** Use `vi.mock()` to isolate dependencies, especially for global state or browser APIs.
*   **Logic Updates:** If you intentionally change musical behavior, you **MUST** update the test expectations. Do not leave tests failing.

### B. Playwright (Visual & E2E)
*   **Mobile-First:** Use the `@mobile` tag and verify at 390x844.
*   **Snapshots:** Review `diff.png` if tests fail. Only run `npm run test:e2e:update` if the change was intentional.

### C. Biome (Linting & Formatting)
*   **Single Pass:** Biome handles both linting and formatting.
*   **Standards:** 4-space indentation, single quotes, 100-character line width. Run `npm run format` before finishing.

---

## 5. AI-Friendly Best Practices

1.  **Fail Fast in Workers:** Validate payload shapes immediately when sending data to `logic-worker.js`.
2.  **No Magic Numbers:** Use CSS variables for all spacing and colors.
3.  **Atomic State Changes:** Perform multiple related state updates in a single `dispatch` if possible.
4.  **Semantic Prop Names:** Name props after their domain (e.g., `isTransportVisible`) rather than visual state (`isBlue`).
