# Ensemble AI Map

This map provides a quick reference for AI agents to understand the responsibilities and key exports of the Ensemble codebase.

## Guide Hierarchy

- Start here when you need file ownership, entrypoints, or likely edit locations.
- Use `CLAUDE.md` for operational rules, architecture, and safety conventions. (`AGENTS.md` is a pointer to it.)
- Nested `CLAUDE.md` files (`public/CLAUDE.md`, `public/engine/CLAUDE.md`, `public/engine/grooves/CLAUDE.md`, `public/components/CLAUDE.md`, `tests/CLAUDE.md`) hold directory-scoped load-bearing invariants and traps — sharper than this map or the root file, auto-loaded by tooling that walks the directory tree. Read the one for a directory before editing in it.
- Use `docs/README.md` for the docs index.
- If guidance conflicts, prefer live code/config first, then realign the docs so `CLAUDE.md` and `AI_MAP.md` stay reliable.

## Core Architecture

| Path | Responsibility | Key Exports / Symbols |
| :--- | :--- | :--- |
| `public/main.ts` | App entry point, worker init, global events. | `init` |
| `public/logic-worker.ts` | Main generative thread & orchestration. | `fillBuffers`, `processMessage` |
| `public/visualizer-worker.ts` | Background rendering thread for 60fps visuals. | `engine.render` |
| `public/visualizer/visualizer-engine.ts` | `VisualizerEngine` class instantiated inside the worker; owns all Canvas rendering. (Worker-internal — only imported by `visualizer-worker.ts`.) | `VisualizerEngine` |
| `public/sw.ts` | Service worker — Workbox `precacheAndRoute(self.__WB_MANIFEST)`. | `activate`, `message` |
| `public/state.ts` | Central Redux-like state store. | `getState`, `dispatch`, `subscribe` |
| `public/types.ts` | Global Action constants and shared types. | `ACTIONS` |
| `public/ui-types.ts` | Shared UI component prop definitions. | `SelectOption` |
| `public/breakpoints.ts` | Shared viewport breakpoint constants for the compact/narrow UI experience. | `COMPACT_MQ` |
| `public/ui-bridge.ts` | Preact <-> Engine synchronization hook. | `useEnsembleState` |
| `public/controllers/app-controller.ts` | Top-level playback and session control. | `togglePlay`, `resetSession` |
| `public/worker-client.ts` | Main-thread orchestrator for worker messaging. | `initWorker`, `startWorker`, `syncWorker`, `flushWorker`, `requestBuffer`, `startExport` |
| `public/e2e-tools.ts` | Boot-time install of `window.ensemble` for E2E tests and scripts. | `installE2EGlobals` |
| `public/telemetry.ts` | Production-only, privacy-safe Umami analytics boundary. | `initializeTelemetry`, `track` |

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
| `public/state/share-codec.ts` | Share-URL / preset wire format: Unicode-safe Base64 + the minified section payload, plus the section-id generator deserialization mints. Main thread only. | `compressSections`, `decompressSections`, `encodeBase64Unicode`, `generateId` |
| `public/state/state-effects.ts` | Cross-module state side effects (Inversion of Control). | `handleEffects` |
| `public/state/state-hydration.ts` | Initial state loading and validation logic. | `hydrateState` |
| `public/state/persistence.ts` | LocalStorage session saving. | `saveCurrentState`, `debounceSaveState` |
| `public/state/history.ts` | Session history and undo/redo logic. | `pushHistory`, `undo` |

## Generative Engines (Worker Thread)

