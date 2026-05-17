import type { StepInfo } from '../types.js';

/**
 * Coordination Context Management and Contract Enforcement
 * This module ensures the "Musical Coordination Contract" is satisfied.
 */

// why: leaning on the alterations over V7alt/V7b9/V7#9/etc. is the single most
// idiomatic move in jazz soloing. The soloist needs to know "this chord is altered
// and these specific pitch classes (relative to root) are the alterations to lean on".
// Kept exhaustive and explicit rather than parsing the chord symbol — the chord
// engine already canonicalizes quality strings; we map each known altered quality
// to the set of *altered extensions* (NOT the chord tones themselves) so the
// soloist's final-stage `weight *= 2.0` multiplier biases toward color tones,
// not toward roots/3rds/5ths which already win via the chord-tone bonus.
//
// Pitch classes are semitone offsets from the chord root:
//   b9 = 1,  #9 = 3,  #11/b5 = 6,  b13/#5 = 8
//
// Source: harmony-coordination.md P0 #8.
const ALT_EXTENSIONS_BY_QUALITY: Record<string, readonly number[]> = {
    // Fully altered dominant — bebop "altered scale" colors: b9, #9, #11, b13.
    '7alt': [1, 3, 6, 8],
    // Single-alteration dominants — only the named alteration is preferred.
    '7b9': [1],
    '7#9': [3],
    '7b5': [6],
    '7#11': [6],
    '7b13': [8],
    // Half-diminished / m7b5: bebop Locrian b9 (1) is iconic; Locrian #2 natural-9
    // (2) is the modal default. Both are valid color tones; include both.
    halfdim: [1, 2],
    m7b5: [1, 2],
    'half-diminished': [1, 2],
    // Diminished (o7): whole-half diminished scale color tone is the natural-9
    // above root (interval 2). b9 (1) belongs to the half-whole scale used on
    // dominant-b9 chords, NOT on fully diminished — would sound out-of-scale here.
    dim: [2],
    diminished: [2],
    // Augmented dominants (7#5): soloed with whole-tone scale [0,2,4,6,8,10] —
    // the #11/b5 (interval 6) is the defining color tone. #9 (3) is NOT in the
    // whole-tone scale and would break the chord's identity. augmaj7 is soloed
    // with Lydian Augmented, where #11 (6) is again the canonical lean.
    aug: [6],
    augmented: [6],
    augmaj7: [6],
};

/**
 * Returns the pitch classes (semitone offsets from chord root) of the *altered
 * extensions* for a chord, or [] if the chord is not a recognized tension chord.
 * Soloist final-stage weight multiplier consumes this list.
 */
export function getAltPitchClasses(
    quality: string | undefined | null,
    rootMidi: number | undefined | null,
): number[] {
    if (!quality || !Number.isFinite(rootMidi)) {
        return [];
    }
    const offsets = ALT_EXTENSIONS_BY_QUALITY[quality];
    if (!offsets) {
        return [];
    }
    const rootPc = (((rootMidi as number) % 12) + 12) % 12;
    const out: number[] = [];
    for (let i = 0; i < offsets.length; i++) {
        out.push((rootPc + offsets[i]) % 12);
    }
    return out;
}

/**
 * True iff the chord quality is one of the tension qualities that publishes
 * a non-empty altered-extension list. Mirrors `isTensionChordQuality` in
 * voicing-policy.ts but scoped to the soloist alteration map above.
 */
export function isTensionChordForSoloist(quality: string | undefined | null): boolean {
    return Boolean(quality && quality in ALT_EXTENSIONS_BY_QUALITY);
}

/**
 * Carryover values that survive across ticks. Producers of the per-tick context
 * (currently only `tick-logic.ts → generateNotesForStep`) thread this in via the
 * caller (`worker-buffer-manager`, `midi-worker-logic`) so consumers that need
 * "what did the soloist do recently?" can read a sticky value instead of the
 * current-tick-only `soloistMidi` (which is ~0 on most harmony stab steps
 * because harmony explicitly yields away from soloist-active steps).
 *
 * writer: tick-logic.ts (copies out after each generated step)
 * readable-after: any consumer in any module
 */
export interface CoordinationCarryover {
    lastActiveSoloistMidi: number;
    // Absolute step at which lastActiveSoloistMidi was last written. Lets consumers
    // age-cap the sticky so a soloist who played one note then went silent doesn't
    // steer harmony's register for the entire remaining session.
    lastActiveSoloistStep: number;
}

