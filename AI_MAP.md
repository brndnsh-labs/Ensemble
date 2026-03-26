# Ensemble AI Map

This map provides a quick reference for AI agents to understand the responsibilities and key exports of the Ensemble codebase.

## Core Architecture

| Path | Responsibility | Key Exports / Symbols |
| :--- | :--- | :--- |
| `public/main.js` | App entry point, worker init, global events. | `init` |
| `public/logic-worker.js` | Main generative thread & orchestration. | `fillBuffers`, `processMessage` |
| `public/visualizer-worker.js` | Background rendering thread for 60fps visuals. | `engine.render` |
| `public/state.js` | Central Redux-like state store. | `getState`, `dispatch`, `subscribe` |
| `public/types.js` | Global Action constants and shared types. | `ACTIONS` |
| `public/ui-types.js` | Shared UI component prop definitions. | `SelectOption` |
| `public/ui-bridge.js` | Preact <-> Engine synchronization hook. | `useEnsembleState` |
| `public/app-controller.js` | Top-level playback and session control. | `togglePlay`, `resetSession` |
| `public/worker-client.js` | Main-thread orchestrator for worker messaging. | `workerClient` |

## State Management (Domain Slices)

| Path | Domain Responsibility | Initial State |
| :--- | :--- | :--- |
| `public/state/playback.js` | BPM, transport, volume, and visual state. | `playback` |
| `public/state/arranger.js` | Chords, sections, time signature, and key. | `arranger` |
| `public/state/groove.js` | Genre, intensity, and drum kit selection. | `groove` |
| `public/state/instruments.js` | Per-instrument synthesis parameters. | `bass`, `soloist`, `harmony` |
| `public/state/midi.js` | WebMIDI routing and local muting state. | `midi` |
| `public/state/ui.js` | Top-level UI workspace navigation state. | `ui`, `normalizeWorkspace` |
| `public/state/visualizer.js` | Rendering settings and UI overlays. | `vizState` |
| `public/state/conductor.js` | Macro-arc, intensity drift, and form iteration state. | `conductor` |
| `public/state-effects.js` | Cross-module state side effects (Inversion of Control). | `subscribeToState` |
| `public/state-hydration.js` | Initial state loading and validation logic. | `hydrateState` |

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
| `public/engine/drum-seeder.js` | Song-wide drum orchestration seeder. | `generateDrumOrchestration` |
| `public/engine/fills.js` | Procedural drum fill generation. | `generateProceduralFill` |
| `public/engine/conductor.js` | Global intensity and coordination logic. | `applyConductor`, `updateAutoConductor` |
| `public/engine/theory-scales.js` | Scale degrees and mode definitions. | `getScaleForChord` |
| `public/engine/resolution.js` | Harmonic resolution and transition logic. | `generateResolutionNotes` |
| `public/engine/arranger-utils.js` | Arrangement unrolling and form utilities. | `unrollArrangement` |

## Engine Styles (Genre Logic)

| Path | Responsibility | Key Patterns |
| :--- | :--- | :--- |
| `public/engine/bass-styles.js` | Genre-specific bass algorithms. | `checkBassActiveStyle` |
| `public/engine/chords-styles.js` | Genre-specific chord voicing logic. | `getVoicingForStyle` |
| `public/engine/soloist-config.js` | Style definitions and influence pools. | `STYLE_CONFIG` |
| `public/engine/soloist-devices.js` | Melodic embellishments (Enclosures, Runs). | `applySoloistDevice` |
| `public/engine/grooves/` | Directory of 15+ genre-specific drum strategies. | `jazz.js`, `rock.js`, `funk.js`, etc. |

## Engine Core (Internal)

| Path | Responsibility | Key Exports |
| :--- | :--- | :--- |
| `public/engine/scheduler-core.js` | High-precision timing and lookahead. | `scheduler`, `scheduleStep` |
| `public/engine/midi-scheduler.js` | MIDI scheduling logic. | `dispatchMidiDrum`, `dispatchMidiSoloist` |
| `public/engine/platform-orchestrator.js` | Platform specific lifecycle management. | `initPlatformHacks`, `startPlatformAudioAndWakeLock` |
| `public/engine/engine.js` | Audio synthesis and instrument setup. | `initAudio`, `playNote` |
| `public/engine/synth-utils.js` | Shared WebAudio boilerplate (ramping, voices). | `rampGain`, `killActiveVoices` |
| `public/engine/coordination-engine.js` | Inter-instrument rhythmic yielding. | `createCoordinationContext` |
| `public/engine/groove-engine.js` | Rhythmic patterns and micro-timing. | `getDrumMotif`, `calculatePocketOffset` |
| `public/engine/soloist-pitch-engine.js` | Advanced melodic pitch selection. | `selectPitchAndDevices` |
| `public/engine/soloist-rhythm-engine.js` | Melodic rhythm planning and phrasing. | `generateRhythmPlan` |
| `public/engine/worker-utils.js` | Shared background thread utilities. | `getChordAtStep`, `safeSync`, `resetCursors` |
| `public/engine/worker-orchestrator.js` | Worker lifecycle and message management. | `workerContext`, `resetWorkerContext` |
| `public/engine/worker-buffer-manager.js` | Generative buffer orchestration. | `fillBuffers` |
| `public/engine/tick-logic.js` | Unified generative tick and transition logic. | `generateNotesForStep`, `applyWorkerTransition` |
| `public/engine/audio-recovery.js` | Context resumption and error handling. | `resumeContext`, `handleAudioError` |
| `public/engine/midi-utils.js` | Shared MIDI byte conversion utilities. | `noteToMidi`, `midiToFreq` |
| `public/engine/midi-worker-logic.js` | Offline MIDI generation and file export. | `handleExport`, `ExportProcessor` |
| `public/engine/midi-constants.js` | Constants for MIDI logic like `DRUM_MAP`. | `DRUM_MAP` |

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
| `public/data/instrument-styles.js` | UI menu definitions for instruments. | `CHORD_STYLES`, `BASS_STYLES` |
| `public/data/shortcut-config.js` | Centralized keyboard shortcuts. | `SHORTCUT_CONFIG` |

