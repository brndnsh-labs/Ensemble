import { analyzeForm, getSectionEnergy } from '../form-analysis.js';
import { debounceSaveState, saveCurrentState } from '../persistence.js';
import { ACTIONS } from '../types.js';
import { triggerFlash } from '../ui.js';
import { binarySearchMap, binarySearchMapIndex } from '../utils.js';
import { generateProceduralFill } from './fills.js';

/** @param {Function} [dispatch] */
export function analyzeFormUI(dispatch) {
    const form = analyzeForm();
    if (form && dispatch) {
        dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, { form });
    }
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {Function} dispatch
 */
export function applyConductor(state, dispatch) {
    const { playback, soloist, groove, arranger } = state;
    const intensity = playback.bandIntensity; // 0.0 - 1.0
    const complexity = playback.complexity; // 0.0 - 1.0

    // --- 1. Master Dynamics ---
    let targetDensity = 'standard';
    if (intensity < 0.4) {
        targetDensity = 'thin';
    } else if (intensity > 0.85) {
        targetDensity = 'rich';
    }

    const targetVelocity = 0.7 + intensity * 0.45; // 0.7x to 1.15x (Adjusted to avoid overloads)

    // --- 2. Complexity / Busyness ---
    const targetHookProb = 0.2 + complexity * 0.6;

    // --- 3. Musical Conversation (Soloist Density) ---
    // If soloist is active, the accompanist should "listen" and back off.
    const isSoloistBusy = soloist.enabled && (soloist.busySteps || 0) > 0;
    const targetIntentDensity = isSoloistBusy ? 0.3 * (1 - complexity) : 0.5 + intensity * 0.4;

    // --- 4. Harmony Evolution ---
    // Harmonies follow the complexity signal for activity level.
    let targetHbComplexity = complexity;

    // If Song Mode is active and we are in the last 30 seconds, push for a "Final Build"
    const elapsedMins =
        playback.sessionTimer > 0 && playback.sessionStartTime > 0
            ? (performance.now() - playback.sessionStartTime) / 60000
            : 0;
    const progress =
        playback.sessionTimer > 0 ? Math.min(1.0, elapsedMins / playback.sessionTimer) : 0;

    if (playback.songMode && playback.isEndingPending) {
        targetHbComplexity = Math.max(targetHbComplexity, 0.85);
    }

    // --- 5. Expression (Lyrical vs Involved) ---
    // Lyrical = 1.0 (Melodic, slower), Involved = 0.0 (Busy, technical)
    let lyricalBias = 0.5;

    // Song Arc: Smooth interpolation instead of hard jumps
    if (playback.songMode && playback.sessionTimer > 0) {
        if (progress < 0.3) {
            // Initial Phase: 0.9 down to 0.5
            lyricalBias = 0.9 - (progress / 0.3) * 0.4;
        } else if (progress < 0.7) {
            // Building Phase: 0.5 down to 0.2
            lyricalBias = 0.5 - ((progress - 0.3) / 0.4) * 0.3;
        } else if (progress < 0.9) {
            // Peak: 0.2
            lyricalBias = 0.2;
        } else {
            // Resolution: 0.2 up to 0.95
            lyricalBias = 0.2 + ((progress - 0.9) / 0.1) * 0.75;
        }
    }

    // Section Overrides (Smoothed)
    const modStep = arranger.totalSteps > 0 ? playback.step % arranger.totalSteps : 0;
    const currentEntry = binarySearchMap(arranger.stepMap || [], modStep);
    if (currentEntry) {
        const label = /** @type {any} */ (currentEntry.chord).sectionLabel.toLowerCase();
        let sectionBias = 0.5;
        if (label.includes('solo')) {
            sectionBias = 0.2;
        } else if (label.includes('verse')) {
            sectionBias = 0.75;
        } else if (label.includes('outro') || label.includes('intro')) {
            sectionBias = 0.9;
        }

        // Blend section bias with song arc (70% section, 30% arc)
        lyricalBias = sectionBias * 0.7 + lyricalBias * 0.3;
    }

    // Soloist Energy Cap: Prevent "runaway" density at loop starts
    const isFirstHalfOfSection =
        currentEntry && modStep - currentEntry.start < (currentEntry.end - currentEntry.start) / 2;
    const soloistIntensityMod = isFirstHalfOfSection ? -0.15 : 0.05;

    dispatch(ACTIONS.UPDATE_CONDUCTOR_DECISION, {
        density: targetDensity,
        velocity: targetVelocity,
        hookProb: targetHookProb,
        intent: {
            density: targetIntentDensity,
            soloistMod: soloistIntensityMod,
        },
        lyricalBias: lyricalBias,
    });

    dispatch(ACTIONS.UPDATE_HB, {
        complexity: targetHbComplexity,
    });

    // --- 6. Micro-Timing (Pocket) ---
    let targetBassPocket = 0;
    const genre = groove.genreFeel;
    if (genre === 'Neo-Soul') {
        targetBassPocket = 0.025; // 25ms "Dilla" lag
    } else if (genre === 'Funk') {
        targetBassPocket = -0.005; // 5ms "Ahead of the beat" push for Funk energy
    }

    dispatch(ACTIONS.SET_PARAM, { module: 'bass', param: 'pocketOffset', value: targetBassPocket });

    // --- 5. Intensity-Aware Mix Shaping ---
    if (playback.audio) {
        const time = playback.audio.currentTime;
        const ramp = 0.5;

        // Master Limiter: Tighter at high intensity to glue the mix
        if (playback.masterLimiter) {
            const targetThreshold = -1.5 - intensity * 1.5; // Lower threshold (-1.5 to -3.0 dB)
            const targetRatio = 4 + intensity * 4; // Transparent ratio (4:1 to 8:1)
            const targetRelease = 0.08; // Fast release to avoid pumping

            playback.masterLimiter.threshold.setTargetAtTime(targetThreshold, time, ramp);
            playback.masterLimiter.ratio.setTargetAtTime(targetRatio, time, ramp);
            playback.masterLimiter.release.setTargetAtTime(targetRelease, time, ramp);
        }

        // --- Pro Mix Spectral Slotting & Panning ---
        if (playback.chordsEQ) {
            playback.chordsEQ.frequency.setTargetAtTime(250, time, ramp);
        }
        if (playback.chordsPanner) {
            playback.chordsPanner.pan.setTargetAtTime(-0.2, time, ramp);
        }
        if (playback.bassEQ) {
            playback.bassEQ.type = 'highpass';
            playback.bassEQ.frequency.setTargetAtTime(40, time, ramp);
        }
        if (playback.soloistEQ) {
            playback.soloistEQ.type = 'highshelf';
            playback.soloistEQ.frequency.setTargetAtTime(8000, time, ramp);
            playback.soloistEQ.gain.setTargetAtTime(-3, time, ramp); // Tame harshness
        }
        if (playback.harmoniesEQ) {
            playback.harmoniesEQ.frequency.setTargetAtTime(300, time, ramp);
        }
        if (playback.harmoniesPanner) {
            playback.harmoniesPanner.pan.setTargetAtTime(0.2, time, ramp);
        }
        if (playback.reverbPreFilter) {
            // Reverb Cleaning (Abbey Road)
            playback.reverbPreFilter.frequency.setTargetAtTime(600, time, ramp);
        }
    }

    debounceSaveState();
}

