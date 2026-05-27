/// <reference lib="webworker" />
import { TIME_SIGNATURES } from './config.js';
import { compingState } from './engine/accompaniment.js';
import { resetBassState } from './engine/bass-engine.js';
import { createCoordinationContext } from './engine/coordination-engine.js';
import { clearHarmonyMemory } from './engine/harmonies.js';
import { handleExport, isExporting, setOnExportEnd } from './engine/midi-worker-logic.js';
import { generateResolutionNotes } from './engine/resolution.js';
import { resetSoloistState } from './engine/soloist.js';
import { fillBuffers } from './engine/worker-buffer-manager.js';
import { resetWorkerContext, workerContext } from './engine/worker-orchestrator.js';
import { recursiveSafeSync, resetCursors } from './engine/worker-utils.js';

import { getState } from './state.js';
import type { EnsembleState } from './types.js';
import { getStepInfo } from './utils.js';
import { WORKER_MSG, WORKER_RESP } from './worker-types.js';

// Ensure we resume processing messages after an export completes
setOnExportEnd(() => processMessageQueue());

/**
 * Process incoming messages from the main thread.
 */
function processMessage(type: string, data: any, startTime: number): void {
    const state: EnsembleState = getState();
    // Initialize the workerContext state for engine functions
    if (!workerContext.state) {
        workerContext.state = state;
    }
    const { arranger, chords, bass, soloist, harmony, groove, playback, midi } = state;
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
                    recursiveSafeSync(arranger, data.arranger, 'arranger');
                }
                recursiveSafeSync(chords, data.chords, 'chords');
                recursiveSafeSync(bass, data.bass, 'bass');
                recursiveSafeSync(soloist, data.soloist, 'soloist');
                recursiveSafeSync(harmony, data.harmony, 'harmony');
                recursiveSafeSync(groove, data.groove, 'groove');
                recursiveSafeSync(midi, data.midi, 'midi');
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
                        recursiveSafeSync(arranger, syncData.arranger, 'arranger');
                        resetCursors();
                        resetWorkerContext(data.step);
                    }
                    recursiveSafeSync(chords, syncData.chords, 'chords');
                    recursiveSafeSync(bass, syncData.bass, 'bass');
                    recursiveSafeSync(soloist, syncData.soloist, 'soloist');
                    recursiveSafeSync(harmony, syncData.harmony, 'harmony');
                    recursiveSafeSync(groove, syncData.groove, 'groove');
                    if (syncData.playback) {
                        Object.assign(playback, syncData.playback);
                    }
                }
                workerContext.bbBufferHead = data.step;
                workerContext.sbBufferHead = data.step;
                workerContext.cbBufferHead = data.step;
                workerContext.hbBufferHead = data.step;

                // Centralized Reset Phase
                resetSoloistState(state);
                resetBassState(state);
                clearHarmonyMemory(state);

                compingState.lastChordIndex = -1;
                compingState.lockedUntil = 0;
                compingState.lastVoicingMidis = [];
                (compingState as any).rhythmPattern = [];
                fillBuffers(state, data.step, data.requestTimestamp, startTime);
                break;
            case WORKER_MSG.RESOLUTION:
                handleResolution(state, data.step, data.requestTimestamp, startTime);
                break;
            case WORKER_MSG.EXPORT:
                handleExport(state, data);
                break;
        }
    } catch (err) {
        const e = err as Error;
        postMessage({ type: WORKER_RESP.ERROR, data: e.message, stack: e.stack });
    }
}

function processMessageQueue(): void {
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
    const workerSelf = self as unknown as DedicatedWorkerGlobalScope;
    workerSelf.onmessage = (e: MessageEvent) => {
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
 */
export function handleResolution(
    state: EnsembleState,
    step: number,
    requestTimestamp: number | null = null,
    processStartTime: number | null = null,
): void {
    const { arranger, bass, chords, soloist, harmony, groove, playback } = state;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
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
    const _coordination = createCoordinationContext(step, stepInfo as any);
    const resolutionNotes = generateResolutionNotes(
        state,
        step,
        arranger,
        {
            bass: bass.enabled,
            chords: chords.enabled,
            soloist: soloist.enabled,
            harmony: harmony.enabled,
            groove: groove.enabled,
        } as any,
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
