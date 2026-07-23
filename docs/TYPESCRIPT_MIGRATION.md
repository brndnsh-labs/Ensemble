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
| `public/state.ts` | 293 | ✅ | `dispatch` overloads on `ActionPayloadMap`; `StateMap = EnsembleState` compat alias (retired 2026-07, #1172) |
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

## Phase 6: Components (JSX → TSX) ✅

All 28 Preact component files renamed `.jsx` → `.tsx` and converted to TypeScript. `moduleResolution: Bundler` resolves `.jsx` imports to `.tsx` automatically — no import paths updated.

**Batch A — tiny (< 50 lines):**

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/components/NotificationLayer.tsx` | 36 | ✅ | `useState<any[]>` for notifications |
| `public/components/PWAUpdateBanner.tsx` | 38 | ✅ | |
| `public/ui-root.tsx` | 48 | ✅ | `ErrorBoundary extends Component<{children}, {errored}>` |
| `public/App.tsx` | 49 | ✅ | `interface AppProps` |

**Batch B — small (50–130 lines):**

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/components/MobileActionBar.tsx` | 73 | ✅ | |
| `public/components/SymbolMenu.tsx` | 74 | ✅ | `const SYMBOLS: string[]`; `Record<string, string>` |
| `public/components/GlobalShortcuts.tsx` | 77 | ✅ | `(e: KeyboardEvent)` |
| `public/components/VisualizerOverlay.tsx` | 83 | ✅ | |
| `public/components/SoloistControls.tsx` | 83 | ✅ | `mode: string \| number` to satisfy ButtonGroup |
| `public/components/Modals.tsx` | 93 | ✅ | `ComponentType<object>` |
| `public/components/LibraryModal.tsx` | 102 | ✅ | `useRef<HTMLDivElement \| null>` |
| `public/components/Transport.tsx` | 105 | ✅ | `useState<string \| null>(null)` |
| `public/components/ManualModal.tsx` | 125 | ✅ | `simpleMarkdown(text: string): string` |
| `public/components/Arranger.tsx` | 128 | ✅ | `import type { Section }`; `useRef<Record<string, any>>` |

**Batch C — medium (130–300 lines):**

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/components/ChartSurface.tsx` | 177 | ✅ | |
| `public/components/UIControls.tsx` | 246 | ✅ | All 6 components with prop interfaces |
| `public/components/ToolbarPopover.tsx` | 256 | ✅ | `ToolbarPopoverRenderContext`; `useState<StyleObject \| undefined>` |
| `public/components/KeySignatureControls.tsx` | 272 | ✅ | `Record<string, number[][]>` grouping |

**Batch D — large (300+ lines):**

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/components/ShareModal.tsx` | 304 | ✅ | |
| `public/components/EditorModal.tsx` | 321 | ✅ | Module-level `getState()` between imports (kept as-is) |
| `public/components/SectionCard.tsx` | 379 | ✅ | `forwardRef<SectionCardHandle, SectionCardProps>`; `useImperativeHandle` |
| `public/components/InstrumentSettings.tsx` | 420 | ✅ | `StudioInstrumentModule` type; module-level `getState()` |
| `public/components/Visualizer.tsx` | 422 | ✅ | `partitionDrawQueue` typed; `import type { EnsembleState }` (was `StateMap` until #1172) |
| `public/components/ChordVisualizer.tsx` | 449 | ✅ | `memo` from `preact/compat`; `className` kept throughout |
| `public/components/GenerateSongModal.tsx` | 567 | ✅ | `useState<string \| null>(null)` for confirmTemplate |
| `public/components/InstrumentRail.tsx` | 719 | ✅ | `ActiveSurface` type; `StudioSurface` exported; `StyleObject` |
| `public/components/Settings.tsx` | 755 | ✅ | `Record<string, number>` for MIDI channels/octaves |
| `public/components/PresetLibrary.tsx` | 820 | ✅ | 6 interfaces: `LibraryPreset`, `LibraryEntry`, `PresetSection`, etc. |

---

## Phase 7: Small/Medium Unlisted Files 🔄

During Phase 7 planning, the tracker was found to be incomplete — 62 `.js` files remained but only 19 were listed here. Phase 7 covers all the small/medium files that slipped through earlier phases, organized into 5 batches by dependency order.

### Batch A — Tiny + Data files ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/ui.ts` | 13 | ✅ | Added `msg: string` param |
| `public/midi-export.ts` | 20 | ✅ | `options: Record<string, any> = {}` |
| `public/data/smart-genres.ts` | ~50 | ✅ | `GenreOverride` + `SmartGenre` interfaces; typed maps |
| `public/data/chord-presets.ts` | ~100 | ✅ | Pure data rename |
| `public/data/drum-presets.ts` | ~100 | ✅ | `deepMerge(target: any, source: any): any`; `DRUM_PRESETS: Record<string, any>` |
| `public/data/song-templates.ts` | ~100 | ✅ | Pure data rename |

### Batch B — Small leaf engine utilities ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/config.ts` | 204 | ✅ | `resolveMappedStyle` typed; imported by almost every engine file |
| `public/engine/voicing-policy.ts` | 109 | ✅ | All functions typed with `EnsembleState` |
| `public/engine/arranger-utils.ts` | 120 | ✅ | `UnrolledArrangement` interface exported |
| `public/engine/worker-utils.ts` | 191 | ✅ | `WORKER_MANAGED_KEYS: Record<string, string[]>` |
| `public/engine/audio-recovery.ts` | 164 | ✅ | `Float32Array<ArrayBuffer>` for TS 5.x; `onRecover` callback typed |
| `public/engine/synth-bass.ts` | 188 | ✅ | `killBassNote`, `playBassNote` typed |
| `public/engine/synth-utils.ts` | 249 | ✅ | `MixState`, `PercussiveStrikeOptions`, `ResonantToneOptions` interfaces |
| `public/form-analysis.ts` | 171 | ✅ | |

### Batch C — Medium leaf engines ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/engine/theory-scales.ts` | 333 | ✅ | `ENHARMONIC_KEY_MAP: Record<string, string>`; all helpers typed |
| `public/engine/fills.ts` | 302 | ✅ | `FillTemplate` + `GenreFills` interfaces; `level: 'low' \| 'medium' \| 'high'` |
| `public/engine/midi-utils.ts` | 283 | ✅ | `MidiEvent` interface; `MidiTrack` class fully typed |
| `public/engine/midi-scheduler.ts` | 191 | ✅ | All dispatch functions typed |
| `public/engine/synth-chords.ts` | 342 | ✅ | `ChordInstrumentPreset` + `PlayNoteOptions` interfaces; inner `stopNote` typed |
| `public/engine/resolution.ts` | 281 | ✅ | `CadenceStep` + `GenreConfig` interfaces; `generateResolutionNotes` typed |
| `public/instrument-controller.ts` | 244 | ✅ | `handleTap(setBpmRef: (bpm: number) => void)` |
| `public/visualizer-proxy.ts` | 207 | ✅ | `WorkerLike` interface; `declare const VIZ_WORKER_PATH`; class properties declared |

### Batch D — Grooves ✅

Convert `grooves/utils.ts` first (imported by all 15 genre files).

| File | Lines | Status |
|------|-------|--------|
| `public/engine/grooves/utils.ts` | 158 | ✅ |
| `public/engine/grooves/minimal.ts` | 92 | ✅ |
| `public/engine/grooves/shred.ts` | 13 | ✅ |
| `public/engine/grooves/ska-punk.ts` | 156 | ✅ |
| `public/engine/grooves/acoustic.ts` | 141 | ✅ |
| `public/engine/grooves/country.ts` | 140 | ✅ |
| `public/engine/grooves/metal.ts` | 162 | ✅ |
| `public/engine/grooves/reggae.ts` | 147 | ✅ |
| `public/engine/grooves/hiphop.ts` | 187 | ✅ |
| `public/engine/grooves/latin.ts` | 181 | ✅ |
| `public/engine/grooves/blues.ts` | 175 | ✅ |
| `public/engine/grooves/neo-soul.ts` | 237 | ✅ |
| `public/engine/grooves/disco.ts` | 191 | ✅ |
| `public/engine/grooves/jazz.ts` | 245 | ✅ |
| `public/engine/grooves/rock.ts` | 266 | ✅ |
| `public/engine/grooves/funk.ts` | 270 | ✅ |

### Batch E — Medium tracked files ✅

Convert `utils.ts` first (imported by 15+ files).

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/utils.ts` | 878 | ✅ | Convert first in batch |
| `public/engine/engine.ts` | 471 | ✅ | Depends on utils, synth-* |
| `public/engine/synth-harmonies.ts` | 442 | ✅ | |
| `public/engine/bass-styles.ts` | 952 | ✅ | Depends on config, utils |
| `public/visualizer-engine.ts` | 885 | ✅ | Depends on constants.ts, visualizer-events.ts, visualizer-utils.ts |

---

## Phase 8: Large/Complex Engine Files ✅

<!-- cspell:ignore webworker -->

Split into 6 sub-batches by dependency order (leaves first). Worker files need `/// <reference lib="webworker" />` at the top.

### Batch A — Pure leaves ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/engine/accompaniment.ts` | 1835 | ✅ | 3 interfaces; `chord/notes` typed `any` per Phase 5–7 precedent |
| `public/engine/bass-engine.ts` | 692 | ✅ | 0 interfaces; `TIME_SIGNATURES` indexed via `any` cast |
| `public/engine/chords-engine.ts` | 1057 | ✅ | 5 interfaces; `state: any` kept since deep nested access |
| `public/engine/conductor.ts` | 553 | ✅ | Local `Dispatch` callable type; many `(x as any)` for chord shape |
| `public/engine/soloist-config.ts` | 1593 | ✅ | 6 interfaces (`StyleConfig`, `SoloistIntent`, etc.); `Record<string, StyleConfig>` for tables |
| `public/engine/synth-drums.ts` | 1147 | ✅ | 7 interfaces + 2 type aliases; local `DrumMixState` (synth-utils types are non-exported) |
| `public/visualizer-worker.ts` | 152 | ✅ | `/// <reference lib="webworker" />`; `workerSelf as DedicatedWorkerGlobalScope` |

### Batch B — Single-level deps ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/engine/soloist-devices.ts` | 749 | ✅ | 2 interfaces; ctx params kept `any` per original |
| `public/engine/soloist-rhythm-engine.ts` | 704 | ✅ | 3 type aliases (ResponseTransform/Mode/Source) |
| `public/engine/harmonies.ts` | 799 | ✅ | 6 local interfaces (HarmonyBehavior, HarmonyContext, etc.) |

### Batch C — soloist-pitch-engine ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/engine/soloist-pitch-engine.ts` | 1182 | ✅ | 2 interfaces (DeviceBufferResult, MotifDevicePrioritiesOptions); session state kept `any` |

### Batch D — Soloist core ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/engine/soloist.ts` | 1505 | ✅ | Local `PhraseResponseSource` union; resolves the line-628 narrowing note |
| `public/engine/synth-soloist.ts` | 969 | ✅ | `SoloistVoice` exported; `as any` on `AudioParam` connects |
| `public/engine/soloist-seeder.ts` | 2233 | ✅ | 10 interfaces; preserves SRDC/Dynamic Head comments verbatim |

### Batch E — Hubs ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/engine/tick-logic.ts` | 538 | ✅ | 5 interfaces (TickCursors, NoteResult, DrumHitInfo, GenerateNotesOptions/Result) |
| `public/engine/midi-worker-logic.ts` | 821 | ✅ | 4 interfaces (ExportOptions, ExportCursor, ExportPrevStates, ExportConductor) |

### Batch F — Roots + service worker ✅

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `public/engine/scheduler-core.ts` | 1304 | ✅ | `Dispatch` type alias; all `@direct-mutation` markers preserved |
| `public/logic-worker.ts` | 187 | ✅ | `/// <reference lib="webworker" />`; `workerSelf` cast |
| `public/main.ts` | 187 | ✅ | `(window as any)` for `window.ensemble` augmentation |
| `public/sw.ts` | 41 | ✅ | `/// <reference lib="webworker" />`; `swSelf` cast |

**Build pipeline update:** `scripts/deploy-test.sh` and `scripts/deploy-prod.sh` esbuild entries updated to `.ts`. Added a dedicated `esbuild public/sw.ts --outfile=dist/sw.js` step so the service worker (which can't be an ES module) is compiled separately. Removed `sw.js` from the `cp` static-asset list.

**Migration is COMPLETE.** Zero `.js` source files remain in `public/`.

**Whole-repo finish (May 15 2026):** commits `0fe217f8` (test(ts): bench/e2e/test-utils) and `ff52a9e9` (chore(ts): scripts/configs/docs) converted the remaining 51 `.js` files outside `public/`. Only `.dependency-cruiser.cjs` remains as JS (must stay CJS for dependency-cruiser). New `tsconfig.scripts.json` typechecks `scripts/` under Node types; `tsconfig.tests.json` no longer excludes `tests/bench` or `tests/e2e`. See `docs/archive/ARCHITECTURE_FOLLOWUPS.md` item #3 for the deferred CLI-script breakage that surfaced during this finish.

---

## Notes for Future Sessions

- **Import paths stay `.js`** throughout the migration — `moduleResolution: Bundler` resolves them to the `.ts` source automatically.
- **State slices are done.** All `state/*.ts` files are converted; `EnsembleState` in `types.ts` now has real type imports.
- **`tsConfig?: any`** in `StepInfo` — tighten once a proper time-signature config type is defined (likely in `engine/tick-logic` or `state/playback`).
- **`responseMode`/`responseSource`** in `SoloistPhraseContext` are typed as narrow unions — if new values appear in engine files, expand the union rather than widening to `string`.