/**
 * Updates auto-intensity and monitors the band's "conversation".
 * @param {import('../types.js').EnsembleState} state
 * @param {Function} dispatch
 */
export function updateAutoConductor(state, dispatch) {
    const { playback, conductor } = state;
    if (!playback.autoIntensity || !playback.isPlaying) {
        return;
    }

    if (Math.abs(playback.bandIntensity - conductor.targetIntensity) > 0.001) {
        // Asymmetric ramping: humans tend to build energy gradually but can stop/drop quickly
        const multiplier = playback.bandIntensity > conductor.targetIntensity ? 2.5 : 1.0;
        let newIntensity =
            playback.bandIntensity +
            (playback.bandIntensity < conductor.targetIntensity
                ? Math.abs(conductor.stepSize)
                : -Math.abs(conductor.stepSize)) *
                multiplier;
        newIntensity = Math.max(0.01, Math.min(1.0, newIntensity));

        if (newIntensity !== playback.bandIntensity) {
            dispatch(ACTIONS.SET_BAND_INTENSITY, newIntensity);
        }

        applyConductor(state, dispatch);
    }
}

/**
 * Calculates and applies tempo drift for "Lars Mode".
 * @param {import('../types.js').EnsembleState} state
 * @param {number} currentStep
 * @param {Function} dispatch
 */
