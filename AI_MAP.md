# Ensemble AI Map

This map provides a quick reference for AI agents to understand the responsibilities and key exports of the Ensemble codebase.

## Guide Hierarchy

- Start here when you need file ownership, entrypoints, or likely edit locations.
- Use `AI.md` for operational rules and safety conventions.
- Use `docs/README.md` for the docs index and roadmap.
- Use `.github/copilot-instructions.md` for the concise Copilot CLI summary.
- If guidance conflicts, prefer live code/config first, then realign the docs so `AI.md` and `AI_MAP.md` stay reliable.

## Core Architecture

| Path | Responsibility | Key Exports / Symbols |
| :--- | :--- | :--- |
| `public/main.js` | App entry point, worker init, global events. | `init` |
| `public/logic-worker.js` | Main generative thread & orchestration. | `fillBuffers`, `processMessage` |
| `public/visualizer-worker.js` | Background rendering thread for 60fps visuals. | `engine.render` |
| `public/state.ts` | Central Redux-like state store. | `getState`, `dispatch`, `subscribe` |
| `public/types.ts` | Global Action constants and shared types. | `ACTIONS` |
| `public/ui-types.ts` | Shared UI component prop definitions. | `SelectOption` |
| `public/ui-bridge.ts` | Preact <-> Engine synchronization hook. | `useEnsembleState` |
| `public/app-controller.ts` | Top-level playback and session control. | `togglePlay`, `resetSession` |
| `public/worker-client.ts` | Main-thread orchestrator for worker messaging. | `workerClient` |

## State Management (Domain Slices)

| Path | Domain Responsibility | Initial State |
| :--- | :--- | :--- |
| `public/state/playback.ts` | BPM, transport, volume, and visual state. | `playback` |
| `public/state/arranger.ts` | Chords, sections, time signature, and key. | `arranger` |
| `public/state/groove.ts` | Genre, intensity, and drum kit selection. | `groove` |
| `public/state/instruments.ts` | Per-instrument synthesis parameters. | `bass`, `soloist`, `harmony` |
| `public/state/midi.ts` | WebMIDI routing and local muting state. | `midi` |
| `public/state/visualizer.ts` | Rendering settings and UI overlays. | `vizState` |
| `public/state/conductor.ts` | Macro-arc, intensity drift, and form iteration state. | `conductor` |
| `public/state-effects.ts` | Cross-module state side effects (Inversion of Control). | `subscribeToState` |
| `public/state-hydration.ts` | Initial state loading and validation logic. | `hydrateState` |

## Generative Engines (Worker Thread)

| Path | Responsibility | Key Logic |
| :--- | :--- | :--- |
| `public/engine/soloist.js` | Melodic soloist generation logic (Main). | `getSoloistNote` |
| `public/engine/soloist-seeder.js` | Dynamic Head (Seed Melody) generation logic. | `generateSessionSeed` |
| `public/engine/bass-engine.js` | Bass line generation & genre resolution. | `isBassActive`, `getBassNote` |
| `public/engine/accompaniment.js` | Chord comping and rhythmic backing. | `getAccompanimentNotes`, `compingState` |
| `public/engine/chords-engine.js` | Chord parsing and harmonic analysis. | `getChordDetails`, `getScaleForChord` |
| `public/engine/harmonies.js` | Background pad/stab generation. | `getHarmonyNotes` |
| `public/engine/soloist-config.js` | Soloist style and influence pool data. | `STYLE_CONFIG`, `INFLUENCE_POOLS` |
| `public/engine/soloist-devices.js` | Melodic embellishment and run algorithms. | `generateMelodicDevice` |
| `public/engine/drum-seeder.ts` | Song-wide drum orchestration seeder. | `generateDrumOrchestration` |
| `public/engine/fills.js` | Procedural drum fill generation. | `generateProceduralFill` |
| `public/engine/conductor.js` | Global intensity and coordination logic. | `applyConductor`, `updateAutoConductor` |
| `public/engine/theory-scales.js` | Scale degrees and mode definitions. | `getScaleForChord` |
| `public/engine/resolution.js` | Harmonic resolution and transition logic. | `generateResolutionNotes` |
| `public/engine/arranger-utils.js` | Arrangement unrolling and form utilities. | `unrollArrangement` |

## Engine Styles (Genre Logic)

| Path | Responsibility | Key Patterns |
| :--- | :--- | :--- |
| `public/engine/bass-styles.js` | Genre-specific bass algorithms. | `checkBassActiveStyle` |
| `public/engine/chords-styles.ts` | Genre-specific chord voicing logic. | `getVoicingForStyle` |
| `public/engine/soloist-config.js` | Style definitions and influence pools. | `STYLE_CONFIG` |
| `public/engine/soloist-devices.js` | Melodic embellishments (Enclosures, Runs). | `applySoloistDevice` |
| `public/engine/grooves/` | Directory of 15+ genre-specific drum strategies. | `jazz.js`, `rock.js`, `funk.js`, etc. |

