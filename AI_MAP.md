# Ensemble AI Map

This map provides a quick reference for AI agents to understand the responsibilities and key exports of the Ensemble codebase.

## Guide Hierarchy

- Start here when you need file ownership, entrypoints, or likely edit locations.
- Use `CLAUDE.md` for operational rules, architecture, and safety conventions. (`AGENTS.md` is a pointer to it.)
- Nested `CLAUDE.md` files (`band/CLAUDE.md`, `public/CLAUDE.md`, `public/engine/CLAUDE.md`, `tests/CLAUDE.md`) hold directory-scoped load-bearing invariants and traps — sharper than this map or the root file, auto-loaded by tooling that walks the directory tree. Read the one for a directory before editing in it.
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
| `prototypes/v2/lib/runtime.ts` | The app's one engine host: the dispatch subscriber (`handleEffects` + `syncBand`), chart load/rebuild, the band's transport and exports. The only v2 file that calls `dispatch`/`getState`. | `initialize`, `toggle`, `stop` |
| `public/state.ts` | Central Redux-like state store. | `getState`, `dispatch`, `subscribe` |
| `public/types.ts` | Global Action constants and shared types. | `ACTIONS` |
| `public/controllers/app-controller.ts` | BPM updates with in-flight scheduler rescheduling (called from `state-effects.ts`), plus v1's palette/mode setters (no app caller since #1358). | `setBpm`, `setPalette`, `setMode` |
| `public/telemetry.ts` | Production-only, privacy-safe Umami analytics boundary. | `initializeTelemetry`, `track` |

## Band Engine (`band/`, the engine the app plays)

The ground-up replacement for the generative engine, the default since 2026-09-25; see `docs/design/band-engine.md` and `band/CLAUDE.md`.

