import { compingState, getAccompanimentNotes } from './accompaniment.js';
import { getBassNote, isBassActive } from './bass-engine.js';
import { TIME_SIGNATURES } from './config.js';
import { DRUM_PRESETS } from './data/drum-presets.js';
import {
    createCoordinationContext,
    enforceRegisterSlotting,
    updateCoordinationContext,
} from './engine/coordination-engine.js';
import { applyGrooveOverrides, calculatePocketOffset } from './engine/groove-engine.js';
import { handleExport, isExporting, setOnExportEnd } from './engine/midi-worker-logic.js';
import { getChordAtStep, resetCursors, safeSync } from './engine/worker-utils.js';
import { generateProceduralFill } from './fills.js';
import { analyzeForm } from './form-analysis.js';
import { getHarmonyNotes } from './harmonies.js';
import { generateResolutionNotes } from './resolution.js';
import { getSoloistNote } from './soloist.js';
import { getState } from './state.js';
import { binarySearchMap, getFrequency, getMidi, getStepInfo } from './utils.js';
import { WORKER_MSG, WORKER_RESP } from './worker-types.js';

// --- WORKER STATE ---
/** @type {any} */
let timerID = null;
const interval = 25;
let bbBufferHead = 0;
let sbBufferHead = 0;
let cbBufferHead = 0;
let hbBufferHead = 0;

/** @typedef {{index: number, sectionIndex: number}} Cursor */
/** @type {Cursor} */
const mainCursor = { index: 0, sectionIndex: 0 };
/** @type {Cursor} */
const lookaheadCursor = { index: 0, sectionIndex: 0 };
const LOOKAHEAD = 64;

/** @type {Array<{type: string, data: any, startTime: number}>} */
const messageQueue = [];

// Ensure we resume processing messages after an export completes
setOnExportEnd(() => processMessageQueue());

/**
 * Fills the note buffers for the next n steps ahead of the current step.
 * @param {import('./types.js').EnsembleState} state
 * @param {number} currentStep
 * @param {number|null} requestTimestamp
 * @param {number|null} processStartTime
 */
