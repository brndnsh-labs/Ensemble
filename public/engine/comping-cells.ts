/**
 * Funk comping cell bank.
 *
 * Source: chords.md P0 #1 / epic-deterministic-phrasing S1. Real funk comping is built
 * on a 1–2-bar 16th-note groove cell that *loops* — the listener locks onto the cell as
 * the groove's signature. Replacing per-step `Math.random()` placement with a small
 * bank gives that signature feel and makes loops reproducible across critique runs.
 *
 * Each entry lists the 16th-step indices (0–15) where the chord stab lands. Cell choice
 * is keyed by `(sectionId, funkRotationIndex)` where `funkRotationIndex` increments at
 * every STICKY rotation event in {@link updateRhythmicIntent} — so each rotation draws
 * a fresh cell rather than coupling to bar arithmetic that aliases with the rotation
 * length. `sparse` vibe drops the last hit; `active` vibe adds one ornament from a
 * parallel ornament bank.
 *
 * 16th-grid nomenclature (beat-N at step 4*(N-1); e=+1; &=+2; a=+3):
 *   Steps:  0  1  2  3   4  5  6  7   8  9 10 11  12 13 14 15
 *   Names:  1  e  &  a   2  e  &  a   3  e  &  a   4  e  &  a
 *
 * Cell shape was chosen as the Phase-1 reference for Epic 3 — later seeded-bank stories
 * (S2 jazz/bossa Charleston picker, S3 walking-bass fallback) replicate this hash and
 * structure.
 */
export const FUNK_COMPING_CELLS: readonly (readonly number[])[] = [
    // why: One + a-of-1 + &-of-2 + a-of-3 — chicken-scratch anchor: the One lands,
    //      then the a-of-1 / &-of-2 pair answers it as a tight 16th-note chatter and
    //      a-of-3 pushes back toward the next half-bar. James-Brown / Stubblefield feel.
    [0, 3, 6, 11],
    // why: All-16th scratch with no downbeat (a-of-1, &-of-2, &-of-3, &-of-4) —
    //      clavinet "drop the One" feel; the omission of beat 1 is the hook.
    [3, 6, 10, 14],
    // why: Bootsy "On the One" + a-of-2 + a-of-3 + &-of-4 — anchored stab plus
    //      forward-leaning offbeats that keep the listener pulling toward beat 1.
    [0, 7, 11, 14],
    // why: Pure off-the-beat chatter (&-of-1, &-of-2, &-of-3, a-of-4) — lives
    //      entirely in 16th syncopation against a steady bass; the closing a-of-4
    //      pushes hard into the next One, which is what makes the cell breathe.
    [2, 6, 10, 15],
] as const;

// why: optional ornament hits per cell, applied only on `active` vibe — gives one
//      extra 16th of motion without breaking the cell's identity. Each index is
//      verified not to collide with its parent cell's hits AND to land on a 16th
//      syncopation (e/&/a), never on a downbeat:
//        cell 0 [0,3,6,11]   -> ornament 9  (e-of-3)
//        cell 1 [3,6,10,14]  -> ornament 5  (e-of-2)   (was 4 = beat-2 downbeat; fixed)
//        cell 2 [0,7,11,14]  -> ornament 13 (e-of-4)
//        cell 3 [2,6,10,15]  -> ornament 11 (a-of-3)
export const FUNK_COMPING_ORNAMENTS: readonly number[] = [9, 5, 13, 11];

