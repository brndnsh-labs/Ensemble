import { REGGAE_RIDDIMS } from '../config.js';
import type { EnsembleState, StepInfo } from '../types.js';
import { getFrequency } from '../utils.js';
import { scrambleHash } from './hash-utils.js';

type ChordChangeShape = {
    rootMidi: number;
    bassMidi?: number | null;
};

/**
 * Type-guard returning true only when nextChord represents an actual chord
 * change vs the current chord — i.e. the bass target on the next bar is
 * different from now.
 *
 * why: every "approach note" callsite previously gated on `nextChord && ...`,
 * which fires inside held chords too — producing stumbling chromatic leans on
 * non-change bars. The audit (bass.md P1 #5, P2 #13) named this as the
 * highest-leverage architectural fix in the bass engine. Type-predicate form
 * lets call sites use `nextChord.rootMidi` directly after the guard.
 */
export function isChordChangeApproach<T extends ChordChangeShape>(
    nextChord: T | null | undefined,
    chord: ChordChangeShape,
): nextChord is T {
    if (!nextChord) {
        return false;
    }
    const nextTarget = nextChord.bassMidi ?? nextChord.rootMidi;
    const currentTarget = chord.bassMidi ?? chord.rootMidi;
    return nextTarget !== currentTarget;
}

// Genres whose bass idiom uses an expressive scoop/slide into a chromatic
// approach note (upright/fretless gliss, rockabilly slap) — as opposed to a
// genre like Metal (palm-muted precision) or Disco (clean octave line) where
// the ornament would read as foreign. Only Jazz/Blues/Neo-Soul currently
// reach this shared branch under default genre-to-style routing (Funk and
// Country each have their own dedicated approach branch above that returns
// before this point) — Funk and Country are listed here anyway so the gate
// does the right thing if a user manually overrides Bass Style away from the
// genre default, or if those styles' own branches are ever folded into this
// shared path.
const EXPRESSIVE_BEND_GENRES = new Set(['Jazz', 'Blues', 'Funk', 'Neo-Soul', 'Country']);

/**
 * why: 20% scoop/slide into the chromatic leading tone — an occasional
 * expressive bass gliss, not on every approach (that reads as a mannerism).
 * Gated to genres whose bass idiom actually uses this articulation (see
 * EXPRESSIVE_BEND_GENRES); the pitch gate above already genre-scales whether a
 * chromatic approach happens at all, but the bend is a pure articulation
 * choice on top of that, not a harmonic one, so it's gated on/off rather than
 * scaled down. Suppressed entirely under a busy soloist so the bass doesn't
 * grab foreground attention mid-solo (call-and-response).
 */
export function approachBend(
    genreFeel: string,
    approach: number,
    targetRoot: number,
    isSoloistBusy: boolean,
): -1 | 0 | 1 {
    if (isSoloistBusy || !EXPRESSIVE_BEND_GENRES.has(genreFeel)) {
        return 0;
    }
    return Math.random() < 0.2 ? (approach < targetRoot ? -1 : 1) : 0;
}

