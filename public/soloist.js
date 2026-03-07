import { TIME_SIGNATURES } from './config.js';
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

export function getMelodyAtStep(melody, step) {
    if (!melody || melody.length === 0) {
        return null;
    }
    return melody.find((n) => n.globalStep === step);
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

    const minMidi = 55; // G3
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
        if (soloist.phrasingState === 'rest' || soloist.phrasingState === 'resolution') {
            soloist.transitionState = Math.random() < 0.5 ? 'rest' : 'lead_in'; // @worker-mutation
            if (soloist.transitionState === 'lead_in') {
                soloist.phrasingState = 'call'; // @worker-mutation
                soloist.phraseStartStep = step; // @worker-mutation
                soloist.motifCache = []; // @worker-mutation reset motif for new call
            }
            logDebug(`Selected transition state: ${soloist.transitionState}`);
        }
    } else if (!isFinalMeasure && step !== coordination.sectionStart) {
        // Only reset transition if we are past the downbeat, so we can use it to resolve on step 0
        soloist.transitionState = null; // @worker-mutation
    }

    // --- 2. Advanced Phrasing State Machine ---
    if (soloist.phrasingState === undefined || soloist.phrasingState === 'rest') {
        if (soloist.phrasingState === undefined) {
            soloist.phrasingState = 'rest'; // @worker-mutation
            soloist.restSteps = stepsPerMeasure; // @worker-mutation
            soloist.activeSteps = 0; // @worker-mutation
        }

        soloist.restSteps = (soloist.restSteps || 0) - 1; // @worker-mutation

        // Safety Watchdog: Even if rest step reduction breaks, force out of rest after max rest steps
        const absoluteMaxRest = Math.floor(stepsPerMeasure * (1.5 - intensity * 1.0));
        if (soloist.restSteps < -absoluteMaxRest) {
            soloist.restSteps = 0; // @worker-mutation
            soloist.phrasingState = 'call'; // @worker-mutation
            soloist.motifCache = []; // @worker-mutation
            soloist.notesInPhrase = 0; // @worker-mutation
            soloist.activeSteps = stepsPerMeasure; // @worker-mutation
            logDebug(`Watchdog forced state to Call after extended rest`);
        } else {
            // Check for natural break-out into a call
            if (soloist.restSteps <= 0 || coordination.bypassRhythm) {
                const isGoodEntry =
                    isBeatStart || (measureStep % (stepsPerBeat / 2) === 0 && intensity > 0.6);

                // Don't break out if we are in the 'rest' transition late in the measure
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
                    soloist.phrasingState = 'call'; // @worker-mutation
                    soloist.motifCache = []; // @worker-mutation start recording new motif
                    soloist.notesInPhrase = 0; // @worker-mutation
                    const baseLength = config.maxNotesPerPhrase * (0.3 + intensity * 0.7);
                    const activeVal = baseLength * stepsPerBeat * (0.5 + Math.random() * 0.5);
                    soloist.activeSteps = Math.floor(activeVal); // @worker-mutation
                    soloist.phraseStartStep = step; // @worker-mutation
                    logDebug(`Waking up for ~${soloist.activeSteps} steps (Call)`);
                }
            }
            if (soloist.phrasingState === 'rest') {
                return null; // Return null while resting
            }
        }
    }

    if (soloist.phrasingState !== 'rest') {
        soloist.activeSteps = (soloist.activeSteps || 0) - 1; // @worker-mutation

        // Structural Awareness: Defer state transitions until a strong rhythmic boundary
        const isEndOfMeasure = measureStep === stepsPerMeasure - 1;
        const isNearEndOfMeasure =
            measureStep >= (tsConfig.beats - 1) * stepsPerBeat && intensity > 0.5;

        // Fluid State Transitions
        if (
            soloist.activeSteps <= 0 &&
            (isEndOfMeasure || isNearEndOfMeasure) &&
            !coordination.bypassRhythm
        ) {
            const currentState = soloist.phrasingState;

            if (currentState === 'call') {
                soloist.phrasingState = 'response'; // @worker-mutation
                const activeVal =
                    (soloist.motifCache
                        ? soloist.motifCache.length * stepsPerBeat
                        : stepsPerMeasure) *
                    (0.8 + Math.random() * 0.4);
                soloist.activeSteps = Math.floor(activeVal); // @worker-mutation
                soloist.phraseStartStep = step; // @worker-mutation
                logDebug(`Transitioning to Response (~${soloist.activeSteps} steps)`);
            } else if (currentState === 'response') {
                soloist.phrasingState = Math.random() < 0.6 ? 'development' : 'resolution'; // @worker-mutation
                const activeVal = stepsPerMeasure * (0.5 + Math.random());
                soloist.activeSteps = Math.floor(activeVal); // @worker-mutation
                logDebug(`Transitioning to ${soloist.phrasingState}`);
            } else if (currentState === 'development') {
                soloist.phrasingState = 'resolution'; // @worker-mutation
                soloist.activeSteps = stepsPerBeat * 2; // @worker-mutation short window to find a resolution note
                logDebug(`Transitioning to Resolution`);
            } else if (currentState === 'resolution') {
                // Fallback Resolution: If we reached the end of resolution but haven't played a satisfying note,
                // force one now on the nearest valid beat, but only if we are actually at a beat boundary.
                if (soloist.activeSteps < -stepsPerMeasure) {
                    // Hard limit to not wait forever
                    soloist.phrasingState = 'rest'; // @worker-mutation
                } else if (
                    soloist.activeSteps <= 0 &&
                    isBeatStart &&
                    soloist.lastAttackStep !== step
                ) {
                    // Do not transition to rest yet, force a note resolution to happen on this beat
                    // The Pitch Selection logic will strongly pull it to the chord tone.
                } else if (soloist.activeSteps <= 0 && soloist.lastAttackStep === step) {
                    // We just played a note on this step, it is our resolution. Time to rest.
                    soloist.phrasingState = 'rest'; // @worker-mutation
                    const restMultiplier = config.restBase * (1.5 - intensity * 1.0); // reduced from 2.0 to 1.5 to shorten base rests
                    const fatigueMultiplier = 1.0 + (soloist.notesInPhrase || 0) * 0.05;
                    const restVal =
                        stepsPerMeasure *
                        restMultiplier *
                        fatigueMultiplier *
                        (0.5 + Math.random() * 1.0); // reduced max randomness from 1.5 to 1.0

                    // Intensity Watchdog: Force max rest time inversely based on intensity
                    let finalRestSteps = Math.floor(restVal);
                    // 0.5 measures max at intensity=1.0, 1.5 measures at 0.0
                    const maxRestSteps = Math.floor(stepsPerMeasure * (1.5 - intensity * 1.0));
                    if (finalRestSteps > maxRestSteps) {
                        finalRestSteps = maxRestSteps;
                    }

                    soloist.restSteps = finalRestSteps; // @worker-mutation
                    if (soloist.restSteps < 4) {
                        soloist.restSteps = 4; // @worker-mutation minimum breath
                    }
                    logDebug(`Transitioning to Rest for ~${soloist.restSteps} steps`);
                    return null;
                }
            }
        }
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

    // Motif Masking: Recall cached rhythm during response
    const phraseRelativeStep = step - (soloist.phraseStartStep || step);
    let motifForcedAttack = false;
    let expectedMotifInterval = null;
    if (
        soloist.phrasingState === 'response' &&
        soloist.motifCache &&
        soloist.motifCache.length > 0
    ) {
        const matchingMotifNote = soloist.motifCache.find(
            (m) => m.relativeStep === phraseRelativeStep,
        );
        if (matchingMotifNote) {
            // Apply strict mask: only allow attack if the base rhythm allows it too (safety fallback)
            if (baseAttackProb > 0.1 || coordination.bypassRhythm) {
                motifForcedAttack = true;
                expectedMotifInterval = matchingMotifNote.interval;
                logDebug(`Motif Mask Match at relative step ${phraseRelativeStep}`);
            }
        }
    }

    // Session Warm-Up: Ramp density from 50% to 100% over first 64 steps
    const warmUpScale = Math.min(1.0, 0.5 + ((soloist.sessionSteps || 0) / 64) * 0.5);

    const intensityScale = 0.5 + intensity * 2.0;
    let attackProb = baseAttackProb * intensityScale * warmUpScale;

    // Breathing Contours: Layer an 8-measure sine wave over the probability
    const sinePeriod = stepsPerMeasure * 8;
    const breathingPhase = (step % sinePeriod) / sinePeriod;
    const breathingOffset = Math.sin(breathingPhase * Math.PI * 2) * 0.25; // +/- 0.25
    attackProb += breathingOffset;

    // Rhythmic Simplification at Low Intensity:
    // Penalize syncopated/weak subdivisions (16ths and weak 8ths) heavily when band is quiet.
    if (intensity < 0.4) {
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

    // Force Fallback Resolution Attack
    let isForcedFallbackResolution = false;
    if (
        soloist.phrasingState === 'resolution' &&
        soloist.activeSteps <= 0 &&
        isBeatStart &&
        soloist.lastAttackStep !== step
    ) {
        shouldAttack = true;
        isForcedFallbackResolution = true;
        attackProb = 1.0;
    }

    if (isForcedFallbackResolution || isSectionDownbeat) {
        shouldAttack = true;
    } else if (
        soloist.phrasingState === 'response' &&
        soloist.motifCache &&
        soloist.motifCache.length > 0
    ) {
        if (motifForcedAttack) {
            shouldAttack = true;
        } else if (
            phraseRelativeStep < soloist.motifCache[soloist.motifCache.length - 1].relativeStep
        ) {
            // Force rest if we are still within the motif duration but there's no note
            shouldAttack = false;
        } else {
            // Motif ended, fall back to normal probabilities
            shouldAttack = Math.random() < attackProb;
        }
    } else {
        shouldAttack = Math.random() < attackProb;
    }

    if (!shouldAttack) {
        return null;
    }

    // Increment heat for density fatigue
    soloist.notesInPhrase = (soloist.notesInPhrase || 0) + 1; // @worker-mutation
    soloist.lastAttackStep = step; // @worker-mutation

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
        if (!isScaleTone) {
            continue;
        }

        const dist = Math.abs(m - lastMidi);

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

        // Motif Recall Pitch Shifting: heavily weight the expected motif interval
        if (soloist.phrasingState === 'response' && expectedMotifInterval !== null) {
            if (interval === expectedMotifInterval) {
                weight += 200; // Strongly pull toward the masked interval
            }
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
            if (upcomingInterval === 0 || upcomingInterval === upcoming3rd % 12) {
                if (isSectionDownbeat || isForcedFallbackResolution) {
                    weight += 500; // Force resolution on downbeat or fallback
                } else if (
                    soloist.phrasingState === 'resolution' &&
                    distanceToStructuralDownbeat <= stepsPerMeasure
                ) {
                    // Exponential multiplier pulling toward the checkpoint as we get closer (last measure)
                    // At distance 16 (1 measure), weight is slightly boosted.
                    // At distance 2 (1 eighth note), weight is heavily boosted.
                    const distanceFactor = 1.0 - distanceToStructuralDownbeat / stepsPerMeasure;
                    const exponentialPull = distanceFactor ** 2 * 200;
                    weight += 50 + exponentialPull;
                } else if (
                    soloist.transitionState === 'lead_in' &&
                    distanceToStructuralDownbeat <= 8
                ) {
                    weight += 100 + (8 - distanceToStructuralDownbeat) * 15; // Linear pull for standard lead_in
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
    if (['funk', 'disco', 'ska'].includes(activeStyle)) {
        durationSteps = 1;
    }

    // Context Aware Durations: Calculate gap to next projected note
    let gapToNextNote = 4; // default conservative lookahead
    if (soloist.phrasingState === 'response' && soloist.motifCache) {
        const nextMotifNote = soloist.motifCache.find((m) => m.relativeStep > phraseRelativeStep);
        if (nextMotifNote) {
            gapToNextNote = nextMotifNote.relativeStep - phraseRelativeStep;
        } else {
            gapToNextNote = stepsPerMeasure - (step % stepsPerMeasure); // gap to end of measure
        }
    } else {
        // Find next emphasis peak
        for (let nextOffset = 1; nextOffset <= 8; nextOffset++) {
            const lookaheadStep = step + nextOffset;
            const lbIdx = Math.floor((lookaheadStep % stepsPerMeasure) / 4);
            const lsInB = (lookaheadStep % stepsPerMeasure) % 4;
            const lEmphasisIdx = (lbIdx % 4) * 4 + (lsInB % 4);
            if (emphasisMap[lEmphasisIdx] > 0.4) {
                gapToNextNote = nextOffset;
                break;
            }
        }
    }

    // Choose duration: connect the notes (legato) or staccato
    const isLegato = Math.random() < (intensity < 0.5 ? 0.7 : 0.3);
    if (isLegato) {
        durationSteps = Math.min(8, gapToNextNote);
    } else {
        durationSteps = Math.max(1, Math.floor(gapToNextNote / 2));
    }

    // Override for short styles
    if (['funk', 'disco', 'ska'].includes(activeStyle)) {
        durationSteps = 1;
    }

    // Dynamic Duration Scaling: Play longer, simpler notes at low intensity
    if (intensity < 0.5 && !isPolyphonic) {
        // At 0.1 intensity, 80% chance for a long note (4-8 steps).
        // At 0.4 intensity, 20% chance.
        const longNoteChance = 1.0 - intensity * 2.0;
        if (Math.random() < longNoteChance) {
            // Pick a longer duration that aligns with the beat
            durationSteps = Math.max(durationSteps, Math.random() < 0.5 ? 4 : 8); // Quarter or Half note
        }
    }

    // Ensure we don't bleed past the structural downbeat heavily if resolving
    if (soloist.phrasingState === 'resolution') {
        const remainingToDownbeat = stepsPerMeasure - (step % stepsPerMeasure);
        if (remainingToDownbeat > 0) {
            durationSteps = Math.min(durationSteps, remainingToDownbeat + 4);
        }
    }

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

    // Save Motif if in Call state
    if (soloist.phrasingState === 'call' && soloist.motifCache) {
        // Stop recording the motif if we have rested for more than 1 measure
        // or if the motif itself has extended past 1.5 measures to prevent large silences from being repeated
        let isHugeGap = false;
        if (soloist.motifCache.length > 0) {
            const lastMotifNote = soloist.motifCache[soloist.motifCache.length - 1];
            if (phraseRelativeStep - lastMotifNote.relativeStep >= stepsPerMeasure) {
                isHugeGap = true;
            }
        }

        if (
            soloist.motifCache.length < 16 &&
            phraseRelativeStep < stepsPerMeasure * 1.5 &&
            !isHugeGap
        ) {
            // hard limit to keep memory tight
            const relativeInterval = ((result.midi % 12) - (targetChord.rootMidi % 12) + 12) % 12;
            soloist.motifCache.push({
                // @worker-mutation
                relativeStep: phraseRelativeStep,
                interval: relativeInterval,
                durationSteps: result.durationSteps,
            });
            logDebug(`Motif recorded: step ${phraseRelativeStep}, int ${relativeInterval}`);
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
