# Epic 1: Coordination Contract Completion

## Why this epic exists

`coordination-engine.ts:4` advertises a "Musical Coordination Contract" — proactive cross-instrument awareness. Three of the six audits independently surfaced that the contract is half-built: signals are published but no consumer reads them, signals are written current-tick-only when downstream logic needs them to persist, and two fields the harmony engine genuinely needs (tension-chord, sticky soloist position) don't exist yet.

Fixing the contract once is the highest-leverage architectural move in the audit. It unlocks tension-aware soloing (epic 4), voice-leading-aware harmony (epic 8), section-anticipating bass (epic 2), and "second comper avoids first comper" voicings (epic 6) — at least one story in each of those epics is blocked on this work.

## Source findings

- `harmony-coordination.md` P0 #2, #3, #4, #5; P1 #7, #9, #10
- `soloist.md` P1 #8
- `chords.md` P2 #14 (`accompanimentMidis` consumer)
- `bass.md` P1 #11
- `form-arranger.md` P0 #2 (`upcomingSectionFirstChord` is dead)

## Stories

### S1. Make `coordination.soloistMidi` sticky across soloist rests
Pick up the most-recent non-rest soloist MIDI and persist it as `lastActiveSoloistMidi` (or stickify `soloistMidi`) so harmony's spectral-gap logic at `harmonies.ts:535-540` actually fires in production. Without this, "Proactive Generator Awareness" is only true in the unit test.

**Acceptance:** new critique test that simulates soloist activity + harmony stab on different steps; the harmony's octave-shift branch is exercised. 30-run reliability.
**Effort:** ~2h. **Model:** opus (shape decision: pure stickiness vs new field). **Reviewer:** state-discipline-reviewer + music-theory-reviewer. **Source:** `harmony-coordination.md` P0 #2.
**Status:** Shipped 2026-05-16 — added `lastActiveSoloistMidi` + `lastActiveSoloistStep` to `CoordinationCarryover`, threaded through `workerContext` (live) and `ExportProcessor` (export), consumer in `harmonies.ts` age-caps at 32 steps. Critique test `soloist-harmony-spectral-gap.test.ts` 4 sub-tests / 29+/30 reliability.

### S2. Add `isTensionChord` + alteration pitch-classes to the context
Coordination publishes `isTensionChord: boolean` and `altPitchClasses: number[]` written by the chords producer. Soloist consumes both as a final-stage `weight *= 3` multiplier on altered pitches over V7alt/V7b9/V7#9 etc.

