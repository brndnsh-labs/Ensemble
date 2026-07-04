import { getState, getSyncState } from './state.js';
import type { EnsembleState } from './types.js';
import { WORKER_MSG, WORKER_RESP } from './worker-types.js';

const FILENAME_CLEANUP_PATTERN = /[^a-zA-Z0-9\s\-_()]/g;
const MIDI_EXTENSION_PATTERN = /\.midi?$/i;

let timerWorker: Worker | null = null;
let schedulerRequestHandler: (() => void) | null = null;
let notesReceivedHandler:
    | ((
          notes: unknown[],
          requestTimestamp: number,
          workerProcessTime: number,
          isResolution: boolean,
      ) => void)
    | null = null;
let exportProgressHandler: ((progress: number) => void) | null = null;

export const getTimerWorker = (): Worker | null => timerWorker;

export function setExportProgressHandler(handler: (progress: number) => void): void {
    exportProgressHandler = handler;
}

export function initWorker(
    onSchedulerRequest: () => void,
    onNotesReceived: (
        notes: unknown[],
        requestTimestamp: number,
        workerProcessTime: number,
        isResolution: boolean,
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

    timerWorker.onmessage = (e) => {
        const { type, notes, data, requestTimestamp, workerProcessTime } = e.data;
        if (type === WORKER_RESP.TICK) {
            if (typeof schedulerRequestHandler === 'function') {
                schedulerRequestHandler();
            }
        } else if (type === WORKER_RESP.NOTES) {
            if (typeof notesReceivedHandler === 'function') {
                notesReceivedHandler(
                    notes,
                    requestTimestamp,
                    workerProcessTime,
                    e.data.isResolution,
                );
            }
        } else if (type === WORKER_RESP.EXPORT_PROGRESS) {
            if (typeof exportProgressHandler === 'function') {
                exportProgressHandler(e.data.progress);
            }
        } else if (type === WORKER_RESP.ERROR) {
            console.error('[Worker Error]', data);
        } else if (type === WORKER_RESP.EXPORT_COMPLETE) {
            if (typeof exportProgressHandler === 'function') {
                exportProgressHandler(1.0); // Ensure 100%
            }
            const { blob, filename } = e.data;
            const url = URL.createObjectURL(new Blob([blob], { type: 'audio/midi' }));
            const a = document.createElement('a');
            a.href = url;

            // Sanitize filename (Defense in Depth)
            // Optimization: Use module constants for filename cleanup to reduce regex recompilation overhead
            let safeName = (filename || 'ensemble-export').replace(MIDI_EXTENSION_PATTERN, '');
            safeName =
                safeName.replace(FILENAME_CLEANUP_PATTERN, '').substring(0, 64).trim() ||
                'ensemble-export';

            a.download = `${safeName}.mid`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };
}

export function startExport(options: Record<string, unknown>): void {
    if (timerWorker) {
        timerWorker.postMessage({ type: WORKER_MSG.EXPORT, data: options });
    }
}

export function startWorker(): void {
    if (timerWorker) {
        timerWorker.postMessage({ type: WORKER_MSG.START });
    }
}

export function stopWorker(): void {
    if (timerWorker) {
        timerWorker.postMessage({ type: WORKER_MSG.STOP });
    }
}

/**
 * Deeply unwrap proxy/signal objects into plain objects.
 * Much faster than JSON.parse(JSON.stringify(val)).
 */
function toRaw(val: unknown): unknown {
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
        return arr;
    }
    if (val instanceof Set) {
        return new Set(Array.from(val).map(toRaw));
    }
    if (val instanceof Map) {
        return new Map(Array.from(val.entries()).map(([k, v]) => [k, toRaw(v)]));
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
    return raw;
}

export function flushWorker(step: number, syncData: unknown = null): void {
    if (timerWorker) {
        timerWorker.postMessage({
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
        timerWorker.postMessage({
            type: WORKER_MSG.REQUEST_BUFFER,
            data: { step, requestTimestamp: performance.now() },
        });
    }
}

export function requestResolution(step: number): void {
    if (timerWorker) {
        timerWorker.postMessage({
            type: WORKER_MSG.RESOLUTION,
            data: { step, requestTimestamp: performance.now() },
        });
    }
}

// The SET_PARAM / SET_STYLE / SET_VOLUME / SET_OCTAVE deltas all write a *partial*
// of one module's slice, keyed by a runtime module name carried on the payload.
// Funnel that one unavoidable dynamic-key write through here so the call sites stay
// cast-free and the key is narrowed to the synced module set (`keyof EnsembleState`)
// in a single place. The written object is identical to the old inline assignment —
// worker delta payloads are byte-for-byte unchanged (#816).
function setModuleDelta(
    data: Partial<Record<keyof EnsembleState, unknown>>,
    module: keyof EnsembleState,
    patch: Record<string, unknown>,
): void {
    data[module] = patch;
}

export function syncWorker(action?: string, payload?: any): void {
    if (!timerWorker) {
        return;
    }
    const { arranger, chords, soloist, harmony, groove, playback } = getState();

    const data: Partial<Record<keyof EnsembleState, any>> = {};

    if (!action) {
        // Full Sync
        timerWorker.postMessage({ type: WORKER_MSG.SYNC_STATE, data: toRaw(getSyncState()) });
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
            // NOTE: this delta forwards the flat payload as-is; nested session
            // fields (`session.seed`, `session.hook` — #555) are NOT re-routed here
            // and ride the full snapshot/flush (getSyncState) at play-start instead,
            // not this delta. See getSyncState() + recursiveSafeSync.
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
            data.soloist = { hookRetentionProb: soloist.hookRetentionProb };
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
        case 'LOOP_BOUNDARY':
            // Main thread is the canonical writer of playback.currentLoopCount;
            // pushed to the worker each time the scheduler crosses a chorus boundary.
            data.playback = { currentLoopCount: playback.currentLoopCount };
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
        timerWorker.postMessage({ type: WORKER_MSG.SYNC_STATE, data: toRaw(data) });
    }
}
