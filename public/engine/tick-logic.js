import { TIME_SIGNATURES } from '../config.js';
import { DRUM_PRESETS } from '../data/drum-presets.js';
import { binarySearchMap, getFrequency, getMidi, getStepInfo } from '../utils.js';
import { getAccompanimentNotes } from './accompaniment.js';
import { getBassNote, isBassActive } from './bass-engine.js';
import {
    createCoordinationContext,
    enforceRegisterSlotting,
    updateCoordinationContext,
} from './coordination-engine.js';
import { generateProceduralFill } from './fills.js';
import { applyGrooveOverrides, calculatePocketOffset } from './groove-engine.js';
import { getHarmonyNotes } from './harmonies.js';
import { getSoloistNote } from './soloist.js';
import { getChordAtStep } from './worker-utils.js';

/**
 * @typedef {Object} TickCursors
 * @property {{index: number, sectionIndex: number}} mainCursor
 * @property {{index: number, sectionIndex: number}} lookaheadCursor
 */

/**
 * @typedef {Object} NoteResult
 * @property {string} module
 * @property {number} step
 * @property {number} [midi]
 * @property {number} [freq]
 * @property {number} [velocity]
 * @property {number} [durationSteps]
 * @property {number} [timingOffset]
 * @property {number} [bendStartInterval]
 * @property {boolean} [isDoubleStop]
 * @property {boolean} [isLegato]
 * @property {boolean} [dry]
 * @property {any} [ccEvents]
 * @property {boolean} [muted]
 */

/**
 * @typedef {Object} DrumHitInfo
 * @property {boolean} shouldPlay
 * @property {number} velocity
 * @property {string} soundName
 * @property {number} instTimeOffset
 * @property {any} inst
 */

/**
 * Generates notes and drum hits for a single musical step.
 *
 * @param {import('../types.js').EnsembleState} state The ensemble state.
 * @param {number} step The global step to process.
 * @param {TickCursors} cursors Cursor objects to optimize step-to-chord lookups.
 * @param {Object} [options]
 * @param {boolean} [options.includeChords]
 * @param {boolean} [options.includeBass]
 * @param {boolean} [options.includeSoloist]
 * @param {boolean} [options.includeHarmony]
 * @param {boolean} [options.includeDrums]
 * @returns {{ notes: NoteResult[], coordination: any, drumHits: DrumHitInfo[] }}
 */
