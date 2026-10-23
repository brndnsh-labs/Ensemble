# Ensemble AI Map

This map provides a quick reference for AI agents to understand the responsibilities and key exports of the Ensemble codebase.

## Guide Hierarchy

- Start here when you need file ownership, entrypoints, or likely edit locations.
- Use `CLAUDE.md` for operational rules, architecture, and safety conventions. (`AGENTS.md` is a pointer to it.)
- Nested `CLAUDE.md` files (`band/CLAUDE.md`, `core/CLAUDE.md`, `core/engine/CLAUDE.md`, `tests/CLAUDE.md`) hold directory-scoped load-bearing invariants and traps — sharper than this map or the root file, auto-loaded by tooling that walks the directory tree. Read the one for a directory before editing in it.
- Use `docs/README.md` for the docs index.
- The app is `web/` (React, Next static export); its source map, handoff and delivery
  rules start at `web/CLAUDE.md`. Since #1358 everything under `core/` below is the
  library that app compiles through the `@core/*` alias — there is no second UI host.
- The v2 account API is a separate standalone Node service at `api/` (sibling of
  `web/`, not a subdirectory) — see `api/README.md`. `node:sqlite`
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
| `web/lib/runtime.ts` | The app's one engine host: the dispatch subscriber (`handleEffects` + `syncBand`), chart load/rebuild, the band's transport and exports, and the stopped-only auditions (a chart chord; the neck's grip as a strum, #1596). The only v2 file that calls `dispatch`/`getState`. | `initialize`, `toggle`, `stop`, `audition`, `auditionPitches` |
| `web/lib/telemetry.ts` | Production-only, privacy-safe Umami analytics boundary (#1389) — UI-host code, not engine library, so it lives here rather than in `core/`. | `initializeTelemetry`, `track` |
| `web/lib/standards.ts` | The read-only standards catalog (#1439): blues forms, jazz standards and genre grooves, never persisted, identical for guest and account. Builds a fresh, codec-validated `ChartDocumentV2` per open from pure genre config (`SMART_GENRES`, `genreSwing`), no live runtime call. Replaced `lib/starters.ts`'s old auto-seeded sample songs. | `STANDARDS`, `buildStandardDocument`, `standardFor`, `firstBarsPreview` |
| `web/lib/navigation.ts` | Browser history for the shell's views (#1700): the entry shape (`NavEntry` — a view plus its depth, a song one above the page it was opened from), and `stepTo`, which says whether reaching a view pushes, replaces or goes back. State-only — the URL never changes. Pure; `app/ensemble.tsx` owns the popstate listener and applies entries through its own open/close paths. | `NavEntry`, `NavView`, `stepTo`, `isNavEntry`, `navKey` |
| `web/lib/home.ts` | What the songbook home reads (#1441): the request (Continue id + opened-at ids, bounded), the raw-read shape both stores fill, and `settleHome`, which validates it tolerantly — a corrupt document is left out and counted, never fatal. Type-only imports, so the account store can use it without the engine. | `homeRequest`, `settleHome`, `HOME_ROWS`, `openedAgo` |
| `web/lib/collections.ts` | Collections (#1474): the second synced document kind — a named, ordered list of song ids. Its decoder (rebuilds in one field order, refuses unknown fields), `isCollectionCandidate` (the `kind` test every synced-document reader dispatches on; a chart has none) and `resolvedSongIds` (the read-time filter that never rewrites the list). Since #1477 also the built-in Starred (`STARRED_COLLECTION_ID`, one fixed id so two devices' lazy creates meet as a conflict) and the conflict merge (`mergeSongIds`: union, local order first). The UI reads it through `app/use-collections.ts`. Relative imports only: the account API bundles it through `lib/sync/protocol.ts`. | `CollectionDocument`, `decodeCollection`, `isCollectionCandidate`, `resolvedSongIds`, `STARRED_COLLECTION_ID`, `mergeSongIds`, `songsOnlyIn` |
| `web/lib/playlist-import.ts` | A whole iReal playlist imported as a collection (#1478): every song built and checked in slices (`planPlaylist`), then settled against the live songbook (`resolvePlaylistImport` — duplicates by title + composer, refused songs, a same-named collection to add to). Pure; the writes are `repository.importSongs` (guest) and `AccountSongbook.importPlaylist` (account, one transaction, cap re-checked by `capRefusal`). | `planPlaylist`, `resolvePlaylistImport`, `collectionWrite`, `songKey`, `framePace` |
| `web/lib/first-bars.ts` | The Continue card's preview: a chart's own first written bars as chord text, `%` repeats resolved. | `firstBars` |
| `web/lib/song-mode.ts` | Song mode's chorus count (#1784): the 1–16 choruses of a looping chart whose compiled performance lands nearest a target length (ties up), as a counted copy of the score and its timeline; pure, never writes the chart. Played by `runtime.ts` (`songPlan`). | `planSong`, `songPlanText` |
| `core/state.ts` | Central Redux-like state store. | `getState`, `dispatch`, `subscribe` |
| `core/types.ts` | Global Action constants and shared types. | `ACTIONS` |

## Band Engine (`band/`, the engine the app plays)

The ground-up replacement for the generative engine, the default since 2026-09-25; see `docs/design/band-engine.md` and `band/CLAUDE.md`.

| Path | Responsibility | Key Exports / Symbols |
| :--- | :--- | :--- |
| `band/index.ts` | Public surface for hosts. | `compileTimeline`, `performPass`, `toMidi`, `STYLES` |
| `band/perform.ts` | The engine: one pass of the song, lanes in order, then feel. | `performPass` |
| `band/form/timeline.ts` | SemanticScore → performed bars in ticks (form, holds, N.C., fermatas, meters, phrases; a counted chart's every chorus). | `compileTimeline`, `secondsAt`, `chorusBars` |
| `band/theory/chord.ts` | The one chord authority: symbol → `ChordFacts` (tones, family, guides, scale). | `parseChord`, `chordPcs` |
| `band/arrange/cycle.ts` | What each pass (or counted chorus) is for: head, solo choruses, or turns traded with the player. | `leadRole`, `CYCLE` |
| `band/arrange/plan.ts` | Per-bar energy, lanes, fills, crashes, ending, the lead's role. | `planBars`, `energyTier` |
| `band/arrange/ending.ts` | The held ending: a pass that ends resolves a final turnaround to the tonic, in the style's own quality (`Style.ending`). | `heldEnding` |
| `band/feel/feel.ts` | The timing law: swing geometry, lane lean, seeded character. | `applyFeel` |
| `band/styles/index.ts` | Style registry; each style is one file (`rock.ts`, `jazz.ts`, `funk.ts`, `bossa.ts`, `blues.ts`, `reggae.ts`, `country.ts`, `hiphop.ts`, `disco.ts`, `neosoul.ts`, `metal.ts`, `skapunk.ts`, `acoustic.ts`): feel + drums, bass and comp (keyboard and guitar) idioms, and a lead book where the style has one. | `STYLES`, `feelFor` |
| `band/players/` | Shared idiom machinery: `drums/kit.ts`, `bass/line.ts`, `comp/idiom.ts`, `grid.ts`. | `drumIdiom`, `compIdiom`, `strums`, `bassNote` |
| `band/players/comp/` | The comp: instruments (range, strum, sustain), keyboard voicings, fretboard grips. | `COMP_INSTRUMENTS`, `voice`, `grip`, `isPlayable` |
| `band/players/lead/` | The lead (soloist lane): its instruments, its form (head, three solo choruses as one arc), phrase planning from a style's `LeadBook`, the targets-first line, note palettes. | `leadIdiom`, `leadRole`, `voiceLine`, `LEAD_INSTRUMENTS` |
| `band/sinks/midi.ts` | BandEvent[] → Standard MIDI File. | `toMidi` |
| `band/test/` | Fixture charts, the invariant suite, the critique (`critique/harness.ts` metric library; `claims/<id>.ts` one claims file per style). | `FIXTURES`, `defineClaims`, `METRICS` |
| `scripts/band-render.ts` | `npm run band:render` — `.mid` + text grid from node. | CLI |
| `web/lib/band-host.ts` | Live host for the band engine: segments on the audio clock, regenerate-at-barline, voice adapter (`playBandEvent`) onto today's synth/sample voices, metronome. A counted chart plays its choruses once, a chorus per segment, then stops (`onEnd`). Driven only by `runtime.ts`. | `BandHost`, `playBandEvent` |
| `web/lib/band-export.ts` | The offline render of band events (`renderBandPasses`: passes back to back through `band-host.ts`'s `playBandEvent` against an `OfflineAudioContext`, raw channel data out) and the WAV/stem export built on it, so an export matches live playback. Stems are drums/bass/chords (the comp)/soloist (the lead). | `renderBandPasses`, `renderBandMixToWav`, `renderBandStemsToWav` |
| `web/lib/band-voices.ts` | The app's names for the band's parts: genre → style, lane sound → comp/lead instrument. Type-only imports, so `scripts/band-scene.ts` reads the same tables in node. | `STYLE_FOR_GENRE`, `COMP_FOR_VOICE`, `compForChordsLane`, `LEAD_FOR_VOICE` |
| `web/lib/render-bridge.ts` | The listening-gate tools' page side, on `window.ensemble`: renders band events it is handed through `renderBandPasses` on pinned lane sounds, returns channels plus a dispatch tap. Installed by `runtime.ts` only in a `NEXT_PUBLIC_RENDER_BRIDGE=1` build. | `installRenderBridge` |
| `scripts/band-scene.ts` | The listening-gate tools' node side: a `mix:report` scene → score → `compileTimeline` → `performPass` passes; settings, schedule analysis and the `--write-events` dump. | `performSceneForReport`, `sceneSettings`, `buildEventDump` |
| `scripts/node-webaudio.ts` | Web Audio in node for the listening-gate tools: `node-web-audio-api` as the globals, `/packs/` served from disk through ffmpeg, and the shim for the library's differences from Chromium (envelope events evaluated before their start, hot sawtooth/square). | `installDiskPackFetcher` |
| `scripts/mix-render-node.ts` | `mix:report`'s node render backend: the bridge's `renderBand` on node Web Audio, measured with `audio-analysis.ts`. | `createNodeRenderer` |
| `scripts/render-node.ts` | `npm run render:node`: a scene's stem WAVs through the node backend, no report. | — |
| `scripts/live-capture.ts` | `npm run live:capture`: records the stand's LIVE transport through the bridge build's master-bus tap, then checks Stop silence, a click at Stop, tempo against the grid, and live-vs-offline level on the stand's own sounds. | `runLiveCapture`, `sceneUrl` |
| `scripts/live-checks.ts` | The pure checks behind `live:capture`: `stopSilence`, `stopClick`, `tempoFit`, `compareLevels`, `denseBandShares`. | — |
| `scripts/webaudio-parity.ts` | `npm run webaudio:parity`: the same Web Audio graph snippets rendered in node and in Chromium, compared per probe — the method behind the node renderer's fidelity notes. | `compareProbe`, `parseParityArgs` |
| `scripts/golden-render.ts` | `npm run golden`: renders the frozen requests in `tests/golden/fixtures/` in node and compares each stem's fingerprint with the committed ones — the CI check that fixed notes still sound the same (#1577). | `fingerprint`, `compareFingerprints`, `freezeScene`, `GOLDEN_SCENES`, `TOLERANCE` |
| `web/lib/band-chart.ts` | The chart sheet's view of a score on the band engine, from the score + band timeline: every written event (holds, N.C., fermatas, off-grid lengths), its performed slots, section step bounds, chord names in all three notations. | `bandChart`, `slotAt`, `chordNames` |
| `web/lib/engine-mode.ts` | `checkPlayable`, the one capability check every open/edit/import path asks: the score is valid and its timeline compiles. | `checkPlayable` |
| `web/lib/voicings/index.ts` | The voicings engine's public surface (shell voicings and triad grips, #1585/#1588): three-note R/3/7 shells for 7th chords, closed triads in three inversions and power chords (#1588), on guitar and ukulele; a Viterbi pass over grips and one over fingers, root-motion and finger-move narration. Pure TS, vendored from the Shell Voicing Map handoff; no DOM, audio or state. | `voiceBandChart`, `NECK_INSTRUMENTS`, `voiceChart`, `rootMove`, `fingerMoves` |
| `web/lib/voicings/adapter.ts` | Ensemble's chords as voicing input: `ChordFacts` (the band's chord authority) → one of the six shell qualities, six triads or the power chord, the Freddie-Green reduction named in `approximation`, the root spelled by `spellPitchClass` as the chart sheet spells it. The engine has no parser or root table of its own. | `voicingChord`, `spellRoot` |
| `web/lib/voicings/voice-chart.ts` | A whole `BandChart` voiced in one pass, written chords only, each voicing carrying its `globalIndex` and `approximation`. | `voiceBandChart`, `VoicedBandChord` |
| `web/lib/voicings/neck-instruments.ts` | The neck's settings shape and `NECK_INSTRUMENTS`, the one pref-id → instrument table — a leaf apart from the voicer, so `lib/session.ts` can validate stored prefs without loading it (#1877). | `NeckPrefs`, `NECK_INSTRUMENTS` |
| `web/lib/voicings/home-window.ts` | A home window's width (#1598): every chart opens on frets 1 to `HOME_FRETS` until the musician moves the hand (`lib/session.ts`'s `placeNeckHand`; first position in every key since #1840). | `HOME_FRETS` |
| `web/lib/voicings/types.ts` | The engine's data contracts: `Spelled`, `Quality`, `Voicing`, `ChartChord`, `VoiceOptions`. | — |
| `web/lib/voicings/theory.ts` | Degree and quality tables, degree spelling, and which notes of a grip lie outside its shell (#1853, the neck's "Show the shell"). | `DEGREES`, `QUALITIES`, `spellDegree`, `outsideShell` |
| `web/lib/voicings/instruments.ts` | Guitar (six shell grips, closed triads in three inversions on the top three string sets, power chords on the 6th/5th/4th strings) and ukulele (four shell grips, the standard-chord `UKE_TRIADS` and `UKE_POWER`, plus low G). | `GUITAR`, `UKULELE`, `UKULELE_LOW_G` |
| `web/lib/voicings/voicing.ts` | Grip building and the chart voicer (Viterbi over every grip in the home window). | `voiceChart`, `build`, `allPositions`, `inversionOf`, `gripMidis` |
| `web/lib/voicings/fingering.ts` | Fingering, planned across a chart so a held note keeps its finger. Triad and power grips (`barre: true`) are also offered partial barres (#1594) — one finger across a contiguous same-fret run, costed against the split so the planner picks; a shell is one finger per note, except that a guitar shell (`rootBarre`) is offered the index barre that gets its root off the ring or little finger (#1607). A barre is derived from shared fingers, never stored. | `fingerSequence`, `fingerOptions`, `fingerMap`, `fingerNotes`, `barres` |
| `web/lib/voicings/motion.ts` | Root moves and finger moves (the narration text). | `rootMove`, `fingerMoves` |
| `web/lib/voicings/test/keys.ts` | Test fixture only: key families and the chord progressions the shell characterization voices (`test/shell-characterization.test.ts` against `test/golden.json`, regenerated with `UPDATE_VOICING_GOLDEN=1`). | `keyFamily`, `songChart`, `SONG_SHAPES`, `keyRoot` |
| `web/app/neck.tsx` | Neck mode's fretboard (#1586): a dumb SVG renderer over `lib/voicings` types — the grip, the next-chord preview (#1592: on the strong last beat only, the next grip's ghost dots + root path; the finger arrows, targets and hold rings only with `fingers`; a barre is one pill behind its dots, #1594), the home-window slider, the phone zoom onto the hand (#1593, `zoom: 'window'`), and with `onStrum` the board as a button that strums the grip (#1596). No runtime, state or document imports. | `Neck`, `NeckProps`, `NeckZoom` |
| `web/app/neck-geometry.ts` | Fret and string geometry for the neck (`fx`, `dx`, `neckLayout`), shared by the component and its test; the phone zoom's view window → transform math and its inverse for the handle drag (#1593). | `fx`, `dx`, `fretAt`, `neckLayout`, `viewWindow`, `boardTransform`, `boardX` |
| `web/app/neck-view.tsx` | The stand's Neck mode (#1587): chord strip (current, next, narration, approximation notice), the `<Neck>` and its settings row, in place of the chart sheet; stopped, a session-only cursor that steps the changes (prev/next, ← / →, `3 / 12`, #1595) and a board tap that strums the sounding grip (#1596). Presentational; the shell hands it the band chart, the voiced grips, the playhead and `onStrum`. | `NeckView` |
| `web/app/neck-stand.tsx` | Neck mode as one lazily loaded unit (#1877): `useNeckVoicing` + `NeckView`, rendered by the shell through `React.lazy` only while the neck shows, so the voicer stays out of the app chunk. Prefs come in from the shell's `useNeckPrefs`. | `NeckStand` (default) |
| `web/app/use-neck-view.ts` | Neck mode's follow logic over `BandChart`: the sounding grip under a slot (held through a hold/N.C.), the next DIFFERENT chord in performance order (`nextVoicedSlot`, not the chart's next-bar cue) and its mirror (`prevVoicedSlot`), the chart's changes for the step readout (`chordChanges`, `changePosition`), the narration sentence, and `useNeckVoicing` (whole chart voiced once per chart + the shell's stored prefs, never per frame). | `neckModel`, `nextVoicedSlot`, `prevVoicedSlot`, `chordChanges`, `changePosition`, `soundingSlot`, `rootLine`, `fingersLine`, `useNeckVoicing` |

## State Management (Domain Slices)

| Path | Domain Responsibility | Initial State |
| :--- | :--- | :--- |
| `core/state/playback.ts` | BPM, transport, and volume. | `playback` |
| `core/state/arranger.ts` | Chords, sections, time signature, and key. | `arranger` |
| `core/state/groove.ts` | Genre, swing, humanize and the drum lane's mix. | `groove` |
| `core/state/instruments.ts` | Per-instrument synthesis parameters. | `bass`, `soloist`, `chords` |
| `core/state/set-param.ts` | The one write `SET_PARAM` makes: only to a field the slice declares. | `writeDeclaredParam` |
| `core/state/state-effects.ts` | Cross-module state side effects (Inversion of Control). | `handleEffects` |

## Songbook Document Boundary

| Path | Responsibility | Key Exports / Symbols |
| :--- | :--- | :--- |
| `core/songbook/types.ts` | The chart's settings types, kept independent of live state slices: what a chart holds beside its music (`ChartSettings`: performance and band — the settings the band honours, nothing of the old engine's, #1741), and the codec result types. The music and the document itself are `score-types.ts`'s; the text chart's arrangement types went with schema 1 (#1740). | `ChartSettings`, `ChartBand`, `ChartPerformance`, `ChartEnergy`, `CodecDecodeResult` |
| `core/songbook/codec.ts` | The songbook codecs' shared plumbing: the bounded structural walk and JSON detachment every untrusted candidate goes through (`prepareCandidate`), the version gate (`readVersion`), and JSON decode/encode around a validator. `writtenSettings`/`writtenChart` give a chart's settings exactly as capture writes them. The chart schema itself is `document-v2.ts`. | `prepareCandidate`, `readVersion`, `decodeJson`, `encodeValidated`, `writtenSettings`, `writtenChart` |
| `core/songbook/score-types.ts` | The chart document (schema 2, the only one since #1740) and its authored score: exact events, measures, context, repeat and jump directions. | `ChartDocumentV2`, `SemanticScore`, `ScoreMeasure`, `ScoreDirection` |
| `core/songbook/score-duration.ts` | Bounded rational quarter-note arithmetic and exact sixteenth-grid capability checks. | `scoreDuration`, `scoreMeter`, `durationToSteps` |
| `core/songbook/score-context.ts` | Shared key/mode/meter inheritance and beat-grouping reset for already-validated authored contexts. | `resolveScoreContext` |
| `core/songbook/score-form.ts` | Bounded repeat/ending and global D.C./D.S./Fine/coda traversal; preserves source identities and explicit repeat-after-jump policy. | `compileScoreForm`, `ScoreFormVisit` |
| `core/songbook/score-measure-events.ts` | Detached, bounded written-identity resolution of one-/two-bar references, with context and pair integrity checks. | `resolveScoreMeasureEvents` |
| `core/songbook/ireal-import.ts` | Source-preserving iReal import results, raw metadata, the playlist's own name (#1478) and per-song blocking diagnostics. `parseIRealImportInSteps` is the same parse in slices, so a whole playlist never freezes the page; `MAX_IMPORT_MEASURES` is sized from Jazz 1460. | `parseIRealImport`, `parseIRealImportInSteps`, `IRealImportResult`, `MAX_IMPORT_MEASURES` |
| `core/songbook/ireal-decode.ts` | Bounded inert HTML/link extraction, separate protocol envelopes and modern permutation decoder. Up to the account's 2,000 songs (#1478); `songSourceLink` rebuilds one song's own link from its fields. | `decodeIRealInput`, `decodeIRealMusic`, `MAX_IREAL_SONGS`, `songSourceLink` |
| `core/songbook/ireal-score.ts` | Conservative rhythm-cell and notation mapping into validated semantic scores; uncertain music blocks import. | `scoreFromIRealBody` |
| `core/songbook/score-text.ts` | Complete-token chord-bar parsing/printing, meter-labelled lengths and alternate spellings; independent of voicing. | `parseChordBar`, `printChordBar`, `isScoreChord` |
| `core/songbook/score-codec.ts` | Detached authored-score validation, duration sums and source/marker reference integrity; not a performance itinerary compiler. | `validateSemanticScore` |
| `core/songbook/document-v2.ts` | The chart document's validator — schema 2, the only one since #1740: its own envelope, performance and band checks (strict: an unknown field is refused, the old engine's fields included, #1741; the groove's `genre` is required), the score through `score-codec.ts`. A schema-1 text chart is refused as a historical version; `isRetiredSchema` lets a caller say so plainly. | `validateChartDocumentV2`, `decodeChartDocumentV2`, `encodeChartDocumentV2`, `isRetiredSchema` |
| `core/songbook/structural-limits.ts` | Pre-schema input ceilings for byte size, nesting depth, visited nodes, and section count. | `inspectSongbookStructure`, `SONGBOOK_MAX_INPUT_BYTES` |
| `core/songbook/state-ownership.ts` | Exhaustive document/preferences/runtime classification of every top-level state field: a `satisfies` type guard (a new field fails typecheck until classified) that the write-ownership rule reads. Nothing reads it at run time; it does not decide what a chart stores. | `STATE_OWNERSHIP_MANIFEST` |
| `core/songbook/chart-link.ts` | v2 shareable-link codec: `#chart=<base64url(deflate(JSON))>` whole-document envelope. Fails closed on any malformed/oversized/schema-invalid fragment; a link to a retired text chart decodes to `RETIRED_CHART_LINK` so the app can say why it does not open. | `encodeChartLink`, `decodeChartLink`, `RETIRED_CHART_LINK` |

## Chords & Notation

| Path | Responsibility | Key Logic |
| :--- | :--- | :--- |
| `core/engine/note-spelling.ts` | Canonical pitch-class → letter-name spelling policy (sharp/flat by key), shared by the chart render path and the chord editor. | `spellPitchClass` |
| `core/data/note-names.ts` | Pure pitch-class name table; re-exported by config without pulling genre data into notation-only editors. | `KEY_ORDER` |
| `core/engine/transpose.ts` | Single shared chord-text transposer (the Key popover): note-name roots and slash basses move, Roman/Nashville numerals pass through. | `transposeChordText` |

## Engine Core (Internal)

| Path | Responsibility | Key Exports |
| :--- | :--- | :--- |
| `core/engine/platform-orchestrator.ts` | Platform specific lifecycle management. | `startPlatformAudioAndWakeLock`, `stopPlatformAudioAndWakeLock` |
| `core/engine/engine.ts` | Audio synthesis and instrument setup. | `initAudio`, `playNote` (re-export from `synth-chords`) |
| `core/engine/reverb.ts` | Algorithmic Schroeder/Freeverb reverb (shared reverb return). | `createAlgorithmicReverb`, `REVERB_PRESETS` |
| `core/engine/synth-utils.ts` | Shared WebAudio boilerplate (ramping, voices, velocity→timbre). | `rampGain`, `killActiveVoices`, `velocityTimbre` |
| `core/engine/audio-graph-utils.ts` | Leaf Web Audio graph helpers — imports nothing from the engine, so `synth-utils.ts` and `sample-voice.ts` can both use them without an import cycle. | `safeDisconnect`, `createSoftClipCurve`, `clampFreq` |
| `core/engine/section-overrides.ts` | Per-section instrument-enabled overrides: whether a lane's bus is needed anywhere in the chart. | `isInstrumentEverActive` |
| `core/engine/hash-utils.ts` | Canonical deterministic hash helpers. `scrambleHash` is stateless and seed-tuple-indexed — see `core/engine/CLAUDE.md` §27. | `scrambleHash`, `stringHash33`, `stringHash31` |
| `core/engine/soloist-mode-policy.ts` | Canonical soloist phrasing-mode rules and voice limits. | `resolveSoloistMode`, `getSoloistVoiceLimit` |
| `core/engine/audio-recovery.ts` | Context resumption and error handling. | `audioWatchdog` |
| `core/engine/mute-contract.ts` | Import-free leaf owning what a note's `muted` field means — the bass's numeric palm-mute amount vs the chords lanes' boolean CC-only sentinel; audible ghosts carry reduced velocity with `muted: false`. Read the field through here, never with `!muted`. | `normalizeMuteAmount`, `muteGain` |
| `core/engine/velocity-shaping.ts` | Import-free leaf owning the bass voice's velocity-to-amplitude law. Change it here, never at a call site. | `bassVelocityToAmplitude`, `BASS_VELOCITY_DOMAIN_MAX` |

## Synthesis Engine (WebAudio)

| Path | Responsibility |
| :--- | :--- |
| `core/engine/instrument-registry.ts` | Instrument-source indirection: resolves each voice to a synth function or an installed sample-pack buffer (synth-fallback when no pack is loaded). |
| `core/engine/sample-loader.ts` | Lazy fetch + `decodeAudioData` + cache of sample-pack buffers into the instrument registry (atomic, deduped, fail-loud). |
| `core/engine/sample-voice.ts` | Sample playback: `playSampledNote` (pitched — nearest-zone + `playbackRate` shift) and `playSampledStrike` (percussion — native-rate, unfiltered drum hit), both through a click-free envelope into the instrument's gain bus; plus `pickRoundRobin` for deterministic take selection. |
| `core/engine/pack-runtime.ts` | Pack runtime glue: fetch a pack's manifest, load+decode its samples, and cache the built `SampleZone[]` the pitched seams consume (percussion packs build no zones — they play buffers by articulation key); `ensurePackLoaded` is idempotent (load-on-select / on audio init). |
| `core/engine/synth-bass.ts` | Sub-bass and Growl synthesis. |
| `core/engine/synth-chords.ts` | Polyphonic piano/pad synthesis. |
| `core/engine/synth-drums.ts` | Procedural percussion synthesis. |
| `core/engine/synth-soloist.ts` | Lead instrument synthesis and glides. |
| `core/engine/wav-encoder.ts` | Minimal 16-bit PCM WAV encoder shared by the in-app audio export and the Node-side `mix-report --write-wav` path. |

## Data & Configuration

| Path | Responsibility | Key Data |
| :--- | :--- | :--- |
| `core/data/smart-genres.ts` | High-level genre configurations + the genre-naming authority (canon name, feel, and the retired groove strategy key). A genre's feel is read off its entry, `SMART_GENRES[name].feel`. | `SMART_GENRES`, `GENRE_NAMES`, `SmartGenre` |
| `core/data/sound-packs.ts` | Catalog of installable sample packs, read by v2's `lib/sounds.ts`. | `SOUND_PACKS`, `packsForInstrument` |
| `core/data/genre-sound-map.ts` | Genre → instrument sound defaults consumed by Auto-follow mode (#675). | `GENRE_SOUND_MAP`, `autoVoiceForGenre` |

## UI (the v2 app)

`web/app/` holds every surface (songbook, chart sheet with its in-place bar, bar and
section menus, transport, Song menu, sounds panel, account pages) and `web/lib/` the runtime bridge, songbook repository and
account sync. Per-surface ownership is the navigation table in `web/CLAUDE.md`.

## High-Level Controllers & Integration

| Path | Responsibility |
| :--- | :--- |
| `core/controllers/instrument-controller.ts` | Per-instrument state and preset routing. |
| `core/export/detached-generation-state.ts` | Offline-render state clone (the band's WAV export and the listening-gate tools): preserves generation settings while stripping live handles and runtime buffers. |
| `core/platform.ts` | Browser hacks (WakeLock, Audio Unlock). |
| `core/utils.ts` | Pure musical/math primitives: pitch conversion + key normalization. No DOM, no Web Audio, no persistence. | `getFrequency` |
| `core/sanitize.ts` | Main-thread string sanitization (dangerous-char stripping, song-seed normalizing). | `stripDangerousChars`, `normalizeSongSeed` |

## Infrastructure & Lifecycle (Internal)

| Path | Responsibility |
| :--- | :--- |
| `core/config.ts` | Global timing and musical constants. |
| `core/constants.ts` | Global visual and UI state constants. |

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
| `tests/` | Vitest unit, integration, critique (`standards/`) and browser-mode suites. The app's Playwright suite is `web/checks/`. |
| `tests/oracle/` | The chord-symbol oracle (#1579): `chord-reference.ts` reads a chord quality from the `@tonaljs/chord` dictionary, `chord-clash.ts` lists the notes a symbol rules out, and `chord-oracle.test.ts` holds the band's chord table and every comp chord (the standards catalog, plus one bar of every quality in every style) to them. |
| `CLAUDE.md` | Primary operational guide and architectural rules. |
| `AGENTS.md` | Pointer to `CLAUDE.md` for AGENTS.md-aware tools. |
| `AI_MAP.md` | Codebase navigation (this file). |