export function updateLarsTempo(state, currentStep, dispatch) {
    const { groove, playback, arranger, conductor } = state;
    if (!groove.larsMode || !playback.isPlaying) {
        if (conductor.larsBpmOffset !== 0) {
            dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, { larsBpmOffset: 0 });
        }
        return;
    }

    // 1. Determine target drift based on section energy and global band intensity
    const total = arranger.totalSteps;
    if (total === 0) {
        return;
    }
    const modStep = currentStep % total;
    const entry = binarySearchMap(arranger.stepMap || [], modStep);
    if (!entry) {
        return;
    }

    // Use section label energy as a base (-0.5 to +0.5 normalized drift)
    const labelEnergy = getSectionEnergy(/** @type {any} */ (entry.chord).sectionLabel); // 0.1 to 0.9

    // Blend with global band intensity (which includes macro-arc and randomness)
    // If the label is generic (e.g., "Section 1"), rely more on bandIntensity.
    const isGeneric = /** @type {any} */ (entry.chord).sectionLabel
        .toLowerCase()
        .includes('section');
    const energy = isGeneric
        ? playback.bandIntensity
        : labelEnergy * 0.6 + playback.bandIntensity * 0.4;

    // Lars Mode Intensity scales the maximum drift.
    // Max drift at 100% intensity is +/- 15 BPM (based on live recording research).
    const maxDrift = 15 * groove.larsIntensity;
    let targetOffset = (energy - 0.5) * 2 * maxDrift;

    // "Fill Rush" - Drummers often push even harder during transitions/fills
    if (groove.fillActive) {
        targetOffset += 8 * groove.larsIntensity; // Increased to +8 BPM surge during fills
    }

    // 2. Smoothly ramp towards target offset
    const lerpFactor = groove.fillActive ? 0.08 : 0.03; // Snappier transitions
    let newLarsBpmOffset =
        conductor.larsBpmOffset + (targetOffset - conductor.larsBpmOffset) * lerpFactor;

    if (Math.abs(newLarsBpmOffset) < 0.01) {
        // Only reset if we are very close to zero AND the target is zero
        if (Math.abs(targetOffset) < 0.01) {
            newLarsBpmOffset = 0;
        }
    }

    if (newLarsBpmOffset !== conductor.larsBpmOffset) {
        dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, { larsBpmOffset: newLarsBpmOffset });
    }
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {number} currentStep
 * @param {number} stepsPerMeasure
 * @param {Function} dispatch
 */
