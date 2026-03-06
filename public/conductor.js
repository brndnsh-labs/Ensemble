import { generateProceduralFill } from './fills.js';
import { getSectionEnergy } from './form-analysis.js';
import { debounceSaveState, saveCurrentState } from './persistence.js';
import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';
import { triggerFlash } from './ui.js';

export const conductorState = {
    target: 0.35,
    stepSize: 0.0005,
    loopCount: 0,
    formIteration: 0, // Tracks how many times the ENTIRE song has looped
    form: null,
    larsBpmOffset: 0,
};

export function applyConductor() {
    const { playback, soloist, groove, chords, bass, harmony, arranger } = getState();
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
    const isSoloistBusy = soloist.enabled && soloist.busySteps > 0;
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
    const currentEntry = arranger.stepMap.find((e) => modStep >= e.start && modStep < e.end);
    if (currentEntry) {
        const label = currentEntry.chord.sectionLabel.toLowerCase();
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

    // --- 5. Intensity-Aware Mixing ---
    if (playback.audio) {
        const time = playback.audio.currentTime;
        const ramp = 0.5;

        // Master Limiter: Tighter at high intensity to glue the mix
        if (playback.masterLimiter) {
            const targetThreshold = -0.5 - intensity * 1.5; // -0.5 to -2.0 dB
            const targetRatio = 12 + intensity * 8; // 12:1 to 20:1
            playback.masterLimiter.threshold.setTargetAtTime(targetThreshold, time, ramp);
            playback.masterLimiter.ratio.setTargetAtTime(targetRatio, time, ramp);
        }

        // --- Reverb-Intensity Linking ---
        // High Intensity = Dry (0.1 - 0.3), Low Intensity = Wet (0.4 - 0.6)
        const targetReverb = 0.6 - intensity * 0.4;

        const reverbNodes = [
            { state: chords, gain: 'chordsReverb' },
            { state: bass, gain: 'bassReverb' },
            { state: soloist, gain: 'soloistReverb' },
            { state: harmony, gain: 'harmoniesReverb' },
            { state: groove, gain: 'drumsReverb' },
        ];

        reverbNodes.forEach((node) => {
            // Apply a slight genre-specific bias to the auto-reverb
            let bias = 1.0;
            if (node.gain === 'drumsReverb') {
                bias = 0.7; // Keep drums dryer
            } else if (node.gain === 'soloistReverb') {
                bias = 1.2; // Keep soloist wetter
            }

            const finalReverb = Math.max(0.001, targetReverb * bias);
            node.state.reverb = finalReverb;

            if (playback[node.gain]) {
                playback[node.gain].gain.setTargetAtTime(finalReverb, time, ramp);
            }
        });
    }

    debounceSaveState();
}

/**
 * Updates auto-intensity and monitors the band's "conversation".
 */
export function updateAutoConductor() {
    const { playback } = getState();
    if (!playback.autoIntensity || !playback.isPlaying) {
        return;
    }

    if (Math.abs(playback.bandIntensity - conductorState.target) > 0.001) {
        // Asymmetric ramping: humans tend to build energy gradually but can stop/drop quickly
        const multiplier = playback.bandIntensity > conductorState.target ? 2.5 : 1.0;
        let newIntensity =
            playback.bandIntensity +
            (playback.bandIntensity < conductorState.target
                ? Math.abs(conductorState.stepSize)
                : -Math.abs(conductorState.stepSize)) *
                multiplier;
        newIntensity = Math.max(0.01, Math.min(1.0, newIntensity));

        if (newIntensity !== playback.bandIntensity) {
            dispatch(ACTIONS.SET_BAND_INTENSITY, newIntensity);
        }

        applyConductor();
    }
}

/**
 * Calculates and applies tempo drift for "Lars Mode".
 */
export function updateLarsTempo(currentStep) {
    const { groove, playback, arranger } = getState();
    if (!groove.larsMode || !playback.isPlaying) {
        if (conductorState.larsBpmOffset !== 0) {
            conductorState.larsBpmOffset = 0;
            updateBpmUI();
        }
        return;
    }

    // 1. Determine target drift based on section energy and global band intensity
    const total = arranger.totalSteps;
    if (total === 0) {
        return;
    }
    const modStep = currentStep % total;
    const entry = arranger.stepMap.find((e) => modStep >= e.start && modStep < e.end);
    if (!entry) {
        return;
    }

    // Use section label energy as a base (-0.5 to +0.5 normalized drift)
    const labelEnergy = getSectionEnergy(entry.chord.sectionLabel); // 0.1 to 0.9

    // Blend with global band intensity (which includes macro-arc and randomness)
    // If the label is generic (e.g., "Section 1"), rely more on bandIntensity.
    const isGeneric = entry.chord.sectionLabel.toLowerCase().includes('section');
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
    conductorState.larsBpmOffset += (targetOffset - conductorState.larsBpmOffset) * lerpFactor;

    if (Math.abs(conductorState.larsBpmOffset) < 0.01) {
        // Only reset if we are very close to zero AND the target is zero
        if (Math.abs(targetOffset) < 0.01) {
            conductorState.larsBpmOffset = 0;
        }
    }

    updateBpmUI();
}

function updateBpmUI() {
    const { groove, playback } = getState();
    const bpmInput = document.getElementById('bpmInput');
    const bpmControlGroup = document.getElementById('bpmControlGroup');
    const bpmLabel = document.getElementById('bpmLabel');

    if (!bpmInput || !bpmControlGroup) {
        return;
    }

    const baseBpm = playback.bpm;
    const offset = conductorState.larsBpmOffset;
    const effectiveBpm = Math.round(baseBpm + offset);

    if (groove.larsMode && playback.isPlaying) {
        bpmControlGroup.classList.add('lars-active');

        // Calculate intensity of the color (0 to 1)
        // Saturate the color shift at 6 BPM offset
        const intensity = Math.min(1, Math.abs(offset) / 6);

        if (Math.abs(offset) > 0.1) {
            const isPushing = offset > 0;
            const targetColor = isPushing ? 'var(--blue)' : 'var(--red)';
            const mixPercent = 20 + Math.round(intensity * 80);
            const blendedColor = `color-mix(in srgb, var(--text-color), ${targetColor} ${mixPercent}%)`;

            bpmInput.style.color = blendedColor;

            if (bpmLabel) {
                // On desktop (label visible), show secondary counter
                const direction = isPushing ? '↗' : '↘';
                bpmLabel.textContent = `${effectiveBpm} ${direction}`;
                bpmLabel.style.color = blendedColor;
            }
        } else {
            bpmInput.style.color = '';
            if (bpmLabel) {
                bpmLabel.textContent = 'BPM';
                bpmLabel.style.color = '';
            }
        }
    } else {
        bpmControlGroup.classList.remove('lars-active');
        bpmInput.style.color = '';
        if (bpmLabel) {
            bpmLabel.textContent = 'BPM';
            bpmLabel.style.color = '';
        }
    }
}

export function checkSectionTransition(currentStep, stepsPerMeasure) {
    const { groove, arranger, playback } = getState();
    if (!groove.enabled) {
        return;
    }

    // Find where we are
    const total = arranger.totalSteps;
    if (total === 0) {
        return;
    }
    const modStep = currentStep % total;

    // Trigger major transitions (fills/intensity updates) only at the start of a measure.
    // We want to trigger when the measure about to be scheduled is the LAST measure of a section or the loop.
    if (modStep % stepsPerMeasure === 0) {
        const measureEnd = modStep + stepsPerMeasure;

        // We look at the chord at the END of the measure to see if we are transitioning.
        // This is crucial for Jazz Blues or split-bar turnarounds where the last chord
        // of the measure is different from the first.
        const effectiveStep = measureEnd - 1;
        const entry = arranger.stepMap.find(
            (e) => effectiveStep >= e.start && effectiveStep < e.end,
        );

        if (!entry) {
            return;
        }
        const isLoopEnd = measureEnd >= total;

        // Find the chord at the beginning of the NEXT section/loop iteration
        const nextChordIdx = isLoopEnd
            ? 0
            : arranger.stepMap.findIndex((e) => measureEnd >= e.start && measureEnd < e.end);
        const nextEntry = nextChordIdx !== -1 ? arranger.stepMap[nextChordIdx] : null;

        if (nextEntry && (isLoopEnd || nextEntry.chord.sectionId !== entry.chord.sectionId)) {
            // --- 1. THE SOLOIST TRADE ---
            // Real musicians trade even if there isn't a drum fill!
            const { soloist: soloistState } = getState();
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
                dispatch(ACTIONS.SET_ACTIVE_TAB, {
                    module: 'soloist',
                    tab: soloistState.activeTab,
                });
                saveCurrentState();
            }

            let shouldFill = true;

            // CHECK FOR SEAMLESS TRANSITION
            const nextSectionId = nextEntry.chord.sectionId;
            const nextSection = arranger.sections.find((s) => s.id === nextSectionId);
            if (nextSection?.seamless) {
                shouldFill = false;
            }

            if (isLoopEnd && shouldFill) {
                conductorState.loopCount++;
                conductorState.formIteration++;

                if (arranger.totalSteps <= 64) {
                    const freq =
                        playback.bandIntensity > 0.75 ? 1 : playback.bandIntensity > 0.4 ? 2 : 4;
                    shouldFill = conductorState.loopCount % freq === 0;
                }
            }

            if (shouldFill) {
                let targetEnergy = 0.5;
                const currentInt = playback.bandIntensity;

                // --- 1. THE MACRO-ARC ---
                let macroFloor = 0.2,
                    macroCeiling = 0.6;

                // Priority: SESSION TIMER ARC
                if (playback.sessionTimer > 0 && playback.sessionStartTime > 0) {
                    const elapsedMins = (performance.now() - playback.sessionStartTime) / 60000;
                    const progress = Math.min(1.0, elapsedMins / playback.sessionTimer);

                    if (progress < 0.15) {
                        // Initial (0-15%)
                        macroFloor = 0.2;
                        macroCeiling = 0.45;
                    } else if (progress < 0.4) {
                        // Building (15-40%)
                        macroFloor = 0.4;
                        macroCeiling = 0.7;
                    } else if (progress < 0.65) {
                        // The Pocket (40-65%)
                        macroFloor = 0.5;
                        macroCeiling = 0.8;
                    } else if (progress < 0.85) {
                        // Climax (65-85%)
                        macroFloor = 0.7;
                        macroCeiling = 1.0;
                    } else {
                        // Cool Down (85-100%)
                        macroFloor = 0.2;
                        macroCeiling = 0.5;
                    }
                } else {
                    // Fallback: Repetition-Based Logic (5+ Minute Jam Logic)
                    const grandCycle = conductorState.formIteration % 8;
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
                if (conductorState.form?.sections) {
                    const nextSection = conductorState.form.sections.find(
                        (s) => s.id === nextEntry.chord.sectionId,
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
                        targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                    }
                } else {
                    targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                }

                targetEnergy = Math.max(macroFloor, Math.min(macroCeiling, targetEnergy));
                targetEnergy += Math.random() * 0.15 - 0.075;
                targetEnergy = Math.max(0.1, Math.min(1.0, targetEnergy));

                if (isLoopEnd && playback.autoIntensity) {
                    targetEnergy = Math.max(
                        0.3,
                        Math.min(0.95, targetEnergy + (Math.random() * 0.2 - 0.1)),
                    );
                }

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

                if (playback.autoIntensity) {
                    conductorState.target = targetEnergy;
                    conductorState.stepSize =
                        (conductorState.target - playback.bandIntensity) / stepsPerMeasure;
                }

                // --- 3. THE DRUM SEED (Creativity Memory) ---
                if (groove.creativity && nextSection) {
                    // Re-evaluate the drum seed only if it hasn't been set for this section
                    if (groove.sectionSeedMap[nextSection.id] === undefined) {
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
    const currentChordIdx = arranger.stepMap.findIndex(
        (e) => modStep >= e.start && modStep < e.end,
    );
    if (currentChordIdx === -1) {
        return;
    }
    const entry = arranger.stepMap[currentChordIdx];

    const isChordEnd = modStep === entry.end - 1;
    if (isChordEnd) {
        const nextEntry = arranger.stepMap[currentChordIdx + 1];
        const isTransition = !nextEntry || nextEntry.chord.sectionId !== entry.chord.sectionId;

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
