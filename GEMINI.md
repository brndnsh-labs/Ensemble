# Ensemble: Technical Context & Instructions

## 🚨 CRITICAL: Infrastructure Mandates
*   **Package Manager**: This project **ONLY** uses `npm`. **NEVER** use `pnpm`, `yarn`, or `bun`.
*   **Lockfiles**: ONLY `package-lock.json` is allowed. **DO NOT** create or commit `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb`.
*   **Scripts**: Always use `npm run <script>` (e.g., `npm run validate`).

Ensemble is a high-performance Progressive Web App (PWA) designed for generative musical accompaniment and chord visualization. It utilizes a "Virtual Band" engine to provide real-time, intensity-aware backing tracks.

## Project Overview

*   **Architecture**: Modular ES6 architecture with domain-specific controllers (`app`, `arranger`, `instrument`, `ui`, `midi`) and specialized musical engines (`bass`, `soloist`, `accompaniment`, `harmonies`, `fills`). Core logic is modularized into high-precision scheduling (`scheduler-core.js`), visual rendering (`visualizer.js`), and decentralized synthesis (`synth-*.js`).
*   **State Architecture**: **Domain Slices Pattern**. State is decomposed into autonomous modules within `public/state/`. Cross-module side effects are managed via **Inversion of Control (IoC)** in `state-effects.js`.
*   **UI Layer**: **Preact (v10)** Component-Based Architecture. Logic is decentralized into functional components within `public/components/`.
*   **Visualizer**: High-performance **OffscreenCanvas** implementation. The rendering engine (`VisualizerEngine`) runs in a dedicated background worker (`visualizer-worker.js`), ensuring 60fps visual stability independent of main thread UI load. Synchronized via high-precision interpolation.
*   **State Bridge**: `public/ui-bridge.js` exports `useEnsembleState` for reactive component updates. It uses a `version` counter to force re-renders since the underlying engine state is mutated via `Object.assign`.
*   **Initialization**: `public/main.js` orchestrates hydration, worker setup, and root mounting (`ui-root.jsx`). Hydration and parsing MUST happen before mounting to prevent stale UI state.
*   **Domain Controllers**: Specialized logic resides in `app-controller.js`, `instrument-controller.js`, `arranger-controller.js`, and `midi-controller.js`.
*   `types.js`: Centralized `ACTIONS` constants for the state dispatch system.
*   **Engine Architecture**:
    *   `soloist.js`: Main entry for melodic generation. Delegates to `soloist-pitch-engine.js` and `soloist-rhythm-engine.js` for phasing and pitch selection.
    *   `bass-engine.js` / `accompaniment.js`: Orchestrators for rhythm section generation.
    *   `*-styles.js`: Dedicated modules (`bass-styles.js`, `chords-styles.js`) housing genre-specific algorithms and rhythmic patterns.
    *   `logic-worker.js`: Background thread orchestrator for all real-time generative logic.
*   **State Access**: Read state through the `useEnsembleState` hook in components, or the exported state objects in engine code. **NEVER** modify state objects directly in components. Use `dispatch(ACTIONS.ACTION_TYPE, payload)` from `state.js` using constants from `types.js` to trigger updates.
*   **Precision Timing**: Use `playback.audio.currentTime` for all audio scheduling. Visual events should be pushed to `playback.drawQueue` for synchronization in `requestAnimationFrame` loop.
*   **Worker Sync**: State updates that affect engine logic (genre, intensity, chords) are automatically synced to the worker via the `subscribe` mechanism in `main.js`. Use `syncWorker(action, payload)` for explicit delta-based updates.

## Navigation Map

To navigate the codebase efficiently, refer to these specialized guides:

*   **[AI_MAP.md](AI_MAP.md)**: Granular mapping of file responsibilities and key exports. Start here for codebase discovery.
*   **[AI.md](AI.md)**: Operational protocols, state management rules, and "Musical Intent" coding standards.
*   **[docs/guides/](docs/guides/)**: Deep-dives into musical coordination, worker contracts, and velocity tuning.
*   **[docs/archive/](docs/archive/)**: Historical reports and completed architectural plans.
...
*   **Atomic Commits**: STRICTLY avoid "kitchen sink" commits. Break tasks into granular steps:
    1.  **Refactor**: Clean up or restructure code *without* changing behavior. Commit.
    2.  **Implementation**: Add the new feature or fix the bug. Commit.
    3.  **Verification**: Add tests or update documentation. Commit.
    *   *Example*: Do not combine "Biome Setup" (tooling) with "Fix Bass Logic" (bugfix). These must be separate commits.

