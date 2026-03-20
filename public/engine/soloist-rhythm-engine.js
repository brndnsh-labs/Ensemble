import { getState } from '../state.js';
import { STYLE_CONFIG, STYLE_EMPHASIS } from './soloist-config.js';

/**
 * @param {number} startStep
 * @param {number} activeSteps
 * @param {string} style
 * @param {number} intensity
 * @param {number} stepsPerMeasure
 * @param {number} stepsPerBeat
 * @param {any} coordination
 * @param {number} sessionSteps
 * @param {import('../state/instruments.js').SoloistState} soloistState
 * @param {import('../types.js').StepInfo | null} [_stepInfo=null]
 */
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
    _stepInfo = null,
) {
    /** @type {any[]} */
    const plan = [];
    const _config = /** @type {any} */ (STYLE_CONFIG)[style] || STYLE_CONFIG.scalar;
    const emphasisMap = /** @type {any} */ (STYLE_EMPHASIS)[style] || STYLE_EMPHASIS.scalar;

    let notesInPhrase = 0;
    const globalState = getState();
    const playback = globalState.playback;

    // --- LOOP 0 OVERRIDE: Strict deterministic playback of the Head ---
    if (
        playback.currentLoopCount === 0 &&
        soloistState.sessionSeed &&
        soloistState.sessionSeed.notes &&
        soloistState.sessionSeed.notes.length > 0
    ) {
        const { notes, loopLengthSteps } = soloistState.sessionSeed;
        for (let step = startStep; step < startStep + activeSteps; step++) {
            const stepInLoop = step % loopLengthSteps;
            const seedNote = notes.find((/** @type {any} */ n) => n.step === stepInLoop);

            if (seedNote) {
                plan.push({
                    stepTarget: step,
                    velocity: 0.8 + intensity * 0.2, // Clean, consistent velocity
                    isStrongBeat: true,
                    durationSteps: seedNote.durationSteps,
                    isSustained: false,
                    vibrato: false,
                });
            }
        }
        return plan;
    }

    // --- Call & Response: Rhythmic Mirroring ---
    if (
        ['blues', 'jazz', 'rock', 'scalar'].includes(style) &&
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
        let sustainStepsRemaining = 0;

        for (let step = startStep; step < startStep + activeSteps; step++) {
            if (sustainStepsRemaining > 0) {
                sustainStepsRemaining--;
                continue;
            }

            // Evaluate everything as if we are on 'step'
            const measureStep = ((step % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
            const stepInBeat = ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
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
            let baseAttackProb = emphasisMap[emphasisIdx];

            // --- Emphasis Mutation: Prevent Stagnant Rhythms ---
            if (['rock', 'scalar', 'blues'].includes(style)) {
                // Gently shift emphasis based on session progress to prevent 100% predictability
                const mutation = Math.sin((sessionSteps || 0) / 128) * 0.15;
                if (emphasisIdx % 4 !== 0) {
                    // Boost off-beats occasionally
                    baseAttackProb += Math.max(0, mutation);
                } else {
                    // Slightly nudge downbeats
                    baseAttackProb -= Math.max(0, mutation * 0.5);
                }
            }

            const warmUpScale = Math.min(1.0, 0.5 + ((sessionSteps || 0) / 64) * 0.5);
            const intensityScale = 0.5 + intensity * 2.0;
            let attackProb = baseAttackProb * intensityScale * warmUpScale;

            // --- Rock Profile Bursts (EVH / Beck) ---
            if ((style === 'rock' || style === 'scalar') && intensity > 0.65) {
                const profile = soloistState.phraseContext?.profile;
                if (profile === 'evh' || profile === 'beck') {
                    if (stepInBeat % 2 !== 0) {
                        attackProb *= 1.6; // Boost 16ths for shreddy/unpredictable feel
                    }
                }
            }

            // Apply persistent rhythmic entropy if set
            if (soloistState.rhythmicEntropy !== undefined) {
                // rhythmicEntropy ranges roughly from -1.0 to 1.0.
                // Using multiplicative scaling to keep bounds somewhat reasonable.
                attackProb *= 1.0 + soloistState.rhythmicEntropy * 0.5;
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

            // --- Dynamic Head: Rhythmic Seeding ---
            const sessionSeed = soloistState.sessionSeed;
            if (sessionSeed && sessionSeed.notes.length > 0) {
                const { notes, loopLengthSteps } = sessionSeed;
                const stepInLoop = step % loopLengthSteps;
                const hasSeedNote = notes.some((/** @type {any} */ n) => n.step === stepInLoop);
                if (hasSeedNote) {
                    attackProb += 0.4; // Strong boost for seed points
                }
            }

            if (isFinalMeasure && soloistState.transitionState === 'lead_in') {
                attackProb *= 1.5;
            }

            // PRE-HEAT: Boost density during count-in (negative steps)
            if (step < 0 && soloistState.transitionState === 'lead_in') {
                attackProb *= 1.8;
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

                // --- STRATEGIC SUSTAIN LOGIC ---
                let isSustained = false;
                const baseSustainProb = _config.sustainProb || 0;
                let finalSustainProb = baseSustainProb;

                // 1. Resolution Hold: Boost sustain if we land on a strong beat after a period of density
                if (notesInPhrase >= 6 && (isDownbeat || isBeatStart)) {
                    finalSustainProb += 0.3 * intensity;
                }

                // 2. Structural Bridge: Sustain leading into or across section boundaries
                if (isFinalMeasure && stepInBeat >= stepsPerBeat / 2) {
                    finalSustainProb += 0.4;
                }

                // 3. Dynamic Contrast: Sparse sections favor holding notes
                if (
                    soloistState.rhythmicEntropy !== undefined &&
                    soloistState.rhythmicEntropy < -0.3
                ) {
                    finalSustainProb += 0.2;
                }

                // 4. Greats Profiles: Gilmour-specific lyrical sustain
                if (soloistState.phraseContext?.profile === 'gilmour') {
                    finalSustainProb += 0.2;
                }

                if (Math.random() < finalSustainProb) {
                    isSustained = true;
                    // Held for a logical amount of time (4 steps = 1 beat, 8 steps = 2 beats)
                    const maxSustain = _config.maxSustainSteps || 8;
                    const sustainLength = Math.floor(3 + Math.random() * maxSustain);
                    sustainStepsRemaining = sustainLength;
                }

                plan.push({
                    stepTarget: step,
                    velocity: Math.min(1.25, stepVelocity),
                    isStrongBeat: isBeatStart || isDownbeat || isBackbeat,
                    durationSteps: isSustained ? sustainStepsRemaining + 1 : 1,
                    isSustained,
                    vibrato: isSustained,
                });
            } else {
                // Not an attack step
            }
        }
    }

    // --- Rhythmic Mirroring Fallback ---
    // (If mirroring logic didn't push anything, ensuring we have a valid plan object)
    if (plan.length === 0 && coordination.bypassRhythm) {
        plan.push({
            stepTarget: startStep,
            velocity: 0.8,
            isStrongBeat: true,
            durationSteps: activeSteps,
            isSustained: false,
            vibrato: false,
        });
    }

    // Default flags for mirroring or other paths
    plan.forEach((node) => {
        if (node.isSustained === undefined) {
            node.isSustained = false;
        }
        if (node.vibrato === undefined) {
            node.vibrato = false;
        }
    });

    // Calculate durations based on gaps
    for (let i = 0; i < plan.length; i++) {
        const current = plan[i];
        const next = i < plan.length - 1 ? plan[i + 1] : null;
        // The last note can ring out until the end of the active phrase
        const gap = next
            ? next.stepTarget - current.stepTarget
            : Math.max(1, startStep + activeSteps - current.stepTarget);

        let baseDuration = gap;
        if (current.isSustained) {
            baseDuration = current.durationSteps;
        } else if (['funk', 'disco', 'ska'].includes(style)) {
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