/**
 * Jazz Charleston-family comping cell bank.
 *
 * Source: chords.md P0 #2 / epic-deterministic-phrasing S2. Real Jazz comping holds a
 * Charleston-family rhythmic figure for a 4-bar phrase, then refreshes — it does NOT
 * re-roll every bar (which is what the previous `Math.random()` picker did, and which
 * made comping read as amnesiac across the phrase). The bank below is the direct
 * translation of the five previously-stochastic branches (`Math.random()` thresholds
 * 0.6/0.4/0.25/0.1 over Charleston, Reverse Charleston, Syncopated Ands, Red Garland
 * Lite, and Sparse Anticipation) into named, stable cells. Cell choice is keyed by
 * `(sectionId, barIndex >> 2)` so all 4 bars of one phrase share the same cell; vibe
 * (sparse/active) modulates the cell on top of the pick rather than changing which
 * cell wins.
 *
 * NB on Bossa reuse: the picker currently routes both `Jazz` and `Bossa` through
 * this bank. That is a port-for-fidelity choice — the previous `Math.random()` picker
 * also shared one branch set across both genres. Bossa nova partido-alto comping is
 * actually a 16th-note, clave-derived 2-bar cell (closer to `[0,3,6,10]` answered by
 * `[2,6,10,14]`), NOT American swing Charleston. A follow-up story should split this
 * into a dedicated `BOSSA_COMPING_CELLS` bank with a `barIndex >> 1` (2-bar) hash.
 * Do NOT propagate the "one bank for Jazz+Bossa" pattern to other deterministic-
 * phrasing stories — track the bossa-bank gap in epic-deterministic-phrasing.
 *
 * NB on the phrase-shift convention: `>> 2` is a hardcoded 4-bar shift, NOT the
 * STICKY-aware `funkRotationIndex` mechanism Funk uses. This is fine today because
 * Jazz/Bossa/Blues retain for exactly 4 bars under the current `maxGrooveLength`
 * default. If `maxGrooveLength` ever varies by genre (slower comping, larger forms),
 * this picker must switch to a rotation counter like Funk — otherwise the picker
 * will flip the cell mid-retain and produce exactly the "comper forgot what they
 * played" symptom S2 was meant to fix. S3+ implementers copying this pattern: use a
 * rotation counter if your genre's retain length is variable.
 *
 * 16th-grid nomenclature (beat-N at step 4*(N-1); e=+1; &=+2; a=+3):
 *   Steps:  0  1  2  3   4  5  6  7   8  9 10 11  12 13 14 15
 *   Names:  1  e  &  a   2  e  &  a   3  e  &  a   4  e  &  a
 *
 * Indices reflect 4/4 with stepsPerBeat=4 (the dominant Jazz/Bossa time signature).
 * Computed once at module load using `spb=4` and `syncRatio=0.5`; the picker no
 * longer recomputes per-bar `getBeatStep()` offsets for these cells. Other time
 * signatures fall back to the residual Rock/Pop branch.
 */
export const JAZZ_COMPING_CELLS: readonly (readonly number[])[] = [
    // why: Charleston — One + &-of-2. The archetypal stride/swing comping figure;
    //      the listener locks onto the One-and-then-push-into-3 lift. Threshold
    //      0.6 in the old picker (the most-common branch), preserved as cell 0.
    [0, 6],
    // why: Reverse Charleston — &-of-1 + beat-3. Anticipates beat 1 from the prior
    //      bar's "and" and lands flat on the downbeat of 3; gives the line a
    //      different shape from Charleston without abandoning the half-note pulse.
    [2, 8],
    // why: Syncopated Ands — &-of-2 + &-of-4. Pure offbeat comping; reads as
    //      Bill Evans/Bossa-style "pushing" the front of every other half-bar.
    [6, 14],
    // why: Red Garland Lite — One + &-of-2 + &-of-3 (three hits). Comment in the
    //      old picker described "1, &2, &3" but the third hit was active-only;
    //      promoting it to the canonical cell makes Red Garland distinct from
    //      Charleston (otherwise both balanced-vibe cells were [0,6]).
    [0, 6, 10],
    // why: Sparse Anticipation — &-of-4 alone. Maximum breathing room; one
    //      anticipation note before the next bar. Threshold 0.0–0.1 in the old
    //      picker (rarest), preserved as the most spacious bank entry.
    [14],
] as const;

