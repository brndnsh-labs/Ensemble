import { getState, getSyncState } from './state.js';
import {
    WORKER_MSG,
    WORKER_RESP,
    type WorkerExportOptions,
    type WorkerRequest,
    type WorkerResponse,
    type WorkerSyncData,
} from './worker-types.js';

const FILENAME_CLEANUP_PATTERN = /[^a-zA-Z0-9\s\-_()]/g;
const MIDI_EXTENSION_PATTERN = /\.midi?$/i;

let timerWorker: Worker | null = null;
let schedulerRequestHandler: (() => void) | null = null;
let notesReceivedHandler:
    | ((
          notes: unknown[],
          requestTimestamp: number | null,
          workerProcessTime: number,
          isResolution: true | undefined,
      ) => void)
    | null = null;
let exportProgressHandler: ((progress: number) => void) | null = null;

export const getTimerWorker = (): Worker | null => timerWorker;

function postWorkerRequest(message: WorkerRequest): void {
    timerWorker?.postMessage(message);
}

export function setExportProgressHandler(handler: (progress: number) => void): void {
    exportProgressHandler = handler;
}

export function initWorker(
    onSchedulerRequest: () => void,
    onNotesReceived: (
        notes: unknown[],
        requestTimestamp: number | null,
        workerProcessTime: number,
        isResolution: true | undefined,
    ) => void,
): void {
    if (timerWorker) {
        schedulerRequestHandler = onSchedulerRequest;
        notesReceivedHandler = onNotesReceived;
        return;
    }

    schedulerRequestHandler = onSchedulerRequest;
    notesReceivedHandler = onNotesReceived;

    timerWorker = new Worker(new URL('./logic-worker.ts', import.meta.url), { type: 'module' });

    timerWorker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const message = e.data;
        switch (message.type) {
            case WORKER_RESP.TICK:
                if (typeof schedulerRequestHandler === 'function') {
                    schedulerRequestHandler();
                }
                break;
            case WORKER_RESP.NOTES:
                if (typeof notesReceivedHandler === 'function') {
                    notesReceivedHandler(
                        message.notes,
                        message.requestTimestamp,
                        message.workerProcessTime,
                        message.isResolution,
                    );
                }
                break;
            case WORKER_RESP.EXPORT_PROGRESS:
                if (typeof exportProgressHandler === 'function') {
                    exportProgressHandler(message.progress);
                }
                break;
            case WORKER_RESP.ERROR:
                console.error('[Worker Error]', message.data);
                break;
            case WORKER_RESP.EXPORT_COMPLETE: {
                if (typeof exportProgressHandler === 'function') {
                    exportProgressHandler(1.0); // Ensure 100%
                }
                const url = URL.createObjectURL(new Blob([message.blob], { type: 'audio/midi' }));
                const a = document.createElement('a');
                a.href = url;

                // Sanitize filename (Defense in Depth)
                // Optimization: Use module constants for filename cleanup to reduce regex recompilation overhead
                let safeName = (message.filename || 'ensemble-export').replace(
                    MIDI_EXTENSION_PATTERN,
                    '',
                );
                safeName =
                    safeName.replace(FILENAME_CLEANUP_PATTERN, '').substring(0, 64).trim() ||
                    'ensemble-export';

                a.download = `${safeName}.mid`;
                a.click();
                URL.revokeObjectURL(url);
                break;
            }
            default: {
                const exhaustive: never = message;
                void exhaustive;
            }
        }
    };
}

export function startExport(options: WorkerExportOptions): void {
    if (timerWorker) {
        postWorkerRequest({ type: WORKER_MSG.EXPORT, data: options });
    }
}

export function startWorker(): void {
    if (timerWorker) {
        postWorkerRequest({ type: WORKER_MSG.START });
    }
}

export function stopWorker(): void {
    if (timerWorker) {
        postWorkerRequest({ type: WORKER_MSG.STOP });
    }
}

/**
 * Deeply unwrap proxy/signal objects into plain objects.
 * Much faster than JSON.parse(JSON.stringify(val)).
 */