| Path | Responsibility | Key Exports / Symbols |
| :--- | :--- | :--- |
| `band/index.ts` | Public surface for hosts. | `compileTimeline`, `performPass`, `toMidi`, `STYLES` |
| `band/perform.ts` | The engine: one pass of the song, lanes in order, then feel. | `performPass` |
| `band/form/timeline.ts` | SemanticScore → performed bars in ticks (form, holds, N.C., fermatas, meters, phrases). | `compileTimeline`, `secondsAt` |
| `band/theory/chord.ts` | The one chord authority: symbol → `ChordFacts` (tones, family, guides, scale). | `parseChord`, `chordPcs` |
| `band/arrange/plan.ts` | Per-bar energy, lanes, fills, crashes, ending. | `planBars`, `energyTier` |
| `band/feel/feel.ts` | The timing law: swing geometry, lane lean, seeded character. | `applyFeel` |
| `band/styles/index.ts` | Style registry; each style is one file (`rock.ts`, `jazz.ts`, `funk.ts`, `bossa.ts`, `blues.ts`, `reggae.ts`, `country.ts`, `hiphop.ts`, `disco.ts`, `neosoul.ts`, `metal.ts`, `skapunk.ts`, `acoustic.ts`): feel + drums, bass and comp (keyboard and guitar) idioms, and a lead book where the style has one. | `STYLES`, `feelFor` |
| `band/players/` | Shared idiom machinery: `drums/kit.ts`, `bass/line.ts`, `comp/idiom.ts`, `grid.ts`. | `drumIdiom`, `compIdiom`, `strums`, `bassNote` |
| `band/players/comp/` | The comp: instruments (range, strum, sustain), keyboard voicings, fretboard grips. | `COMP_INSTRUMENTS`, `voice`, `grip`, `isPlayable` |
| `band/players/lead/` | The lead (soloist lane): its instruments, its form (head, three solo choruses as one arc), phrase planning from a style's `LeadBook`, the targets-first line, note palettes. | `leadIdiom`, `leadRole`, `voiceLine`, `LEAD_INSTRUMENTS` |
| `band/sinks/midi.ts` | BandEvent[] → Standard MIDI File. | `toMidi` |
| `band/test/` | Fixture charts, the invariant suite, the critique (`critique/harness.ts` metric library; `claims/<id>.ts` one claims file per style). | `FIXTURES`, `defineClaims`, `METRICS` |
| `scripts/band-render.ts` | `npm run band:render` — `.mid` + text grid from node. | CLI |
| `prototypes/v2/lib/band-host.ts` | Live host for the band engine: segments on the audio clock, regenerate-at-barline, voice adapter (`playBandEvent`) onto today's synth/sample voices, metronome. Driven only by `runtime.ts`. | `BandHost`, `playBandEvent` |
| `prototypes/v2/lib/band-export.ts` | The offline render of band events (`renderBandPasses`: passes back to back through `band-host.ts`'s `playBandEvent` against an `OfflineAudioContext`, raw channel data out) and the WAV/stem export built on it, so an export matches live playback. Stems are drums/bass/chords (the comp)/soloist (the lead). | `renderBandPasses`, `renderBandMixToWav`, `renderBandStemsToWav` |
| `prototypes/v2/lib/band-voices.ts` | The app's names for the band's parts: genre → style, lane sound → comp/lead instrument. Type-only imports, so `scripts/band-scene.ts` reads the same tables in node. | `STYLE_FOR_GENRE`, `COMP_FOR_VOICE`, `LEAD_FOR_VOICE` |
| `prototypes/v2/lib/render-bridge.ts` | The listening-gate tools' page side, on `window.ensemble`: renders band events it is handed through `renderBandPasses` on pinned lane sounds, returns channels plus a dispatch tap. Installed by `runtime.ts` only in a `NEXT_PUBLIC_RENDER_BRIDGE=1` build. | `installRenderBridge` |
| `scripts/band-scene.ts` | The listening-gate tools' node side: a `mix:report` scene → score → `compileTimeline` → `performPass` passes; settings, schedule analysis and the `--write-events` dump. | `performSceneForReport`, `sceneSettings`, `buildEventDump` |
| `prototypes/v2/lib/band-chart.ts` | The chart sheet's view of a score on the band engine, from the score + band timeline: every written event (holds, N.C., fermatas, off-grid lengths), its performed slots, section loop windows, chord names in all three notations. | `bandChart`, `slotAt`, `chordNames` |
| `prototypes/v2/lib/engine-mode.ts` | `checkPlayable`, the one capability check every open/edit/import path asks: the score is valid and its timeline compiles. | `checkPlayable` |

## State Management (Domain Slices)

| Path | Domain Responsibility | Initial State |
| :--- | :--- | :--- |
| `public/state/playback.ts` | BPM, transport, and volume. | `playback` |
| `public/state/arranger.ts` | Chords, sections, time signature, and key. | `arranger` |
| `public/state/groove.ts` | Genre, intensity, and drum kit selection. | `groove` |
| `public/state/instruments.ts` | Per-instrument synthesis parameters. | `bass`, `soloist`, `harmony` |
| `public/state/midi.ts` | WebMIDI routing and local muting state. | `midi` |
| `public/state/visualizer.ts` | `vizState.enabled`: whether the scheduler queues visualizer note events (no visualizer ships; only the old engine's scheduler reads it, and the app no longer runs it). | `vizState` |
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

## Chords & Notation

| Path | Responsibility | Key Logic |
| :--- | :--- | :--- |
| `public/engine/chords-engine.ts` | Chord parsing for a measure-less chart's display and chord audition (`arranger.progression`). | `validateProgression`, `getChordDetails` |
| `public/engine/note-spelling.ts` | Canonical pitch-class → letter-name spelling policy (sharp/flat by key), shared by the chart render path and the chord editor. | `spellPitchClass` |
| `public/data/note-names.ts` | Pure pitch-class name table; re-exported by config without pulling genre data into notation-only editors. | `KEY_ORDER` |
| `public/engine/transpose.ts` | Single shared progression-text transposer for absolute transpose + relative-key switch. | `transposeChordText` |

## Voice Data

| Path | Responsibility | Key Patterns |
| :--- | :--- | :--- |
| `public/engine/chords-styles.ts` | Chord intervals and rootless-voicing choices for the parsed progression. | `getIntervals` |
| `public/engine/voicing-policy.ts` | Rootless-voicing rules and voice-leading cost for the parsed progression. | `shouldUseRootlessVoicing`, `getNearestVoiceLeadingCost` |
| `public/engine/soloist-config.ts` | The soloist voice's per-style timbre settings. | `STYLE_CONFIG`, `resolveSoloistStyle` |

## Engine Core (Internal)

| Path | Responsibility | Key Exports |
| :--- | :--- | :--- |
| `public/engine/platform-orchestrator.ts` | Platform specific lifecycle management. | `startPlatformAudioAndWakeLock`, `stopPlatformAudioAndWakeLock` |
| `public/engine/engine.ts` | Audio synthesis and instrument setup. | `initAudio`, `playNote` (re-export from `synth-chords`) |
| `public/engine/reverb.ts` | Algorithmic Schroeder/Freeverb reverb (shared reverb return). | `createAlgorithmicReverb`, `REVERB_PRESETS` |
| `public/engine/synth-utils.ts` | Shared WebAudio boilerplate (ramping, voices, velocity→timbre). | `rampGain`, `killActiveVoices`, `velocityTimbre` |
| `public/engine/humanize.ts` | Leaf module (imports only `hash-utils.ts`) owning the seeded humanization primitives every lane shares — bar-independent timing placement, bar-varying velocity/detune colour, and the knob curve, used by the synth voices. | `humanizePlacement`, `humanizeColor`, `humanizeScale`, `HUMANIZE_PROFILES` |
| `public/engine/audio-graph-utils.ts` | Leaf Web Audio graph helpers — imports nothing from the engine, so `synth-utils.ts` and `sample-voice.ts` can both use them without an import cycle. | `safeDisconnect`, `createSoftClipCurve`, `clampFreq` |
| `public/engine/section-overrides.ts` | Per-section instrument-enabled overrides and practice-loop step folding for a measure-less chart. | `isInstrumentActiveAtStep`, `isInstrumentEverActive`, `foldPracticeStep` |
| `public/engine/hash-utils.ts` | Canonical deterministic hash helpers. `scrambleHash` is stateless and seed-tuple-indexed — see `public/engine/CLAUDE.md` §27. | `scrambleHash`, `stringHash33`, `stringHash31` |
| `public/engine/soloist-mode-policy.ts` | Canonical soloist phrasing-mode rules and voice limits. | `resolveSoloistMode`, `getSoloistVoiceLimit` |
| `public/engine/audio-recovery.ts` | Context resumption and error handling. | `audioWatchdog` |
| `public/engine/mute-contract.ts` | Import-free leaf owning what a note's `muted` field means — the bass's numeric palm-mute amount vs the chords lanes' boolean CC-only sentinel; audible ghosts carry reduced velocity with `muted: false`. Read the field through here, never with `!muted`. | `normalizeMuteAmount`, `muteGain` |
| `public/engine/velocity-shaping.ts` | Import-free leaf owning the bass voice's velocity-to-amplitude law. Change it here, never at a call site. | `bassVelocityToAmplitude`, `BASS_VELOCITY_DOMAIN_MAX` |

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
| `public/controllers/practice-controller.ts` | Section practice — start-from-here / loop-a-section entry points (#1016). |
| `public/export/detached-generation-state.ts` | Offline-render state clone (the band's WAV export and the listening-gate tools): preserves generation settings while stripping live handles and runtime buffers. |
| `public/song/lead-sheet-model.ts` | Shared lead-sheet shaping for 4-measure row packing, section markers, and density selection. |
| `public/platform.ts` | Browser hacks (WakeLock, Audio Unlock). |
| `public/utils.ts` | Pure musical/math primitives: pitch conversion + the step/meter timing core. No DOM, no Web Audio, no persistence. | `getFrequency`, `getStepInfo` |
| `public/sanitize.ts` | Main-thread string sanitization and display formatting (HTML escaping, dangerous-char stripping, ♯/♭ glyphs). | `escapeHTML`, `stripDangerousChars`, `formatUnicodeSymbols` |
| `public/visualizer/visualizer-events.ts` | Note-event contract the scheduler queues when `vizState.enabled`; kept only because the old engine's scheduler, which the app no longer runs, queues through it. | `queueVisualizerNoteEvent`, `VisualizerQueuedEvent` |

## Infrastructure & Lifecycle (Internal)

| Path | Responsibility |
| :--- | :--- |
| `public/ui.ts` | Toast and flash dispatch helpers (`showToast`, `triggerFlash`) plus the toast-action registry. |
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
| `.github/CONTRIBUTING.md` | Contributor workflow and validation checklist. |
| `.github/SECURITY.md` | Private vulnerability reporting guidance. |
| `.github/CODE_OF_CONDUCT.md` | Community behavior standards. |
| `tests/` | Vitest unit, integration, critique (`standards/`) and browser-mode suites. The app's Playwright suite is `prototypes/v2/checks/`. |
| `CLAUDE.md` | Primary operational guide and architectural rules. |
| `AGENTS.md` | Pointer to `CLAUDE.md` for AGENTS.md-aware tools. |
| `AI_MAP.md` | Codebase navigation (this file). |
