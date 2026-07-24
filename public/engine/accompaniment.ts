import { TIME_SIGNATURES } from '../config.js';
import type { Chord, EnsembleState, Mutable, StepInfo } from '../types.js';
import { getFrequency, getMidi } from '../utils.js';
import { INTRO_MUTES, OUTRO_MUTES } from './arrangement-layering.js';
import { ALTERED_HOOK_QUALITIES } from './chord-quality-sets.js';
import {
    BLUES_COMPING_CELLS,
    BOSSA_PARTIDO_ALTO_CELLS,
    COMPOUND_COMPING_CELLS,
    FUNK_COMPING_CELLS,
    FUNK_COMPING_ORNAMENTS,
    JAZZ_COMPING_CELLS,
} from './comping-cells.js';
import { type AccompanimentCoordination, type CCEvent, emitCompNotes } from './comping-emit.js';
import { compingState } from './comping-state.js';
import { scrambleHash, stringHash31 } from './hash-utils.js';
import {
    averageMidi,
    getBassSpaceFloor,
    recenterVoicing,
    selectCompactCluster,
    shouldPreferGroundedPracticeVoicing,
    shouldReserveBassSpace,
} from './voicing-policy.js';

/**
 * ACCOMPANIMENT.JS - Rhythmic Style Engine
 *
 * Standardized to return Note Objects for the Worker/Scheduler.
 */

// Comp-memory struct extracted to comping-state.ts (#1014). Re-exported here so
// the workers (logic-worker.ts, midi-worker-logic.ts) and the ~15 tests that import
// `compingState`/`resetCompingState`/`CompingState` from accompaniment.ts keep working
// untouched. `compingState` is a MUTATED SHARED SINGLETON — this re-export preserves
// the single object identity every consumer relies on.
export { type CompingState, compingState, resetCompingState } from './comping-state.js';

// why: STICKY genres retain the comping cell across multiple bars instead of
//      re-rolling every bar in `updateRhythmicIntent`. Funk was the original
//      sticky case (S1: deterministic cell bank). S2 (epic-deterministic-
//      phrasing) extends sticky behavior to Jazz/Bossa/Blues so the phrase-
//      stable Charleston-family picker isn't bypassed by the non-sticky
//      `grooveRetentionCount = 0` branch — without STICKY membership the
//      picker re-runs every bar and the (sectionId, barIndex>>2) hash never
//      gets to hold a cell across the 4-bar phrase.
// #717: 'Soul' removed — it's a phantom routing key (the canonical genre is
// 'Neo-Soul', already present). No code resolves a genre to bare 'Soul', so the
// entry was dead. Per CLAUDE.md, Soul/Minimal/Shred/Latin/Afrobeat are
// non-canonical keys being retired, not the supported 13.
// Exported for tests/standards/genre-feel-canon-guard.test.ts (#1208) only.
export const STICKY_GENRES = ['Funk', 'Reggae', 'Neo-Soul', 'Ska', 'Jazz', 'Bossa Nova', 'Blues'];

// why: comping styles that idiomatically land on offbeats — these are the genres
// where pre-voicing the upcoming chord on the "and-of-4" reads as anticipation
// rather than as a premature downbeat. Block-chord styles (Reggae skank,
// country boom-chick, power-metal) play only on downbeats so an anticipated
// stab would feel out of place. Note: `'Soul'` is not in the live `genreFeel`
// vocabulary (`Neo-Soul` is); omitted intentionally.
// Source: form-arranger.md P0 #2; epic-coordination-contract.md S3.
const CHORD_ANTICIPATION_GENRES = new Set(['Jazz', 'Funk', 'Neo-Soul', 'Blues', 'Bossa Nova']);

// why: genres whose comp is sparse enough that the final beat before a *within-
// section* chord change should become an idiomatic horn pickup — a single
// staccato stab of the INCOMING chord on the &-of-the-last-beat, with the rest
// of the final beat resting — instead of stabbing the outgoing chord into the
// change (#719, the blues "quick C7 before the F7"). Scoped to Jazz/Blues: dense-
// comp genres (Funk, Neo-Soul) keep their 16th grid through changes, and Bossa's
// own anticipation idiom — those need a per-genre pass (tracked for #712),
// not this fall-through. Distinct from CHORD_ANTICIPATION_GENRES (which gates the
// SECTION-boundary stab above).
const WITHIN_SECTION_ANTICIPATION_GENRES = new Set(['Jazz', 'Blues']);

// why: hook/breath subset of altered dominants. Excludes 7#11 (lydian dominant) because
// its scale source — root, 3, #11, 5, 6, b7 — does NOT contain b9, #9, or b13. Hook
// rewards on {b9, #9, #11/b5, b13/#5} that work over 7alt/7b9/7#9/7b13 actively fight
// 7#11's harmonic intent (#11 is bright/colorful, paired with NATURAL 9 and 13). Same
// for the 150ms pre-cut "breath" — 7#11 is a static color chord that rings through.
// Use ALTERED_DOMINANT_QUALITIES for structural concerns (inversion routing, shell
// reduction); use ALTERED_HOOK_QUALITIES for soloist hook-pitch reward and comper
// tension-resolution breath. Source: Epic 9 S3 P1 finding (music-theory review).
// #542: hoisted to the dependency-free chord-quality-sets.ts leaf so the soloist's
// import of it no longer drags this whole module into the main bundle chunk.

/**
 * Deterministic int hash for cell-bank picking. Folds a small string id (typically
 * `chord.sectionId`) into an int so `(sectionId, phraseIndex)` keys produce stable
 * picks across loops while still varying across sections.
 */
function hashSectionId(sectionId: string | null | undefined): number {
    if (!sectionId) {
        return 0;
    }
    // djb2 ×31-from-0 (stringHash31, canonical helper) folded to non-negative.
    // why: kept on the ×31 variant — accompaniment cell-bank picks depend on
    // this exact distribution; switching to the ×33 section hash would shift it.
    return Math.abs(stringHash31(sectionId));
}

/**
 * Algorithmic Pattern Generator
 * Generates a binary rhythmic hit pattern for a single measure.
 * Replaces static PIANO_CELLS table to save space and increase variety.
 * @param vibe - 'sparse' | 'balanced' | 'active'
 * @param length - Pattern length in steps (default 16).
 * @param phraseIndex - Index into the genre's phrase/cell bank. For most genres this
 *   is the absolute bar index; STICKY-deterministic genres (Funk) pass a per-rotation
 *   counter (`compingState.funkRotationIndex`) so cell choice advances on rotation
 *   events rather than absolute bars (which would collide with the {4,8}-bar snap).
 * @param sectionId - Current arranger section id; folded into deterministic-cell hashes.
 * @returns Binary array (0 | 1) of length `length`, where 1 marks a rhythmic hit.
 */