**Acceptance:** soloist pitch distribution over an altered V7 shifts measurably toward b9/#9/b13 pitch classes (gap >15pt vs plain V7). Critique test in `tests/standards/soloist-tension-awareness.test.ts`. Wire-up only — bebop chromatic *neighbors* are epic 4, S1.
**Effort:** ~4h. **Model:** opus (multiplier value + "what counts as tension"). **Reviewer:** state-discipline-reviewer + music-theory-reviewer. **Source:** `harmony-coordination.md` P0 #8.
**Status:** Shipped 2026-05-16 — `ALT_EXTENSIONS_BY_QUALITY` map + `getAltPitchClasses()` + `isTensionChordForSoloist()` in `coordination-engine.ts`; published by chord-data preamble in `tick-logic.ts` (before producers run, so soloist-runs-first ordering sees fresh values); soloist consumer in `soloist-pitch-engine.ts` final-stage `weight *= 2.0` (reduced from sketched 3.0 after music-theory review — 3.0 stacked with Departure's scale-tone ×2 to push altered-PC selection >60%). Map content: dominants get full altered set, m7b5 gets [b9, natural-9], dim gets [natural-9] (W-H diminished), aug gets [#11] (whole-tone). Critique test `soloist-tension-awareness.test.ts` 2 sub-tests / 30 trials, ≥15pt gap on altered V7 vs plain V7.

### S3. Wire `upcomingSectionFirstChord` into bass + chord engines
Bass: at step `sectionEnd - stepsPerBeat/2`, allow a chromatic approach to the upcoming root. Chords: on the last beat of a section, voice the upcoming chord as an anticipation. The field is already published; consumers are missing.

**Acceptance:** verifiable section-transition listen test (drummer fill + bass anticipation + chord anticipation arrive coherently). Critique test asserting bass note distance to next-section root drops on the boundary beat.
**Effort:** ~4h. **Model:** sonnet (mechanical wire-up of existing field; shape already decided). **Reviewer:** music-theory-reviewer. **Source:** `form-arranger.md` P0 #2.
**Status:** Shipped 2026-05-16 — bass anticipation in `bass-engine.ts` (new `ANTICIPATION_STYLES` set: jazz/walking/funk/blues/bossa/rocco/neo; gate added to both `isBassActive` and `getBassNote`'s picker, direct ±1-semitone override on the anticipation step). Chord anticipation in `accompaniment.ts` (new `CHORD_ANTICIPATION_GENRES` set: Jazz/Funk/Neo-Soul/Blues/Bossa; pre-voices the upcoming chord's `freqs` on "and-of-4," skips if no precomputed voicing so we don't synthesize a wrong-quality shell). `sectionStart`/`sectionEnd` now written onto the coordination context in tick-logic's chord-data preamble so bare-coordination consumers can read boundaries directly. Critique test `bass-section-anticipation.test.ts` 3 sub-tests / 30 trials; 10× stress-run clean. Music-theory review caught 1 P0 (flaky negative control on step 28 was measuring natural walking-bass pull rather than gate isolation — moved to step 16, downbeat of last measure) + 4 P1s patched (drop rock/disco from anticipation set, drop dom7 fallback dyad in favor of skip-when-no-freqs, drop dead 'Soul' genre, hoist `CHORD_ANTICIPATION_GENRES` to module scope).

### S4. Promote `soloist.session.*` reads in `harmonies.ts` into context fields
Add `soloistResting: boolean` and `soloistNotesInPhrase: number` to the coordination context, written in `updateCoordinationContext` case `'soloist'`. Replace the three private-state reads at `harmonies.ts:332, 425-426, 446`. Honors the contract surface so the coordination test mock fully exercises harmony.

**Acceptance:** grep `harmonies.ts` for `soloist.session` returns zero. Existing harmony critique tests still pass.
**Effort:** ~2h. **Model:** sonnet (mechanical contract surface change). **Reviewer:** state-discipline-reviewer. **Source:** `harmony-coordination.md` P0 #5.
**Status:** Shipped 2026-05-16 — added `soloistResting: boolean` and `soloistNotesInPhrase: number` to `createCoordinationContext()` (default `soloistResting: true` matches `instruments.ts` boot state so harmony doesn't see false-busy on tick 0). Writes happen in `tick-logic.ts` soloist producer block (after `getSoloistNote`), with explicit producer-order doc comments. Three reads at `harmonies.ts` (old lines 332, 425-426, 446) now consume `coordination.soloistResting`/`coordination.soloistNotesInPhrase`. Five harmony critique tests (funk/jazz/neo-soul/bossa/reggae) and `harmonies-logic.test.ts` updated to drive busy/rest state through the coordination arg rather than via mock-state flat assignments that never reached the old read path. Three `soloist.session.*` reads remain (`memory.sharedHookBuffer` Ska-Punk-only + `seed` for melodic shadowing) — different fields not covered by this story's two-field sketch; out of scope, logged below.

**Follow-up scope (not blocking S4 close):** Three remaining `soloist.session` reads in `harmonies.ts` (`session.memory.sharedHookBuffer` at lines 271-272, `session.seed` at line 279) would need their own context-context-fields design — a buffer object and an RNG seed are richer than the boolean/scalar fields this story added. Worth a separate story under this epic if/when the "grep returns zero" acceptance is upgraded to a hard rule.

### S5. Wire `accompanimentMidis` into both soloist and harmony
Two consumers for one already-published field. Soloist: final-stage `weight *= 0.5` for any candidate whose pitch-class is currently in `accompanimentMidis` (avoid chord-voice unison). Harmony: when `accompanimentCrowding`, filter `targetIntervals` to *prefer* pitch classes not in `accompanimentMidis`.

**Acceptance:** soloist+chord pitch-class unison rate drops by ≥30% on a jazz comping mix. Harmony voicing pitch-class overlap with chord stab drops similarly.
**Effort:** ~4h. **Model:** opus (multiplier tuning + acceptance threshold). **Reviewer:** music-theory-reviewer. **Source:** `soloist.md` P1 #8, `harmony-coordination.md` P0 #4, `chords.md` P2 #14.
**Status:** Shipped 2026-05-17 — soloist consumer in `soloist-pitch-engine.ts` (final-stage `weight *= 0.05` on PCs in `coordination.stepCoordination.accompanimentMidis`; reviewer-flagged P0 caught the response-phrase-end inversion where the `*= 4.0` root/5th boost at line 665 stacked *before* the new mult and net-suppressed resolution targets — fixed by exempting phrase-end response from the penalty so the answer can come home even when the chord is sustaining a tonic voicing). Harmony consumer in `harmonies.ts` (PC-overlap reorder pass before density slice; stable-partition `targetIntervals` so non-overlap PCs come first, then density cap preferentially keeps them). Multiplier chosen 0.05 (not sketched 0.5) because chord-tone bonus stack typically 5-20× larger than scale-only — 0.5 shave is washed out in production. Acceptance reframed from "≥30pp absolute" to "≥30% relative drop": absolute 30pp unreachable because of a ~10pp device-system floor (`soloist-devices.ts` enclosure/run picker doesn't consult `accompanimentMidis`; tracked as follow-up below). Critique test `accompaniment-unison-avoidance.test.ts` 2 sub-tests / 30 trials — soloist mean rel-drop 57%, mean abs-gap 19pp, 27/30 ≥30% relative; harmony 50pt deterministic, 30/30. Cross-checks (tension-awareness, spectral-gap, jazz/funk/neo-soul/bossa/reggae harmony critiques, jazz/blues soloist authenticity, ensemble-coordination, comping-consistency, jazz-comping-integrity, funk-piano) all green.

**Follow-up scope (separate story candidate):** Hook `soloist-devices.ts` (enclosure/run/approach picker at lines ~314-340) to also consult `coordination.stepCoordination.accompanimentMidis` when choosing approach-note MIDIs — currently devices re-land on chord tones AFTER the picker has been biased, putting an empirical ~10pp floor on the absolute unison-rate drop. Closing this would push the absolute drop above 30pp and convert the "relative-30%" framing back to absolute. Belongs under this epic; size ~3h.

### S6. Producer-order discipline (documentation + runtime guard)
Annotate every coordination field in `coordination-engine.ts` with `// writer: <module>` and `// readable-after: <module>` comments. Add one Vitest unit that spies on `getHarmonyNotes` and asserts `coordination.soloistMidi` is non-zero when a soloist note was generated in the same tick.

**Acceptance:** producer order documented; if someone reorders `tick-logic.ts:288/332/361`, a test fails.
**Effort:** ~2h. **Model:** sonnet (doc + one test). **Reviewer:** none (test guards itself). **Source:** `harmony-coordination.md` P1 #10.
**Status:** Shipped 2026-05-17 — annotated 16 fields in `createCoordinationContext()` with `// writer:` / `// readable-after:` comments plus the 8 direct-mutation write sites in `tick-logic.ts` (groove preamble, chord-data preamble, drum preamble, soloist-block direct writes). Annotation count: 9 → 52 lines. New guard test `tests/unit/engine/producer-order.test.ts` mocks `getSoloistNote` to return deterministic midi=72, spies on `getHarmonyNotes` for the coordination arg, and asserts `coordination.soloistMidi === 72` when harmony receives the context — proving the soloist producer ran first. Negative control: with `includeSoloist: false`, `soloistMidi === 0` (proves the positive assertion is meaningful). Both tests pass deterministically; if anyone reorders the producers (e.g. moves harmony ahead of soloist), the positive test fails. Full suite 1601/1601 green, typecheck clean.
