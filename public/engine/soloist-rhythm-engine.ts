import type { SoloistState } from '../state/instruments.js';
import type { StepInfo } from '../types.js';
import { STYLE_CONFIG } from './soloist-config.js';
import { isSoloistMonophonicMode } from './soloist-mode-policy.js';

type ResponseTransform = 'exact' | 'delay' | 'echo' | 'compress';
type ResponseMode = 'paraphrase' | 'development' | 'free';
type ResponseSource = 'section' | 'form' | 'recent' | 'seed' | 'free';

function pickResponseTransform(
    responseConfig: any,
    responseMode: ResponseMode,
    responseSource: ResponseSource = 'recent',
): ResponseTransform {
    const options: Array<[ResponseTransform, number]> =
        responseMode === 'development'
            ? [
                  ['exact', 0.65],
                  ['delay', 0.7 + (responseConfig?.delayBias || 0)],
                  ['echo', 0.8 + (responseConfig?.echoBias || 0)],
                  ['compress', 0.9 + (responseConfig?.compressionBias || 0)],
              ]
            : [
                  ['exact', 1.5 + (responseConfig?.rhythmReuse || 0)],
                  ['delay', 0.45 + (responseConfig?.delayBias || 0)],
                  ['echo', 0.35 + (responseConfig?.echoBias || 0)],
                  ['compress', 0.25 + (responseConfig?.compressionBias || 0)],
              ];
    const spaceBias = Math.max(0, Math.min(0.75, responseConfig?.spaceBias || 0));
    const recallSpaceScale =
        responseSource === 'section' ? 1 : responseSource === 'form' ? 0.78 : 0;
    if (recallSpaceScale > 0 && spaceBias > 0) {
        options[0][1] *= Math.max(0.35, 1 - spaceBias * 0.5 * recallSpaceScale);
        options[1][1] += spaceBias * 0.35 * recallSpaceScale;
        options[2][1] += spaceBias * 0.45 * recallSpaceScale;
        options[3][1] += spaceBias * 0.18 * recallSpaceScale;
    }
    const totalWeight = options.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * totalWeight;
    for (const [name, weight] of options) {
        roll -= weight;
        if (roll <= 0) {
            return name;
        }
    }
    return 'exact';
}

