# Epic 5: Bass Routing & Voice Leading

## Why this epic exists

Four bass findings all share one root cause: the engine has chord-change-approach machinery but doesn't consistently check `nextChord.rootMidi !== chord.rootMidi`. Approaches fire inside held chords (sounds like a stumble), are gated to Jazz/Blues only (kills universal rock/funk vocabulary), and `withOctaveJump` can mutate the approach note itself (destroys the half-step resolution). A small shared helper `isChordChangeApproach(stepInfo, nextChord, chord, ts)` adopted across both `bass-engine.ts` and `bass-styles.ts` is the highest-leverage architectural shift in the bass audit.

Three other findings cluster around routing/coverage: Latin/Minimal/Shred play wrong-genre bass (route to "rock"); the reggae One-Drop silencer is mislabeled and silences the wrong riddims; the bossa/samba label conflates two distinct feels.

The two known engine-side open findings in `docs/MUSICAL_AUDIT.md` (country quarter-note R-5, reggae dub active-lane — the latter shipped) get picked up here too.

## Source findings

- `bass.md` P0 #1, #2, #3; P1 #4, #5, #6, #7, #8, #9, #10; P2 #13, #14, #16, #17
- `docs/MUSICAL_AUDIT.md` Open finding #1 (country)

## Stories

### S1. `isChordChangeApproach` helper + audit all approach callsites
Add `isChordChangeApproach(stepInfo, nextChord, chord, ts)` in `bass-engine.ts` (or new `bass-utils.ts`). Replace the four sites where the gate is `nextChord && ...` without checking `rootMidi !== chord.rootMidi`: `bass-engine.ts:570-636`, `bass-styles.ts:910-965`, `bass-styles.ts:585-589` (funk), and any others surfaced by grep.

**Acceptance:** approach notes fire only on real chord changes. Critique test: across a chart with mostly held chords, approach-note counts on non-change beats === 0.
**Effort:** ~4h. **Model:** sonnet (mechanical helper extraction + callsite audit). **Reviewer:** music-theory-reviewer. **Source:** `bass.md` P1 #5, P2 #13.

### S2. Chromatic approach to next chord works in all genres
After S1, remove the `['Jazz', 'Blues']` genre gate at `bass-engine.ts:589-593` and `bass-styles.ts:929-932`. Keep probability lower for non-jazz/blues (`chromaticProb *= 0.5`). Voice leading vocabulary now available across rock/funk/pop/country/soul/gospel.

**Acceptance:** rock and funk bass produce chromatic approaches into chord changes (5-15% of chord-change beat-4-ands). Add multi-genre approach test.
**Effort:** ~2h (depends on S1). **Model:** sonnet (gate removal + probability scalar). **Reviewer:** music-theory-reviewer. **Source:** `bass.md` P1 #4.

### S3. `withOctaveJump` skips approach notes
`bass-engine.ts:612-619` and `bass-styles.ts:952, 963` octave-shift the approach point — F#2→G2 becomes F#3→G2, contradicting leap. Bypass `withOctaveJump` inside approach branches; pass `approach` straight to `getFrequency` after the clamp. Reserve octave displacement for downbeat root statements.

**Acceptance:** approach notes always sit within ±2 semitones of their target. Audible: smooth half-step landings, not jolting leaps.
**Effort:** ~2h. **Model:** sonnet (bypass `withOctaveJump` inside two branches). **Reviewer:** music-theory-reviewer. **Source:** `bass.md` P0 #2.

### S4. Latin / Minimal / Shred routing
`public/config.ts:114-130` SMART_BASS_STYLE_MAP has no entries for these genres; they fall through to `'rock'`. Add `Shred: 'metal'` (per CLAUDE.md alias). For `Minimal`, route to `'whole'`. For `Latin`, either route to `'walking-ska'` as cheap fit OR implement a `'tumbao'` branch (2&-3 anticipation, root-and-fifth lower neighbor — the Salsa idiom). Includes critique-test creation since none exist.

**Acceptance:** new `latin-bass-critique.test.ts`, `minimal-bass-critique.test.ts`, `shred-bass-critique.test.ts` files. All three genres no longer secretly play rock bass.
**Effort:** ~6h (latin tumbao is the heavier lift). **Model:** opus (Latin tumbao = new musical design; "what's minimal bass?" is a product call). **Reviewer:** music-theory-reviewer. **Source:** `bass.md` P0 #1; `MUSICAL_AUDIT.md` "Future passes" backfill.

### S5. Country quarter-note Root-Fifth + walk-up
Open finding from `MUSICAL_AUDIT.md`. `bass-styles.ts:116, 248`'s `checkBassActiveStyle` for `'country'` returns `step % 8 === 0` (half-note Two-Step only) — the dead `isFifthBeat = intBeat === 1 || intBeat === 3` branch never executes. Add a quarter-note tier (R-5-R-5) at `intensity > 0.6` OR introduce a separate `'country-walking'` style. Build a real 2-to-4-note walk-up at chord changes (replaces the single chromatic neighbor at `bass-styles.ts:294-301`).

**Acceptance:** existing `country-bass-critique.test.ts` extended with quarter-note + walk-up assertions. Engine option to express both Two-Step and Walking country.
**Effort:** ~4h. **Model:** opus (musical design — Two-Step vs quarter-note vs walking, walk-up shape). **Reviewer:** music-theory-reviewer. **Source:** `MUSICAL_AUDIT.md` Open finding #1, `bass.md` P1 #6.

### S6. Reggae One-Drop silencer fix + bass coordination consumption
Delete the mislabeled silencer at `bass-styles.ts:712-716` (its comment says "leaves beat 1 empty for One Drop" but the One Drop riddim table has no beat-1 entry; it actually silences Steppers/Stalag/54-46). After delete, add coordination consumption — `bass-engine.ts:42-54` currently reads only `kickHit`. On `coordination.soloistPhraseEnd` permit an optional half-bar fill; on tension-chord, allow scalar approach to upcoming root.

**Acceptance:** reggae bass at intensity 0.45-0.7 stops randomly muting beat 1 on non-One-Drop riddims. Bass reactivity to soloist phrase-end measurable.
**Effort:** ~4h. **Model:** sonnet for delete; opus for coordination consumption (multiplier + reactivity tuning). Split into two stories if needed. **Reviewer:** music-theory-reviewer. **Source:** `bass.md` P0 #3, P1 #11; `harmony-coordination.md` P1 #9.

### S7. Hip-hop slide gesture (chord-boundary, not within-chord leap)
`bass-styles.ts:323-330` jumps up an octave or fifth mid-chord — sounds like a synth lead, not an 808 slide. Gate on chord boundary: when `nextChord && nextChord.rootMidi !== chord.rootMidi && stepInBeat === ts.stepsPerBeat - 1`, emit a note targeting the next root with `bendStartInterval` set.

**Acceptance:** 808 slides are between-chord bends, not within-chord leaps. Critique test verifies slide rate scales with chord-change rate.
**Effort:** ~3h. **Model:** opus (musical design of the 808 slide gesture + bend timing). **Reviewer:** music-theory-reviewer. **Source:** `bass.md` P1 #7.

## Notes / future passes

- Walking-ska M6 over minor chords (`bass.md` P1 #9), generic walking target-awareness (`bass.md` P1 #10), funk pop/chuck/hammer probability documentation (`bass.md` P2 #17), bossa/samba label split (`bass.md` P2 #16) — small follow-on stories; bundle with whichever story above touches the same file.
- Rock harmonic-anticipation push probability tuning (`bass.md` P1 #8) is flagged as needing a product call ("Stones-y vs classic 70s").