export function generateCompingPattern(
    state: EnsembleState,
    genre: string,
    vibe: string,
    tsConfig: any,
    length = 16,
    phraseIndex = 0,
    sectionId: string | null = null,
): number[] {
    const { playback } = state;
    const pattern = new Array(length).fill(0);
    const intensity = playback.bandIntensity;
    const ts = tsConfig || TIME_SIGNATURES['4/4'];
    const spb = ts.stepsPerBeat;
    const backbeat = ts.backbeat || (ts.beats >= 4 ? [1, 3] : ts.beats >= 3 ? [1] : []);
    const offbeatStep = Math.min(spb - 1, Math.max(1, Math.floor(spb / 2)));
    const latePushStep = Math.min(spb - 1, Math.max(1, Math.floor(spb * 0.75)));
    const middleBeat = ts.beats >= 4 ? 2 : Math.max(1, ts.beats - 1);
    const finalBeat = Math.max(0, ts.beats - 1);

    const hit = (step: number) => {
        if (step < length) {
            pattern[step] = 1;
        }
    };

    const getBeatStep = (beatIdx: number, offsetSteps = 0) => {
        return beatIdx * spb + offsetSteps;
    };

    const addBeatHits = (beats: number[]) => {
        beats.forEach((beatIdx) => {
            if (beatIdx >= 0 && beatIdx < ts.beats) {
                hit(getBeatStep(beatIdx));
            }
        });
    };

    // #712: deterministic phrase-keyed draws — these replace the per-call
    // `Math.random()` onset gates in the stochastic branches (Neo-Soul, Ska,
    // Rock/Country, Pop default) so the comp figure is reproducible and LOCKS to
    // the phrase identity instead of re-dicing every bar (the most common genres
    // could not establish a repeating figure by construction — the core "doesn't
    // lock in" bug). `pickPhrase(k)` holds a value for a full 4-bar phrase (the
    // skeleton/pocket); `pickBar(k)` varies per bar (living ornament detail).
    // Both are loop-stable because `phraseIndex` is the IN-LOOP bar now. Same
    // recipe the Funk/Hip-Hop cell banks already use, just expressed as uniform
    // draws so each branch's existing probabilities/feel are preserved verbatim.
    const pickerSectionHash = hashSectionId(sectionId);
    const pickPhrase = (k: number) =>
        scrambleHash((pickerSectionHash * 131 + (phraseIndex >> 2) * 17 + k * 7) | 0);
    const pickBar = (k: number) =>
        scrambleHash((pickerSectionHash * 131 + phraseIndex * 17 + k * 7) | 0);

    // --- GENRE ARCHETYPES ---

    if (genre === 'Neo-Soul') {
        // Lay back heavily on the "and" of beats 2 and 4 (in 4/4) or semantic backbeats
        const backbeats = ts.backbeat || [1, 3];
        backbeats.forEach((b: number) => {
            hit(getBeatStep(b, Math.floor(spb / 2))); // The "and"
        });

        // Add syncopated "filler" at high intensity (deterministic, phrase-keyed)
        if (intensity > 0.6) {
            // fillers roughly on offbeats of 1, 3 etc
            [0, 2].forEach((b: number) => {
                if (pickBar(b) < intensity * 0.4) {
                    hit(getBeatStep(b, Math.floor(spb * 0.75)));
                }
            });
        }
        return pattern;
    }

    if (genre === 'Reggae') {
        // NOTE: post-S5 the chord-channel reggae lane (`getAccompanimentNotes`,
        // ~line 1899) gates only on `stepInfo.isBackbeat` and never consults
        // `compingState.currentCell`. This pattern is not currently consumed.
        // Kept for parity with the other genre branches in case a future bubble
        // lane or "rockers" double-skank wants a cell to read from.
        const backbeats = ts.backbeat || [1, 3];
        backbeats.forEach((b: number) => {
            hit(getBeatStep(b));
        });

        if (vibe === 'active' || intensity > 0.7) {
            backbeats.forEach((b: number) => {
                hit(getBeatStep(b, Math.floor(spb / 2))); // The "and"
            });
        }
        return pattern;
    }

    if (genre === 'Ska') {
        // Upstroke on every "and"
        for (let b = 0; b < ts.beats; b++) {
            hit(getBeatStep(b, Math.floor(spb / 2)));
        }

        // Active: Add some 16th syncopations or "double upstrokes"
        // (deterministic, phrase-keyed — locks the upstroke variations per phrase)
        // #585: intentionally sparse seasoning — gated on active/high-intensity
        // and fires on only ~30% of qualifying bars (pickBar < 0.3). Zero hits in
        // a non-active/low-intensity harness is expected, not a dead gate; the
        // deterministic '&' skank lane above carries the Ska identity on its own.
        if (vibe === 'active' || intensity > 0.7) {
            for (let b = 0; b < ts.beats; b++) {
                if (pickBar(b) < 0.3) {
                    hit(getBeatStep(b, Math.floor(spb * 0.75)));
                }
            }
        }
        return pattern;
    }

    if (genre === 'Disco') {
        // Offbeats (and of every beat)
        for (let b = 0; b < ts.beats; b++) {
            hit(getBeatStep(b, Math.floor(spb / 2)));
        }
        // Active: Add 16th syncopation
        if (vibe === 'active') {
            const lastBeat = ts.beats - 1;
            hit(getBeatStep(lastBeat, spb - 1));
            if (ts.beats > 2) {
                hit(getBeatStep(1, spb - 1));
            }
        }
        return pattern;
    }

    if (genre === 'Funk') {
        // why: chords.md P0 #1 / epic-deterministic-phrasing S1 — funk comping is
        //      cell-based, not stochastic per-step. Pick a cell from the bank keyed
        //      by `(sectionId, phraseIndex)` so the same chord on the same phrase of
        //      a loop produces the same rhythmic shape. For Funk, the caller passes
        //      `compingState.funkRotationIndex` as `phraseIndex` so cell choice
        //      locks to STICKY rotation events instead of absolute bar count (see
        //      `updateRhythmicIntent`).
        //
        //      NB: do NOT right-shift `phraseIndex` here. The earlier `>> 1` aliased
        //      with the 4-bar / 8-bar STICKY rotation snap so the picker collapsed
        //      to one or two cells after a few bars (reviewer P0-1, 2026-05-17).
        const sectionHash = hashSectionId(sectionId);
        const cellIndex =
            (((sectionHash * 17 + phraseIndex * 31) % FUNK_COMPING_CELLS.length) +
                FUNK_COMPING_CELLS.length) %
            FUNK_COMPING_CELLS.length;
        const cell = FUNK_COMPING_CELLS[cellIndex];

        // why: `sparse` vibe drops the last (latest-in-bar) hit so the cell still
        //      reads as itself but with one less syncopation — preserves identity
        //      across vibe changes. The minimal-One branch (12.5% of sparse phrases,
        //      keyed on `% 8`) was previously a total-silence branch (25%, `% 4`) —
        //      reviewer P1-7: full-bar silence reads as a dropout, not as sparse
        //      comping. Hitting just the One preserves the groove's pulse while
        //      giving the section maximum breathing room.
        if (vibe === 'sparse') {
            const minimalGate = (sectionHash + phraseIndex) % 8 === 0;
            if (minimalGate) {
                hit(0);
                return pattern;
            }
            for (let i = 0; i < cell.length - 1; i++) {
                hit(cell[i]);
            }
            return pattern;
        }

        for (let i = 0; i < cell.length; i++) {
            hit(cell[i]);
        }

        // why: `active` vibe adds one ornament 16th from a parallel bank — same hash
        //      space so the ornament locks to the cell instead of jittering each bar.
        //      Ornaments are verified above to land on syncopations and never collide
        //      with the parent cell's hits.
        if (vibe === 'active') {
            const ornamentIdx =
                (((sectionHash * 19 + phraseIndex * 11) % FUNK_COMPING_ORNAMENTS.length) +
                    FUNK_COMPING_ORNAMENTS.length) %
                FUNK_COMPING_ORNAMENTS.length;
            hit(FUNK_COMPING_ORNAMENTS[ornamentIdx]);
        }

        return pattern;
    }

    if (genre === 'Blues') {
        // why: chords.md P0 #2 / epic-deterministic-phrasing S2 — Blues comping
        //      is phrase-stable, not stochastic per-bar. Pick a cell from the
        //      bank keyed by `(sectionId, barIndex >> 2)` so all 4 bars of one
        //      phrase share the same rhythmic shape. `phraseIndex` here is the
        //      caller's bar index (see `updateRhythmicIntent` line ~975) — we
        //      right-shift to convert bar → 4-bar phrase index. Hash multipliers
        //      `17` and `31` mirror the S1 Funk picker for cross-genre consistency.
        const phraseHash = phraseIndex >> 2;
        const sectionHash = hashSectionId(sectionId);
        const cellIndex =
            (((sectionHash * 17 + phraseHash * 31) % BLUES_COMPING_CELLS.length) +
                BLUES_COMPING_CELLS.length) %
            BLUES_COMPING_CELLS.length;
        const cell = BLUES_COMPING_CELLS[cellIndex];

        // why: `sparse` vibe drops the latest (highest-step) hit, mirroring the
        //      S1 Funk sparse rule. Preserves cell identity while opening room
        //      for the soloist; identity remains tied to the bank pick, not to
        //      vibe (S2 hard rule: vibe modulates the cell, doesn't change which
        //      cell is picked). The minimum-One safety net guarantees the bar
        //      has a downbeat even if the cell were ever empty.
        if (vibe === 'sparse') {
            if (cell.length <= 1) {
                hit(cell[0] ?? 0);
                return pattern;
            }
            for (let i = 0; i < cell.length - 1; i++) {
                hit(cell[i]);
            }
            return pattern;
        }

        for (let i = 0; i < cell.length; i++) {
            hit(cell[i]);
        }

        // why: `active` vibe (or high intensity/complexity) adds late-&-of-3 as a
        //      single ornament — preserves Blues forward-pull without bloating
        //      the cell. The previous stochastic 35/50% offbeat additions used
        //      `Math.random()`; replaced with a deterministic gate keyed off
        //      `(sectionHash, phraseHash)` so the ornament locks to the phrase.
        //      Only fires when the parent cell doesn't already cover that step
        //      to avoid double-strike.
        const wantOrnament = vibe === 'active' || intensity > 0.58 || playback.complexity > 0.5;
        if (wantOrnament) {
            const ornamentStep = getBeatStep(middleBeat, latePushStep); // late-&-of-3 = step 11
            if (pattern[ornamentStep] !== 1) {
                // why: gate every other phrase (sectionHash + phraseHash) % 2 so the
                //      ornament doesn't fire on every active bar — keeps "active"
                //      from collapsing the bank's distinct cells onto identical
                //      ornament-augmented shapes.
                if ((sectionHash + phraseHash) % 2 === 0) {
                    hit(ornamentStep);
                }
            }
        }
        return pattern;
    }

    if (genre === 'Bossa Nova' && !ts.isCompound && ts.beats >= 4 && spb === 4) {
        // why: epic-coordination-consistency S5.c — partido-alto cell bank,
        //      distinct from Jazz Charleston. The picker mirrors the Jazz
        //      branch structure (`(sectionId, phraseHash)` keyed cell pick,
        //      vibe modulates the cell rather than re-rolls the pick) and the
        //      partido-alto bank. `!ts.isCompound && ts.beats >= 4 && spb === 4`
        //      makes the 4/4-only intent explicit (epic-1-compound-meter S3):
        //      partido-alto is a 4/4 16th-note idiom; compound meters (6/8,
        //      12/8) fall through to the Jazz-Charleston bank below instead of
        //      silently skipping via the `spb === 4` check (which was always
        //      false in 6/8 where spb=2). The isCompound guard prevents a
        //      future compound Bossa meter from accidentally entering this path.
        //
        //      S5.c follow-up: `phraseIndex` here is `compingState.bossaRotationIndex`
        //      (caller — see `updateRhythmicIntent`), a counter advancing by 1 per
        //      picker call. The original `barIndex >> 1` hash aliased against the
        //      {4, 8}-bar STICKY retention to one or two reachable cells, erasing
        //      the genre-defining bar-A/bar-B alternation. With 2-bar retention
        //      pinned for Bossa, the counter walks 0,1,2,3,... and we use it
        //      directly (no shift) so the cell bank sweeps consecutively.
        const phraseHash = phraseIndex;
        const sectionHash = hashSectionId(sectionId);
        const cellIndex =
            (((sectionHash * 17 + phraseHash * 31) % BOSSA_PARTIDO_ALTO_CELLS.length) +
                BOSSA_PARTIDO_ALTO_CELLS.length) %
            BOSSA_PARTIDO_ALTO_CELLS.length;
        const cell = BOSSA_PARTIDO_ALTO_CELLS[cellIndex];

        // why: anticipation-of-1 (step 14) is the load-bearing partido-alto
        //      gesture. Even on `sparse` vibe we keep step 14 because
        //      dropping it would erase the genre signature — instead, sparse
        //      drops the EARLIEST hit (the downbeat or e-of-1) so the bar
        //      breathes while still landing the anticipation.
        if (vibe === 'sparse') {
            if (cell.length <= 1) {
                hit(cell[0] ?? 14);
                return pattern;
            }
            // Drop the first (earliest) hit; keep step 14 (always last).
            for (let i = 1; i < cell.length; i++) {
                hit(cell[i]);
            }
            return pattern;
        }

        for (let i = 0; i < cell.length; i++) {
            hit(cell[i]);
        }

        // why: `active` vibe adds one ornament on e-of-3 (step 9) — a 16th
        //      that thickens the bar's middle without colliding with any
        //      cell's existing hits (every cell sits on steps {0,1,2,3,6,
        //      10,14}, none on 9). Phrase-gated so it doesn't fire on every
        //      active bar.
        if (vibe === 'active') {
            const ornamentStep = 9; // e-of-3
            if (pattern[ornamentStep] !== 1 && (sectionHash + phraseHash) % 2 === 0) {
                hit(ornamentStep);
            }
        }
        return pattern;
    }

    if (genre === 'Jazz' || genre === 'Bossa Nova') {
        // why: chords.md P0 #2 / epic-deterministic-phrasing S2 — Jazz/Bossa
        //      Charleston-family comping is phrase-stable. Pick one cell from
        //      the bank, keyed by `(sectionId, barIndex >> 2)`, and hold it for
        //      the full 4-bar phrase. `phraseIndex` here is the caller's bar
        //      index (see `updateRhythmicIntent`); we right-shift to convert
        //      bar → 4-bar phrase index. Hash multipliers `17` and `31` mirror
        //      the S1 Funk picker for cross-genre consistency.
        //
        //      why: epic-1-compound-meter S3 — `JAZZ_COMPING_CELLS` is
        //      4/4-shaped (steps 0-15). In 6/8 (12-step bar), cell `[14]`
        //      produces silent bars and `[2,8]` lands on 4/4-derived offbeats.
        //      Route compound meters to `COMPOUND_COMPING_CELLS` which uses
        //      the 6/8 pulse grid (steps 0, 6) and the canonical step-10
        //      anticipation.
        const bank = ts.isCompound ? COMPOUND_COMPING_CELLS : JAZZ_COMPING_CELLS;
        const phraseHash = phraseIndex >> 2;
        const sectionHash = hashSectionId(sectionId);
        const cellIndex =
            (((sectionHash * 17 + phraseHash * 31) % bank.length) + bank.length) % bank.length;
        const cell = bank[cellIndex];

        // why: `sparse` vibe drops the latest (highest-step) hit, matching the
        //      original picker's "if (vibe !== 'sparse') hit(secondNote)" pattern
        //      and the S1 Funk sparse rule. Identity remains tied to the cell
        //      pick, not to vibe (S2 hard rule: vibe modulates the cell, doesn't
        //      change which cell is picked). Single-hit cells (e.g. Sparse
        //      Anticipation `[14]`) keep their lone hit so the bar isn't empty.
        if (vibe === 'sparse') {
            if (cell.length <= 1) {
                hit(cell[0]);
                return pattern;
            }
            for (let i = 0; i < cell.length - 1; i++) {
                hit(cell[i]);
            }
            return pattern;
        }

        for (let i = 0; i < cell.length; i++) {
            hit(cell[i]);
        }

        // why: `active` vibe adds one piece of "comping chatter" deterministically.
        //      The previous picker used two `Math.random() > 0.5` gates to drop
        //      hits on beat-2 and &-of-3; replaced with a single phrase-keyed
        //      ornament (alternates beat-2 and &-of-3 across phrases) so the
        //      chatter locks to the phrase identity instead of jittering each bar.
        //      Only fires when the step isn't already part of the parent cell to
        //      avoid double-strike.
        if (vibe === 'active' && ts.beats >= 4) {
            // why: epic-1-compound-meter S7 follow-up — in compound meters the
            // idiomatic ornament slot is the "and-of-pulse" anticipation
            // (mStep 4/10 in 6/8 grouping [3,3]; 4/10/16/22 in 12/8), NOT the
            // 4/4 "beat 2" / "&-of-3" the simple-meter path uses. `getBeatStep(2)`
            // = the third eighth of the first pulse group (mStep 4); `ts.beats-1`
            // = the last group's anticipation. Alternate the two across phrases
            // so the chatter still tracks phrase identity.
            const ornamentStep = ts.isCompound
                ? (sectionHash + phraseHash) % 2 === 0
                    ? getBeatStep(2) // and-of-first-pulse → mStep 4
                    : getBeatStep(ts.beats - 1) // and-of-last-pulse → mStep 10 (6/8)
                : (sectionHash + phraseHash) % 2 === 0
                  ? getBeatStep(1) // beat-2
                  : getBeatStep(2, Math.floor(spb / 2)); // &-of-3
            if (pattern[ornamentStep] !== 1) {
                hit(ornamentStep);
            }
        }
        return pattern;
    }

    if (genre === 'Rock' || genre === 'Country') {
        // #712: the pocket choice is the phrase SKELETON — hold it for the whole
        // 4-bar phrase (`pickPhrase`) so the comp figure locks in; the small
        // ornament adds below vary per bar (`pickBar`) for living detail.
        const type = pickPhrase(0);
        const firstBackbeat = backbeat[0] ?? Math.min(1, finalBeat);
        const secondBackbeat = backbeat[1] ?? finalBeat;

        hit(0);

        if (vibe === 'sparse') {
            if (intensity < 0.4) {
                addBeatHits([middleBeat]);
                if (pickBar(1) < 0.35) {
                    hit(getBeatStep(finalBeat, offbeatStep));
                }
            } else {
                addBeatHits([firstBackbeat]);
                if (ts.beats >= 4 && pickBar(2) < 0.45) {
                    addBeatHits([secondBackbeat]);
                }
            }
            return pattern;
        }

        if (type > 0.75) {
            // Driving pocket: 1, 2, 3&, 4
            addBeatHits([firstBackbeat, secondBackbeat]);
            hit(getBeatStep(middleBeat, offbeatStep));
        } else if (type > 0.5) {
            // Punchy anticipation: 1, 2, &2, 4
            addBeatHits([firstBackbeat, secondBackbeat]);
            hit(getBeatStep(firstBackbeat, offbeatStep));
        } else if (type > 0.25) {
            // Grounded verse comping: 1, 3, &3, 4
            addBeatHits([middleBeat, secondBackbeat]);
            hit(getBeatStep(middleBeat, offbeatStep));
        } else {
            // Lift into the turnaround: 1, 2, 3, &4
            addBeatHits([firstBackbeat, middleBeat]);
            hit(getBeatStep(secondBackbeat, offbeatStep));
        }

        const shouldAddOffbeats =
            vibe === 'active' || intensity > 0.52 || playback.complexity > 0.4;
        if (shouldAddOffbeats) {
            if (pickBar(3) < 0.45) {
                hit(getBeatStep(middleBeat, offbeatStep));
            }
            if (pickBar(4) < 0.3) {
                hit(getBeatStep(secondBackbeat, offbeatStep));
            }
        }

        if ((playback.complexity > 0.4 || intensity > 0.5) && ts.beats >= 4 && pickBar(5) > 0.55) {
            pattern[getBeatStep(middleBeat)] = 0;
            hit(getBeatStep(firstBackbeat, latePushStep));
        }

        return pattern;
    }

    if (genre === 'Hip Hop') {
        // why: #554 — Hip Hop piano (sampled-soul Rhodes, boom-bap) is a SPARSE,
        //      behind-the-beat stab idiom, not a downbeat pulse. The chord lands
        //      1-2 times per bar OFF the One — on the "and"s and pushed 16ths —
        //      so it floats over the kick/snare instead of marking every beat.
        //      Deterministic cell bank keyed by `(sectionId, phraseIndex)` per the
        //      "Deterministic phrasing" rule: looped playback and critique tests
        //      must produce the same shape on the same bar (NO Math.random here —
        //      the surrounding Rock/Neo-Soul branches use it, but that's the old
        //      pattern; this new branch is seeded).
        //
        //      Cells are expressed in 16th steps (4/4, spb=4): beat-N at 4*(N-1);
        //      e=+1, &=+2, a=+3. Every hit is off step 0 and off every quarter
        //      pulse (steps 4, 8, 12) — the genre's whole point is to dodge the
        //      downbeat. spb-relative helpers (`offbeatStep`, `latePushStep`,
        //      `getBeatStep`) keep the gestures musical under non-4/4 meters.
        const and = offbeatStep; // the "&" of a beat (spb/2)
        const push = latePushStep; // the late 16th "a" (spb*0.75)
        // why: a small bank of distinct sparse stab cells. Each is 1-2 hits, all
        //      behind the beat. Rotated by `phraseIndex` (+ section hash) so the
        //      pattern evolves across the form rather than looping one shape, but
        //      stays deterministic for loop-comparison.
        //   0: "& of 2"               — single lazy stab in the bar's back half.
        //   1: "& of 2" + "& of 3"    — call/answer pair straddling the middle.
        //   2: "a of 1" + "& of 3"    — pushed front + answer; classic boom-bap lean.
        //   3: "& of 4"               — anticipation stab pulling into the next bar.
        const HIPHOP_STAB_CELLS: number[][] = [
            [getBeatStep(1, and)],
            [getBeatStep(1, and), getBeatStep(2, and)],
            [getBeatStep(0, push), getBeatStep(2, and)],
            [getBeatStep(Math.max(0, ts.beats - 1), and)],
        ];
        const sectionHash = hashSectionId(sectionId);
        const cellIndex =
            (((sectionHash * 17 + phraseIndex * 31) % HIPHOP_STAB_CELLS.length) +
                HIPHOP_STAB_CELLS.length) %
            HIPHOP_STAB_CELLS.length;
        const cell = HIPHOP_STAB_CELLS[cellIndex];

        // why: `sparse` vibe (soloist busy / low intensity) keeps only the LATEST
        //      hit so the comper drops to a single anticipation stab — maximum
        //      room, still off the beat. Preserves the behind-beat identity.
        if (vibe === 'sparse') {
            hit(cell[cell.length - 1]);
            return pattern;
        }

        for (let i = 0; i < cell.length; i++) {
            hit(cell[i]);
        }

        // why: only at high energy (`active` vibe or intensity > 0.7) does boom-bap
        //      add ONE more 16th — and even then it lands on the "a of 3" (a pushed
        //      offbeat), never on a downbeat, and only if the cell didn't already
        //      cover it. Caps the bar at <=2-3 hits so the idiom stays sparse; the
        //      ornament is phrase-gated so it doesn't fire every active bar.
        if (
            (vibe === 'active' || intensity > 0.7) &&
            (sectionHash + phraseIndex) % 2 === 0 &&
            cell.length < 2
        ) {
            const ornamentStep = getBeatStep(middleBeat, push); // late "a" of the middle beat
            if (pattern[ornamentStep] !== 1) {
                hit(ornamentStep);
            }
        }
        return pattern;
    }

    // --- ROCK / POP / DEFAULT ---
    // Downbeat focus
    hit(0); // The One

    if (vibe === 'sparse') {
        // If low intensity, use arpeggio-style hits on 8ths
        if (intensity < 0.4) {
            for (let b = 0; b < ts.beats; b++) {
                hit(getBeatStep(b));
                hit(getBeatStep(b, Math.floor(spb / 2)));
            }
        }
        return pattern;
    }

    // Pulse support
    for (let b = 0; b < ts.beats; b++) {
        if (b === 0 || backbeat.includes(b)) {
            hit(getBeatStep(b));
        }
    }

    if (vibe === 'active' || intensity > 0.6) {
        // 8th notes (deterministic, phrase-keyed per-beat for living detail)
        for (let b = 0; b < ts.beats; b++) {
            if (pickBar(10 + b) > 0.4) {
                hit(getBeatStep(b, Math.floor(spb / 2)));
            }
        }
    }

    // Syncopation — a figure-level choice, so hold it for the whole phrase.
    if (playback.complexity > 0.6 && pickPhrase(1) > 0.5) {
        const b3 = 2; // Beat 3
        if (ts.beats > b3 && pattern[getBeatStep(b3)] === 1) {
            pattern[getBeatStep(b3)] = 0;
            hit(getBeatStep(b3 - 1, Math.floor(spb * 0.75))); // Push to &2
        }
    }

    return pattern;
}

