# Ensemble Codebase Test Suite Audit

## 1. High-Risk Architecture & State Management
*   **Module:** `public/engine/coordination-engine.js` (`createCoordinationContext`, `enforceRegisterSlotting`)
    *   **Missing Tests:** **Unit**
    *   **Details:** `enforceRegisterSlotting` is critical for ensuring Bass, Chords, and Soloist do not overlap in frequency, preserving harmonic clarity. Currently, it is only implicitly tested in the `standards/ensemble-coordination.test.js` critique suite. It requires isolated unit tests to explicitly verify mathematical boundary clamping.
*   **Module:** `public/logic-worker.js` (The Generative Engine Core Loop)
    *   **Missing Tests:** **Integration**, **Perf**
    *   **Details:** The worker orchestrates lookahead messages and rhythmic simulation. While parts are covered by export logic tests, the core message parsing, coordination hydration, and loop stability under heavy load lack dedicated integration and performance benchmarking tests.
*   **Module:** `public/ui-bridge.js` (Hybrid Preact State Bridge)
    *   **Missing Tests:** **Integration**
    *   **Details:** The `useEnsembleState` hook is basic-tested in `reactivity.test.jsx`, but lacks deep integration tests for edge cases like listener memory leaks during rapid unmounts or multiple rapid state dispatches causing race conditions.
*   **Module:** `public/state/` (Reducers: `playback.js`, `arranger.js`, `groove.js`, `instruments.js`, `visualizer.js`, `midi.js`)
    *   **Missing Tests:** **Unit**
    *   **Details:** While state updates are implicitly tested via system tests, the reducers themselves lack exhaustive unit coverage for pure state transitions (especially bounds clamping and default fallback logic).

## 2. Music Theory & Generative Logic
*   **Module:** `public/theory-scales.js` (`getScaleForChord`)
    *   **Missing Tests:** **Unit**, **Standards**
    *   **Details:** This file is heavily mocked across the test suite (`analyze-*`, `soloist-*`, `harmonic-audit`). However, there is no dedicated unit test suite rigorously asserting that mathematically and musically correct scales are selected for specific chord qualities (e.g., Lydian over maj7#11, Altered over 7alt) based on `genreFeel` and intensity context.
*   **Area:** Generative Engine Critique Tests (`tests/standards/`)
    *   **Missing Tests:** **Standards**
    *   **Details:** Per `CRITIQUE_GUIDELINES.md`, the genres `Country`, `Hip Hop`, `Metal`, `Minimal`, and `Shred` are defined with target thresholds for melodic smoothness and note density, but they are entirely missing their required critique tests for Drums, Bass, and Harmony generators.

## 3. User Interface (Preact Components)
*   **Modules:** `AnalyzerModal.jsx`, `ChordVisualizer.jsx`, `EditorModal.jsx`, `InstrumentPanel.jsx`, `NotificationLayer.jsx`, `PWAUpdateBanner.jsx`, `Settings.jsx`, `SoloistSmartTab.jsx`, `StyleSelector.jsx`, `SymbolMenu.jsx`, `TemplatesModal.jsx`
    *   **Missing Tests:** **Unit**, **Integration**
    *   **Details:** These declarative UI components lack rendering, accessibility (a11y), and interaction tests via the Preact bridge.

## 4. Security Ledger Verification (`.jules/sentinel.md`)
*   **Area:** DOM Injection via `innerHTML` (2026-10-27)
    *   **Missing Tests:** **Unit**
    *   **Details:** While general XSS sanitization is tested in `hydration-security.test.js` and `data-integrity.test.js`, explicit unit tests asserting that components/visualizers use `textContent` instead of `innerHTML` for dynamic string injection (like chord symbols) are missing.
*   **Verified Areas:**
    *   State Hydration Validation & LocalStorage DoS: Tested in `hydration-security.test.js`.
    *   Client-Side File Export Sanitization: Tested in `midi-export.test.js`.
    *   Referrer Policy Enforcement & Inline Script Extraction: Verified architecturally in HTML files.

## Summary List Prioritized by Architectural Risk

1.  **[High Risk]** `public/engine/coordination-engine.js` (Missing **Unit** tests for `enforceRegisterSlotting`).
2.  **[High Risk]** `public/logic-worker.js` (Missing **Integration/Perf** tests for worker message handling and loop stability).
3.  **[High Risk]** `public/theory-scales.js` (Missing **Unit/Standards** tests for pure music theory correctness).
4.  **[High Risk]** `public/ui-bridge.js` (Missing **Integration** tests for memory leaks and race conditions).
5.  **[Medium Risk]** State Reducers in `public/state/` (Missing **Unit** tests for state transitions).
6.  **[Medium Risk]** Missing **Standards** critique tests for `Country`, `Hip Hop`, `Metal`, `Minimal`, and `Shred`.
7.  **[Low Risk]** Untested Preact UI Components (Missing **Unit/Integration** tests).
8.  **[Low Risk]** Explicit `innerHTML` DOM Injection tests (Missing **Unit** tests; implicitly covered but lacks explicit enforcement).
