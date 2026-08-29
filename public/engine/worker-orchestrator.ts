import type { EnsembleState } from '../types.js';
import { resetCoordinationCarryover } from './coordination-engine.js';

interface WorkerCursor {
    index: number;
    sectionIndex: number;
}

export interface WorkerContext {
    timerID: any;
    interval: number;
    bbBufferHead: number;
    sbBufferHead: number;
    cbBufferHead: number;
    hbBufferHead: number;
    mainCursor: WorkerCursor;
    lookaheadCursor: WorkerCursor;
    LOOKAHEAD: number;
    state: EnsembleState | null;
    // why: sticky cross-tick coordination state (soloist's most recent non-rest MIDI
    // + the absolute step at which it was written). Lives here because the per-tick
    // coordination context is recreated each call to generateNotesForStep — without
    // this carryover the harmony spectral-gap branch (in finalizeHarmonyNotes) would
    // essentially never fire. The step is paired so consumers can age-cap the value.
    lastActiveSoloistMidi: number;
    lastActiveSoloistStep: number;
}

export const workerContext: WorkerContext = {
    timerID: null,
    interval: 25,
    bbBufferHead: 0,
    sbBufferHead: 0,
    cbBufferHead: 0,
    hbBufferHead: 0,
    mainCursor: { index: 0, sectionIndex: 0 },
    lookaheadCursor: { index: 0, sectionIndex: 0 },
    LOOKAHEAD: 64,
    state: null,
    lastActiveSoloistMidi: 0,
    lastActiveSoloistStep: 0,
};

export function getWorkerState(): EnsembleState | null {
    return workerContext.state;
}

export function resetWorkerContext(step: number): void {
    workerContext.bbBufferHead = step;
    workerContext.sbBufferHead = step;
    workerContext.cbBufferHead = step;
    workerContext.hbBufferHead = step;
    workerContext.mainCursor.index = 0;
    workerContext.mainCursor.sectionIndex = 0;
    workerContext.lookaheadCursor.index = 0;
    workerContext.lookaheadCursor.sectionIndex = 0;
    // Clear sticky coordination — a fresh playback should not remember the prior session.
    resetCoordinationCarryover(workerContext);
}