## Engine Core (Internal)

| Path | Responsibility | Key Exports |
| :--- | :--- | :--- |
| `public/engine/scheduler-core.js` | High-precision timing and lookahead. | `scheduler`, `scheduleStep` |
| `public/engine/midi-scheduler.js` | MIDI scheduling logic. | `dispatchMidiDrum`, `dispatchMidiSoloist` |
| `public/engine/platform-orchestrator.ts` | Platform specific lifecycle management. | `initPlatformHacks`, `startPlatformAudioAndWakeLock` |
| `public/engine/engine.js` | Audio synthesis and instrument setup. | `initAudio`, `playNote` |
| `public/engine/synth-utils.js` | Shared WebAudio boilerplate (ramping, voices). | `rampGain`, `killActiveVoices` |
| `public/engine/coordination-engine.ts` | Inter-instrument rhythmic yielding. | `createCoordinationContext` |
| `public/engine/voicing-policy.js` | Shared bass-space and auto-grounding rules for comping voices. | `shouldReserveBassSpace`, `shouldPreferGroundedPracticeVoicing` |
| `public/engine/groove-engine.ts` | Rhythmic patterns and micro-timing. | `getDrumMotif`, `calculatePocketOffset` |
| `public/engine/soloist-mode-policy.ts` | Canonical soloist phrasing-mode rules and voice limits. | `resolveSoloistMode`, `getSoloistVoiceLimit` |
| `public/engine/soloist-pitch-engine.js` | Advanced melodic pitch selection. | `selectPitchAndDevices` |
| `public/engine/soloist-rhythm-engine.js` | Melodic rhythm planning and phrasing. | `generateRhythmPlan` |
| `public/engine/worker-utils.js` | Shared background thread utilities. | `getChordAtStep`, `safeSync`, `resetCursors` |
| `public/engine/worker-orchestrator.ts` | Worker lifecycle and message management. | `workerContext`, `resetWorkerContext` |
| `public/engine/worker-buffer-manager.ts` | Generative buffer orchestration. | `fillBuffers` |
| `public/engine/tick-logic.js` | Unified generative tick and transition logic. | `generateNotesForStep`, `applyWorkerTransition` |
| `public/engine/audio-recovery.js` | Context resumption and error handling. | `resumeContext`, `handleAudioError` |
| `public/engine/midi-utils.js` | Shared MIDI byte conversion utilities. | `noteToMidi`, `midiToFreq` |
| `public/engine/midi-worker-logic.js` | Offline MIDI generation and file export. | `handleExport`, `ExportProcessor` |
| `public/engine/midi-constants.ts` | Constants for MIDI logic like `DRUM_MAP`. | `DRUM_MAP` |

## Live vs Worker Responsibilities

- `public/worker-client.ts` owns main-thread worker lifecycle, delta sync, flush, resolution, and export requests.
- `public/logic-worker.js` is the worker-side message dispatcher and reset coordinator.
- `public/engine/worker-buffer-manager.ts` and `public/engine/tick-logic.js` own lookahead note generation inside the worker.
- `public/engine/worker-utils.js` holds shared worker-side helpers such as `getChordAtStep`.
- `public/engine/scheduler-core.js` stays on the main thread and schedules already-generated note events into WebAudio/MIDI time.

## Synthesis Engine (WebAudio)

| Path | Responsibility |
| :--- | :--- |
| `public/engine/synth-bass.js` | Sub-bass and Growl synthesis. |
| `public/engine/synth-chords.js` | Polyphonic piano/pad synthesis. |
| `public/engine/synth-drums.js` | Procedural percussion synthesis. |
| `public/engine/synth-harmonies.js` | Background "Stab" and "Pad" synthesis. |
| `public/engine/synth-soloist.js` | Lead instrument synthesis and glides. |

## Data & Configuration

| Path | Responsibility | Key Data |
| :--- | :--- | :--- |
| `public/data/drum-presets.js` | Drum patterns and expansion logic. | `DRUM_PRESETS` |
| `public/data/smart-genres.js` | High-level genre configurations. | `SMART_GENRES` |
| `public/data/chord-presets.js` | Library chord progressions. | `CHORD_PRESETS` |
| `public/data/song-templates.js` | Full song structure templates. | `SONG_TEMPLATES` |
| `public/data/instrument-styles.ts` | UI menu definitions for instruments. | `CHORD_STYLES`, `BASS_STYLES` |
| `public/data/shortcut-config.ts` | Centralized keyboard shortcuts. | `SHORTCUT_CONFIG` |

## UI Components (Preact)

