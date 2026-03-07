import { TIME_SIGNATURES } from './config.js';
import { selectPitchAndDevices } from './engine/soloist-pitch-engine.js';
import { generateRhythmPlan } from './engine/soloist-rhythm-engine.js';
import { GENRE_STYLE_MAPPING, STYLE_CONFIG } from './soloist-config.js';
import { getState } from './state.js';
import { calculateTimingOffset, getFrequency } from './utils.js';

/**
 * Simplified soloist engine.
 * Focuses on lively, probabilistic phrasing with form and meter awareness.
 * Uses a two-phase Rhythm and Pitch engine.
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

    const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;

    // Use stepInfo for all meter-aware timing calculations
    const measureStep = stepInfo ? stepInfo.mStep : step % stepsPerMeasure;
    const isBeatStart = stepInfo ? stepInfo.isBeatStart : measureStep % stepsPerBeat === 0;
    const isDownbeat = stepInfo ? stepInfo.isMeasureStart : measureStep === 0;
    const isBackbeat = stepInfo ? stepInfo.isBackbeat : false;

    if (!isPriming) {
        soloist.sessionSteps = (soloist.sessionSteps || 0) + 1; // @worker-mutation
    }

    // --- Helper to finalize legacy notes (Lead Sheet / Devices) ---
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
        timingOffset += config.genreGravityOffset || 0;

        const stepInBeat = measureStep % stepsPerBeat;
        const isSyncopated = stepInBeat % (stepsPerBeat / 2) !== 0;
        if (isSyncopated) {
            timingOffset += 0.007;
        }

        if (primary.velocity < 0.7) {
            timingOffset += 0.005;
        }

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
        soloist.transitionState = Math.random() < 0.6 - intensity * 0.4 ? 'rest' : 'lead_in'; // @worker-mutation
        logDebug(`Selected transition state: ${soloist.transitionState}`);
    } else if (!isFinalMeasure && step !== coordination.sectionStart) {
        soloist.transitionState = null; // @worker-mutation
    }

    // --- 2. Simplified Phrasing State Machine ---
    if (soloist.isResting === undefined) {
        soloist.isResting = soloist.phrasingState === 'rest' || soloist.phrasingState === undefined; // @worker-mutation
        if (soloist.restSteps === undefined) {
            soloist.restSteps = soloist.isResting ? stepsPerMeasure : 0; // @worker-mutation
        }
        if (soloist.activeSteps === undefined) {
            soloist.activeSteps = soloist.isResting ? 0 : stepsPerMeasure * 2; // @worker-mutation
        }
    }

    if (isFinalMeasure && soloist.transitionState === 'rest') {
        const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
        const restBeatStart = tsConfig.beats >= 4 ? 2 : 1;
        if (beatInMeasure >= restBeatStart) {
            soloist.isResting = true; // @worker-mutation
            soloist.phrasingState = 'rest'; // @worker-mutation
            soloist.restSteps = remainingSteps; // @worker-mutation
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
                soloist.phrasingState = 'active'; // @worker-mutation

                const baseLength = config.maxNotesPerPhrase * (0.3 + intensity * 0.7);
                const _nextActiveSteps = Math.floor(
                    baseLength * stepsPerBeat * (0.5 + Math.random() * 0.5),
                );
                if (soloist.activeSteps === undefined) {
                    soloist.activeSteps = _nextActiveSteps; /* @worker-mutation */
                }
                logDebug(`Waking up for ~${soloist.activeSteps} steps`);

                // GENERATE RHYTHM PLAN FOR THE PHRASE
                const nextRhythmPlan = generateRhythmPlan(
                    step,
                    soloist.activeSteps,
                    activeStyle,
                    intensity,
                    stepsPerMeasure,
                    stepsPerBeat,
                    coordination,
                    soloist.sessionSteps,
                    soloist,
                    stepInfo,
                );
                soloist.rhythmPlan = nextRhythmPlan; // @worker-mutation
            }
        }
        if (soloist.isResting) {
            return null;
        }
    } else {
        soloist.activeSteps = (soloist.activeSteps || 0) - 1; // @worker-mutation

        const isStrongResolution =
            measureStep === stepsPerMeasure - 1 || (isBackbeat && intensity > 0.5);

        if (soloist.activeSteps <= 0 && isStrongResolution && !coordination.bypassRhythm) {
            soloist.isResting = true; // @worker-mutation
            soloist.phrasingState = 'rest'; // @worker-mutation
            const restMultiplier = config.restBase * (2.0 - intensity * 1.5);
            const fatigueMultiplier = 1.0;
            const nextRestSteps = Math.floor(
                stepsPerMeasure * restMultiplier * fatigueMultiplier * (0.5 + Math.random() * 1.5),
            );
            soloist.restSteps = nextRestSteps; // @worker-mutation

            if (soloist.restSteps < 4) {
                soloist.restSteps = 4; // @worker-mutation
            }
            logDebug(`Resting for ~${soloist.restSteps} steps`);
            // Clear rhythm plan just in case
            soloist.rhythmPlan = []; // @worker-mutation
            return null;
        }
    }

    // --- 3. Rhythm Plan Execution & Pitch Selection ---
    if (
        !soloist.rhythmPlan ||
        (soloist.rhythmPlan.length === 0 && !soloist.isResting && soloist.activeSteps <= 0)
    ) {
        // If plan is uninitialized or exhausted but test forces active state, generate it
        if (!soloist.isResting) {
            const baseLength = config.maxNotesPerPhrase * (0.3 + intensity * 0.7);
            const planSteps =
                soloist.activeSteps && soloist.activeSteps > 0
                    ? soloist.activeSteps
                    : Math.floor(baseLength * stepsPerBeat * (0.5 + Math.random() * 0.5));
            const nextRhythmPlan = generateRhythmPlan(
                step,
                planSteps,
                activeStyle,
                intensity,
                stepsPerMeasure,
                stepsPerBeat,
                coordination,
                soloist.sessionSteps,
                soloist,
                stepInfo,
            );
            soloist.rhythmPlan = nextRhythmPlan; // @worker-mutation
            if (soloist.activeSteps === undefined) {
                soloist.activeSteps = planSteps; /* @worker-mutation */
            }
        } else {
            soloist.rhythmPlan = []; // @worker-mutation
        }
    }

    if (soloist.rhythmPlan.length > 0) {
        while (soloist.rhythmPlan.length > 0 && step > soloist.rhythmPlan[0].stepTarget) {
            soloist.rhythmPlan.shift(); // @worker-mutation
        }
        if (soloist.rhythmPlan.length > 0 && step >= soloist.rhythmPlan[0].stepTarget) {
            const rhythmNode = soloist.rhythmPlan.shift(); // @worker-mutation

            soloist.lastAttackStep = step; // @worker-mutation

            return selectPitchAndDevices(
                step,
                rhythmNode,
                currentChord,
                nextChord,
                activeStyle,
                intensity,
                stepInChord,
                coordination,
                playback,
                soloist,
                groove,
                arranger,
                stepsPerMeasure,
                stepsPerBeat,
            );
        }
    }

    return null; // Idle waiting for next attack or resting
}
