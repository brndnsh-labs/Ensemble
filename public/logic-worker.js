import { compingState } from './accompaniment.js';
import { TIME_SIGNATURES } from './config.js';
import { createCoordinationContext } from './engine/coordination-engine.js';
import { handleExport, isExporting, setOnExportEnd } from './engine/midi-worker-logic.js';
import { fillBuffers } from './engine/worker-buffer-manager.js';
import { resetWorkerContext, workerContext } from './engine/worker-orchestrator.js';
import { handlePrime } from './engine/worker-priming.js';
import { resetCursors, safeSync } from './engine/worker-utils.js';
import { generateResolutionNotes } from './resolution.js';
import { getState } from './state.js';
import { getStepInfo } from './utils.js';
import { WORKER_MSG, WORKER_RESP } from './worker-types.js';

// Ensure we resume processing messages after an export completes
setOnExportEnd(() => processMessageQueue());

/**
 * Process incoming messages from the main thread.
 * @param {string} type
 * @param {any} data
 * @param {number} startTime
 */
function processMessage(type, data, startTime) {
    /** @type {import('./types.js').EnsembleState} */
    const state = getState();
    const { arranger, chords, bass, soloist, harmony, groove, playback } = state;
    try {
        switch (type) {
            case WORKER_MSG.START:
                if (!workerContext.timerID) {
                    workerContext.timerID = setInterval(() => {
                        const startTime = performance.now();
                        postMessage({ type: WORKER_RESP.TICK });
                        const s = playback.step;
                        fillBuffers(state, s, null, startTime);
                    }, workerContext.interval);
                }
                break;
            case WORKER_MSG.STOP:
                if (workerContext.timerID) {
                    clearInterval(workerContext.timerID);
                    workerContext.timerID = null;
                }
                break;
            case WORKER_MSG.SYNC_STATE:
                if (data.arranger) {
                    Object.assign(arranger, data.arranger);
                    arranger.totalSteps = data.arranger.totalSteps;
                    arranger.stepMap = data.arranger.stepMap;
                    arranger.measureMap = data.arranger.measureMap;
                    arranger.sectionMap = data.arranger.sectionMap;
                }
                safeSync(chords, data.chords, 'chords');
                safeSync(bass, data.bass, 'bass');
                safeSync(soloist, data.soloist, 'soloist');
                safeSync(harmony, data.harmony, 'harmony');
                safeSync(groove, data.groove, 'groove');
                if (data.groove?.instruments) {
                    const instrumentMap = new Map();
                    for (let i = 0; i < groove.instruments.length; i++) {
                        instrumentMap.set(groove.instruments[i].name, groove.instruments[i]);
                    }
                    for (let i = 0; i < data.groove.instruments.length; i++) {
                        const di = data.groove.instruments[i];
                        const inst = instrumentMap.get(di.name);
                        if (inst) {
                            inst.steps = di.steps;
                        }
                    }
                }
                if (data.playback) {
                    Object.assign(playback, data.playback);
                }
                break;
            case WORKER_MSG.REQUEST_BUFFER:
                fillBuffers(state, data.step, data.requestTimestamp, startTime);
                break;
            case WORKER_MSG.FLUSH:
                if (data.syncData) {
                    const syncData = data.syncData;
                    if (syncData.arranger) {
                        Object.assign(arranger, syncData.arranger);
                        arranger.totalSteps = syncData.arranger.totalSteps;
                        arranger.stepMap = syncData.arranger.stepMap;
                        arranger.sectionMap = syncData.arranger.sectionMap;
                        resetCursors();
                        resetWorkerContext(data.step);
                    }
                    safeSync(chords, syncData.chords, 'chords');
                    safeSync(bass, syncData.bass, 'bass');
                    safeSync(soloist, syncData.soloist, 'soloist');
                    safeSync(harmony, syncData.harmony, 'harmony');
                    safeSync(groove, syncData.groove, 'groove');
                    if (syncData.groove?.instruments) {
                        const instrumentMap = new Map();
                        for (let i = 0; i < groove.instruments.length; i++) {
                            instrumentMap.set(groove.instruments[i].name, groove.instruments[i]);
                        }
                        for (let i = 0; i < syncData.groove.instruments.length; i++) {
                            const di = syncData.groove.instruments[i];
                            const inst = instrumentMap.get(di.name);
                            if (inst) {
                                inst.steps = di.steps;
                                inst.muted = di.muted;
                            }
                        }
                    }
                    if (syncData.playback) {
                        Object.assign(playback, syncData.playback);
                    }
                }
                workerContext.bbBufferHead = data.step;
                workerContext.sbBufferHead = data.step;
                workerContext.cbBufferHead = data.step;
                workerContext.hbBufferHead = data.step;
                soloist.isResting = true; // @worker-mutation
                soloist.phrasingState = 'rest'; // @worker-mutation
                /** @type {any} */ (soloist).transitionState = null; // @worker-mutation
                soloist.rhythmicMotif = []; // @worker-mutation
                soloist.busySteps = 0; // @worker-mutation
                soloist.activeSteps = 0; // @worker-mutation
                soloist.restSteps = 0; // @worker-mutation
                soloist.sessionSteps = 0; // @worker-mutation
                soloist.deviceBuffer = []; // @worker-mutation
                bass.busySteps = 0; // @worker-mutation
                soloist.hookBuffer = []; // @worker-mutation
                soloist.sharedHookBuffer = []; // @worker-mutation
                soloist.lickDictionary = []; // @worker-mutation
                soloist.recentNotes = []; // @worker-mutation
                harmony.lastMidis = []; // @worker-mutation
                compingState.lastChordIndex = -1;
                compingState.lockedUntil = 0;
                /** @type {any} */ (compingState).rhythmPattern = [];
                if (data.primeSteps > 0) {
                    handlePrime(state, data.primeSteps);
                }
                fillBuffers(state, data.step, data.requestTimestamp, startTime);
                break;
            case WORKER_MSG.PRIME:
                handlePrime(state, data);
                break;
            case WORKER_MSG.RESOLUTION:
                handleResolution(state, data.step, data.requestTimestamp, startTime);
                break;
            case WORKER_MSG.EXPORT:
                handleExport(state, data);
                break;
        }
    } catch (err) {
        const e = /** @type {Error} */ (err);
        postMessage({ type: WORKER_RESP.ERROR, data: e.message, stack: e.stack });
    }
}

