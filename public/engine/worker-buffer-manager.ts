import type { EnsembleState } from '../types.js';
import { WORKER_RESP } from '../worker-types.js';
import {
    foldPracticeStep,
    isInstrumentActiveAtStep,
    isInstrumentEverActive,
} from './section-overrides.js';
import { generateNotesForStep } from './tick-logic.js';
import { workerContext } from './worker-orchestrator.js';

export function fillBuffers(
    state: EnsembleState,
    currentStep: number,
    requestTimestamp: number | null = null,
    processStartTime: number | null = null,
): void {
    const targetStep = currentStep + workerContext.LOOKAHEAD;
    const notesToMain = [];

    if (workerContext.bbBufferHead < currentStep) {
        workerContext.bbBufferHead = currentStep;
    }
    if (workerContext.sbBufferHead < currentStep) {
        workerContext.sbBufferHead = currentStep;
    }
    if (workerContext.cbBufferHead < currentStep) {
        workerContext.cbBufferHead = currentStep;
    }
    if (workerContext.hbBufferHead < currentStep) {
        workerContext.hbBufferHead = currentStep;
    }

    // why: short-circuit the min so a globally-disabled-and-never-section-enabled
    // instrument doesn't drag the loop start back to its stale head. We still need
    // the per-step gate below to honor section overrides — this top-level test
    // just asks "is this instrument *ever* active in this chart?"
    const soloistCouldBeActive = isInstrumentEverActive(state, 'soloist');
    const bassCouldBeActive = isInstrumentEverActive(state, 'bass');
    const chordsCouldBeActive = isInstrumentEverActive(state, 'chords');
    const harmonyCouldBeActive = isInstrumentEverActive(state, 'harmony');
    const SENTINEL = Number.POSITIVE_INFINITY;
    let head = Math.min(
        bassCouldBeActive ? workerContext.bbBufferHead : SENTINEL,
        soloistCouldBeActive ? workerContext.sbBufferHead : SENTINEL,
        chordsCouldBeActive ? workerContext.cbBufferHead : SENTINEL,
        harmonyCouldBeActive ? workerContext.hbBufferHead : SENTINEL,
    );
    if (!Number.isFinite(head)) {
        head = currentStep;
    }

    while (head < targetStep) {
        const step = head;

        // #1016 — section practice. `step` stays monotonic (the buffer key, and
        // the per-instrument buffer-head bookkeeping below), but the *musical*
        // position folds into the active drill window so the drilled section
        // keeps generating instead of running past into the next section. When
        // no loop is active, `musicalStep === step` and everything below is
        // byte-identical to normal playback. Notes are re-stamped back to the
        // monotonic `step` before crossing to the main thread so the scheduler
        // (which schedules by monotonic step) matches them.
        const musicalStep = foldPracticeStep(step, state.playback);

        const soloistActive = isInstrumentActiveAtStep(state, 'soloist', musicalStep);
        const bassActive = isInstrumentActiveAtStep(state, 'bass', musicalStep);
        const chordsActive = isInstrumentActiveAtStep(state, 'chords', musicalStep);
        const harmonyActive = isInstrumentActiveAtStep(state, 'harmony', musicalStep);

        const tickResult = generateNotesForStep(
            state,
            musicalStep,
            {
                mainCursor: workerContext.mainCursor,
                lookaheadCursor: workerContext.lookaheadCursor,
            },
            {
                includeSoloist: soloistActive && step >= workerContext.sbBufferHead,
                includeBass: bassActive && step >= workerContext.bbBufferHead,
                includeChords: chordsActive && step >= workerContext.cbBufferHead,
                includeHarmony: harmonyActive && step >= workerContext.hbBufferHead,
                includeDrums: false, // Drums are handled by synth-drums in live engine
                // #842: the worker has only a stale default conductor, so bar-latch
                // the drum-motif intensity (the Kick/Snare probe bass locks to must
                // match the audible kit, which is bar-stable on the main thread).
                noLiveConductor: true,
            },
            // Thread sticky soloist position across ticks so harmony can read it on
            // stab steps where the soloist itself is resting. Paired with step so
            // consumers can age-cap stale values.
            {
                lastActiveSoloistMidi: workerContext.lastActiveSoloistMidi,
                lastActiveSoloistStep: workerContext.lastActiveSoloistStep,
            },
        );

        // Persist sticky carryover for the next tick (only when the soloist
        // actually ran on this tick — otherwise the context's value is the
        // seeded carryover, identity-preserving).
        if (tickResult.coordination?.lastActiveSoloistMidi) {
            workerContext.lastActiveSoloistMidi = tickResult.coordination.lastActiveSoloistMidi;
            workerContext.lastActiveSoloistStep = tickResult.coordination.lastActiveSoloistStep;
        }

        for (let i = 0; i < tickResult.notes.length; i++) {
            const note = tickResult.notes[i];
            // Re-stamp to the monotonic buffer key. `generateNotesForStep` tags
            // each note with the step it was *asked* for (the folded musicalStep
            // during a practice loop); the main thread buckets notes by `n.step`
            // and schedules by the monotonic step, so key them monotonically.
            // No-op when not looping (musicalStep === step). (#1016)
            if (musicalStep !== step) {
                note.step = step;
            }
            notesToMain.push(note);
        }

        // A head records the next step to *consider*, not the next active step.
        // Pinning it through a force-off section makes the next fill regenerate
        // that entire gap and can replay stale notes when the lane turns on. Lanes
        // that can never sound are excluded from `head` above; every other lane
        // advances across both active and inactive steps.
        if (soloistCouldBeActive && step >= workerContext.sbBufferHead) {
            workerContext.sbBufferHead = step + 1;
        }
        if (bassCouldBeActive && step >= workerContext.bbBufferHead) {
            workerContext.bbBufferHead = step + 1;
        }
        if (chordsCouldBeActive && step >= workerContext.cbBufferHead) {
            workerContext.cbBufferHead = step + 1;
        }
        if (harmonyCouldBeActive && step >= workerContext.hbBufferHead) {
            workerContext.hbBufferHead = step + 1;
        }

        head++;
    }

    const workerProcessTime = processStartTime ? performance.now() - processStartTime : 0;
    if (notesToMain.length > 0) {
        postMessage({
            type: WORKER_RESP.NOTES,
            notes: notesToMain,
            requestTimestamp,
            workerProcessTime,
        });
    }
}