function fillBuffers(state, currentStep, requestTimestamp = null, processStartTime = null) {
    const { arranger, chords, bass, soloist, harmony, groove, playback } = state;
    const targetStep = currentStep + LOOKAHEAD;
    const notesToMain = [];

    if (bbBufferHead < currentStep) {
        bbBufferHead = currentStep;
    }
    if (sbBufferHead < currentStep) {
        sbBufferHead = currentStep;
    }
    if (cbBufferHead < currentStep) {
        cbBufferHead = currentStep;
    }
    if (hbBufferHead < currentStep) {
        hbBufferHead = currentStep;
    }

    let head = Math.min(
        bass.enabled ? bbBufferHead : 999999,
        soloist.enabled ? sbBufferHead : 999999,
        chords.enabled ? cbBufferHead : 999999,
        harmony.enabled ? hbBufferHead : 999999,
    );
    if (head === 999999) {
        head = currentStep;
    }

    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;

    while (head < targetStep) {
        const step = head;
        const chordData = getChordAtStep(step, arranger, mainCursor);
        const stepInfo = getStepInfo(step, ts, arranger.measureMap, TIME_SIGNATURES);

        // 1. Context Assembly (Anchor: Groove)
        const coordination = createCoordinationContext(step, stepInfo);
        coordination.pocketOffset = calculatePocketOffset(playback, groove);

        if (chordData) {
            const { sectionEnd, sectionStart } = chordData;
            const remainingSteps = sectionEnd - step;
            const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

            // --- Structural Awareness: Turnaround Detection ---
            const sectionSteps = sectionEnd - sectionStart;
            const isLongEnough = sectionSteps >= stepsPerMeasure * 8;
            coordination.isTurnaround = isLongEnough && remainingSteps <= stepsPerMeasure * 2;

            if (remainingSteps <= stepsPerMeasure) {
                const nextSectionChordData = getChordAtStep(sectionEnd, arranger, lookaheadCursor);
                if (nextSectionChordData?.chord) {
                    coordination.upcomingSectionFirstChord = nextSectionChordData.chord;
                }
            }
        }

        // Pre-calculate Drum Hits for Coordination
        const drumStep = step % (groove.measures * stepsPerBar);
        const sectionId = chordData?.chord?.sectionId || null;
        const seedIdx =
            groove.sectionSeedMap && sectionId ? groove.sectionSeedMap[sectionId] || 0 : 0;
        const preset = DRUM_PRESETS[groove.lastDrumPreset];

        // --- Calculate Turnaround State ---
        const sectionEntry = binarySearchMap(arranger.sectionMap || [], step);
        let measuresInSection = 4;
        let startStep = 0;
        if (sectionEntry) {
            measuresInSection = Math.max(1, (sectionEntry.end - sectionEntry.start) / stepsPerBar);
            startStep = sectionEntry.start;
        }
        const barInSection = Math.floor((step - startStep) / stepsPerBar);
        const isTurnaround =
            groove.creativity &&
            measuresInSection > 1 &&
            barInSection % measuresInSection === measuresInSection - 1;

        const checkHit = (instName) => {
            const inst = groove.instruments.find((i) => i.name === instName);
            if (!inst || inst.muted) {
                return false;
            }
            let stepVal = inst.steps[drumStep];
            if (groove.creativity && preset?.variations?.[seedIdx]) {
                const varInst = preset.variations[seedIdx][instName];
                if (varInst) {
                    stepVal = varInst[drumStep];
                }
            }

            const result = applyGrooveOverrides(state, {
                step,
                inst,
                stepVal,
                playback,
                groove,
                isDownbeat: stepInfo.isMeasureStart,
                isBeatStart: stepInfo.isBeatStart,
                isBackbeat: stepInfo.isBackbeat,
                isGroupStart: stepInfo.isGroupStart,
                sectionId,
                beatIndex: stepInfo.beatIndex,
                isOffbeat: stepInfo.isOffbeat,
                isEOfBeat: stepInfo.isEOfBeat,
                isAOfBeat: stepInfo.isAOfBeat,
                tsConfig: stepInfo.tsConfig,
                isTurnaround,
                stepsPerBar,
                loopStep: drumStep,
            });
            return result.shouldPlay;
        };

        coordination.kickHit = checkHit('Kick');
        coordination.snareHit = checkHit('Snare');

        // 2. Soloist Generation (High Priority)
        let soloResult = null;
        const isPerformanceModalOpen = playback.modals?.performance;
        if (soloist.enabled && !isPerformanceModalOpen && step >= sbBufferHead) {
            if (chordData) {
                const { chord, stepInChord, sectionStart, sectionEnd } = chordData;
                const nextChordData = getChordAtStep(step + 4, arranger, lookaheadCursor);
                soloResult = getSoloistNote(
                    chord,
                    nextChordData?.chord,
                    step,
                    soloist.lastFreq,
                    soloist.octave,
                    soloist.style,
                    stepInChord,
                    false,
                    { sectionStart, sectionEnd, stepCoordination: coordination },
                    stepInfo,
                );

                if (soloResult) {
                    const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                    for (let i = 0; i < results.length; i++) {
                        const res = results[i];
                        if (res.freq || res.midi) {
                            if (!res.midi) {
                                res.midi = getMidi(res.freq);
                            }
                            // Enforce Contract: Register Slotting (with smooth octave shift)
                            const lastSoloMidi = soloist.lastFreq
                                ? getMidi(soloist.lastFreq)
                                : null;
                            res.midi = enforceRegisterSlotting(
                                'soloist',
                                res.midi,
                                coordination,
                                lastSoloMidi,
                            );

                            if (!res.freq) {
                                res.freq = getFrequency(res.midi);
                            }
                            if (!res.isDoubleStop) {
                                soloist.lastFreq = res.freq; // @worker-mutation
                            }
                            notesToMain.push({ ...res, step, module: 'soloist' });
                        }
                    }
                    updateCoordinationContext(coordination, 'soloist', soloResult);
                }
            }
            sbBufferHead++;
        }

        // 3. Bass Generation (Yields to Soloist, Locks to Kick)
        if (bass.enabled && step >= bbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                if (isBassActive(bass.style, step, stepInChord, stepInfo, coordination)) {
                    const nextChordData = getChordAtStep(step + 4, arranger, lookaheadCursor);
                    const { sectionStart, sectionEnd } = chordData;
                    const bassResult = getBassNote(
                        chord,
                        nextChordData?.chord,
                        stepInChord / ts.stepsPerBeat,
                        bass.lastFreq,
                        bass.octave,
                        bass.style,
                        chordData.chordIndex,
                        step,
                        stepInChord,
                        { sectionStart, sectionEnd, stepCoordination: coordination },
                        stepInfo,
                    );
                    if (bassResult && (bassResult.freq || bassResult.midi)) {
                        if (!bassResult.midi) {
                            bassResult.midi = getMidi(bassResult.freq);
                        }
                        // Enforce Contract: Register Slotting (with smooth octave shift)
                        const lastBassMidi = bass.lastFreq ? getMidi(bass.lastFreq) : null;
                        bassResult.midi = enforceRegisterSlotting(
                            'bass',
                            bassResult.midi,
                            coordination,
                            lastBassMidi,
                        );

                        if (!bassResult.freq) {
                            bassResult.freq = getFrequency(bassResult.midi);
                        }
                        bass.lastFreq = bassResult.freq; // @worker-mutation
                        notesToMain.push({ ...bassResult, step, module: 'bass' });
                        updateCoordinationContext(coordination, 'bass', bassResult);
                    }
                }
            }
            bbBufferHead++;
        }

        // 4. Chords Generation (Yields Density to Soloist)
        if (chords.enabled && step >= cbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const chordNotes = getAccompanimentNotes(
                    chord,
                    step,
                    stepInChord,
                    stepInfo.mStep,
                    stepInfo,
                    coordination,
                );
                for (let i = 0; i < chordNotes.length; i++) {
                    const n = chordNotes[i];
                    // Enforce Contract: Register Slotting
                    n.midi = enforceRegisterSlotting('chords', n.midi, coordination);

                    if (!n.freq) {
                        n.freq = getFrequency(n.midi);
                    }
                    notesToMain.push({ ...n, step, module: 'chords' });
                }
                updateCoordinationContext(coordination, 'chords', chordNotes);
            }
            cbBufferHead++;
        }

        // 5. Harmony Generation (Yields to All)
        if (harmony.enabled && step >= hbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const nextChordData = getChordAtStep(step + 4, arranger, lookaheadCursor);
                const harmonyNotes = getHarmonyNotes(
                    getState(),
                    chord,
                    nextChordData?.chord,
                    step,
                    harmony.octave,
                    harmony.style,
                    stepInChord,
                    soloResult,
                    coordination,
                    stepInfo,
                );
                for (let i = 0; i < harmonyNotes.length; i++) {
                    const n = harmonyNotes[i];
                    if (!n.freq) {
                        n.freq = getFrequency(n.midi);
                    }
                    notesToMain.push({ ...n, step, module: 'harmony' });
                }
            }
            hbBufferHead++;
        }

        head++;
    }

    const workerProcessTime = processStartTime ? performance.now() - processStartTime : 0;
    if (notesToMain.length > 0) {
        postMessage({
            type: WORKER_RESP.NOTES,
            notes: notesToMain,
            requestTimestamp,
            workerProcessTime,
        });
    }
}

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
                if (!timerID) {
                    timerID = setInterval(() => {
                        const startTime = performance.now();
                        postMessage({ type: WORKER_RESP.TICK });
                        const s = playback.step;
                        fillBuffers(state, s, null, startTime);
                    }, interval);
                }
                break;
            case WORKER_MSG.STOP:
                if (timerID) {
                    clearInterval(timerID);
                    timerID = null;
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
                        mainCursor.index = 0;
                        mainCursor.sectionIndex = 0;
                        lookaheadCursor.index = 0;
                        lookaheadCursor.sectionIndex = 0;
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
                bbBufferHead = data.step;
                sbBufferHead = data.step;
                cbBufferHead = data.step;
                hbBufferHead = data.step;
                soloist.isResting = true; // @worker-mutation
                soloist.phrasingState = 'rest'; // @worker-mutation
                soloist.transitionState = null; // @worker-mutation
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
                compingState.rhythmPattern = [];
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
        postMessage({ type: WORKER_RESP.ERROR, data: err.message, stack: err.stack });
    }
}