/**
 * Updates {@link compingState} (currentCell, currentVibe, rhythmicMask, intent fields)
 * once per measure / section-change boundary.  Called every step from
 * {@link getAccompanimentNotes} but exits early if the step is still inside
 * the current locked window to avoid unnecessary regeneration.
 *
 * Side-effects:
 *  - Writes `compingState.currentCell`, `compingState.currentVibe`, `compingState.lockedUntil`.
 *  - Writes `chords.rhythmicMask` for cross-module coordination.
 *  - Writes `playback.intent.*` fields used by the timing pocket.
 *
 * @param step - Absolute scheduler step.
 * @param soloistBusy - True when the soloist is actively playing notes.
 * @param spm - Steps per measure (default 16).
 * @param sectionId - Current arranger section ID; triggers a groove reset on change.
 */
function updateRhythmicIntent(
    state: EnsembleState,
    step: number,
    soloistBusy: boolean,
    spm = 16,
    sectionId: string | null = null,
): void {
    const { playback, chords, groove, arranger } = state;
    const signatures: any = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];

    // --- Section Change Detection ---
    if (sectionId && compingState.lastSectionId !== sectionId) {
        compingState.grooveRetentionCount = 0;
        compingState.lastSectionId = sectionId as any;
        compingState.lockedUntil = 0; // Force update
        // why: each section gets its own rotation sequence so the cell-bank picker
        //      restarts at index 0 on every section change — same arranger position
        //      across loops produces the same cell.
        compingState.funkRotationIndex = 0;
        compingState.bossaRotationIndex = 0;
        // #715 — a section change is a fresh statement opportunity; clear the
        // per-hit-economy memory so the new section's first hit isn't read as an
        // answer if it happens to share the prior chord's root+quality.
        compingState.statementChordKey = null;
        compingState.statementVoicingMidis = [];
        // #766 — drop any pending ring-through across a section boundary; the marked
        // answer step belongs to the old section's chord.
        compingState.ringSuppressStep = -1;
        compingState.ringSuppressChordKey = null;
    }

    if (step < compingState.lockedUntil) {
        return;
    }

    // Detect Soloist Falling Edge (Busy -> Not Busy) for "Call & Response"
    const wasBusy = compingState.soloistActivity > 0;
    compingState.soloistActivity = soloistBusy ? 1 : 0;
    const soloistJustStopped = wasBusy && !soloistBusy;

    const intensity = playback.bandIntensity;
    const complexity = playback.complexity;
    let genre = groove.genreFeel;

    // --- Style Override ---
    // why: `chords.style === 'jazz'` is set by Smart Genres for Jazz, Blues,
    // AND Bossa Nova (see `public/data/smart-genres.ts`) — all three share
    // upper-structure jazz voicing logic, but they have distinct comping
    // banks in this file (Bossa partido-alto at ~944/~1003, Blues cells at
    // ~884). Preserving the more-specific `groove.genreFeel` for these two
    // keeps those banks alive in production; without the carve-out the
    // override collapses both to 'Jazz' and the genre-specific cells become
    // dead code. FOLLOWUPS §G.16.
    if (chords.style === 'jazz') {
        if (genre !== 'Bossa Nova' && genre !== 'Blues') {
            genre = 'Jazz';
        }
    } else if (chords.style === 'funk') {
        genre = 'Funk';
    } else if (chords.style === 'strum8') {
        genre = 'Rock';
    } else if (chords.style === 'strum-country') {
        genre = 'Country';
    } else if (chords.style === 'power-metal') {
        genre = 'Metal';
    } else if (chords.style === 'ska-upstroke') {
        genre = 'Ska';
    }

    // --- Sticky Groove Logic ---
    if (STICKY_GENRES.includes(genre)) {
        // why: epic-coordination-consistency S5.c follow-up — Bossa partido-alto's
        //      bar-A/bar-B call/response cycle is the genre's load-bearing identity.
        //      Default {4, 8}-bar STICKY retention (set by the rotation-reset block
        //      below for Funk and inherited by other STICKY genres) holds cells too
        //      long, structurally erasing the 2-bar alternation. Force 2-bar
        //      retention here so each `bossaRotationIndex` increment lands a fresh
        //      cell; idempotent and applied on every Bossa tick (covers the initial
        //      section bar where maxGrooveLength may be stale from a prior section).
        if (genre === 'Bossa Nova') {
            compingState.maxGrooveLength = 2;
        }
        compingState.grooveRetentionCount++;

        // Only retain if we are NOT on the first bar of the groove
        if (
            compingState.grooveRetentionCount > 1 &&
            compingState.grooveRetentionCount <= compingState.maxGrooveLength
        ) {
            // RETAIN PATTERN
            compingState.lockedUntil = step + spm;
            return;
        }

        // If we exceeded max length, reset and fall through to pick new cell
        if (compingState.grooveRetentionCount > compingState.maxGrooveLength) {
            compingState.grooveRetentionCount = 1; // Start new groove now
            // why: epic-deterministic-phrasing S1 — STICKY rotation length used to
            //      be uniform-random 4–8 bars (`4 + Math.floor(Math.random() * 4)`),
            //      which broke loop-equality on Funk comping. Snap to musical phrase
            //      lengths {4, 8} keyed off `funkRotationIndex` rather than off
            //      `barIndex >> 2`. Reviewer P1-6: bar-index hashing has hysteresis
            //      (once max snaps to 8, the next rotation is bar+8, preserving the
            //      mod-2 parity and tending to stick at 8 forever). The rotation
            //      counter is a fresh draw each time, breaking the hysteresis.
            //      Partial fix for chords.md P2 #13 — full arranger-aware snap is
            //      tracked separately. Weighting `{4: 0.5, 8: 0.5}` (mod 2); the
            //      optional 16-bar bucket from chords.md is deferred.
            if (genre === 'Bossa Nova') {
                // why: keep Bossa pinned to 2-bar retention through rotation events
                //      (see top of STICKY block). The {4, 8} draw is Funk-shaped and
                //      would re-erase the partido-alto bar-A/bar-B alternation.
                compingState.maxGrooveLength = 2;
            } else {
                const rotateHash = hashSectionId(sectionId) + compingState.funkRotationIndex + 1;
                compingState.maxGrooveLength = rotateHash % 2 === 0 ? 4 : 8;
            }
        }
    } else {
        // Non-sticky genres (Jazz, Rock, etc.) always refresh or have standard logic
        compingState.grooveRetentionCount = 0;
    }

    if (soloistBusy) {
        compingState.currentVibe = 'sparse';
    } else if (soloistJustStopped) {
        // Soloist is taking a breath -> Fill the space!
        compingState.currentVibe = 'active';
    } else if (intensity > 0.75 || complexity > 0.7) {
        compingState.currentVibe = 'active';
    } else if (intensity < 0.3) {
        compingState.currentVibe = 'sparse';
    } else {
        compingState.currentVibe = 'balanced';
    }

    // Replace static lookup with procedural generation
    // IMPLEMENT NO-REPEAT RULE: Keep trying until we get a different pattern (up to 3 times)
    // why: for Funk we feed the rotation counter (not the bar index) as the picker's
    //      `barIndex` arg — cell choice should advance once per STICKY rotation event,
    //      not once per absolute bar (which is meaningless inside a 4–8 bar retain).
    //      For non-Funk genres `barIndex` is unused; we still pass the real bar number
    //      for future deterministic pickers to key off. Reviewer P0-1, 2026-05-17.
    // #712: key the comp picker off the IN-LOOP bar, not the monotonic global
    // step, so the rhythmic figure REPEATS every loop. The "doesn't lock in"
    // complaint traced to a global-bar key that walked the cell bank forward each
    // loop — so the same chord drew a different cell on every pass. This matches
    // the funk/bossa per-section rotation-reset intent above. `totalSteps` is the
    // loop length (see tick-logic's `step % totalSteps`). When it's unknown (some
    // tests don't set it) fall back to the raw global step — still deterministic
    // and per-bar distinct, just not loop-stable; never collapse to bar 0.
    const loopSteps = arranger.totalSteps && arranger.totalSteps > 0 ? arranger.totalSteps : 0;
    const inLoopStep =
        loopSteps > 0 ? (((step % loopSteps) + loopSteps) % loopSteps) | 0 : step | 0;
    const barIndex = Math.floor(inLoopStep / spm);
    const funkPickIndex = compingState.funkRotationIndex;
    if (genre === 'Funk') {
        // Advance the counter so the next rotation draws a fresh cell. We snapshot
        // the pre-increment value above so the current pick uses the index that was
        // valid for *this* rotation event (initial pick = 0, then 1, 2, ...).
        compingState.funkRotationIndex = funkPickIndex + 1;
    }
    const bossaPickIndex = compingState.bossaRotationIndex;
    if (genre === 'Bossa Nova') {
        // why: same shape as Funk above — snapshot pre-increment so this pick uses
        //      the index valid for *this* rotation event, then advance. With 2-bar
        //      STICKY retention forced above, picker fires every 2 bars and the
        //      counter walks 0,1,2,3 → cells A,B,C,D consecutively → bar-A/bar-B
        //      alternation is structurally produced.
        compingState.bossaRotationIndex = bossaPickIndex + 1;
    }
    const pickerBarIndex =
        genre === 'Funk' ? funkPickIndex : genre === 'Bossa Nova' ? bossaPickIndex : barIndex;
    const newCell = generateCompingPattern(
        state,
        genre,
        compingState.currentVibe,
        ts,
        spm,
        pickerBarIndex,
        sectionId,
    );
    if (genre === 'Jazz' && compingState.lastVoicingMidis.length === 0 && step % spm === 0) {
        // Give the first jazz bar a voiced downbeat so the harmony has a real
        // reference point for the continuity cache instead of starting empty.
        newCell[0] = 1;
    }
    // #712: the old no-repeat retry re-rolled the cell whenever it matched the
    // previous bar — which, for the most common genres, structurally PREVENTED a
    // repeating figure from ever establishing (the core "doesn't lock in" bug).
    // The picker is now fully deterministic (phrase-keyed, no Math.random), so a
    // "same as last bar" result is the desired locked figure, not a collision to
    // re-roll — and retrying would just return the identical cell anyway. Deleted.
    compingState.currentCell = newCell;

    // Update global mask for module interaction
    let mask = 0;
    for (let i = 0; i < Math.min(16, newCell.length); i++) {
        if (newCell[i] === 1) {
            mask |= 1 << i;
        }
    }
    (chords as Mutable<typeof chords>).rhythmicMask = mask; // @worker-mutation

    // why: comp anticipation pulls the chord slightly ahead of the beat. The two idioms
    // that comp *ahead* are bebop's "and-of-4" push (Jazz) and partido-alto's
    // anticipation-of-1 (Bossa). Scales with intensity; consumed as a small (~1-4ms)
    // probabilistic pull in comping-emit. NOT Blues — its shuffle leans *behind* the beat
    // (owned by GENRE_POCKET's +10ms drag), so an anticipation bump there fought the pocket
    // and was removed (#1089). Per-genre feel proper lives in GENRE_POCKET, not here.
    playback.intent.anticipation = intensity * 0.2; // @worker-mutation
    if (genre === 'Jazz' || genre === 'Bossa Nova') {
        playback.intent.anticipation += 0.15;
    }

    // why: Neo-Soul lays back behind the beat (J Dilla drag) — the one genre with a generic
    // layBack here (it also feeds Neo-Soul's direct "drunken timing" comp path). Every other
    // genre's signed lean is owned by GENRE_POCKET, and the tighten-as-energy-rises coupling
    // is handled continuously by the #713 elasticity — so the old intensity<0.4 generic
    // layBack was redundant + sub-audible and was removed (#1089).
    playback.intent.layBack = genre === 'Neo-Soul' ? 0.05 : 0; // @worker-mutation

    compingState.lockedUntil = step + spm;
}