| Path | Responsibility | Key Logic |
| :--- | :--- | :--- |
| `public/engine/soloist-phrase-first.ts` | The soloist engine — phrase-first, theme-driven (the legacy `soloist.ts` was retired in epic #10). | `getSoloistNotePhraseFirst` |
| `public/engine/soloist-session.ts` | Soloist per-playback state reset (relocated from the retired `soloist.ts`). | `resetSoloistState` |
| `public/engine/soloist-seeder.ts` | Dynamic Head (Seed Melody) generation logic. | `generateSessionSeed` |
| `public/engine/bass-engine.ts` | Bass line generation & genre resolution. | `isBassActive`, `getBassNote` |
| `public/engine/bass-pump.ts` | The fixed-anchor octave pump (disco): anchor, repeat-pass target beat, variation draw. | `createBassPump`, `BassPump` |
| `public/engine/accompaniment.ts` | Chord comping and rhythmic backing. | `getAccompanimentNotes`, `compingState` |
| `public/engine/chords-engine.ts` | Chord parsing and harmonic analysis. | `getChordDetails` |
| `public/engine/note-spelling.ts` | Canonical pitch-class → letter-name spelling policy (sharp/flat by key), shared by the chart render path and the chord editor. | `spellPitchClass` |
| `public/engine/harmonies.ts` | Background pad/stab generation. | `getHarmonyNotes` |
| `public/engine/harmony-styles.ts` | Per-genre harmony idiom profiles (style/rhythm/voicing). | `HARMONY_GENRE_PROFILES`, `resolveHarmonyProfile` |
| `public/engine/soloist-config.ts` | Soloist style and register-profile data. | `STYLE_CONFIG`, `resolveSoloistStyle`, `getSoloistRegisterProfile` |
| `public/engine/soloist-devices.ts` | Melodic embellishment and run algorithms. | `consonantDoubleStopInterval`, `guitarDoubleStopVoice` |
| `public/engine/drum-seeder.ts` | Song-wide drum orchestration seeder. | `generateDrumOrchestration` |
| `public/engine/fills.ts` | Procedural drum fill generation. | `generateProceduralFill` |
| `public/engine/conductor.ts` | Global intensity and coordination logic. | `applyConductor`, `updateAutoConductor` |
| `public/engine/arc.ts` | Loop-driven intensity arc (head→build→peak→release). Synth-audit Epic 7 S4. | `loopArcMultiplier` |
| `public/engine/theory-scales.ts` | Scale degrees and mode definitions. | `getScaleForChord` |
| `public/engine/transpose.ts` | Single shared progression-text transposer for absolute transpose + relative-key switch. | `transposeChordText` |
| `public/engine/resolution.ts` | Harmonic resolution and transition logic. | `generateResolutionNotes` |
| `public/engine/arranger-utils.ts` | Arrangement unrolling and form utilities. | `unrollArrangement` |
| `public/engine/arrangement-layering.ts` | Per-engine intro/outro mute schedule (S5). | `INTRO_MUTES`, `OUTRO_MUTES`, `isIntroSectionLabel` |
| `public/engine/drop-mechanic.ts` | Drop/Breakdown structural-cut gate (genre + energy-delta). | `shouldFireDropMute`, `DROP_FRIENDLY_GENRES` |

## Engine Styles (Genre Logic)

| Path | Responsibility | Key Patterns |
| :--- | :--- | :--- |
| `public/engine/bass-styles.ts` | Genre-specific bass algorithms. | `checkBassActiveStyle` |
| `public/engine/chord-quality-sets.ts` | Dependency-free leaf of shared chord-quality classification Sets (keeps cross-engine const imports from dragging heavy lanes into a chunk). | `ALTERED_HOOK_QUALITIES` |
| `public/engine/chords-styles.ts` | Genre-specific chord voicing logic. | `getRootlessVoicing` |
| `public/engine/comping-cells.ts` | Pure deterministic comping-cell banks (per-genre 16th-step hit patterns) extracted from accompaniment.ts. | `FUNK_COMPING_CELLS`, `JAZZ_COMPING_CELLS`, `BOSSA_PARTIDO_ALTO_CELLS` |
| `public/engine/comping-emit.ts` | Standard comp lane hit decision + per-hit emission (coordination overlays, #715 statement/answer economy, #766 ring, #707 clamp) extracted from getAccompanimentNotes; compingState + coordination threaded explicitly. | `emitCompNotes`, `AccompanimentCoordination`, `CCEvent` |
| `public/engine/comping-state.ts` | The mutated-shared-singleton comp-memory struct (groove/voice-leading/statement memory) and its per-song reset ritual. | `compingState`, `resetCompingState`, `CompingState` |
| `public/engine/soloist-config.ts` | Style definitions and register profiles. | `STYLE_CONFIG` |
| `public/engine/grooves/` | 13 genre-specific drum strategies, one per canonical genre (see CLAUDE.md canon; Bossa's strategy is `latin.ts`), plus shared `utils.ts`. | `jazz.ts`, `rock.ts`, `funk.ts`, etc. |

## Engine Core (Internal)

| Path | Responsibility | Key Exports |
| :--- | :--- | :--- |
| `public/engine/scheduler-core.ts` | High-precision timing and lookahead. | `scheduler`, `togglePlay` |
| `public/engine/midi-scheduler.ts` | MIDI scheduling logic. | `dispatchMidiDrum`, `dispatchMidiSoloist` |
| `public/engine/platform-orchestrator.ts` | Platform specific lifecycle management. | `initPlatformHacks`, `startPlatformAudioAndWakeLock` |
| `public/engine/engine.ts` | Audio synthesis and instrument setup. | `initAudio`, `playNote` (re-export from `synth-chords`) |
| `public/engine/reverb.ts` | Algorithmic Schroeder/Freeverb reverb (shared reverb return). | `createAlgorithmicReverb`, `REVERB_PRESETS` |
| `public/engine/synth-utils.ts` | Shared WebAudio boilerplate (ramping, voices, seeded humanization). | `rampGain`, `killActiveVoices`, `humanizeNote` |
| `public/engine/audio-graph-utils.ts` | Leaf Web Audio graph helpers — imports nothing from the engine, so `synth-utils.ts` and `sample-voice.ts` can both use them without an import cycle. | `safeDisconnect`, `createSoftClipCurve`, `clampFreq` |
| `public/engine/coordination-engine.ts` | Inter-instrument rhythmic yielding. | `createCoordinationContext` |
| `public/engine/section-overrides.ts` | Per-section intensity + instrument-enabled override lookup. | `sectionAtStep`, `effectiveTargetIntensity`, `isInstrumentActiveAtStep` |
| `public/engine/voicing-policy.ts` | Shared bass-space and auto-grounding rules for comping voices. | `shouldReserveBassSpace`, `shouldPreferGroundedPracticeVoicing` |
| `public/engine/groove-engine.ts` | Rhythmic drum patterns (strategy routing, motifs, fills). | `getDrumMotif`, `applyGrooveOverrides` |
| `public/engine/hash-utils.ts` | Canonical deterministic hash + seeded-RNG helpers shared across engines. `scrambleHash` (stateless, seed-tuple-indexed) and `createPRNG` (stateful stream) are deliberately distinct — see `public/engine/CLAUDE.md` §27. | `scrambleHash`, `stringHash33`, `stringHash31`, `createPRNG` |
| `public/engine/soloist-mode-policy.ts` | Canonical soloist phrasing-mode rules and voice limits. | `resolveSoloistMode`, `getSoloistVoiceLimit` |
| `public/engine/clave.ts` | Canonical bossa son-clave spine + the offbeat clave cells (&-of-2/3/4) the lead accents. | `BOSSA_CLAVE_STEPS_4_4`, `BOSSA_OFFBEAT_CELL_STEPS_4_4`, `isBossaClaveStep` |
| `public/engine/soloist-pitch-engine.ts` | Chord-target-tones helper (guide/pillar tones by chord quality) for the phrase-first realizer; legacy `selectPitchAndDevices` picker removed in epic #10/#866. | `chordTargetTones` |
| `public/engine/worker-utils.ts` | Shared background thread utilities. | `getChordAtStep`, `recursiveSafeSync`, `resetCursors` |
| `public/engine/worker-orchestrator.ts` | Worker lifecycle and message management. | `workerContext`, `resetWorkerContext` |
| `public/engine/worker-buffer-manager.ts` | Generative buffer orchestration. | `fillBuffers` |
| `public/engine/tick-logic.ts` | Unified generative tick and transition logic. | `generateNotesForStep`, `applyWorkerTransition` |
| `public/engine/drums-tick.ts` | Lane-free drum preamble + drum-block tick (keeps heavy lane generators off the main chunk; real-time scheduler imports this). | `runDrumTick`, `generateDrumsForStep` |
| `public/engine/tick-types.ts` | Import-free leaf holding the shapes `tick-logic.ts` and `drums-tick.ts` share, so that pair stays one-directional. | `TickCursors`, `DrumHitInfo` |
| `public/engine/audio-recovery.ts` | Context resumption and error handling. | `audioWatchdog` |
| `public/engine/midi-utils.ts` | Shared MIDI byte conversion utilities. | `noteToMidi`, `midiToFreq` |
| `public/engine/midi-worker-logic.ts` | Offline MIDI generation and file export. | `handleExport`, `ExportProcessor` |
| `public/engine/midi-constants.ts` | Constants for MIDI logic like `DRUM_MAP`. | `DRUM_MAP` |
| `public/engine/mute-contract.ts` | Import-free leaf owning what a note's `muted` field means — the bass's numeric palm-mute amount vs the chords lanes' boolean CC-only sentinel; audible ghosts carry reduced velocity with `muted: false`. Read the field through here, never with `!muted`. | `isSilentSentinel`, `normalizeMuteAmount`, `muteGain` |
| `public/engine/velocity-shaping.ts` | Import-free leaf owning the band-intensity velocity laws: the soloist's swell, the conductor's band-wide curve, and (since #941) the bass lane's macro dynamic law — each shared by live playback and the `.mid` export. Change a curve here, never at a call site. | `soloistIntensityGain`, `conductorVelocityFor`, `bassMacroGain`, `BASS_MACRO_FLOOR`, `BASS_MACRO_SPAN` |

## Live vs Worker Responsibilities

- `public/worker-client.ts` owns main-thread worker lifecycle, delta sync, flush, resolution, and export requests.
- `public/logic-worker.ts` is the worker-side message dispatcher and reset coordinator.
- `public/engine/worker-buffer-manager.ts` and `public/engine/tick-logic.ts` own lookahead note generation inside the worker.
- `public/engine/worker-utils.ts` holds shared worker-side helpers such as `getChordAtStep`.
- `public/engine/scheduler-core.ts` stays on the main thread and schedules already-generated note events into WebAudio/MIDI time.

## Synthesis Engine (WebAudio)

| Path | Responsibility |
| :--- | :--- |
| `public/engine/instrument-registry.ts` | Instrument-source indirection: resolves each voice to a synth function or an installed sample-pack buffer (synth-fallback when no pack is loaded). |
| `public/engine/sample-loader.ts` | Lazy fetch + `decodeAudioData` + cache of sample-pack buffers into the instrument registry (atomic, deduped, fail-loud). |
| `public/engine/sample-voice.ts` | Sample playback: `playSampledNote` (pitched — nearest-zone + `playbackRate` shift) and `playSampledStrike` (percussion — native-rate, unfiltered drum hit), both through a click-free envelope into the instrument's gain bus; plus `pickRoundRobin` for deterministic take selection. |
| `public/engine/pack-runtime.ts` | Pack runtime glue: fetch a pack's manifest, load+decode its samples, and cache the built `SampleZone[]` the pitched seams consume (percussion packs build no zones — they play buffers by articulation key); `ensurePackLoaded` is idempotent (load-on-select / on audio init). |
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
| `public/data/smart-genres.ts` | High-level genre configurations + the genre-naming authority (canon name ↔ feel ↔ groove strategy key). | `SMART_GENRES`, `canonToFeel`, `feelToCanon`, `GROOVE_STRATEGY_BY_GENRE`, `isLatinGrooveFamily` |
| `public/data/chord-presets.ts` | Library chord progressions. | `CHORD_PRESETS` |
| `public/data/song-templates.ts` | Full song structure templates. | `SONG_TEMPLATES` |
| `public/data/instrument-styles.ts` | UI menu definitions for instruments. | `CHORD_STYLES`, `BASS_STYLES` |
| `public/data/shortcut-config.ts` | Centralized keyboard shortcuts. | `SHORTCUT_CONFIG` |
| `public/data/sound-packs.ts` | Catalog of installable sample packs surfaced in the Sounds settings section. | `SOUND_PACKS`, `packsForInstrument` |
| `public/data/genre-sound-map.ts` | Genre → instrument sound defaults consumed by Auto-follow mode (#675). | `GENRE_SOUND_MAP`, `autoVoiceForGenre` |

## UI Components (Preact)

| Category | Path | Responsibility |
| :--- | :--- | :--- |
| **Containers** | `public/App.tsx` | Root application shell — renders ChartSurface, GlobalShortcuts, Modals, FlashOverlay, and notification layers. |
| **Containers** | `public/components/FlashOverlay.tsx` | Full-screen "Visual Flash" beat/accent pulse — reads `playback.flashIntensity`, gated on `playback.visualFlash` (#1181). |
| **Surface** | `public/components/ChartSurface.tsx` | Chart-first single surface. Branches on `playback.chartLocked`: locked → `ChordVisualizer` (read-only), unlocked → `InlineEditor`. Topbar lock toggle pauses playback when unlocking. |
| **Surface** | `public/components/InlineEditor.tsx` | Inline section-card editor mounted on ChartSurface when unlocked. Hosts the Arranger + slim toolbar (Add Section, Tools menu, inspiration drawer). Replaces the deleted EditorModal. |
| **Controls** | `public/components/editor/SectionHeaderStrip.tsx` | Per-section direction strip — intensity slider + 5 tri-state instrument dots (D/B/C/H/S). Mounted above each section in both ChordVisualizer (locked) and SectionCard (unlocked). |
| **Controls** | `public/components/editor/ChordPicker.tsx` | Tap-a-chord popover for locked-mode chart edits. Diatonic + borrowed roots × 8 qualities; emits notation-aware text (`roman`/`nns`/`name`) via `onSelect`. Anchored to the tapped cell, dismisses on Esc / outside-tap. |
| **Workspaces** | `public/components/InstrumentRail.tsx` | Instrument rows (Drums · Bass · Chords · Harmony · Soloist) with Mixer and Band feel popovers. Accepts `orientation: 'vertical' | 'horizontal'`. |
| **Visuals** | `public/components/VisualizerOverlay.tsx` | Full-screen visualizer portal rendered on demand. Mounts into `document.body` via `createPortal`. |
| **Shared** | `public/components/UIControls.tsx` | Reusable UI toolkit. |
| **Shared** | `public/components/use-modal-a11y.ts` | `useModalA11y(ref, isOpen, onClose, ariaLabel?)` — applies `role="dialog"` + `aria-modal`, Esc-to-close, focus trap, and focus restoration to a modal container. |
| **Orchestration** | `public/components/Modals.tsx` | Lazy-loading modal orchestrator. |
| **Inspiration** | `public/components/SurpriseMe.tsx` | Single 🎲 entry point hosting three flows — Roll (instant random `generateSong`), Templates (`SONG_TEMPLATES`), Library (`PresetLibrary` replace/append). Replaces the prior GenerateSongModal + LibraryModal + LibraryDrawer trio. |
| **Orchestration** | `public/components/AuditionOverlay.tsx` | One-button "▶ Play" landing shown when the app is opened from an audition permalink (`?autoplay=1`); satisfies the browser autoplay gesture and starts the hydrated scene. |
| **Logic Views** | `public/components/Arranger.tsx` | Arranger editor surface (section-card list); mounted by `InlineEditor` when the chart is unlocked. |
| **Logic Views** | `public/components/ChordVisualizer.tsx` | Continuous lead-sheet renderer for arranger playback, density tiers, and maximized reading mode. |
| **Controls** | `public/components/Transport.tsx` | Playback controls and tempo. |
| **Icons** | `public/components/Icon.tsx` | Inline-SVG icon component (`<Icon name=… />`); tints via `currentColor`, sizes in em. |
| **Icons** | `public/components/icons.tsx` | The Ensemble icon set — `IconName` union + 24×24 path registry (controls + instrument glyphs). |
| **Visuals** | `public/components/Visualizer.tsx` | Canvas rendering container. |
| **Library** | `public/components/PresetLibrary.tsx` | Chord progression library modal. |
| **Settings** | `public/components/InstrumentSettings.tsx` | Reusable per-instrument settings surface used from Studio. |
| **Others** | `public/components/` | Functional modals and settings panels. |

## High-Level Controllers & Integration

| Path | Responsibility |
| :--- | :--- |
| `public/controllers/arranger-controller.ts` | High-level song structure manipulation. |
| `public/controllers/instrument-controller.ts` | Per-instrument state and preset routing. |
| `public/controllers/performance-controller.ts` | Real-time keyboard performance logic. |
| `public/controllers/practice-controller.ts` | Section practice — start-from-here / loop-a-section entry points (#1016). |
| `public/controllers/midi-controller.ts` | WebMIDI bridging and DAW sync. |
| `public/export/midi-export.ts` | Main-thread MIDI file triggers. |
| `public/export/audio-export.ts` | In-browser audio render: clones live state, drives `OfflineAudioContext` through the same engine path as playback, encodes to WAV. Powers the Share modal's "Download .wav". |
| `public/song/song-generator.ts` | Algorithmic song structure generation. |
| `public/song/song-generator-seed.ts` | Thin chord-text parser used by the Roll-the-Dice wizard: turns free-form Roman or letter notation into a chord-token array. |
| `public/song/lead-sheet-model.ts` | Shared lead-sheet shaping for 4-measure row packing, section markers, and density selection. |
| `public/platform.ts` | Browser hacks (WakeLock, Audio Unlock). |
| `public/export/sharing.ts` | URL-based song sharing. | `generateShareUrl`, `shareProgression` |
| `public/utils.ts` | Worker-safe musical/math primitives: pitch conversion + the step/meter timing core. No DOM, no Web Audio, no persistence. | `getFrequency`, `getStepInfo` |
| `public/sanitize.ts` | Main-thread string sanitization and display formatting (HTML escaping, dangerous-char stripping, ♯/♭ glyphs). | `escapeHTML`, `stripDangerousChars`, `formatUnicodeSymbols` |
| `public/data/manual-metadata.ts` | Generates the Self-Building Manual's auto-populated tables (`{{GENRE_TABLE}}`, `{{BASS_STYLES}}`, …) from the live config files. | `injectManualMetadata`, `generateGenreTable` |
| `public/visualizer/visualizer-events.ts` | Canonical visual event contract and track metadata for the Visuals workspace. | `VISUALIZER_TRACK_ORDER`, `queueVisualizerNoteEvent` |
| `public/visualizer/visualizer-proxy.ts` | Main-thread bridge to visualizer worker. |

## Infrastructure & Lifecycle (Internal)

| Path | Responsibility |
| :--- | :--- |
| `public/ui-root.tsx` | Preact application entry point and hydration. |
| `public/pwa.ts` | PWA install prompt management. |
| `public/pack-nudge.ts` | One-time "install a sound pack" onboarding nudge. | `maybeShowPackInstallNudge` |
| `public/ui.ts` | Lazy Proxy-based DOM access layer. |
| `public/worker-types.ts` | Shared message type definitions for workers. |
| `public/config.ts` | Global timing and musical constants. |
| `public/constants.ts` | Global visual and UI state constants. |
| `public/visualizer/visualizer-utils.ts` | Shared canvas math and drawing utilities. |

## Documentation, Parsing & Testing

| Path | Responsibility |
| :--- | :--- |
| `docs/README.md` | Documentation index and repo navigation hub. |
| `docs/VISION.md` | Product direction, open work items, and key decisions. |
| `docs/guides/PERFORMANCE_GUIDELINES.md` | Hot-loop performance notes for audio and scheduler code. |
| `docs/guides/musical-engine-patterns.md` | Reusable recipes for generative-engine work (5 smells, coordination, loop-awareness, final-stage multiplier discipline, seeded determinism). |
| `docs/guides/bundle-hygiene.md` | Reusable recipes for bundle-size + dead-code work (budgets-as-baselines, statically-DCE'd expectations, pre-flight grep tripwire, knip blind spots, code-splitting discipline). |
| `public/MANUAL.md` | User-facing guide with auto-generated tables. |
| `public/song/form-analysis.ts` | Song section and structure detection. |
| `.github/CONTRIBUTING.md` | Contributor workflow and validation checklist. |
| `.github/SECURITY.md` | Private vulnerability reporting guidance. |
| `.github/CODE_OF_CONDUCT.md` | Community behavior standards. |
| `tests/` | Unit, Integration, and E2E test suites. |
| `CLAUDE.md` | Primary operational guide and architectural rules. |
| `AGENTS.md` | Pointer to `CLAUDE.md` for AGENTS.md-aware tools. |
| `AI_MAP.md` | Codebase navigation (this file). |
