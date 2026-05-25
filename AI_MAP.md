# Ensemble AI Map

This map provides a quick reference for AI agents to understand the responsibilities and key exports of the Ensemble codebase.

## Guide Hierarchy

- Start here when you need file ownership, entrypoints, or likely edit locations.
- Use `CLAUDE.md` for operational rules, architecture, and safety conventions. (`AGENTS.md` is a pointer to it.)
- Use `docs/README.md` for the docs index.
- If guidance conflicts, prefer live code/config first, then realign the docs so `CLAUDE.md` and `AI_MAP.md` stay reliable.

## Core Architecture

| Path | Responsibility | Key Exports / Symbols |
| :--- | :--- | :--- |
| `public/main.ts` | App entry point, worker init, global events. | `init` |
| `public/logic-worker.ts` | Main generative thread & orchestration. | `fillBuffers`, `processMessage` |
| `public/visualizer-worker.ts` | Background rendering thread for 60fps visuals. | `engine.render` |
| `public/sw.ts` | Service worker — Workbox `precacheAndRoute(self.__WB_MANIFEST)`. | `activate`, `message` |
| `public/state.ts` | Central Redux-like state store. | `getState`, `dispatch`, `subscribe` |
| `public/types.ts` | Global Action constants and shared types. | `ACTIONS` |
| `public/ui-types.ts` | Shared UI component prop definitions. | `SelectOption` |
| `public/ui-bridge.ts` | Preact <-> Engine synchronization hook. | `useEnsembleState` |
| `public/app-controller.ts` | Top-level playback and session control. | `togglePlay`, `resetSession` |
| `public/worker-client.ts` | Main-thread orchestrator for worker messaging. | `workerClient` |
| `public/e2e-tools.ts` | Boot-time install of `window.ensemble` for E2E tests and scripts. | `installE2EGlobals` |

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
| `public/engine/soloist.ts` | Melodic soloist generation logic (Main). | `getSoloistNote` |
| `public/engine/soloist-seeder.ts` | Dynamic Head (Seed Melody) generation logic. | `generateSessionSeed` |
| `public/engine/bass-engine.ts` | Bass line generation & genre resolution. | `isBassActive`, `getBassNote` |
| `public/engine/accompaniment.ts` | Chord comping and rhythmic backing. | `getAccompanimentNotes`, `compingState` |
| `public/engine/chords-engine.ts` | Chord parsing and harmonic analysis. | `getChordDetails`, `getScaleForChord` |
| `public/engine/harmonies.ts` | Background pad/stab generation. | `getHarmonyNotes` |
| `public/engine/soloist-config.ts` | Soloist style and influence pool data. | `STYLE_CONFIG`, `INFLUENCE_POOLS` |
| `public/engine/soloist-devices.ts` | Melodic embellishment and run algorithms. | `generateMelodicDevice` |
| `public/engine/drum-seeder.ts` | Song-wide drum orchestration seeder. | `generateDrumOrchestration` |
| `public/engine/fills.ts` | Procedural drum fill generation. | `generateProceduralFill` |
| `public/engine/conductor.ts` | Global intensity and coordination logic. | `applyConductor`, `updateAutoConductor` |
| `public/engine/arc.ts` | Loop-driven intensity arc (head→build→peak→release). Synth-audit Epic 7 S4. | `loopArcMultiplier` |
| `public/engine/theory-scales.ts` | Scale degrees and mode definitions. | `getScaleForChord` |
| `public/engine/resolution.ts` | Harmonic resolution and transition logic. | `generateResolutionNotes` |
| `public/engine/arranger-utils.ts` | Arrangement unrolling and form utilities. | `unrollArrangement` |
| `public/engine/arrangement-layering.ts` | Per-engine intro/outro mute schedule (S5). | `INTRO_MUTES`, `OUTRO_MUTES`, `isIntroSectionLabel` |
| `public/engine/drop-mechanic.ts` | Drop/Breakdown structural-cut gate (genre + energy-delta). | `shouldFireDropMute` |

## Engine Styles (Genre Logic)

| Path | Responsibility | Key Patterns |
| :--- | :--- | :--- |
| `public/engine/bass-styles.ts` | Genre-specific bass algorithms. | `checkBassActiveStyle` |
| `public/engine/chords-styles.ts` | Genre-specific chord voicing logic. | `getVoicingForStyle` |
| `public/engine/soloist-config.ts` | Style definitions and influence pools. | `STYLE_CONFIG` |
| `public/engine/soloist-devices.ts` | Melodic embellishments (Enclosures, Runs). | `applySoloistDevice` |
| `public/engine/grooves/` | Directory of 15+ genre-specific drum strategies. | `jazz.ts`, `rock.ts`, `funk.ts`, etc. |

