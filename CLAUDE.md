# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Primary References

- `AI.md` — source of truth for architectural rules and contributor expectations
- `AI_MAP.md` — file ownership, entrypoints, and key exports
- `docs/README.md` — documentation index and living guides
- `docs/VISION.md` — product direction and roadmap context

When any guide conflicts with live code/config, prefer the live code and update the docs.

## Commands

```bash
npm run dev          # build dist/ and serve on http://localhost:5173 (not hot-reload)
npm run build        # dry-run production bundle into dist/
npm run lint         # Biome lint + format check
npm run format       # Biome write fixes
npm run typecheck    # TypeScript over JS/JSDoc
npm test             # mutation check + Biome + docs lint + full Vitest run
npm run test:e2e     # build dist/ and run Playwright
npm run validate     # full pipeline: typecheck + knip + jscpd + format + npm test
```

Targeted tests:

```bash
npm test -- visualizer                              # Vitest filename/name filter
npm test -- standards/                              # critique/standards tests only
npx vitest run tests/standards/funk-bass-critique.test.js
npx vitest run tests/unit/engine/worker-client.test.js -t "specific test name"

npx playwright test tests/e2e/workspace-surfaces.spec.js
npx playwright test tests/e2e/arranger-mobile.spec.js --project="Mobile Chrome"
npx playwright test -g "@ipad" --project="Mobile Safari"
npx playwright test -g "@mobile"
```

**Strictly npm-based.** Never use `pnpm`, `yarn`, or `bun`. Never create non-`package-lock.json` lockfiles.

## Architecture

Ensemble is a browser-based "virtual band" PWA: a Preact UI, deep-signal state slices, a real-time logic worker for generative note creation, and a separate OffscreenCanvas worker for visuals.

### Bootstrap (`public/main.js`)
Orchestration entrypoint. Hydrates persisted/URL state **before** mounting the Preact tree, then initializes the logic worker and subscribes state changes so `syncWorker()` and `handleEffects()` run on every dispatch. Hydration-before-mount order is intentional.

### State (`public/state/`, `public/ui-bridge.js`, `public/state-effects.js`)
- Domain slices: `playback`, `arranger`, `groove`, `instruments`, `midi`, `ui`, `visualizer`, `conductor` — each a `deepSignal`.
- **All writes go through `dispatch(ACTIONS.TYPE, payload)`.** Never mutate state directly in components or controllers.
- `useEnsembleState()` in `public/ui-bridge.js` — reading a property inside the selector establishes reactivity.
- `public/state-effects.js` owns cross-module side effects kept deliberately outside reducers.
- Exception: direct mutation is allowed only in performance-critical engine code explicitly marked `// @direct-mutation`.

### Generative Engine Pipeline (worker thread)
- `public/worker-client.js` — main-thread bridge; sends full snapshots (`getSyncState()`) or deltas (`syncWorker()`).
- `public/logic-worker.js` — orchestrates note generation, buffer fills, resolution handling, MIDI export.
- `public/engine/scheduler-core.js` — real-time scheduler consuming worker buffers; timing is based on `playback.audio.currentTime`, not UI clocks.
- Musical engines: `soloist.js`, `bass-engine.js`, `accompaniment.js`, `chords-engine.js`, `harmonies.js`, `grooves/` (15+ genre strategies).

### Visualizer Pipeline (separate OffscreenCanvas worker)
- `public/visualizer-proxy.js` — main-thread wrapper.
- `public/visualizer-worker.js` — `VisualizerEngine` with `OffscreenCanvas`.
- Clock sync is message-based; the worker interpolates time locally.

### UI (`public/components/`, `public/App.jsx`)
Currently four workspaces: Arranger, Studio, Perform, Visuals. **Active direction:** these are being replaced by a single chart-first surface where the chart is always visible and controls radiate outward from it. New UI work should move toward that model rather than extending the workspace tabs.

### Data / Config split
- UI metadata (menus, categories): `public/data/instrument-styles.js`
- Generative behavior: `public/engine/bass-styles.js`, `public/engine/chords-styles.js`, `public/engine/grooves/`
- `public/styles.css` is an import manifest only — put feature CSS in `public/css/`.

## Key Conventions

### Musical logic
- Prefer **deterministic, seeded motif generation** (`barIndex`, `sectionId`) over raw `Math.random()`. Keeps critique tests and looped playback coherent.
- Always add JSDoc explaining **why** a probability or offset exists. Musical intent is part of the implementation, not disposable tuning noise.
- When musical correctness and programmer convenience conflict, favor musicality.
- **Register slotting** (enforced via `public/engine/coordination-engine.js`): Bass 23–57, Chords/Harmony 52–84, Soloist priority 60–90 (clamp only when < MIDI 52). Always pass `CoordinationContext` to instrument generators.

### Dynamic Head / Chorus Evolution (Soloist)
The soloist generates a session-wide `sessionSeed` (SRDC structure) at playback start. Loop behavior:
- Loop 0: strict Head adherence, `survivalProb = 1.0`, Imperfect Symmetry (30% motivic drift).
- Loop 1: Themed Improv — pitch jitter, Gap-Fill, Sequencing, effective intensity +0.05.
- Loop 2+: Exploratory — Progressive Ornamentation (+20%/loop), Fatigue Decay, Common Tone Reward.

### TypeScript migration
The project currently uses JSDoc with `tsc` checking via `jsconfig.json`. A **gradual** TypeScript migration is planned — not a big-bang rewrite. New files and heavily-touched existing files should move toward explicit JSDoc `@type`, `@param`, and `@returns` tags using the global interfaces in `public/types.js`. Run `npm run typecheck` before concluding any task.

### Naming / Canonicalization
- One canonical internal name per concept. Aliases live near the data/config that owns the concept.
- Before any rename: `grep` the entire repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for every usage. Update code, tests, persistence, sharing, docs, and allowlists in the same pass.
- Preserve compatibility shims when a rename touches saved sessions, share URLs, or presets.

### Testing standards
- **Critique tests** (`tests/standards/`) are the Definition of Done for musicality. Run the relevant one whenever you change a musical engine. They use statistical ranges — never replace with rigid binary snapshots.
- Playwright: functional smoke tests only (no pixel-perfect snapshots). Three projects: Desktop Chrome, Mobile Chrome (`@mobile`, 390×844), Mobile Safari (`@ipad`). `data-e2e-mode="true"` disables heavy animations.
- Biome: 4-space indent, single quotes, 100-char line width. Run `npm run format` before finishing.

### Misc
- When adding worker-relevant state, update both `getSyncState()` / `syncWorker()` on the main thread and the worker's sync handling.
- For transport/audio behavior, reuse existing controller entrypoints (`togglePlay`, `setBpm`, `loadDrumPreset`) instead of creating parallel side-effect paths.
- Use `data-testid="unique-id"` for test selectors over volatile CSS classes.
- Inline styles only for runtime-calculated values; static presentation belongs in semantic CSS classes.
- Atomic state changes: batch related updates in a single `dispatch` where possible.

## Active Product Direction (from `docs/VISION.md`)

- **UI redesign:** Chart-first single surface replacing the four-workspace model. Chart always visible, controls always accessible without navigating away.
- **TypeScript migration:** Gradual. JSDoc + tsc today; `.ts`/`.tsx` files as the natural endpoint.
- **Cruft removal:** Lars mode and audio analyzer are slated for removal.
- **Synthesis quality:** Named ongoing investment — if something doesn't sound good, fix it.
- **URL sharing:** A marquee feature deserving more prominence, not a hidden option.
- **Musical engine is untouched to start** during the UI redesign phase — it is the core differentiator.