| Category | Path | Responsibility |
| :--- | :--- | :--- |
| **Containers** | `public/App.tsx` | Root application shell — renders ChartSurface, GlobalShortcuts, Modals, and notification layers. |
| **Surface** | `public/components/ChartSurface.tsx` | Chart-first single surface. Three slot regions: TopBar (transport + key/time + actions), Chart (ChordVisualizer), Rail (InstrumentRail). Visualizer overlay is gated behind the 🌈 button. |
| **Workspaces** | `public/components/InstrumentRail.tsx` | Instrument rows (Drums · Bass · Chords · Harmony · Soloist) with Mixer and Band feel popovers. Accepts `orientation: 'vertical' | 'horizontal'`. |
| **Visuals** | `public/components/VisualizerOverlay.tsx` | Full-screen visualizer portal rendered on demand. Mounts into `document.body` via `createPortal`. |
| **Shared** | `public/components/UIControls.tsx` | Reusable UI toolkit. |
| **Orchestration** | `public/components/Modals.tsx` | Lazy-loading modal orchestrator. |
| **Logic Views** | `public/components/Arranger.tsx` | Arranger editor surface used by the editor modal and related flows. |
| **Logic Views** | `public/components/ChordVisualizer.tsx` | Continuous lead-sheet renderer for arranger playback, density tiers, and maximized reading mode. |
| **Controls** | `public/components/Transport.tsx` | Playback controls and tempo. |
| **Visuals** | `public/components/Visualizer.tsx` | Canvas rendering container. |
| **Library** | `public/components/PresetLibrary.tsx` | Chord progression library modal. |
| **Settings** | `public/components/InstrumentSettings.tsx` | Reusable per-instrument settings surface used from Studio. |
| **Others** | `public/components/` | Functional modals and settings panels. |

## Domain State Slices (Modular State)

| Path | Responsibility |
| :--- | :--- |
| `public/state/playback.ts` | Transport, BPM, master volume, and global intensity. |
| `public/state/arranger.ts` | Progression, key signature, and sections. |
| `public/state/groove.ts` | Drum patterns, genre feel, and pocket timing. |
| `public/state/instruments.ts` | Bass, Chords, Soloist, and Harmony settings. |
| `public/state/conductor.ts` | Auto-intensity target, tempo drift, and form tracking. |
| `public/state/midi.ts` | MIDI device and channel configuration. |
| `public/state/visualizer.ts` | Visualizer rendering and flash state. |

## High-Level Controllers & Integration

| Path | Responsibility |
| :--- | :--- |
| `public/arranger-controller.ts` | High-level song structure manipulation. |
| `public/instrument-controller.js` | Per-instrument state and preset routing. |
| `public/performance-controller.ts` | Real-time keyboard performance logic. |
| `public/midi-controller.ts` | WebMIDI bridging and DAW sync. |
| `public/midi-export.js` | Main-thread MIDI file triggers. |
| `public/song-generator.ts` | Algorithmic song structure generation. |
| `public/lead-sheet-model.ts` | Shared lead-sheet shaping for 4-measure row packing, section markers, and density selection. |
| `public/persistence.ts` | LocalStorage session saving. |
| `public/platform.ts` | Browser hacks (WakeLock, Audio Unlock). |
| `public/sharing.ts` | URL-based song sharing. | `getShareURL` |
| `public/utils.js` | General-purpose musical and math utilities. | `getFrequency` |
| `public/visualizer-events.ts` | Canonical visual event contract and track metadata for the Visuals workspace. | `VISUALIZER_TRACK_ORDER`, `queueVisualizerNoteEvent` |
| `public/visualizer-engine.js` | High-performance Canvas rendering logic. | `VisualizerEngine` |
| `public/visualizer-proxy.js` | Main-thread bridge to visualizer worker. |

## Infrastructure & Lifecycle (Internal)

| Path | Responsibility |
| :--- | :--- |
| `public/ui-root.tsx` | Preact application entry point and hydration. |
| `public/pwa.ts` | PWA install prompt management. |
| `public/ui.js` | Lazy Proxy-based DOM access layer. |
| `public/worker-types.ts` | Shared message type definitions for workers. |
| `public/config.js` | Global timing and musical constants. |
| `public/constants.ts` | Global visual and UI state constants. |
| `public/history.ts` | Session history and undo/redo logic. |
| `public/visualizer-utils.ts` | Shared canvas math and drawing utilities. |

## Documentation, Parsing & Testing

| Path | Responsibility |
| :--- | :--- |
| `docs/README.md` | Documentation index and repo navigation hub. |
| `docs/VISION.md` | Product direction, open work items, and key decisions. |
| `docs/guides/PERFORMANCE_GUIDELINES.md` | Hot-loop performance notes for audio and scheduler code. |
| `public/MANUAL.md` | User-facing guide with auto-generated tables. |
| `public/form-analysis.js` | Song section and structure detection. |
| `.github/CONTRIBUTING.md` | Contributor workflow and validation checklist. |
| `.github/SECURITY.md` | Private vulnerability reporting guidance. |
| `.github/CODE_OF_CONDUCT.md` | Community behavior standards. |
| `tests/` | Unit, Integration, and E2E test suites. |
| `AI.md` | Primary operational guide and architectural rules. |
| `AI_MAP.md` | Codebase navigation (this file). |