export function createCoordinationContext(
    step: number,
    stepInfo: StepInfo | null = null,
    carryover: CoordinationCarryover | null = null,
) {
    // Initial context derived from the "anchor" (Groove)
    const ts = (stepInfo as any)?.tsConfig || { beats: 4, stepsPerBeat: 4 };
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const mStep = stepInfo ? stepInfo.mStep : step % stepsPerBar;

    return {
        step,
        mStep,
        isMeasureStart: stepInfo ? stepInfo.isMeasureStart : mStep === 0,
        isMeasureEnd: mStep >= stepsPerBar - (ts.stepsPerBeat || 4), // Last beat of measure
        kickHit: false, // Set during pre-calculation
        snareHit: false, // Set during pre-calculation
        pocketOffset: 0, // To be set from groove-engine
        soloistBusy: false, // Set by soloist turn
        soloistMidi: 0, // Set by soloist turn (current tick only)
        avgSoloistMidi: 0,
        // why: harmony's spectral-gap branch (harmonies.ts:535-540) needs a non-zero
        // soloist position on harmony-stab steps, but the soloist usually rests on those
        // steps. lastActiveSoloistMidi survives across ticks so the branch actually fires.
        // Seeded from caller carryover; updated in updateCoordinationContext('soloist').
        lastActiveSoloistMidi: carryover?.lastActiveSoloistMidi || 0,
        // Step at which lastActiveSoloistMidi was last written. Consumers compare against
        // `step` to age-cap stale values (see harmonies.ts spectral-gap branch). 0 means
        // "never set" (sentinel — equivalent to no sticky).
        lastActiveSoloistStep: carryover?.lastActiveSoloistStep || 0,
        bassHit: false, // Set by bass turn
        bassMidi: 0, // Set by bass turn
        accompanimentHit: false,
        accompanimentMidis: [] as number[],
        avgChordMidi: 0,
        upcomingSectionFirstChord: null as any,
        // why: published per-tick from the current chord (writer: tick-logic chord-preamble
        // at lines ~102-122; readable-after: chord-preamble — i.e. by EVERY producer
        // including the soloist which runs first). Lets the soloist bias toward
        // b9/#9/#11/b13 over V7alt-family chords as a final-stage weight multiplier in
        // selectPitchAndDevices. See harmony-coordination.md P0 #8.
        //
        // NOTE the writer is the tick-preamble, NOT a producer, because the soloist
        // (the primary consumer) runs BEFORE the chords producer would have published.
        // The fields are pure functions of the current chord, so we don't need a
        // running producer to compute them — we publish them at the same time as
        // upcomingSectionFirstChord and isTurnaround (the other chord-preamble fields).
        // writer: tick-logic.ts (chord-data preamble, before producers run)
        // readable-after: chord-data preamble (any producer)
        isTensionChord: false,
        altPitchClasses: [] as number[],
    };
}

export function updateCoordinationContext(context: any, module: string, result: any): void {
    if (!result) {
        return;
    }

    switch (module) {
        case 'soloist': {
            const results = Array.isArray(result) ? result : [result];
            // Optimization: Replace filter/reduce/find chain with single loop to avoid allocations
            let sum = 0;
            let count = 0;
            let mainResult = null;

            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                if (r.midi > 0) {
                    sum += r.midi;
                    count++;
                    if (!mainResult || (!r.isDoubleStop && mainResult.isDoubleStop)) {
                        mainResult = r;
                    }
                }
            }

            if (mainResult) {
                context.soloistActive = true;
                context.soloistMidi = mainResult.midi;
                // why: sticky companion to soloistMidi — overwritten on every non-rest
                // soloist note. Paired with lastActiveSoloistStep so consumers can
                // age-cap a stale value (soloist who played one note then went silent
                // shouldn't steer harmony for the rest of the session).
                context.lastActiveSoloistMidi = mainResult.midi;
                context.lastActiveSoloistStep = context.step;
                if (mainResult.isBusy) {
                    context.soloistBusy = true;
                }

                // Calculate average for harmony slotting
                context.avgSoloistMidi = sum / count;
            }
            break;
        }
        case 'bass':
            if (result.midi > 0) {
                context.bassHit = true;
                context.bassMidi = result.midi;
            }
            break;
        case 'chords': {
            const notes = Array.isArray(result) ? result : [result];
            // Optimization: Replace map/filter/reduce chain with standard for loop to avoid intermediate array allocations
            const activeMidis: number[] = [];
            let sum = 0;
            for (let i = 0; i < notes.length; i++) {
                const m = notes[i].midi;
                if (m > 0) {
                    activeMidis.push(m);
                    sum += m;
                }
            }

            if (activeMidis.length > 0) {
                context.accompanimentHit = true;
                context.accompanimentMidis = activeMidis;
                context.avgChordMidi = sum / activeMidis.length;
            }
            break;
        }
    }
}

/**
 * Enforces the "Strict Register Slotting" rules defined in ENSEMBLE_COORDINATION.md.
 * If a note is outside its designated slot, it is transposed to the nearest octave within range.
 */
export function enforceRegisterSlotting(
    module: string,
    midi: number,
    _context: any,
    targetMidi: number | null = null,
): number {
    if (midi <= 0) {
        return midi;
    }

    switch (module) {
        case 'bass':
            // Bass: MIDI 23 to 57 (Supports 5-string Low B and melodic fills)
            return smoothOctaveClamp(midi, 23, 57, targetMidi);

        case 'chords':
        case 'harmony':
            // Chords/Harmony: 52 to 84 (when Bass is present/active)
            return smoothOctaveClamp(midi, 52, 84, targetMidi);

        case 'soloist':
            // Soloist: Priority 60 to 90, but has free range.
            // We clamp if it's hitting bass frequencies (now raised to 52).
            if (midi < 52) {
                return smoothOctaveClamp(midi, 60, 90, targetMidi);
            }
            return midi;

        default:
            return midi;
    }
}

function smoothOctaveClamp(
    midi: number,
    min: number,
    max: number,
    target: number | null = null,
): number {
    let current = midi;

    // If we have a target (e.g. previous note), try to get as close as possible
    // while staying within [min, max]
    if (target !== null) {
        // First get into range
        while (current < min) {
            current += 12;
        }
        while (current > max) {
            current -= 12;
        }

        // Then try to match target octave
        const octaves = [-12, 12];
        for (const shift of octaves) {
            const shifted = current + shift;
            if (shifted >= min && shifted <= max) {
                if (Math.abs(shifted - target) < Math.abs(current - target)) {
                    current = shifted;
                }
            }
        }
    } else {
        while (current < min) {
            current += 12;
        }
        while (current > max) {
            current -= 12;
        }
    }

    return Math.max(min, Math.min(max, current));
}
