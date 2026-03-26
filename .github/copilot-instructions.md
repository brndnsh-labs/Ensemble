# Copilot instructions for Ensemble

Before making broad changes, skim `AI_MAP.md` for file ownership and `AI.md` / `GEMINI.md` for the repo's architectural and state-management rules. Those files contain project-specific guidance that is more important here than generic JavaScript advice.

## Build, test, and lint commands

Ensemble is strictly `npm`-based. Use `npm install` and `npm run <script>`. Do not introduce `pnpm`, `yarn`, or `bun`, and do not create non-`package-lock.json` lockfiles.

Core commands:

```bash
npm run dev          # build dist/ with esbuild and serve it on http://localhost:5173
npm run build        # dry-run production-style bundle into dist/
npm run lint         # Biome lint + format check
npm run format       # Biome write fixes
npm run lint:docs    # repo-specific documentation validation
npm run typecheck    # TypeScript over JS/JSDoc
npm test             # mutation check + Biome + docs lint + full Vitest run
npm run test:e2e     # build dist/ and run Playwright
npm run validate     # typecheck + knip + jscpd + format + npm test
```

Targeted test commands:

```bash
npm test -- visualizer                              # pass a Vitest filename/name filter through the npm script
npm test -- standards/                              # run only standards/critique-oriented Vitest files
npx vitest run tests/standards/funk-bass-critique.test.js
npx vitest run tests/unit/engine/worker-client.test.js
npx vitest run tests/unit/engine/worker-client.test.js -t "specific test name"

npx playwright test tests/e2e/workspace-surfaces.spec.js
npx playwright test tests/e2e/arranger-mobile.spec.js --project="Mobile Chrome"
npx playwright test -g "@mobile"
```

Important local workflow detail: `npm run dev` is not a hot-reload Vite server. It runs `npm run build:quiet` and then serves the generated `dist/` bundle on port `5173`, so manual browser checks depend on the current built output.

## High-level architecture

Ensemble is a browser-based "virtual band" PWA built around a Preact UI, deep-signal state slices, a real-time logic worker for generative note creation, and a separate OffscreenCanvas worker for visual rendering.

### Bootstrap and app shell

- `public/main.js` is the orchestration entrypoint. It hydrates persisted/URL state first, validates the progression, mounts the Preact tree with `mountComponents()`, initializes the logic worker, and then subscribes state changes so `syncWorker()` and `handleEffects()` run on every dispatched action.
- Hydration must happen before mounting the UI. That ordering is intentional and prevents stale initial renders.
- `public/ui-root.jsx` mounts the root `App` inside an error boundary.
- `public/App.jsx` renders the four main workspaces (`arranger`, `studio`, `perform`, `visuals`), global transport, modals, notifications, and PWA banner.

### State and side effects

- `public/state.js` composes the app state from domain slices in `public/state/` (`playback`, `arranger`, `groove`, `instruments`, `midi`, `ui`, `visualizer`, `conductor`).
- Each slice is a `deepSignal`, so reducers mutate signal-backed objects directly, but app-level writes are still expected to flow through `dispatch(ACTIONS.*, payload)`.
- `public/ui-bridge.js` exposes `useEnsembleState()`. In components, reading a property inside the selector is what establishes reactivity; there is no legacy "version bump" model to maintain.
- `public/state-effects.js` owns the cross-module side effects that are intentionally kept out of reducers: playback start/stop, session seeding, drum preset loading, BPM side effects, theme/MIDI hydration, and toast/flash expirations.

### Generative engine pipeline

- `public/worker-client.js` is the main-thread bridge to `public/logic-worker.js`. It sends either a full raw snapshot (`getSyncState()`) or targeted deltas (`syncWorker(action, payload)`).
- `public/logic-worker.js` owns real-time note generation, buffer fills, resolution handling, and MIDI export orchestration. Worker state is reset/synced through the message types in `public/worker-types.js`.
- `public/engine/scheduler-core.js` is the real-time scheduler. It consumes worker-produced buffers, schedules WebAudio and MIDI, handles transport start/stop, and coordinates resolution endings.
- Timing-sensitive audio work is based on `playback.audio.currentTime`, not UI clocks.

### Visualizer pipeline

- The visualizer is intentionally off the main thread. `public/visualizer-proxy.js` owns the main-thread wrapper, and `public/visualizer-worker.js` runs `VisualizerEngine` with `OffscreenCanvas`.
- Clock sync is message-based: the main thread pushes audio time updates to the visualizer worker, which interpolates time locally for smoother rendering.
- The Visuals workspace is a dedicated surface, but its rendering path is still coupled to playback state and scheduled events rather than ad hoc DOM animation.

## Key conventions

- Use `dispatch(ACTIONS.TYPE, payload)` for state changes. Do not mutate state directly in components or controllers.
- The only routine exception to the no-mutation rule is performance-critical engine code, where direct mutation is allowed only when explicitly marked with `// @direct-mutation`.
- If a change affects worker-consumed state, it must go through the normal dispatch/sync path. If you add new worker-relevant state, update both `getSyncState()` / `syncWorker()` on the main thread and the worker's sync handling.
- For transport/audio behavior, reuse existing controller and scheduler entrypoints (`togglePlay`, `setBpm`, `loadDrumPreset`, etc.) instead of creating parallel side-effect paths.
- UI code should read state through `useEnsembleState()`, not by manually mirroring global state into component-local copies.
- `public/styles.css` is an import manifest, not a dumping ground. Add CSS rules to the owning file under `public/css/` instead of appending feature styles to the manifest.
- UI metadata and musical behavior are split deliberately: menu/category definitions live in `public/data/instrument-styles.js`, while the actual generative behavior lives in engine modules such as `public/engine/bass-styles.js`, `public/engine/chords-styles.js`, and `public/engine/grooves/`.
- Musical engine changes should preserve deterministic, seeded behavior where possible. Prefer bar/section/seed-driven motif generation over unstructured `Math.random()` so critique tests and looped playback stay coherent.
- When musical correctness and programmer convenience conflict, favor musicality: preserve groove, phrasing, voice-leading, and authentic feel instead of "clean" math that flattens the music.
- New or changed musical heuristics should keep explicit JSDoc and comments for intentional probabilities, offsets, and phrasing rules. This codebase treats "musical intent" as part of the implementation, not as disposable tuning noise.
- When changing musical engines, run the relevant critique/integrity test in `tests/standards/`, not just the broad suite.
- Playwright is split into desktop and mobile projects. Desktop excludes `@mobile`; the mobile project only runs `@mobile` tests. The Playwright config also injects `data-e2e-mode="true"` to stabilize test rendering.
