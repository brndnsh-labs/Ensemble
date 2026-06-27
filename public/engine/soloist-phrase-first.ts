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
 * **Build status — 2a (first audible layer):** states the session-seed THEME,
 * breathes (real phrase-then-rest rather than constant filling), shapes a
 * simple dramatic ARC (enter sparse → open up over the song, swell within each
 * form pass), and LANDS chord tones on strong beats so phrases resolve onto the
 * harmony instead of wandering. It does not yet *develop* the theme — that
 * (live motivic development, then voice-leading targeting, then full
 * expression) is the next build. With no seed it defers to the legacy engine so
 * the lead is never silent-by-bug.
 */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

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

    // --- Pitch: state the theme, but LAND with intention on strong beats ---
    let midi = primary.midi;
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
