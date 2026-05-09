import { getState, getSyncState } from './state.js';
import { WORKER_MSG, WORKER_RESP } from './worker-types.js';

const FILENAME_CLEANUP_PATTERN = /[^a-zA-Z0-9\s\-_()]/g;
const MIDI_EXTENSION_PATTERN = /\.midi?$/i;

/** @type {Worker|null} */
let timerWorker = null;
/** @type {Function|null} */
let schedulerRequestHandler = null;
/** @type {Function|null} */
let notesReceivedHandler = null;
/** @type {Function|null} */
let exportProgressHandler = null;

export const getTimerWorker = () => timerWorker;

/** @param {Function} handler */
export function setExportProgressHandler(handler) {
    exportProgressHandler = handler;
}

/**
 * @param {Function} onSchedulerRequest
 * @param {Function} onNotesReceived
 */
export function initWorker(onSchedulerRequest, onNotesReceived) {
    if (timerWorker) {
        schedulerRequestHandler = onSchedulerRequest;
        notesReceivedHandler = onNotesReceived;
        return;
    }

    schedulerRequestHandler = onSchedulerRequest;
    notesReceivedHandler = onNotesReceived;

    // In production, WORKER_PATH is injected by esbuild --define
    const workerPath = typeof WORKER_PATH !== 'undefined' ? WORKER_PATH : 'logic-worker.js';
    timerWorker = new Worker(workerPath, { type: 'module' });

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

/** @param {any} options */
export function startExport(options) {
    if (timerWorker) {
        timerWorker.postMessage({ type: WORKER_MSG.EXPORT, data: options });
    }
}

export function startWorker() {
    if (timerWorker) {
        timerWorker.postMessage({ type: WORKER_MSG.START });
    }
}

export function stopWorker() {
    if (timerWorker) {
        timerWorker.postMessage({ type: WORKER_MSG.STOP });
    }
}

/**
 * Deeply unwrap proxy/signal objects into plain objects.
 * Much faster than JSON.parse(JSON.stringify(val)).
 * @param {any} val
 * @returns {any}
 */
function toRaw(val) {
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
    /** @type {Record<string, any>} */
    const raw = {};
    for (const key in val) {
        if (Object.hasOwn(val, key)) {
            const rawVal = toRaw(val[key]);
            // JSON.stringify drops undefined values in objects
            if (rawVal !== undefined) {
                raw[key] = rawVal;
            }
        }
    }
    return raw;
}

/**
 * @param {number} step
 * @param {any} [syncData]
 */
export function flushWorker(step, syncData = null) {
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

/** @param {number} step */
export function requestBuffer(step) {
    if (timerWorker) {
        timerWorker.postMessage({
            type: WORKER_MSG.REQUEST_BUFFER,
            data: { step, requestTimestamp: performance.now() },
        });
    }
}

/** @param {number} step */
export function requestResolution(step) {
    if (timerWorker) {
        timerWorker.postMessage({
            type: WORKER_MSG.RESOLUTION,
            data: { step, requestTimestamp: performance.now() },
        });
    }
}

/**
 * @param {string} [action]
 * @param {any} [payload]
 */
export function syncWorker(action, payload) {
    if (!timerWorker) {
        return;
    }
    const { arranger, chords, soloist, harmony, groove, playback } = getState();

    /** @type {Partial<Record<keyof import('./types.js').EnsembleState, any>>} */
    const data = {};

    if (!action) {
        // Full Sync
        timerWorker.postMessage({ type: WORKER_MSG.SYNC_STATE, data: toRaw(getSyncState()) });
        return;
    }

    // Delta Sync
    switch (action) {
        case 'SET_MODAL_OPEN':
            if (payload.modal === 'performance') {
                data.playback = { modals: { performance: !!payload.open } };
            }
            break;
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
            data.soloist = payload;
            break;
        case 'UPDATE_GB':
            data.groove = payload;
            break;
        case 'SET_PARAM':
            if (payload.module) {
                /** @type {any} */ (data)[payload.module] = { [payload.param]: payload.value };
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
                /** @type {any} */ (data)[payload.module] = { style: payload.style };
            }
            break;
        case 'SET_VOLUME':
            if (payload.module) {
                /** @type {any} */ (data)[payload.module] = { volume: payload.value };
            }
            break;
        case 'SET_OCTAVE':
            if (payload.module) {
                /** @type {any} */ (data)[payload.module] = { octave: payload.value };
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
                creativity: groove.creativity,
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
    }

    if (Object.keys(data).length > 0) {
        // DeepSignal proxies cannot be cloned by structuredClone (postMessage).
        // We strip them by converting to a plain JSON object.
        timerWorker.postMessage({ type: WORKER_MSG.SYNC_STATE, data: toRaw(data) });
    }
}
