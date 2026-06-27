import type { EnsembleState } from '../types.js';
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
 * **Contract (must match `getSoloistNote` exactly):** same argument list, same
 * return union (`null` | a note object | an array of note objects, each with
 * `.freq` or `.midi`), and the same `soloist.session.*` mutations the
 * tick-logic post-call block reads back this same tick (it publishes
 * `soloistResting`, `soloistNotesInPhrase`, `sharedHookBuffer`, `seed` into the
 * coordination context for bass/chords/harmony).
 *
 * **Build status:** scaffold only. This delegates to the legacy engine so
 * toggling it on is behavior-identical and safe. Subsequent builds replace the
 * body with the phrase-first pipeline — arc → phrase planner (breath +
 * self-answer) → live motivic development → harmonic-target grammar →
 * voice-leading realizer → expression. Each layer ships behind this same flag
 * and is auditioned before the next.
 */
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
    // Build 1: behavior-identical passthrough. The phrase-first pipeline lands
    // here in subsequent builds; the legacy call keeps the session-state
    // contract intact in the meantime.
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
