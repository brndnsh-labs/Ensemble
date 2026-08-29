/**
 * Centralized message types and schemas for Worker-Client communication.
 */

import type { NoteResult } from './engine/tick-logic.js';
import type { getSyncState } from './state.js';

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

/** Exact worker-safe state shape, excluding main-thread and worker-owned scratch fields. */
export type WorkerSyncSnapshot = ReturnType<typeof getSyncState>;

type WorkerSoloistSyncData = Partial<WorkerSyncSnapshot['soloist']> & {
    /**
     * Preserved ignored legacy delta. The canonical snapshot keeps this under
     * `session`; the worker does not consume this flat form, and no ACTIONS entry
     * currently dispatches it.
     */
    sessionSteps?: WorkerSyncSnapshot['soloist']['session']['sessionSteps'];
};

/** Slice-level delta shape accepted by `syncState`; keys still come from the snapshot contract. */
export type WorkerSyncData = {
    [Slice in keyof WorkerSyncSnapshot]?: Slice extends 'soloist'
        ? WorkerSoloistSyncData
        : Partial<WorkerSyncSnapshot[Slice]>;
};

export interface WorkerExportOptions {
    includedTracks?: string[];
    targetDuration?: number;
    loopMode?: string;
    filename?: string;
    /** Existing ShareModal fields forwarded unchanged; the MIDI worker ignores them. */
    includeSolo?: boolean;
    includeBass?: boolean;
    includeChords?: boolean;
    includeHarmony?: boolean;
    includeDrums?: boolean;
    numLoops?: number;
    addEnding?: boolean;
    autoplay?: boolean;
}

/** Messages sent from the main thread to the logic worker. */
export type WorkerRequest =
    | { type: typeof WORKER_MSG.START }
    | { type: typeof WORKER_MSG.STOP }
    | { type: typeof WORKER_MSG.SYNC_STATE; data: WorkerSyncData }
    | {
          type: typeof WORKER_MSG.REQUEST_BUFFER;
          data: { step: number; requestTimestamp: number };
      }
    | {
          type: typeof WORKER_MSG.FLUSH;
          data: {
              step: number;
              syncData: WorkerSyncData | null;
              requestTimestamp: number;
          };
      }
    | { type: typeof WORKER_MSG.EXPORT; data: WorkerExportOptions }
    | {
          type: typeof WORKER_MSG.RESOLUTION;
          data: { step: number; requestTimestamp: number };
      };

/** Messages sent from the logic worker to the main thread. */
export type WorkerResponse =
    | {
          type: typeof WORKER_RESP.NOTES;
          notes: NoteResult[];
          requestTimestamp: number | null;
          workerProcessTime: number;
          isResolution?: true;
      }
    | { type: typeof WORKER_RESP.TICK }
    | { type: typeof WORKER_RESP.EXPORT_PROGRESS; progress: number }
    | {
          type: typeof WORKER_RESP.EXPORT_COMPLETE;
          blob: Uint8Array<ArrayBuffer>;
          filename: string;
      }
    | { type: typeof WORKER_RESP.ERROR; data: string; stack?: string };

/** Typed worker-side chokepoint; native `postMessage` does not relate type to payload. */
export function postWorkerResponse(message: WorkerResponse): void {
    postMessage(message);
}
