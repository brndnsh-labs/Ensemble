/**
 * Centralized message types and schemas for Worker-Client communication.
 */

/** Message types sent from Main Thread to Worker. */
export const WORKER_MSG = {
    START: 'start',
    STOP: 'stop',
    SYNC_STATE: 'syncState',
    REQUEST_BUFFER: 'requestBuffer',
    FLUSH: 'flush',
    EXPORT: 'export',
    RESOLUTION: 'resolution',
} as const;

/** Message types sent from Worker to Main Thread. */
export const WORKER_RESP = {
    NOTES: 'notes',
    TICK: 'tick',
    EXPORT_COMPLETE: 'exportComplete',
    EXPORT_PROGRESS: 'exportProgress',
    ERROR: 'error',
} as const;

export interface WorkerNote {
    /** The engine module (bass, soloist, etc). */
    module: string;
    step: number;
    freq: number;
    midi: number;
    /** 0.0 - 1.0 */
    velocity: number;
    durationSteps: number;
    timingOffset?: number;
}

export interface NotesMessage {
    type: typeof WORKER_RESP.NOTES;
    notes: WorkerNote[];
    requestTimestamp: number;
    workerProcessTime: number;
}