## UI Components (Preact)

| Category | Path | Responsibility |
| :--- | :--- | :--- |
| **Containers** | `public/App.jsx` | Root workspace shell, header, and active surface rendering. |
| **Navigation** | `public/components/WorkspaceNav.jsx` | Top-level workspace switcher for Arranger, Studio, Perform, and Visuals. |
| **Workspaces** | `public/components/ArrangerWorkspace.jsx` | Lead-sheet workspace with arranger actions and progression library access. |
| **Workspaces** | `public/components/StudioWorkspace.jsx` | Live-mix workspace with band feel chooser and compact instrument controls. |
| **Workspaces** | `public/components/PerformWorkspace.jsx` | Launch surface for manual performance tools. |
| **Workspaces** | `public/components/VisualsWorkspace.jsx` | Visualizer workspace shell. |
| **Shared** | `public/components/UIControls.jsx` | Reusable UI toolkit. |
| **Orchestration** | `public/components/Modals.jsx` | Lazy-loading modal orchestrator. |
| **Logic Views** | `public/components/Arranger.jsx` | Arranger editor surface used by the editor modal and related flows. |
| **Controls** | `public/components/Transport.jsx` | Playback controls and tempo. |
| **Visuals** | `public/components/Visualizer.jsx` | Canvas rendering container. |
| **Library** | `public/components/PresetLibrary.jsx` | Chord progression library modal. |
| **Settings** | `public/components/InstrumentSettings.jsx` | Reusable per-instrument settings surface used from Studio. |
| **Others** | `public/components/` | Functional modals and settings panels. |

## Domain State Slices (Modular State)

| Path | Responsibility |
| :--- | :--- |
| `public/state/playback.js` | Transport, BPM, master volume, and global intensity. |
| `public/state/arranger.js` | Progression, key signature, and sections. |
| `public/state/groove.js` | Drum patterns, genre feel, and pocket timing. |
| `public/state/instruments.js` | Bass, Chords, Soloist, and Harmony settings. |
| `public/state/conductor.js` | Auto-intensity target, tempo drift, and form tracking. |
| `public/state/midi.js` | MIDI device and channel configuration. |
| `public/state/ui.js` | Top-level workspace selection for the app shell. |
| `public/state/visualizer.js` | Visualizer rendering and flash state. |

## High-Level Controllers & Integration

| Path | Responsibility |
| :--- | :--- |
| `public/arranger-controller.js` | High-level song structure manipulation. |
| `public/instrument-controller.js` | Per-instrument state and preset routing. |
| `public/performance-controller.js` | Real-time keyboard performance logic. |
| `public/midi-controller.js` | WebMIDI bridging and DAW sync. |
| `public/midi-export.js` | Main-thread MIDI file triggers. |
| `public/song-generator.js` | Algorithmic song structure generation. |
| `public/melody-harmonizer.js` | Monophonic analysis for chord generation. |
| `public/persistence.js` | LocalStorage session saving. |
| `public/platform.js` | Browser hacks (WakeLock, Audio Unlock). |
| `public/sharing.js` | URL-based song sharing. | `getShareURL` |
| `public/utils.js` | General-purpose musical and math utilities. | `getFrequency` |
| `public/visualizer-engine.js` | High-performance Canvas rendering logic. | `VisualizerEngine` |
| `public/visualizer-proxy.js` | Main-thread bridge to visualizer worker. |

## Infrastructure & Lifecycle (Internal)

| Path | Responsibility |
| :--- | :--- |
| `public/ui-root.jsx` | Preact application entry point and hydration. |
| `public/ui.js` | Lazy Proxy-based DOM access layer. |
| `public/worker-types.js` | Shared message type definitions for workers. |
| `public/config.js` | Global timing and musical constants. |
| `public/constants.js` | Global visual and UI state constants. |
| `public/history.js` | Session history and undo/redo logic. |
| `public/visualizer-utils.js` | Shared canvas math and drawing utilities. |
| `public/audio-analyzer-lite.js` | Real-time waveform and frequency detection. |

## Documentation, Parsing & Testing

| Path | Responsibility |
| :--- | :--- |
| `public/MANUAL.md` | User-facing guide with auto-generated tables. |
| `public/musicxml-parser.js` | Symbolic format importer. |
| `public/tab-parser.js` | Text-based chord/tab importer. |
| `public/form-analysis.js` | Song section and structure detection. |
| `tests/` | Unit, Integration, and E2E test suites. |
| `GEMINI.md` / `AI.md` | Primary architectural and operational guides. |
| `AI_MAP.md` | Codebase navigation (this file). |
