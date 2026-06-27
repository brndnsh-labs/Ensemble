import type { EnsembleState, Mutable } from '../types.js';
import { scrambleHash } from './hash-utils.js';
import { getSoloistNote } from './soloist.js';

/**
 * Phrase-first soloist engine — Slice 1 of the soloist re-architecture
 * (docs/design/soloist-phrase-first.md).
 *
 * Runs as a PARALLEL path to the legacy `getSoloistNote`, selected per-tick in
 * `tick-logic.ts` by the user-facing `soloist.phraseFirstSoloist` flag
 * (Settings → Performance Engine). Keeping it parallel means the legacy engine
 * stays the default and `main` remains shippable while this is built up
 * incrementally and auditioned by ear, one layer at a time.
 *
 * **Contract (matches `getSoloistNote`):** same argument list, returns
 * `null` | a note object (`{ midi, velocity, durationSteps, timingOffset, … }`,
 * `freq` is derived downstream), and it maintains `soloist.session.phrasing
 * .isResting` each tick (tick-logic publishes it to the coordination context so
 * bass/chords/harmony know whether the lead is breathing).
 *
 * **Build status — 2b (live development):** on top of 2a (theme + breath +
 * dramatic arc + chord-tone landing), the theme now *develops* — it sequences
 * progressively higher across loops (cumulative growth) and RETURNS to the head
 * on a cadence that scales with song length, so it stays recognizable rather
 * than wandering (design §6). Still to come: apex/money-note reach and op
 * variety (inversion, displacement), then voice-leading targeting, then full
 * expression (bends/vibrato, sparingly). With no seed it defers to the legacy
 * engine so the lead is never silent-by-bug.
 */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// --- Key / diatonic vocabulary (self-contained, like the rest of this engine) ---
// Note-name → pitch class, including the sharp spellings the arranger emits.
const KEY_PC: Record<string, number> = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
};
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]; // natural minor

// How far the line reaches, in *diatonic degrees*, at each development depth.
// depth 0 = the head (verbatim); then a third, a fifth, a sixth, a seventh as
// the cycle climbs to its climax. These are by-ear knobs — the shape (returns
// to 0, grows monotonically) is what matters, not the exact intervals.
const DEPTH_DEGREES = [0, 2, 4, 5, 6];

/**
 * Transpose a MIDI note UP by `degrees` scale degrees within the given key,
 * preserving melodic contour (parallel diatonic motion — the classic
 * "sequence" that keeps a restated idea recognizably the same). A non-scale
 * source note snaps onto the scale, which only helps keep development in key.
 * Folds down an octave if it would climb out of a singable register; the
 * downstream `enforceRegisterSlotting` is the hard backstop.
 */
function diatonicTranspose(
    midi: number,
    degrees: number,
    keyRootPc: number,
    isMinor: boolean,
): number {
    if (degrees <= 0) {
        return midi;
    }
    const steps = isMinor ? MINOR_STEPS : MAJOR_STEPS;
    const len = steps.length;
    const relPc = (((midi - keyRootPc) % 12) + 12) % 12;
    // Index of the scale degree at or just below this pitch class.
    let idx = 0;
    for (let i = 0; i < len; i++) {
        if (steps[i] <= relPc) {
            idx = i;
        } else {
            break;
        }
    }
    const targetIdx = idx + degrees;
    const octaveShift = Math.floor(targetIdx / len);
    const wrapped = ((targetIdx % len) + len) % len;
    const newRel = steps[wrapped] + octaveShift * 12;
    let result = midi - relPc + newRel;
    if (result > 88) {
        result -= 12;
    }
    return Math.round(result);
}

/**
 * Snap a MIDI note to the nearest pitch class in `pcSet`, preserving register,
 * searching outward ±6 semitones, down-first on ties. Mirrors the legacy
 * file-local `snapMidiToPitchClasses` (soloist.ts); replicated here to keep the
 * parallel engine self-contained.
 */
function snapToNearestPc(midi: number, pcSet: Set<number>): number {
    const pc = ((midi % 12) + 12) % 12;
    if (pcSet.has(pc)) {
        return midi;
    }
    for (let d = 1; d <= 6; d++) {
        if (pcSet.has((((midi - d) % 12) + 12) % 12)) {
            return midi - d;
        }
        if (pcSet.has((((midi + d) % 12) + 12) % 12)) {
            return midi + d;
        }
    }
    return midi;
}

