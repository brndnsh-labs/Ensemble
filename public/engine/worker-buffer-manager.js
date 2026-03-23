import { WORKER_RESP } from '../worker-types.js';
import { generateNotesForStep } from './tick-logic.js';
import { workerContext } from './worker-orchestrator.js';

/**
 * Fills the note buffers for the next n steps ahead of the current step.
 * @param {import('../types.js').EnsembleState} state
 * @param {number} currentStep
 * @param {number|null} requestTimestamp
 * @param {number|null} processStartTime
 */
export function fillBuffers(state, currentStep, requestTimestamp = null, processStartTime = null) {
    const { chords, bass, soloist, harmony } = state;
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

    let head = Math.min(
        bass.enabled ? workerContext.bbBufferHead : 999999,
        soloist.enabled ? workerContext.sbBufferHead : 999999,
        chords.enabled ? workerContext.cbBufferHead : 999999,
        harmony.enabled ? workerContext.hbBufferHead : 999999,
    );
    if (head === 999999) {
        head = currentStep;
    }

    while (head < targetStep) {
        const step = head;

        const tickResult = generateNotesForStep(
            state,
            step,
            {
                mainCursor: workerContext.mainCursor,
                lookaheadCursor: workerContext.lookaheadCursor,
            },
            {
                includeSoloist: soloist.enabled && step >= workerContext.sbBufferHead,
                includeBass: bass.enabled && step >= workerContext.bbBufferHead,
                includeChords: chords.enabled && step >= workerContext.cbBufferHead,
                includeHarmony: harmony.enabled && step >= workerContext.hbBufferHead,
                includeDrums: false, // Drums are handled by synth-drums in live engine
            },
        );

        for (let i = 0; i < tickResult.notes.length; i++) {
            notesToMain.push(tickResult.notes[i]);
        }

        if (soloist.enabled && step >= workerContext.sbBufferHead) {
            workerContext.sbBufferHead++;
        }
        if (bass.enabled && step >= workerContext.bbBufferHead) {
            workerContext.bbBufferHead++;
        }
        if (chords.enabled && step >= workerContext.cbBufferHead) {
            workerContext.cbBufferHead++;
        }
        if (harmony.enabled && step >= workerContext.hbBufferHead) {
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
