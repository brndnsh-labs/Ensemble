import type { EnsembleState } from '../types.js';

interface WorkerCursor {
    index: number;
    sectionIndex: number;
}

interface WorkerMessageQueueItem {
    type: string;
    data: any;
    startTime: number;
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
    messageQueue: WorkerMessageQueueItem[];
    state: EnsembleState | null;
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
    messageQueue: [],
    state: null,
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
}
