/**
 * @fileoverview Centralized message types and schemas for Worker-Client communication.
 */

/**
 * Message types sent from Main Thread to Worker.
 * @enum {string}
 */
export const WORKER_MSG = {
    START: 'start',
    STOP: 'stop',
    SYNC_STATE: 'syncState',
    REQUEST_BUFFER: 'requestBuffer',
    FLUSH: 'flush',
    EXPORT: 'export',
    RESOLUTION: 'resolution',
};

/**
 * Message types sent from Worker to Main Thread.
 * @enum {string}
 */
export const WORKER_RESP = {
    NOTES: 'notes',
    TICK: 'tick',
    EXPORT_COMPLETE: 'exportComplete',
    EXPORT_PROGRESS: 'exportProgress',
    ERROR: 'error',
};

/**
 * @typedef {Object} WorkerNote
 * @property {string} module - The engine module (bass, soloist, etc).
 * @property {number} step - The global step index.
 * @property {number} freq - Frequency in Hz.
 * @property {number} midi - MIDI note number.
 * @property {number} velocity - Velocity (0.0 - 1.0).
 * @property {number} durationSteps - Duration in steps.
 * @property {number} [timingOffset] - Micro-timing offset in seconds.
 */

/**
 * @typedef {Object} NotesMessage
 * @property {string} type - Always WORKER_RESP.NOTES.
 * @property {WorkerNote[]} notes - The generated notes.
 * @property {number} requestTimestamp - Echoed from the request.
 * @property {number} workerProcessTime - Latency in ms.
 */
