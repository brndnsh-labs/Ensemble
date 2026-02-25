# Ensemble: Technical Context & Instructions

Ensemble is a high-performance Progressive Web App (PWA) designed for generative musical accompaniment and chord visualization. It utilizes a "Virtual Band" engine to provide real-time, intensity-aware backing tracks.

## Project Overview

*   **Architecture**: Modular ES6 architecture with domain-specific controllers (`app`, `arranger`, `instrument`, `ui`, `midi`) and specialized musical engines (`bass`, `soloist`, `accompaniment`, `harmonies`, `fills`). Core logic is modularized into high-precision scheduling (`scheduler-core.js`), visual rendering (`visualizer.js`), and decentralized synthesis (`synth-*.js`).
*   **UI Layer**: **Preact (v10)** Component-Based Architecture. Logic is decentralized into functional components within `public/components/`.
*   **State Bridge**: `public/ui-bridge.js` exports `useEnsembleState` for reactive component updates. It uses a `version` counter to force re-renders since the underlying engine state is mutated via `Object.assign`.
*   **Initialization**: `public/main.js` orchestrates hydration, worker setup, and root mounting (`ui-root.jsx`). Hydration and parsing MUST happen before mounting to prevent stale UI state.
*   `ui-controller.js`: Orchestrates top-level legacy events and bridges components with non-reactive DOM elements.
*   `ui.js`: Exports a registry of DOM elements used by secondary controllers and legacy logic.
*   `types.js`: Centralized `ACTIONS` constants for the state dispatch system.
...
*   **State Access**: Read state through the `useEnsembleState` hook in components, or the exported state objects in engine code. **NEVER** modify state objects directly in components. Use `dispatch(ACTIONS.ACTION_TYPE, payload)` from `state.js` using constants from `types.js` to trigger updates.
*   **Precision Timing**: Use `playback.audio.currentTime` for all audio scheduling. Visual events should be pushed to `playback.drawQueue` for synchronization in `requestAnimationFrame` loop.
*   **Worker Sync**: State updates that affect engine logic (genre, intensity, chords) are automatically synced to the worker via the `subscribe` mechanism in `main.js`. Use `syncWorker(action, payload)` for explicit delta-based updates.
...
*   **Atomic Commits**: STRICTLY avoid "kitchen sink" commits. Break tasks into granular steps:
    1.  **Refactor**: Clean up or restructure code *without* changing behavior. Commit.
    2.  **Implementation**: Add the new feature or fix the bug. Commit.
    3.  **Verification**: Add tests or update documentation. Commit.
    *   *Example*: Do not combine "Biome Setup" (tooling) with "Fix Bass Logic" (bugfix). These must be separate commits.

## Definition of Done (Mandatory)
Before concluding any task, an agent MUST:
1.  Run `npm test` and ensure all checks pass (State Integrity, Biome Linting/Formatting, and 700+ tests).
2.  Verify that no NEW direct state mutations were introduced (check the `npm test` output).
3.  Fix any new linting warnings or architectural regressions.

*   **Branch Management**: Do NOT delete feature branches until the user has confirmed the implementation works as expected in the UI or through integration tests. Always verify behavior before merging and deleting.

## Roadmap & Future Goals

The project has completed the **v2.29 Codebase Health & Standards Audit**, achieving high architectural modularity, performance resilience, and production-grade linting via Biome.

1.  **Soloist Engine (v2.0)**: COMPLETED implementation of advanced melodic devices (Enclosures, Quartal Harmony) and tension-building logic.
2.  **Bass Engine (v2.1)**: COMPLETED chromatic walking logic, "Slap & Pop" synthesis for Funk, and micro-timing (Dilla feel) for Neo-Soul.
3.  **Accompaniment Engine**: COMPLETED "Expressive Phrasing" for Rock/Pop/Acoustic and conversational "Call & Response" logic.
4.  **Authenticity Verification**: COMPLETED expansion of the probabilistic testing suite with integration tests for congestion, continuity, and velocity normalization.
5.  **Standards & Linting (v2.29)**: COMPLETED project-wide Biome configuration and resolved all engine regressions. Verified 719 tests passing.
6.  **Harmony Module (v2.3)**: COMPLETED implementation of intelligent background engine with "Stabs" and "Pads" styles, motif memory, and soloist-aware phrasing.
7.  **Latin/Bossa Percussion**: COMPLETED expansion of procedural percussion synthesis (Shakers/Agogo/Guiro) for Latin styles to complement the existing Bossa kit.
8.  **Reference-Driven Tuning**: Calibrating velocity maps and timing offsets against classic genre recordings to achieve a "pro-level" musical feel.
9.  **Melody Harmonizer (v2.4)**: COMPLETED implementation of monophonic audio analysis and symbolic "Loop-Back Training" for melody-driven chord generation. Unified into the Audio Workbench UI.
10. **Test Suite Cleanup**: COMPLETED removal of redundant multi-key integration tests (`autumn-leaves-multikey.test.js`) in favor of centralized harmony logic tests, improving CI cycle time.
11. **Ska-Punk Smart Genre**: COMPLETED implementation of high-energy Ska-Punk style with upstroke-heavy accompaniment, fast melodic walking bass, and punchy horn section hooks. Optimized for high-BPM stability.
12. **Unified Infrastructure**: COMPLETED transition from ESLint to Biome for blazing-fast, consolidated linting and formatting. Verified 100% build stability.
13. **Drum Motif Engine (v2.5)**: COMPLETED implementation of deterministic, measure-based motif system across all genres. Replaced per-step random probability with cohesive rhythmic patterns (e.g., Charleston for Jazz, Linear for Funk, One Drop for Reggae). Added context-aware phrase turnarounds for structural drum fills. Verified with 9 new integrity suites.