export function getSoloistNotePhraseFirst(
    state: EnsembleState,
    currentChord: any,
    nextChord: any,
    step: number,
    prevFreq: number | null,
    octave: number,
    style: string,
    stepInChord: number,
    coordination: any = {},
    stepInfo: any = null,
): any {
    const { playback, soloist, arranger } = state;

    // No harmony to play against → nothing to do (matches legacy contract).
    if (!currentChord) {
        return null;
    }

    // Build 2a only knows how to perform a stated theme. Without a seed (the
    // brief pre-seed window, or a genre that produced none) defer to the proven
    // legacy engine so the soloist is never silent-by-bug.
    const seed = soloist.session.seed;
    if (!seed?.notes?.length) {
        return getSoloistNote(
            state,
            currentChord,
            nextChord,
            step,
            prevFreq,
            octave,
            style,
            stepInChord,
            coordination,
            stepInfo,
        );
    }

    const phr = soloist.session.phrasing as Mutable<typeof soloist.session.phrasing>;
    const loopLen = seed.loopLengthSteps || 64;

    // --- Find the theme (seed) note(s) at this step, wrapping per loop window ---
    const stepInLoop = ((step % loopLen) + loopLen) % loopLen;
    const here = seed.notes.filter((n: any) => {
        if (step < 0 && n.step === step) {
            return true; // pickup notes live at negative steps
        }
        return ((n.step % loopLen) + loopLen) % loopLen === stepInLoop;
    });

    // No theme note scheduled here → this is breath. Silence is a choice, not a
    // gap to fill: rest and let the band answer.
    if (here.length === 0) {
        phr.isResting = true; // @worker-mutation
        return null;
    }

    const primary = here[0];
    const isAnchor = here.some((n: any) => n?.isAnchor);

    // --- Dramatic arc → how active the lead is right now (0..1) ---
    // Two deliberately simple contributions (tuned by ear in later builds):
    //   • entrance: the lead enters sparse and opens up over the first few
    //     loops, the way a player eases into a tune rather than charging in.
    //   • within-form swell: a gentle rise toward the middle of each form pass
    //     and a settle at its edges, so every pass breathes as an arc.
    const loopCount = playback.currentLoopCount ?? -1;
    const loopLift = Math.min(Math.max(loopCount, 0), 4) * 0.14; // builds over ~4 loops
    const totalSteps = arranger.totalSteps > 0 ? arranger.totalSteps : loopLen;
    const arcPos =
        totalSteps > 0 ? (((step % totalSteps) + totalSteps) % totalSteps) / totalSteps : 0;
    const formSwell = 0.25 * Math.sin(Math.PI * arcPos); // 0 at edges, peak mid-form
    // 0.30 floor keeps the theme's bones audible even at the sparsest.
    const activity = clamp01(0.3 + loopLift + formSwell);

    // --- Motivic development: cumulative-but-anchored, with theme return ---
    // The idea GROWS across loops (the line sequences progressively higher) but
    // periodically RETURNS to the head so it stays recognizable — the recurrence
    // that makes a solo feel composed rather than wandering (design §6).
    //   • `depth` rises 0→peak across a rise-and-resolve cycle, then resets to 0
    //     at the top of the next cycle (the theme return). depth 0 = verbatim head.
    //   • The cycle PERIOD scales with song length: short loops come home sooner,
    //     long forms earn more departure before re-grounding.
    //   • Keyed on `loopCount` (integer) so the transposition only ever changes at
    //     a loop boundary — a clean musical seam, never a mid-phrase pitch jump.
    // Cumulative: depth d transposes by a stable monotonic amount, so each deeper
    // loop contains the prior loop's reach plus more. Anchored: contour is
    // preserved exactly by diatonic transposition and the reach is bounded — that
    // bound IS the similarity leash (growth, not drift).
    const c = Math.max(loopCount, 0);
    const cyclePeriod = Math.min(Math.max(3 + Math.floor(loopLen / 128), 3), 6);
    const developmentDepth = c % cyclePeriod;
    const liftDegrees = DEPTH_DEGREES[Math.min(developmentDepth, DEPTH_DEGREES.length - 1)];
    const keyRootPc = KEY_PC[arranger.key] ?? 0;
    const keyIsMinor = Boolean(arranger.isMinor);

    // --- Breath via density gate ---
    // Anchors (the theme's structural skeleton) always sound — they ARE the
    // melody. Non-anchor ornament notes only fill in as the arc opens up, so
    // quiet passages stay spacious and energetic ones fill in. The gate is a
    // deterministic per-(step,loop) hash so loops stay reproducible.
    if (!isAnchor) {
        const gate = scrambleHash(step * 7 + Math.max(loopCount, 0) * 131 + 17);
        if (gate > activity) {
            phr.isResting = true; // @worker-mutation
            return null;
        }
    }

    // --- Pitch: develop the theme, then LAND with intention on strong beats ---
    // Sequence the stated theme up by the cycle's current reach (verbatim at
    // depth 0 / theme-return loops), preserving its contour so it stays the same
    // idea, climbing higher.
    let midi = diatonicTranspose(primary.midi, liftDegrees, keyRootPc, keyIsMinor);
    const isDownbeat = stepInfo
        ? Boolean(stepInfo.isDownbeat || stepInfo.isMeasureStart)
        : stepInChord === 0;
    if (isDownbeat) {
        // On the strongest beat, snap the landing to the nearest chord tone so
        // the phrase resolves onto the harmony rather than passing over it.
        // (Approach/voice-leading on weak beats arrives in a later build.)
        const root = ((currentChord.rootMidi % 12) + 12) % 12;
        const intervals: number[] = currentChord.intervals || [0, 4, 7];
        const chordPcs = new Set<number>(intervals.map((i) => (((root + i) % 12) + 12) % 12));
        midi = snapToNearestPc(midi, chordPcs);
    }

    // --- Dynamics follow the arc: softer when sparse, fuller toward the peak ---
    const velocity = clamp01((primary.velocity ?? 0.8) * (0.7 + 0.3 * activity));

    phr.isResting = false; // @worker-mutation
    return {
        midi,
        velocity,
        durationSteps: primary.durationSteps ?? 2,
        timingOffset: primary.timingOffset ?? 0,
        bendStartInterval: 0,
        vibrato: false,
        isDoubleStop: false,
    };
}