export function generateNotesForStep(state, step, cursors, options = {}) {
    const { arranger, chords, bass, soloist, harmony, groove, playback } = state;

    const includeChords = options.includeChords ?? chords.enabled;
    const includeBass = options.includeBass ?? bass.enabled;
    const includeSoloist = options.includeSoloist ?? soloist.enabled;
    const includeHarmony = options.includeHarmony ?? harmony.enabled;
    const includeDrums = options.includeDrums ?? groove.enabled;

    /** @type {NoteResult[]} */
    const notesToMain = [];
    /** @type {DrumHitInfo[]} */
    const drumHits = [];

    const ts =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;

    const chordData = getChordAtStep(step, arranger, cursors.mainCursor);
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
                cursors.lookaheadCursor,
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
    const preset = /** @type {any} */ (DRUM_PRESETS)[groove.lastDrumPreset || 'Standard'];

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

    let fillPlayed = false;

    if (groove.fillActive) {
        const fillStep = step - (groove.fillStartStep || 0);

        if (fillStep >= 0 && fillStep < (groove.fillLength || 0)) {
            if (playback.bandIntensity >= 0.1 || fillStep >= (groove.fillLength || 0) / 2) {
                const fillNotes = /** @type {any} */ (groove.fillSteps)?.[fillStep];
                if (fillNotes && fillNotes.length > 0) {
                    fillNotes.forEach((/** @type {any} */ n) => {
                        const inst = groove.instruments.find((i) => i.name === n.name) || {
                            name: n.name,
                            muted: false,
                        };
                        if (!inst.muted) {
                            drumHits.push({
                                shouldPlay: true,
                                velocity: n.vel,
                                soundName: n.name,
                                instTimeOffset: 0,
                                inst,
                            });
                        }
                    });
                    fillPlayed = true;
                }
            }
        } else if (fillStep === groove.fillLength) {
            // @worker-mutation (handled in tick-logic transition usually, but just in case for stateless generation)
            if (groove.pendingCrash) {
                const inst = groove.instruments.find((i) => i.name === 'Crash') || {
                    name: 'Crash',
                    muted: false,
                };
                if (!inst.muted) {
                    drumHits.push({
                        shouldPlay: true,
                        velocity: 1.1,
                        soundName: 'Crash',
                        instTimeOffset: 0,
                        inst,
                    });
                }
            }
        }
    }

    if (!fillPlayed) {
        /**
         * @param {string} instName
         * @param {boolean} evaluateOnly
         */
        const checkHit = (instName, evaluateOnly = true) => {
            const inst = groove.instruments.find((i) => i.name === instName);
            if (!inst || inst.muted) {
                return false;
            }
            let stepVal = inst.steps[drumStep];
            if (groove.creativity && preset?.variations?.[seedIdx]) {
                const varInst = /** @type {any} */ (preset).variations[seedIdx][instName];
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

            if (!evaluateOnly && result.shouldPlay) {
                drumHits.push({
                    shouldPlay: result.shouldPlay,
                    velocity: result.velocity,
                    soundName: result.soundName,
                    instTimeOffset: result.instTimeOffset,
                    inst,
                });
            }
            return result.shouldPlay;
        };

        coordination.kickHit = checkHit('Kick', true);
        coordination.snareHit = checkHit('Snare', true);

        // If including drums, process all instruments for actual playback
        if (includeDrums) {
            groove.instruments.forEach((inst) => {
                checkHit(inst.name, false);
            });
        }
    }

    // 2. Soloist Generation (High Priority)
    let soloResult = null;
    const isPerformanceModalOpen = playback.modals?.performance;

    if (includeSoloist && !isPerformanceModalOpen) {
        if (chordData) {
            const { chord, stepInChord, sectionStart, sectionEnd } = chordData;
            const nextChordData = getChordAtStep(step + 4, arranger, cursors.lookaheadCursor);
            soloResult = getSoloistNote(
                state,
                chord || '',
                nextChordData?.chord || '',
                step,
                /** @type {any} */ (soloist.lastFreq || null),
                soloist.octave,
                soloist.style || '',
                stepInChord,
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
                        const lastSoloMidi = soloist.lastFreq ? getMidi(soloist.lastFreq) : null;
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
    }

    // 3. Bass Generation (Yields to Soloist, Locks to Kick)
    if (includeBass) {
        if (chordData) {
            const { chord, stepInChord } = chordData;
            if (isBassActive(state, bass.style, step, stepInChord, stepInfo, coordination)) {
                const nextChordData = getChordAtStep(step + 4, arranger, cursors.lookaheadCursor);
                const { sectionStart, sectionEnd } = chordData;
                const bassResult = getBassNote(
                    state,
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
    }

    // 4. Chords Generation (Yields Density to Soloist)
    if (includeChords) {
        if (chordData) {
            const { chord, stepInChord } = chordData;
            const chordNotes = getAccompanimentNotes(
                state,
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
    }

    // 5. Harmony Generation (Yields to All)
    if (includeHarmony) {
        if (chordData) {
            const { chord, stepInChord } = chordData;
            const nextChordData = getChordAtStep(step + 4, arranger, cursors.lookaheadCursor);
            const harmonyNotes = getHarmonyNotes(
                state,
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
                // Enforce Contract: Register Slotting
                n.midi = enforceRegisterSlotting('harmony', n.midi, coordination);

                if (!n.freq) {
                    n.freq = getFrequency(n.midi);
                }
                notesToMain.push({ ...n, step, module: 'harmony' });
            }
        }
    }

    return {
        notes: notesToMain,
        coordination,
        drumHits,
    };
}

/**
 * Mutates state and conductorState to handle transitions, fills, intensity,
 * and harmony complexity. This ensures 1:1 parity between live engine and offline export.
 * @param {import('../types.js').EnsembleState} state
 * @param {number} step
 * @param {any} conductorState The object containing loopCount, formIteration, etc.
 */
export function applyWorkerTransition(state, step, conductorState) {
    const { groove, playback, arranger, harmony } = state;
    if (!groove.enabled || !arranger.totalSteps) {
        return;
    }

    const modStep = step % arranger.totalSteps;

    if (modStep === 0 && step > 0) {
        conductorState.loopCount++;
        conductorState.formIteration++;
        playback.currentLoopCount = conductorState.loopCount; // @worker-mutation
    }

    const entry = binarySearchMap(arranger.stepMap || [], modStep);
    if (!entry) {
        return;
    }

    const ts =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const sectionEnd = entry.end;
    const fillStart = sectionEnd - stepsPerMeasure;

    if (modStep === fillStart) {
        const currentIndex = arranger.stepMap.indexOf(entry);
        let nextEntry = arranger.stepMap[currentIndex + 1];
        let isLoopEnd = false;
        if (!nextEntry) {
            nextEntry = arranger.stepMap[0];
            isLoopEnd = true;
        }

        if (
            /** @type {any} */ (nextEntry.chord).sectionId !==
                /** @type {any} */ (entry.chord).sectionId ||
            isLoopEnd
        ) {
            let shouldFill = groove.creativity;
            // CHECK FOR SEAMLESS TRANSITION
            const nextSectionId = /** @type {any} */ (nextEntry.chord).sectionId;
            const nextSection = (arranger.sections || []).find(
                (/** @type {any} */ s) => s.id === nextSectionId,
            );
            if (nextSection?.seamless) {
                shouldFill = false;
            }

            if (shouldFill && isLoopEnd && arranger.totalSteps <= 64) {
                const freq =
                    playback.bandIntensity > 0.75 ? 1 : playback.bandIntensity > 0.4 ? 2 : 4;
                shouldFill = conductorState.loopCount % freq === 0;
            }
            if (shouldFill) {
                const fill = generateProceduralFill(
                    groove.genreFeel,
                    playback.bandIntensity,
                    stepsPerMeasure,
                );
                groove.fillSteps = fill; // @worker-mutation
                groove.fillActive = true; // @worker-mutation
                groove.fillStartStep = step; // @worker-mutation
                groove.fillLength = stepsPerMeasure; // @worker-mutation
                groove.pendingCrash = true; // @worker-mutation
            }
        }
    }

    // --- Auto Intensity Simulation for Offline Export ---
    if (playback.autoIntensity && conductorState.totalLoops !== undefined) {
        const totalExportSteps = arranger.totalSteps * conductorState.totalLoops;
        const progress = totalExportSteps > 0 ? step / totalExportSteps : 0;

        // Match the macro-arc logic from conductor.js (session timer arc)
        let macroFloor = 0.2;
        let macroCeiling = 0.6;

        if (progress < 0.15) {
            macroFloor = 0.2;
            macroCeiling = 0.45;
        } else if (progress < 0.4) {
            macroFloor = 0.4;
            macroCeiling = 0.7;
        } else if (progress < 0.65) {
            macroFloor = 0.5;
            macroCeiling = 0.8;
        } else if (progress < 0.85) {
            macroFloor = 0.7;
            macroCeiling = 1.0;
        } else {
            macroFloor = 0.2;
            macroCeiling = 0.5;
        }

        // Incorporate Section Energy
        let targetEnergy = 0.5;
        if (conductorState.form?.sections && entry?.chord) {
            const currentSectionId = /** @type {any} */ (entry.chord).sectionId;
            const currentSection = conductorState.form.sections.find(
                (/** @type {any} */ s) => s.id === currentSectionId,
            );
            if (currentSection) {
                const role = currentSection.role;
                switch (role) {
                    case 'Exposition':
                        targetEnergy = macroFloor + 0.1;
                        break;
                    case 'Development':
                        targetEnergy = (macroFloor + macroCeiling) / 2 + 0.1;
                        break;
                    case 'Contrast':
                        targetEnergy = macroFloor;
                        break;
                    case 'Build':
                        targetEnergy = macroCeiling;
                        break;
                    case 'Climax':
                        targetEnergy = macroCeiling + 0.1;
                        break;
                    case 'Recapitulation':
                        targetEnergy = macroFloor + 0.2;
                        break;
                    case 'Resolution':
                        targetEnergy = macroFloor - 0.1;
                        break;
                    default:
                        targetEnergy = 0.5;
                }
            }
        }

        targetEnergy = Math.max(macroFloor, Math.min(macroCeiling, targetEnergy));

        // Smoothly interpolate towards target energy over the section
        if (entry && entry.end > entry.start) {
            const stepSize = (targetEnergy - playback.bandIntensity) / (entry.end - entry.start);
            const newIntensity = Math.max(0.1, Math.min(1.0, playback.bandIntensity + stepSize));
            playback.bandIntensity = newIntensity; // @worker-mutation
        }
    } else if (playback.autoIntensity && modStep === 0 && conductorState.formIteration > 0) {
        const grandCycle = conductorState.formIteration % 8;
        let target = 0.5;
        if (grandCycle < 3) {
            target = 0.6;
        } else if (grandCycle < 5) {
            target = 0.9;
        } else {
            target = 0.4;
        }
        playback.bandIntensity = playback.bandIntensity + (target - playback.bandIntensity) * 0.5; // @worker-mutation
    }

    harmony.complexity = Math.max(0, (playback.bandIntensity - 0.2) * 1.25); // @worker-mutation

    // Handle offline export specific end-of-loop build up
    if (conductorState.loopMode !== undefined && conductorState.totalLoops !== undefined) {
        const isLastLoop = conductorState.loopCount >= conductorState.totalLoops - 1;
        if (isLastLoop && conductorState.totalLoops > 1) {
            harmony.complexity = Math.max(harmony.complexity, 0.85); // @worker-mutation
        }
    } else if (playback.songMode && playback.isEndingPending) {
        // Live Mode Ending Anticipation
        harmony.complexity = Math.max(harmony.complexity, 0.85); // @worker-mutation
    }
}