## Definition of Done (Mandatory)
Before concluding any task, an agent MUST:
1.  **Run `npm run validate`** and ensure all checks pass (Type Safety, State Integrity, Biome Linting/Formatting, and 1,000+ tests).
2.  **Run `npm run test:e2e`** if UI changes were made, ensuring no visual regressions occur.
3.  **Update Visual Snapshots:** If style changes were intentional, run `npm run test:e2e:update` to establish new baselines.
4.  Verify that no NEW direct state mutations were introduced (check the `npm test` output).
5.  Fix any new linting warnings or architectural regressions.

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
14. **Virtual Band Authenticity Audit (v2.6)**: COMPLETED comprehensive implementation of 32+ expert critique suites covering all genres. Refined all rhythm sections (Drums, Bass, Accompaniment) to meet pro-level benchmarks for rhythmic pocket, harmonic resolution, and stylistic phrasing. Established a **Unified Timing Grid (v2)** with weighted loping swing and genre-specific micro-timing (Dilla lag, Reggae lay-back, Punk rush).
15. **Soloist Engine Simplification (v2.7)**: COMPLETED drastic reduction of heuristic complexity. Removed SRDC state machine and motif memory in favor of a predictable, intensity-driven phrasing model. Implemented dynamic register centering and intensity-based register ceilings for better melodic control.
16. **Unified Rhythmic Parity (v2.8)**: COMPLETED project-wide refactor to ensure full behavioral parity between live playback and MIDI exports. Enhanced `getStepInfo` with comprehensive semantic timing flags. Generalized all drum strategies (Rock, Jazz, Latin, Reggae) to be fully meter-aware using reliable time signature configurations. Consolidated 900+ tests to verify rhythmic integrity across all formats.
17. **Musical Coordination Contract (v2.9)**: COMPLETED implementation of interactive band logic using a centralized `CoordinationContext`. Established strict register slotting (Bass: 28-51, Chords: 52-84, Soloist: 60-90) enforced by a "Musical Firewall" middleware. Integrated rhythmic yielding where Bass locks to Kick and Chords yield density to Soloist. Verified with property-based fuzz tests.
18. **Lean Bundle & Architectural Refinement (v2.30)**: COMPLETED comprehensive optimization of the codebase. Reduced initial JS bundle size by 60% via lazy-loading modals. Modularized static data into `public/data/` and consolidated WebAudio boilerplate into `synth-utils.js`. Established `UIControls.jsx` shared library and purged hundreds of lines of redundant inline styles.
19. **Core Infrastructure & Test Integrity (v2.31)**: COMPLETED major architectural remediation. Implemented **State Slices Pattern** for all domain state. Resolved circular dependencies in core state/effects using **Inversion of Control (IoC)**. Decoupled engine from global state. Reached **89% project-wide test coverage** milestone including 100% coverage for all primary controllers. Verified with 1,300+ tests.
20. **Visualizer Refactor (v2.32)**: COMPLETED migration of the canvas rendering engine to a Preact-based component architecture. Decoupled `UnifiedVisualizer` from the global `playback` state and high-precision scheduling loop.
21. **High-Performance Offscreen Visualizer (v2.33)**: COMPLETED implementation of `OffscreenCanvas` architecture. Moved `VisualizerEngine` to a dedicated Web Worker (`visualizer-worker.js`), achieving thread-isolated 60fps rendering. Implemented high-precision clock synchronization via interpolated `postMessage` bridge. Reduced main-thread Jank by 90% during heavy UI transitions. Verified with updated unit and system smoke tests.
22. **TypeScript & JSDoc Type Hardening (v2.34)**: COMPLETED project-wide remediation of 2,300+ TypeScript errors. Hardened global interfaces (`EnsembleState`, `StepInfo`, `ChordContext`) and added strict JSDoc typing to all domain slices, reducers, and musical engine functions. Integrated `npm run typecheck` into the mandatory validation pipeline to prevent future regressions.

## Codebase Health

*   **Maintainability Score**: 99/100 (Exceptional).
*   **Test Coverage**: 89.04% (Logic & UI).
*   **Infrastructure**: Fully consolidated Biome (Linting/Formatting), TypeScript/JSDoc (Type Safety), Size-Limit (Performance), and Dependency-Cruiser (Architecture).




