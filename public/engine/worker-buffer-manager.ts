import type { EnsembleState } from '../types.js';
import { WORKER_RESP } from '../worker-types.js';
import { isInstrumentActiveAtStep } from './section-overrides.js';
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
    const { chords, bass, soloist, harmony, arranger } = state;
    const couldBeActive = (
        key: 'groove' | 'bass' | 'chords' | 'harmony' | 'soloist',
        globalEnabled: boolean,
    ): boolean => {
        if (globalEnabled) {
            return true;
        }
        const sections = arranger?.sections;
        if (!sections) {
            return false;
        }
        for (const s of sections) {
            if (s.instruments?.[key] === true) {
                return true;
            }
        }
        return false;
    };
    const SENTINEL = Number.POSITIVE_INFINITY;
    let head = Math.min(
        couldBeActive('bass', bass.enabled) ? workerContext.bbBufferHead : SENTINEL,
        couldBeActive('soloist', soloist.enabled) ? workerContext.sbBufferHead : SENTINEL,
        couldBeActive('chords', chords.enabled) ? workerContext.cbBufferHead : SENTINEL,
        couldBeActive('harmony', harmony.enabled) ? workerContext.hbBufferHead : SENTINEL,
    );
    if (!Number.isFinite(head)) {
        head = currentStep;
    }

    while (head < targetStep) {
        const step = head;

        const soloistActive = isInstrumentActiveAtStep(state, 'soloist', step);
        const bassActive = isInstrumentActiveAtStep(state, 'bass', step);
        const chordsActive = isInstrumentActiveAtStep(state, 'chords', step);
        const harmonyActive = isInstrumentActiveAtStep(state, 'harmony', step);

        const tickResult = generateNotesForStep(
            state,
            step,
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
            notesToMain.push(tickResult.notes[i]);
        }

        // why: advance each buffer head only when the instrument was active at
        // this step. Advancing unconditionally would burn past steps for a
        // currently-muted instrument, so when it later re-enables (global toggle
        // OR a section override flipping on) the next REQUEST_BUFFER would have
        // nothing to fill from the missed window. Per-instrument tracking keeps
        // the buffer head as the "last step we considered for this instrument"
        // — inactive steps simply leave the head pinned, ready to resume.
        if (soloistActive && step >= workerContext.sbBufferHead) {
            workerContext.sbBufferHead++;
        }
        if (bassActive && step >= workerContext.bbBufferHead) {
            workerContext.bbBufferHead++;
        }
        if (chordsActive && step >= workerContext.cbBufferHead) {
            workerContext.cbBufferHead++;
        }
        if (harmonyActive && step >= workerContext.hbBufferHead) {
            workerContext.hbBufferHead++;
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
