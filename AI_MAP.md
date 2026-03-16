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
| `public/ui-bridge.js` | Preact <-> Engine synchronization hook. | `useEnsembleState` |
| `public/app-controller.js` | Top-level playback and session control. | `togglePlay`, `resetSession` |

## State Management (Domain Slices)

| Path | Domain Responsibility | Initial State |
| :--- | :--- | :--- |
| `public/state/playback.js` | BPM, transport, volume, and visual state. | `playback` |
| `public/state/arranger.js` | Chords, sections, time signature, and key. | `arranger` |
| `public/state/groove.js` | Genre, intensity, and drum kit selection. | `groove` |
| `public/state/instruments.js` | Per-instrument synthesis parameters. | `bass`, `soloist`, `harmony` |
| `public/state/midi.js` | WebMIDI routing and local muting state. | `midi` |
| `public/state/visualizer.js` | Rendering settings and UI overlays. | `vizState` |

## Generative Engines (Worker Thread)

| Path | Responsibility | Key Logic |
| :--- | :--- | :--- |
| `public/soloist.js` | Melodic soloist generation logic. | `getSoloistNote`, `soloistState` |
| `public/bass.js` | Bass line generation (Walking, Funk). | `getBassNote`, `hiphop`, `acoustic`, `dub`, `blues`, `metal` |
| `public/accompaniment.js` | Chord comping and rhythmic backing. | `getAccompanimentNotes`, `compingState` |
| `public/harmonies.js` | Background pad/stab generation. | `getHarmonyNotes` |
| `public/fills.js` | Procedural drum fill algorithms. | `generateProceduralFill` |

## Engine Core (Shared)

| Path | Responsibility | Key Exports |
| :--- | :--- | :--- |
| `public/engine/scheduler-core.js` | High-precision timing and lookahead. | `scheduler`, `scheduleStep` |
| `public/engine/engine.js` | Audio synthesis and instrument setup. | `initAudio`, `playNote` |
| `public/engine/synth-utils.js` | Shared WebAudio boilerplate (ramping, voices). | `rampGain`, `killActiveVoices` |
| `public/engine/coordination-engine.js` | Inter-instrument rhythmic yielding. | `createCoordinationContext` |
| `public/engine/groove-engine.js` | Rhythmic patterns and micro-timing. | `getDrumMotif`, `calculatePocketOffset` |
| `public/engine/midi-worker-logic.js` | Offline MIDI generation and file export. | `handleExport`, `ExportProcessor` |
| `public/engine/worker-utils.js` | Shared background thread utilities. | `getChordAtStep`, `safeSync`, `resetCursors` |

## Data Modules (static)

| Path | Responsibility | Key Data |
| :--- | :--- | :--- |
| `public/data/drum-presets.js` | Drum patterns and expansion logic. | `DRUM_PRESETS` |
| `public/data/smart-genres.js` | High-level genre configurations. | `SMART_GENRES` |
| `public/data/chord-presets.js` | Library chord progressions. | `CHORD_PRESETS` |
| `public/data/song-templates.js` | Full song structure templates. | `SONG_TEMPLATES` |
| `public/data/instrument-styles.js` | Engine-specific style definitions. | `CHORD_STYLES`, `BASS_STYLES`, etc. |
| `public/data/shortcut-config.js` | Centralized keyboard shortcut definitions. | `SHORTCUT_CONFIG` |

## UI Components (Preact)

| Path | Responsibility |
| :--- | :--- |
| `public/App.jsx` | Root layout and theme provider. |
| `public/components/UIControls.jsx` | Reusable UI toolkit (SettingRow, Toggle, etc.). |
| `public/components/Modals.jsx` | Lazy-loading modal orchestrator. |
| `public/components/ManualModal.jsx` | Self-building documentation viewer. |
| `public/components/Arranger.jsx` | Chord progression and section manager. |
| `public/components/Transport.jsx` | Playback controls and tempo. |
| `public/components/Visualizer.jsx` | Canvas rendering and animation loop. |
| `public/components/SequencerGrid.jsx` | Interactive drum pattern editor. |
| `public/components/GroovePanel.jsx` | Genre and vibe selection. |

## Testing

| Path | Responsibility |
| :--- | :--- |
| `tests/unit/` | Low-level logic verification. |
| `tests/standards/` | **Expert Critiques** (Authenticity Audit) and security ledgers. |
| `tests/integration/` | Cross-module behavioral tests. |
| `tests/e2e/` | Visual regression and UI flow tests. |

## Documentation & Standards

| File | Purpose |
| :--- | :--- |
| `GEMINI.md` | Primary Project Context (The "What"). |
| `AI.md` | Operational Protocols (The "How"). |
| `AI_MAP.md` | Codebase Navigation (The "Where"). |
| `docs/guides/` | Domain-specific guides (Coordination, Tuning). |
| `docs/archive/` | Historical reports and completed plans. |
