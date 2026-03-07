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

export function getSoloistNote(
    currentChord,
    nextChord,
    step,
    _prevFreq,
    _octave,
    style,
    stepInChord,
    _isPriming,
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
        const styleConfig = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
        timingOffset += styleConfig.genreGravityOffset || 0;

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
        if (styleConfig.timingJitter !== undefined) {
            // Scale jitter: at intensity 0.2 it's looser, at 0.9 it's tighter
            const tightness = playback.bandIntensity || 0.5;
            const jitterScale = 1.0 - tightness;
            const jitterMs = styleConfig.timingJitter * jitterScale;
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

    // We intentionally DO increment sessionSteps during priming so the engine warms up
    soloist.sessionSteps = (soloist.sessionSteps || 0) + 1; // @worker-mutation

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

    // --- PIPELINE STEP 1: Calculate Context ---
    // Calculate phraseTension, structural downbeats, etc.
    const remainingSteps = coordination.sectionEnd - step;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;
    const isSectionDownbeat = step === coordination.sectionStart;

    let structuralTargetChord = null;
    let distanceToStructuralDownbeat = stepsPerMeasure;

    if (isFinalMeasure && coordination.stepCoordination?.upcomingSectionFirstChord) {
        structuralTargetChord = coordination.stepCoordination.upcomingSectionFirstChord;
        distanceToStructuralDownbeat = remainingSteps;
    } else if (!isFinalMeasure && coordination.stepCoordination?.upcomingMeasureChord) {
        structuralTargetChord = coordination.stepCoordination.upcomingMeasureChord;
        distanceToStructuralDownbeat = stepsPerMeasure - (step % stepsPerMeasure);
    }

    if (isSectionDownbeat) {
        soloist.phraseTension = 0; // @worker-mutation
    } else {
        // Tension builds as we approach a structural boundary
        // Generally tension is driven by harmonic rhythm and macro phrase
        let newTension = soloist.phraseTension || 0;

        // As distance decreases, tension rises
        if (isFinalMeasure) {
            // Rapid rise in final measure of section
            newTension = Math.max(newTension, 1.0 - distanceToStructuralDownbeat / stepsPerMeasure);
        } else {
            // Slower rise within sections
            newTension += 0.02 * intensity; // Arbitrary small increment scaled by intensity
        }

        soloist.phraseTension = Math.min(1.0, newTension); // @worker-mutation
    }

    // Evaluate target resolution
    const resolutionChord = isSectionDownbeat ? targetChord : structuralTargetChord;
    if (resolutionChord) {
        // Choose gravity note (root, 3rd, or 5th)
        const rootMidi = resolutionChord.rootMidi;
        const thirdInterval =
            resolutionChord.intervals.length > 1 ? resolutionChord.intervals[1] : 4;
        const fifthInterval =
            resolutionChord.intervals.length > 2 ? resolutionChord.intervals[2] : 7;

        // Randomly select one of the strong tones as gravity note for this phrase/subphrase
        // Usually, we pick the one closest to lastMidi, but we can change it when tension zeroes out.
        if (soloist.phraseTension === 0 || !soloist.gravityNote) {
            const rootDist = Math.abs(lastMidi - rootMidi);
            const thirdDist = Math.abs(lastMidi - (rootMidi + thirdInterval));
            const fifthDist = Math.abs(lastMidi - (rootMidi + fifthInterval));

            const minDist = Math.min(rootDist, thirdDist, fifthDist);
            if (minDist === rootDist) {
                soloist.gravityNote = rootMidi; // @worker-mutation
            } else if (minDist === thirdDist) {
                soloist.gravityNote = rootMidi + thirdInterval; // @worker-mutation
            } else {
                soloist.gravityNote = rootMidi + fifthInterval; // @worker-mutation
            }
        }
    } else {
        soloist.gravityNote = targetChord.rootMidi; // @worker-mutation Fallback
    }

    // --- PIPELINE STEP 2: Rhythm Check ---
    const emphasisMap = STYLE_EMPHASIS[activeStyle] || STYLE_EMPHASIS.scalar;
    const bIdx = stepInfo ? stepInfo.beatIndex : Math.floor(measureStep / 4);
    const sInB = stepInfo ? stepInfo.stepInBeat : measureStep % 4;
    const emphasisIdx = (bIdx % 4) * 4 + (sInB % 4);
    const baseAttackProb = emphasisMap[emphasisIdx];

    const baseSyncopationLikelihood = config.syncopationLikelihood ?? 0.5;
    const warmUpScale = Math.min(1.0, 0.5 + ((soloist.sessionSteps || 0) / 64) * 0.5);

    // Scaling based on tension and intensity
    // Low tension = follow emphasis map strictly
    // High tension = allow filling in the gaps
    const tensionFactor = 1.0 + soloist.phraseTension * 0.5;
    let attackProb = baseAttackProb * intensity * warmUpScale * tensionFactor;

    // Rhythmic Restriction at Low Intensity
    if (intensity < 0.4 || Math.random() > baseSyncopationLikelihood) {
        const isSixteenthNote = sInB % 2 !== 0; // Steps 1, 3
        const isOffbeatEighth = sInB === 2; // Step 2

        if (isSixteenthNote) {
            attackProb *= intensity * 0.5; // Heavy penalty
        } else if (isOffbeatEighth) {
            attackProb *= 0.5 + intensity; // Soft penalty
        }
    }

    // Force attack on downbeat resolution
    if (isSectionDownbeat) {
        attackProb = 1.0;
    }

    // Rhythmic Space (Natural Gap)
    // If tension is low and we aren't resolving, occasionally drop prob near zero to breathe
    if (!isSectionDownbeat && soloist.phraseTension < 0.3 && Math.random() < 0.2) {
        attackProb *= 0.1;
    }

    if (coordination.bypassRhythm) {
        attackProb = 1.0;
    }

    const shouldAttack = Math.random() < attackProb;

    if (!shouldAttack) {
        return null; // Natural Rest
    }

    soloist.lastAttackStep = step; // @worker-mutation

    // --- PIPELINE STEP 3: Pitch Generation ---
    const scaleIntervals = getScaleForChord(targetChord, null, style);
    let scaleMask = 0;
    for (let i = 0; i < scaleIntervals.length; i++) {
        scaleMask |= 1 << scaleIntervals[i];
    }
    const rootMidi = targetChord.rootMidi;

    // Active pathing towards gravity note
    let selectedMidi = lastMidi;
    const gravityDir = Math.sign(soloist.gravityNote - lastMidi);

    // Choose step size based on tension
    // High tension allows larger leaps or chromaticism
    const tension = soloist.phraseTension;
    const chromaticism = config.chromaticism ?? 0.2;

    if (tension > 0.7 && Math.random() < chromaticism) {
        // Enclosure or Chromatic passing tone
        // E.g., overshooting the target or approaching it from half-step
        if (Math.abs(lastMidi - soloist.gravityNote) <= 2) {
            // We are close, enclosure
            selectedMidi = soloist.gravityNote + (Math.random() < 0.5 ? 1 : -1);
        } else {
            // Chromatic step towards gravity
            selectedMidi += gravityDir;
        }
    } else {
        // Diatonic stepwise pathing
        // Move towards gravity note, but lock to scale
        let nextDiatonic = lastMidi;
        let found = false;

        // Search up to 4 semitones in the direction of gravity
        for (let i = 1; i <= 4; i++) {
            const candidate = lastMidi + gravityDir * i;
            const pc = ((candidate % 12) + 12) % 12;
            const relativeInterval = (pc - (rootMidi % 12) + 12) % 12;

            if ((scaleMask >> relativeInterval) & 1) {
                nextDiatonic = candidate;
                found = true;
                break;
            }
        }

        if (found) {
            selectedMidi = nextDiatonic;
        } else {
            // Fallback: small random step within scale
            const randomStep = Math.random() < 0.5 ? 1 : -1;
            for (let i = 1; i <= 3; i++) {
                const candidate = lastMidi + randomStep * i;
                const pc = ((candidate % 12) + 12) % 12;
                const relativeInterval = (pc - (rootMidi % 12) + 12) % 12;

                if ((scaleMask >> relativeInterval) & 1) {
                    selectedMidi = candidate;
                    break;
                }
            }
        }
    }

    // Keep within bounds
    selectedMidi = Math.max(minMidi, Math.min(maxMidi, selectedMidi));

    // Evaluate Devices (Grace notes, slides, double stops, etc.)
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

    // --- PIPELINE STEP 4: Articulation ---
    let gapToNextValidStep = 4; // default

    // Evaluate distance to next strong subdivision
    for (let nextOffset = 1; nextOffset <= 8; nextOffset++) {
        const lookaheadStep = step + nextOffset;
        const lbIdx = Math.floor((lookaheadStep % stepsPerMeasure) / 4);
        const lsInB = (lookaheadStep % stepsPerMeasure) % 4;
        const lEmphasisIdx = (lbIdx % 4) * 4 + (lsInB % 4);

        // Next strong beat based on intensity
        const lookaheadThreshold = intensity > 0.7 ? 0.3 : 0.6;
        if (emphasisMap[lEmphasisIdx] > lookaheadThreshold) {
            gapToNextValidStep = nextOffset;
            break;
        }
    }

    let durationSteps = Math.max(1, gapToNextValidStep);

    // Shorter notes if tension is high (more staccato/driving)
    if (soloist.phraseTension > 0.5 && Math.random() < 0.5) {
        durationSteps = Math.max(1, Math.floor(gapToNextValidStep / 2));
    }

    // Longer notes if resolution
    if (isSectionDownbeat) {
        durationSteps = Math.max(4, gapToNextValidStep);
    }

    if (activeStyle === 'neo') {
        durationSteps = Math.max(4, durationSteps); // Neo-Soul defaults to longer, soulful notes
    }

    // Override for short styles
    if (['funk', 'disco', 'ska'].includes(activeStyle)) {
        durationSteps = 1;
    }

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
