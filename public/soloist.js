import { TIME_SIGNATURES } from './config.js';
import { getDrumMotif } from './engine/groove-engine.js';
import { GENRE_STYLE_MAPPING, STYLE_CONFIG, STYLE_EMPHASIS } from './soloist-config.js';
import {
    generateEmbellishment,
    generateExtraNotes,
    generateMelodicDevice,
} from './soloist-devices.js';
import { getState } from './state.js';
import { getScaleForChord } from './theory-scales.js';
import { calculateTimingOffset, getFrequency } from './utils.js';

const CANDIDATE_WEIGHTS = new Float32Array(128);

function parseContourSkeleton(skeleton, targetChord, style, startMidi) {
    if (!skeleton || skeleton.length === 0) {
        return null;
    }

    const scaleIntervals = getScaleForChord(targetChord, null, style);
    let scaleMask = 0;
    for (let i = 0; i < scaleIntervals.length; i++) {
        scaleMask |= 1 << scaleIntervals[i];
    }
    const rootMidi = targetChord.rootMidi;

    // Mutation: occasionally reverse interval direction or double duration
    const isMutated = Math.random() < 0.2;
    const directionMult = isMutated && Math.random() < 0.5 ? -1 : 1;
    const durationMult = isMutated && Math.random() < 0.5 ? 2 : 1;

    const buffer = [];
    let currentMidi = startMidi;

    for (const node of skeleton) {
        const targetInterval = node.interval * directionMult;
        const absTarget = Math.abs(targetInterval);
        const dir = targetInterval > 0 ? 1 : -1;
        let stepsMoved = 0;
        let m = currentMidi;

        if (targetInterval !== 0) {
            let tries = 0;
            while (stepsMoved < absTarget && tries < 24) {
                m += dir;
                const pc = ((m % 12) + 12) % 12;
                const relativeInterval = (pc - (rootMidi % 12) + 12) % 12;
                if ((scaleMask >> relativeInterval) & 1) {
                    stepsMoved++;
                }
                tries++;
            }
        }

        currentMidi = m;

        buffer.push({
            midi: currentMidi,
            durationSteps: node.durationSteps * durationMult,
            velocity: 0.8, // Baseline, dynamically adjusted later
            style: style,
        });
    }

    return buffer;
}

function extractDrumSkeleton(step, intensity, _style, stepsPerMeasure, tsConfig) {
    const motif = [];
    const stateObj = getState();
    const { groove } = stateObj;

    // We map the deterministic motif IDs from getDrumMotif to rhythmic skeletons
    // to match the requested constraints without simulating the context-heavy engine state
    const barIndex = Math.floor(step / stepsPerMeasure);
    const sectionSeed = ((barIndex * 137 + (groove.creativity ? 42 : 0)) % 256) / 256;
    const complexity = groove.creativity ? 0.8 : 0.3;
    const motifId = getDrumMotif(sectionSeed, groove.genreFeel, complexity, intensity);

    // For generating skeletons based on motif IDs, we want to hit the busy subdivisions
    for (let i = 0; i < stepsPerMeasure; i++) {
        const isBeatStart = i % tsConfig.stepsPerBeat === 0;
        const beatIndex = Math.floor(i / tsConfig.stepsPerBeat);

        let isBackbeat = false;
        if (tsConfig.beats === 4) {
            isBackbeat = beatIndex === 1 || beatIndex === 3;
        } else if (tsConfig.beats === 3) {
            isBackbeat = beatIndex === 2;
        }

        const isOffbeat = i % tsConfig.stepsPerBeat === Math.floor(tsConfig.stepsPerBeat / 2);
        const isEOfBeat = i % tsConfig.stepsPerBeat === Math.floor(tsConfig.stepsPerBeat / 4);
        const isAOfBeat = i % tsConfig.stepsPerBeat === Math.floor((tsConfig.stepsPerBeat * 3) / 4);

        let hit = false;

        // Base 8th note / backbeat pocket for motif 0 (Simple/Grounded)
        if (motifId === 0) {
            if (isBeatStart || isBackbeat) {
                hit = true;
            } else if (isOffbeat && intensity > 0.4) {
                hit = true;
            }
        }
        // Syncopated / Ghost Note Heavy for motif 1
        else if (motifId === 1) {
            if (isBeatStart || isBackbeat || isOffbeat) {
                hit = true;
            } else if ((isEOfBeat && beatIndex === 1) || (isAOfBeat && beatIndex === 2)) {
                hit = true;
            }
        }
        // Displaced Backbeats / Heavily Syncopated for motif 2
        else if (motifId === 2) {
            if (isBeatStart && !isBackbeat) {
                hit = true;
            } else if (isBackbeat && beatIndex === 1) {
                hit = true; // Beat 2 solid
            } else if (isOffbeat && beatIndex === 3) {
                hit = true; // Beat 4 pushed
            } else if ((isAOfBeat && beatIndex === 1) || (isEOfBeat && beatIndex === 2)) {
                hit = true; // Pickups
            }
        }
        // Busy Linear (16th note heavy) for motif 3
        else if (motifId >= 3) {
            if (isBeatStart || isBackbeat || isOffbeat) {
                hit = true;
            } else if (isAOfBeat && (beatIndex === 0 || beatIndex === 1 || beatIndex === 3)) {
                hit = true;
            } else if (isEOfBeat && (beatIndex === 2 || beatIndex === 1)) {
                hit = true;
            }
        }

        // Additional fallback: Always capture backbeat if we missed it
        if (isBackbeat && motifId !== 2) {
            hit = true;
        }

        if (hit) {
            motif.push(i);
        }
    }

    // If it's too sparse for some reason, artificially pad it on strong beats
    if (motif.length < 2) {
        if (!motif.includes(0)) {
            motif.push(0);
        }
        if (motif.length < 2 && !motif.includes(8)) {
            motif.push(8);
        }
    }

    return motif;
}

