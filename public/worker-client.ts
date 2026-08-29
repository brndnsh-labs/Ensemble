import { cloneStateForDetachedGeneration } from './export/detached-generation-state.js';
import { getState, getSyncState } from './state.js';
import type { ActionPayloadMap, SwingSub } from './types.js';
import {
    MIDI_EXPORT_MSG,
    MIDI_EXPORT_RESP,
    type MidiExportRequest,
    type MidiExportResponse,
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
let midiExportWorker: Worker | null = null;
let rejectMidiExport: ((reason: Error) => void) | null = null;
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
export const getMidiExportWorker = (): Worker | null => midiExportWorker;

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
            case WORKER_RESP.ERROR:
                console.error('[Worker Error]', message.data);
                break;
            default: {
                const exhaustive: never = message;
                void exhaustive;
            }
        }
    };
}

function releaseMidiExportWorker(worker: Worker): void {
    worker.terminate();
    if (midiExportWorker === worker) {
        midiExportWorker = null;
        rejectMidiExport = null;
    }
}

function downloadMidiExport(message: Extract<MidiExportResponse, { type: 'exportComplete' }>) {
    const url = URL.createObjectURL(new Blob([message.blob], { type: 'audio/midi' }));
    const anchor = document.createElement('a');
    anchor.href = url;

    let safeName = (message.filename || 'ensemble-export').replace(MIDI_EXTENSION_PATTERN, '');
    safeName =
        safeName.replace(FILENAME_CLEANUP_PATTERN, '').substring(0, 64).trim() || 'ensemble-export';

    anchor.download = `${safeName}.mid`;
    anchor.click();
    URL.revokeObjectURL(url);
}