function processMessageQueue() {
    while (messageQueue.length > 0) {
        const { type, data, startTime } = messageQueue.shift();
        processMessage(type, data, startTime);
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
            messageQueue.push({ type, data, startTime });
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
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepInfo = getStepInfo(step, ts, arranger.measureMap, TIME_SIGNATURES);
    const coordination = createCoordinationContext(step, stepInfo);
    const notesToMain = generateResolutionNotes(
        state,
        step,
        arranger,
        {
            bass: bass.enabled,
            chords: chords.enabled,
            soloist: soloist.enabled,
            harmony: harmony.enabled,
            groove: groove.enabled,
        },
        playback.bpm,
        groove,
        soloist,
        coordination,
    );
    var workerProcessTime = processStartTime ? performance.now() - processStartTime : 0;
    postMessage({
        type: WORKER_RESP.NOTES,
        notes: notesToMain,
        isResolution: true,
        requestTimestamp,
        workerProcessTime,
    });
}

/**
 * Primes the generative engines by running them "silently" for a number of steps.
 * @param {import('./types.js').EnsembleState} state
 * @param {number} steps
 */
function handlePrime(state, steps) {
    const { soloist, arranger, playback, bass } = state;
    if (!soloist.enabled || arranger.totalSteps === 0) {
        return;
    }
    const stepsToPrime = steps || arranger.totalSteps * 2;
    if (playback.workerLogging) {
        console.log(`[Worker] Priming engine for ${stepsToPrime} steps...`);
    }
    soloist.isResting = true; // @worker-mutation
    soloist.phrasingState = 'rest'; // @worker-mutation
    soloist.transitionState = null; // @worker-mutation
    soloist.rhythmicMotif = []; // @worker-mutation
    soloist.busySteps = 0; // @worker-mutation
    bass.busySteps = 0; // @worker-mutation
    soloist.activeSteps = 0; // @worker-mutation
    soloist.restSteps = 0; // @worker-mutation
    soloist.hookBuffer = []; // @worker-mutation
    soloist.lastAttackStep = -100; // @worker-mutation
    soloist.sessionSteps = 0; // @worker-mutation
    const primeCursor = { index: 0, sectionIndex: 0 };
    const primeLookaheadCursor = { index: 0, sectionIndex: 0 };
    const start = performance.now();
    for (let i = 0; i < stepsToPrime; i++) {
        const s = i;
        const chordData = getChordAtStep(s, arranger, primeCursor);
        if (chordData) {
            const { chord, stepInChord } = chordData;
            const nextChordData = getChordAtStep(s, arranger, primeLookaheadCursor);
            const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
            const stepInfo = getStepInfo(s, ts, arranger.measureMap, TIME_SIGNATURES);
            const coordination = createCoordinationContext(s, stepInfo);
            const { sectionStart, sectionEnd } = chordData;
            const soloResult = getSoloistNote(
                chord,
                nextChordData?.chord,
                s,
                soloist.lastFreq,
                soloist.octave,
                soloist.style,
                stepInChord,
                true,
                { sectionStart, sectionEnd, stepCoordination: coordination },
            );
            if (soloResult) {
                const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                results.forEach((res) => {
                    if (res.freq || res.midi) {
                        if (!res.freq) {
                            res.freq = 440 * 2 ** ((res.midi - 69) / 12);
                        }
                        if (!res.isDoubleStop) {
                            soloist.lastFreq = res.freq; // @worker-mutation
                        }
                    }
                });
                updateCoordinationContext(coordination, 'soloist', soloResult);
            }
            if (bass.enabled) {
                if (isBassActive(bass.style, s, stepInChord, null, coordination)) {
                    const centerMidi = bass.octave;
                    const bassResult = getBassNote(
                        chord,
                        nextChordData?.chord,
                        stepInChord / ts.stepsPerBeat,
                        bass.lastFreq,
                        centerMidi,
                        bass.style,
                        chordData.chordIndex,
                        s,
                        stepInChord,
                        { sectionStart, sectionEnd, stepCoordination: coordination },
                    );
                    if (bassResult && (bassResult.freq || bassResult.midi)) {
                        if (!bassResult.freq) {
                            bassResult.freq = 440 * 2 ** ((bassResult.midi - 69) / 12);
                        }
                        bass.lastFreq = bassResult.freq; // @worker-mutation
                        updateCoordinationContext(coordination, 'bass', bassResult);
                    }
                }
            }
        }
    }
    const elapsed = performance.now() - start;
    if (playback.workerLogging) {
        console.log(`[Worker] Priming complete in ${elapsed.toFixed(2)}ms`);
    }
    soloist.busySteps = 0; // @worker-mutation
    bass.busySteps = 0; // @worker-mutation
    soloist.sessionSteps = 0; // @worker-mutation
}