function processMessageQueue() {
    while (workerContext.messageQueue.length > 0) {
        const msg = workerContext.messageQueue.shift();
        if (msg) {
            const { type, data, startTime } = msg;
            processMessage(type, data, startTime);
        }
        if (isExporting()) {
            break;
        }
    }
}

if (typeof self !== 'undefined') {
    /** @param {MessageEvent} e */
    self.onmessage = (e) => {
        const { type, data } = e.data;
        const startTime = performance.now();
        if (isExporting()) {
            workerContext.messageQueue.push({ type, data, startTime });
        } else {
            processMessage(type, data, startTime);
        }
    };
}

/**
 * Handles generating a resolution/ending sequence.
 * @param {import('./types.js').EnsembleState} state
 * @param {number} step
 * @param {number|null} requestTimestamp
 * @param {number|null} processStartTime
 */
export function handleResolution(state, step, requestTimestamp = null, processStartTime = null) {
    const { arranger, bass, chords, soloist, harmony, groove, playback } = state;
    const ts =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepInfo = getStepInfo(step, ts, arranger.measureMap, TIME_SIGNATURES) || {
        mStep: 0,
        isMeasureStart: false,
        isBeatStart: false,
        isBackbeat: false,
        isGroupStart: false,
        beatIndex: 0,
        isOffbeat: false,
        isEOfBeat: false,
        isAOfBeat: false,
        tsConfig: ts,
    };
    const _coordination = createCoordinationContext(step, /** @type {any} */ (stepInfo));
    const resolutionNotes = generateResolutionNotes(
        state,
        step,
        arranger,
        /** @type {any} */ ({
            bass: bass.enabled,
            chords: chords.enabled,
            soloist: soloist.enabled,
            harmony: harmony.enabled,
            groove: groove.enabled,
        }),
        playback.bpm,
        groove,
        soloist,
    );
    var workerProcessTime = processStartTime ? performance.now() - processStartTime : 0;
    postMessage({
        type: WORKER_RESP.NOTES,
        notes: resolutionNotes,
        isResolution: true,
        requestTimestamp,
        workerProcessTime,
    });
}