export function startExport(options: WorkerExportOptions): Promise<void> {
    if (midiExportWorker) {
        const rejectPrevious = rejectMidiExport;
        releaseMidiExportWorker(midiExportWorker);
        rejectPrevious?.(new Error('MIDI export superseded by a new request'));
    }
    exportProgressHandler?.(0);

    return new Promise((resolve, reject) => {
        try {
            const state = cloneStateForDetachedGeneration(getState());
            const worker = new Worker(new URL('./midi-export-worker.ts', import.meta.url), {
                type: 'module',
            });
            midiExportWorker = worker;
            rejectMidiExport = reject;

            worker.onmessage = (event: MessageEvent<MidiExportResponse>) => {
                if (midiExportWorker !== worker) {
                    return;
                }
                const message = event.data;
                switch (message.type) {
                    case MIDI_EXPORT_RESP.PROGRESS:
                        exportProgressHandler?.(message.progress);
                        break;
                    case MIDI_EXPORT_RESP.COMPLETE:
                        try {
                            downloadMidiExport(message);
                            exportProgressHandler?.(1);
                            resolve();
                        } catch (error) {
                            exportProgressHandler?.(0);
                            reject(error as Error);
                        } finally {
                            releaseMidiExportWorker(worker);
                        }
                        break;
                    case MIDI_EXPORT_RESP.ERROR: {
                        const error = new Error(message.data);
                        console.error('[MIDI Export Worker Error]', message.data);
                        exportProgressHandler?.(0);
                        releaseMidiExportWorker(worker);
                        reject(error);
                        break;
                    }
                    default: {
                        const exhaustive: never = message;
                        void exhaustive;
                    }
                }
            };
            worker.onerror = (event: ErrorEvent) => {
                if (midiExportWorker !== worker) {
                    return;
                }
                const error = new Error(event.message || 'MIDI export worker failed');
                console.error('[MIDI Export Worker Error]', error.message);
                exportProgressHandler?.(0);
                releaseMidiExportWorker(worker);
                reject(error);
            };

            const request: MidiExportRequest = {
                type: MIDI_EXPORT_MSG.START,
                data: { state, options: { ...options } },
            };
            worker.postMessage(request);
        } catch (error) {
            if (midiExportWorker) {
                releaseMidiExportWorker(midiExportWorker);
            }
            console.error('[MIDI Export Worker Error]', (error as Error).message);
            exportProgressHandler?.(0);
            reject(error as Error);
        }
    });
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

// syncWorker's own contract is a superset of the dispatch Action union: some
// call sites (scheduler-core.ts, the reachability test) drive it directly
// with worker-sync-only pseudo-actions that are never real dispatched
// ActionPayloadMap keys. `ARRANGER_UPDATE` and `SET_SESSION_STEPS` are
// legacy/unreachable cases (see tests/unit/engine/worker-sync-reachability.
// test.ts) and `SET_OCTAVE` has no live dispatcher either — all three are
// kept typed rather than removed, since deleting dead worker-sync cases is a
// separate cleanup from typing this contract.
//
// `action`/`payload` stay two loose parameters (not a single discriminated
// object) because the reachability test's DELTA PLUMBING assertion calls
// `syncWorker(action, payload)` directly with a driven pair per manifest
// entry — folding them into one `{ type, payload }` object would be a
// breaking call-site change, not just a type change. TS can't correlate two
// sibling parameters through a switch, so `payload` stays `unknown` and each
// branch below casts to that action's real payload shape.
type WorkerSyncActionName =
    | keyof ActionPayloadMap
    | 'LOOP_BOUNDARY'
    | 'ARRANGER_UPDATE'
    | 'SET_OCTAVE'
    | 'SET_SESSION_STEPS';

export function syncWorker(action?: WorkerSyncActionName, payload?: unknown): void {
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
            data.harmony = payload as ActionPayloadMap['UPDATE_HB'];
            break;
        case 'UPDATE_SB':
            // NOTE: this delta forwards the flat payload as-is; the nested session
            // seed (`session.seed`) is NOT re-routed here and rides the full
            // snapshot/flush (getSyncState) at play-start instead, not this delta.
            // See getSyncState() + recursiveSafeSync.
            data.soloist = payload as ActionPayloadMap['UPDATE_SB'];
            break;
        case 'UPDATE_GB':
            data.groove = payload as ActionPayloadMap['UPDATE_GB'];
            break;
        case 'SET_PARAM': {
            const setParamPayload = payload as ActionPayloadMap['SET_PARAM'];
            if (setParamPayload.module) {
                // Cast: ActionPayloadSetParam types module as a plain string
                // (SET_PARAM is shared across every lane, including 'vizState',
                // which isn't a WorkerSyncData key — logic-worker.ts's SYNC_STATE
                // handler only reads the 8 named slices, so an unsynced module
                // name is silently dropped worker-side, not misapplied). Same
                // trust boundary setModuleDelta's own contract already relies on.
                setModuleDelta(data, setParamPayload.module as keyof WorkerSyncData, {
                    [setParamPayload.param]: setParamPayload.value,
                });
            }
            break;
        }
        case 'UPDATE_CONDUCTOR_DECISION':
            data.chords = { density: chords.density };
            data.playback = {
                conductorVelocity: playback.conductorVelocity,
                intent: playback.intent,
            };
            break;
        case 'SET_STYLE': {
            const setStylePayload = payload as ActionPayloadMap['SET_STYLE'];
            if (setStylePayload.module) {
                setModuleDelta(data, setStylePayload.module as keyof WorkerSyncData, {
                    style: setStylePayload.style,
                });
            }
            break;
        }
        case 'SET_VOLUME': {
            const setVolumePayload = payload as ActionPayloadMap['SET_VOLUME'];
            if (setVolumePayload.module) {
                setModuleDelta(data, setVolumePayload.module as keyof WorkerSyncData, {
                    volume: setVolumePayload.value,
                });
            }
            break;
        }
        case 'SET_INSTRUMENT_VOICE': {
            // #698 — the chords voice drives NOTE GENERATION now (power-chord
            // voicing for the crunch rhythm guitar), so forward the changed lane's
            // voice to the worker live. The genre auto-follow effect dispatches
            // this per-lane on a genre change too, so this covers manual + auto.
            const setVoicePayload = payload as ActionPayloadMap['SET_INSTRUMENT_VOICE'];
            if (setVoicePayload?.module) {
                setModuleDelta(data, setVoicePayload.module as keyof WorkerSyncData, {
                    voice: setVoicePayload.voice,
                });
            }
            break;
        }
        case 'SET_OCTAVE': {
            // Dead today (no live dispatcher — see WorkerSyncActionName above);
            // shape mirrors the SET_PARAM/SET_VOLUME sibling cases above it.
            const setOctavePayload = payload as { module?: string; value?: number };
            if (setOctavePayload.module) {
                setModuleDelta(data, setOctavePayload.module as keyof WorkerSyncData, {
                    octave: setOctavePayload.value,
                });
            }
            break;
        }
        case 'SET_MIDI_CONFIG':
            data.midi = payload as ActionPayloadMap['SET_MIDI_CONFIG'];
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
            data.groove = { swing: payload as ActionPayloadMap['SET_SWING'] };
            break;
        case 'SET_SWING_SUB':
            // Cast: ActionPayloadMap types this as plain string (Select's onChange
            // is generic); runtime callers only ever dispatch a real SwingSub value.
            data.groove = { swingSub: payload as SwingSub };
            break;
        case 'SET_SESSION_STEPS':
            // Dead today — see WorkerSyncActionName above.
            data.soloist = { sessionSteps: payload as number };
            break;
        case 'SET_SOLOIST_MODE':
            data.soloist = { mode: payload as ActionPayloadMap['SET_SOLOIST_MODE'] };
            break;
        case 'SET_BPM':
            data.playback = { bpm: playback.bpm };
            break;
        case 'SET_SESSION_TIMER':
            data.playback = { sessionTimer: payload as ActionPayloadMap['SET_SESSION_TIMER'] };
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
        case 'ARRANGER_UPDATE': // Custom action for large structural changes — dead today
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
