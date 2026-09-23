# Ensemble AI Map

This map provides a quick reference for AI agents to understand the responsibilities and key exports of the Ensemble codebase.

## Guide Hierarchy

- Start here when you need file ownership, entrypoints, or likely edit locations.
- Use `CLAUDE.md` for operational rules, architecture, and safety conventions. (`AGENTS.md` is a pointer to it.)
- Nested `CLAUDE.md` files (`public/CLAUDE.md`, `public/engine/CLAUDE.md`, `public/engine/grooves/CLAUDE.md`, `tests/CLAUDE.md`) hold directory-scoped load-bearing invariants and traps — sharper than this map or the root file, auto-loaded by tooling that walks the directory tree. Read the one for a directory before editing in it.
- Use `docs/README.md` for the docs index.
- The app is `prototypes/v2/` (React, Next static export); its source map, handoff and delivery
  rules start at `prototypes/v2/CLAUDE.md`. Since #1358 everything under `public/` below is the
  library that app compiles through the `@engine/*` alias — there is no second UI host.
- The v2 account API is a separate standalone Node service at `prototypes/v2-api/` (sibling of
  `prototypes/v2/`, not a subdirectory) — see `prototypes/v2-api/README.md`. `node:sqlite`
  schema/migrations as of #1187; WebAuthn registration/login ceremony modules (`src/auth/`) as
  of #1188; the session model (`src/auth/session.ts`) and the entire HTTP layer on Hono
  (`src/http/`, `src/server.ts`) as of #1189; passkey add/list/revoke and step-up
  re-authentication, gated by the one `isFreshlyAuthenticated` predicate (`src/auth/fresh-auth.ts`),
  as of #1190; single-use recovery codes and a restricted recovery-only session
  (`src/auth/recovery.ts`, `src/auth/rate-limit.ts`) as of #1191. No client wiring yet.
- If guidance conflicts, prefer live code/config first, then realign the docs so `CLAUDE.md` and `AI_MAP.md` stay reliable.

## Core Architecture

| Path | Responsibility | Key Exports / Symbols |
| :--- | :--- | :--- |
| `prototypes/v2/lib/runtime.ts` | The app's one engine host: worker init, dispatch subscriber (`syncWorker` + `handleEffects`), chart load/rebuild, transport. The only v2 file that calls `dispatch`/`getState`. | `initialize`, `toggle`, `stop` |
| `public/logic-worker.ts` | Main generative thread & orchestration. | `fillBuffers`, `processMessage` |
| `public/state.ts` | Central Redux-like state store. | `getState`, `dispatch`, `subscribe` |
| `public/types.ts` | Global Action constants and shared types. | `ACTIONS` |
| `public/controllers/app-controller.ts` | BPM updates with in-flight scheduler rescheduling (called from `state-effects.ts`), plus v1's palette/mode setters (no app caller since #1358). | `setBpm`, `setPalette`, `setMode` |
| `public/worker-client.ts` | Main-thread orchestrator for the live logic worker plus one-shot MIDI export workers. | `initWorker`, `startWorker`, `syncWorker`, `flushWorker`, `requestBuffer`, `startExport` |
| `public/midi-export-worker.ts` | One-shot MIDI export worker entry; owns a fresh module realm and detached generation state for each export. | worker message handler |
| `public/render-bridge.ts` | Puts engine internals on `window.ensemble` for the listening-gate tools (`mix:report` and the scripts built on it). Installed by the v2 runtime only in a `NEXT_PUBLIC_RENDER_BRIDGE=1` build. | `installRenderBridge` |
| `public/telemetry.ts` | Production-only, privacy-safe Umami analytics boundary. | `initializeTelemetry`, `track` |

## State Management (Domain Slices)