export function checkBassActiveStyle(
    style: string,
    step: number,
    stepInChord: number,
    stepInfo: StepInfo | null,
    ts: { stepsPerBeat: number; beats: number },
    intBeat: number,
    isQuarter: boolean,
    // why: epic-1-compound-meter S2 — renamed from is8th; now supplied from
    // stepInfo.isEighthBoundary which is correct for all meters including 6/8.
    isEighthBoundary: boolean,
    playback: EnsembleState['playback'],
    groove: EnsembleState['groove'],
) {
    // why: several per-step density gates below (jazz/quarter eighth-skip, funk
    // ghost, metal gallop, blues shuffle, walking-ska skip) used raw Math.random,
    // so the bass re-rolled which offbeats it played every bar AND every loop —
    // it never locked to a groove. Seed them on (step, loopCount) — the same shape
    // the compound walking gate (:~150) and the comping overlay (accompaniment.ts)
    // use — so the line repeats given the same step + loop. Distinct offsets per
    // gate keep the streams independent. Epic 2 S4.
    const bassRandSeed = ((step * 0x9e3779b1) ^ ((playback.currentLoopCount | 0) * 0x85ebca77)) | 0;
    const bassDraw = (n: number) => scrambleHash((bassRandSeed + n) | 0);
    if (style === 'rock') {
        return isEighthBoundary;
    }
    if (style === 'bossa') {
        // Semantic Bossa: 1, 2&, 3, 4&
        if (stepInfo) {
            if (stepInfo.isCompound === true) {
                // why: epic-2 S9 — the 4/4 bossa cell hardcodes a 4-beat bar: the
                // root on `intBeat === 2` (beat 3) and the anticipations on
                // `intBeat === 1 || 3` (the & of 2/4). In compound (6/8, 12/8,
                // stepsPerBeat=2) intBeat===2 is mStep 4 — a mid-group weak step, not
                // a dotted-quarter pulse — and the 4-beat assumption misses beats 5/6.
                // Map the idiom meter-relative instead: the root anchors every
                // dotted-quarter pulse (the bossa "1 and 3"), and the anticipation
                // lands on the pickup slot — the last eighth before the next pulse
                // (stepInGroup === groupSteps - 2; mStep 4/10 in 6/8, the same slot the
                // S12 jazz-walking pickup uses) — preserving bossa's "anticipate the
                // next chord" syncopation. ~4 onsets/bar in 6/8. "Do our best, groove"
                // — bossa in 6/8 is off-idiom, not idiomatic perfection.
                if (stepInfo.isPulseStart) {
                    return true;
                }
                const groupBeats = stepInfo.tsConfig?.grouping?.[stepInfo.groupIndex] ?? 3;
                const groupSteps = groupBeats * ts.stepsPerBeat;
                return stepInfo.stepInGroup === groupSteps - 2;
            }
            const isOffbeatAnd =
                stepInfo.mStep % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2);
            // In 4/4: Steps 0, 6, 8, 14
            return (
                stepInfo.isMeasureStart || // Step 0
                (stepInfo.isBeatStart && intBeat === 2) || // Step 8
                (isOffbeatAnd && (intBeat === 1 || intBeat === 3)) // Steps 6, 14
            );
        }
        return false;
    }
    if (
        style === 'quarter' ||
        groove.genreFeel === 'Jazz' ||
        // why: All Blues via the Blues smart-genre uses bass style 'blues'
        // (smart-genres.ts), which otherwise falls to the 4/4 shuffle branch
        // below and fires `isQuarter` on every eighth in 6/8 (6+ onsets/bar —
        // a running line, not a walking waltz). Route the compound case through
        // the shared dotted-quarter walking gate so an All Blues progression
        // has the same spare density in Jazz or Blues genre. 4/4 blues is
        // unaffected (the clause requires isCompound). FOLLOWUPS §C.85.
        (style === 'blues' && stepInfo?.tsConfig?.isCompound === true)
    ) {
        // why: epic-1-compound-meter S12 — in compound meters (6/8, 12/8) the simple
        // `isQuarter` (= `isBeatStart` = `mStep % stepsPerBeat === 0`) fires on every
        // eighth (mStep 0,2,4,6,8,10 in 6/8) producing 6+ onsets/bar — that's a
        // running line, not a walking jazz waltz. Idiomatic 6/8 walking bass (think
        // Paul Chambers on "All Blues") targets the dotted-quarter pulse with 2-4
        // melodic onsets per bar. We branch on tsConfig.isCompound (sourced from
        // stepInfo) so simple-meter 4/4 jazz walking is byte-identical to before.
        const isCompound = stepInfo?.tsConfig?.isCompound === true;
        if (isCompound && stepInfo) {
            // Pulse positions (mStep 0, 6 in 6/8; 0, 6, 12, 18 in 12/8) — always fire.
            // These are the dotted-quarter pulses that define the meter; the bassist
            // marks them on every bar regardless of intensity. (~2 onsets/bar in 6/8.)
            if (stepInfo.isPulseStart) {
                return true;
            }
            // High BPM safety: at very fast tempos even pickups become a blur. The
            // 4/4 path already disables skips above 165 BPM; keep the same ceiling
            // in compound so jazz-waltz at 200+ BPM stays pulse-only.
            // (The 165 was tuned against eighth-skip density in 4/4; in 6/8 the
            // pickup is one 16th later so the blur threshold may differ — re-tune
            // by ear if a fast compound piece sounds smeared.)
            if (playback.bpm > 165) {
                return false;
            }

            // Pickup slot: the last eighth of each dotted-quarter group (mStep 4, 10
            // in 6/8 — the same slot the S11 ride skip-beat lands on, by design:
            // the bass approach-tone and the ride skip share the "anticipating the
            // next pulse" function). `stepsPerBeat * grouping[i]` would let us
            // compute groupSteps, but stepInfo.stepInGroup already gives us the
            // index within the group. The last eighth is `stepsPerBeat - 1` slots
            // into the group's final beat (since stepsPerBeat=2 in compound, each
            // beat has 2 steps, the last eighth of a 3-beat dotted-quarter group is
            // stepInGroup === groupSteps - 2 = 4 in 6/8). Use the canonical formula
            // that S11 verified: `stepInGroup === groupSteps - 2`.
            const groupBeats = stepInfo.tsConfig?.grouping?.[stepInfo.groupIndex] ?? 3;
            const groupSteps = groupBeats * ts.stepsPerBeat;
            const isPickupSlot = stepInfo.stepInGroup === groupSteps - 2;
            // Approach slot: the middle eighth of each dotted-quarter group (mStep
            // 2, 8 in 6/8 — stepInGroup === 2, since each eighth-note beat spans
            // 2 16th-steps and the group has 3 eighths at stepInGroup ∈ {0, 2, 4}).
            // At high intensity this becomes an occasional connector between
            // pulse and pickup, helping the line breathe like Paul Chambers'
            // walking 3-against-2 phrasing. Below high intensity we keep this
            // slot silent so the line stays sparse and melodic.
            const isApproachSlot = stepInfo.stepInGroup === 2;

            if (!isPickupSlot && !isApproachSlot) {
                return false;
            }

            // why: deterministic-per-step seed so loops + critique tests stay
            // coherent. Mirrors the funk-bass slap seed pattern (golden-ratio mix
            // with currentLoopCount XOR) — see slapSeedBase. No bare LCG on
            // small integer seeds (feedback_seeded_prng_mulberry32).
            const compoundSeed =
                ((step * 0x9e3779b1) ^ ((playback.currentLoopCount | 0) * 0x85ebca77)) | 0;
            const draw = scrambleHash(compoundSeed);

            // Intensity-tapered density curve. Goal: ~3 onsets/bar at moderate
            // intensity (0.5–0.7), ~4 onsets/bar at high intensity (>0.7). With
            // 2 pulse slots (always-fire) and 2 pickup slots in 6/8:
            //   - intensity ≤ 0.5  → pulse-only (~2 onsets/bar). Pickups silent.
            //   - intensity 0.5–0.7 → pickup prob 0.5 (~3 onsets/bar). Approach silent.
            //   - intensity > 0.7  → pickup prob 0.8 (~3.6 onsets/bar) + approach
            //                        prob 0.3 (~0.6 onsets/bar) → ~4.2 onsets/bar.
            // why the high tier was tamed (was 0.95/0.55 → ~5/bar): All Blues is
            // a spare, hypnotic vamp — even at peak energy the bass should not
            // approach a busy bebop walk. 5/bar read "too busy" by ear in the
            // high-intensity sections; ~4/bar keeps forward motion without
            // crowding. The moderate (0.7) tier is unchanged.
            // Probabilities here are the *only* gate (no competing biases), so
            // these are direct density targets — not the kind of additive-vs-final
            // stage decision called out in feedback_weight_tuning_multiplier_placement.
            // Thresholds 0.5 / 0.7 match the engine-wide band-intensity trichotomy
            // (low / mid / high) used by other density gates in this file and in
            // coordination-engine.ts — not hand-picked for this branch.
            const intensity = playback.bandIntensity;
            if (intensity <= 0.5) {
                // Pulse-only: leave pickups + approach silent. Sparsest, most
                // exposed jazz-waltz texture — the bass "marks the changes."
                return false;
            }
            if (isPickupSlot) {
                // why: 0.5 at moderate, 0.8 at high — pickup is the primary
                // melodic articulation in compound walking bass. The 0.8 ceiling
                // (not 1.0) leaves a "breath" gap so the line doesn't sound
                // mechanical loop-to-loop and stays spare even when energetic.
                const pickupProb = intensity > 0.7 ? 0.8 : 0.5;
                return draw < pickupProb;
            }
            // isApproachSlot: only fires above 0.7 (high intensity) to reach the
            // ~4 onsets/bar target without dominating the line.
            if (intensity > 0.7) {
                // why: separate sub-draw so approach and pickup don't share a
                // probability stream (otherwise a "high" draw at mStep 2 would
                // imply a "high" draw at mStep 4 — breaking the intent of two
                // independent gates). Mix in a small distinct constant.
                const approachDraw = scrambleHash((compoundSeed + 7) | 0);
                return approachDraw < 0.3;
            }
            return false;
        }

        if (isQuarter) {
            return true;
        }

        const isEighthSkip = step % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat * 0.5); // The 'and'

        // Probabilistic eighth-note "skips" for walking bass feel
        let skipProb = 0.1 + playback.bandIntensity * 0.25 + playback.complexity * 0.2;

        if (playback.bpm > 165) {
            skipProb = 0;
        }

        if (isEighthSkip && bassDraw(5) < skipProb) {
            return true;
        }

        return false;
    }
    if (style === 'funk') {
        // Semantic: On beats or specific syncopations
        const isPopTarget = stepInfo ? stepInfo.isBackbeat : isQuarter && intBeat % 2 !== 0;
        const isFoundational = isQuarter || isPopTarget;
        let ghostProb = 0.5 + playback.bandIntensity * 0.3;

        if (playback.bpm > 150) {
            ghostProb *= 0.5;
        }

        if (isFoundational) {
            return true;
        }
        if (bassDraw(1) < ghostProb) {
            return true;
        }
        return false;
    }
    if (style === 'disco') {
        return true;
    }
    if (style === 'hiphop') {
        // Lower intensity = Grounded half notes
        if (playback.bandIntensity < 0.4) {
            return stepInChord % (ts.stepsPerBeat * 2) === 0;
        }
        // Higher intensity = Standard foundations (1, 2&, 3, 4&)
        return isQuarter || step % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2);
    }

    if (style === 'acoustic') {
        // Lower intensity = Half notes (Roots)
        if (playback.bandIntensity < 0.4) {
            return stepInChord % (ts.stepsPerBeat * 2) === 0;
        }
        // Higher intensity = Quarter notes (Supportive)
        return isQuarter;
    }

    if (style === 'neo') {
        // Foundation: 1, 2&, 3, 4& (classic Dilla-esque placements)
        if (stepInfo) {
            return (
                stepInfo.isBeatStart ||
                stepInfo.mStep % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2)
            );
        }
        return false;
    }
    if (style === 'country') {
        // why: Two-Step floor (intensity <= 0.6) — classic honky-tonk half-note Roots
        // on beats 1 and 3 (matches the kick on a Two-Step drum pattern). At
        // intensity > 0.6 we promote to the quarter-note Root-Fifth tier (R-5-R-5),
        // the bread-and-butter country walking-bass shape. The earlier engine
        // returned `step % 8 === 0` unconditionally, leaving the `isFifthBeat`
        // branch in getBassNoteStyle dead code (audit: docs/archive/MUSICAL_AUDIT.md Open #1,
        // bass.md P1 #6). Threshold of 0.6 exactly: at-or-below stays Two-Step,
        // strictly-above promotes to quarter-note tier.
        const isQuarterTier = playback.bandIntensity > 0.6;
        if (isQuarterTier && isQuarter) {
            return true;
        }
        // why: walk-up — the last beat & last "&" before a chord change need to fire
        // so getBassNoteStyle can build a 2-note stepwise walk to the next root.
        // checkBassActiveStyle has no chord context, so we conservatively allow the
        // last-beat slots whenever intensity could justify a walk-up (>0.5) and let
        // the note-picker return null when there's no chord change. This keeps the
        // Two-Step floor (beats 1+3 root) intact while opening the door for the
        // walk-up shape on chord-boundary bars.
        const stepsPerBeat = ts.stepsPerBeat;
        const allowWalkUp = playback.bandIntensity > 0.5;
        if (allowWalkUp) {
            const lastBeatStart = stepsPerBeat * (ts.beats - 1); // step 12 in 4/4
            const lastBeatAnd = lastBeatStart + Math.floor(stepsPerBeat / 2); // step 14 in 4/4
            const mStepLocal = stepInfo ? stepInfo.mStep : step % (ts.beats * stepsPerBeat);
            if (mStepLocal === lastBeatStart || mStepLocal === lastBeatAnd) {
                return true;
            }
        }
        return step % (stepsPerBeat * 2) === 0; // Two-Step half-notes on beats 1 and 3
    }
    if (style === 'metal') {
        if (isEighthBoundary) {
            return true;
        }
        // Gallop/Chug: 16th note subdivisions at higher intensity/complexity
        const gallopProb = (playback.bandIntensity > 0.6 ? 0.5 : 0.1) + playback.complexity * 0.4;
        return bassDraw(2) < gallopProb;
    }
    if (style === 'blues') {
        // Foundation: Always play on quarter notes
        if (isQuarter) {
            return true;
        }

        // The Lope: Play on the swung offbeat (shuffle)
        if (stepInfo?.isOffbeat) {
            // Steeper sensitivity curve: Intensity is the primary driver
            // Add a threshold gate to ensure low intensity is strictly quarter-note based
            if (playback.bandIntensity < 0.3) {
                return false;
            }
            const intensityWeight = playback.bandIntensity ** 1.2;
            const complexityWeight = playback.complexity * 0.3;
            // High consistency (>90%) at high levels, very sparse at low levels
            const shuffleProb = intensityWeight + complexityWeight;
            if (bassDraw(3) < shuffleProb) {
                return true;
            }
        }
        return false;
    }
    if (style === 'walking-ska') {
        if (playback.bpm > 185 && !isQuarter && bassDraw(4) < 0.3) {
            return false;
        }
        return isEighthBoundary;
    }
    if (style === 'dub') {
        // why: dub fires at riddim positions selected by intensity. Same band thresholds
        // as getBassNoteStyle — keep both sites in sync. Beat-1 presence is controlled
        // entirely by the riddim tables (One Drop has no step-0 entry; others do).
        const intensity = playback.bandIntensity;
        let selectedRiddim: keyof typeof REGGAE_RIDDIMS = 'One Drop';
        if (intensity > 0.85) {
            selectedRiddim = 'Steppers';
        } else if (intensity > 0.65) {
            selectedRiddim = 'Stalag';
        } else if (intensity > 0.45) {
            selectedRiddim = '54-46';
        }
        // why: epic-2 S9 — REGGAE_RIDDIMS positions are 0–15 mStep literals on a
        // 16-step 4/4 bar; in compound/odd they never align (Steppers' [12] doesn't
        // exist in a 12-step 6/8 bar → dropped onset; One Drop's [8] lands mid-group;
        // odd-meter bars don't span 0–15 at all). Outside 4/4, derive onsets from the
        // pulse structure instead, preserving each riddim's CHARACTER rather than its
        // literal grid. "Do our best, groove" — not the exact 4/4 riddim.
        const is44 = ts.beats === 4 && ts.stepsPerBeat === 4;
        if (!is44 && stepInfo) {
            // feltBeat = the meter's grouping pulse. why: use isPulseStart (the start of
            // each rhythmic group) whenever the meter has a non-trivial grouping structure
            // (grouping.length > 1), else fall back to isPulse (the quarter grid).
            //
            // Unifying rule: hasGrouping covers BOTH compound meters (isCompound=true, e.g.
            // 6/8 grouping [3,3]) AND simple odd meters (e.g. 5/4 grouping [3,2], 7/4
            // grouping [4,3], 7/8 grouping [2,2,3]) in a single predicate. The old
            // `isCompound ? isPulseStart : isPulse` left 16th-grid odd meters (5/4, 7/4)
            // on isPulse — which is EVERY QUARTER ({0,4,8,12,16} / {…,24}) — producing a
            // locked quarter-note root pedal, far denser than the 3+2 / 4+3 grouping-pulse
            // idiom dub uses. (S9 review P2; epic-3-followup-cleanup S5.)
            //
            // Meter-by-meter mapping after the fix:
            //   6/8  (compound, grouping [3,3])    → isPulseStart → {0,6}     (unchanged)
            //   7/8  (simple,   grouping [2,2,3])  → isPulseStart → {0,4,8}   (unchanged; matches isPulse)
            //   5/4  (simple,   grouping [3,2])    → isPulseStart → {0,12}    (NEW — was {0,4,8,12,16})
            //   7/4  (simple,   grouping [4,3])    → isPulseStart → {0,16}    (NEW — was {0,4,8,12,16,20,24})
            //   3/4  (simple,   grouping [3] len=1)→ isPulse      → {0,4,8}   (unchanged — trivial grouping)
            //   4/4  handled by is44 branch above; never reaches here.
            const hasGrouping = (stepInfo.tsConfig?.grouping?.length ?? 1) > 1;
            // why: isPulseStart = start of each rhythmic group (the dub felt beat);
            // isPulse = every quarter note (too dense in 16th-grid odd meters).
            const feltBeat = hasGrouping ? stepInfo.isPulseStart : stepInfo.isPulse;
            if (selectedRiddim === 'Steppers') {
                // four-on-the-floor character: bass on every felt pulse
                return feltBeat === true;
            }
            if (selectedRiddim === 'One Drop') {
                // the "drop": skip beat 1, hit the later felt pulse(s) (mStep 6 in 6/8)
                return feltBeat === true && !stepInfo.isMeasureStart;
            }
            // Stalag / 54-46 are syncopated. In COMPOUND, add the and-of-pulse pickup
            // (the last eighth before the next pulse — mStep 4/10 in 6/8) so the busier
            // riddim character survives. In simple/odd meters the pickup collapses to
            // the felt-pulse line — an acceptable off-idiom reduction (a dedicated
            // odd-meter dub syncopation is the S10 broad sweep's job); the priority here
            // is "groove + stay sparse," not flood the 8th grid.
            const groupBeats = stepInfo.tsConfig?.grouping?.[stepInfo.groupIndex] ?? ts.beats;
            const groupSteps = groupBeats * ts.stepsPerBeat;
            const isPickup =
                stepInfo.isCompound === true && stepInfo.stepInGroup === groupSteps - 2;
            return feltBeat === true || isPickup === true;
        }
        const riddim = REGGAE_RIDDIMS[selectedRiddim] as [number, number, number, number][];
        const stepsPerBar = ts.beats * ts.stepsPerBeat;
        const mStep = stepInfo ? stepInfo.mStep : step % stepsPerBar;
        return riddim.some((r) => r[0] === mStep);
    }

    return false;
}