## Engine Core (Internal)

| Path | Responsibility | Key Exports |
| :--- | :--- | :--- |
| `public/engine/scheduler-core.ts` | High-precision timing and lookahead. | `scheduler`, `scheduleStep` |
| `public/engine/midi-scheduler.ts` | MIDI scheduling logic. | `dispatchMidiDrum`, `dispatchMidiSoloist` |
| `public/engine/platform-orchestrator.ts` | Platform specific lifecycle management. | `initPlatformHacks`, `startPlatformAudioAndWakeLock` |
| `public/engine/engine.ts` | Audio synthesis and instrument setup. | `initAudio`, `playNote` |
| `public/engine/reverb.ts` | Algorithmic Schroeder/Freeverb reverb (shared reverb return). | `createAlgorithmicReverb`, `REVERB_PRESETS` |
| `public/engine/synth-utils.ts` | Shared WebAudio boilerplate (ramping, voices, seeded humanization). | `rampGain`, `killActiveVoices`, `humanizeNote` |
| `public/engine/coordination-engine.ts` | Inter-instrument rhythmic yielding. | `createCoordinationContext` |
| `public/engine/voicing-policy.ts` | Shared bass-space and auto-grounding rules for comping voices. | `shouldReserveBassSpace`, `shouldPreferGroundedPracticeVoicing` |
| `public/engine/groove-engine.ts` | Rhythmic patterns and micro-timing. | `getDrumMotif`, `calculatePocketOffset` |
| `public/engine/hash-utils.ts` | Canonical deterministic hash helpers shared across engines. | `scrambleHash`, `stringHash33`, `stringHash31` |
| `public/engine/soloist-mode-policy.ts` | Canonical soloist phrasing-mode rules and voice limits. | `resolveSoloistMode`, `getSoloistVoiceLimit` |
| `public/engine/soloist-pitch-engine.ts` | Advanced melodic pitch selection. | `selectPitchAndDevices` |
| `public/engine/soloist-rhythm-engine.ts` | Melodic rhythm planning and phrasing. | `generateRhythmPlan` |
| `public/engine/worker-utils.ts` | Shared background thread utilities. | `getChordAtStep`, `safeSync`, `resetCursors` |
| `public/engine/worker-orchestrator.ts` | Worker lifecycle and message management. | `workerContext`, `resetWorkerContext` |
| `public/engine/worker-buffer-manager.ts` | Generative buffer orchestration. | `fillBuffers` |
| `public/engine/tick-logic.ts` | Unified generative tick and transition logic. | `generateNotesForStep`, `applyWorkerTransition` |
| `public/engine/audio-recovery.ts` | Context resumption and error handling. | `resumeContext`, `handleAudioError` |
| `public/engine/midi-utils.ts` | Shared MIDI byte conversion utilities. | `noteToMidi`, `midiToFreq` |
| `public/engine/midi-worker-logic.ts` | Offline MIDI generation and file export. | `handleExport`, `ExportProcessor` |
| `public/engine/midi-constants.ts` | Constants for MIDI logic like `DRUM_MAP`. | `DRUM_MAP` |

## Live vs Worker Responsibilities

- `public/worker-client.ts` owns main-thread worker lifecycle, delta sync, flush, resolution, and export requests.
- `public/logic-worker.ts` is the worker-side message dispatcher and reset coordinator.
- `public/engine/worker-buffer-manager.ts` and `public/engine/tick-logic.ts` own lookahead note generation inside the worker.
- `public/engine/worker-utils.ts` holds shared worker-side helpers such as `getChordAtStep`.
- `public/engine/scheduler-core.ts` stays on the main thread and schedules already-generated note events into WebAudio/MIDI time.

## Synthesis Engine (WebAudio)

| Path | Responsibility |
| :--- | :--- |
| `public/engine/synth-bass.ts` | Sub-bass and Growl synthesis. |
| `public/engine/synth-chords.ts` | Polyphonic piano/pad synthesis. |
| `public/engine/synth-drums.ts` | Procedural percussion synthesis. |
| `public/engine/synth-harmonies.ts` | Background "Stab" and "Pad" synthesis. |
| `public/engine/synth-soloist.ts` | Lead instrument synthesis and glides. |
| `public/engine/wav-encoder.ts` | Minimal 16-bit PCM WAV encoder shared by the in-app audio export and the Node-side `mix-report --write-wav` path. |