/**
 * Compound-meter (6/8, 12/8) Jazz/Bossa comping cell bank.
 *
 * Source: epic-1-compound-meter S3 review (2026-05-27).
 *
 * The 4/4-shaped `JAZZ_COMPING_CELLS` above degenerates in 6/8 (12-step bar):
 *   - `[14]` produces zero hits (step 14 out of range) → ~19% silent bars.
 *   - `[2, 8]` lands on 4/4-derived offbeats that fight the dotted-quarter pulse.
 *   - `[6, 14]` collapses to `[6]`.
 *
 * This bank is pulse-aware for 6/8: pulses at steps 0 and 6 (the two
 * dotted-quarters), with cells that either land on those pulses or use the
 * canonical 6/8 anticipation point (step 10 = last eighth before the next bar's
 * downbeat = the "and-of-pulse-2" that jazz waltz comping pushes against).
 *
 * Step nomenclature in 6/8 (stepsPerBeat=2, 12 steps/bar, [3,3] grouping):
 *   Steps:  0  1  2  3  4  5   6  7  8  9 10 11
 *   Names:  1  &  2  &  3  &   4  &  5  &  6  &
 *   Pulse:  P     .     .      P     .     .
 *
 * The picker uses `cellIndex % COMPOUND_COMPING_CELLS.length` so the bank size
 * can differ from `JAZZ_COMPING_CELLS.length` without changing identity stability.
 */
export const COMPOUND_COMPING_CELLS: readonly (readonly number[])[] = [
    // why: pulse pair — the 6/8 analog of 4/4 Charleston. Both pulses land,
    //      maximally idiomatic for a slow jazz waltz.
    [0, 6],
    // why: pulse pair + bar-ending anticipation. Step 10 is the last eighth
    //      of the bar, pushing into the next bar's downbeat. The 6/8 equivalent
    //      of Red Garland Lite.
    [0, 6, 10],
    // why: pulse 2 + bar-ending anticipation. Drops the downbeat for "breathing"
    //      — comping enters from the second pulse and pushes into the next bar.
    [6, 10],
    // why: pulse 1 + offbeat of pulse 1 + pulse 2. The "a-of-1" anticipation
    //      pushes into pulse 2; classic 6/8 jazz-waltz comping shape (think
    //      Bill Evans "Waltz for Debby").
    [0, 4, 6],
    // why: sparse — single bar-ending anticipation. Maximum breathing room,
    //      mirrors the 4/4 `[14]` cell's role but lands on an actual 6/8 step.
    [10],
] as const;

/**
 * Bossa partido-alto comping cell bank.
 *
 * Source: chords.md P0 #2 / epic-deterministic-phrasing S2 follow-up;
 * epic-coordination-consistency S5.c.
 *
 * Bossa nova partido-alto is a clave-derived 2-bar 16th-note cell, NOT American
 * swing Charleston. The previous picker routed Bossa through `JAZZ_COMPING_CELLS`
 * as a port-for-fidelity choice, which preserved the determinism win of S2 but
 * left Bossa speaking Charleston dialect — flat-half-note pulse — instead of the
 * partido-alto pattern that defines the genre (bossa-guitar right-hand thumb-
 * and-fingers comping, ANSWERED by the singer on the &-of-4 anticipation-of-1).
 *
 * The canonical partido-alto figure ANTICIPATES beat 1 of the next bar with an
 * &-of-4 hit (step 14) — this is the genre's signature gesture. Every cell here
 * includes step 14 so that offbeat anticipation fires on chord-change downbeats.
 * NB (#732): the "anticipation" is purely the offbeat PLACEMENT — there is no
 * cross-barline tie. The step-14 hit is a plain `currentCell` lookup that voices
 * whatever chord is live at that tick (the OUTGOING chord at a within-section
 * change, since Bossa isn't in WITHIN_SECTION_ANTICIPATION_GENRES); the next
 * bar's step-0 then voices the incoming chord normally. No consumer ties step 14
 * into the new chord's downbeat — don't assume one exists.
 *
 * 16th-grid nomenclature (beat-N at step 4*(N-1); e=+1; &=+2; a=+3):
 *   Steps:  0  1  2  3   4  5  6  7   8  9 10 11  12 13 14 15
 *   Names:  1  e  &  a   2  e  &  a   3  e  &  a   4  e  &  a
 *
 * 4 distinct cells (vs Jazz's 5) — Bossa's identity is the &-of-4 anticipation
 * plus the &-of-2 / &-of-3 syncopation; the deep cell variety lives in the
 * 2-bar answer pattern (sectionHash + phraseHash modulating cell choice), not
 * in flat cell count. Keyed by `(sectionId, bossaRotationIndex)` — the picker
 * fires every 2 bars (Bossa-pinned STICKY retention) and the counter advances
 * by 1 per pick, so consecutive bars-A/B sweep consecutive cells.
 *
 * Indices computed against 4/4 with stepsPerBeat=4 (the dominant Bossa time
 * signature). Other time signatures fall through to the Jazz Charleston bank.
 */
