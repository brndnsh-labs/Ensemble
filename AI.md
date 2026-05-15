# Ensemble AI Operational Protocols

This document is the primary operational guide for AI agents working on the Ensemble codebase. It consolidates architectural standards, refactoring rules, and musical logic principles to ensure stable and autonomous evolution.

## 0. Guide Hierarchy

*   **`AI.md`**: Source of truth for operational rules, guardrails, and contributor expectations.
*   **`AI_MAP.md`**: Navigation map for file ownership, entrypoints, and key exports.
*   **`docs/README.md`**: Documentation index for living guides, roadmap, and repo navigation.
*   **`.github/copilot-instructions.md`**: Concise GitHub Copilot CLI summary.
*   **Conflict rule:** If any guide drifts from live code or config, prefer the live code/config and update the docs.

## 1. Mandatory Checklist

> [!IMPORTANT]
> **Before every task, verify these five pillars:**
> 1. **State Writes:** ALWAYS use `dispatch(ACTIONS.TYPE, payload)`. NEVER mutate `state` objects directly.
> 2. **UI Updates:** Check `public/components/` first. Use Preact components; avoid direct DOM manipulation.
> 3. **Testing:** Run `npm test` (Logic) AND `npm run test:e2e` (UI) before concluding any task.
> 4. **Refactoring:** `grep` the entire project for usages before moving code. Update all imports immediately.

---

## 2. Core Protocols

### A. Infrastructure & Dependencies (STRICT MANDATE)
*   **Package Manager:** This project is **strictly npm-based**. Use `npm install` for dependencies and `npm run` for scripts.
*   **BANNED TOOLS:** **NEVER** use `pnpm`, `yarn`, or `bun`. If a sub-agent (like Jules) attempts to use these, it MUST be corrected immediately.
*   **Lockfile Integrity:** ALWAYS preserve `package-lock.json`. **NEVER** create or commit `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb`.
*   **Node.js Version:** Use the engine version specified in `package.json` (if any).

### B. Refactoring & File Movements
*   **Global Search is Mandatory:** Before moving a function or constant, search the **entire** codebase (including `tests/` and `scripts/`) for usages.
*   **Update Imports Immediately:** Do not rely on IDE auto-imports. Manually verify and update import paths in all consuming files.
*   **Verify Exports:** Ensure symbols are properly exported and check for circular dependencies.

### B. State Management (Signals-First)
*   **Domain Slices:** State is decomposed into `public/state/` (e.g., `playback.js`, `arranger.js`). Each slice is a **reactive deepSignal**.
*   **Writes**: ALWAYS use `dispatch(ACTIONS.TYPE, payload)`. This serves as the unified event bus for state updates and side effects (like Worker sync).
*   **Reactivity**: Use the `useEnsembleState` hook in `public/ui-bridge.ts` for component updates. Since the state uses `deepSignal`, accessing a property in the selector automatically subscribes the component to updates for that specific property.
*   **Styles & Configuration**: 
    *   **UI Metadata**: `public/data/instrument-styles.ts` defines names and categories for menus.
    *   **Generative Logic**: Modular style modules (e.g., `public/engine/bass-styles.js`) contain the actual musical algorithms.
*   **The @direct-mutation Exception**: Direct mutation of state objects is **strictly forbidden** in controllers (e.g., `public/app-controller.ts`) and UI components.
 It is **only allowed** in performance-critical engine code (e.g., `scheduler-core.js`, `synth-*.js`) for real-time audio parameters. These must be marked with a `// @direct-mutation` comment for transparency.
*   **Decoupling**: Avoid circular dependencies. Use **Inversion of Control (IoC)** for side effects (e.g., `state-effects.js` should not be imported by state slices; it should subscribe to state changes via `dispatch` event bus).
*   **Complex Actions**: For actions with audio side effects (e.g., `togglePlay`, `setBpm`), import the specific controller function from `app-controller.ts` or `scheduler-core.js` rather than dispatching raw actions.