function toRaw<T>(val: T): T {
    if (val === null || typeof val !== 'object') {
        return val;
    }
    if (Array.isArray(val)) {
        const arr = new Array(val.length);
        for (let i = 0; i < val.length; i++) {
            const rawVal = toRaw(val[i]);
            // JSON.stringify converts undefined in arrays to null
            arr[i] = rawVal === undefined ? null : rawVal;
        }
        return arr as T;
    }
    if (val instanceof Set) {
        return new Set(Array.from(val).map(toRaw)) as T;
    }
    if (val instanceof Map) {
        return new Map(Array.from(val.entries()).map(([k, v]) => [k, toRaw(v)])) as T;
    }
    const raw: Record<string, unknown> = {};
    const obj = val as Record<string, unknown>;
    for (const key in obj) {
        if (Object.hasOwn(obj, key)) {
            const rawVal = toRaw(obj[key]);
            // JSON.stringify drops undefined values in objects
            if (rawVal !== undefined) {
                raw[key] = rawVal;
            }
        }
    }
    return raw as T;
}

export function flushWorker(step: number, syncData: WorkerSyncData | null = null): void {
    if (timerWorker) {
        postWorkerRequest({
            type: WORKER_MSG.FLUSH,
            data: {
                step,
                syncData: toRaw(syncData),
                requestTimestamp: performance.now(),
            },
        });
    }
}

export function requestBuffer(step: number): void {
    if (timerWorker) {
        postWorkerRequest({
            type: WORKER_MSG.REQUEST_BUFFER,
            data: { step, requestTimestamp: performance.now() },
        });
    }
}

export function requestResolution(step: number): void {
    if (timerWorker) {
        postWorkerRequest({
            type: WORKER_MSG.RESOLUTION,
            data: { step, requestTimestamp: performance.now() },
        });
    }
}

// The SET_PARAM / SET_STYLE / SET_VOLUME / SET_OCTAVE deltas all write a *partial*
// of one module's slice, keyed by a runtime module name carried on the payload.
// Funnel that one unavoidable dynamic-key write through here so the call sites stay
// cast-free and the key is narrowed to the worker-safe snapshot's slice set
// in a single place. The written object is identical to the old inline assignment —
// worker delta payloads are byte-for-byte unchanged (#816).
function setModuleDelta(
    data: WorkerSyncData,
    module: keyof WorkerSyncData,
    patch: WorkerSyncData[keyof WorkerSyncData],
): void {
    Object.assign(data, { [module]: patch });
}