export function checkSectionTransition(state, currentStep, stepsPerMeasure, dispatch) {
    const { groove, arranger, playback, conductor } = state;
    if (!groove.enabled) {
        return;
    }

    // Find where we are
    const total = arranger.totalSteps;
    if (total === 0) {
        return;
    }
    const modStep = currentStep % total;
    const seedTimelineStartStep = groove.seedTimelineStartStep || 0;
    const seedTimelineStep = currentStep - seedTimelineStartStep;
    const seededTimelineEnd =
        groove.orchestrationMap?.[groove.orchestrationMap.length - 1]?.end || 0;
    const seededTimelineActive =
        seedTimelineStep >= 0 && (!seededTimelineEnd || seedTimelineStep < seededTimelineEnd);

    // Trigger major transitions (fills/intensity updates) only at the start of a measure.
    // We want to trigger when the measure about to be scheduled is the LAST measure of a section or the loop.
    if (modStep % stepsPerMeasure === 0) {
        const seededFill = seededTimelineActive ? groove.fillMap?.[seedTimelineStep] : null;
        const nextSeededOrchestration =
            seededTimelineActive && groove.orchestrationMap
                ? binarySearchMap(groove.orchestrationMap, seedTimelineStep + stepsPerMeasure)
                : null;

        if (seededFill && !groove.fillActive) {
            dispatch(ACTIONS.TRIGGER_FILL, {
                steps: seededFill.steps,
                startStep: currentStep,
                length: seededFill.length,
                crash: seededFill.crash,
            });

            if (playback.visualFlash) {
                triggerFlash(0.25);
            }
        }

        if (playback.autoIntensity && nextSeededOrchestration?.energyLevel !== undefined) {
            const targetEnergy = Math.max(0.1, Math.min(1.0, nextSeededOrchestration.energyLevel));
            dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, {
                targetIntensity: targetEnergy,
                stepSize: (targetEnergy - playback.bandIntensity) / stepsPerMeasure,
            });
        }

        const measureEnd = modStep + stepsPerMeasure;

        // We look at the chord at the END of the measure to see if we are transitioning.
        // This is crucial for Jazz Blues or split-bar turnarounds where the last chord
        // of the measure is different from the first.
        const effectiveStep = measureEnd - 1;
        const entry = binarySearchMap(arranger.stepMap || [], effectiveStep);

        if (!entry) {
            return;
        }
        const isLoopEnd = measureEnd >= total;

        // Find the chord at the beginning of the NEXT section/loop iteration
        const nextChordIdx = isLoopEnd
            ? 0
            : binarySearchMapIndex(arranger.stepMap || [], measureEnd);
        const nextEntry = nextChordIdx !== -1 ? arranger.stepMap[nextChordIdx] : null;

        if (
            nextEntry &&
            (isLoopEnd ||
                /** @type {any} */ (nextEntry.chord).sectionId !==
                    /** @type {any} */ (entry.chord).sectionId)
        ) {
            // --- 1. THE SOLOIST TRADE ---
            // Real musicians trade even if there isn't a drum fill!
            const { soloist: soloistState } = state;
            if (
                soloistState &&
                (soloistState.tradeMode === 'sections' ||
                    (soloistState.tradeMode === 'loops' && isLoopEnd))
            ) {
                const nextSoloState = !soloistState.enabled;
                const sbUpdate = { enabled: nextSoloState };

                if (nextSoloState) {
                    Object.assign(sbUpdate, {
                        isWaitingForEntry: true,
                        isResting: true,
                        isYielding: false,
                        activeSteps: 0,
                        restSteps: 0,
                    });
                } else {
                    Object.assign(sbUpdate, {
                        isYielding: true,
                        isWaitingForEntry: false,
                    });
                }

                dispatch(ACTIONS.UPDATE_SB, sbUpdate);
                saveCurrentState();
            }

            let shouldFill = true;

            // CHECK FOR SEAMLESS TRANSITION
            const nextSectionId = /** @type {any} */ (nextEntry.chord).sectionId;
            const nextSection = arranger.sections.find(
                (/** @type {any} */ s) => s.id === nextSectionId,
            );
            if (nextSection?.seamless) {
                shouldFill = false;
            }

            if (isLoopEnd && shouldFill) {
                const nextLoopCount = conductor.loopCount + 1;
                const nextFormIteration = conductor.formIteration + 1;
                dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, {
                    loopCount: nextLoopCount,
                    formIteration: nextFormIteration,
                });

                // Dynamic threshold based on measure length
                // If the total song length is 4 measures or fewer, we treat it as a short loop.
                const isShortLoop = arranger.totalSteps <= stepsPerMeasure * 4;

                if (isShortLoop) {
                    // How many full loop iterations before triggering a transition fill?
                    // High intensity = fill every loop (1).
                    // Medium intensity = fill every 2 loops.
                    // Low intensity = fill every 4 loops.
                    const loopFrequency =
                        playback.bandIntensity > 0.75 ? 1 : playback.bandIntensity > 0.4 ? 2 : 4;
                    shouldFill = nextLoopCount % loopFrequency === 0;
                }
            }

            if (shouldFill) {
                let targetEnergy = nextSeededOrchestration?.energyLevel;

                if (targetEnergy === undefined) {
                    targetEnergy = 0.5;
                    const currentInt = playback.bandIntensity;

                    // --- 1. THE MACRO-ARC ---
                    let macroFloor = 0.2,
                        macroCeiling = 0.6;

                    // Priority: SESSION TIMER ARC
                    if (playback.sessionTimer > 0 && playback.sessionStartTime > 0) {
                        const elapsedMins = (performance.now() - playback.sessionStartTime) / 60000;
                        const progress = Math.min(1.0, elapsedMins / playback.sessionTimer);

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
                    } else {
                        // Fallback: Repetition-Based Logic (5+ Minute Jam Logic)
                        const grandCycle = conductor.formIteration % 8;
                        if (grandCycle === 0) {
                            macroFloor = 0.15;
                            macroCeiling = 0.45;
                        } else if (grandCycle < 3) {
                            macroFloor = 0.35;
                            macroCeiling = 0.75;
                        } else if (grandCycle < 5) {
                            macroFloor = 0.6;
                            macroCeiling = 1.0;
                        } else if (grandCycle < 7) {
                            macroFloor = 0.3;
                            macroCeiling = 0.6;
                        } else {
                            macroFloor = 0.1;
                            macroCeiling = 0.35;
                        }
                    }

                    // --- 2. THE LOCAL FUNCTIONAL ROLE ---
                    if (conductor.form && /** @type {any} */ (conductor.form).sections) {
                        const nextSection = /** @type {any} */ (conductor.form).sections.find(
                            (/** @type {any} */ s) =>
                                s.id === /** @type {any} */ (nextEntry.chord).sectionId,
                        );
                        if (nextSection) {
                            const role = nextSection.role;
                            switch (role) {
                                case 'Exposition':
                                    targetEnergy = macroFloor + 0.1;
                                    break;
                                case 'Development':
                                    targetEnergy = (macroFloor + macroCeiling) / 2 + 0.1;
                                    break;
                                case 'Contrast':
                                    targetEnergy =
                                        currentInt > (macroFloor + macroCeiling) / 2
                                            ? macroFloor
                                            : macroCeiling;
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
                                    targetEnergy = getSectionEnergy(nextSection.label);
                            }
                            if (nextSection.flux > 2.6) {
                                targetEnergy += 0.1;
                            }
                            if (nextSection.iteration === 2) {
                                targetEnergy += 0.1;
                            } else if (nextSection.iteration >= 3) {
                                targetEnergy -= 0.15;
                            }
                        } else {
                            targetEnergy = getSectionEnergy(
                                /** @type {any} */ (nextEntry.chord).sectionLabel,
                            );
                        }
                    } else {
                        targetEnergy = getSectionEnergy(
                            /** @type {any} */ (nextEntry.chord).sectionLabel,
                        );
                    }

                    targetEnergy = Math.max(macroFloor, Math.min(macroCeiling, targetEnergy));
                    targetEnergy += Math.random() * 0.15 - 0.075;

                    // Genre-specific floors for auto-intensity
                    if (groove.genreFeel === 'Rock' || groove.genreFeel === 'Metal') {
                        targetEnergy = Math.max(0.35, targetEnergy);
                    }

                    targetEnergy = Math.max(0.1, Math.min(1.0, targetEnergy));

                    if (isLoopEnd && playback.autoIntensity) {
                        targetEnergy = Math.max(
                            0.3,
                            Math.min(0.95, targetEnergy + (Math.random() * 0.2 - 0.1)),
                        );
                    }
                } else {
                    targetEnergy = Math.max(0.1, Math.min(1.0, targetEnergy));
                }

                const shouldUseProceduralFallback =
                    !groove.fillMap ||
                    !seededTimelineActive ||
                    seedTimelineStep >= seededTimelineEnd;
                if (shouldUseProceduralFallback) {
                    const fillSteps = generateProceduralFill(
                        groove.genreFeel,
                        playback.bandIntensity,
                        stepsPerMeasure,
                    );
                    dispatch(ACTIONS.TRIGGER_FILL, {
                        steps: fillSteps,
                        startStep: currentStep,
                        length: stepsPerMeasure,
                        crash: true,
                    });

                    if (playback.visualFlash) {
                        triggerFlash(0.25);
                    }
                }

                if (playback.autoIntensity) {
                    dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, {
                        targetIntensity: targetEnergy,
                        stepSize: (targetEnergy - playback.bandIntensity) / stepsPerMeasure,
                    });
                }

                // --- 3. THE DRUM SEED (Creativity Memory) ---
                if (groove.creativity && nextSection) {
                    // Re-evaluate the drum seed only if it hasn't been set for this section
                    if (/** @type {any} */ (groove.sectionSeedMap)[nextSection.id] === undefined) {
                        // Generate a robust float seed (0.0 to 1.0) to serve as the abstract pool marker
                        const seed = Math.random();
                        dispatch(ACTIONS.SET_GROOVE_SEED, { sectionId: nextSection.id, seed });
                    }
                } else if (!groove.creativity && nextSection) {
                    // Reset or force to Standard if creativity is toggled off mid-song
                    dispatch(ACTIONS.SET_GROOVE_SEED, { sectionId: nextSection.id, seed: 0.5 });
                }
            }
        }
    }

    // --- Harmonic Anticipation (Ghost Kick / Bark) ---
    // Runs at the very end of a chord if it leads into a new section or song end.
    const currentChordIdx = binarySearchMapIndex(arranger.stepMap || [], modStep);
    if (currentChordIdx === -1) {
        return;
    }
    const entry = arranger.stepMap[currentChordIdx];

    const isChordEnd = modStep === entry.end - 1;
    if (isChordEnd) {
        const nextEntry = arranger.stepMap[currentChordIdx + 1];
        const isTransition =
            !nextEntry ||
            /** @type {any} */ (nextEntry.chord).sectionId !==
                /** @type {any} */ (entry.chord).sectionId;

        if (isTransition && !groove.fillActive && playback.bandIntensity > 0.4) {
            dispatch(ACTIONS.TRIGGER_FILL, {
                steps: {
                    0: [
                        { name: 'Kick', vel: 0.6 },
                        { name: 'Open', vel: 0.9 },
                    ],
                },
                startStep: currentStep,
                length: 1,
                crash: true,
            });
        }
    }
}