### C. UI & Component Architecture
*   **Preact (v10):** All new UI logic must be encapsulated in functional components within `public/components/`.
*   **Animations:** Use CSS variables from `variables.css`. For exit animations (modals/toasts), use the lifecycle pattern:
    1.  Maintain a `shouldRender` state.
    2.  Apply a `.closing` class.
    3.  `setTimeout` to unmount after the CSS duration.
*   **Deterministic Selectors:** Prefer `data-testid="unique-id"` for Playwright/Vitest selectors over volatile CSS classes.

---

## 3. Musical Logic & Generative Standards

### A. The "Musical Intent" & Type Safety Rule
*   **Musical Intent**: In generative logic (bass, drums, soloist), always add JSDoc comments explaining **why** a specific probability or offset exists (e.g., `// 15% probability to add a 'ghost' note on step 14 for Jazz feel`). This prevents future agents from "optimizing" away intentional nuances.
*   **Type Safety**: Achieve project-wide type safety via **Hardened JSDoc**. All new state properties, reducer actions, and musical engine functions MUST include explicit JSDoc `@type`, `@param`, and `@returns` tags. Use the global interfaces defined in `public/types.ts` (e.g., `EnsembleState`, `StepInfo`) to ensure architectural consistency. ALWAYS run `npm run typecheck` before concluding a task.

### B. Deterministic Phrasing & Dynamic Head
*   **Dynamic Head (Soloist):** The soloist generates a session-wide "seed melody" (`soloist.sessionSeed`) at the start of playback. This melody uses **SRDC** (Statement, Restatement, Departure, Conclusion) structure. It features **Rhythmic Mirroring** (repeating rhythmic cells across measures) and **Leap-and-Fill** contour logic (balancing large jumps with stepwise returns) to ensure catchiness.
*   **Chorus Evolution (Hybrid Phrasing)**: Generative engines (especially Soloist) should look at `playback.currentLoopCount` and `SOLOIST_INTENTS` to evolve their performance:
    *   `Loop 0 (The Head)`: Adhere strictly to the "Head" (`sessionSeed`). Use `survivalProb = 1.0` to ensure no notes are skipped. Phrasing is driven by the seeder's SRDC structure and **Imperfect Symmetry** (30% motivic drift in cloned measures to avoid mechanical looping).
    *   `Loop 1 (Conversational)`: Shift to "Themed Improv." Start introducing pitch variation (jitter), **Gap-Fill Improvisation** (inserting generative notes between theme hits), and **Sequencing** (transposing seeded motifs). The "Effective Intensity" nudges up (+0.05) to naturally lift energy.
    *   `Loop 2+ (Exploratory)`: Transition to full generative performance. **Progressive Ornamentation** increases device probability (+20% per loop). "Fatigue Decay" shortens breaths (rests), and "Common Tone Reward" logic allows the soloist to intelligently "stick" to stable notes during chord changes for professional "pedal point" effects.
*   **Motifs:** Prioritize **Deterministic Motifs** (using `barIndex` or `sectionId` seeds) over raw `Math.random()`. This ensures structural cohesion and professional musical phrasing. Reference `getDrumMotif` in `groove-engine.js`.

### C. Naming, Canonicalization & Aliases
*   **One canonical name per concept:** Every musical concept, style, label, or preset must have one canonical internal name. UI labels may be friendlier or more descriptive, but state keys, config keys, persisted payloads, and code paths should normalize to the canonical form.
*   **Aliases belong to the owner:** Keep compatibility aliases in one place near the data or config that owns the concept. Do not scatter alias checks across components, tests, docs, and controllers.
*   **Search before rename:** Before changing a name, grep the entire repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for every usage. Update code, tests, persistence, sharing, docs, and allowlists in the same pass.
*   **Preserve compatibility:** If a rename touches saved sessions, share URLs, presets, or other serialized surfaces, keep a compatibility shim until old inputs are deliberately migrated.
*   **Split labels from logic:** Keep display labels in the UI/data layer and behavior keys in the engine/config layer. A pretty label should not silently become a runtime enum unless that is the intended canonical key.
*   **Style-family inventory:** For musical cleanup work, build a small alias matrix before broad edits. Known examples from this repo include `Rock`/`Shred` and `Neo-Soul`/`Neo`; add any newly discovered aliases to the same map instead of creating one-off fixes.
*   **Doc targets:** Use `docs/VISION.md` ("Open work") for the active cleanup item, `docs/guides/REFERENCE_TUNING.md` for concrete examples from tuning work, and `AI_MAP.md` only for navigation.