export function getBassNoteStyle(
    style: string,
    chord: {
        rootMidi: number;
        quality: string;
        intervals: number[];
        bassMidi?: number | null;
    },
    nextChord: { rootMidi: number; quality: string; bassMidi?: number | null } | null,
    step: number,
    stepInChord: number,
    _stepInfo: StepInfo | null,
    context: {
        withOctaveJump: (midi: number) => number;
        isSameAsPrev: (midi: number) => boolean;
        clampAndNormalize: (midi: number) => number;
        normalizeToRange: (midi: number) => number;
        /** `BassPump.forcesLift()` — see the disco `isOffbeatAnd` branch. */
        pumpForcesLift: boolean;
    },
    ts: { stepsPerBeat: number; beats: number },
    stepsPerMeasure: number,
    intBeat: number,
    _isQuarter: boolean,
    isBeatStart: boolean,
    isDownbeat: boolean,
    stepInMeasure: number,
    _stepInBeat: number,
    baseRoot: number,
    _prevFreq: number,
    prevMidi: number | null,
    _centerMidi: number,
    absMin: number,
    absMax: number,
    scale: number[],
    playback: EnsembleState['playback'],
    groove: EnsembleState['groove'],
    soloist: EnsembleState['soloist'],
    intensity: number,
    velocity: number,
    isSoloistBusy: boolean,
    beatsInChord: number,
    result: (
        freq: number,
        dur?: number | null,
        vel?: number,
        ghost?: number,
        bend?: number,
    ) => { timingOffset: number; [key: string]: unknown },
    _isGroupStart: boolean,
    hasKickTrigger: boolean,
    kickInst: { steps: number[] } | null,
    barsUntilSectionChange?: number,
) {
    const { withOctaveJump, isSameAsPrev, clampAndNormalize, normalizeToRange, pumpForcesLift } =
        context;

    // --- COUNTRY STYLE (Two-Step + Quarter-Note Root-Fifth + Walk-Up) ---
    if (style === 'country') {
        // Two intensity tiers (matched in checkBassActiveStyle so the active gate
        // and the note picker agree):
        //   • intensity <= 0.6  → Two-Step half-notes (Roots on beats 1, 3).
        //   • intensity >  0.6  → Quarter-note R-5-R-5 honky-tonk walking bass.
        // Plus a 2-note stepwise walk-up on the last beat + "&" before any chord
        // change at intensity > 0.5 (independent of Two-Step vs quarter tier).
        // Audit source: docs/archive/MUSICAL_AUDIT.md Open #1, bass.md P1 #6.
        const isQuarterTier = intensity > 0.6;

        // Very low intensity: just the downbeat root.
        if (intensity < 0.2 && !isDownbeat) {
            return null;
        }

        const stepsPerBeat = ts.stepsPerBeat;
        const lastBeatStart = stepsPerBeat * (ts.beats - 1); // step 12 in 4/4
        const lastBeatAnd = lastBeatStart + Math.floor(stepsPerBeat / 2); // step 14 in 4/4
        const mStep = _stepInfo ? _stepInfo.mStep : step % (ts.beats * stepsPerBeat);
        const isLastBeatOfBar = mStep === lastBeatStart;
        const isLastBeatAndOfBar = mStep === lastBeatAnd;

        // ===== WALK-UP =====
        // why: real country walk-ups are 2-to-4 stepwise notes leading into the next
        // root — not a single chromatic neighbor. Build a 2-note walk: a step-tone
        // approach on beat 4, and a chromatic neighbor on the "&" of 4, landing on
        // the next root downbeat. The country scale is pentatonic, so the diatonic
        // path produces the 6th or 9th of the current chord when those are 2
        // semitones from the target; the 4th and 7th fall through to the
        // pentatonic-fallback (nearest scale tone within ±2..4 of target), which
        // keeps the walk inside the major-pent vocabulary instead of inventing a
        // 4th/7th that isn't in country's scale.
        if (
            isChordChangeApproach(nextChord, chord) &&
            intensity > 0.5 &&
            (isLastBeatOfBar || isLastBeatAndOfBar)
        ) {
            const nextTarget = normalizeToRange(nextChord.rootMidi);
            // why: walk-ups punch slightly hotter than Two-Step roots
            // (0.95 + intensity*0.3) to articulate the line as a pickup gesture.
            // Slope is shallower (0.2 vs 0.3) so they don't overpower the downbeat.
            const walkVel = 1.0 + intensity * 0.2;

            if (isLastBeatAndOfBar) {
                // Step "&" of 4 — chromatic neighbor a half-step from target.
                // why: half-step approach is the universal "pulling into the root"
                // gesture; direction is whichever sits within the bass register and
                // sounds like a lead-in (below for ascending lines, above for
                // descending). We pick by which is closer to prevMidi (smooth voice
                // leading from the beat-4 walk note above).
                const below = normalizeToRange(nextTarget - 1);
                const above = normalizeToRange(nextTarget + 1);
                const ref = prevMidi ?? baseRoot;
                const approach = Math.abs(below - ref) <= Math.abs(above - ref) ? below : above;
                // why: "&" is a soft pickup, not the accent — beat 4 is the
                // accented walk tone, downbeat target is loudest. Country phrasing
                // wants strong-soft-LANDING, not soft-strong-LANDING.
                return result(getFrequency(approach), 1, walkVel * 0.85);
            }

            // Beat 4 — first walk note: a step two semitones away from the target
            // on the approach side. why: country walks lean on whole-step motion
            // setting up the chromatic half-step on the "&" → root downbeat (T-2,
            // T-1, T as a three-note pull-in). Direction is computed from raw
            // rootMidi delta (ascending V→I = walk down into target, descending
            // I→V = walk up into target) so the walk follows harmonic contour
            // rather than register-normalized contour — normalizeToRange will
            // clamp the walk note into register afterward.
            const rawDelta = nextChord.rootMidi - chord.rootMidi;
            const direction = rawDelta >= 0 ? -1 : 1; // approach side
            const wholeStep = normalizeToRange(nextTarget + direction * 2);
            const wholeStepPC = (((wholeStep - chord.rootMidi) % 12) + 12) % 12;
            // why: if T-2 (or T+2) is a diatonic scale tone of the current chord,
            // prefer it — that's the canonical "5-6-7-1" shape. Otherwise use a
            // chromatic neighbor two steps away regardless (still a valid walk note;
            // the half-step on the "&" carries the line into the new chord).
            const isDiatonic = scale.includes(wholeStepPC);
            let walkNote = wholeStep;
            if (!isDiatonic) {
                // Pick the nearest scale tone within ±3 semitones of the target.
                const scaleCandidates = scale
                    .map((ivl) => normalizeToRange(chord.rootMidi + ivl))
                    .filter(
                        (m) =>
                            m >= absMin &&
                            m <= absMax &&
                            m !== nextTarget &&
                            Math.abs(m - nextTarget) >= 2 &&
                            Math.abs(m - nextTarget) <= 4,
                    )
                    .sort((a, b) => Math.abs(a - nextTarget) - Math.abs(b - nextTarget));
                if (scaleCandidates.length > 0) {
                    walkNote = scaleCandidates[0];
                }
            }
            // why: beat 4 is the accented walk tone (full walkVel); the "&"
            // pickup above is reduced to 0.85. See velocity-shape note above.
            return result(getFrequency(walkNote), 1, walkVel);
        }

        // ===== NON-WALK-UP STEPS =====
        if (!isBeatStart) {
            // Last-beat-and-of-bar without chord change → silent.
            return null;
        }

        // Beat-4 in Two-Step (not chord change, not quarter-tier) → silent.
        // The activator may have allowed step 12 for walk-up eligibility, but with
        // no chord change and no quarter-tier, this slot doesn't fire.
        if (isLastBeatOfBar && !isQuarterTier) {
            return null;
        }

        // R-5-R-5 in quarter-tier; R-R half-notes in Two-Step.
        // why: in Two-Step we only reach this code on beats 1 and 3 (the activator
        // gates `step % 8 === 0`), both of which are roots — keeping the honky-tonk
        // half-note Root pattern intact. In quarter-tier we additionally reach
        // beats 2 and 4 (the activator allows isQuarter), which become the fifth.
        const isFifthBeat = isQuarterTier && (intBeat === 1 || intBeat === 3);

        let note = baseRoot;
        if (isFifthBeat) {
            // Authentic Country: Prefer the fifth BELOW the root if possible (the
            // canonical "boom-chick" alternation lives in the deep register).
            note = normalizeToRange(baseRoot - 5); // Perfect 4th down = Perfect 5th interval
            if (note > baseRoot) {
                note -= 12; // Force below
            }
            // Dynamic floor check
            if (note < absMin) {
                note += 12;
            }
        }

        const pluckVel = 0.95 + intensity * 0.3;
        return result(getFrequency(note), 2, pluckVel); // Plucky duration
    }

    // --- HIP HOP STYLE (Sub-Bass / 808) ---
    if (style === 'hiphop') {
        const deepRoot = clampAndNormalize(baseRoot - 12);
        // Force ultra-deep register for Hip Hop (Strictly 24-36 if possible)
        let finalDeepRoot = deepRoot;
        while (finalDeepRoot > 36) {
            finalDeepRoot -= 12;
        }
        // Timing: Heavy lazy lag
        const lag = 0.01 + intensity * 0.01;

        let note = finalDeepRoot;
        let dur = ts.stepsPerBeat * 0.9; // Warm, long sustain
        let bendStartInterval = 0;

        if (intensity < 0.4) {
            dur = ts.stepsPerBeat * 1.95; // Extreme sustain for sub-chugs
        } else {
            // why: 808 slide gesture, gated to chord-change boundaries only
            // (bass.md P1 #7). The previous within-chord +12/+7 leap on
            // `complexity > 0.7` sounded like a synth lead jumping mid-chord, not
            // an 808 slide — it has been deleted in favor of a true between-chord
            // bend that targets the upcoming root.
            //
            // The slide fires on the LAST ACTIVE STEP before the new chord. The
            // hip-hop activator (`isBassActive`) permits step % ts.stepsPerBeat
            // === Math.floor(ts.stepsPerBeat/2) — the "and" of each beat — so we
            // key off the "and" of beat 4. The audit recipe named
            // `stepInBeat === ts.stepsPerBeat - 1` but that step is gated OFF
            // by the activator; using the last active eighth keeps the gesture
            // inside the genre's groove without widening the activator.
            //
            // Direction follows raw rootMidi delta — V→I (descending root) =
            // slide *up* from -2 into the new root; I→V (ascending root) =
            // slide *down* from +2 into the new root. ±2 (whole-step) is the
            // canonical 808 slide interval; smaller (±1) reads as a passing
            // chromatic, larger (±3) reads as a melodic walk-up.
            const stepInBeat = step % ts.stepsPerBeat;
            const isLastActiveStepBeforeChange =
                stepInBeat === Math.floor(ts.stepsPerBeat / 2) && intBeat === ts.beats - 1;
            if (
                isLastActiveStepBeforeChange &&
                isChordChangeApproach(nextChord, chord) &&
                intensity > 0.5 &&
                Math.random() < 0.55
            ) {
                // why: intensity > 0.5 gate keeps the slide a high-energy
                // gesture (quiet hip-hop at intensity 0.4-0.5 stays grounded);
                // 0.55 stochastic gate makes the slide a frequent-but-not-every
                // boundary event, leaving room for plain root statements on the
                // "and" before chord changes too.
                // why: target the actual bass voice — slash chords (e.g.
                // C/E → F) walk the bass into the next BASS note, not the
                // chord root. Falls back to rootMidi when no slash.
                const nextBassTarget = nextChord.bassMidi ?? nextChord.rootMidi;
                const currentBassTarget = chord.bassMidi ?? chord.rootMidi;
                let slideTarget = clampAndNormalize(nextBassTarget - 12);
                while (slideTarget > 36) {
                    slideTarget -= 12;
                }
                const rawDelta = nextBassTarget - currentBassTarget;
                // why: 808 slide geometry — the slide ORIGINATES at/near the
                // previous root and glides INTO the target. So for an
                // ascending root motion (I→V, rawDelta > 0), the note begins
                // BELOW the target (bendStartInterval < 0) and bends up; for
                // a descending root motion (V→I, rawDelta < 0), the note
                // begins ABOVE (bendStartInterval > 0) and bends down. This
                // matches the canonical FL Studio "slide note" idiom that
                // defines the trap/drill 808 bassline (bass.md P1 #7 review).
                // ±2 (whole-step) is conservative; once the synth layer wires
                // bendStartInterval through playBassNote (currently silently
                // dropped — separate follow-up), tune up to ±5 by ear.
                // Slash-chord (rawDelta === 0 PC-equal but bassMidi differs)
                // falls into rawDelta < 0 branch arbitrarily; the audible
                // distance is small enough that direction matters little.
                const direction = rawDelta > 0 ? -1 : 1;
                bendStartInterval = direction * 2;
                note = slideTarget;
                // why: shorten the slide note so it reads as a pickup gesture
                // into the new chord's downbeat, not a sustained root.
                dur = ts.stepsPerBeat * 0.5;
            } else if (playback.complexity > 0.85 && !isBeatStart && Math.random() < 0.15) {
                // why: retain a very low-rate octave grace note for high-
                // complexity high-energy moments (e.g. a triplet 808 fill),
                // but at MUCH lower probability than before (was 0.5, now 0.15)
                // and gated stricter (was complexity > 0.7, now > 0.85). Drops
                // the "synth lead" complaint while preserving an 808's classic
                // melodic ornament. Fifth removed (was +7) — fifths above the
                // root in deep sub register sound like a key-change error.
                const glideNote = finalDeepRoot + 12;
                note = clampAndNormalize(glideNote);
                dur = 0.5;
            }
        }

        const res = result(getFrequency(note), dur, 1.0 + intensity * 0.2, 0, bendStartInterval);
        res.timingOffset += lag;
        return res;
    }
    if (style === 'acoustic') {
        // Lay-back timing for acoustic feel
        const lag = 0.01 + intensity * 0.005;

        // Note Logic: Root on downbeats, 5th/8th on secondary beats
        let note = baseRoot;
        let dur = ts.stepsPerBeat * 0.8; // Warm sustain

        if (intensity < 0.4) {
            dur = ts.stepsPerBeat * 1.8; // Long half-note sustain
        } else {
            const isSecondary = intBeat === 1 || intBeat === 3;
            if (isSecondary) {
                // Occasional 5th or Octave at higher intensity
                if (Math.random() < 0.4 + intensity * 0.3) {
                    const fifthOffset =
                        chord.quality.includes('dim') || chord.quality.includes('halfdim') ? 6 : 7;
                    note = Math.random() < 0.6 ? baseRoot + fifthOffset : baseRoot + 12;
                    dur = ts.stepsPerBeat * 0.6; // Slightly shorter for secondary hits
                }
            }
        }

        const res = result(getFrequency(clampAndNormalize(note)), dur, 0.95 + intensity * 0.15);
        res.timingOffset += lag;
        return res;
    }
    if (style === 'metal') {
        const stepInBeat = step % ts.stepsPerBeat;
        const isEighth = stepInBeat % 2 === 0;

        // 1. The "One" (and Beat 3) - Heavy Anchor
        if (isDownbeat || (isBeatStart && intBeat === 2)) {
            return result(getFrequency(baseRoot), 0.9, 1.25 + intensity * 0.1);
        }

        // 2. Rhythmic Foundation: 8th Note Roots (Pedal)
        if (isEighth && !isBeatStart) {
            return result(getFrequency(baseRoot), 0.7, 1.1 + intensity * 0.1);
        }

        // 3. The "Gallop" (16-16-8 feel)
        // Occurs on 'e' and 'a' subdivisions at medium-high intensity
        if (!isEighth) {
            const gallopProb = (intensity > 0.6 ? 0.6 : 0.2) + playback.complexity * 0.3;
            if (Math.random() < gallopProb) {
                // Choice: Chug on root or chromatic approach to next beat
                let note = baseRoot;
                let isGhost = false;

                // Chromatic Leading Note
                if (intensity > 0.75 && Math.random() < 0.4) {
                    const target = baseRoot;
                    note = Math.random() < 0.5 ? target - 1 : target + 1;
                } else {
                    isGhost = intensity < 0.8;
                }

                const res = result(
                    getFrequency(clampAndNormalize(note)),
                    0.3,
                    velocity * (isGhost ? 0.7 : 1.0),
                    isGhost ? 1 : 0,
                );
                // Tight, aggressive timing
                res.timingOffset -= 0.002;
                return res;
            }
        }

        // 4. Fill Logic: Fast 16th runs at max intensity
        if (intensity > 0.9 && Math.random() < 0.3) {
            const idx = Math.floor(Math.random() * scale.length);
            const walkNote = baseRoot + scale[idx];
            return result(getFrequency(clampAndNormalize(walkNote)), 0.2, 1.1);
        }

        return null;
    }

    // --- ROCK STYLE (Driving 8ths) ---
    if (style === 'rock') {
        // why: epic-1-compound-meter S2 — old `step % Math.floor(spb/2) === 0`
        // degenerates to always-true for stepsPerBeat=2 (6/8, 7/8, 12/8). Use
        // the canonical isEighthBoundary from stepInfo when available so the
        // "driving 8ths" gate actually gates on eighth-grid positions.
        const isEighthBoundary =
            _stepInfo?.isEighthBoundary ?? (ts.stepsPerBeat >= 4 ? step % 2 === 0 : true);
        if (!isEighthBoundary) {
            return null;
        }

        // 1. Kick Locking: Mirror the drummer's kick pattern at high complexity
        if (hasKickTrigger && kickInst && (playback.complexity > 0.6 || intensity > 0.7)) {
            const kickStepVal = kickInst.steps[step % (groove.measures * stepsPerMeasure)];
            if (kickStepVal > 0) {
                const kickVel = kickStepVal === 2 ? 1.25 : 1.1;
                return result(getFrequency(baseRoot), 0.8, kickVel * (0.8 + intensity * 0.2));
            }
        }

        // 2. Fundamental Pulse: Quarter notes are solid roots
        if (isBeatStart) {
            // Section-gated anticipation push (epic-deferred-followups S2).
            // why: at ~55% probability the push stopped signalling anything — it
            // became ambient texture rather than a structural signpost. A push is
            // a *gesture* that tells the listener "something's coming." To restore
            // that meaning, we (a) drop the base probability to 10–25% and
            // (b) cluster the gesture at section boundaries where it's most
            // dramatic (the bass "announcing" an incoming chorus or bridge).
            //
            // Section gate multiplier (three-tier approach ramp):
            //   barsUntilSectionChange === 0  → last bar before boundary: full probability
            //   barsUntilSectionChange === 1  → penultimate bar (approach window): half the
            //     boundary probability. Note this is one push opportunity per bar (beat 4
            //     only), so at typical intensity it lands ~10% of penultimate bars vs ~20%
            //     at the boundary — the bass occasionally LEANS IN a bar early, not a
            //     continuous crescendo (a single-beat coin flip can't swell). The point is
            //     a proportional, directional bias toward the change, not a guaranteed build.
            //   otherwise (undefined / -1):     15% residual — push can still appear
            //     mid-section on pure chord changes, but is rare enough to feel
            //     spontaneous rather than routine.
            //
            // why three tiers: Epic 3 S12 widened the `tick-logic.ts` section-change
            // lookahead so `barsUntilSectionChange` can now hold `1` on the penultimate
            // bar (previously the `remainingSteps <= stepsPerMeasure` guard pinned it to
            // 0-or-(-1), so the `=== 1` tier was dead code). The 0.5× penultimate tier
            // biases the push a bar early so the band can lean toward the change. Only the
            // STRUCTURAL counter widened; `upcomingSectionFirstChord` and the drop mechanic
            // still publish/fire on the final bar only.
            //
            // why 0.15 residual (not 0): completely suppressing mid-section pushes
            // would make the engine dead-silent on intra-section chord changes in
            // simpler arrangements that have no section boundary data. A small
            // residual preserves the Rock/Stones vocabulary without dominating it.
            // Source: FOLLOWUPS §A (rock anticipation push), bass.md P1 #8.
            const sectionGateMult =
                barsUntilSectionChange === 0
                    ? 1.0 // why: at the boundary — full Stones signpost probability
                    : barsUntilSectionChange === 1
                      ? 0.5 // why: penultimate bar — approach window, a build not the landing
                      : 0.15; // why: no boundary imminent — rare, spontaneous feel
            const pushProb = (0.1 + intensity * 0.15) * sectionGateMult;
            const isPushPoint = intBeat === ts.beats - 1 && Math.random() < pushProb;
            if (isPushPoint && isChordChangeApproach(nextChord, chord)) {
                // why: migrated from rootMidi-only comparison to isChordChangeApproach so
                // slash chords (e.g. G/B → C) are detected correctly — the old predicate
                // compared rootMidi and would miss a bass-note-only change (bass.md P1 #5,
                // Epic 9 S3.b pattern).
                const nextBassTarget = nextChord.bassMidi ?? nextChord.rootMidi;
                const nextTarget = normalizeToRange(nextBassTarget);

                // Chromatic leading tone sub-branch (~8-13% of push-point chord-change events).
                // why: Stones-style root anticipation (whole-step arrival) is the rock default,
                // but Zeppelin/Sabbath also use half-step approaches as a sub-vocabulary.
                // Low probability preserves the genre's grounded feel; bass.md P1 #4 notes
                // rock/funk/pop/country/soul/gospel use chromatic approaches but less
                // frequently than jazz/blues. The native 'rock' handler always returns
                // non-null on is8th slots, so the universal chromatic-approach branch at
                // lines 1141-1203 never fires for rock — this sub-branch is the only path
                // for rock to produce chromatic leading tones on beat-4 push-points.
                if (Math.random() < 0.08 + intensity * 0.05) {
                    const below = normalizeToRange(nextTarget - 1);
                    const above = normalizeToRange(nextTarget + 1);
                    // why: pick direction by proximity to prevMidi for smooth voice leading
                    // (mirrors the country walk-up direction logic in getBassNoteStyle).
                    const ref = prevMidi ?? baseRoot;
                    const approach = Math.abs(below - ref) <= Math.abs(above - ref) ? below : above;
                    // why: chromatic and root anticipation share velocity (1.2). Both
                    // occupy the same slot as palm-muted pickups into the downbeat — a
                    // real bassist doesn't dynamically soften the chromatic variant; if
                    // anything, Zeppelin/Sabbath accent the half-step pull-up. The
                    // "sub-vocabulary" framing is encoded by probability (8-13%), not
                    // dynamics.
                    return result(getFrequency(approach), 0.8, 1.2, 1);
                }

                // Harmonic Anticipation: Play the NEXT root early (Stones-style default)
                return result(getFrequency(nextTarget), 0.8, 1.2, 1);
            }
            return result(getFrequency(baseRoot), 0.8, 1.1 + intensity * 0.1);
        }

        // 3. Syncopation: Eighth note "ands"
        // Low Intensity: Switch to Quarter Notes
        if (intensity < 0.35) {
            return null;
        }

        // High Intensity: Add variation (5ths or Octaves)
        let note = baseRoot;
        let vel = 0.95 + intensity * 0.15;
        if (intensity > 0.65 && Math.random() < 0.3 + intensity * 0.2 && !isSoloistBusy) {
            const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
            const fifthOffset = hasFlat5 ? 6 : 7;
            note = Math.random() < 0.5 ? baseRoot + 12 : baseRoot + fifthOffset;
            note = clampAndNormalize(note);
            vel *= 1.1;
        }

        return result(getFrequency(note), 0.7, vel);
    }

    // --- BOSSA NOVA / SAMBA STYLE ---
    if (style === 'bossa') {
        const root = baseRoot;
        const hasFlat5 = chord.quality.includes('dim') || chord.quality.includes('halfdim');
        const fifthInterval = hasFlat5 ? 6 : 7;
        const fifthUp = clampAndNormalize(root + fifthInterval);
        const fifthDown = clampAndNormalize(root - (12 - fifthInterval)); // same pitch class, octave lower
        const rootOctaveUp = clampAndNormalize(root + 12);

        // 1. Foundation: 1, 2&, 3, 4&
        const isOne = isBeatStart && intBeat === 0;
        const isThree = isBeatStart && intBeat === 2;
        const isOffbeatTwo =
            step % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2) && intBeat === 1;
        const isOffbeatFour =
            step % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat / 2) && intBeat === 3;

        // Bossa Timing: Subtle lay-back
        const lag = 0.01 + intensity * 0.005;

        // why: epic-2 S9 paired site — checkBassActiveStyle fires compound bossa at the
        // dotted-quarter pulses + the pickup slot (not the 4/4 isOne/isThree/isOffbeat
        // positions below), so those would all fall through to `return null` here. Mirror
        // the gate: root on the felt pulse (the bossa "1 and 3"), fifth on the pickup
        // (the anticipation into the next pulse, matching the 4/4 upbeat-fifth voicing).
        if (_stepInfo?.isCompound === true) {
            if (_stepInfo.isPulseStart) {
                const res = result(
                    getFrequency(root),
                    ts.stepsPerBeat * 0.9,
                    1.1 + intensity * 0.1,
                );
                res.timingOffset += lag;
                return res;
            }
            const res = result(getFrequency(fifthUp), 0.8, 1.0 + intensity * 0.15);
            res.timingOffset += lag + 0.005;
            return res;
        }

        // Per-bar voicing variation: real bossa players octave-displace the root or fifth
        // every few bars even on a static chord, so the line breathes rather than looping.
        // Deterministic from barIndex per CLAUDE.md (no raw Math.random) so loops stay coherent
        // and critique tests don't depend on RNG. Pitch classes are preserved, only octave shifts.
        const barIndex = Math.floor(step / stepsPerMeasure);
        const variationSeed = ((barIndex * 37 + 13) % 100) / 100;
        const useOctaveUpOnThree = variationSeed < 0.2; // ~20% of bars: beat-3 root jumps up an octave
        const useDeepFifthOnTwoAnd = variationSeed >= 0.35 && variationSeed < 0.5; // ~15%: deeper pedal "& of 2"
        const useDeepFifthOnFourAnd = variationSeed >= 0.7 && variationSeed < 0.85; // ~15%: deeper pedal "& of 4"

        // Note Logic: Root on downbeats, Fifth on upbeats (with octave variations)
        if (isOne) {
            const res = result(getFrequency(root), ts.stepsPerBeat * 0.6, 1.1 + intensity * 0.1);
            res.timingOffset += lag;
            return res;
        }

        if (isThree) {
            const pitch = useOctaveUpOnThree ? rootOctaveUp : root;
            const res = result(getFrequency(pitch), ts.stepsPerBeat * 0.6, 1.1 + intensity * 0.1);
            res.timingOffset += lag;
            return res;
        }

        if (isOffbeatTwo) {
            const pitch = useDeepFifthOnTwoAnd ? fifthDown : fifthUp;
            const res = result(getFrequency(pitch), 0.8, 1.0 + intensity * 0.15);
            res.timingOffset += lag + 0.005; // Upbeats often lag even more
            return res;
        }

        if (isOffbeatFour) {
            const pitch = useDeepFifthOnFourAnd ? fifthDown : fifthUp;
            const res = result(getFrequency(pitch), 0.8, 1.0 + intensity * 0.15);
            res.timingOffset += lag + 0.005;
            return res;
        }

        return null;
    }

    // --- FUNK STYLE (Slap & Pop) ---
    if (style === 'funk') {
        const stepInBeat = step % ts.stepsPerBeat;
        const isOne = stepInChord === 0;
        const isSecondarySlap = isBeatStart && intBeat === 2; // Beat 3

        // why: deterministic-per-step entropy for the six articulation gates in
        // this block (pop / high-complexity pop / chuck / hammer-on / approach
        // gate / approach direction). Mirrors the Epic 12 S4 groove-engine
        // pattern — one base seed mixed via the golden-ratio multiplier, distinct
        // integer discriminators per draw. `currentLoopCount` is XOR'd in so a
        // 4-bar funk vamp doesn't lock to bit-identical pop placement across
        // every loop (Imperfect Symmetry drift, standard elsewhere in the
        // codebase). Replaces bare `Math.random()` so loops + critique tests
        // stay coherent. Per CLAUDE.md "deterministic phrasing" +
        // feedback_seeded_prng_mulberry32 (no bare LCG on small seeds).
        // FOLLOWUPS §G.17.
        const slapSeedBase =
            ((step * 0x9e3779b1) ^ ((playback.currentLoopCount | 0) * 0x85ebca77)) | 0;

        // 1. "The One" (and Beat 3) - Primary Slaps
        // why: `isOne` (stepInChord === 0) never actually reaches this arm for funk —
        // bass-engine.ts's shared straight-style early return (`stepInChord === 0 &&
        // (isStraightStyle || style === 'funk')`, ahead of this function's call site)
        // intercepts it first every time. Only `isSecondarySlap` (Beat 3) is live here;
        // `isOne`'s headroom fold below lives in bass-engine.ts instead, at the site
        // that actually emits it. Left both conditions in the guard rather than pruning
        // `isOne` — that's a pre-existing dead-code seam unrelated to #1295, flagged
        // out of scope rather than fixed here.
        if (isOne || isSecondarySlap) {
            const slapVel = 1.2 + intensity * 0.2;
            // why: #1295 — a slap-bass downbeat is played KNOWING the pop is coming right
            // after it on the "and" (popProb is 60-100%): a real player leaves headroom
            // for that octave-up snap by choosing the lower hand position, not by
            // stranding the pop against the register ceiling. `normalizeToRange`'s own
            // register drift (measured #1295: 93/128 downbeats resolve to MIDI 48 at
            // bandIntensity 0.9, against `absMax` 57) has no notion of "a pop follows
            // this note," so fold BEFORE `withOctaveJump`, not its output — folding the
            // jump's own result would silently cancel Imperfect Symmetry's occasional
            // deliberate structural octave displacement (caught in review: an earlier
            // version of this fold did exactly that and collapsed every downbeat in a
            // 128-bar sweep to one fixed pitch). `withOctaveJump` keeps its own
            // headroom-aware direction logic and stays free to fire; on the rare bar
            // where it still lands too high for the pop to lift off of, the pop's own
            // `note > absMax ? slappedRoot : note` fallback holds a unison instead.
            const safeBaseRoot = baseRoot > absMax - 12 ? baseRoot - 12 : baseRoot;
            const slapNote = withOctaveJump(safeBaseRoot);
            return result(getFrequency(slapNote), 0.9, slapVel);
        }

        // 2. The "And" (8th notes) - Aggressive Pops
        if (stepInBeat === Math.floor(ts.stepsPerBeat / 2)) {
            // why: slap-bass "pop" (right-hand index-finger snap on an upper string) is
            // the defining punctuation of the funk idiom on the upbeat 8th (the "and").
            // Base prob 0.6 + intensity*0.4 → 60-100%: at low intensity the pop fires
            // most of the time (keeps the groove snappy even at moderate dynamics); at
            // full intensity it fires on virtually every "and" (Bootsy/Larry Graham territory).
            // Upper-octave (+12) is idiomatic — the pop string rings an octave above the
            // slapped root, giving the signature bright snap. Source: bass.md P2 #17.
            const popProb = 0.6 + intensity * 0.4;
            if (scrambleHash((slapSeedBase + 1) | 0) < popProb) {
                // why: #1295 — anchor the pop on the BEAT'S OWN SLAPPED ROOT instead of a
                // fresh `baseRoot` resolution. `baseRoot` here would be an INDEPENDENT
                // re-run of `normalizeToRange`, whose neck-drift-prevention weights the
                // octave toward `prevMidi` — so a high downbeat dragged the *next*
                // resolution down an octave and `baseRoot + 12` landed BELOW the note it
                // was supposed to rise above 69% of the time (measured #1295). Defining
                // the gesture by its INTERVAL off the root that actually sounded — one
                // resolution, not two independent ones — fixes both the inversion and the
                // low-intensity unison collapse in the same move (DECISION 2026-07-31).
                //
                // `prevMidi` is the engine's last-emitted note, which is usually the
                // downbeat itself, but an intervening chuck/hammer-on on the "e" 16th
                // (the odd-step branches below) can leave it a semitone or two off the
                // root's pitch class. Snap to the nearest occurrence of the CHORD ROOT's
                // pitch class around `prevMidi` (not a bare `+12`) so a stray hammer-on
                // can't leak into the pop's pitch class — this is "the beat's own slapped
                // root," not "whatever note happened to play last."
                const anchor = prevMidi ?? baseRoot;
                const rootPc = ((chord.rootMidi % 12) + 12) % 12;
                const anchorBase = Math.floor(anchor / 12) * 12;
                const slappedRoot = [anchorBase - 12, anchorBase, anchorBase + 12]
                    .map((o) => o + rootPc)
                    .reduce((best, c) =>
                        Math.abs(c - anchor) < Math.abs(best - anchor) ? c : best,
                    );
                const note = slappedRoot + 12;
                // Pop velocity: triggers bright, snappy tone
                const popVel = 1.25 + intensity * 0.2;
                // Headroom fallback: never fold back down into an inversion — if the lift
                // would clear the ceiling, hold the unison instead (same non-inverting
                // shape as the disco pump's upbeat lift and the "a" 16th pop below).
                const finalNote = note > absMax ? slappedRoot : note;
                return result(getFrequency(finalNote), 0.3, popVel);
            }
        }

        // 3. Syncopated "Pushes" & "Gallops" (16ths)
        if (stepInBeat % 2 !== 0) {
            const isSoloistBusyLocal =
                soloist.enabled && (soloist.session.phrasing.busySteps || 0) > 0;

            // High complexity "Pop" on the 'a'
            if (
                stepInBeat === 3 &&
                playback.complexity > 0.7 &&
                // why: 16th-note pop on the "a" (last 16th of each beat) is a high-complexity
                // ornament — Marcus Miller territory. Prob 0.3 + intensity*0.3 → 30-60%: a
                // full-groove pop on every "a" would overwhelm the pocket; this keeps it as
                // a surprise accent rather than a structural note. Only fires when complexity
                // is high (>0.7) so it's absent on straightforward grooves.
                // Source: bass.md P2 #17.
                scrambleHash((slapSeedBase + 2) | 0) < 0.3 + intensity * 0.3 &&
                !isSoloistBusyLocal
            ) {
                const note = baseRoot + 12;
                const finalNote = note > absMax ? baseRoot : note;
                return result(getFrequency(finalNote), 0.2, 1.15);
            }

            // Dead-note/Ghost chucks to maintain engine
            // why: the "chuck" (muted dead note) is the rhythmic engine of slap bass —
            // it fills 16th-note subdivisions that don't slap/pop without adding harmonic
            // content, keeping the groove locked and percussive. Prob (0.2 or 0.1 busy) +
            // intensity*0.4 → 20-60% (or 10-50% when soloist is busy): high enough to
            // produce a groove engine that feels "locked" at medium/high intensity, low
            // enough to leave space at low intensity. Reduced to 0.1 base when the
            // soloist is busy — yield some 16th space so the two don't clutter.
            // Source: bass.md P2 #17.
            const chuckProb = (isSoloistBusyLocal ? 0.1 : 0.2) + intensity * 0.4;
            if (scrambleHash((slapSeedBase + 3) | 0) < chuckProb && !isSoloistBusyLocal) {
                // Usually repeat root or previous note as a ghost
                return result(getFrequency(prevMidi || baseRoot), 0.2, 0.5, 1);
            }

            // High complexity melodic "Double Slap" or "Hammer-on"
            if (
                playback.complexity > 0.7 &&
                intensity > 0.6 &&
                // why: hammer-on (left hand pulls-off/hammers onto a neighboring scale tone
                // without the right hand striking) adds melodic flair on a 16th subdivision.
                // Fixed 30% rate keeps it as an occasional color, not a structural element —
                // a "funky smell of garlic in the groove" rather than a melody statement.
                // Only fires at high complexity + intensity so minimal/medium grooves stay
                // clean. Target note is M2 (Dorian) or b2 (approach) above root depending
                // on scale content — both idiomatic hammer-on destinations.
                // Source: bass.md P2 #17.
                scrambleHash((slapSeedBase + 4) | 0) < 0.3 &&
                !isSoloistBusyLocal
            ) {
                const hammerNote = scale.includes(2) ? baseRoot + 2 : baseRoot + 1;
                return result(getFrequency(clampAndNormalize(hammerNote)), 0.2, 1.1);
            }
        }

        // 4. Harmonic Approaches — only on real chord changes (audit: bass.md P2 #13)
        if (
            intensity > 0.75 &&
            stepInBeat === ts.stepsPerBeat - 1 &&
            isChordChangeApproach(nextChord, chord) &&
            scrambleHash((slapSeedBase + 5) | 0) < 0.6
        ) {
            const target = normalizeToRange(nextChord.rootMidi);
            const approach = scrambleHash((slapSeedBase + 6) | 0) < 0.5 ? target - 1 : target + 1;
            return result(getFrequency(clampAndNormalize(approach)), 0.4, 1.1);
        }

        return null;
    }

    // --- DISCO STYLE (Dynamic Octaves / Pulse) ---
    if (style === 'disco') {
        // MEASURE-relative, not raw-step-relative — matching the `isBeatStart` this branch
        // is handed (`bass-engine.ts` derives it as `stepInMeasure % stepsPerBeat === 0`),
        // the pump's `isLiftStep`, and the bossa/neo pickers above. `step % stepsPerBeat`
        // agrees with this on every chart whose bar length is a multiple of the beat grid,
        // which is all of them EXCEPT 7/8 (14 steps): a per-section `measureMap`
        // (`chords-engine.ts`) puts every measure after an odd number of 7/8 bars at
        // `start ≡ 2 (mod 4)`, and the two frames then disagree by two steps for the rest of
        // the chart. That made the beat-start arm and the "and" arm fire on the SAME step
        // (beat-start winning), and left the pump's forced lift landing on a step this
        // branch does not treat as the "and" at all — a silent no-op, #1292 in a new
        // costume. One frame for the whole branch removes the class.
        const stepInBeat = stepInMeasure % ts.stepsPerBeat;
        const isOffbeatAnd = stepInBeat === Math.floor(ts.stepsPerBeat / 2);

        // why: #1300 — the lift roll and the gallop's two draws below used raw
        // `Math.random()`, so the SAME bar re-scattered a different lift pattern
        // every time it played, on every loop — the line never locked to a figure.
        // A disco bassist picks a figure (octaves throughout / back-half-only /
        // straight eighths) and holds it, varying only at a phrase boundary — not
        // per-eighth-note. Seeded on `stepInMeasure` — already the loop-relative,
        // bar-wrapped position (`bass-engine.ts` derives it from `stepInfo.mStep`
        // before this function ever sees it, per CLAUDE.md's rule that a seed
        // derived from `step` must be measure-relative, not the raw monotonic
        // counter) — deliberately NOT mixed with `currentLoopCount` the
        // way `checkBassActiveStyle`'s density gate is: that shape is right for a
        // gate that WANTS loop-to-loop variety (Imperfect Symmetry), but it's the
        // wrong shape here — XOR-ing in the loop would keep the exact scatter this
        // issue is fixing, just make it reproducible-per-loop instead of literally
        // random. `stepInMeasure`-only gives the SAME bar the SAME lift pattern on
        // every loop, which is the actual musical target. `scrambleHash` is
        // stateless (unlike `Math.random()`'s shared stream), so these draws no
        // longer need to be evaluated unconditionally to protect downstream draw
        // order.
        const discoSeedBase = (stepInMeasure * 0x9e3779b1) | 0;

        // 1. Downbeats (1, 2, 3, 4) -> Solid Root
        if (isBeatStart) {
            return result(getFrequency(baseRoot), 0.9, 1.25);
        }

        // 2. Upbeats (&) -> Dynamic Octave
        if (isOffbeatAnd) {
            // Probability of octave increases with intensity
            const octaveProb = 0.4 + intensity * 0.6;
            // #1292 — the roll is a DENSITY knob: how often the pump lifts at all. It is not
            // entitled to veto a repeat-pass gesture that has already been decided. When the
            // pump has drawn a `fifth` for this beat, the lift sounds unconditionally and
            // `revoice` (via `withImperfectSymmetry` in `bass-engine.ts`) turns it into the
            // 5th; the alternative was a seeded musical decision losing to a bare
            // `Math.random()` it has no visibility into, silently 45% of the time at the
            // gesture's own 0.25 intensity floor.
            const rollLifts = scrambleHash((discoSeedBase + 1) | 0) < octaveProb;
            if (pumpForcesLift || rollLifts) {
                const note = baseRoot + 12;
                // #1271 — the pump is UPWARD by definition: low root on the beat, octave
                // as the lift above it. This used to fold an overflowing octave DOWN
                // (`note = baseRoot - 12`), which inverted the gesture — and when the
                // register anchor had drifted up an octave, `baseRoot - 12` landed on the
                // downbeat's own pitch and emitted a unison from a roll that had
                // succeeded. Both were then scored as perfect by the critique test's
                // `Math.abs(diff) === 12`.
                //
                // `PUMP_ANCHOR_STYLES` in `bass-pump.ts` (#1291 moved it out of
                // `bass-engine.ts`) now picks an anchor whose
                // octave partner is guaranteed to fit (ceiling `absMax - 12`), so this
                // never fires. It stays as a non-inverting fallback rather than an
                // assertion because a missed pump on one upbeat is a small blemish while
                // an inverted one contradicts the line's identity — and the branch cannot
                // fix it properly itself, since lowering the PAIR needs the downbeat this
                // upbeat has already been played against. Same shape as the gallop's fold
                // below and the funk slap-pop's.
                if (note > absMax || note < absMin) {
                    return result(getFrequency(baseRoot), 0.8, 1.15);
                }

                return result(getFrequency(note), 0.8, 1.15);
            }
            // Fallback to repeating root
            return result(getFrequency(baseRoot), 0.8, 1.0);
        }

        // 3. The "Gallop" (16th skips on 'e' or 'a')
        if (stepInBeat % 2 !== 0) {
            // Only at higher complexity and intensity
            const gallopProb = intensity ** 2 * 0.4 + playback.complexity * 0.3;
            // #1300 — seeded on `discoSeedBase` alongside the upbeat lift so the gallop's
            // density and note choice also lock to a figure loop-to-loop instead of
            // re-rolling on every pass (same rationale as the lift roll above).
            if (scrambleHash((discoSeedBase + 2) | 0) < gallopProb - 0.1) {
                // Usually repeat the root or octave ghosted
                const note = scrambleHash((discoSeedBase + 3) | 0) < 0.7 ? baseRoot : baseRoot + 12;
                // Unreachable for a pump style, for the same reason as the fold above:
                // `baseRoot` is pinned to [28, 39], so `note` is at most 51 and `absMax` is
                // 57. Kept as a non-inverting fallback rather than deleted, on the same
                // terms — no mutation of it can redden a test, so what pins it is the
                // anchor-window precondition, not this line.
                const finalNote = note > absMax ? baseRoot : note;
                return result(getFrequency(finalNote), 0.5, 0.6, 1);
            }
        }

        return null;
    }

    // --- DUB STYLE (Reggae) ---
    if (style === 'dub') {
        // why: the old "One Drop silencer" block was removed here. It mislabeled the
        // affected riddims — at intensity 0.45-0.7 the active riddim is 54-46 or Stalag
        // (both have a step-0 entry), yet the silencer was randomly suppressing beat 1
        // 80% of the time on those riddims. One Drop itself (intensity < 0.45) has no
        // step-0 entry, so the silencer was a no-op there anyway. Beat-1 presence is
        // now fully controlled by the riddim tables below. (bass.md P0 #3)
        const deepRoot = clampAndNormalize(baseRoot - 12);
        // Force deep register for Dub (Stay within safe sub-bass range)
        let finalDeepRoot = deepRoot;
        while (finalDeepRoot > 38) {
            finalDeepRoot -= 12;
        }
        while (finalDeepRoot < absMin) {
            finalDeepRoot += 12;
        }

        let selectedRiddim = 'One Drop';
        if (intensity > 0.85) {
            selectedRiddim = 'Steppers';
        } else if (intensity > 0.65) {
            selectedRiddim = 'Stalag';
        } else if (intensity > 0.45) {
            selectedRiddim = '54-46';
        } else {
            selectedRiddim = 'One Drop';
        }

        // why: epic-2 S9 paired site — checkBassActiveStyle now derives dub onsets
        // from the pulse structure outside 4/4 (the 4/4 riddim step-literals don't
        // map to compound/odd bars), so those active steps won't be found in
        // REGGAE_RIDDIMS here. Mirror the gate: play the deep root (dub is root-driven;
        // riddim intervals are mostly 0) with the riddim's typical velocity/duration.
        // Keeps the WHEN gate and the WHAT note in sync across meters.
        const is44 = ts.beats === 4 && ts.stepsPerBeat === 4;
        if (!is44 && _stepInfo) {
            const tunedVel = 1.0 * (0.8 + intensity * 0.3);
            const res = result(
                getFrequency(clampAndNormalize(finalDeepRoot)),
                2,
                tunedVel * (0.95 + Math.random() * 0.1),
            );
            res.timingOffset += 0.01 + intensity * 0.01;
            return res;
        }

        const riddim = (
            REGGAE_RIDDIMS as unknown as Record<string, [number, number, number, number][]>
        )[selectedRiddim];
        const match = riddim.find((r) => r[0] === stepInMeasure);

        if (match) {
            const [, interval, vel, dur] = match;
            const tunedVel = vel * (0.8 + intensity * 0.3);

            // Add extra 'lay-back' for the lazy Reggae feel
            const res = result(
                getFrequency(clampAndNormalize(finalDeepRoot + interval)),
                dur,
                tunedVel * (0.95 + Math.random() * 0.1),
            );
            res.timingOffset += 0.01 + intensity * 0.01;
            return res;
        }
        return null;
    }

    // --- WALKING SKA STYLE (Fast 8ths / Bouncy) ---
    if (style === 'walking-ska') {
        // why: epic-1-compound-meter S2 — same `is8th` bug as rock above.
        const isEighthBoundary =
            _stepInfo?.isEighthBoundary ?? (ts.stepsPerBeat >= 4 ? step % 2 === 0 : true);
        if (!isEighthBoundary) {
            return null;
        }

        // Bouncy Pattern Logic (Root, 5th, 6th, Octave)
        const patternIndex = intBeat % 4;
        let targetInterval = 0; // Default Root

        if (patternIndex === 1) {
            targetInterval = 7; // 5th
        } else if (patternIndex === 2) {
            // why: bass.md P1 #9 — the walking-ska "6th" beat was hard-coded to
            // 9 (M6), which is wrong over minor (b3 + M6 → Dorian implication,
            // not Aeolian) and half-dim (b5 + M6 clash). Pick scale-aware sixth:
            // prefer M6 if it's in the chord's diatonic scale (major, Dorian,
            // Mixolydian, Lydian etc.), fall back to m6 (natural minor, Locrian,
            // Phrygian), and finally fall back to the 5th if neither sixth is
            // available (degenerate-scale safety; the 5 is always idiomatic).
            targetInterval = scale.includes(9) ? 9 : scale.includes(8) ? 8 : 7;
        } else if (patternIndex === 3) {
            targetInterval = 12; // Octave
        }

        // High Intensity: Add melodic variation and chromatic runs
        if (intensity > 0.6 && Math.random() < 0.4) {
            const randomScaleNote = scale[Math.floor(Math.random() * scale.length)];
            targetInterval = randomScaleNote;
        }

        // Chromatic approach to next chord on the last eighth note
        const isLastEighth =
            _stepInfo?.mStep ===
            (_stepInfo?.tsConfig?.beats || 4) * (_stepInfo?.tsConfig?.stepsPerBeat || 4) - 2;
        // why: migrated from rootMidi-only comparison to isChordChangeApproach
        // so slash chords (e.g. G/B) whose bassMidi differs from rootMidi are
        // correctly detected as a chord change rather than staying silent on
        // the chromatic approach. (bass.md micro-cleanup S5.)
        if (isLastEighth && isChordChangeApproach(nextChord, chord) && intensity > 0.5) {
            const nextTarget = normalizeToRange(nextChord.rootMidi);
            const approach = Math.random() < 0.5 ? nextTarget - 1 : nextTarget + 1;
            const res = result(getFrequency(clampAndNormalize(approach)), 0.8, 1.2);
            res.timingOffset -= 0.005; // Rush the transition
            return res;
        }

        // Fundamental Pulse
        const res = result(
            getFrequency(clampAndNormalize(baseRoot + targetInterval)),
            0.8,
            1.0 + intensity * 0.2,
        );

        // Micro-timing: Rush slightly at high intensity to drive the energy
        res.timingOffset -= 0.004 + intensity * 0.004;
        return res;
    }

    const isEighthSkip = stepInMeasure % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat * 0.5);

    // --- QUARTER NOTE (WALKING) STYLE ---
    if (
        style === 'quarter' ||
        // why: compound-meter All Blues via the Blues smart-genre (bass style
        // 'blues') reuses the jazz compound walking PITCH picker so 6/8 blues
        // gets idiomatic pulse-roots + leading-tone pickups instead of the
        // 4/4-shaped universal fallback below. The compound sub-block returns
        // first, so the 4/4 quarter logic further down is unreachable for
        // blues. Mirrors the density routing in checkBassActiveStyle (§C.85).
        (style === 'blues' && _stepInfo?.tsConfig?.isCompound === true)
    ) {
        const isJazz = groove.genreFeel === 'Jazz' || groove.lastDrumPreset === 'Jazz';

        // --- COMPOUND METER (6/8, 12/8) PITCH PICKER ---
        // why: epic-1-compound-meter S15 — the 4/4-shaped beat-position branches
        // below (especially the `intBeat === 2` "beat 3 → fifth" idiom at line ~1303)
        // fire on mStep 4 in 6/8 (intBeat = 4/2 = 2 in compound), which is the S11/S12
        // PICKUP slot — not the strong "beat 3" of a 4/4 walking line. Canonical
        // Paul Chambers 6/8 walking ("All Blues") leans on chromatic / scale-step
        // *leading-tone* approaches at pickup slots and roots on pulses, NOT stable
        // 5ths on the pickup. Without this branch, pickups played the 5th 70% of
        // the time and held-chord pulses fell through to the generic scale-tone
        // fallback (could return 3rd, 5th, or 7th of the held chord rather than
        // the root). Density gate already lives in checkBassActiveStyle (S12); this
        // branch only sets the PITCH for the slots that gate fires.
        //
        // Slot derivation mirrors checkBassActiveStyle's compound-meter isCompound branch:
        //   - pulse:   stepInfo.isPulseStart        — mStep {0, 6} in 6/8
        //   - pickup:  stepInGroup === groupSteps-2 — mStep {4, 10} in 6/8
        //   - approach: stepInGroup === 2           — mStep {2, 8} in 6/8 (high intensity)
        // Simple-meter 4/4 paths remain byte-identical: this branch only fires
        // when stepInfo.tsConfig.isCompound is true.
        if (_stepInfo?.tsConfig?.isCompound === true) {
            const groupBeats = _stepInfo.tsConfig?.grouping?.[_stepInfo.groupIndex] ?? 3;
            const groupSteps = groupBeats * ts.stepsPerBeat;
            const isPulseSlot = _stepInfo.isPulseStart;
            const isPickupSlot = _stepInfo.stepInGroup === groupSteps - 2;
            const isApproachSlot = _stepInfo.stepInGroup === 2;

            // why: deterministic seed for any chromatic-vs-scalar / above-vs-below
            // pick in this branch. Same shape as the compound density gate seed
            // (bassRandSeed in checkBassActiveStyle) and the funk slap seed — golden-ratio mix
            // with currentLoopCount XOR, mulberry32-scrambled. No bare LCG
            // (feedback_seeded_prng_mulberry32).
            const compoundPitchSeed =
                ((step * 0x9e3779b1) ^ ((playback.currentLoopCount | 0) * 0xc2b2ae35)) | 0;

            if (isPulseSlot) {
                // why: pulses on a held or changing chord ALWAYS take the chord
                // root. `baseRoot` is already register-normalized via the upstream
                // normalizeToRange call in bass-engine.ts, so this respects the
                // register slot (23–57) + previous-note proximity that
                // clampAndNormalize embeds. `withOctaveJump` is reserved for
                // explicit downbeat-displacement gestures — pulse roots should sit
                // in the established register so the line breathes; we use
                // clampAndNormalize without the octave-jump bias.
                return result(
                    getFrequency(clampAndNormalize(baseRoot)),
                    ts.stepsPerBeat * 0.9, // why: hold across the eighth (compound stepsPerBeat=2)
                    velocity,
                );
            }

            if (isPickupSlot) {
                // why: pickup is the leading-tone slot — approach the NEXT pulse's
                // root. The "next pulse" depends on whether this pickup is at the
                // end of the bar or mid-bar:
                //   - mid-bar pickup (e.g. mStep 4 in 6/8, groupIndex 0 of 2):
                //       next pulse is mStep 6 of the SAME bar — still the current
                //       chord. Pickup is a chromatic neighbor of the current root.
                //   - end-of-bar pickup (e.g. mStep 10 in 6/8, the final group):
                //       next pulse is mStep 0 of the NEXT bar — possibly a chord
                //       change. If nextChord differs, aim at nextChord's root.
                // `nextChord` as passed into getBassNote is the next BAR's chord,
                // not the next pulse's chord — so it's only the right target when
                // we're in the final group of the current bar.
                const grouping = _stepInfo.tsConfig?.grouping ?? [3];
                const isLastGroupOfBar = _stepInfo.groupIndex === grouping.length - 1;
                const isChange = isLastGroupOfBar && isChordChangeApproach(nextChord, chord);
                const nextRootTarget =
                    isChange && nextChord
                        ? normalizeToRange(nextChord.bassMidi ?? nextChord.rootMidi)
                        : baseRoot;
                // why: §C.83 — the chromatic approach direction follows the
                // line's contour, which IS the idiom Chambers uses: b7→root is
                // an ascending resolution (approach from BELOW), b2→root
                // descends (approach from ABOVE). Continuing prevMidi's
                // direction into the target reproduces that rule directly from
                // the established line, without needing the chord scale. Fall
                // back to a seeded 50/50 only when there's no contour to
                // continue (prevMidi sits exactly on the target).
                const prevForDir = prevMidi ?? baseRoot;
                const approachFromBelow =
                    prevForDir < nextRootTarget
                        ? true
                        : prevForDir > nextRootTarget
                          ? false
                          : scrambleHash((compoundPitchSeed + 11) | 0) < 0.5;
                const approachMidi = approachFromBelow ? nextRootTarget - 1 : nextRootTarget + 1;
                return result(
                    getFrequency(clampAndNormalize(approachMidi)),
                    ts.stepsPerBeat * 0.6,
                    velocity * 0.9,
                );
            }

            if (isApproachSlot) {
                // why: middle-of-group slot (mStep 2/8) only fires at intensity > 0.7
                // (the density gate in checkBassActiveStyle gates this). Pick a chord
                // tone that voice-leads into the pickup slot. The pickup will sit
                // near root ±1; a chord tone in the same neighborhood (3rd or 5th)
                // gives the line forward motion without doubling the root. Score
                // candidates by:
                //   - chord-tone class (3rd or 5th preferred)
                //   - proximity to prevMidi (stepwise voice leading)
                // and pick the best. If no chord tones in the scale, fall back to a
                // scale neighbor of the root. This is the mid-bar "approach"
                // gesture — chord tone, not chromatic.
                const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
                const hasSharp5 = chord.quality === 'aug' || chord.quality === 'augmaj7';
                const has_m3 =
                    chord.quality.startsWith('m') ||
                    chord.quality === 'dim' ||
                    chord.quality === 'halfdim';
                const thirdInterval = has_m3 ? 3 : 4;
                const fifthInterval = hasFlat5 ? 6 : hasSharp5 ? 8 : 7;

                const thirdMidi = normalizeToRange(baseRoot + thirdInterval);
                const fifthMidi = normalizeToRange(baseRoot + fifthInterval);

                // why: §C.84 — score by stepwise distance to prevMidi (voice
                // leading) but tilt toward the 3rd. The 3rd carries the chord's
                // major/minor identity (Paul Chambers' favored mid-group tone);
                // pure distance alone picks the same chord tone on both halves
                // of the bar at high intensity → borderline monotone. A seeded
                // 70/30 tilt shaves ~1.5 semitones off the 3rd's effective cost
                // so it wins unless the 5th is the clearly stronger stepwise
                // move, while keeping bar-to-bar variety.
                const prev = prevMidi ?? baseRoot;
                const thirdBias = scrambleHash((compoundPitchSeed + 21) | 0) < 0.7 ? 1.5 : 0;
                const dThird = Math.abs(thirdMidi - prev) - thirdBias;
                const dFifth = Math.abs(fifthMidi - prev);
                const approachChordTone = dThird <= dFifth ? thirdMidi : fifthMidi;
                return result(
                    getFrequency(clampAndNormalize(approachChordTone)),
                    ts.stepsPerBeat * 0.6,
                    velocity * 0.85,
                );
            }

            // why: any other compound step that somehow reached here (e.g. odd-
            // step leak — should not happen given checkBassActiveStyle's gating).
            // Return null so the density gate's contract holds: only named slots
            // produce onsets.
            return null;
        }

        if (isJazz && intensity < 0.3) {
            if (!isBeatStart || intBeat % 2 !== 0) {
                return null;
            }
            if (isDownbeat) {
                return result(getFrequency(withOctaveJump(baseRoot)), 2, 1.05);
            }
            const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
            const hasSharp5 = chord.quality === 'aug' || chord.quality === 'augmaj7';
            return result(
                getFrequency(
                    clampAndNormalize(
                        withOctaveJump(baseRoot + (hasFlat5 ? 6 : hasSharp5 ? 8 : 7)),
                    ),
                ),
                2,
                1.05,
            );
        }

        if (!isBeatStart && !isEighthSkip) {
            return null;
        }

        if (isDownbeat) {
            return result(
                getFrequency(clampAndNormalize(baseRoot)),
                isEighthSkip ? 0.4 : ts.stepsPerBeat * 0.45,
                velocity,
            );
        }

        if (intBeat === 2 && isBeatStart && !isSoloistBusy) {
            // Beat 3: High preference for 5th or Octave
            const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
            const fifthOffset = hasFlat5 ? 6 : 7;
            const targetInterval = Math.random() < 0.7 ? fifthOffset : 0;
            return result(
                getFrequency(clampAndNormalize(baseRoot + targetInterval)),
                isEighthSkip ? 0.4 : ts.stepsPerBeat * 0.45,
                velocity,
            );
        }

        // --- Jazz Path-Note Logic (Beat 2) ---
        if (isJazz && isBeatStart && intBeat === 1) {
            const nextTarget = nextChord ? nextChord.rootMidi : baseRoot;
            const targetRoot = normalizeToRange(nextTarget);

            // Find a scale note that moves towards the target
            const candidates = scale
                .map((ivl) => normalizeToRange(baseRoot + ivl))
                .filter((midiNote) => {
                    const diff = Math.abs(midiNote - (prevMidi || baseRoot));
                    return diff > 0 && diff <= 5; // Within a reasonable distance
                });

            if (candidates.length > 0) {
                // Score candidates by distance to targetRoot AND proximity to prevMidi
                candidates.sort((a, b) => {
                    const ivlA = (a - chord.rootMidi + 120) % 12;
                    const ivlB = (b - chord.rootMidi + 120) % 12;

                    // Bonus for 3rd or 7th (Defining tones)
                    const bonusA =
                        ivlA === 3 || ivlA === 4 || ivlA === 10 || ivlA === 11 ? -1.5 : 0;
                    const bonusB =
                        ivlB === 3 || ivlB === 4 || ivlB === 10 || ivlB === 11 ? -1.5 : 0;

                    const scoreA =
                        Math.abs(a - targetRoot) +
                        Math.abs(a - (prevMidi || baseRoot)) * 0.5 +
                        bonusA;
                    const scoreB =
                        Math.abs(b - targetRoot) +
                        Math.abs(b - (prevMidi || baseRoot)) * 0.5 +
                        bonusB;
                    return scoreA - scoreB;
                });
                return result(
                    getFrequency(clampAndNormalize(candidates[0])),
                    ts.stepsPerBeat * 0.45,
                    velocity * 0.9,
                );
            }
        }

        // For intermediate beats, return undefined to let the Generic Fallback and Approach Logic
        // handle scale tone picking with proper voice-leading and soloist awareness.
        return undefined;
    }

    // Chromatic Approach Logic — universal across genres; Jazz/Blues retain higher probability
    const isLastBeatOfMeasure = intBeat === ts.beats - 1;
    const isEndOfChord = intBeat === beatsInChord - 1;
    const isLastEighth = _stepInfo?.mStep === ts.beats * ts.stepsPerBeat - 2;
    const isApproachPoint =
        (isBeatStart && (isLastBeatOfMeasure || isEndOfChord)) || isEighthSkip || isLastEighth;

    // Use a slightly more aggressive chromatic probability for the critique to ensure it triggers
    if (isApproachPoint && isChordChangeApproach(nextChord, chord)) {
        const nextTarget =
            nextChord.bassMidi !== null && nextChord.bassMidi !== undefined
                ? nextChord.bassMidi
                : nextChord.rootMidi;
        const targetRoot = normalizeToRange(nextTarget);
        const pullTension =
            (soloist.session.tension || 0) + intensity * 0.3 + playback.complexity * 0.2;
        let chromaticProb = (isSoloistBusy ? 0.4 : 0.6) + pullTension * 0.3;

        // Force very high probability for Jazz/Blues at high levels
        if (intensity > 0.75 && (groove.genreFeel === 'Jazz' || groove.genreFeel === 'Blues')) {
            // why: jazz/blues idiomatic — chromatic leading tones are the primary
            // approach vocabulary at high intensity; raise to near-certain.
            chromaticProb = 0.95;
        } else if (groove.genreFeel !== 'Jazz' && groove.genreFeel !== 'Blues') {
            // why: rock/funk/pop/country/soul/gospel all use chromatic approaches but
            // less frequently than jazz/blues — half the base probability preserves the
            // idiom without over-jazzing non-jazz genres (bass.md P1 #4).
            chromaticProb *= 0.5;
        }

        if (Math.random() < chromaticProb) {
            const choices = [
                { midi: targetRoot - 5, weight: 0.5 },
                { midi: targetRoot - 1, weight: 1.0 },
                { midi: targetRoot + 1, weight: 1.0 },
            ];
            // Optimization: Replace Array.prototype.reduce with a standard for loop to avoid closure overhead in hot audio path
            let totalWeight = 0;
            for (let i = 0; i < choices.length; i++) {
                totalWeight += choices[i].weight;
            }
            let r = Math.random() * totalWeight;
            let approach = targetRoot - 1;
            for (const c of choices) {
                r -= c.weight;
                if (r <= 0) {
                    approach = c.midi;
                    break;
                }
            }
            // why: approach notes must sit within ±5 semitones of their target;
            // withOctaveJump would add ±12, turning a smooth half-step approach into
            // a dissonant octave leap — contradicts voice-leading intent (bass.md P0 #2).
            // Octave displacement is reserved for downbeat root statements only.
            approach = clampAndNormalize(approach);
            const bend = approachBend(groove.genreFeel, approach, targetRoot, isSoloistBusy);
            return result(getFrequency(approach), 1, velocity, 0, bend);
        } else {
            const candidates = [targetRoot - 5, targetRoot + 7, targetRoot + 5, targetRoot - 7];
            const valid = candidates.filter(
                (n) => n >= absMin && n <= absMax && !isSameAsPrev(n) && n % 12 !== baseRoot % 12,
            );
            const approach =
                valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : targetRoot - 5;
            // why: candidates already filtered to absMin–absMax (bass register 23–57);
            // withOctaveJump would displace the perfect-fourth approach (−5) by ±12,
            // producing a leap instead of a smooth landing. Reserve for downbeat roots.
            return result(getFrequency(approach), null, velocity);
        }
    }

    return undefined;
}
