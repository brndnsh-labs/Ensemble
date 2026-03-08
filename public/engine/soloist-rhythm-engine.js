import { STYLE_CONFIG, STYLE_EMPHASIS } from '../soloist-config.js';

export function generateRhythmPlan(
    startStep,
    activeSteps,
    style,
    intensity,
    stepsPerMeasure,
    stepsPerBeat,
    coordination,
    sessionSteps,
    soloistState,
    _stepInfo,
) {
    const plan = [];
    const _config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const emphasisMap = STYLE_EMPHASIS[style] || STYLE_EMPHASIS.scalar;

    let notesInPhrase = 0;

    // --- Call & Response: Rhythmic Mirroring ---
    if (
        ['blues', 'jazz'].includes(style) &&
        soloistState.phraseContext?.role === 'response' &&
        soloistState.phraseContext?.skeleton?.length > 0 &&
        Math.random() < 0.8 // 80% chance to follow skeleton for response
    ) {
        for (const relStep of soloistState.phraseContext.skeleton) {
            const stepTarget = startStep + relStep;
            if (stepTarget >= startStep + activeSteps) {
                continue;
            }

            const measureStep = stepTarget % stepsPerMeasure;
            const stepInBeat = measureStep % stepsPerBeat;
            const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
            const isBeatStart = stepInBeat === 0;
            const isDownbeat = measureStep === 0;
            const isBackbeat = (beatInMeasure === 1 || beatInMeasure === 3) && isBeatStart;

            let stepVelocity = 0.6 + intensity * 0.4;
            if (isDownbeat) {
                stepVelocity *= 1.2;
            } else if (isBackbeat) {
                stepVelocity *= 1.1;
            }

            plan.push({
                stepTarget,
                velocity: Math.min(1.25, stepVelocity),
                isStrongBeat: isBeatStart || isDownbeat || isBackbeat,
                durationSteps: 1,
            });
        }
    } else {
        for (let step = startStep; step < startStep + activeSteps; step++) {
            // Evaluate everything as if we are on 'step'
            const measureStep = step % stepsPerMeasure;
            const stepInBeat = measureStep % stepsPerBeat;
            const isBeatStart = stepInBeat === 0;
            const isDownbeat = measureStep === 0;

            // This simulates a backbeat on beats 2 and 4 (if 4/4)
            const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
            const isBackbeat = (beatInMeasure === 1 || beatInMeasure === 3) && isBeatStart;

            const remainingSteps = coordination.sectionEnd - step;
            const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;

            const isSectionDownbeat =
                step === coordination.sectionStart && soloistState.transitionState === 'lead_in';

            // Map to 16-step emphasis map to handle any meter
            const emphasisIdx = Math.floor((measureStep / stepsPerMeasure) * 16) % 16;
            const baseAttackProb = emphasisMap[emphasisIdx];

            const warmUpScale = Math.min(1.0, 0.5 + ((sessionSteps || 0) / 64) * 0.5);
            const intensityScale = 0.5 + intensity * 2.0;
            let attackProb = baseAttackProb * intensityScale * warmUpScale;

            // Apply persistent rhythmic entropy if set
            if (soloistState.rhythmicEntropy !== undefined) {
                // rhythmicEntropy ranges roughly from -1.0 to 1.0. 
                // Using multiplicative scaling to keep bounds somewhat reasonable.
                attackProb *= (1.0 + soloistState.rhythmicEntropy * 0.5);
            }

            // Syncopation Arc: gently favor syncopation as the session progresses
            // Driven by sessionSteps over multiple choruses (e.g., 256 steps = 16 measures)
            const driftFactor = Math.sin(((sessionSteps || 0) / 512) * Math.PI); // Half-cycle every 16 measures
            if (driftFactor > 0.0) {
                const isSixteenthNote = stepInBeat % 2 !== 0; // Offbeat
                if (isSixteenthNote) {
                    attackProb *= 1.0 + driftFactor * 1.0; // Boost offbeats during drift
                } else {
                    attackProb *= 1.0 - driftFactor * 0.15; // Slightly suppress downbeats
                }
            }

            // Phrase Contextual Scaling (Fatigue)
            if (notesInPhrase > 8) {
                attackProb *= 0.8;
            }

            // Rhythmic Simplification at Low Intensity:
            if (intensity < 0.4) {
                const isSixteenthNote = stepInBeat % 2 !== 0; // Steps 1, 3
                const isOffbeatEighth = stepInBeat === stepsPerBeat / 2; // Step 2 (the "and")

                if (isSixteenthNote) {
                    attackProb *= intensity * 1.5; // Drastic penalty for 16ths
                } else if (isOffbeatEighth) {
                    attackProb *= 0.4 + intensity; // Moderate penalty for offbeat 8ths
                }
            }

            if (isFinalMeasure && soloistState.transitionState === 'lead_in') {
                attackProb *= 1.5;
            }

            // Boost downbeats to ensure resolution
            if (isDownbeat) {
                attackProb += 0.2;
            }

            // Since we are projecting into the future, coordination stepCoordination might not match perfectly,
            // but we'll use stepCoord for the *current* real step if we want, or ignore it for future steps.
            // Actually, coordination.stepCoordination is only for the current real step.
            // We'll leave it out of the future projection, or use a pseudo-kick map if needed.
            // Let's keep it simple and just use the step coordinate if it's the exact current step:
            if (step === startStep) {
                const stepCoord = coordination.stepCoordination || {};
                if (stepCoord.kickHit) {
                    attackProb += 0.2;
                }
                if (stepCoord.snareHit) {
                    attackProb += 0.2;
                }
            }

            // Turnaround Flourishes (Structural Signaling)
            const stepCoord = coordination.stepCoordination || {};
            if (stepCoord.isMeasureEnd) {
                attackProb *= 1.3; // Boost density at measure ends
            }

            // --- Jazz Specifics ---
            if (style === 'jazz') {
                const profile = soloistState.phraseContext?.profile;
                // Double-time bursts for Bird/Coltrane
                if ((profile === 'bird' || profile === 'coltrane') && intensity > 0.7) {
                    if (stepInBeat % 2 !== 0) {
                        attackProb *= 1.5; // Favor 16ths
                    }
                }
            }

            if (coordination.bypassRhythm) {
                attackProb = 1.0;
            }
            if (isSectionDownbeat) {
                attackProb = 1.0;
            }

            if (Math.random() <= attackProb) {
                notesInPhrase++;

                let stepVelocity = 0.6 + intensity * 0.4;
                if (isDownbeat) {
                    stepVelocity *= 1.25;
                } else if (isBackbeat) {
                    stepVelocity *= 1.15;
                } else if (isBeatStart || stepInBeat === stepsPerBeat / 2) {
                    stepVelocity *= 1.05;
                }

                // Jazz Ghosting
                if (style === 'jazz' && !isBeatStart && Math.random() < 0.4) {
                    stepVelocity *= 0.6; // Soft ghost note
                }

                plan.push({
                    stepTarget: step,
                    velocity: Math.min(1.25, stepVelocity),
                    isStrongBeat: isBeatStart || isDownbeat || isBackbeat,
                    durationSteps: 1, // Placeholder
                });
            }
        }
    }

    // Calculate durations based on gaps
    for (let i = 0; i < plan.length; i++) {
        const current = plan[i];
        const next = i < plan.length - 1 ? plan[i + 1] : null;
        // The last note can ring out until the end of the active phrase
        const gap = next
            ? next.stepTarget - current.stepTarget
            : Math.max(1, startStep + activeSteps - current.stepTarget);

        let baseDuration = gap;
        if (['funk', 'disco', 'ska'].includes(style)) {
            baseDuration = 1;
        } else if (['blues', 'neo'].includes(style)) {
            baseDuration = gap;
        } else {
            baseDuration = Math.min(gap, 4);
        }

        // Scale final duration slightly by overall band intensity
        current.durationSteps = Math.max(1, Math.round(baseDuration * (0.8 + intensity * 0.4)));
        // Ensure duration doesn't exceed gap (unless it's the last note and we allow ringing, though even then we cap it)
        if (next && current.durationSteps > gap) {
            current.durationSteps = gap;
        }
    }

    return plan;
}
