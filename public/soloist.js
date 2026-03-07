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

/**
 * Simplified soloist engine.
 * Focuses on lively, probabilistic phrasing with form and meter awareness.
 * Reverts to logic similar to PR 360 while maintaining dynamic time signature support.
 */
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

    // Use stepInfo for all meter-aware timing calculations
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

    const minMidi = 60; // C4
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
    if (soloist.isYielding && (soloist.isResting || soloist.phrasingState === 'rest')) {
        if (soloist.tradeMode === 'manual' && soloist.enabled) {
            soloist.isYielding = false; // @worker-mutation
        } else {
            return null;
        }
    }

    // --- Form Awareness & Phrasing States ---
    const remainingSteps = coordination.sectionEnd - step;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;

    // Transition evaluation at structural points (Downbeat of final measure)
    if (isFinalMeasure && isDownbeat) {
        // Evaluate if we should lead in to the next section or rest at the end of this one
        soloist.transitionState = Math.random() < 0.6 - intensity * 0.4 ? 'rest' : 'lead_in'; // @worker-mutation
        logDebug(`Selected transition state: ${soloist.transitionState}`);
    } else if (!isFinalMeasure && step !== coordination.sectionStart) {
        // Reset transition state once past the boundary
        soloist.transitionState = null; // @worker-mutation
    }

    // --- 2. Simplified Phrasing State Machine ---
    if (soloist.isResting === undefined) {
        // Robust initialization that respects phrasingState
        soloist.isResting = soloist.phrasingState === 'rest' || soloist.phrasingState === undefined; // @worker-mutation
        if (soloist.restSteps === undefined) {
            soloist.restSteps = soloist.isResting ? stepsPerMeasure : 0; // @worker-mutation
        }
        if (soloist.activeSteps === undefined) {
            soloist.activeSteps = soloist.isResting ? 0 : stepsPerMeasure * 2; // @worker-mutation
        }
    }

    // If we're in 'rest' transition, enforce silence starting from beat 3 or 4
    if (isFinalMeasure && soloist.transitionState === 'rest') {
        const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
        const restBeatStart = tsConfig.beats >= 4 ? 2 : 1;
        if (beatInMeasure >= restBeatStart) {
            soloist.isResting = true; // @worker-mutation
            soloist.phrasingState = 'rest'; // @worker-mutation
            soloist.restSteps = remainingSteps; // @worker-mutation stay resting until next section
        }
    }

    if (soloist.isResting) {
        soloist.restSteps = (soloist.restSteps || 0) - 1; // @worker-mutation

        if (soloist.restSteps <= 0 || coordination.bypassRhythm) {
            const isGoodEntry =
                isBeatStart || (measureStep % (stepsPerBeat / 2) === 0 && intensity > 0.6);
            const preventBreakout =
                isFinalMeasure &&
                soloist.transitionState === 'rest' &&
                Math.floor(measureStep / stepsPerBeat) >= 2;

            if (
                !preventBreakout &&
                (isGoodEntry || coordination.bypassRhythm || soloist.restSteps < -stepsPerMeasure)
            ) {
                soloist.isResting = false; // @worker-mutation
                soloist.phrasingState = 'active'; // @worker-mutation for legacy observers
                soloist.notesInPhrase = 0; // @worker-mutation
                const baseLength = config.maxNotesPerPhrase * (0.3 + intensity * 0.7);
                soloist.activeSteps = Math.floor(
                    baseLength * stepsPerBeat * (0.5 + Math.random() * 0.5),
                ); // @worker-mutation
                logDebug(`Waking up for ~${soloist.activeSteps} steps`);
            }
        }
        if (soloist.isResting) {
            return null;
        }
    } else {
        soloist.activeSteps = (soloist.activeSteps || 0) - 1; // @worker-mutation

        // Defer rest until a strong rhythmic boundary (end of measure or backbeat)
        const isStrongResolution =
            measureStep === stepsPerMeasure - 1 || (isBackbeat && intensity > 0.5);

        if (soloist.activeSteps <= 0 && isStrongResolution && !coordination.bypassRhythm) {
            soloist.isResting = true; // @worker-mutation
            soloist.phrasingState = 'rest'; // @worker-mutation
            const restMultiplier = config.restBase * (2.0 - intensity * 1.5);
            const fatigueMultiplier = 1.0 + (soloist.notesInPhrase || 0) * 0.05;
            soloist.restSteps = Math.floor(
                stepsPerMeasure * restMultiplier * fatigueMultiplier * (0.5 + Math.random() * 1.5),
            ); // @worker-mutation
            if (soloist.restSteps < 4) {
                soloist.restSteps = 4; // @worker-mutation minimum breath
            }
            logDebug(`Resting for ~${soloist.restSteps} steps`);
            return null;
        }
    }

    // --- 3. Rhythmic Density ---
    const isSectionDownbeat =
        step === coordination.sectionStart && soloist.transitionState === 'lead_in';

    const emphasisMap = STYLE_EMPHASIS[activeStyle] || STYLE_EMPHASIS.scalar;
    // Map to 16-step emphasis map to handle any meter
    const emphasisIdx = Math.floor((measureStep / stepsPerMeasure) * 16) % 16;
    const baseAttackProb = emphasisMap[emphasisIdx];

    const warmUpScale = Math.min(1.0, 0.5 + ((soloist.sessionSteps || 0) / 64) * 0.5);
    const intensityScale = 0.5 + intensity * 2.0;
    let attackProb = baseAttackProb * intensityScale * warmUpScale;

    // Phrase Contextual Scaling (Fatigue)
    if (soloist.notesInPhrase > 8) {
        attackProb *= 0.8;
    }

    // Rhythmic Simplification at Low Intensity:
    // Penalize syncopated/weak subdivisions (16ths and weak 8ths) heavily when band is quiet.
    if (intensity < 0.4) {
        const isSixteenthNote = stepInBeat % 2 !== 0; // Steps 1, 3
        const isOffbeatEighth = stepInBeat === stepsPerBeat / 2; // Step 2 (the "and")

        if (isSixteenthNote) {
            attackProb *= intensity * 1.5; // Drastic penalty for 16ths
        } else if (isOffbeatEighth) {
            attackProb *= 0.4 + intensity; // Moderate penalty for offbeat 8ths
        }
    }

    if (isFinalMeasure && soloist.transitionState === 'lead_in') {
        attackProb *= 1.5;
    }

    // Boost downbeats to ensure resolution
    if (isDownbeat) {
        attackProb += 0.2;
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
    if (isSectionDownbeat) {
        attackProb = 1.0;
        soloist.transitionState = null; // @worker-mutation
    }

    if (Math.random() > attackProb) {
        return null;
    }

    soloist.notesInPhrase = (soloist.notesInPhrase || 0) + 1; // @worker-mutation
    soloist.lastAttackStep = step; // @worker-mutation

    // --- 4. Pitch Selection ---
    CANDIDATE_WEIGHTS.fill(0);

    // Harmonic Anticipation
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

    const dynamicCenter = 64 + intensity * 12;
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
        if (dist === 0) {
            if (['funk', 'ska'].includes(activeStyle)) {
                weight *= 0.5;
            } else {
                continue;
            }
        }

        if (dist <= 2) {
            weight += 100;
        }
        if (dist <= 4) {
            weight += 50;
        }
        if (targetChord.intervals.some((i) => ((i % 12) + 12) % 12 === interval)) {
            weight += 150;
        }

        const resolutionChord = isSectionDownbeat
            ? targetChord
            : coordination.stepCoordination?.upcomingSectionFirstChord;
        if (
            (isFinalMeasure || isSectionDownbeat) &&
            (soloist.transitionState === 'lead_in' || isSectionDownbeat) &&
            resolutionChord
        ) {
            const upcomingRoot = resolutionChord.rootMidi;
            const upcoming3rd =
                resolutionChord.intervals.length > 1 ? resolutionChord.intervals[1] : 4;
            const upcomingInterval = (pc - (upcomingRoot % 12) + 12) % 12;
            if (upcomingInterval === 0 || upcomingInterval === upcoming3rd % 12) {
                if (isSectionDownbeat) {
                    weight += 500;
                } else {
                    weight += 100 + (stepsPerMeasure - remainingSteps) * 10;
                }
            }
        }

        if (dist > 7) {
            weight *= 0.4;
        }
        const distFromCenter = Math.abs(m - dynamicCenter);
        if (distFromCenter <= 7) {
            weight += 100;
        } else if (distFromCenter <= 14) {
            weight += 40;
        }

        if (m >= 84 && intensity < 0.75) {
            weight *= 0.05;
        } else if (m >= 72 && intensity < 0.35) {
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
        selectedMidi = lastMidi;
    }

    // --- 5. Melodic Devices ---
    const deviceBaseProb = config.deviceProb * (0.5 + intensity);
    const isPolyphonic =
        soloist.mode !== 'monophonic' &&
        (soloist.doubleStopProb ?? 1.0) > 0 &&
        config.doubleStopProb > 0;

    if (isBeatStart && Math.random() < deviceBaseProb) {
        let allowed = [...(config.allowedDevices || [])];
        if (soloist.mode === 'piano') {
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
                isPiano: soloist.mode === 'piano',
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

    // --- 6. Duration & Velocity ---
    let durationSteps = activeStyle === 'bird' ? 2 : Math.random() < 0.6 ? 2 : 4;
    if (['funk', 'disco', 'ska'].includes(activeStyle)) {
        durationSteps = 1;
    }

    let stepVelocity = 0.6 + intensity * 0.4;
    if (isDownbeat) {
        stepVelocity *= 1.25;
    } else if (isBackbeat) {
        stepVelocity *= 1.15;
    } else if (isBeatStart || stepInBeat === stepsPerBeat / 2) {
        stepVelocity *= 1.05;
    }

    if (coordination.bassHit && selectedMidi < 60) {
        stepVelocity *= 0.85;
    }

    const result = {
        midi: selectedMidi,
        velocity: Math.min(1.25, stepVelocity),
        durationSteps,
        bendStartInterval:
            soloist.mode === 'guitar' && durationSteps >= 4 && Math.random() < 0.3
                ? Math.random() < 0.5
                    ? -1
                    : 1
                : 0,
        ccEvents: [],
        timingOffset: 0,
        style: activeStyle,
        isDoubleStop: false,
        isLegato: false,
    };

    // Polyphony check (Double Stops)
    if (
        isPolyphonic &&
        Math.random() < config.doubleStopProb * intensity * (soloist.doubleStopProb ?? 1.0)
    ) {
        const extra = generateExtraNotes({
            soloist,
            currentChord,
            activeStyle,
            effectiveIntensity: intensity,
            selectedMidi,
        });
        if (extra && extra.length > 0) {
            const polyResult = [...extra.map((n) => ({ ...result, ...n })), result];
            if (result.durationSteps > 1) {
                soloist.busySteps = result.durationSteps - 1; // @worker-mutation
            }
            return finalizeNote(polyResult);
        }
    }

    if (result.durationSteps > 1) {
        soloist.busySteps = result.durationSteps - 1; // @worker-mutation
    }

    return finalizeNote(result);
}