/**
 * Generates sustain-pedal (CC 64) on/off events for the current step.
 * Releases sustain on chord changes (with a brief "breath" before tense chords resolve)
 * and re-engages it immediately after to allow the next harmony to bloom naturally.
 *
 * @param _step - Absolute step (unused; kept for call-site symmetry).
 * @param measureStep - Step within the current measure.
 * @param chordIndex - Index of the current chord in the progression.
 * @param intensity - Band intensity (0.0 – 1.0).
 * @param currentQuality - Chord quality string (e.g. '7alt', 'dim') for tension tracking.
 */
function handleSustainEvents(
    _step: number,
    measureStep: number,
    chordIndex: number,
    intensity: number,
    genre: string,
    stepInfo?: StepInfo,
    currentQuality?: string | null,
): CCEvent[] {
    const events: CCEvent[] = [];
    const isNewChord = chordIndex !== compingState.lastChordIndex;
    const isNewMeasure = measureStep === 0;

    // #712: deterministic, loop-stable seed for the pedal-flutter gates below —
    // keyed off (measureStep, chordIndex), both of which repeat every loop, so the
    // sustain humanization no longer re-rolls on every pass (was raw Math.random).
    const flutterSeed = ((measureStep * 0x9e3779b1) ^ (chordIndex * 0x85ebca77)) | 0;
    const flutterDraw = (k: number) => scrambleHash((flutterSeed + k) | 0);

    if (genre === 'Reggae' || genre === 'Funk' || genre === 'Disco' || genre === 'Ska') {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: 0 }); // Sustain Off
        return events;
    }

    if (isNewMeasure || isNewChord) {
        // BREATH STRATEGY: If coming from a high-tension chord, cut sustain early to clear the air.
        // why: ALTERED_HOOK_QUALITIES (7alt, 7b9, 7#9, 7b13) plus dim/halfdim resolve
        //   into the next chord and benefit from a 150ms breath before resolution.
        //   7#11 (lydian dominant) is excluded — it's a static color chord that should
        //   ring through, not breathe. Source: Epic 9 S3 P1 finding.
        const _q = compingState.lastChordQuality || '';
        const wasTense = ALTERED_HOOK_QUALITIES.has(_q) || _q === 'dim' || _q === 'halfdim';
        const clearOffset = wasTense ? -0.15 : 0; // 150ms breath for tension resolution

        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: clearOffset }); // Off
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0.01 }); // On

        compingState.lastChordIndex = chordIndex;
        compingState.lastChordQuality = currentQuality || null;
        return events;
    }

    // Update quality tracker even if not new chord (in case of init)
    compingState.lastChordQuality = currentQuality || null;

    if (stepInfo?.isGroupStart && flutterDraw(1) < intensity * 0.5) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: -0.01 });
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0 });
        return events;
    }

    // why: epic-1-compound-meter S3 — stepInfo is always defined in the tick
    //      path (getAccompanimentNotes takes non-optional stepInfo). The old
    //      `% 4 === 0` fallback was dead code AND wrong for non-4/4 meters.
    //      Using stepInfo.isBeatStart directly is both correct and simpler.
    const isBeat = stepInfo ? stepInfo.isBeatStart : false;
    const flutterProb = intensity * 0.4;
    if (isBeat && flutterDraw(2) < flutterProb) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: -0.015 });
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0 });
    }

    if (genre === 'Jazz' && !isBeat) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: 0.1 });
    }

    return events;
}

/**
 * Reduce a comp voicing to a POWER CHORD in place (#698). Every emitted chord
 * note is snapped to the nearest tone of the power-chord set — root or perfect
 * fifth (pitch-classes `{rootPc, rootPc+7}`; the octave shares the root's class)
 * — by the *smallest* semitone move (≤6, so the note stays in its register and
 * the voicing's rough shape/spread survives). Thirds, sevenths, and extensions
 * all collapse onto root/fifth, so **no third survives**.
 *
 * Why: a distorted electric guitar plays power chords precisely because major/
 * minor *thirds* clash under drive (the third beating against the root/fifth
 * turns to mud through the distortion). Full triads through the crunch rhythm pack sound
 * wrong; root+5(+oct) is the idiom. Gated in `tick-logic` on the crunch rhythm
 * guitar being the *loaded* chords voice — so it never touches the piano/organ
 * comps or the synth fallback. Pitch-only: the comp's rhythm, note count, and
 * strum stagger are preserved, so only the harmony is reduced.
 *
 * `lowAnchorMidi` (optional): after snapping, octave-shift the WHOLE voicing so
 * its lowest note lands in `[lowAnchorMidi, lowAnchorMidi+11]` — for Metal's low
 * palm-muted chug (root ~E2/40), which deliberately drops into the bass register
 * (that overlap IS the metal idiom). Omitted → the voicing keeps its native
 * register (Rock/other guitar power chords sit at ~E3, which reads right there).
 *
 * Mutates and returns `notes` (the tick-logic consumer works on the same array).
 */
export function applyPowerChordVoicing<T extends { midi: number }>(
    notes: T[],
    rootMidi: number,
    lowAnchorMidi?: number,
): T[] {
    if (notes.length === 0 || !Number.isFinite(rootMidi)) {
        return notes;
    }
    const rootPc = (((rootMidi % 12) + 12) % 12) | 0;
    const fifthPc = (rootPc + 7) % 12;
    // signed distance (semitones, in [-6, 6]) to move pitch-class `from` → `to`.
    const pcDelta = (from: number, to: number): number => {
        let d = (((to - from) % 12) + 12) % 12;
        if (d > 6) {
            d -= 12;
        }
        return d;
    };
    for (const n of notes) {
        if (!Number.isFinite(n.midi)) {
            continue;
        }
        const midi = Math.round(n.midi);
        const pc = (((midi % 12) + 12) % 12) | 0;
        if (pc === rootPc || pc === fifthPc) {
            continue; // already a power-chord tone — leave it (and its octave) put
        }
        const dRoot = pcDelta(pc, rootPc);
        const dFifth = pcDelta(pc, fifthPc);
        // Nearest allowed tone; tie → root (the stronger anchor under drive).
        n.midi = midi + (Math.abs(dRoot) <= Math.abs(dFifth) ? dRoot : dFifth);
    }
    // Low-anchor (Metal chug): relocate the whole cluster to the E2 octave,
    // preserving its internal root/fifth spread. Whole-octave shifts only, so
    // pitch classes are untouched. Guard against a non-finite floor.
    if (Number.isFinite(lowAnchorMidi as number)) {
        const finite = notes.filter((n) => Number.isFinite(n.midi));
        if (finite.length > 0) {
            const anchor = lowAnchorMidi as number;
            const lowest = Math.min(...finite.map((n) => Math.round(n.midi)));
            let shift = 0;
            while (lowest + shift >= anchor + 12) {
                shift -= 12; // too high → drop an octave
            }
            while (lowest + shift < anchor) {
                shift += 12; // below the floor → lift an octave
            }
            if (shift !== 0) {
                for (const n of notes) {
                    if (Number.isFinite(n.midi)) {
                        n.midi = Math.round(n.midi) + shift;
                    }
                }
            }
        }
    }
    return notes;
}

