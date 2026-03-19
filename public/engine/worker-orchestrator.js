import { WORKER_MSG, WORKER_RESP } from '../worker-types.js';

/**
 * Shared state for the worker generative engines.
 * @type {{
 *   timerID: any,
 *   interval: number,
 *   bbBufferHead: number,
 *   sbBufferHead: number,
 *   cbBufferHead: number,
 *   hbBufferHead: number,
 *   mainCursor: { index: number, sectionIndex: number },
 *   lookaheadCursor: { index: number, sectionIndex: number },
 *   LOOKAHEAD: number,
 *   messageQueue: Array<{type: string, data: any, startTime: number}>
 * }}
 */
export const workerContext = {
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
};

/**
 * Resets all buffer heads and cursors to a specific step.
 * @param {number} step
 */
export function resetWorkerContext(step) {
    workerContext.bbBufferHead = step;
    workerContext.sbBufferHead = step;
    workerContext.cbBufferHead = step;
    workerContext.hbBufferHead = step;
    workerContext.mainCursor.index = 0;
    workerContext.mainCursor.sectionIndex = 0;
    workerContext.lookaheadCursor.index = 0;
    workerContext.lookaheadCursor.sectionIndex = 0;
}
