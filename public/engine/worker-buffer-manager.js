import { compingState, getAccompanimentNotes } from '../accompaniment.js';
import { getBassNote, isBassActive } from '../bass-engine.js';
import { TIME_SIGNATURES } from '../config.js';
import { DRUM_PRESETS } from '../data/drum-presets.js';
import { getHarmonyNotes } from '../harmonies.js';
import { getSoloistNote } from '../soloist.js';
import { binarySearchMap, getFrequency, getMidi, getStepInfo } from '../utils.js';
import { WORKER_RESP } from '../worker-types.js';
import {
    createCoordinationContext,
    enforceRegisterSlotting,
    updateCoordinationContext,
} from './coordination-engine.js';
import { applyGrooveOverrides, calculatePocketOffset } from './groove-engine.js';
import { getWorkerState, workerContext } from './worker-orchestrator.js';
import { getChordAtStep } from './worker-utils.js';

/**
 * Fills the note buffers for the next n steps ahead of the current step.
 * @param {import('../types.js').EnsembleState} state
 * @param {number} currentStep
 * @param {number|null} requestTimestamp
 * @param {number|null} processStartTime
 */
export function fillBuffers(state, currentStep, requestTimestamp = null, processStartTime = null) {
    const { arranger, chords, bass, soloist, harmony, groove, playback } = state;
    const targetStep = currentStep + workerContext.LOOKAHEAD;
    const notesToMain = [];

    if (workerContext.bbBufferHead < currentStep) {
        workerContext.bbBufferHead = currentStep;
    }
    if (workerContext.sbBufferHead < currentStep) {
        workerContext.sbBufferHead = currentStep;
    }
    if (workerContext.cbBufferHead < currentStep) {
        workerContext.cbBufferHead = currentStep;
    }
    if (workerContext.hbBufferHead < currentStep) {
        workerContext.hbBufferHead = currentStep;
    }

    let head = Math.min(
        bass.enabled ? workerContext.bbBufferHead : 999999,
        soloist.enabled ? workerContext.sbBufferHead : 999999,
        chords.enabled ? workerContext.cbBufferHead : 999999,
        harmony.enabled ? workerContext.hbBufferHead : 999999,
    );
    if (head === 999999) {
        head = currentStep;
    }

    const ts =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;

    while (head < targetStep) {
        const step = head;
        const chordData = getChordAtStep(step, arranger, workerContext.mainCursor);
        const stepInfo = getStepInfo(step, ts, arranger.measureMap, TIME_SIGNATURES);

        // 1. Context Assembly (Anchor: Groove)
        const coordination = createCoordinationContext(step, /** @type {any} */ (stepInfo));
        /** @type {any} */ (coordination).pocketOffset = calculatePocketOffset(playback, groove);

        if (chordData) {
            const { sectionEnd, sectionStart } = chordData;
            const remainingSteps = sectionEnd - step;
            const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

            // --- Structural Awareness: Turnaround Detection ---
            const sectionSteps = sectionEnd - sectionStart;
            const isLongEnough = sectionSteps >= stepsPerMeasure * 8;
            /** @type {any} */ (coordination).isTurnaround =
                isLongEnough && remainingSteps <= stepsPerMeasure * 2;

            if (remainingSteps <= stepsPerMeasure) {
                const nextSectionChordData = getChordAtStep(
                    sectionEnd,
                    arranger,
                    workerContext.lookaheadCursor,
                );
                if (nextSectionChordData?.chord) {
                    /** @type {any} */ (coordination).upcomingSectionFirstChord =
                        nextSectionChordData.chord;
                }
            }
        }

        // Pre-calculate Drum Hits for Coordination
        const drumStep = step % (groove.measures * stepsPerBar);
        const sectionId = /** @type {any} */ (chordData?.chord)?.sectionId || null;
        const seedIdx =
            groove.sectionSeedMap && sectionId
                ? /** @type {any} */ (groove.sectionSeedMap)[sectionId] || 0
                : 0;
        const preset = /** @type {any} */ (DRUM_PRESETS)[groove.lastDrumPreset];

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

        const checkHit = (/** @type {string} */ instName) => {
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
        if (soloist.enabled && !isPerformanceModalOpen && step >= workerContext.sbBufferHead) {
            if (chordData) {
                const { chord, stepInChord, sectionStart, sectionEnd } = chordData;
                const nextChordData = getChordAtStep(
                    step + 4,
                    arranger,
                    workerContext.lookaheadCursor,
                );
                soloResult = getSoloistNote(
                    chord || '',
                    nextChordData?.chord || '',
                    step,
                    /** @type {any} */ (soloist.lastFreq || null),
                    soloist.octave,
                    soloist.style || '',
                    stepInChord,
                    false,
                    { sectionStart, sectionEnd, stepCoordination: coordination },
                    stepInfo || null,
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
                                /** @type {any} */ (lastSoloMidi),
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
            workerContext.sbBufferHead++;
        }

        // 3. Bass Generation (Yields to Soloist, Locks to Kick)
        if (bass.enabled && step >= workerContext.bbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                if (isBassActive(bass.style, step, stepInChord, stepInfo, coordination)) {
                    const nextChordData = getChordAtStep(
                        step + 4,
                        arranger,
                        workerContext.lookaheadCursor,
                    );
                    const { sectionStart, sectionEnd } = chordData;
                    const bassResult = getBassNote(
                        chord,
                        nextChordData?.chord,
                        stepInChord / ts.stepsPerBeat,
                        /** @type {any} */ (bass.lastFreq || null),
                        bass.octave,
                        bass.style,
                        chordData.chordIndex,
                        step,
                        stepInChord,
                        { sectionStart, sectionEnd, stepCoordination: coordination },
                        stepInfo || null,
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
                            /** @type {any} */ (lastBassMidi),
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
            workerContext.bbBufferHead++;
        }

        // 4. Chords Generation (Yields Density to Soloist)
        if (chords.enabled && step >= workerContext.cbBufferHead) {
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
            workerContext.cbBufferHead++;
        }

        // 5. Harmony Generation (Yields to All)
        if (harmony.enabled && step >= workerContext.hbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const nextChordData = getChordAtStep(
                    step + 4,
                    arranger,
                    workerContext.lookaheadCursor,
                );
                const harmonyNotes = getHarmonyNotes(
                    getWorkerState() || state,
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
            workerContext.hbBufferHead++;
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
