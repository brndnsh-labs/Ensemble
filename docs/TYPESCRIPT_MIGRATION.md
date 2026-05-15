# TypeScript Migration Tracker

Ensemble is migrating from JSDoc-annotated JavaScript to TypeScript incrementally. Files are converted one at a time: rename `.js` → `.ts`, convert JSDoc `@typedef` to real TypeScript syntax, run `npm run typecheck` after each change.

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Converted to TypeScript |
| ⬜ | Pending |
| 🔄 | In Progress |

---

## Infrastructure ✅

- [x] `jsconfig.json` → `tsconfig.json`
- [x] `moduleResolution: "Bundler"` — `.js` imports resolve to `.ts` files; no import-path updates needed when renaming
- [x] `include` expanded to cover `**/*.ts` and `**/*.tsx`
- [x] `npm run typecheck` updated to `tsc -p tsconfig.json`

---

## Conversion Patterns

| JSDoc | TypeScript |
|-------|------------|
| `@typedef {Object} Foo` + `@property` blocks | `export interface Foo {}` |
| `@typedef {string \| number} Bar` | `export type Bar = string \| number` |
| `@typedef {import('./x.js').T}` | `import type { T } from './x.js'` at top |
| `@enum {string}` on a const object | `as const` + derive type if needed |
| `@param {Foo} x` / `@returns {Foo}` | TypeScript parameter/return types |
| `{any}` in JSDoc | `any` (keep for now; tighten incrementally) |
| `{Object}` for complex shapes | `Record<string, unknown>` or a dedicated interface |

---

## Phase 1: Type Definition Files ✅

These files contain only types — no runtime logic. Highest payoff per line changed.

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/types.ts` | 270 | ✅ | Central action/state types; 25 `@typedef` → interfaces; `ACTIONS as const`; `ActionType` derived |
| `public/ui-types.ts` | 13 | ✅ | Preact `ComponentChildren`, `StyleObject`, `SelectOption` |
| `public/worker-types.ts` | 42 | ✅ | `WORKER_MSG`/`WORKER_RESP` as const; `WorkerNote`, `NotesMessage` interfaces |

---

## Phase 2: Constants & Pure Data ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/constants.ts` | 11 | ✅ | `MODULES as const` |
| `public/engine/midi-constants.ts` | 30 | ✅ | `DRUM_MAP: Record<string, number>` |
| `public/data/instrument-styles.ts` | 55 | ✅ | `StyleEntry` interface; typed style arrays |
| `public/data/shortcut-config.ts` | 36 | ✅ | `ShortcutEntry` interface |

---

## Phase 3: Small Utilities ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/platform.ts` | 67 | ✅ | `PlatformState` interface; return types on all functions |
| `public/visualizer-utils.ts` | 70 | ✅ | `RingBuffer<T>` generic class; `INTERVAL_CATEGORY` typed |

---