| Path | Domain Responsibility | Initial State |
| :--- | :--- | :--- |
| `public/state/playback.ts` | BPM, transport, and volume. | `playback` |
| `public/state/arranger.ts` | Chords, sections, time signature, and key. | `arranger` |
| `public/state/groove.ts` | Genre, intensity, and drum kit selection. | `groove` |
| `public/state/instruments.ts` | Per-instrument synthesis parameters. | `bass`, `soloist`, `harmony` |
| `public/state/midi.ts` | WebMIDI routing and local muting state. | `midi` |
| `public/state/visualizer.ts` | `vizState.enabled`: whether the scheduler queues visualizer note events (no visualizer ships; `mix:report`'s event capture turns it on). | `vizState` |
| `public/state/conductor.ts` | Macro-arc, intensity drift, and form iteration state. | `conductor` |
| `public/state/share-codec.ts` | Share-URL / preset wire format: Unicode-safe Base64 + the minified section payload, plus the section-id generator deserialization mints. Main thread only. | `compressSections`, `decompressSections`, `encodeBase64Unicode`, `generateId` |
| `public/state/state-effects.ts` | Cross-module state side effects (Inversion of Control). | `handleEffects` |
| `public/state/state-hydration.ts` | v1 session/URL hydration plus the validators v2's v1 import reuses. `hydrateState`/`loadFromUrl` have no app caller since #1358. | `validateSections`, `sanitizeDisplayString`, `hydrateState` |
| `public/state/persistence.ts` | v1 LocalStorage session saving; the v2 build swaps it for a no-op (`prototypes/v2/lib/legacy-persistence.ts`). | `saveCurrentState`, `debounceSaveState` |
| `public/state/history.ts` | Session history and undo/redo logic. | `pushHistory`, `undo` |

## Songbook Document Boundary

| Path | Responsibility | Key Exports / Symbols |
| :--- | :--- | :--- |
| `public/songbook/types.ts` | Version-1 portable chart and workspace-preference schemas, kept independent of live state slices. | `ChartDocument`, `ChartContent`, `WorkspacePreferences` |
| `public/songbook/codec.ts` | Pure complete-candidate validation plus JSON encode/decode, including explicit invalid/current/future-version results. | `validateChartDocument`, `decodeChartDocument`, `encodeChartDocument` |
| `public/songbook/score-types.ts` | Document-v2 authored-score types: exact events, measures, context, repeat and jump directions; isolated preview adoption preserves v1 sources. | `ChartDocumentV2`, `SemanticScore`, `ScoreMeasure`, `ScoreDirection` |
| `public/songbook/score-duration.ts` | Bounded rational quarter-note arithmetic and exact sixteenth-grid capability checks. | `scoreDuration`, `scoreMeter`, `durationToSteps` |
| `public/songbook/score-context.ts` | Shared key/mode/meter inheritance and beat-grouping reset for already-validated authored contexts. | `resolveScoreContext` |
| `public/songbook/score-form.ts` | Bounded repeat/ending and global D.C./D.S./Fine/coda traversal; preserves source identities and explicit repeat-after-jump policy. | `compileScoreForm`, `ScoreFormVisit` |
| `public/songbook/score-measure-events.ts` | Detached, bounded written-identity resolution of one-/two-bar references, with context and pair integrity checks. | `resolveScoreMeasureEvents` |
| `public/songbook/ireal-import.ts` | Source-preserving iReal import results, raw metadata and per-song blocking diagnostics. | `parseIRealImport`, `IRealImportResult` |
| `public/songbook/ireal-decode.ts` | Bounded inert HTML/link extraction, separate protocol envelopes and modern permutation decoder. | `decodeIRealInput`, `decodeIRealMusic` |
| `public/songbook/ireal-score.ts` | Conservative rhythm-cell and notation mapping into validated semantic scores; uncertain music blocks import. | `scoreFromIRealBody` |
| `public/songbook/score-playback.ts` | Bounded semantic-score playback capability checks and exact chord/measure maps over performed visits; preserves written context and existing voicing. | `prepareScorePlayback`, `renderScorePlayback`, `scoreArrangement` |
| `public/songbook/score-text.ts` | Complete-token chord-bar parsing/printing, meter-labelled lengths and alternate spellings; independent of voicing. | `parseChordBar`, `printChordBar`, `isScoreChord` |
| `public/songbook/score-codec.ts` | Detached authored-score validation, duration sums and source/marker reference integrity; not a performance itinerary compiler. | `validateSemanticScore` |
| `public/songbook/document-v2.ts` | Version-2 envelope codec alongside the unchanged version-1 reader; no implicit conversion. | `validateChartDocumentV2`, `decodeChartDocumentV2`, `encodeChartDocumentV2` |
| `public/songbook/legacy-score.ts` | Pure conservative v1 conversion proposals retaining original JSON, with blocking timing/spelling diagnostics. | `proposeLegacyScoreConversion` |
| `public/songbook/structural-limits.ts` | Pre-schema input ceilings for byte size, nesting depth, visited nodes, and section count. | `inspectSongbookStructure`, `SONGBOOK_MAX_INPUT_BYTES` |
| `public/songbook/state-ownership.ts` | Exhaustive document/preferences/runtime ownership for every top-level state field, plus the legacy-writer reachability manifest. | `STATE_OWNERSHIP_MANIFEST`, `LEGACY_PERSISTED_FIELD_OWNERSHIP` |
| `public/songbook/chart-link.ts` | v2 shareable-link codec: `#chart=<base64url(deflate(JSON))>` whole-document envelope (v1 or v2), distinct from `state/share-codec.ts`'s v1 sections-only `?s=` payload. Fails closed on any malformed/oversized/schema-invalid fragment. | `encodeChartLink`, `decodeChartLink` |

## Generative Engines (Worker Thread)

| Path | Responsibility | Key Logic |
| :--- | :--- | :--- |
| `public/engine/soloist-phrase-first.ts` | The soloist engine — phrase-first, theme-driven (the legacy `soloist.ts` was retired in epic #10). | `getSoloistNotePhraseFirst` |
| `public/engine/soloist-session.ts` | Soloist per-playback state reset (relocated from the retired `soloist.ts`). | `resetSoloistState` |
| `public/engine/soloist-seeder.ts` | Dynamic Head (Seed Melody) generation logic. | `generateSessionSeed` |
| `public/engine/bass-engine.ts` | Bass line generation & genre resolution. | `isBassActive`, `getBassNote` |
| `public/engine/bass-walking-route.ts` | Restrained Jazz walking routes with chart-derived root/slash arrivals and bounded contour. | `getJazzWalkingPitch` |
| `public/engine/bass-pump.ts` | The fixed-anchor octave pump (disco): anchor, repeat-pass target beat, variation draw. | `createBassPump`, `BassPump` |
| `public/engine/accompaniment.ts` | Chord comping and rhythmic backing. | `getAccompanimentNotes`, `compingState` |
| `public/engine/chords-engine.ts` | Chord parsing and harmonic analysis. | `getChordDetails` |
| `public/engine/note-spelling.ts` | Canonical pitch-class → letter-name spelling policy (sharp/flat by key), shared by the chart render path and the chord editor. | `spellPitchClass` |
| `public/data/note-names.ts` | Pure pitch-class name table; re-exported by config without pulling genre data into notation-only editors. | `KEY_ORDER` |
| `public/engine/harmonies.ts` | Background pad/stab generation. | `getHarmonyNotes` |
| `public/engine/harmony-styles.ts` | Per-genre harmony idiom profiles and section-relative pad phrase dynamics. | `HARMONY_GENRE_PROFILES`, `resolveHarmonyProfile`, `getPadPhraseGain` |
| `public/engine/harmony-moving-voice.ts` | Chart-derived, bounded moving-voice connections for Smart Rock/Acoustic pads. | `getMovingPadVoicing` |
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
| `public/engine/chord-facts.ts` | Chart harmonic facts independent of the chosen instrumental voicing. | `chordFacts` |
| `public/engine/guitar-player.ts` | Acoustic guitar shapes and meter-aware strums with authored performance timing. | `chooseGuitarShape`, `getGuitarNotes` |
| `public/engine/piano-player.ts` | Modern and Open modal piano phrase gestures and independent hand releases. | `getPianoNotes` |
| `public/engine/piano-voicings.ts` | Playable keyboard voicings with protected chord identity, connected hands and optional open spacing. | `voicePianoChord` |
| `public/engine/comping-cells.ts` | Pure deterministic comping-cell banks (per-genre 16th-step hit patterns) extracted from accompaniment.ts. | `FUNK_COMPING_CELLS`, `JAZZ_COMPING_CELLS`, `BOSSA_PARTIDO_ALTO_CELLS` |
| `public/engine/comping-emit.ts` | Standard comp lane hit decision + per-hit emission (coordination overlays, #715 statement/answer economy, #766 ring, #707 clamp) extracted from getAccompanimentNotes; compingState + coordination threaded explicitly. | `emitCompNotes`, `AccompanimentCoordination`, `CCEvent` |
| `public/engine/comping-state.ts` | The mutated-shared-singleton comp-memory struct (groove/voice-leading/statement memory), canonical initializer, and complete fresh-run reset ritual. | `compingState`, `resetCompingState`, `CompingState` |
| `public/engine/generation-run.ts` | Fresh-run boundary for hidden module-level harmony and comping memory shared by live, MIDI, and WAV generation hosts. | `resetHiddenGenerationMemory` |
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
| `public/engine/synth-utils.ts` | Shared WebAudio boilerplate (ramping, voices, velocity→timbre). | `rampGain`, `killActiveVoices`, `velocityTimbre` |
| `public/engine/humanize.ts` | Leaf module (imports only `hash-utils.ts`) owning the seeded humanization primitives every lane shares — bar-independent timing placement, bar-varying velocity/detune colour, the knob curve, and the position weighting. Consumed by both main-thread synth and worker-side engines. | `humanizePlacement`, `humanizeColor`, `humanizeScale`, `placementWeight`, `HUMANIZE_PROFILES` |
| `public/engine/audio-graph-utils.ts` | Leaf Web Audio graph helpers — imports nothing from the engine, so `synth-utils.ts` and `sample-voice.ts` can both use them without an import cycle. | `safeDisconnect`, `createSoftClipCurve`, `clampFreq` |
| `public/engine/coordination-engine.ts` | Inter-instrument rhythmic yielding. | `createCoordinationContext` |
| `public/engine/section-overrides.ts` | Per-section intensity + instrument-enabled override lookup. | `sectionAtStep`, `effectiveTargetIntensity`, `isInstrumentActiveAtStep` |
| `public/engine/voicing-policy.ts` | Shared bass-space and auto-grounding rules for comping voices. | `shouldReserveBassSpace`, `shouldPreferGroundedVoicing` |
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
| `public/engine/midi-utils.ts` | Shared MIDI byte conversion utilities. | `MidiEvent`, `writeString`, `writeInt32`, `writeInt16`, `entryBendToPitchWheel`, `normalizeMidiVelocity`, `MidiTrack` |
| `public/engine/midi-worker-logic.ts` | Offline MIDI generation and file export. | `handleExport`, `ExportProcessor` |
| `public/engine/midi-constants.ts` | Constants for MIDI logic like `DRUM_MAP`. | `DRUM_MAP` |
| `public/engine/mute-contract.ts` | Import-free leaf owning what a note's `muted` field means — the bass's numeric palm-mute amount vs the chords lanes' boolean CC-only sentinel; audible ghosts carry reduced velocity with `muted: false`. Read the field through here, never with `!muted`. | `isSilentSentinel`, `normalizeMuteAmount`, `muteGain` |
| `public/engine/velocity-shaping.ts` | Import-free leaf owning soloist phrase headroom and the band-intensity velocity laws: the soloist's swell, the conductor's band-wide curve, and the bass lane's macro dynamic law, shared by live playback and the `.mid` export. Change a curve here, never at a call site. | `reserveSoloistHeadroom`, `soloistIntensityGain`, `conductorVelocityFor`, `bassMacroGain`, `BASS_MACRO_FLOOR`, `BASS_MACRO_SPAN` |

## Live vs Worker Responsibilities

- `public/worker-client.ts` owns main-thread live-worker lifecycle, delta sync, flush, resolution, and one-shot export-worker lifecycle.
- `public/logic-worker.ts` is the live worker's message dispatcher and reset coordinator; it never owns MIDI export work.
- `public/midi-export-worker.ts` owns one detached MIDI export per fresh module realm.
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
| `public/data/chord-presets.ts` | v1's library chord progressions. No app importer since #1358 (tests only). | `CHORD_PRESETS` |
| `public/data/song-templates.ts` | v1's full song structure templates. No app importer since #1358 (tests only). | `SONG_TEMPLATES` |
| `public/data/instrument-styles.ts` | UI menu definitions and shared player availability. | `CHORD_STYLES`, `BASS_STYLES`, `getChordPlayerChoices` |
| `public/data/sound-packs.ts` | Catalog of installable sample packs, read by v2's `lib/sounds.ts`. | `SOUND_PACKS`, `packsForInstrument` |
| `public/data/genre-sound-map.ts` | Genre → instrument sound defaults consumed by Auto-follow mode (#675). | `GENRE_SOUND_MAP`, `autoVoiceForGenre` |

## UI (the v2 app)

`prototypes/v2/app/` holds every surface (songbook, chart sheet, transport, edit panel, sounds
panel, account pages) and `prototypes/v2/lib/` the runtime bridge, songbook repository and
account sync. Per-surface ownership is the navigation table in `prototypes/v2/CLAUDE.md`.

## High-Level Controllers & Integration

| Path | Responsibility |
| :--- | :--- |
| `public/controllers/arranger-controller.ts` | High-level song structure manipulation. |
| `public/controllers/instrument-controller.ts` | Per-instrument state and preset routing. |
| `public/controllers/performance-controller.ts` | Real-time performance triggers (drum hits, solo notes); reached from `midi-controller.ts`'s MIDI input. |
| `public/controllers/practice-controller.ts` | Section practice — start-from-here / loop-a-section entry points (#1016). |
| `public/controllers/midi-controller.ts` | WebMIDI bridging and DAW sync. |
| `public/export/midi-export.ts` | Main-thread MIDI file triggers. |
| `public/export/audio-export.ts` | In-browser audio render: clones live state, drives `OfflineAudioContext` through the same engine path as playback, encodes to WAV. Powers v2's audio export. |
| `public/export/detached-generation-state.ts` | Shared worker-safe/offline-render state clone: preserves generation settings while stripping live handles and runtime buffers. |
| `public/song/song-generator.ts` | Algorithmic song structure generation (v1's Roll). No app importer since #1358 (tests only). |
| `public/song/song-generator-seed.ts` | Thin chord-text parser from v1's Roll-the-Dice wizard: free-form Roman or letter notation into a chord-token array. No app importer since #1358 (tests only). |
| `public/song/lead-sheet-model.ts` | Shared lead-sheet shaping for 4-measure row packing, section markers, and density selection. |
| `public/platform.ts` | Browser hacks (WakeLock, Audio Unlock). |
| `public/utils.ts` | Worker-safe musical/math primitives: pitch conversion + the step/meter timing core. No DOM, no Web Audio, no persistence. | `getFrequency`, `getStepInfo` |
| `public/sanitize.ts` | Main-thread string sanitization and display formatting (HTML escaping, dangerous-char stripping, ♯/♭ glyphs). | `escapeHTML`, `stripDangerousChars`, `formatUnicodeSymbols` |
| `public/visualizer/visualizer-events.ts` | Note-event contract the scheduler queues when `vizState.enabled`; kept for `mix:report`'s event capture. | `queueVisualizerNoteEvent`, `VisualizerQueuedEvent` |

## Infrastructure & Lifecycle (Internal)

| Path | Responsibility |
| :--- | :--- |
| `public/ui.ts` | Toast and flash dispatch helpers (`showToast`, `triggerFlash`) plus the toast-action registry. |
| `public/worker-types.ts` | Shared message type definitions for workers. |
| `public/config.ts` | Global timing and musical constants. |
| `public/meter.ts` | Validated effective-meter resolution for authored rhythmic grouping. |
| `public/constants.ts` | Global visual and UI state constants. |

## Documentation, Parsing & Testing

| Path | Responsibility |
| :--- | :--- |
| `docs/README.md` | Documentation index and repo navigation hub. |
| `docs/VISION.md` | Product direction, open work items, and key decisions. |
| `docs/guides/PERFORMANCE_GUIDELINES.md` | Hot-loop performance notes for audio and scheduler code. |
| `docs/guides/musical-engine-patterns.md` | Reusable recipes for generative-engine work (5 smells, coordination, loop-awareness, final-stage multiplier discipline, seeded determinism). |
| `docs/guides/bundle-hygiene.md` | Reusable recipes for bundle-size + dead-code work (budgets-as-baselines, statically-DCE'd expectations, pre-flight grep tripwire, knip blind spots, code-splitting discipline). |
| `public/song/form-analysis.ts` | Song section and structure detection. |
| `.github/CONTRIBUTING.md` | Contributor workflow and validation checklist. |
| `.github/SECURITY.md` | Private vulnerability reporting guidance. |
| `.github/CODE_OF_CONDUCT.md` | Community behavior standards. |
| `tests/` | Vitest unit, integration, critique (`standards/`) and browser-mode suites. The app's Playwright suite is `prototypes/v2/checks/`. |
| `CLAUDE.md` | Primary operational guide and architectural rules. |
| `AGENTS.md` | Pointer to `CLAUDE.md` for AGENTS.md-aware tools. |
| `AI_MAP.md` | Codebase navigation (this file). |
