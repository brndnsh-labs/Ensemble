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
    if (soloist.isYielding && soloist.isResting) {
        if (soloist.tradeMode === 'manual' && soloist.enabled) {
            soloist.isYielding = false; // @worker-mutation
        } else {
            return null;
        }
    }

    // --- Form Awareness & Phrasing States ---
    const remainingSteps = coordination.sectionEnd - step;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;

    // Evaluate transition state at the downbeat of the final measure
    if (isFinalMeasure && isDownbeat) {
        soloist.transitionState = Math.random() < 0.5 ? 'rest' : 'lead_in'; // @worker-mutation
        logDebug(`Selected transition state: ${soloist.transitionState}`);
    } else if (!isFinalMeasure && step !== coordination.sectionStart) {
        // Only reset if we are past the downbeat, so we can use it to resolve on step 0
        soloist.transitionState = null; // @worker-mutation
    }

    // --- 2. Simplified Phrasing State Machine ---
    if (soloist.isResting === undefined) {
        soloist.isResting = true; // @worker-mutation
        soloist.restSteps = stepsPerMeasure; // @worker-mutation
        soloist.activeSteps = 0; // @worker-mutation
    }

    // If we're in 'rest' transition, enforce silence starting from beat 3 or 4
    if (isFinalMeasure && soloist.transitionState === 'rest') {
        const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
        // Force rest on second half of measure
        const restBeatStart = Math.ceil(tsConfig.beats / 2);
        if (beatInMeasure >= restBeatStart) {
            soloist.isResting = true; // @worker-mutation
            soloist.restSteps = remainingSteps; // @worker-mutation stay resting until next section
        }
    }

    if (soloist.isResting) {
        soloist.restSteps = (soloist.restSteps || 0) - 1; // @worker-mutation

        // Check for break-out
        if (soloist.restSteps <= 0 || coordination.bypassRhythm) {
            // Find a good rhythmic entry point (e.g. downbeat or strong 8th)
            const isGoodEntry =
                isBeatStart || (measureStep % (stepsPerBeat / 2) === 0 && intensity > 0.6);
            // Don't break out if we are in the 'rest' transition late in the measure
            const preventBreakout =
                isFinalMeasure &&
                soloist.transitionState === 'rest' &&
                Math.floor(measureStep / stepsPerBeat) >= Math.ceil(tsConfig.beats / 2);

            if (
                !preventBreakout &&
                (isGoodEntry || coordination.bypassRhythm || soloist.restSteps < -stepsPerMeasure)
            ) {
                soloist.isResting = false; // @worker-mutation
                soloist.notesInPhrase = 0; // @worker-mutation
                // Calculate new active duration based on intensity and config
                const baseLength = config.maxNotesPerPhrase * (0.3 + intensity * 0.7);
                soloist.activeSteps = Math.floor(baseLength * stepsPerBeat * (0.5 + Math.random() * 0.5)); // @worker-mutation
                logDebug(`Waking up for ~${soloist.activeSteps} steps`);
            }
        }
        return null;
    } else {
        soloist.activeSteps = (soloist.activeSteps || 0) - 1; // @worker-mutation

        // Structural Awareness: Defer rest until a strong rhythmic boundary (end of measure or last beat)
        const isEndOfMeasure = measureStep === stepsPerMeasure - 1;
        const isNearEndOfMeasure =
            measureStep >= (tsConfig.beats - 1) * stepsPerBeat && intensity > 0.5;

        if (
            soloist.activeSteps <= 0 &&
            (isEndOfMeasure || isNearEndOfMeasure) &&
            !coordination.bypassRhythm
        ) {
            soloist.isResting = true; // @worker-mutation
            // Calculate rest duration based inversely on intensity
            const restMultiplier = config.restBase * (2.0 - intensity * 1.5);

            // Phrase-Density Fatigue: Longer rests after busy phrases
            const fatigueMultiplier = 1.0 + (soloist.notesInPhrase || 0) * 0.05;

            soloist.restSteps = Math.floor(stepsPerMeasure * restMultiplier * fatigueMultiplier * (0.5 + Math.random() * 1.5)); // @worker-mutation
            if (soloist.restSteps < 4) {
                soloist.restSteps = 4; // @worker-mutation minimum breath
            }
            logDebug(
                `Resting for ~${soloist.restSteps} steps (Fatigue: ${fatigueMultiplier.toFixed(2)}x)`,
            );
            return null;
        }
    }

    // --- 3. Rhythmic Density ---
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

    // Session Warm-Up: Ramp density from 50% to 100% over first 64 steps
    const warmUpScale = Math.min(1.0, 0.5 + ((soloist.sessionSteps || 0) / 64) * 0.5);

    const intensityScale = 0.5 + intensity * 2.0;
    let attackProb = baseAttackProb * intensityScale * warmUpScale;

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

    if (Math.random() > attackProb) {
        return null;
    }

    // Increment heat for density fatigue
    soloist.notesInPhrase = (soloist.notesInPhrase || 0) + 1; // @worker-mutation

    // --- 4. Pitch Selection ---
    CANDIDATE_WEIGHTS.fill(0);

    // Harmonic Anticipation: Shift scale to upcoming chord 1 eighth-note (2 steps) before downbeat
    if (
        isFinalMeasure &&
        soloist.transitionState === 'lead_in' &&
        remainingSteps <= 2 &&
        coordination.stepCoordination?.upcomingSectionFirstChord
    ) {
        targetChord = coordination.stepCoordination.upcomingSectionFirstChord;
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

        // Target Note Resolution
        // When leading in, we target the upcoming chord. On the downbeat, the 'upcoming chord' IS the current targetChord.
        const resolutionChord = isSectionDownbeat
            ? targetChord
            : coordination.stepCoordination?.upcomingSectionFirstChord;

        if (
            (isFinalMeasure || isSectionDownbeat) &&
            (soloist.transitionState === 'lead_in' || isSectionDownbeat) &&
            resolutionChord
        ) {
            const upcomingRoot = resolutionChord.rootMidi;
            // The 3rd interval is typically the second element in intervals array
            const upcoming3rd =
                resolutionChord.intervals.length > 1 ? resolutionChord.intervals[1] : 4;
            const upcomingInterval = (pc - (upcomingRoot % 12) + 12) % 12;

            // Walk toward target note (Root or 3rd) of the upcoming chord
            if (upcomingInterval === 0 || upcomingInterval === upcoming3rd % 12) {
                if (isSectionDownbeat) {
                    weight += 500; // Force resolution on downbeat
                } else {
                    weight += 100 + (stepsPerMeasure - remainingSteps) * 10; // Stronger pull as we get closer
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

    // Dynamic Duration Scaling: Play longer, simpler notes at low intensity
    if (intensity < 0.5 && !isPolyphonic) {
        // At 0.1 intensity, 80% chance for a long note (4-8 steps).
        // At 0.4 intensity, 20% chance.
        const longNoteChance = 1.0 - intensity * 2.0;
        if (Math.random() < longNoteChance) {
            // Pick a longer duration that aligns with the beat
            durationSteps = Math.random() < 0.5 ? 4 : 8; // Quarter or Half note
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
