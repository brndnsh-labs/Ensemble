# Epic 8: Harmony Layer Polish

## Why this epic exists

After Epic 1 (Coordination Contract) lands, the harmony engine's biggest production-broken features — `coordination.soloistMidi` going dead at every rest, antiphonal response firing as a plain stab, double-comping the chords engine — are unblocked. This epic covers the remaining harmony-specific gaps that don't depend on the contract refactor: pad mode doesn't actually sustain across chord changes, the bass/harmony register seam is muddy because harmony never reads `bassMidi`, `selectGroundedIntervals` puts color tones ahead of fifths, and three flags ride in `notesToMain` to a synth that doesn't read them.

Smaller epic than the others (5 stories), but mostly cleanup with concrete acceptance criteria.

## Source findings

- `harmony-coordination.md` P1 #6, #7; P2 #11, #12, #14
- Cross-references to Epic 1 for the bigger structural items

## Stories

### S1. Pad mode actually sustains across chord changes
`harmonies.ts:385-392` (`playSeaMode`) caps duration at `chord.beats * ts.stepsPerBeat` (current chord only) with a 20ms fade at `synth-harmonies.ts:18-27`. On chord change, identify pitch classes shared with `harmony.lastMidis`; for those voices, emit `isLegato` continuations (no new attack). Only retrigger voices whose pitch class is leaving.

**Acceptance:** "The Sea" / strings pad mode produces audible held tones across chord changes when common tones exist. New `harmony-pad-sustain.test.ts` asserts attack-count drops on chord changes when common tones present.
**Effort:** ~4h. **Model:** opus (musical design — what `isLegato` means at the harmony layer; synth-side fade timing). **Reviewer:** music-theory-reviewer. **Source:** `harmony-coordination.md` P1 #6.

### S2. Harmony reads `bassMidi` for register seam
Replace the hard `safetyFloor = 52` at `harmonies.ts:499` with `safetyFloor = Math.max(52, (coordination.bassMidi || 0) + 7)`. Harmony already lives 52-84; this adds a perfect-fifth gap above the current bass note.

**Acceptance:** muddy E3-A3 clusters disappear when bass is at the top of its range. Critique test asserts harmony lowest-note minus bass note >= 7 semitones on simultaneous events.
**Effort:** ~2h. **Model:** sonnet (one-line floor change + new critique test). **Reviewer:** music-theory-reviewer. **Source:** `harmony-coordination.md` P1 #7.

### S3. `selectGroundedIntervals` puts fifths before colors
`harmonies.ts:147` returns `[...roots, ...guides, ...colors, ...fifths, ...others]`. Reorder to `[roots, guides, fifths, colors, others]` so a 4-note grounded voicing of a 7-chord is R-3-5-7, not R-3-7-color.

**Acceptance:** existing harmony tests pass; voicings sound like textbook practice voicings.
**Effort:** ~1h. **Model:** sonnet (array reorder). **Reviewer:** music-theory-reviewer. **Source:** `harmony-coordination.md` P2 #14.
**Status:** Shipped 2026-05-17 as a guard test + corrected WHY comment; the reorder itself was reverted. Music-theory review P0: `selectGroundedIntervals` is gated by `shouldPreferGroundedPracticeVoicing` (`voicing-policy.ts:51-60`), which requires `practiceMode && BASS_SPACE_FEELS.has(feel) && PRACTICE_GROUNDING_QUALITIES.has(quality)`. The grounding-qualities set is altered/tension only: `halfdim, dim, 7b5, aug, augmaj7, 7alt, 7#9, 7b9`. Plain `7`/`maj7`/`m7` never reach this function. Of the gated qualities only `7b9 [0,4,7,10,13]` has a 4-slot slice conflict between colors and fifths — and for `7b9` the b9 IS the chord identity. Reordering would have produced `[0,4,10,7]` = R-3-b7-5, a plain dominant 7 with the charted alteration evicted. Audit-doc finding's R-3-5-7 reasoning is correct in the abstract but doesn't match this gate. Shipped: (1) corrected `// why:` comment explaining the gate set and the colors-before-fifths rationale, (2) new unit test in `harmonies-logic.test.ts` ("should preserve the b9 in 7b9 voicings in Jazz practice mode") that verifies `interval-class 1` survives the slice — red under the proposed reorder, green under the original. Same audit-doc finding should be amended to note the gate set.

### S4. Consume or remove the dead flags (`isResponse`, `isBloom`, `isLatched`)
`harmonies.ts:602-605` ships these flags to `notesToMain`; `synth-harmonies.ts` reads none of them. Either give them audible meaning:
- `isBloom` → +20% attack and slight detune
- `isResponse` → +5ms timing offset ("answer behind the beat")
- `isLatched` → longer release tail

Or drop the flags entirely. **Don't keep dead carriers in the note schema.**

**Acceptance:** the three gestures are timbrally distinct from a plain harmony stab, or the schema is one field smaller.
**Effort:** ~3h. **Model:** opus (sound design choice — what each gesture sounds like). **Reviewer:** music-theory-reviewer. **Source:** `harmony-coordination.md` P2 #12.

### S5. Document or lower the bandIntensity floor
`harmonies.ts:639`'s `if (playback.bandIntensity < 0.22) return [];` is undocumented. Decide: lower to ~0.15 with a documented constant (`<0.15 = mute, 0.15–0.4 = pads only`), OR remove the gate and let `playSeaMode` provide natural sparseness at low intensity. Either way, add a `// why:` comment.

**Acceptance:** ballad-intensity (0.18-0.22) jazz/blues plays sparse organ swells, or the silence is documented.
**Effort:** ~2h. **Model:** opus (musical decision: where should harmony go silent?). **Reviewer:** music-theory-reviewer. **Source:** `harmony-coordination.md` P2 #11.

## Cross-epic notes

- `harmony-coordination.md` P0 #2, #3, #4, #5 → all in Epic 1.
- `harmony-coordination.md` P1 #8 (soloist tension-chord awareness) → Epic 1, S2.
- `harmony-coordination.md` P1 #9 (bass coordination) → Epic 5, S6.
- `harmony-coordination.md` P1 #10 (producer-order discipline) → Epic 1, S6.
- `harmony-coordination.md` P2 #13 (seeded shadow/response) → Epic 3, S5.

After Epics 1 and 3 ship, this epic is the residual harmony-engine work.