### D. Coordination & Register Slotting
Always pass the `CoordinationContext` to instrument generators. In `logic-worker.js`, ensure all notes are processed through `enforceRegisterSlotting` to maintain interactive register slots:
*   **Source of truth:** `public/engine/coordination-engine.ts`
*   **Bass:** 23–57
*   **Chords/Harmony:** 52–84
*   **Soloist:** Priority 60–90, but only clamp into that lane when a note would fall below MIDI 52.

## 4. Manual & Documentation

### A. The "Self-Building" Manual
Ensemble uses a hybrid manual (`public/MANUAL.md`) that combines hand-written task guides with auto-generated technical tables.
*   **Technical Appendix:** Placeholders like `{{GENRE_TABLE}}` and `{{BASS_STYLES}}` are automatically populated by `manual-metadata.ts`. Adding a new style to the JS config files will update these tables automatically.
*   **Task Guides:** If you add a major new feature (e.g., a new "Audio Workbench" tool), you **MUST** add a corresponding "Recipe" or "Pro-Tip" to the Markdown guide in `public/MANUAL.md`.
*   **Deep Links:** Maintain the "Style Gallery" in the manual. If you create a new signature genre, consider adding a deep link example (e.g., `index.html?genre=MyNewStyle`) to the gallery.

---

## 5. Testing & Verification

### A. Expert Critiques (Authenticity Audit)
*   **The Standard:** Critique tests in `tests/standards/` are the **Definition of Done** for musicality.
*   **Mandatory Run:** When modifying a musical engine (Bass, Drums, etc.), you **MUST** run the corresponding critique test (e.g., `npx vitest tests/standards/funk-bass-critique.test.js`).
*   **Musical Intent:** These tests use statistical ranges (e.g., "Snare drag should be > 0.010s"). Never replace these with rigid binary snapshots.
*   **Reporting:** Always check the "Critique Report" output in the console to ensure the feel is authentically balanced.

### B. Vitest (Logic & Unit)
*   **Globals Enabled:** `describe`, `it`, and `expect` are available globally.
*   **Mocking:** Use `vi.mock()` to isolate dependencies, especially for global state or browser APIs.
*   **Logic Updates:** If you intentionally change musical behavior, you **MUST** update the test expectations. Do not leave tests failing.

### B. Playwright (Functional E2E)
*   **Mobile-First:** Use the `@mobile` tag and verify at 390x844.
*   **Project Matrix:** Desktop Chrome, Mobile Chrome (`@mobile`), and Mobile Safari (`@ipad`).
*   **Functional Only:** We focus on functional smoke tests (visibility, interactions, state updates) rather than pixel-perfect snapshots to avoid cross-OS flakiness.
*   **Stabilization:** Use `data-e2e-mode="true"` to disable heavy animations during tests.

### C. Biome (Linting & Formatting)
*   **Single Pass:** Biome handles both linting and formatting.
*   **Standards:** 4-space indentation, single quotes, 100-character line width. Run `npm run format` before finishing.

---

## 6. AI-Friendly Best Practices

1.  **Fail Fast in Workers:** Validate payload shapes immediately when sending data to `logic-worker.js`.
2.  **No Magic Numbers:** Use CSS variables for all spacing and colors.
3.  **CSS Ownership:** Keep `public/styles.css` as an import manifest only. Put feature rules in the owning file under `public/css/` rather than adding ad hoc selectors to the entrypoint.
4.  **Inline Style Rule:** Keep inline styles only for runtime-calculated values (e.g. widths, dynamic grid templates, transition names). Move static presentation into semantic CSS classes.
5.  **Atomic State Changes:** Perform multiple related state updates in a single `dispatch` if possible.
6.  **Semantic Prop Names:** Name props after their domain (e.g., `isTransportVisible`) rather than visual state (`isBlue`).