## Phase 4: Small Modules (~40–100 lines) ⬜

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/history.js` | 46 | ⬜ | Direct state mutation — convert after state slices are typed |
| `public/engine/platform-orchestrator.js` | 30 | ⬜ | |
| `public/engine/worker-orchestrator.js` | 52 | ⬜ | |
| `public/engine/worker-buffer-manager.js` | 88 | ⬜ | |
| `public/engine/soloist-mode-policy.js` | 68 | ⬜ | |
| `public/utils/manual-metadata.js` | 93 | ⬜ | |
| `public/app-controller.js` | 63 | ⬜ | |
| `public/performance-controller.js` | 58 | ⬜ | |
| `public/pwa.js` | ~50 | ⬜ | |
| `public/ui-bridge.js` | 57 | ⬜ | |
| `public/state/conductor.js` | 54 | ⬜ | |
| `public/state/midi.js` | 66 | ⬜ | |
| `public/state/visualizer.js` | 29 | ⬜ | |

---

## Phase 5: Mid-size Modules (100–400 lines) ⬜

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/sharing.js` | ~120 | ⬜ | |
| `public/persistence.js` | ~150 | ⬜ | |
| `public/state/arranger.js` | ~111 | ⬜ | |
| `public/state/groove.js` | ~250 | ⬜ | |
| `public/state/playback.js` | 291 | ⬜ | `GlobalContext` has 50+ props; do after Phase 4 |
| `public/state.js` | 293 | ⬜ | Root state; depends on all slices |
| `public/worker-client.js` | 303 | ⬜ | Good JSDoc coverage already |
| `public/arranger-controller.js` | 304 | ⬜ | |
| `public/state/instruments.js` | 407 | ⬜ | Exports 4 state types used everywhere |
| `public/state-effects.js` | ~300 | ⬜ | |
| `public/state-hydration.js` | 497 | ⬜ | |
| `public/midi-controller.js` | 401 | ⬜ | Good JSDoc coverage already |
| `public/engine/coordination-engine.js` | 184 | ⬜ | |
| `public/engine/groove-engine.js` | 381 | ⬜ | |
| `public/engine/drum-seeder.js` | 348 | ⬜ | |
| `public/engine/chords-styles.js` | 358 | ⬜ | |
| `public/song-generator.js` | 301 | ⬜ | |
| `public/lead-sheet-model.js` | 474 | ⬜ | Good JSDoc coverage |
| `public/visualizer-events.js` | 365 | ⬜ | Good JSDoc coverage |

---

## Phase 6: Components (JSX → TSX) ⬜

Convert after Phase 5 state/engine types are settled.

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/App.jsx` | 49 | ⬜ | |
| `public/ui-root.jsx` | 48 | ⬜ | |
| `public/components/NotificationLayer.jsx` | 36 | ⬜ | |
| `public/components/PWAUpdateBanner.jsx` | 38 | ⬜ | |
| *(remaining components)* | — | ⬜ | Rename `.jsx` → `.tsx` |

---

## Phase 7: Large Engine Files (400+ lines) ⬜

Last — these are complex and depend on all types being settled.

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/engine/engine.js` | 471 | ⬜ | |
| `public/engine/tick-logic.js` | 538 | ⬜ | |
| `public/engine/conductor.js` | 553 | ⬜ | |
| `public/engine/bass-engine.js` | 692 | ⬜ | |
| `public/engine/harmonies.js` | 799 | ⬜ | |
| `public/engine/soloist-rhythm-engine.js` | 704 | ⬜ | |
| `public/engine/soloist-devices.js` | 749 | ⬜ | |
| `public/engine/midi-worker-logic.js` | 821 | ⬜ | |
| `public/utils.js` | 878 | ⬜ | |
| `public/visualizer-engine.js` | 885 | ⬜ | |
| `public/engine/bass-styles.js` | 952 | ⬜ | |
| `public/engine/synth-soloist.js` | 969 | ⬜ | |
| `public/engine/chords-engine.js` | 1057 | ⬜ | |
| `public/engine/soloist-config.js` | 1593 | ⬜ | |
| `public/engine/accompaniment.js` | 1835 | ⬜ | |
| `public/engine/soloist-seeder.js` | 2233 | ⬜ | Largest file; convert last |
| `public/logic-worker.js` | ~400 | ⬜ | Worker entry point |
| `public/visualizer-worker.js` | ~300 | ⬜ | Worker entry point |
| `public/main.js` | ~300 | ⬜ | App entry point; convert last |

---

## Notes for Future Sessions

- **Import paths stay `.js`** throughout the migration — `moduleResolution: Bundler` resolves them to the `.ts` source automatically.
- **`checkJs: true` stays on** until all `.js` files are converted; it keeps the remaining JS files type-checked.
- **`history.js`** accesses `arranger.history` via direct mutation (`// @direct-mutation` pattern); convert after `state/arranger.js` is typed so the array type is known.
- **State slices** (`state/*.js`) should all move in one session since `EnsembleState` in `types.ts` imports from all of them.
- **`tsConfig?: any`** in `StepInfo` — tighten once a proper time-signature config type is defined (likely in `engine/tick-logic` or `state/playback`).
