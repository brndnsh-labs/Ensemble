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

### S3. Wire `upcomingSectionFirstChord` into bass + chord engines
Bass: at step `sectionEnd - stepsPerBeat/2`, allow a chromatic approach to the upcoming root. Chords: on the last beat of a section, voice the upcoming chord as an anticipation. The field is already published; consumers are missing.

**Acceptance:** verifiable section-transition listen test (drummer fill + bass anticipation + chord anticipation arrive coherently). Critique test asserting bass note distance to next-section root drops on the boundary beat.
**Effort:** ~4h. **Model:** sonnet (mechanical wire-up of existing field; shape already decided). **Reviewer:** music-theory-reviewer. **Source:** `form-arranger.md` P0 #2.

### S4. Promote `soloist.session.*` reads in `harmonies.ts` into context fields
Add `soloistResting: boolean` and `soloistNotesInPhrase: number` to the coordination context, written in `updateCoordinationContext` case `'soloist'`. Replace the three private-state reads at `harmonies.ts:332, 425-426, 446`. Honors the contract surface so the coordination test mock fully exercises harmony.

**Acceptance:** grep `harmonies.ts` for `soloist.session` returns zero. Existing harmony critique tests still pass.
**Effort:** ~2h. **Model:** sonnet (mechanical contract surface change). **Reviewer:** state-discipline-reviewer. **Source:** `harmony-coordination.md` P0 #5.

### S5. Wire `accompanimentMidis` into both soloist and harmony
Two consumers for one already-published field. Soloist: final-stage `weight *= 0.5` for any candidate whose pitch-class is currently in `accompanimentMidis` (avoid chord-voice unison). Harmony: when `accompanimentCrowding`, filter `targetIntervals` to *prefer* pitch classes not in `accompanimentMidis`.

**Acceptance:** soloist+chord pitch-class unison rate drops by ≥30% on a jazz comping mix. Harmony voicing pitch-class overlap with chord stab drops similarly.
**Effort:** ~4h. **Model:** opus (multiplier tuning + acceptance threshold). **Reviewer:** music-theory-reviewer. **Source:** `soloist.md` P1 #8, `harmony-coordination.md` P0 #4, `chords.md` P2 #14.

### S6. Producer-order discipline (documentation + runtime guard)
Annotate every coordination field in `coordination-engine.ts` with `// writer: <module>` and `// readable-after: <module>` comments. Add one Vitest unit that spies on `getHarmonyNotes` and asserts `coordination.soloistMidi` is non-zero when a soloist note was generated in the same tick.

**Acceptance:** producer order documented; if someone reorders `tick-logic.ts:288/332/361`, a test fails.
**Effort:** ~2h. **Model:** sonnet (doc + one test). **Reviewer:** none (test guards itself). **Source:** `harmony-coordination.md` P1 #10.