export const BOSSA_PARTIDO_ALTO_CELLS: readonly (readonly number[])[] = [
    // why: partido-alto principal cell (One + offbeat trio: &-of-2 + &-of-3 +
    //      &-of-4). Most common partido-alto figure; the &-of-4 closes the bar
    //      with anticipation of the NEXT bar's downbeat — the genre's "thumb
    //      plays the One, fingers answer on every offbeat" signature. (Note:
    //      this is NOT a 2-3 son clave — son clave is a 2-bar inter-bar contour,
    //      not a single-bar pattern; the rename clarifies the actual provenance.)
    [0, 6, 10, 14],
    // why: answering bar (3-2 son inversion). Drops the downbeat (right hand
    //      rests on 1), syncopates &-of-1 → &-of-2 → &-of-3 → &-of-4. Sits in
    //      pure offbeat space; tied to anticipation-of-1 via step 14. The
    //      classic alternate-bar bossa-guitar right-hand groove.
    [2, 6, 10, 14],
    // why: "fat bossa" thickening (One + &-of-1 + &-of-2 + &-of-3 + &-of-4) — five-
    //      hit cell that doubles the principal-cell offbeat pulse with an extra
    //      &-of-1 hit, keeping the thumb on One and adding a continuous offbeat
    //      sweep through the bar. Idiomatic partido-alto thickening (vs the earlier
    //      [1, 3, ...] e-of-1+a-of-1 push, which read as samba-percussion fill,
    //      not bossa-guitar right-hand vocabulary). Step 14 anchors the anticipation.
    [0, 2, 6, 10, 14],
    // why: sparse breath cell (One + &-of-3 + &-of-4). Three-hit minimal
    //      partido-alto — when the soloist is busy, the comper drops back to
    //      this stripped figure while still landing the anticipation-of-1.
    [0, 10, 14],
] as const;

/**
 * Blues comping cell bank.
 *
 * Source: chords.md P0 #2 / epic-deterministic-phrasing S2. The previously-stochastic
 * Blues block (`type > 0.72 / 0.45 / 0.2 / else`) is lifted into named cells with
 * the same `(sectionId, barIndex >> 2)` phrase-stability hash as Jazz/Bossa. Every
 * cell starts on the One (Blues comping is built off the downbeat); variation is in
 * how the bar is answered.
 *
 * 16th indices computed against 4/4 with stepsPerBeat=4 (firstBackbeat=1,
 * secondBackbeat=3, middleBeat=2; latePushStep=floor(4*0.75)=3).
 */
export const BLUES_COMPING_CELLS: readonly (readonly number[])[] = [
    // why: Backbeat-lean — One + beats 2 and 4. Locks tight with the drummer's
    //      backbeat; classic shuffle-blues block-chord answer. Old picker
    //      threshold > 0.72 (the dominant branch), preserved as cell 0.
    [0, 4, 12],
    // why: Shuffle anticipation — One + late-&-of-2 (step 7) + beat-4.
    //      Pushes into 3 from a swung "and" of 2; reads as a Texas-shuffle lift.
    [0, 7, 12],
    // why: Beat-3 answer — One + beat-3 + late-&-of-4 (step 15). Strong middle
    //      pivot, then a turnaround push back into the next One; canonical
    //      I-IV-V "and the band joins in on 3" gesture.
    [0, 8, 15],
    // why: Juke-joint pocket — One + beat-2 + late-&-of-3 (step 11). Denser,
    //      forward-leaning; the late-&-of-3 is the hook that distinguishes
    //      this from the backbeat-lean cell.
    [0, 4, 11],
] as const;