export function syncWorker(action?: string, payload?: any): void {
    if (!timerWorker) {
        return;
    }
    const { arranger, chords, harmony, groove, playback } = getState();

    const data: WorkerSyncData = {};

    if (!action) {
        // Full Sync
        postWorkerRequest({ type: WORKER_MSG.SYNC_STATE, data: toRaw(getSyncState()) });
        return;
    }

    // Delta Sync
    switch (action) {
        case 'SET_BAND_INTENSITY':
            data.playback = { bandIntensity: playback.bandIntensity };
            break;
        case 'SET_COMPLEXITY':
            data.playback = { complexity: playback.complexity };
            data.harmony = { complexity: harmony.complexity };
            break;
        case 'SET_AUTO_INTENSITY':
            data.playback = { autoIntensity: playback.autoIntensity };
            break;
        case 'UPDATE_HB':
            data.harmony = payload;
            break;
        case 'UPDATE_SB':
            // NOTE: this delta forwards the flat payload as-is; the nested session
            // seed (`session.seed`) is NOT re-routed here and rides the full
            // snapshot/flush (getSyncState) at play-start instead, not this delta.
            // See getSyncState() + recursiveSafeSync.
            data.soloist = payload;
            break;
        case 'UPDATE_GB':
            data.groove = payload;
            break;
        case 'SET_PARAM':
            if (payload.module) {
                setModuleDelta(data, payload.module, { [payload.param]: payload.value });
            }
            break;
        case 'UPDATE_CONDUCTOR_DECISION':
            data.chords = { density: chords.density };
            data.playback = {
                conductorVelocity: playback.conductorVelocity,
                intent: playback.intent,
            };
            break;
        case 'SET_STYLE':
            if (payload.module) {
                setModuleDelta(data, payload.module, { style: payload.style });
            }
            break;
        case 'SET_VOLUME':
            if (payload.module) {
                setModuleDelta(data, payload.module, { volume: payload.value });
            }
            break;
        case 'SET_INSTRUMENT_VOICE':
            // #698 — the chords voice drives NOTE GENERATION now (power-chord
            // voicing for the crunch rhythm guitar), so forward the changed lane's
            // voice to the worker live. The genre auto-follow effect dispatches
            // this per-lane on a genre change too, so this covers manual + auto.
            if (payload?.module) {
                setModuleDelta(data, payload.module, { voice: payload.voice });
            }
            break;
        case 'SET_OCTAVE':
            if (payload.module) {
                setModuleDelta(data, payload.module, { octave: payload.value });
            }
            break;
        case 'SET_MIDI_CONFIG':
            data.midi = payload;
            break;
        case 'SET_GENRE_FEEL':
            data.groove = {
                genreFeel: groove.genreFeel,
                swing: groove.swing,
                swingSub: groove.swingSub,
                sectionSeedMap: groove.sectionSeedMap,
            };
            break;
        case 'SET_SWING':
            data.groove = { swing: payload };
            break;
        case 'SET_SWING_SUB':
            data.groove = { swingSub: payload };
            break;
        case 'SET_SESSION_STEPS':
            data.soloist = { sessionSteps: payload };
            break;
        case 'SET_SOLOIST_MODE':
            data.soloist = { mode: payload };
            break;
        case 'SET_BPM':
            data.playback = { bpm: playback.bpm };
            break;
        case 'SET_SESSION_TIMER':
            data.playback = { sessionTimer: payload };
            break;
        case 'TOGGLE_PLAY':
            // Ensure session start time is synced when play starts
            data.playback = {
                isPlaying: playback.isPlaying,
                sessionStartTime: playback.sessionStartTime,
            };
            break;
        case 'SET_PRACTICE_LOOP':
            // #1016 — cross the section-practice loop bounds to the worker so
            // fillBuffers folds its fill within [loopStartStep, loopEndStep).
            // Sent on both set and clear (clear = -1/-1).
            data.playback = {
                loopStartStep: playback.loopStartStep,
                loopEndStep: playback.loopEndStep,
            };
            break;
        case 'LOOP_BOUNDARY':
            // Main thread is the canonical writer of playback.currentLoopCount;
            // pushed to the worker each time the scheduler crosses a chorus boundary.
            data.playback = { currentLoopCount: playback.currentLoopCount };
            break;
        case 'SET_ENDING_PENDING':
            // #993 — the worker reads this for ending-anticipation gestures
            // (harmony thickening, drum final-measure flourish); without this
            // delta the anticipation window ran on a stale `false`.
            data.playback = { isEndingPending: playback.isEndingPending };
            break;
        case 'SET_SONG_MODE':
            data.playback = { songMode: playback.songMode };
            break;
        case 'ARRANGER_UPDATE': // Custom action for large structural changes
            data.arranger = {
                progression: arranger.progression,
                stepMap: arranger.stepMap,
                sectionMap: arranger.sectionMap,
                totalSteps: arranger.totalSteps,
                key: arranger.key,
                isMinor: arranger.isMinor,
                timeSignature: arranger.timeSignature,
            };
            break;
        // No `case 'SET_SONG_SEED'`: arranger.seed is main-thread-only.
        // See docs/guides/WORKER_CONTRACT.md §8 (Main-Thread-Only Synced Fields).
    }

    if (Object.keys(data).length > 0) {
        // DeepSignal proxies cannot be cloned by structuredClone (postMessage).
        // We strip them by converting to a plain JSON object.
        postWorkerRequest({ type: WORKER_MSG.SYNC_STATE, data: toRaw(data) });
    }
}
