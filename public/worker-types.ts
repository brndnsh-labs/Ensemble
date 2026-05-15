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
