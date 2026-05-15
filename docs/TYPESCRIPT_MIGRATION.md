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

## Phase 4: Small Modules (~40–100 lines) ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/engine/platform-orchestrator.ts` | 30 | ✅ | |
| `public/engine/worker-orchestrator.ts` | 52 | ✅ | `WorkerContext` interface; `EnsembleState` import |
| `public/engine/worker-buffer-manager.ts` | 88 | ✅ | |
| `public/engine/soloist-mode-policy.ts` | 68 | ✅ | `Record<string,string>` alias map; TS cast for return |
| `public/utils/manual-metadata.ts` | 93 | ✅ | `StyleEntry[]` param; `SMART_GENRES` cast to `any` (untyped source) |
| `public/app-controller.ts` | 63 | ✅ | `viz?: any` (visualizer types not settled yet) |
| `public/performance-controller.ts` | 58 | ✅ | |
| `public/pwa.ts` | ~50 | ✅ | `deferredPrompt: any`; `triggerInstall(): Promise<boolean>` |
| `public/ui-bridge.ts` | 57 | ✅ | Generic `useEnsembleState<T>`; `useDispatch` return typed |
| `public/history.ts` | 46 | ✅ | `undo(refreshArrangerUI?: () => void)` |
| `public/state/conductor.ts` | 54 | ✅ | `ConductorState` interface |
| `public/state/midi.ts` | 66 | ✅ | `MidiOutput` + `MidiState` interfaces |
| `public/state/visualizer.ts` | 29 | ✅ | `VisualizerState` interface |

> **Note:** All state slices (including Phase 5 ones) were converted in this same session — see below.

---

## Phase 5: Mid-size Modules (100–400 lines) ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/visualizer-events.ts` | 365 | ✅ | `VisualizerTrackId` union; 4 event interfaces; generic `queueVisualizerEvent<T>` |
| `public/engine/coordination-engine.ts` | 184 | ✅ | `StepInfo` import type; `createCoordinationContext` returns inferred object |
| `public/song-generator.ts` | 301 | ✅ | `STRUCTURES/PROGRESSIONS` as `Record<string, ...>`; `GeneratedSection` interface |
| `public/lead-sheet-model.ts` | 474 | ✅ | Local `Density`/`Viewport` type aliases; `LEAD_SHEET_FIT_ROW_BUDGET` typed |
| `public/state.ts` | 293 | ✅ | `dispatch` overloads on `ActionPayloadMap`; `StateMap = EnsembleState` compat alias |
| `public/persistence.ts` | 111 | ✅ | `saveTimeout: ReturnType<typeof setTimeout>` |
| `public/sharing.ts` | 122 | ✅ | `ShareOptions` interface; typed `generateShareUrl` |
| `public/worker-client.ts` | 303 | ✅ | `declare const WORKER_PATH: string`; typed handler callbacks |
| `public/midi-controller.ts` | 401 | ✅ | `Map<string, {id, endTime}>` for note-offs; `MidiState` import type |
| `public/engine/chords-styles.ts` | 358 | ✅ | `EnsembleState` param; `safeExtensions: Record<string, number[]>` |
| `public/engine/drum-seeder.ts` | 348 | ✅ | `OrchestrationMapEntry`, `FillMapEntry`, `AccentCatch` exported interfaces |
| `public/engine/groove-engine.ts` | 381 | ✅ | `strategies: Record<string, any>`; `binarySearchMap` return annotated `: any` |
| `public/state-hydration.ts` | 497 | ✅ | `(TIME_SIGNATURES as any)` casts; `clamp`/`normalizeSoloistPreset` typed |
| `public/state-effects.ts` | 196 | ✅ | `EnsembleState` param; `handleEffects` typed |
| `public/arranger-controller.ts` | 304 | ✅ | `NOTE_MATCH_PATTERN` moved after imports; `isMusicalNotation` inner fn typed |
| `public/state/arranger.ts` | ~111 | ✅ | `Section` + `ArrangerState` interfaces; pulled forward with state slices |
| `public/state/groove.ts` | ~250 | ✅ | `Instrument`, `PocketState`, `GrooveState`; `grooveReducer` takes `GlobalContext` |
| `public/state/playback.ts` | 291 | ✅ | `GlobalContext` (50+ props); circular `import type` with `types.ts` is fine |
| `public/state/instruments.ts` | 407 | ✅ | `ChordState`, `BassState`, `SoloistState`, `HarmonyState`; `responseMode`/`responseSource` tightened |

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
- **State slices are done.** All `state/*.ts` files are converted; `EnsembleState` in `types.ts` now has real type imports.
- **`tsConfig?: any`** in `StepInfo` — tighten once a proper time-signature config type is defined (likely in `engine/tick-logic` or `state/playback`).
- **`responseMode`/`responseSource`** in `SoloistPhraseContext` are typed as narrow unions — if new values appear in engine files, expand the union rather than widening to `string`.
- **`let responseSource`** in `engine/soloist.js` line 628 has a `@type` JSDoc narrowing it to the union — update when that file is converted.