function getStepStrength(stepTarget: number, stepsPerMeasure: number, stepsPerBeat: number) {
    const measureStep = ((stepTarget % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
    const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
    const isBeatStart = measureStep % stepsPerBeat === 0;
    const isDownbeat = measureStep === 0;
    const isBackbeat = (beatInMeasure === 1 || beatInMeasure === 3) && isBeatStart;
    return {
        isStrongBeat: isBeatStart || isDownbeat || isBackbeat,
        isDownbeat,
        isBackbeat,
    };
}

function buildResponsePlanFromSignature(
    startStep: number,
    activeSteps: number,
    stepsPerMeasure: number,
    stepsPerBeat: number,
    intensity: number,
    signature: any,
    responseConfig: any,
    responseMode: ResponseMode,
    responseSource: ResponseSource,
): any[] {
    if (!signature?.notes?.length) {
        return [];
    }

    const transform = pickResponseTransform(responseConfig, responseMode, responseSource);
    const delaySteps = Math.max(1, Math.floor(stepsPerBeat / 2));
    const maxResponseNotes = Math.max(2, Math.round(responseConfig?.maxResponseNotes || 8));
    const spaceBias = Math.max(0, Math.min(0.75, responseConfig?.spaceBias || 0));
    const sourceNotes = signature.notes.slice(0, maxResponseNotes);
    const responseNotes = sourceNotes
        .map((sourceNote: any, index: number) => {
            const isStructural =
                index === 0 ||
                index === sourceNotes.length - 1 ||
                sourceNote.isAnchor ||
                sourceNote.isStrongBeat ||
                Boolean(sourceNote.tripletPlacement);
            const skipProb =
                !isStructural && spaceBias > 0
                    ? responseSource === 'section'
                        ? spaceBias
                        : responseSource === 'form'
                          ? spaceBias * 0.78
                          : spaceBias * 0.6
                    : 0;
            if (skipProb > 0 && Math.random() < skipProb) {
                return null;
            }

            let stepOffset = Math.max(0, Math.round(sourceNote.stepOffset || 0));
            if (transform === 'delay') {
                stepOffset += delaySteps;
            } else if (transform === 'echo') {
                stepOffset += index === 0 ? stepsPerBeat : delaySteps;
            } else if (transform === 'compress' && index > 0) {
                const compressionScale = responseMode === 'development' ? 0.78 : 0.9;
                stepOffset = Math.max(1, Math.round(stepOffset * compressionScale));
            }

            if (stepOffset >= activeSteps) {
                return null;
            }

            const keepTriplet =
                sourceNote.tripletPlacement && Math.random() < (responseConfig?.tripletCarry || 0);
            return {
                stepOffset,
                sourceNote,
                keepTriplet,
            };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.stepOffset - b.stepOffset);
    if (responseNotes.length === 0) {
        return [];
    }

    const deduped = new Map<number, any>();
    responseNotes.forEach((responseNote: any, index: number) => {
        const stepTarget = startStep + responseNote.stepOffset;
        const durationSteps =
            transform === 'compress' && index > 0
                ? Math.max(1, Math.round((responseNote.sourceNote.durationSteps || 1) * 0.85))
                : Math.max(1, Math.round(responseNote.sourceNote.durationSteps || 1));
        const strength = getStepStrength(stepTarget, stepsPerMeasure, stepsPerBeat);
        const velocityBase =
            (responseNote.sourceNote.velocity || 0.72) * (strength.isStrongBeat ? 1.06 : 0.96);
        const existing = deduped.get(stepTarget);
        const nextNode = {
            stepTarget,
            velocity: Math.min(1.25, Math.max(0.45, velocityBase + intensity * 0.08)),
            isStrongBeat: strength.isStrongBeat,
            durationSteps,
            isSustained: durationSteps > 1,
            vibrato: durationSteps >= stepsPerBeat,
            tripletPlacement: responseNote.keepTriplet
                ? responseNote.sourceNote.tripletPlacement || null
                : null,
            timingOffset: responseNote.keepTriplet ? responseNote.sourceNote.timingOffset || 0 : 0,
            responsePitchClass: responseNote.sourceNote.pitchClass,
            responseDirection: responseNote.sourceNote.direction || 0,
            responseEntryTarget: index === 0,
            responseCadenceTarget: index === responseNotes.length - 1,
            responseSource,
        };
        if (!existing || nextNode.responseCadenceTarget || nextNode.isStrongBeat) {
            deduped.set(stepTarget, nextNode);
        }
    });

    return [...deduped.values()].sort((a, b) => a.stepTarget - b.stepTarget);
}

export function generateRhythmPlan(
    startStep: number,
    activeSteps: number,
    style: string,
    intensity: number,
    stepsPerMeasure: number,
    stepsPerBeat: number,
    coordination: any,
    sessionSteps: number,
    soloistState: SoloistState,
    _stepInfo: StepInfo | null = null,
): any[] {
    const plan: any[] = [];
    const _config = (STYLE_CONFIG as any)[style] || STYLE_CONFIG.scalar;
    const responseConfig = _config.motivicResponse || null;
    const hasDynamicHeadSeed = Boolean(soloistState.session.seed?.notes?.length);
    const isLineStyle = ['jazz', 'bird', 'bossa'].includes(style);
    const isMonophonicMode = isSoloistMonophonicMode(soloistState.mode);
    const minPhraseNotes = Math.max(0, _config.minNotesPerPhrase || 0);
    const responseSignature = soloistState.session.currentPhrase.context?.responseSignature;
    const responseMode = (soloistState.session.currentPhrase.context?.responseMode ||
        'free') as ResponseMode;
    const responseSource = (soloistState.session.currentPhrase.context?.responseSource ||
        'free') as ResponseSource;

    let notesInPhrase = 0;

    // --- Call & Response: Rhythmic Mirroring ---
    if (
        hasDynamicHeadSeed &&
        responseConfig?.enabled &&
        soloistState.session.currentPhrase.context?.role === 'response' &&
        (responseSignature?.notes?.length ?? 0) > 0
    ) {
        plan.push(
            ...buildResponsePlanFromSignature(
                startStep,
                activeSteps,
                stepsPerMeasure,
                stepsPerBeat,
                intensity,
                responseSignature,
                responseConfig,
                responseMode,
                responseSource,
            ),
        );
    } else if (
        ['blues', 'jazz', 'rock', 'scalar'].includes(style) &&
        soloistState.session.currentPhrase.context?.role === 'response' &&
        soloistState.session.currentPhrase.context?.skeleton?.length > 0 &&
        Math.random() < 0.8 // 80% chance to follow skeleton for response
    ) {
        for (const relStep of soloistState.session.currentPhrase.context.skeleton) {
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
        let silenceSteps = stepsPerBeat;
        let phraseCooldownSteps = 0;

        for (let step = startStep; step < startStep + activeSteps; step++) {
            if (sustainStepsRemaining > 0) {
                sustainStepsRemaining--;
                continue;
            }
            if (phraseCooldownSteps > 0) {
                phraseCooldownSteps--;
                silenceSteps++;
                continue;
            }

            // Evaluate everything as if we are on 'step'
            const measureStep = ((step % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
            const stepInBeat = ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
            const isOffbeatEighth = stepInBeat === stepsPerBeat / 2;
            const isSixteenthSubdivision = stepInBeat % 2 !== 0;

            // Use stepInfo if available for high-precision meter logic
            const currentStepInfo = _stepInfo && _stepInfo.mStep === measureStep ? _stepInfo : null;

            const isBeatStart = currentStepInfo ? currentStepInfo.isBeatStart : stepInBeat === 0;
            const isDownbeat = currentStepInfo ? currentStepInfo.isMeasureStart : measureStep === 0;
            const isBackbeat = currentStepInfo ? currentStepInfo.isBackbeat : false;
            const isStrongBeat = isBeatStart || isDownbeat || isBackbeat;

            const remainingSteps = coordination.sectionEnd - step;
            const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;

            const isSectionDownbeat =
                step === coordination.sectionStart &&
                soloistState.session.phrasing.transitionState === 'lead_in';

            // Meter-Aware Emphasis
            const emphasisIdx = Math.floor((measureStep / stepsPerMeasure) * 16) % 16;
            let baseAttackProb = 0.1;

            if (isDownbeat) {
                baseAttackProb = 0.8;
            } else if (isBackbeat) {
                baseAttackProb = 0.6;
            } else if (isBeatStart) {
                baseAttackProb = 0.4;
            } else if (currentStepInfo?.isPulse) {
                baseAttackProb = 0.5;
            }

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

            // --- Genre-Anchored Intensity Scaling ---
            // Use the config's rhythmicDensity as the 'medium' point (0.5 intensity).
            // Scale between 50% and 150% of the baseline density based on intensity.
            const rhythmicDensity = _config.rhythmicDensity || 0.5;
            const densityScale = 0.5 + intensity * 1.0; // 0.5 to 1.5 multiplier
            const intensityScale = rhythmicDensity * densityScale * 2.0; // Normalized to ~1.0 at medium

            let attackProb = baseAttackProb * intensityScale * warmUpScale;

            if (isLineStyle) {
                attackProb *= 1.05 + intensity * 0.1;
                if (isBeatStart || isOffbeatEighth) {
                    attackProb *= 1.2;
                } else if (isSixteenthSubdivision) {
                    attackProb *= intensity > 0.72 ? 1.0 : 0.72;
                }
            }

            // --- Rock Profile Bursts (EVH / Beck) ---
            if ((style === 'rock' || style === 'scalar') && intensity > 0.65) {
                const profile = soloistState.session.currentPhrase.context?.profile;
                if (profile === 'evh' || profile === 'beck') {
                    if (stepInBeat % 2 !== 0) {
                        attackProb *= 1.6; // Boost 16ths for shreddy/unpredictable feel
                    }
                }
            }

            // Apply persistent rhythmic entropy if set
            if (soloistState.session.rhythm.entropy !== undefined) {
                // rhythmicEntropy ranges roughly from -1.0 to 1.0.
                // Using multiplicative scaling to keep bounds somewhat reasonable.
                attackProb *= 1.0 + soloistState.session.rhythm.entropy * 0.5;
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
            if (isMonophonicMode) {
                if (silenceSteps >= stepsPerBeat) {
                    attackProb *= isBeatStart || isDownbeat ? 1.12 : 0.84;
                }
                if (!isStrongBeat && notesInPhrase >= 4) {
                    attackProb *= 0.72;
                }
                if (!isDownbeat && notesInPhrase >= 6) {
                    attackProb *= 0.52;
                }
                if (notesInPhrase >= 3 && isOffbeatEighth) {
                    attackProb *= isLineStyle ? 0.88 : 0.78;
                }
                if (notesInPhrase >= 2 && isSixteenthSubdivision) {
                    attackProb *= isLineStyle ? 0.72 : 0.58;
                }
            }

            // Rhythmic Simplification at Low Intensity:
            if (intensity < 0.4) {
                if (isSixteenthSubdivision) {
                    attackProb *= intensity * 1.5; // Drastic penalty for 16ths
                } else if (isOffbeatEighth) {
                    attackProb *= 0.4 + intensity; // Moderate penalty for offbeat 8ths
                }
            }

            // --- Dynamic Head: Rhythmic Seeding ---
            const sessionSeed = soloistState.session.seed;
            if (sessionSeed && sessionSeed.notes.length > 0) {
                const { notes, loopLengthSteps } = sessionSeed;
                const stepInLoop = step % loopLengthSteps;
                const hasSeedNote = notes.some((n: any) => n.step === stepInLoop);
                if (hasSeedNote) {
                    attackProb += 0.4; // Strong boost for seed points
                }
            }

            if (isFinalMeasure && soloistState.session.phrasing.transitionState === 'lead_in') {
                attackProb *= 1.5;
            }

            // PRE-HEAT: Boost density during count-in (negative steps)
            if (step < 0 && soloistState.session.phrasing.transitionState === 'lead_in') {
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
            if (isLineStyle) {
                const profile = soloistState.session.currentPhrase.context?.profile;
                // Double-time bursts for Bird/Coltrane
                if ((profile === 'bird' || profile === 'coltrane') && intensity > 0.7) {
                    if (isSixteenthSubdivision) {
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
                if (isMonophonicMode && silenceSteps >= stepsPerBeat) {
                    notesInPhrase = 0;
                }
                notesInPhrase++;
                silenceSteps = 0;
                const isBebopStyle =
                    style === 'bird' ||
                    soloistState.session.currentPhrase.context?.profile === 'bird' ||
                    soloistState.session.currentPhrase.context?.profile === 'coltrane';

                let stepVelocity = 0.6 + intensity * 0.4;
                if (isDownbeat) {
                    stepVelocity *= 1.25;
                } else if (isBackbeat) {
                    stepVelocity *= 1.15;
                } else if (isBeatStart || stepInBeat === stepsPerBeat / 2) {
                    stepVelocity *= 1.05;
                }

                // Jazz Ghosting
                if ((style === 'jazz' || style === 'bird') && !isBeatStart && Math.random() < 0.4) {
                    stepVelocity *= 0.6; // Soft ghost note
                }

                // --- STRATEGIC SUSTAIN LOGIC ---
                let isSustained = false;
                const baseSustainProb = _config.sustainProb || 0;
                let finalSustainProb = baseSustainProb;

                // 1. Resolution Hold: Boost sustain if we land on a strong beat after a period of density
                if (!isBebopStyle && notesInPhrase >= 6 && (isDownbeat || isBeatStart)) {
                    finalSustainProb += 0.3 * intensity;
                }

                // 2. Structural Bridge: Sustain leading into or across section boundaries
                if (isFinalMeasure && stepInBeat >= stepsPerBeat / 2) {
                    finalSustainProb += 0.4;
                }

                // 3. Dynamic Contrast: Sparse sections favor holding notes
                if (
                    soloistState.session.rhythm.entropy !== undefined &&
                    soloistState.session.rhythm.entropy < -0.3
                ) {
                    finalSustainProb += 0.2;
                }

                // 4. Greats Profiles: Gilmour-specific lyrical sustain
                if (soloistState.session.currentPhrase.context?.profile === 'gilmour') {
                    finalSustainProb += 0.2;
                }

                if (isBebopStyle) {
                    finalSustainProb *= 0.55;
                }

                if (Math.random() < finalSustainProb) {
                    isSustained = true;
                    // Held for a logical amount of time (4 steps = 1 beat, 8 steps = 2 beats)
                    const maxSustain = _config.maxSustainSteps || 8;
                    const sustainLength = isBebopStyle
                        ? 2 + Math.floor(Math.random() * 3)
                        : Math.floor(3 + Math.random() * maxSustain);
                    sustainStepsRemaining = sustainLength;
                }

                const shouldCreatePhraseBreath =
                    isMonophonicMode &&
                    isSustained &&
                    notesInPhrase >= 4 &&
                    (isDownbeat || isBeatStart || isFinalMeasure);

                plan.push({
                    stepTarget: step,
                    velocity: Math.min(1.25, stepVelocity),
                    isStrongBeat: isBeatStart || isDownbeat || isBackbeat,
                    durationSteps: isSustained ? sustainStepsRemaining + 1 : 1,
                    isSustained,
                    vibrato: isSustained,
                });
                if (shouldCreatePhraseBreath) {
                    phraseCooldownSteps = Math.max(
                        phraseCooldownSteps,
                        Math.max(1, stepsPerBeat / 2),
                    );
                    notesInPhrase = 0;
                }
            } else {
                silenceSteps++;
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

    if (style === 'blues' && plan.length < minPhraseNotes && activeSteps > 0) {
        const occupiedSteps = new Set(plan.map((node) => node.stepTarget));
        const candidateSteps: any[] = [];
        const minimumSpacing = Math.max(2, Math.floor(stepsPerBeat / 2));

        for (let step = startStep; step < startStep + activeSteps; step++) {
            if (occupiedSteps.has(step)) {
                continue;
            }

            const measureStep = ((step % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
            const stepInBeat = ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
            const isBeatStart = stepInBeat === 0;
            const isOffbeatEighth = stepInBeat === stepsPerBeat / 2;

            if (!isBeatStart && !isOffbeatEighth) {
                continue;
            }

            const tooCloseToExistingAttack = plan.some(
                (node) => Math.abs(node.stepTarget - step) < minimumSpacing,
            );
            if (tooCloseToExistingAttack) {
                continue;
            }

            const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
            const isDownbeat = measureStep === 0;
            const isBackbeat = (beatInMeasure === 1 || beatInMeasure === 3) && isBeatStart;
            const isStrongBeat = isBeatStart || isDownbeat || isBackbeat;

            candidateSteps.push({
                stepTarget: step,
                velocity: Math.min(1.1, (0.58 + intensity * 0.34) * (isStrongBeat ? 1.08 : 0.94)),
                isStrongBeat,
                durationSteps: isStrongBeat ? Math.max(2, Math.floor(stepsPerBeat * 0.75)) : 1,
                isSustained: false,
                vibrato: false,
                priority: isStrongBeat ? 0 : 1,
            });
        }

        candidateSteps.sort((a, b) => a.priority - b.priority || a.stepTarget - b.stepTarget);

        for (const candidate of candidateSteps) {
            if (plan.length >= minPhraseNotes) {
                break;
            }

            const clashesWithInsertedAttack = plan.some(
                (node) => Math.abs(node.stepTarget - candidate.stepTarget) < minimumSpacing,
            );
            if (clashesWithInsertedAttack) {
                continue;
            }

            plan.push(candidate);
        }

        plan.sort((a, b) => a.stepTarget - b.stepTarget);
    }

    plan.sort((a, b) => a.stepTarget - b.stepTarget);

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
        } else if (isLineStyle) {
            baseDuration = Math.min(gap, current.isStrongBeat ? 4 : 2);
        } else if (['blues', 'neo'].includes(style)) {
            baseDuration = gap;
        } else {
            baseDuration = Math.min(gap, 4);
        }
        if (isMonophonicMode) {
            if (current.isStrongBeat) {
                baseDuration = Math.min(
                    gap,
                    Math.max(baseDuration, current.isSustained ? stepsPerBeat + 1 : 3),
                );
            } else if (!current.isSustained) {
                baseDuration = Math.min(baseDuration, 2);
            }
        }

        // Scale final duration slightly by overall band intensity
        current.durationSteps = Math.max(1, Math.round(baseDuration * (0.8 + intensity * 0.4)));
        if (style === 'blues' && current.isSustained && current.isStrongBeat) {
            // Let blues anchors ring a touch longer so the line feels sung instead of clipped.
            current.durationSteps += 1;
        }
        // Ensure duration doesn't exceed gap (unless it's the last note and we allow ringing, though even then we cap it)
        if (next && current.durationSteps > gap) {
            current.durationSteps = gap;
        }
    }

    return plan;
}