## Data & Configuration

| Path | Responsibility | Key Data |
| :--- | :--- | :--- |
| `public/data/drum-presets.ts` | Drum patterns and expansion logic. | `DRUM_PRESETS` |
| `public/data/smart-genres.ts` | High-level genre configurations. | `SMART_GENRES` |
| `public/data/chord-presets.ts` | Library chord progressions. | `CHORD_PRESETS` |
| `public/data/song-templates.ts` | Full song structure templates. | `SONG_TEMPLATES` |
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
| **Orchestration** | `public/components/AuditionOverlay.tsx` | One-button "▶ Play" landing shown when the app is opened from an audition permalink (`?autoplay=1`); satisfies the browser autoplay gesture and starts the hydrated scene. |
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
| `public/instrument-controller.ts` | Per-instrument state and preset routing. |
| `public/performance-controller.ts` | Real-time keyboard performance logic. |
| `public/midi-controller.ts` | WebMIDI bridging and DAW sync. |
| `public/midi-export.ts` | Main-thread MIDI file triggers. |
| `public/audio-export.ts` | In-browser audio render: clones live state, drives `OfflineAudioContext` through the same engine path as playback, encodes to WAV. Powers the Share modal's "Download .wav". |
| `public/song-generator.ts` | Algorithmic song structure generation. |
| `public/lead-sheet-model.ts` | Shared lead-sheet shaping for 4-measure row packing, section markers, and density selection. |
| `public/persistence.ts` | LocalStorage session saving. |
| `public/platform.ts` | Browser hacks (WakeLock, Audio Unlock). |
| `public/sharing.ts` | URL-based song sharing. | `getShareURL` |
| `public/utils.ts` | General-purpose musical and math utilities. | `getFrequency` |
| `public/visualizer-events.ts` | Canonical visual event contract and track metadata for the Visuals workspace. | `VISUALIZER_TRACK_ORDER`, `queueVisualizerNoteEvent` |
| `public/visualizer-engine.ts` | High-performance Canvas rendering logic. | `VisualizerEngine` |
| `public/visualizer-proxy.ts` | Main-thread bridge to visualizer worker. |

## Infrastructure & Lifecycle (Internal)

| Path | Responsibility |
| :--- | :--- |
| `public/ui-root.tsx` | Preact application entry point and hydration. |
| `public/pwa.ts` | PWA install prompt management. |
| `public/ui.ts` | Lazy Proxy-based DOM access layer. |
| `public/worker-types.ts` | Shared message type definitions for workers. |
| `public/config.ts` | Global timing and musical constants. |
| `public/constants.ts` | Global visual and UI state constants. |
| `public/history.ts` | Session history and undo/redo logic. |
| `public/visualizer-utils.ts` | Shared canvas math and drawing utilities. |

## Documentation, Parsing & Testing

| Path | Responsibility |
| :--- | :--- |
| `docs/README.md` | Documentation index and repo navigation hub. |
| `docs/VISION.md` | Product direction, open work items, and key decisions. |
| `docs/guides/PERFORMANCE_GUIDELINES.md` | Hot-loop performance notes for audio and scheduler code. |
| `docs/guides/musical-engine-patterns.md` | Reusable recipes for generative-engine work (5 smells, coordination, loop-awareness, final-stage multiplier discipline, seeded determinism). |
| `docs/guides/bundle-hygiene.md` | Reusable recipes for bundle-size + dead-code work (budgets-as-baselines, statically-DCE'd expectations, pre-flight grep tripwire, knip blind spots, code-splitting discipline). |
| `public/MANUAL.md` | User-facing guide with auto-generated tables. |
| `public/form-analysis.ts` | Song section and structure detection. |
| `.github/CONTRIBUTING.md` | Contributor workflow and validation checklist. |
| `.github/SECURITY.md` | Private vulnerability reporting guidance. |
| `.github/CODE_OF_CONDUCT.md` | Community behavior standards. |
| `tests/` | Unit, Integration, and E2E test suites. |
| `CLAUDE.md` | Primary operational guide and architectural rules. |
| `AGENTS.md` | Pointer to `CLAUDE.md` for AGENTS.md-aware tools. |
| `AI_MAP.md` | Codebase navigation (this file). |