function generateRhythmicMotif(intensity, style) {
    // Return an array of steps (0-15) that should have attacks
    const motif = [];
    // Catchy phrases usually have 3-5 notes per measure for hooks
    const density = 3 + Math.floor(intensity * 2);

    // Weighted probabilities for steps based on style
    const weights = STYLE_EMPHASIS[style] || STYLE_EMPHASIS.scalar;

    // Pick steps based on weights until we reach density
    const candidates = [];
    for (let i = 0; i < 16; i++) {
        // Favor stronger beats for motifs
        const strength = weights[i];
        candidates.push({ step: i, weight: strength * (0.5 + Math.random() * 0.5) });
    }

    candidates.sort((a, b) => b.weight - a.weight);

    for (let i = 0; i < Math.min(density, candidates.length); i++) {
        motif.push(candidates[i].step);
    }

    // Safety check: avoid completely silent generated motifs
    if (motif.length === 0) {
        motif.push(0, 8); // At least hit the downbeat and backbeat
    }

    return motif.sort((a, b) => a - b);
}

export function getSoloistNote(
    currentChord,
    nextChord,
    step,
    _prevFreq,
    _octave,
    style,
    stepInChord,
    isPriming,
    coordination = {},
    stepInfo,
) {
    const { playback, groove, soloist, arranger } = getState();
    if (!currentChord) {
        return null;
    }

    let activeStyle = style;
    if (activeStyle === 'smart') {
        activeStyle = GENRE_STYLE_MAPPING[groove.genreFeel] || 'scalar';
    }

    const intensity = playback.bandIntensity || 0.5;

    const logDebug = (msg) => {
        if (playback.debugSoloist) {
            console.log(`[Soloist Debug] Step ${step}: ${msg}`);
        }
    };

    let targetChord = currentChord;
    const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;
    const measureStep = stepInfo ? stepInfo.mStep : step % stepsPerMeasure;
    const stepInBeat = measureStep % stepsPerBeat;
    const isBeatStart = stepInfo ? stepInfo.isBeatStart : stepInBeat === 0;
    const isDownbeat = stepInfo ? stepInfo.isMeasureStart : measureStep === 0;
    const isBackbeat = stepInfo ? stepInfo.isBackbeat : false;

    // Anticipation
    const isLateInChord = stepInChord >= currentChord.beats * stepsPerBeat - 2;
    if (nextChord && isLateInChord && Math.random() < (config.anticipationProb || 0)) {
        targetChord = nextChord;
    }

    const minMidi = 60; // C4 (Middle C)
    const maxMidi = 96; // C7
    const lastMidi = soloist.lastMidiPlayed || 72;

    const finalizeNote = (res) => {
        if (!res) {
            return null;
        }
        const primary = Array.isArray(res) ? res[res.length - 1] : res;

        soloist.lastMidiPlayed = primary.midi; // @worker-mutation

        let timingOffset = calculateTimingOffset(
            'soloist',
            groove.pocket,
            playback.bandIntensity || 0.5,
        );

        // 1. Genre Gravity
        const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
        timingOffset += config.genreGravityOffset || 0;

        // 2. Rhythmic Rolling (Syncopation Lag)
        const isSyncopated = stepInBeat % (stepsPerBeat / 2) !== 0;
        if (isSyncopated) {
            timingOffset += 0.007; // 7ms lag for 'e' and 'a'
        }

        // Ghost notes drag slightly more
        if (primary.velocity < 0.7) {
            timingOffset += 0.005; // 5ms drag
        }

        // 3 & 4. Style-Specific Jitter & Intensity-Driven Tightness
        if (config.timingJitter !== undefined) {
            // Scale jitter: at intensity 0.2 it's looser, at 0.9 it's tighter
            const tightness = playback.bandIntensity || 0.5;
            const jitterScale = 1.0 - tightness;
            const jitterMs = config.timingJitter * jitterScale;
            timingOffset += (Math.random() - 0.5) * (jitterMs / 1000);
        }

        primary.timingOffset = (primary.timingOffset || 0) + timingOffset;

        if (!primary.isDoubleStop) {
            soloist.lastFreq = getFrequency(primary.midi); // @worker-mutation
        }

        if (activeStyle === 'blues') {
            const relativeInterval = ((primary.midi % 12) - (currentChord.rootMidi % 12) + 12) % 12;
            if (
                (relativeInterval === 3 || relativeInterval === 6) &&
                primary.bendStartInterval === 0
            ) {
                primary.bendStartInterval = Math.random() < 0.6 ? -0.5 : 0.5;
            }
        }

        return res;
    };

    if (!isPriming) {
        soloist.sessionSteps = (soloist.sessionSteps || 0) + 1; // @worker-mutation
    }

    // --- 0. Lead Sheet Melody ---
    if (activeStyle === 'lead_sheet') {
        if (soloist.leadSheetMelody && soloist.leadSheetMelody.length > 0) {
            const totalFormSteps = arranger.totalSteps > 0 ? arranger.totalSteps : 999999;
            const stepInForm = step % totalFormSteps;
            const note = soloist.leadSheetMelody.find((n) => n.globalStep === stepInForm);

            if (note) {
                const res = {
                    midi: note.midi,
                    durationSteps: note.durationSteps,
                    velocity: 0.8,
                    style: activeStyle,
                };
                soloist.busySteps = Math.max(0, (res.durationSteps || 1) - 1); // @worker-mutation
                return finalizeNote(res);
            }
            if (soloist.busySteps > 0) {
                soloist.busySteps--; // @worker-mutation
                return null;
            }
        }
    }

    // --- 1. Busy/Device Handling ---
    if (soloist.embellishmentBuffer && soloist.embellishmentBuffer.length > 0) {
        const embNote = soloist.embellishmentBuffer.shift();
        const primaryNote = Array.isArray(embNote) ? embNote[0] : embNote;
        soloist.busySteps = (primaryNote.durationSteps || 1) - 1; // @worker-mutation
        return finalizeNote(embNote);
    }
    if (soloist.hookBuffer && soloist.hookBuffer.length > 0) {
        const hookNote = soloist.hookBuffer.shift();
        soloist.busySteps = (hookNote.durationSteps || 1) - 1; // @worker-mutation

        // Ensure velocity is adjusted dynamically
        const baseVelocity = 0.6 + intensity * 0.4;
        const finalVelocity = isDownbeat
            ? baseVelocity * 1.25
            : isBackbeat
              ? baseVelocity * 1.15
              : baseVelocity;
        hookNote.velocity = Math.min(1.25, finalVelocity * hookNote.velocity);

        return finalizeNote(hookNote);
    }
    if (soloist.deviceBuffer && soloist.deviceBuffer.length > 0) {
        const devNote = soloist.deviceBuffer.shift();
        const primaryNote = Array.isArray(devNote) ? devNote[0] : devNote;
        soloist.busySteps = (primaryNote.durationSteps || 1) - 1; // @worker-mutation
        return finalizeNote(devNote);
    }
    if (soloist.busySteps > 0) {
        soloist.busySteps--; // @worker-mutation
        return null;
    }

    // --- Natural Exit Logic ---
    if (soloist.isYielding && soloist.phrasingState === 'rest') {
        if (soloist.tradeMode === 'manual' && soloist.enabled) {
            soloist.isYielding = false; // @worker-mutation
        } else {
            return null;
        }
    }

    // --- Form Awareness & Phrasing States ---
    const remainingSteps = coordination.sectionEnd - step;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;
    const measuresPerBlock = intensity >= 0.5 ? 4 : 8;
    const hyperMeasureLength = stepsPerMeasure * measuresPerBlock;
    const isHyperMeasureStart = step % hyperMeasureLength === 0;

    // Transition evaluation at structural points
    if (isHyperMeasureStart || (isFinalMeasure && isDownbeat)) {
        // Only force a transition if we are resting, or if we naturally reached the end of an IMPROV phrase.
        // Don't arbitrarily cut off an active, playing IMPROV phrase just because of a measure boundary.
        const shouldTransition =
            soloist.phrasingState === 'rest' ||
            (soloist.phrasingState === 'IMPROV' &&
                (soloist.activeSteps || 0) < stepsPerMeasure * 2);

        if (shouldTransition) {
            // Keep the soloist playing more actively, reduce the chance of forcing a "rest" transition
            soloist.transitionState = Math.random() < 0.2 ? 'rest' : 'lead_in'; // @worker-mutation
            if (soloist.transitionState === 'lead_in') {
                soloist.phrasingState = 'HOOK'; // @worker-mutation

                const isHighIntensity = intensity > 0.7;
                const forceMotifLock = isHighIntensity && Math.random() < 0.4;

                if (forceMotifLock) {
                    const skeleton = extractDrumSkeleton(
                        step,
                        intensity,
                        activeStyle,
                        stepsPerMeasure,
                        tsConfig,
                    );
                    soloist.rhythmicMotif = skeleton; // @worker-mutation
                    soloist.activeSteps = stepsPerMeasure * measuresPerBlock; // @worker-mutation
                    soloist.isMotifLocked = true; // @worker-mutation
                } else {
                    const useSkeleton =
                        config.contourSkeletons && Math.random() < 0.4 + intensity * 0.4;
                    if (useSkeleton && config.contourSkeletons.length > 0) {
                        const skeleton =
                            config.contourSkeletons[
                                Math.floor(Math.random() * config.contourSkeletons.length)
                            ];
                        const startMidi = lastMidi;
                        const buffer = parseContourSkeleton(
                            skeleton,
                            targetChord,
                            activeStyle,
                            startMidi,
                        );
                        if (buffer && buffer.length > 0) {
                            soloist.hookBuffer = buffer; // @worker-mutation
                        }
                    } else {
                        soloist.rhythmicMotif = generateRhythmicMotif(intensity, activeStyle); // @worker-mutation
                    }

                    soloist.phraseStartStep = null; // @worker-mutation (set on first attack)
                    soloist.activeSteps = stepsPerMeasure * 2; // @worker-mutation (fixed 2 measure hook)
                    soloist.isMotifLocked = false; // @worker-mutation
                }
            }
            logDebug(
                `Selected transition state: ${soloist.transitionState} (phrasingState: ${soloist.phrasingState})`,
            );
        }
    } else if (!isFinalMeasure && step !== coordination.sectionStart) {
        // Only reset transition if we are past the downbeat, so we can use it to resolve on step 0
        soloist.transitionState = null; // @worker-mutation
    }

    // --- 2. Consolidated Phrasing State Machine ---
    if (soloist.phrasingState === undefined || soloist.phrasingState === 'rest') {
        if (soloist.phrasingState === undefined) {
            soloist.phrasingState = 'rest'; // @worker-mutation
            soloist.restSteps = stepsPerBeat * 2; // @worker-mutation (short initial breath)
            soloist.activeSteps = 0; // @worker-mutation
        }

        soloist.restSteps = (soloist.restSteps || 0) - 1; // @worker-mutation

        // Safety Watchdog: Prevent excessive resting even at low intensities.
        // The watchdog acts as a safety net if `finalRestSteps` fails or we miss a beat.
        // At high intensity, max rest is ~0.75 measures before forcing a hook. At low intensity, ~1.25 measures.
        const absoluteMaxRest = Math.floor(stepsPerMeasure * (1.25 - intensity * 0.5));
        if (soloist.restSteps < -absoluteMaxRest) {
            soloist.restSteps = 0; // @worker-mutation
            soloist.phrasingState = 'HOOK'; // @worker-mutation
            soloist.rhythmicMotif = generateRhythmicMotif(intensity, activeStyle); // @worker-mutation
            soloist.notesInPhrase = 0; // @worker-mutation
            soloist.activeSteps = stepsPerMeasure * 2; // @worker-mutation
            soloist.phraseStartStep = null; // @worker-mutation
            soloist.isMotifLocked = false; // @worker-mutation
            logDebug(`Watchdog forced state to HOOK after extended rest`);
        } else {
            // Check for natural break-out into a HOOK
            if (soloist.restSteps <= 0 || coordination.bypassRhythm) {
                const isGoodEntry =
                    isBeatStart || (measureStep % (stepsPerBeat / 2) === 0 && intensity > 0.6);

                const preventBreakout =
                    isFinalMeasure &&
                    soloist.transitionState === 'rest' &&
                    Math.floor(measureStep / stepsPerBeat) >= Math.ceil(tsConfig.beats / 2);

                if (
                    !preventBreakout &&
                    (isGoodEntry ||
                        coordination.bypassRhythm ||
                        soloist.restSteps < -stepsPerMeasure)
                ) {
                    soloist.phrasingState = 'HOOK'; // @worker-mutation

                    const isHighIntensity = intensity > 0.7;
                    const forceMotifLock = isHighIntensity && Math.random() < 0.4;

                    if (forceMotifLock) {
                        const skeleton = extractDrumSkeleton(
                            step,
                            intensity,
                            activeStyle,
                            stepsPerMeasure,
                            tsConfig,
                        );
                        soloist.rhythmicMotif = skeleton; // @worker-mutation
                        soloist.activeSteps = stepsPerMeasure * measuresPerBlock; // @worker-mutation
                        soloist.isMotifLocked = true; // @worker-mutation
                    } else {
                        const useSkeleton =
                            config.contourSkeletons && Math.random() < 0.4 + intensity * 0.4;
                        if (useSkeleton && config.contourSkeletons.length > 0) {
                            const skeleton =
                                config.contourSkeletons[
                                    Math.floor(Math.random() * config.contourSkeletons.length)
                                ];
                            const startMidi = lastMidi;
                            const buffer = parseContourSkeleton(
                                skeleton,
                                targetChord,
                                activeStyle,
                                startMidi,
                            );
                            if (buffer && buffer.length > 0) {
                                soloist.hookBuffer = buffer; // @worker-mutation
                            }
                        } else {
                            soloist.rhythmicMotif = generateRhythmicMotif(intensity, activeStyle); // @worker-mutation
                        }
                        soloist.activeSteps = stepsPerMeasure * 2; // @worker-mutation (fixed 2 measure hook)
                        soloist.isMotifLocked = false; // @worker-mutation
                    }

                    soloist.notesInPhrase = 0; // @worker-mutation
                    soloist.phraseStartStep = null; // @worker-mutation (set on first attack)
                    logDebug(
                        `Waking up for ${soloist.phrasingState} (~${soloist.activeSteps} steps)`,
                    );
                }
            }
            if (soloist.phrasingState === 'rest') {
                return null; // Return null while resting
            }
        }
    }

    if (soloist.phrasingState !== 'rest') {
        soloist.activeSteps = (soloist.activeSteps || 0) - 1; // @worker-mutation

        const currentState = soloist.phrasingState;
        const isEndOfMeasure = measureStep === stepsPerMeasure - 1;
        const isNearEndOfMeasure =
            measureStep >= (tsConfig.beats - 1) * stepsPerBeat && intensity > 0.5;

        // Fluid State Transitions
        if (
            soloist.activeSteps <= 0 &&
            (isEndOfMeasure || isNearEndOfMeasure) &&
            !coordination.bypassRhythm
        ) {
            if (currentState === 'HOOK') {
                soloist.phrasingState = 'IMPROV'; // @worker-mutation
                // We deliberately DO NOT clear the rhythmicMotif here.
                // We keep it to "seed" the IMPROV state with a memorable framework.
                soloist.isMotifLocked = false; // @worker-mutation
                const baseLength = config.maxNotesPerPhrase * (0.2 + intensity * 0.6);
                const activeVal = baseLength * stepsPerBeat * (0.5 + Math.random() * 0.5);
                soloist.activeSteps = Math.min(64, Math.floor(activeVal)); // @worker-mutation

                // Track probability to retain the hook structure
                soloist.hookRetentionProb = 0.5 + intensity * 0.3; // @worker-mutation
                logDebug(`Transitioning to IMPROV (~${soloist.activeSteps} steps, retaining hook)`);
            } else if (currentState === 'IMPROV') {
                soloist.phrasingState = 'rest'; // @worker-mutation
                soloist.rhythmicMotif = []; // @worker-mutation

                // Fatigue scaling based on notes played in phrase
                const fatigueMultiplier = 1.0 + (soloist.notesInPhrase || 0) * 0.02; // Reduced fatigue impact
                const baseRest = config.restBase * (1.0 - intensity * 0.5); // Reduced base rest overall
                const restVal =
                    stepsPerMeasure * baseRest * fatigueMultiplier * (0.5 + Math.random() * 1.0); // Less wild randomness

                let finalRestSteps = Math.floor(restVal);

                // Strictly bound the maximum rest so it doesn't stay quiet for too long.
                // At high intensity, it rests at most ~0.5 measures. At low intensity, ~0.75 measures.
                const maxRestSteps = Math.floor(stepsPerMeasure * (0.75 - intensity * 0.25));
                if (finalRestSteps > maxRestSteps) {
                    finalRestSteps = maxRestSteps;
                }

                soloist.restSteps = finalRestSteps; // @worker-mutation
                if (soloist.restSteps < 4) {
                    soloist.restSteps = 4; // @worker-mutation minimum breath
                }
                logDebug(`Phrase complete. Transitioning to Rest for ~${soloist.restSteps} steps`);
                return null;
            }
        }
    }

    if (soloist.phrasingState === 'rest') {
        return null;
    }

    // --- 3. Rhythmic Density & Layered Musicality ---
    // Resolve on Downbeat
    const isSectionDownbeat =
        step === coordination.sectionStart && soloist.transitionState === 'lead_in';

    const emphasisMap = STYLE_EMPHASIS[activeStyle] || STYLE_EMPHASIS.scalar;
    // Map emphasis relative to steps per beat to ensure alignment in non-4/4 meters
    // (Each beat in the 16-step map is 4 steps: 0-3, 4-7, 8-11, 12-15)
    const bIdx = stepInfo ? stepInfo.beatIndex : Math.floor(measureStep / 4);
    const sInB = stepInfo ? stepInfo.stepInBeat : measureStep % 4;
    const emphasisIdx = (bIdx % 4) * 4 + (sInB % 4);
    const baseAttackProb = emphasisMap[emphasisIdx];

    const baseRhythmicDensity = config.rhythmicDensity ?? 0.5;
    const baseSyncopationLikelihood = config.syncopationLikelihood ?? 0.5;

    const warmUpScale = Math.min(1.0, 0.5 + ((soloist.sessionSteps || 0) / 64) * 0.5);

    const densityScale = 0.5 + baseRhythmicDensity;
    const intensityScale = 0.3 + intensity * 1.2; // Scale density with intensity
    let attackProb = baseAttackProb * intensityScale * warmUpScale * densityScale;

    // Phrase Contextual Scaling
    if (soloist.phrasingState === 'IMPROV') {
        attackProb *= 0.8 + baseRhythmicDensity * 0.4;
    }

    // Breathing Contours: Layer an 8-measure sine wave over the probability
    const sinePeriod = stepsPerMeasure * 8;
    const breathingPhase = (step % sinePeriod) / sinePeriod;
    const breathingOffset = Math.sin(breathingPhase * Math.PI * 2) * 0.25; // +/- 0.25
    attackProb += breathingOffset;

    // Rhythmic Simplification at Low Intensity:
    // Penalize syncopated/weak subdivisions (16ths and weak 8ths) heavily when band is quiet.
    if (intensity < 0.4 || Math.random() > baseSyncopationLikelihood) {
        const isSixteenthNote = sInB % 2 !== 0; // Steps 1, 3
        const isOffbeatEighth = sInB === 2; // Step 2 (the "and")

        if (isSixteenthNote) {
            attackProb *= intensity * 1.5; // Drastic penalty for 16ths
        } else if (isOffbeatEighth) {
            attackProb *= 0.4 + intensity; // Moderate penalty for offbeat 8ths
        }
    }

    // Increase rhythmic density for 'lead_in'
    if (isFinalMeasure && soloist.transitionState === 'lead_in') {
        attackProb *= 1.5; // Bump probability up significantly
    }

    const stepCoord = coordination.stepCoordination || {};
    if (stepCoord.kickHit) {
        attackProb += 0.2;
    }
    if (stepCoord.snareHit) {
        attackProb += 0.2;
    }

    if (coordination.bypassRhythm) {
        attackProb = 1.0;
    }

    // Force attack on downbeat resolution
    if (isSectionDownbeat) {
        attackProb = 1.0;
        soloist.transitionState = null; // @worker-mutation (reset after resolution)
    }

    // Motif Mask enforces attack or rests, overriding randomness unless resolving
    let shouldAttack = false;

    if (isSectionDownbeat) {
        shouldAttack = true;
    } else if (
        !coordination.bypassRhythm &&
        soloist.phrasingState === 'HOOK' &&
        soloist.rhythmicMotif &&
        soloist.rhythmicMotif.length > 0
    ) {
        // Enforce the prescribed rhythmic motif for Hook
        shouldAttack = soloist.rhythmicMotif.includes(measureStep);
    } else if (
        !coordination.bypassRhythm &&
        soloist.phrasingState === 'IMPROV' &&
        soloist.rhythmicMotif &&
        soloist.rhythmicMotif.length > 0 &&
        soloist.rhythmicMotif.includes(measureStep)
    ) {
        // Retain the motif framework heavily during Improv
        const retainProb = soloist.hookRetentionProb ?? 0.7;
        shouldAttack = Math.random() < retainProb;
    } else {
        shouldAttack = Math.random() < attackProb;
    }

    if (!shouldAttack) {
        return null;
    }

    // Increment heat for density fatigue
    soloist.notesInPhrase = (soloist.notesInPhrase || 0) + 1; // @worker-mutation
    soloist.lastAttackStep = step; // @worker-mutation

    // Initialize phraseStartStep on the first attack
    if (soloist.phrasingState === 'HOOK' && soloist.phraseStartStep === null) {
        soloist.phraseStartStep = step; // @worker-mutation
        logDebug(`HOOK phrase actual start at step ${step}`);
    }

    // --- 4. Pitch Selection ---
    CANDIDATE_WEIGHTS.fill(0);

    // Harmonic Anticipation & Checkpoints
    let structuralTargetChord = null;
    let distanceToStructuralDownbeat = stepsPerMeasure;

    if (isFinalMeasure && coordination.stepCoordination?.upcomingSectionFirstChord) {
        structuralTargetChord = coordination.stepCoordination.upcomingSectionFirstChord;
        distanceToStructuralDownbeat = remainingSteps;
    } else if (!isFinalMeasure && coordination.stepCoordination?.upcomingMeasureChord) {
        // Find next structural downbeat chord 1-2 measures ahead via stepCoordination
        structuralTargetChord = coordination.stepCoordination.upcomingMeasureChord;
        distanceToStructuralDownbeat = stepsPerMeasure - (step % stepsPerMeasure);
    }

    // Shift scale to upcoming chord 1 eighth-note (2 steps) before downbeat if leading in
    if (
        isFinalMeasure &&
        soloist.transitionState === 'lead_in' &&
        remainingSteps <= 2 &&
        structuralTargetChord
    ) {
        targetChord = structuralTargetChord;
    }

    const scaleIntervals = getScaleForChord(targetChord, null, style);
    let scaleMask = 0;
    for (let i = 0; i < scaleIntervals.length; i++) {
        scaleMask |= 1 << scaleIntervals[i];
    }
    const rootMidi = targetChord.rootMidi;
    let totalWeight = 0;

    // Register Centering: Shift center up with intensity
    const baseCenter = 64; // E4
    const dynamicCenter = baseCenter + intensity * 12;

    // Confine search to nearby notes
    const searchMin = Math.max(minMidi, lastMidi - 14);
    const searchMax = Math.min(maxMidi, lastMidi + 14);

    for (let m = searchMin; m <= searchMax; m++) {
        const pc = ((m % 12) + 12) % 12;
        const interval = (pc - (rootMidi % 12) + 12) % 12;
        let weight = 1.0;

        const isScaleTone = (scaleMask >> interval) & 1;

        const dist = Math.abs(m - lastMidi);

        // Chromaticism handling
        const chromaticism = config.chromaticism ?? 0.2;
        if (!isScaleTone) {
            if (chromaticism > 0.5 && dist <= 2) {
                weight += 20 * chromaticism; // allow passing tones if chromaticism is high
            } else {
                continue; // Skip non-scale tones usually
            }
        }

        // Prevent exact repetition unless Funk/Ska
        if (dist === 0) {
            if (['funk', 'ska'].includes(activeStyle)) {
                weight *= 0.5;
            } else {
                continue;
            }
        }

        // Reward small steps
        if (dist <= 2) {
            weight += 100;
        }
        if (dist <= 4) {
            weight += 50;
        }

        // Reward chord tones
        if (targetChord.intervals.some((i) => ((i % 12) + 12) % 12 === interval)) {
            weight += 150;
        }

        // Transient Lick Dictionary Matching
        let matchedLickNote = null;
        if (
            soloist.lickDictionary &&
            soloist.lickDictionary.length > 0 &&
            soloist.recentNotes &&
            soloist.recentNotes.length >= 2
        ) {
            const lastTwoNotes = soloist.recentNotes.slice(-2).map((n) => n.midi);

            for (const lick of soloist.lickDictionary) {
                // Check if the end of recentNotes matches the start of the lick
                if (
                    lick.sequence.length > 2 &&
                    lastTwoNotes[0] === lick.sequence[0] &&
                    lastTwoNotes[1] === lick.sequence[1]
                ) {
                    // Match found! We are looking for the 3rd note.
                    matchedLickNote = lick.sequence[2];
                    break;
                }
            }
        }

        if (matchedLickNote !== null && m === matchedLickNote) {
            weight += 800; // Strong pull to complete the transient lick
        }

        // Target Note Resolution (Harmonic Checkpoints)
        // Check if we are approaching a structural boundary (like the downbeat of a new section or next measure)
        // and strongly pull the pitch toward the root or 3rd of that chord as it gets closer.
        const resolutionChord = isSectionDownbeat ? targetChord : structuralTargetChord;

        if (resolutionChord) {
            const upcomingRoot = resolutionChord.rootMidi;
            const upcoming3rd =
                resolutionChord.intervals.length > 1 ? resolutionChord.intervals[1] : 4;
            const upcomingInterval = (pc - (upcomingRoot % 12) + 12) % 12;

            // Is the candidate pitch the root or 3rd of the upcoming target chord?
            const targetAnchoring = config.targetAnchoring ?? 0.8;
            if (upcomingInterval === 0 || upcomingInterval === upcoming3rd % 12) {
                if (isSectionDownbeat) {
                    weight += 500 * targetAnchoring; // Force resolution on downbeat
                } else if (
                    soloist.transitionState === 'lead_in' &&
                    distanceToStructuralDownbeat <= 8
                ) {
                    weight += (100 + (8 - distanceToStructuralDownbeat) * 15) * targetAnchoring; // Linear pull for standard lead_in
                }
            }
        }

        // Melodic Smoothing Jump Penalty: Discourage large leaps (> 5th)
        if (dist > 7) {
            weight *= 0.4;
        }

        // Register Centering Force: Stronger penalty for drifting too far from dynamic center
        const distFromCenter = Math.abs(m - dynamicCenter);
        if (distFromCenter <= 7) {
            weight += 100;
        } else if (distFromCenter <= 14) {
            weight += 40;
        }

        // Intensity-Based Register Ceiling: Reserve high octaves for high intensity
        if (m >= 84 && intensity < 0.75) {
            // Hard penalty for 6th octave (C6+) unless intensity is high
            weight *= 0.05;
        } else if (m >= 72 && intensity < 0.35) {
            // Soft penalty for 5th octave (C5+) at very low intensity
            weight *= 0.2;
        }

        CANDIDATE_WEIGHTS[m] = weight;
        totalWeight += weight;
    }

    let selectedMidi = -1;
    if (totalWeight > 0) {
        let randomVal = Math.random() * totalWeight;
        for (let m = searchMin; m <= searchMax; m++) {
            const w = CANDIDATE_WEIGHTS[m];
            if (w > 0) {
                randomVal -= w;
                if (randomVal <= 0) {
                    selectedMidi = m;
                    break;
                }
            }
        }
    }

    if (selectedMidi === -1) {
        selectedMidi = lastMidi; // Fallback
    }

    // --- 5. Melodic Devices ---
    const deviceBaseProb = config.deviceProb * (0.5 + intensity);
    const isPiano = soloist.mode === 'piano';
    const isPolyphonic =
        soloist.mode !== 'monophonic' &&
        (soloist.doubleStopProb ?? 1.0) > 0 &&
        config.doubleStopProb > 0;

    if (isBeatStart && Math.random() < deviceBaseProb) {
        let allowed = [...(config.allowedDevices || [])];
        if (isPiano) {
            allowed = allowed.filter(
                (d) => !['slide', 'countryBend', 'graceSlide', 'chickenPick'].includes(d),
            );
            if (!allowed.includes('graceNote')) {
                allowed.push('graceNote');
            }
        }

        const deviceType =
            allowed.length > 0 ? allowed[Math.floor(Math.random() * allowed.length)] : null;

        if (deviceType) {
            const deviceBuffer = generateMelodicDevice(deviceType, {
                selectedMidi,
                targetChord,
                activeStyle,
                effectiveIntensity: intensity,
                minMidi,
                maxMidi,
                lastMidi,
                playback,
                soloist,
                isPolyphonic,
                isPiano,
                dynamicCenter: 72,
                scaleMask,
            });

            if (deviceBuffer && deviceBuffer.length > 0) {
                soloist.deviceBuffer = deviceBuffer.slice(1); // @worker-mutation
                const first = deviceBuffer[0];
                soloist.busySteps =
                    (Array.isArray(first) ? first[0].durationSteps : first.durationSteps || 1) - 1; // @worker-mutation
                return finalizeNote(first);
            }
        }
    }

    const extraNotes = [];
    const dsChance = config.doubleStopProb * intensity * (soloist.doubleStopProb ?? 1.0);
    if (isPolyphonic && Math.random() < dsChance) {
        const generatedExtra = generateExtraNotes({
            soloist,
            currentChord,
            activeStyle,
            effectiveIntensity: intensity,
            selectedMidi,
        });
        extraNotes.push(...generatedExtra);
    }

    // --- 6. Duration & Velocity ---
    let durationSteps = activeStyle === 'bird' ? 2 : Math.random() < 0.6 ? 2 : 4;
    if (activeStyle === 'neo') {
        durationSteps = 4; // Neo-Soul defaults to longer, soulful notes
    }
    if (['funk', 'disco', 'ska'].includes(activeStyle)) {
        durationSteps = 1;
    }

    // Context Aware Durations: Calculate gap to next projected note
    let gapToNextNote = 4; // default conservative lookahead
    // Find next emphasis peak
    for (let nextOffset = 1; nextOffset <= 8; nextOffset++) {
        const lookaheadStep = step + nextOffset;
        const lbIdx = Math.floor((lookaheadStep % stepsPerMeasure) / 4);
        const lsInB = (lookaheadStep % stepsPerMeasure) % 4;
        const lEmphasisIdx = (lbIdx % 4) * 4 + (lsInB % 4);
        const lookaheadThreshold = activeStyle === 'neo' ? 0.85 : 0.4;
        if (emphasisMap[lEmphasisIdx] > lookaheadThreshold) {
            gapToNextNote = nextOffset;
            break;
        }
    }

    // Choose duration: connect the notes (legato) or staccato
    const isLegato = Math.random() < (intensity < 0.5 ? 0.7 : 0.3);
    if (soloist.isMotifLocked) {
        // In motif_lock, notes sustain perfectly until the next drum hit for a continuous melodic line
        durationSteps = gapToNextNote;

        // Find next motif step specifically
        if (soloist.rhythmicMotif && soloist.rhythmicMotif.length > 0) {
            let foundNext = false;
            for (let i = measureStep + 1; i < stepsPerMeasure; i++) {
                if (soloist.rhythmicMotif.includes(i)) {
                    durationSteps = i - measureStep;
                    foundNext = true;
                    break;
                }
            }
            if (!foundNext) {
                // Gap to first note of next measure
                const firstNote = soloist.rhythmicMotif[0] || 0;
                durationSteps = stepsPerMeasure - measureStep + firstNote;
            }
        }
    } else if (isLegato) {
        durationSteps = Math.min(8, gapToNextNote);
    } else {
        durationSteps = Math.max(1, Math.floor(gapToNextNote / 2));
    }

    // Override for short styles unless motif-locked
    if (['funk', 'disco', 'ska'].includes(activeStyle) && !soloist.isMotifLocked) {
        durationSteps = 1;
    }

    // Dynamic Duration Scaling: Play longer, simpler notes at low intensity
    if (intensity < 0.5 && !isPolyphonic && !soloist.isMotifLocked) {
        // At 0.1 intensity, 80% chance for a long note (4-8 steps).
        // At 0.4 intensity, 20% chance.
        const longNoteChance = 1.0 - intensity * 2.0;
        if (Math.random() < longNoteChance) {
            // Pick a longer duration that aligns with the beat
            durationSteps = Math.max(durationSteps, Math.random() < 0.5 ? 4 : 8); // Quarter or Half note
        }
    }

    // Hard maximum for duration to prevent "stuck" notes
    durationSteps = Math.min(8, durationSteps);

    const baseVelocity = 0.6 + intensity * 0.4;
    const isImportantStep = stepInBeat === 0 || stepInBeat === Math.floor(stepsPerBeat / 2);

    let stepVelocity = baseVelocity;
    if (isDownbeat) {
        stepVelocity = baseVelocity * 1.25; // Strongest emphasis
    } else if (isBackbeat) {
        stepVelocity = baseVelocity * 1.15; // Strong emphasis
    } else if (isImportantStep) {
        stepVelocity = baseVelocity * 1.05; // Light emphasis
    }

    if (coordination.bassHit && selectedMidi < 60) {
        stepVelocity *= 0.85; // Yield to bass
    }

    let bendStartInterval = 0;
    if (soloist.mode === 'guitar' && durationSteps >= 4 && Math.random() < 0.3) {
        bendStartInterval = Math.random() < 0.5 ? -1 : 1;
    }
    if (isPiano) {
        bendStartInterval = 0;
    }

    const result = {
        midi: selectedMidi,
        velocity: Math.min(1.25, stepVelocity),
        durationSteps,
        bendStartInterval,
        ccEvents: [],
        timingOffset: 0,
        style: activeStyle,
        isDoubleStop: false,
        isLegato: false,
    };

    if (result.durationSteps > 1) {
        soloist.busySteps = result.durationSteps - 1; // @worker-mutation
    }

    // Transient Lick Dictionary Scoring and Saving
    if (!soloist.recentNotes) {
        soloist.recentNotes = []; // @worker-mutation
    }
    soloist.recentNotes.push({
        // @worker-mutation
        midi: selectedMidi,
        step: step,
        isDownbeat: isDownbeat || isBackbeat,
    });

    // Keep only the last 4 notes for heuristic scoring
    if (soloist.recentNotes.length > 4) {
        soloist.recentNotes.shift(); // @worker-mutation
    }

    // Score the lick if we have 4 notes
    if (soloist.recentNotes.length === 4) {
        const notes = soloist.recentNotes;

        // 1. Start on strong beat
        const strongStart = notes[0].isDownbeat;

        // 2. Resolve on strong chord tone
        const resolveNote = notes[3].midi;
        const relativeInterval = ((resolveNote % 12) - (targetChord.rootMidi % 12) + 12) % 12;
        const targetChord3rd = targetChord.intervals.length > 1 ? targetChord.intervals[1] : 4;
        const strongResolution =
            relativeInterval === 0 ||
            relativeInterval === targetChord3rd % 12 ||
            relativeInterval === 7;

        // 3. Stepwise motion
        let stepwiseCount = 0;
        for (let i = 1; i < 4; i++) {
            const dist = Math.abs(notes[i].midi - notes[i - 1].midi);
            if (dist > 0 && dist <= 4) {
                stepwiseCount++;
            }
        }

        if (strongStart && strongResolution && stepwiseCount >= 2) {
            // Excellent lick, cache it
            if (!soloist.lickDictionary) {
                soloist.lickDictionary = []; // @worker-mutation
            }
            const lickSequence = notes.map((n) => n.midi);

            // Check if lick already exists
            const exists = soloist.lickDictionary.some(
                (l) => l.sequence.join(',') === lickSequence.join(','),
            );
            if (!exists) {
                soloist.lickDictionary.push({ sequence: lickSequence, score: stepwiseCount + 2 }); // @worker-mutation

                // Keep dictionary small
                if (soloist.lickDictionary.length > 3) {
                    soloist.lickDictionary.shift(); // @worker-mutation
                }
                logDebug(`Cached strong transient lick!`);
            }
        }
    }

    const finalResult =
        extraNotes.length > 0 && isPolyphonic
            ? [
                  ...extraNotes.map((n) => ({
                      ...result,
                      ...n,
                      midi: Math.max(minMidi, Math.min(maxMidi, n.midi)),
                  })),
                  { ...result, midi: Math.max(minMidi, Math.min(maxMidi, result.midi)) },
              ]
            : { ...result, midi: Math.max(minMidi, Math.min(maxMidi, result.midi)) };

    return finalizeNote(finalResult);
}