/**
 * Main entry point for generating accompaniment notes.
 * Returns an array of standardized Note Objects.
 *
 * Called once per scheduler step by the logic worker.  The function fans out into
 * genre-specific lanes (Neo-Soul, Reggae, Funk, Jazz, Rock, Metal, etc.).  All lanes
 * share the same setup: sustain CC generation, rhythmic-intent update, and soloist
 * yielding.  Each lane returns early, so at most one lane fires per step.
 *
 * @param chord - Current chord object from the arranger progression.
 * @param step - Absolute scheduler step.
 * @param stepInChord - Step within the current chord duration.
 * @param measureStep - Step within the current measure (0 … stepsPerMeasure-1).
 * @param stepInfo - Semantic timing flags for this step.
 * @param coordination - Optional cross-instrument coordination signals from the CoordinationContext.
 * @returns Standardized Note Objects (may include CC-only sentinel notes with `muted: true`).
 */
export function getAccompanimentNotes(
    state: EnsembleState,
    chord: Chord,
    step: number,
    stepInChord: number,
    measureStep: number,
    stepInfo: StepInfo,
    coordination: AccompanimentCoordination = {},
): any[] {
    const { playback, arranger, chords, bass, soloist, groove } = state;
    if (!chords.enabled || !chord) {
        return [];
    }

    const notes: any[] = [];
    const genre = groove.genreFeel;
    const intensity = playback.bandIntensity;
    const signatures: any = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];
    const spm = ts.beats * ts.stepsPerBeat;

    // why (#712): seed for the per-step comp gates — both the per-genre lanes
    // below (Epic 2 S5) and the smart-path overlay further down (the original
    // comp-lock fix). The comp is the band's steady anchor, so these gates must
    // REPEAT loop-to-loop for the rhythm to LOCK IN. Key off the IN-LOOP step
    // (step % totalSteps), NOT the monotonic global step, and drop the loopCount
    // term — the old (global-step ^ loopCount) seed made every loop a different
    // deterministic pattern, which is exactly the owner's "doesn't lock in"
    // complaint. The genre lanes are early-return paths, so they use a distinct
    // offset range (20+) from the overlay's 1-10 to keep the streams independent.
    // Voicing still evolves across repeat passes via the separate
    // sectionOccurrence / compTargetSeed path below.
    const compLoopSteps = arranger.totalSteps && arranger.totalSteps > 0 ? arranger.totalSteps : 0;
    const compInLoopStep =
        compLoopSteps > 0
            ? (((step % compLoopSteps) + compLoopSteps) % compLoopSteps) | 0
            : step | 0;
    const compRandSeed = (compInLoopStep * 0x9e3779b1) | 0;
    const compDraw = (n: number) => scrambleHash((compRandSeed + n) | 0);

    // --- Imperfect Symmetry: per-phrase voicing inversion on repeat passes ---
    // why: epic-form-arrangement S3 — when a section repeats (Verse 2 vs Verse 1),
    // the comper otherwise produces identical voicings, making the band sound
    // mechanical on repeated form. On the restatement we rotate the voicing by
    // ONE inversion (lowest note up an octave) on the seeded TARGET BAR per
    // 4-bar phrase, seeded by `(sectionId, occurrence, phraseIndex)` like bass
    // S2. The rotation then cascades through `recenterVoicing` /
    // `selectCompactCluster` (both use `compingState.lastVoicingMidis`), so the
    // pianist "commits to" the new register for the rest of the phrase — same
    // musical framing as bass S2.
    //
    // Source: docs/audit/form-arranger.md P1 #7;
    //         docs/audit/epic-form-arrangement.md S3.
    const compSectionOccurrence: number = coordination?.sectionOccurrence ?? 1;
    const isRepeatPassComp = compSectionOccurrence >= 2;
    const compBarIndex = Math.floor(step / spm);
    const COMP_PHRASE_BARS = 4; // why: standard 4-bar phrase, matches bass S2.
    const compPhraseIndex = Math.floor(compBarIndex / COMP_PHRASE_BARS);
    const compBarInPhrase = compBarIndex % COMP_PHRASE_BARS;
    const compSectionIdHash = hashSectionId(chord.sectionId || '');
    // mulberry32 — canonical scrambleHash helper (hash-utils.ts).
    const compTargetSeed = scrambleHash(
        (compSectionIdHash ^
            (compSectionOccurrence * 0x9e3779b1) ^
            (compPhraseIndex * 0x85ebca77)) |
            0,
    );
    // One target bar per 4-bar phrase. From the target bar onwards (within the
    // phrase), every voicing gets rotated — this implements the "commit to the
    // new register for the rest of the phrase" musical gesture (cascades
    // naturally via recenterVoicing's previousVoicingMidis bias).
    const compTargetBarInPhrase = Math.floor(compTargetSeed * COMP_PHRASE_BARS);
    const shouldRotateVoicing = isRepeatPassComp && compBarInPhrase >= compTargetBarInPhrase;
    /**
     * Rotate a midi voicing by one inversion: move the lowest note up an octave.
     * No-op if voicing has fewer than 2 notes (rotation is meaningless on a
     * unison/empty voicing) or if the rotated note would exceed the 84 ceiling
     * (chords/harmony register-slot upper bound — going past would defeat the
     * register-slotting contract and let the post-engine clamp distort the
     * intended inversion).
     */
    const rotateVoicingMidi = (midis: number[]): number[] => {
        if (!shouldRotateVoicing || midis.length < 2) {
            return midis;
        }
        const sorted = [...midis].sort((a, b) => a - b);
        const newLow = sorted[0] + 12;
        // why: chords/harmony register slot is 52-84 (CLAUDE.md). If rotating
        // the lowest up an octave would push it above the register slot
        // ceiling, skip the rotation rather than letting enforceRegisterSlotting
        // octave-clamp it back down (which would undo the gesture).
        if (newLow > 84) {
            return midis;
        }
        return [...sorted.slice(1), newLow].sort((a, b) => a - b);
    };
    /**
     * Freq-array variant: convert to midi, rotate, convert back. Used by genre
     * lanes that operate on freqs (country, reggae, jazz/standard).
     */
    const rotateVoicingFreqs = (freqs: number[]): number[] => {
        if (!shouldRotateVoicing || freqs.length < 2) {
            return freqs;
        }
        const midis = freqs.map((f) => getMidi(f)).filter((m): m is number => Number.isFinite(m));
        if (midis.length < 2) {
            return freqs;
        }
        const rotated = rotateVoicingMidi(midis);
        if (rotated === midis) {
            return freqs;
        }
        return rotated.map((m) => getFrequency(m));
    };

    // --- Final-Bar Cadence Voicing (epic-form-arrangement S4) ---
    // why: form-arranger.md P1 #6 — when song-mode playback is ending, the band
    // should resolve together on the form's final downbeat. The comper plays a
    // single cadence voicing — root position, minimal extension (root + 3rd +
    // 5th, optionally + 7th for jazz-family genres) — on beat 1 of the final
    // bar, then yields silence so the chord rings out. The "resolved feel" is
    // exactly the absence of extensions/syncopation on the way out.
    //
    // Precedence: this overrides Imperfect Symmetry on the final bar. The
    // `shouldRotateVoicing` flag was computed above based on sectionOccurrence;
    // we deliberately ignore it here — the resolution gesture is more important
    // than a repeat-pass inversion rotation.
    //
    // Voicing recipe:
    //   - Pull `chord.intervals` to extract the 3rd (interval 3 or 4) and 5th
    //     (interval 7) — these define the chord's quality without color tones.
    //   - For jazz/blues/neo-soul: also include the 7th (interval 10 or 11) so
    //     a "resolved" maj7 / m7 still sounds like that family of music, not a
    //     bare triad. A bare triad on a jazz outro would feel like the engine
    //     gave up.
    //   - Stack root + 3rd + 5th (+ optional 7th) above the chord root, then
    //     transpose into the chord register slot (52-84) via the standard
    //     register-slot clamp downstream. No inversions, no extensions.
    //
    // Strike pattern: single hit on measureStep 0 with `durationSteps = spm`
    // so the voicing rings through the bar. Subsequent steps of the final
    // measure return [] (no notes) so the cadence sustains uncluttered.
    //
    // Source: docs/audit/form-arranger.md P1 #6;
    //         docs/audit/epic-form-arrangement.md S4.
    const isFinalMeasureComp = coordination?.isFinalMeasure === true;
    if (isFinalMeasureComp) {
        if (!stepInfo.isMeasureStart) {
            // why: silence on sub-beats lets the downbeat voicing ring out.
            return [];
        }
        // why: chart-driven cadence voicing. Pull only first-octave intervals
        // (≤ 11) from chord.intervals so we faithfully voice whatever quality
        // the chart specifies — power chord [0,7] stays [0,7], dim [0,3,6]
        // keeps its b5, aug keeps its #5, sus keeps the suspension, maj7
        // keeps the 7th. Stripping intervals > 11 drops 9/11/13 extensions for
        // the "resolved feel" of a minimal voicing. No invented intervals via
        // `??` fallbacks — that silently rewrites chord quality on the most
        // important bar of the song (see music-theory review P0-1/P0-2/P0-3).
        const rawIntervals: number[] = chord.intervals ?? [0, 4, 7];
        let cadenceIntervals: number[] = Array.from(
            new Set(rawIntervals.filter((iv) => iv >= 0 && iv <= 11)),
        ).sort((a, b) => a - b);
        if (!cadenceIntervals.includes(0)) {
            cadenceIntervals = [0, ...cadenceIntervals];
        }
        // Defensive fallback: if the chart somehow produced a single-pitch
        // voicing after filtering (unusual), pad with a triad so the cadence
        // still rings as a chord.
        if (cadenceIntervals.length < 2) {
            cadenceIntervals = [0, 4, 7];
        }
        // Root-position MIDI voicing anchored at chord.rootMidi; clamp into the
        // chord/harmony register slot ceiling (84) by transposing octaves down
        // if needed before the engine's downstream enforceRegisterSlotting
        // would clamp the spread.
        const rootMidi = chord.rootMidi;
        const rootPositionMidis = cadenceIntervals.map((iv) => rootMidi + iv);
        // why: target the lower half of the chord slot (52-68) — a final cadence
        // is grounded, not airy. Floor at 52 (chord-slot bottom); ceiling at 68
        // keeps the cluster in the mid-register so it reads as grounded, not high.
        //
        // Note: unlike the main comping path, we do NOT apply the bass-avoidance
        // guard (`max(52, bassMidi + 7)`) here. At the cadence the cluster is
        // allowed to overlap the bass for exactly one bar. The avoidance guard
        // would push the chord cluster too high when the bassist is grounded high
        // (e.g. G3/MIDI 55 → floor 62), producing an airy top-register landing
        // instead of the grounded resolution a cadence needs. One bar of overlap
        // at the final measure causes no sustained voice-masking — playback ends
        // immediately after. (S5 micro-cleanup item 6.)
        //
        // Voice-leading: bias the whole-octave shift toward `compingState.
        // lastVoicingMidis` (the prior bar's voicing) so the cadence lands
        // close to where the hand already was — no visible reset-jump on the
        // resolution. `recenterVoicing` only shifts the cluster by whole
        // octaves; root-position stays root-position. Range is the full
        // chord slot [52, 84] — same as the Jazz comping path below — so
        // 4-note voicings (e.g. maj7 span 11 st) always have a valid shift.
        // Grounding is preserved by the score function: the lowest valid
        // shift wins when previous is empty (cluster center is naturally
        // lowest there) and stays grounded when previous is low; only when
        // the prior bar sat high does the cadence track upward (the
        // intended voice-leading behavior). When lastVoicingMidis is empty
        // (first chord of a 1-bar form or fresh playback) the helper falls
        // back to centering on the cluster itself — same effective grounded
        // behavior as the prior manual octave-fit. (Epic 12 S7.)
        const cadenceMidis = recenterVoicing(
            rootPositionMidis,
            compingState.lastVoicingMidis,
            52,
            84,
        );
        // why: accent the cadence ABOVE ordinary comp downbeats (~0.71 at
        // intensity 0.55). 0.95 * velocityFactor lands at ~0.94 mid-intensity,
        // ~1.04 high-intensity — the "land together" gesture wants the chords
        // at least as prominent as drums/bass.
        const velocityFactor = 0.5 + intensity * 0.9;
        const cadenceVelocity = 0.95 * velocityFactor;
        const cadenceDuration = Math.max(1, spm);
        return cadenceMidis.map((midi) => ({
            freq: getFrequency(midi),
            midi,
            velocity: cadenceVelocity,
            durationSteps: cadenceDuration,
            timingOffset: 0,
            instrument: 'Piano',
        }));
    }

    // --- Intro/Outro layering mute (epic-form-arrangement S5) ---
    // why: form-arranger.md P1 #4 — the comper enters at bar `INTRO_MUTES.chords`
    // of an Intro section (default 4, so chords join with the verse downbeat on
    // a typical 4-bar intro) and drops out `OUTRO_MUTES.chords` bars before an
    // Outro ends (default 3, so chords pull out one bar after harmony does).
    //
    // Precedence: the isFinalMeasure branch above already returned the cadence
    // voicing for the form's final downbeat, so this mute cannot suppress S4's
    // resolution. Below `isFinalMeasureComp`'s block, ABOVE everything else.
    //
    // Return `[]` rather than a CC-only sentinel: the intro/outro mute is a
    // hard rest (no chord voicings, no sustain pedal release events). A
    // sustain-pedal event in an "empty" bar would betray the silence.
    const compIntroElapsed = coordination?.introBarsElapsed ?? -1;
    if (compIntroElapsed >= 0 && compIntroElapsed < INTRO_MUTES.chords) {
        return [];
    }
    const compOutroRemaining = coordination?.outroBarsRemaining ?? -1;
    if (compOutroRemaining >= 0 && compOutroRemaining <= OUTRO_MUTES.chords) {
        return [];
    }

    // --- Arrangement-by-subtraction mute (story #1008) ---
    // why: the seeded per-(section, occurrence) instrumentation plan drops the
    // comp on repeat verses (2nd pass) and across the bridge (pads-only) for the
    // pilot genres — "comp tacet" so the second verse feels stripped and the
    // bridge floats on sustained pads + rhythm section, not just quieter. This
    // is the primary consumer of the plan (the starter table only ever rests the
    // `chords` lane). Return `[]` (a hard rest — no voicings, no sustain-pedal
    // CC) exactly like the intro/outro mute above so an "empty" bar is truly
    // silent. Precedence: the isFinalMeasure cadence branch above already
    // returned for the form's final downbeat, so this cannot suppress S4.
    const compSubtractionMutes = coordination?.subtractionMutedLanes;
    if (Array.isArray(compSubtractionMutes) && compSubtractionMutes.includes('chords')) {
        return [];
    }

    // --- Sustain / CC Handling ---
    const chordIndex = arranger.progression ? arranger.progression.indexOf(chord) : -1;
    const ccEvents = handleSustainEvents(
        step,
        measureStep,
        chordIndex,
        intensity,
        genre,
        stepInfo,
        chord.quality,
    );

    // Rhythmic Yielding (Contract Compliance)
    const isSoloistBusy =
        coordination?.soloistBusy ||
        (soloist.enabled && (soloist.session.phrasing.busySteps || 0) > 0);
    updateRhythmicIntent(state, step, isSoloistBusy, spm, chord.sectionId);

    if (isSoloistBusy && !stepInfo.isMeasureStart && compDraw(20) < 0.7) {
        // Yield density to busy soloist: Skip offbeats and less-foundational hits
        if (ccEvents.length > 0) {
            return [
                {
                    midi: 0,
                    velocity: 0,
                    durationSteps: 0,
                    ccEvents,
                    instrument: 'Piano',
                    muted: true,
                },
            ];
        }
        return [];
    }

    // --- Coordination Logic (Ensemble Awareness) ---
    // (#1040: bassHit/soloistActive derive inside emitCompNotes now — the
    // multi-way coordination overlay there is their only consumer.)

    // Semantic abstractions
    // why: epic-1-compound-meter S3 — getAccompanimentNotes takes non-optional
    //      stepInfo, so this is always defined in the tick path. The old
    //      `% 4 === 0` fallback was dead AND wrong for non-4/4 meters.
    //      intBeat fallback uses ts.stepsPerBeat (not hardcoded 4) so it's
    //      correct for 6/8 and other compound meters even if stepInfo were absent.
    const isBeatStart = stepInfo ? stepInfo.isBeatStart : false;
    const intBeat =
        stepInfo && stepInfo.beatIndex !== undefined
            ? stepInfo.beatIndex
            : Math.floor(measureStep / (ts.stepsPerBeat || 4));

    // --- Section-Transition Chord Anticipation ---
    // why: form-arranger.md P0 #2 — the comper pre-voices the upcoming section's
    // first chord on the "and-of-4" of the last measure so the transition feels led
    // rather than cold. Classic jazz "anticipated chord" technique. See
    // CHORD_ANTICIPATION_GENRES at module top for the genre allowlist.
    //
    // Gate conditions (all must hold):
    //   1. upcomingSectionFirstChord is set (tick-logic publishes during the last
    //      stepsPerMeasure of a section, so this naturally fires in the last measure).
    //   2. measureStep === spm - stepsPerBeat/2 (the "and-of-4"; same step the bass
    //      anticipation lands on — bass + chord arrive together).
    //   3. Genre is in the offbeat-comping set.
    //   4. Soloist is not busy — anticipated stab shouldn't clutter a solo peak.
    //   5. Upcoming chord has a pre-computed `freqs` voicing. If `freqs` is empty
    //      we SKIP the anticipation rather than synthesizing one — silence is
    //      better than a guessed voicing that would be wrong for the actual chord
    //      quality (e.g. a dom7 shell on a maj7 misleads where the form is heading).
    //
    // Source: form-arranger.md P0 #2; epic-coordination-contract.md S3.
    const upcomingSectionChord = coordination.upcomingSectionFirstChord;
    const sectionBoundaryMeasureStep = spm - Math.floor(ts.stepsPerBeat / 2);
    const upcomingHasFreqs = (upcomingSectionChord?.freqs?.length || 0) > 0;

    if (
        upcomingSectionChord &&
        upcomingHasFreqs &&
        measureStep === sectionBoundaryMeasureStep &&
        CHORD_ANTICIPATION_GENRES.has(genre) &&
        !isSoloistBusy
    ) {
        // Trim to 3 voices max — anticipated stab is lighter than the downbeat.
        const fullVoicing: number[] = [...upcomingSectionChord.freqs];
        const sectionChordVoicing = fullVoicing.length > 3 ? fullVoicing.slice(0, 3) : fullVoicing;

        // why: anticipation velocity is softer than a normal hit so it "leads"
        // rather than sounding like a premature downbeat. Staccato duration (1 step)
        // ensures it doesn't blur into the section boundary.
        const sectionTransitionNotes = sectionChordVoicing.map((f: number, i: number) => ({
            midi: getMidi(f),
            velocity: (0.35 + intensity * 0.3) * (0.9 + i * 0.05),
            durationSteps: 1,
            ccEvents: i === 0 ? ccEvents : [],
            timingOffset: i * 0.006 - 0.01, // slight push (anticipation feel)
            instrument: 'Piano',
            muted: false,
        }));

        return sectionTransitionNotes.filter((n: any) => n.midi > 0);
    }

    // Within-section chord-change anticipation (#719) — the horn-section pickup.
    // The section block above only anticipates SECTION boundaries; a chord change
    // *within* a section (every bar of a 12-bar blues) had none, so the comp kept
    // stabbing the OUTGOING chord on the final beat right before the change —
    // heard as the "quick C7 before the F7". Here the final beat before a
    // within-section change is reshaped into the idiomatic pickup: a single
    // staccato stab of the INCOMING chord on the &-of-the-last-beat, with the rest
    // of the final beat resting so the outgoing chord doesn't ring into the
    // change. Mirrors the section stab; scoped to WITHIN_SECTION_ANTICIPATION_GENRES.
    const withinSectionNext =
        chordIndex >= 0 && arranger.progression
            ? arranger.progression[chordIndex + 1] || null
            : null;
    const chordSpanSteps = chord.beats * ts.stepsPerBeat;
    const stepsLeftInChord = chordSpanSteps - stepInChord;
    const anticipationAnchorStepsLeft = Math.floor(ts.stepsPerBeat / 2); // the &-of-the-last-beat
    if (
        chords.style === 'smart' &&
        WITHIN_SECTION_ANTICIPATION_GENRES.has(genre) &&
        withinSectionNext &&
        withinSectionNext.absName !== chord.absName &&
        (withinSectionNext.freqs?.length ?? 0) > 0 &&
        chord.beats >= 2 &&
        !isSoloistBusy &&
        stepsLeftInChord > 0 &&
        stepsLeftInChord <= ts.stepsPerBeat // final beat of the outgoing chord
    ) {
        if (stepsLeftInChord === anticipationAnchorStepsLeft) {
            // The &-of-the-last-beat horn pickup: one staccato stab of the incoming
            // chord, softer + slightly pushed (same shape as the section stab).
            const incomingFull: number[] = [...withinSectionNext.freqs];
            const incoming = incomingFull.length > 3 ? incomingFull.slice(0, 3) : incomingFull;
            const pickup = incoming.map((f: number, i: number) => ({
                midi: getMidi(f),
                velocity: (0.32 + intensity * 0.3) * (0.9 + i * 0.05),
                durationSteps: 1,
                ccEvents: i === 0 ? ccEvents : [],
                timingOffset: i * 0.006 - 0.01, // slight push (anticipation feel)
                instrument: 'Piano',
                muted: false,
            }));
            return pickup.filter((n: any) => n.midi > 0);
        }
        // Rest of the final beat: lay out so the outgoing chord doesn't stab into
        // the change. Preserve any sustain-pedal CC as a muted sentinel note.
        if (ccEvents.length > 0) {
            return [
                {
                    midi: 0,
                    velocity: 0,
                    durationSteps: 0,
                    ccEvents,
                    timingOffset: 0,
                    instrument: 'Piano',
                    muted: true,
                },
            ];
        }
        return [];
    }

    // --- GENRE LANES ---

    if (chords.style === 'strum-country') {
        // Boom-Chick Pattern (Root/5th Bass, Chord Strum)
        // Beats 1 and 3 (0 and 8 in 4/4): Bass Note
        // Beats 2 and 4 (4 and 12 in 4/4): Chord Strum
        const isBass = isBeatStart && intBeat % 2 === 0;
        const isStrum = isBeatStart && intBeat % 2 !== 0;

        // Steady boom-CHICKA chord pickups (#877). Country/bluegrass rhythm guitar
        // is metronomic: a light, short chord "chicka" on the & of each beat
        // (`isOffbeat`), with the "a" 16th (`isAOfBeat`) added only at higher drive
        // for a train-beat feel. This is a REGULAR subdivision, deterministic by the
        // grid, so the pattern is identical every bar and the groove LOCKS.
        // why: the old gate `!isBeatStart && compDraw(21) < intensity*0.6` fired full
        //      chord strums on a hash-scattered ~half of ALL 16th positions — a
        //      different scatter every bar. Deterministic (seeded) but rhythmically
        //      arrhythmic: it read as a random spray of chords over the boom-chick,
        //      not a country strum. Anchoring to the &/a subdivisions is the idiom.
        //      `stepInfo.isOffbeat`/`isAOfBeat` are time-signature-aware (getStepInfo),
        //      so this stays correct in 3/4 country-waltz too.
        // Intensity grades the FEEL, not random placement: at/below ~0.2 = bare
        //   boom-chick (sparse), ~0.2-0.6 = boom-CHICKA (chicka on every &) — the
        //   signature, live at the default intensity (0.35) — and >0.6 adds the "a"
        //   16th for a driving train beat.
        // Tempo-aware density (#877): the "a" 16th fills only have room at a
        //   relaxed-to-moderate tempo. Above a brisk two-step (~130 BPM) 16th-note
        //   strums blur into a frantic wash — a real picker keeps the boom-chicka
        //   EIGHTHS and drops the 16th fills as tempo climbs (the freight-train feel
        //   IS steady 8ths, not 16ths). The & chicka stays at every tempo: it's the
        //   genre's core identity, not a busyness lever.
        // (the ?? 120 is only a test-mock fallback; production always sets bpm,
        //  default 100 — both sides of 130 are exercised by country-piano-critique.)
        const roomFor16ths = (playback.bpm ?? 120) <= 130;
        const isGhost =
            (!!stepInfo?.isOffbeat && intensity > 0.2) ||
            (!!stepInfo?.isAOfBeat && intensity > 0.6 && roomFor16ths);

        if (isBass) {
            // why: strict R-5 — country boom-chick is a deterministic idiom
            // (chords.md P1 #9); the previous 90% probabilistic gate on beat 3
            // smeared the train-beat feel by occasionally repeating the root.
            // measureStep 0 = root, every other strong-beat bass note = fifth.
            let note = chord.rootMidi;
            if (measureStep === 0) {
                // Ensure root is in bass register.
                while (note > 55) {
                    note -= 12;
                }
            } else {
                note += 7; // up a fifth from root
                if (note > 60) {
                    note -= 12; // keep it low (fourth below root)
                }
            }

            // why: chords.md / Epic 11 S6(d) — register-collision yield. The
            // boom-chick "boom" lands a note in the bass register (MIDI ≤ 55-60)
            // on the chord channel. When a dedicated band bassist is running,
            // two engines occupying the same register on the same step is mud,
            // not reinforcement. Yield the bass register to the band bass: lift
            // the boom leg up by octaves until it clears the bass-side floor
            // (band-bass MIDI + 5, a P4 of separation) and sits inside the
            // chord-register slot (≥ 52). The guitarist still plays the R-5
            // alternation on beats 1 & 3 — it just sounds as a low chord-voice
            // rather than a unison doubling of the bassist. When bass is absent
            // the original low-register boom is kept (the guitar IS the bass).
            const boomBassMidi = coordination?.bassMidi || getMidi(bass.lastFreq || 0) || 0;
            if (bass.enabled && boomBassMidi > 0) {
                const boomFloor = Math.max(52, boomBassMidi + 5);
                // cap the lift at the chord-register ceiling (84) so an
                // unusually high band-bass note (the un-clamped `bass.lastFreq`
                // fallback path) can't push the boom out of the slot — the
                // downstream enforceRegisterSlotting('chords') is the backstop,
                // this just keeps the leg in range before it.
                while (note < boomFloor && note + 12 <= 84) {
                    note += 12;
                }
            }

            notes.push({
                midi: note,
                velocity: 0.6 + intensity * 0.2,
                durationSteps: 2,
                ccEvents: ccEvents,
                timingOffset: 0.005,
                instrument: 'Piano', // Using piano for "Clean Guitar" approx
                dry: true,
            });
            return notes;
        } else if (isStrum || isGhost) {
            const v = isStrum ? 0.5 + intensity * 0.3 : 0.2 + intensity * 0.1;

            // why: dedicated strum voicing — canonical acoustic-guitar strum is
            // root + 3rd + 5th + octave-doubled root (e.g. Cmaj: C3-E3-G3-C4),
            // NOT the chord's raw `freqs.slice(0,3)` which leaks 7ths/9ths/etc.
            // into a triadic idiom that defines the country lane.
            // chords.md P1 #10 / epic-chords-voicing S6.
            const rootPc = ((chord.rootMidi % 12) + 12) % 12;
            const intervals: number[] = Array.isArray(chord.intervals) ? chord.intervals : [];
            // Middle-voice pick: prefer the 3rd (3 or 4). For suspended chords the
            // 3rd is deliberately absent — use the 2nd or 4th (sus2/sus4). Power
            // chords (no 3rd, no 2/4) drop the middle voice entirely so we don't
            // force a major 3rd onto a quality that defines itself by its absence.
            const middleInterval =
                intervals.find((i) => i === 3 || i === 4) ??
                intervals.find((i) => i === 2 || i === 5) ??
                null;
            const fifthInterval = intervals.find((i) => i === 6 || i === 7 || i === 8) ?? 7;

            // Bass-aware register floor (epic-coordination-consistency S1.a):
            // mirrors finalizeHarmonyNotes's safetyFloor — reserve a P5 of separation above the
            // bassist when bass is running so the strum cluster doesn't crash
            // the bass register when bass walks high. Country boom-chick has
            // its own R-5 in bass register above (1700-1726), but the band
            // bassist runs alongside; the strum is the chord half and should
            // sit above the bassist. Fallback to 52 when bass not running.
            const strumBassMidi = coordination?.bassMidi || getMidi(bass.lastFreq || 0) || 0;
            const strumFloor = Math.max(52, strumBassMidi + 7);

            // Anchor the strum cluster around middle-C (MIDI 60), then re-pick the
            // octave that minimizes centroid distance to the previous voicing.
            // Voice-leading via `compingState.lastVoicingMidis` keeps the cluster
            // from leaping a 4th/5th on every chord change (the I-IV-V country
            // loop especially). Falls back to the MIDI 60 anchor on the first
            // chord of a section. Stays within chord-register slot 52-84.
            const STRUM_ANCHOR = 60;
            let clusterRoot = rootPc;
            while (clusterRoot < STRUM_ANCHOR - 6) {
                clusterRoot += 12;
            }
            while (clusterRoot > STRUM_ANCHOR + 6) {
                clusterRoot -= 12;
            }
            const buildCluster = (cr: number): number[] => {
                const cluster = [cr];
                if (middleInterval !== null) {
                    cluster.push(cr + middleInterval);
                }
                cluster.push(cr + fifthInterval);
                cluster.push(cr + 12);
                return cluster;
            };
            const prevMidis = compingState.lastVoicingMidis;
            if (prevMidis.length > 0) {
                const prevCentroid = prevMidis.reduce((a, b) => a + b, 0) / prevMidis.length;
                let bestRoot = clusterRoot;
                let bestDist = Infinity;
                for (const shift of [-12, 0, 12]) {
                    const candidate = clusterRoot + shift;
                    const cluster = buildCluster(candidate);
                    const cMin = Math.min(...cluster);
                    const cMax = Math.max(...cluster);
                    // why: bass-aware floor — reject any candidate cluster
                    // whose lowest voice falls below `strumFloor` (P5 above
                    // bass when bass is running, else 52). Keeps the country
                    // strum from crashing the bass register when the band
                    // bassist is grounded high. Mirrors the harmony-main-path
                    // safetyFloor in finalizeHarmonyNotes.
                    if (cMin < strumFloor || cMax > 84) {
                        continue;
                    }
                    const centroid = cluster.reduce((a, b) => a + b, 0) / cluster.length;
                    const dist = Math.abs(centroid - prevCentroid);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestRoot = candidate;
                    }
                }
                clusterRoot = bestRoot;
            }
            const strumMidis = buildCluster(clusterRoot);
            // Clamp into chord-register slot (strumFloor..84) — shift whole
            // cluster by ±12 if any voice escapes; preserves the interval
            // structure. Floor is bass-aware (P5 above bass when running),
            // consistent with the candidate-rejection check above.
            const minMidi = Math.min(...strumMidis);
            const maxMidi = Math.max(...strumMidis);
            let slotShift = 0;
            if (minMidi < strumFloor) {
                slotShift = Math.ceil((strumFloor - minMidi) / 12) * 12;
            } else if (maxMidi > 84) {
                slotShift = -Math.ceil((maxMidi - 84) / 12) * 12;
            }
            const finalMidis = strumMidis.map((m) => m + slotShift);
            // Persist for the next bar's voice-leading pass.
            compingState.lastVoicingMidis = [...finalMidis];

            finalMidis.forEach((m, i) => {
                notes.push({
                    midi: m,
                    velocity: v,
                    durationSteps: isGhost ? 0.5 : 2,
                    ccEvents: i === 0 ? ccEvents : [],
                    timingOffset: i * 0.015 + (isGhost ? 0.02 : 0), // Slower strum for country
                    instrument: 'Piano',
                    dry: true,
                });
            });
            return notes;
        }
        if (ccEvents.length > 0) {
            return [
                {
                    midi: 0,
                    velocity: 0,
                    durationSteps: 0,
                    ccEvents,
                    instrument: 'Piano',
                    muted: true,
                },
            ];
        }
        return [];
    }

    if (chords.style === 'power-metal') {
        // Driving 8th notes (chugs) with Power Chords (Root + 5th + Octave)
        // why: epic-1-compound-meter S2 (P2 follow-up) — the original
        // `step % (ts.stepsPerBeat / 2) === 0` formula degenerates to
        // always-true for `stepsPerBeat=2` (6/8, 7/8, 12/8). Read the canonical
        // `isEighthBoundary` from stepInfo with a per-meter fallback.
        const isEighth =
            stepInfo?.isEighthBoundary ?? (ts.stepsPerBeat >= 4 ? step % 2 === 0 : true);

        if (isEighth) {
            // Power Chord Voicing: quality-aware interval above root + octave double.
            // why: a plain P5 power chord over dim/halfdim/7b5 contradicts the b5 of
            // the chord and effectively re-voices the harmony as a major-implying
            // power chord — the chart says one thing, the comper plays another.
            // Metal idiom: tritone power chord (b5) for diminished/half-diminished,
            // augmented power chord (#5) for aug/augmaj7, plain P5 for everything else.
            const root = chord.rootMidi;
            const q = chord.quality;
            const powerInterval =
                q === 'dim' || q === 'halfdim' || q === '7b5'
                    ? 6
                    : q === 'aug' || q === 'augmaj7'
                      ? 8
                      : 7;
            const voicing = [root, root + powerInterval, root + 12];

            const isBackbeat = stepInfo ? stepInfo.isBackbeat : intBeat % 2 !== 0;

            // "Palm Mute" simulation via velocity/filter in synth
            let vel = 0.45; // Default chug
            let dur = 0.8; // Short

            if (isBeatStart || isBackbeat) {
                vel = 0.7 + intensity * 0.3; // Accent
                dur = 1.5; // Let ring slightly more
            } else {
                // Chug variations (deterministic, loop-stable)
                if (compDraw(30) < intensity) {
                    vel += 0.1;
                }
            }

            voicing.forEach((m, i) => {
                notes.push({
                    midi: m,
                    velocity: vel,
                    durationSteps: dur,
                    ccEvents: i === 0 ? ccEvents : [],
                    timingOffset: i * 0.002, // Tight unison
                    // Mix-pass 2026-05-23 — was 'Warm', an EP voice whose high
                    // resonance + 8th-note retriggering produced a droning ring.
                    instrument: 'PowerMetal',
                    dry: false,
                });
            });
            return notes;
        }
        if (ccEvents.length > 0) {
            return [
                {
                    midi: 0,
                    velocity: 0,
                    durationSteps: 0,
                    ccEvents,
                    instrument: 'Piano',
                    muted: true,
                },
            ];
        }
        return [];
    }

    if (genre === 'Neo-Soul') {
        // "Quartal" and "Rootless" Voicings for Neo-Soul
        // This style favors stacks of 4ths and 2nds (clusters) for that "cloudy" feel.
        const isHit = compingState.currentCell[measureStep % spm] === 1;
        const ghostProb = 0.1 + intensity * 0.3;
        const isGhost = !isHit && compDraw(22) < ghostProb;

        if (isHit || isGhost) {
            const reserveBassSpace = shouldReserveBassSpace(state);
            const groundingRequired = shouldPreferGroundedPracticeVoicing(
                state,
                chord.quality,
                genre,
            );
            const bassMidi = coordination.bassMidi || getMidi(bass.lastFreq || 0) || 0;
            let voicing: number[] = chord.freqs
                .map((f: number) => getMidi(f))
                .filter((midi: number | null): midi is number => Number.isFinite(midi));

            if (voicing.length === 0) {
                voicing = [chord.rootMidi + 3, chord.rootMidi + 10, chord.rootMidi + 14];
            }
            voicing = selectCompactCluster(
                voicing,
                compingState.lastVoicingMidis,
                groundingRequired ? Math.min(4, voicing.length) : Math.min(3, voicing.length),
                reserveBassSpace && bassMidi ? bassMidi + 13 : getBassSpaceFloor(state),
            );

            if (reserveBassSpace && bassMidi) {
                while (voicing.length > 0 && voicing[0] <= bassMidi + 12) {
                    voicing = voicing.map((midi: number) => midi + 12);
                }
            }
            // why: apply Imperfect-Symmetry rotation BEFORE caching to
            // `compingState.lastVoicingMidis`, so the next bar's
            // selectCompactCluster cascade carries the new register forward
            // (the "pianist commits to the inversion for the rest of the
            // phrase" gesture — matches bass S2's prevMidi-bias cascade).
            voicing = rotateVoicingMidi(voicing);
            compingState.lastVoicingMidis = [...voicing];

            // Neo-Soul "Drunken" Timing (deterministic, loop-stable displacement)
            const drunk = (compDraw(31) - 0.5) * (intensity * 0.02);

            voicing.forEach((m: any, i: number) => {
                notes.push({
                    midi: m,
                    velocity: (isGhost ? 0.2 : 0.55) * (0.5 + intensity * 0.9),
                    durationSteps: isGhost ? 0.5 : 2.5,
                    ccEvents: i === 0 ? ccEvents : [],
                    timingOffset: i * 0.012 + playback.intent.layBack + drunk,
                    instrument: 'Piano',
                    muted: isGhost,
                    dry: true,
                });
            });
            return notes;
        }
        if (ccEvents.length > 0) {
            return [
                {
                    midi: 0,
                    velocity: 0,
                    durationSteps: 0,
                    ccEvents,
                    instrument: 'Piano',
                    muted: true,
                },
            ];
        }
        return [];
    }

    if (genre === 'Reggae') {
        // why: epic-chords-voicing.md S5 — the chords channel = the keyboardist,
        // and the keyboardist in reggae plays the skank (staccato chords on
        // beats 2 and 4). The bubble (eighth-note offbeats) is the organist's
        // job and belongs on the harmony channel, not here. The previous code
        // fired both lanes in parallel, which the audit identified as the
        // union-not-choice bug. The bubble was removed entirely rather than
        // gated on a `chords.style === 'organ'` value that doesn't exist in
        // `CHORD_STYLES` ('organ' lives in `HARMONY_STYLES`, see
        // `instrument-styles.ts`). Reggae-bubble-on-harmony is captured as a
        // follow-up to live in `harmonies.ts` under `activeStyle === 'organ'`.
        const isSkank = stepInfo ? stepInfo.isBackbeat : intBeat % 2 !== 0;

        if (isSkank && isBeatStart) {
            let voicing = [...chord.freqs];
            if (voicing.length > 3) {
                voicing = voicing.slice(0, 3); // Tight skanks
            }
            voicing = rotateVoicingFreqs(voicing);

            voicing.forEach((f, i) => {
                notes.push({
                    midi: getMidi(f),
                    velocity: (0.4 + intensity * 0.4) * (0.9 + compDraw(200 + i) * 0.2),
                    durationSteps: 0.5, // Super staccato
                    ccEvents: i === 0 ? ccEvents : [],
                    timingOffset: i * 0.005 + 0.01,
                    instrument: 'Piano',
                    dry: true,
                });
            });
            return notes;
        }

        // Return dummy note if CC events exist but no musical notes
        if (ccEvents.length > 0) {
            return [
                {
                    midi: 0,
                    velocity: 0,
                    durationSteps: 0,
                    ccEvents: ccEvents,
                    instrument: 'Piano',
                    muted: true,
                },
            ];
        }
        return [];
    }

    if (genre === 'Funk') {
        // Clav-Style: 16th note syncopation with ghost notes ("chucks")
        let isHit = compingState.currentCell[measureStep % spm] === 1;

        // Conversational Displacement: Occasionally shift a hit by 16th if complexity is high
        // why: migrated from soloist.session.phrasing.busySteps (session-state
        // direct read) to coordination.soloistBusy (coordination-context field)
        // so the predicate is consistent with the rest of the comp engine and
        // doesn't bypass the coordination layer. (S5 micro-cleanup.)
        // note: soloistBusy is a superset of the old busySteps>0 test — it also
        // fires on short sub-step soloist notes (durationSteps < 1.0), so this
        // slightly widens the displacement trigger. Musically intended.
        if (
            isHit &&
            playback.complexity > 0.7 &&
            coordination?.soloistBusy === true &&
            compDraw(23) < 0.4
        ) {
            isHit = false;
        }

        // --- Phrase-End Breath (epic-coordination-consistency S2.a) ---
        // why: chords.md P2 #16 — funk clav comping is rhythmically dense by
        // design; when the soloist completes a phrase (≥3 notes then rest), the
        // comper thins the 16ths so the listener hears the phrase land. This is
        // the funk-specific arm of the same conversational gesture applied in the
        // standard-lane block below; we duplicate here because the Funk early-
        // return path doesn't fall through to the standard logic.
        //
        // Preserve `measureStep === 0` (the downbeat carries the chord change)
        // and gate deterministically off (barIndex, intBeat) so loop comparisons
        // and 30-seed reliability sweeps see a stable thin distribution. ~65%
        // thin rate matches the standard-lane multiplier (see below).
        let funkPhraseEndThinned = false;
        if (
            isHit &&
            measureStep !== 0 &&
            coordination?.soloistResting === true &&
            (coordination?.soloistNotesInPhrase ?? 0) >= 3
        ) {
            const funkBarIndex = Math.floor(step / spm);
            const funkPhraseEndHash = (funkBarIndex * 7 + intBeat * 11 + (measureStep % spm)) | 0;
            if (funkPhraseEndHash % 20 < 13) {
                isHit = false;
                funkPhraseEndThinned = true;
            }
        }

        // why: ghost-note roll runs after the phrase-end gate; without this
        // guard, ~36% of thinned slots flip back to audible muted chucks
        // (vel ≈ 0.18) and the soloist's breath dissolves into noise floor.
        // The gate's whole point is loop-coherent silence — gate the ghost
        // too. (Epic 9 S2.a review P1 #1+#2.)
        const ghostProb = 0.15 + intensity * 0.35;
        const isGhost = !isHit && !funkPhraseEndThinned && compDraw(24) < ghostProb;

        if (isHit || isGhost) {
            const reserveBassSpace = shouldReserveBassSpace(state);
            const groundingRequired = shouldPreferGroundedPracticeVoicing(
                state,
                chord.quality,
                genre,
            );
            const bassMidi = coordination.bassMidi || getMidi(bass.lastFreq || 0) || 0;

            // why: chords.md P2 #17 — the funk Clav idiom (Stevie Wonder
            // "Superstition," Stubblefield-era JB) is the *gapped* 3rd + b7 + 9
            // cell: the 5th is deliberately dropped so the 9 reads as the
            // signature color. Build the cell by pitch-class identity — handing
            // the full sorted chord [R,3,5,b7,9] to selectCompactCluster's
            // contiguous-window picker can only ever return {3,5,b7} (a
            // dominant shell), never the gapped {3,b7,9}.
            const chordMidis: number[] = chord.freqs
                .map((f: number) => getMidi(f))
                .filter((midi: number | null): midi is number => Number.isFinite(midi));
            const pcFromRoot = (m: number) => (((m - chord.rootMidi) % 12) + 12) % 12;
            // pick a real chord tone matching the degree's pitch class; fall
            // back to a synthesized interval above the root when absent (e.g.
            // chord.freqs empty, or a triad with no extension).
            const pickClavDegree = (pcs: number[], fallbackInterval: number) =>
                chordMidis.find((m: number) => pcs.includes(pcFromRoot(m))) ??
                chord.rootMidi + fallbackInterval;
            // why: `startsWith('m') && !startsWith('maj')` is the codebase's
            // canonical minor-quality predicate (in getRootlessVoicing) — a bare
            // `/^m/` would wrongly flag maj7/maj9 as minor and synthesize a b3
            // fallback over a major chord.
            const clavQuality = chord.quality || '';
            const isMinorQuality =
                (clavQuality.startsWith('m') && !clavQuality.startsWith('maj')) ||
                clavQuality.includes('dim');
            const clavThird = pickClavDegree([3, 4], isMinorQuality ? 3 : 4);
            const clavSeventh = pickClavDegree([10, 11], 10);
            // the 9 is rarely a literal chord tone — default to a synthesized
            // major 9th so the gapped cell is guaranteed its color voice.
            const clavNinth = pickClavDegree([2], 14);
            // why: the gapped cell's three pitch classes are fixed, but its
            // ABSOLUTE register has to voice-lead from the prior cell. Building
            // it as raw `root + interval` pins the cell to `chord.rootMidi`,
            // which is NOT octave-stable across a progression (the `changes`
            // arrangement seats Am7 at root 57 but A7 at root 69) — so a
            // high-rooted chord's cell leaps a near-octave clear of its
            // neighbors. `recenterVoicing` alone cannot recover it: it only
            // shifts the whole block by octaves, and when the cell is jammed
            // against the 84 ceiling it has no upward headroom left. Instead,
            // expand the three pitch classes across the 52-84 chord register
            // and let `selectCompactCluster` — the same continuous-slide
            // voice-leader the pre-S6b shell used — pick the most compact
            // inversion nearest a target center. The 5th never enters the
            // pool, so the gapped {3,b7,9} identity is preserved (any 3-window
            // of three distinct cycling pitch classes is a cell inversion).
            const clavFloor =
                reserveBassSpace && bassMidi ? bassMidi + 13 : getBassSpaceFloor(state);
            const cellPcs = [clavThird, clavSeventh, clavNinth].map((m) => ((m % 12) + 12) % 12);
            const cellPool: number[] = [];
            for (let octave = 48; octave <= 84; octave += 12) {
                for (const pc of cellPcs) {
                    const m = octave + pc;
                    if (m >= 48 && m <= 84) {
                        cellPool.push(m);
                    }
                }
            }
            // why: target a blend of the previous cell's center and a fixed
            // home pocket (~67, the register the pre-S6b shell sat in). Pure
            // relative voice-leading has no absolute anchor — each step's
            // window-discretization bias ratchets the cell upward until it
            // jams the ceiling over a long progression. The 0.4 pull toward
            // HOME is a low-pass that keeps the comp tracking chord-to-chord
            // while holding station in the clav register.
            const CLAV_HOME_CENTER = 67;
            const clavTargetCenter =
                compingState.lastVoicingMidis.length > 0
                    ? 0.6 * averageMidi(compingState.lastVoicingMidis) + 0.4 * CLAV_HOME_CENTER
                    : CLAV_HOME_CENTER;
            let voicing: number[] = selectCompactCluster(
                cellPool,
                [Math.round(clavTargetCenter)],
                3,
                clavFloor,
            );
            if (groundingRequired) {
                // grounded practice voicing keeps a low root anchor an octave
                // under the 3-note cell (4 voices total) for harmonic stability.
                const cellLow = Math.min(...voicing);
                let rootAnchor = ((chord.rootMidi % 12) + 12) % 12;
                while (rootAnchor + 12 < cellLow) {
                    rootAnchor += 12;
                }
                if (rootAnchor >= 36 && rootAnchor < cellLow) {
                    voicing.unshift(rootAnchor);
                }
            }
            voicing = recenterVoicing(voicing, compingState.lastVoicingMidis, clavFloor, 84);
            // why: Imperfect-Symmetry rotation before caching — same reasoning
            // as the Neo-Soul lane, lets the cascade carry forward.
            voicing = rotateVoicingMidi(voicing);
            compingState.lastVoicingMidis = [...voicing];

            voicing.forEach((m: any, i: number) => {
                notes.push({
                    midi: m,
                    velocity:
                        (isGhost ? 0.18 : 0.65) *
                        (0.5 + intensity * 0.9) *
                        (0.9 + compDraw(220 + i) * 0.2),
                    durationSteps: isGhost ? 0.1 : 0.35, // Super short ghost "chucks"
                    ccEvents: i === 0 ? ccEvents : [],
                    timingOffset: i * 0.003 + (isGhost ? 0.005 + compDraw(240 + i) * 0.01 : -0.005),
                    instrument: 'Piano',
                    muted: isGhost,
                    dry: true,
                });
            });
            return notes;
        }
        if (ccEvents.length > 0) {
            return [
                {
                    midi: 0,
                    velocity: 0,
                    durationSteps: 0,
                    ccEvents: ccEvents,
                    instrument: 'Piano',
                    muted: true,
                },
            ];
        }
        return [];
    }

    // --- STANDARD Pattern Logic + per-hit emission (#1040) ---
    // Moved verbatim to comping-emit.ts (emitCompNotes): the deterministic cell
    // read, the coordination overlays (yield-to-bass/soloist, harmony
    // interlocking, pulse floor, force-the-One, phrase-end breath), the #766
    // ring-suppress consume, the per-hit emission block (#715 statement/answer
    // economy, #766 ring decision, #707 chord-boundary clamp), and the CC-only
    // fallback. The percussive-identity genre lanes above all early-return
    // before this seam, so only the standard/smart lane reaches it.
    // compingState + coordination are threaded explicitly; compDraw and
    // rotateVoicingFreqs are passed so their seed derivations stay here.
    return emitCompNotes({
        state,
        chord,
        step,
        stepInChord,
        measureStep,
        stepInfo,
        coordination,
        compingState,
        ts,
        spm,
        genre,
        chordIndex,
        ccEvents,
        isBeatStart,
        intBeat,
        compDraw,
        rotateVoicingFreqs,
    });
}
