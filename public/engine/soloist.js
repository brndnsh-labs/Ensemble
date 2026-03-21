import { TIME_SIGNATURES } from '../config.js';
import { calculateTimingOffset, getFrequency } from '../utils.js';
import {
    GENRE_STYLE_MAPPING,
    INFLUENCE_POOLS,
    SOLOIST_INTENTS,
    STYLE_CONFIG,
} from './soloist-config.js';
import { selectPitchAndDevices } from './soloist-pitch-engine.js';
import { generateRhythmPlan } from './soloist-rhythm-engine.js';

/**
 * Resets the internal generative state of the soloist.
 * Called when the transport is flushed or reset.
 * @param {import('../types.js').EnsembleState} state
 */
export function resetSoloistState(state) {
    const { soloist } = state;
    soloist.isResting = true; // @worker-mutation
    soloist.phrasingState = 'rest'; // @worker-mutation
    /** @type {any} */ (soloist).transitionState = null; // @worker-mutation
    soloist.rhythmicMotif = []; // @worker-mutation
    soloist.busySteps = 0; // @worker-mutation
    soloist.activeSteps = 0; // @worker-mutation
    soloist.restSteps = 0; // @worker-mutation
    soloist.sessionSteps = 0; // @worker-mutation
    soloist.deviceBuffer = []; // @worker-mutation
    soloist.hookBuffer = []; // @worker-mutation
    soloist.sharedHookBuffer = []; // @worker-mutation
    soloist.lickDictionary = []; // @worker-mutation
    soloist.recentNotes = []; // @worker-mutation
}

/**
 * Simplified soloist engine.
 * Focuses on lively, probabilistic phrasing with form and meter awareness.
 * Uses a two-phase Rhythm and Pitch engine.
 * @param {import('../types.js').EnsembleState} state
 * @param {any} currentChord
 * @param {any} nextChord
 * @param {number} step
 * @param {number|null} _prevFreq
 * @param {number} _octave
 * @param {string} style
 * @param {number} stepInChord
 * @param {any} [coordination]
 * @param {import('../types.js').StepInfo} [stepInfo]
 */
export function getSoloistNote(
    state,
    currentChord,
    nextChord,
    step,
    _prevFreq,
    _octave,
    style,
    stepInChord,
    coordination = {},
    stepInfo,
) {
    const { playback, groove, soloist, arranger } = state;
    if (!currentChord) {
        return null;
    }

    let activeStyle = style;
    if (activeStyle === 'smart') {
        /** @type {any} */
        const mapping = GENRE_STYLE_MAPPING;
        activeStyle = mapping[groove.genreFeel] || 'scalar';
    }

    let intensity = playback.bandIntensity || 0.5;

    // --- Safety: Initialize phraseContext if missing (for tests/legacy) ---
    if (!soloist.phraseContext) {
        soloist.phraseContext = /* @direct-mutation */ {
            role: 'call',
            skeleton: [],
            lastInterval: null,
            profile: 'srv',
        };
    }

    // --- Greats Profiles: Intensity/Density Overrides ---
    if (activeStyle === 'blues' && soloist.phraseContext?.profile === 'miles') {
        intensity *= 0.6; // Miles uses much more space
    }

    /** @param {string} msg */
    const logDebug = (msg) => {
        if (playback.debugSoloist) {
            console.log(`[Soloist Debug] Step ${step} (mStep: ${measureStep}): ${msg}`);
        }
    };

    /**
     * Evaluates the performance intent (Conservative, Conversational, Exploratory)
     * based on intensity and genre.
     * @param {number} i Intensity (0.0 - 1.0)
     * @param {string} s Active Style
     */
    const calculateSoloistIntent = (i, s) => {
        let profile = SOLOIST_INTENTS.CONSERVATIVE;
        if (i > 0.75) {
            profile = SOLOIST_INTENTS.EXPLORATORY;
        } else if (i > 0.35) {
            profile = SOLOIST_INTENTS.CONVERSATIONAL;
        }

        const res = { ...profile };
        // Musical Style Overrides: Jazz/Bossa are inherently syncopated
        if (s === 'jazz' || s === 'bossa' || s === 'bird') {
            res.syncopationBias = Math.max(res.syncopationBias, 0.7);
        }
        return res;
    };

    const intentBehavior = calculateSoloistIntent(intensity, activeStyle);

    const config = /** @type {any} */ (STYLE_CONFIG)[activeStyle] || STYLE_CONFIG.scalar;
    const tsConfig =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;

    // If the test suite bypasses setting loop count, default to -1 so we don't accidentally override tests expecting normal logic.
    // The main app usually starts loop count at 0.
    const loopCount = playback.currentLoopCount !== undefined ? playback.currentLoopCount : -1;

    const isHeadMode =
        loopCount === 0 &&
        soloist.sessionSeed &&
        soloist.sessionSeed.notes.length > 0 &&
        step % soloist.sessionSeed.loopLengthSteps < soloist.sessionSeed.loopLengthSteps - 1;

    // We only force strict head playback on loop 0, AND if there is actually a seed to play.
    const isStrictHeadPlayback =
        loopCount === 0 && soloist.sessionSeed && soloist.sessionSeed.notes.length > 0;

    // Themed Improvisation: If loop > 0, we can still use the head as a base but with more variation.
    // As intensity rises, the "Thematic Anchor" dissolves into more generative playing.
    const isThemedImprov =
        loopCount > 0 &&
        soloist.sessionSeed &&
        soloist.sessionSeed.notes.length > 0 &&
        Math.random() < intentBehavior.thematicAnchorScale;

    const isHeadPerformanceMode = isStrictHeadPlayback || isThemedImprov;

    // Use stepInfo for all meter-aware timing calculations
    const measureStep = stepInfo
        ? stepInfo.mStep
        : ((step % stepsPerMeasure) + stepsPerMeasure) % stepsPerMeasure;
    const isBeatStart = stepInfo
        ? stepInfo.isBeatStart
        : ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat === 0;
    const isDownbeat = stepInfo ? stepInfo.isMeasureStart : measureStep === 0;
    const isBackbeat = stepInfo ? stepInfo.isBackbeat : false;

    soloist.sessionSteps = (soloist.sessionSteps || 0) + 1; // @worker-mutation

    /**
     * @param {any} res
     * @returns {any}
     */
    const finalizeNote = (res) => {
        if (!res) {
            return null;
        }
        const results = Array.isArray(res) ? res : [res];
        const primary = results[results.length - 1];

        // Coordination: Mark as busy if playing short durations or dense phrases
        primary.isBusy = (soloist.busySteps || 0) > 0 || (primary.durationSteps || 1) < 1.0;

        soloist.lastMidiPlayed = primary.midi; // @worker-mutation

        let timingOffset = calculateTimingOffset(
            'soloist',
            groove.pocket,
            playback.bandIntensity || 0.5,
        );
        timingOffset += config.genreGravityOffset || 0;

        const stepInBeat = ((measureStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
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

        // Apply rhythmic entropy for themed improvisation
        if (isThemedImprov) {
            timingOffset += (soloist.rhythmicEntropy || 0) * 0.02;
        }

        primary.timingOffset = (primary.timingOffset || 0) + timingOffset;

        if (!primary.isDoubleStop) {
            soloist.lastFreq = getFrequency(primary.midi); // @worker-mutation
        }

        if (activeStyle === 'blues') {
            const relativeInterval =
                ((primary.midi % 12) - ((currentChord.rootMidi || 0) % 12) + 12) % 12;
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
            const stepInFormRelative = ((step % totalFormSteps) + totalFormSteps) % totalFormSteps;
            const note = soloist.leadSheetMelody.find(
                (/** @type {any} */ n) => n.globalStep === stepInFormRelative,
            );

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
            if ((soloist.busySteps || 0) > 0) {
                soloist.busySteps = (soloist.busySteps || 0) - 1; // @worker-mutation
                return null;
            }
        }
    }

    // --- 1. Busy/Device Handling ---
    if (soloist.embellishmentBuffer && soloist.embellishmentBuffer.length > 0) {
        const embNote = soloist.embellishmentBuffer.shift();
        const primaryNote = Array.isArray(embNote) ? embNote[0] : embNote;
        soloist.busySteps = (primaryNote.durationSteps || 1) - 1; // @worker-mutation
        logDebug(`Playing embellishment note, busySteps remaining: ${soloist.busySteps}`);
        return finalizeNote(embNote);
    }
    if (soloist.deviceBuffer && soloist.deviceBuffer.length > 0) {
        const devNote = soloist.deviceBuffer.shift();
        const primaryNote = Array.isArray(devNote) ? devNote[0] : devNote;
        soloist.busySteps = (primaryNote.durationSteps || 1) - 1; // @worker-mutation
        logDebug(`Playing device note, busySteps remaining: ${soloist.busySteps}`);
        return finalizeNote(devNote);
    }
    if ((soloist.busySteps || 0) > 0) {
        soloist.busySteps = (soloist.busySteps || 0) - 1; // @worker-mutation
        logDebug(
            `Silenced because busy holding previous note. busySteps remaining: ${soloist.busySteps}`,
        );
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

    // --- Head Mode / Themed Improv Direct Playback Bypass ---
    if (isHeadPerformanceMode && soloist.sessionSeed) {
        // While playing the head/themed improv, the soloist is technically actively phrasing,
        // so we must force isResting = false to prevent the global orchestrator from giving
        // the solo away to comping instruments due to assumed inactivity.
        soloist.isResting = false; // @worker-mutation
        soloist.phrasingState = 'active'; // @worker-mutation

        const stepInLoop =
            ((step % soloist.sessionSeed.loopLengthSteps) + soloist.sessionSeed.loopLengthSteps) %
            soloist.sessionSeed.loopLengthSteps;
        const headNotes = soloist.sessionSeed.notes.filter(
            (/** @type {any} */ n) => n.step === stepInLoop,
        );

        if (headNotes.length > 0) {
            const headNote = headNotes[0];

            // HYBRID PHRASING PERFORMANCE ENGINE (v2)
            // 1. Macro-Phrasing (Duty Cycle)
            // Determine if we are in a "Breath Zone" (e.g., end of 8-measure block)
            const measureInBlock8 = Math.floor(step / stepsPerMeasure) % 8;
            const isMacroRestZone = measureInBlock8 >= 6; // Last 2 measures of 8-measure block

            // 2. Micro-Phrasing (Probability Gate)
            const styleConfig =
                /** @type {any} */ (STYLE_CONFIG)[activeStyle] || STYLE_CONFIG.scalar;
            const densityBase = styleConfig.rhythmicDensity || 0.5;

            // Survival Probability:
            // - Anchors (Themes): 95-100% chance (protected)
            // - Non-anchors: Scale with intensity and genre density
            // If in Themed Improv mode (Loop > 0), reduce probability slightly to leave more room for "thought"
            const improvFactor = isThemedImprov ? 0.8 : 1.0;
            let survivalProb =
                (headNote.isAnchor ? 0.95 : (0.1 + intensity * 0.9) * densityBase) * improvFactor;

            // Macro-rest overrides:
            // High intensity soloists "push through" structural boundaries to build tension,
            // while low intensity soloists respect the "Breath Zone" to leave space.
            if (
                isMacroRestZone &&
                !headNote.isAnchor &&
                Math.random() > intentBehavior.phrasingBridgeProb
            ) {
                survivalProb = 0; // Force "Breath"
            }

            if (Math.random() < survivalProb) {
                soloist.busySteps = Math.max(0, (headNote.durationSteps || 1) - 1); // @worker-mutation

                logDebug(
                    `[Head/Themed Performance] Playing seeded note: MIDI ${headNote.midi}. (Prob: ${survivalProb.toFixed(2)}, isAnchor: ${headNote.isAnchor})`,
                );

                // --- Improvisation Layer (Phase 3) ---
                let targetMidi = headNote.midi;
                if (isThemedImprov && !headNote.isAnchor) {
                    // Apply ±1-2 semitone "jitter" to seeded pitches based on intensity
                    const jitterRange = intensity > 0.6 ? 2 : 1;
                    if (Math.random() < 0.4) {
                        targetMidi +=
                            Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange;
                    }
                }

                const pseudoRhythmNode = {
                    velocity: headNote.velocity || 0.8,
                    durationSteps: headNote.durationSteps,
                    isStrongBeat: isBeatStart,
                    vibrato: headNote.durationSteps > 4,
                    isSustained: headNote.durationSteps > 4,
                    isHeadBypass: true,
                    targetMidi: targetMidi,
                };

                soloist.lastAttackStep = step; // @worker-mutation

                return selectPitchAndDevices(
                    state,
                    step,
                    pseudoRhythmNode,
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
                    intentBehavior,
                );
            } else {
                logDebug(
                    `[Head/Themed Performance] Gated/Skipped seeded note for phrasing. (Prob: ${survivalProb.toFixed(2)})`,
                );
                // Signal to coordination so band can fill
                if (coordination) {
                    coordination.soloistYield = true;
                }
            }
        }

        if ((soloist.busySteps || 0) > 0) {
            soloist.busySteps = (soloist.busySteps || 0) - 1; // @worker-mutation
        }

        return null;
    }

    // --- Form Awareness & Phrasing States ---
    const totalFormSteps = arranger.totalSteps > 0 ? arranger.totalSteps : 999999;
    const stepInForm = ((step % totalFormSteps) + totalFormSteps) % totalFormSteps;
    const remainingSteps = coordination.sectionEnd - stepInForm;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;

    // --- Structural Structural Influence Rotation ---
    // At the start of a section, the soloist adopts a new "state of mind" (influence)
    // PRE-HEAT: Also trigger rotation at the start of the count-in (e.g., step -16)
    if (stepInForm === coordination.sectionStart || (step < 0 && step === -stepsPerMeasure)) {
        /** @type {any} */
        const pools = INFLUENCE_POOLS;
        const pool = pools[activeStyle] || [];
        if (pool.length > 0) {
            // High intensity sections might shift influence more frequently (probabilistically)
            const shouldShift = soloist.phraseCount === 0 || Math.random() < 0.8;
            if (shouldShift) {
                const nextInfluence = pool[Math.floor(Math.random() * pool.length)];
                soloist.phraseContext.profile = nextInfluence; // @worker-mutation
                logDebug(`New section influence: ${nextInfluence}`);
            }
        }

        // PRE-HEAT: Force a lead-in transition at the start of the song to ensure count-in pick-ups
        if (step < 0 && intensity > 0.3) {
            soloist.transitionState = 'lead_in'; // @worker-mutation
            logDebug(`Forcing START-OF-SONG lead-in`);
        }
    }

    // Transition evaluation at structural points (Downbeat of final measure)
    if (isFinalMeasure && isDownbeat) {
        // PRE-HEAT: If we are at the start of the song, preserve the forced lead_in
        const isStartOfSong = step < 0 && step === -stepsPerMeasure;
        if (!isStartOfSong || soloist.transitionState === null) {
            soloist.transitionState = Math.random() < 0.6 - intensity * 0.4 ? 'rest' : 'lead_in'; // @worker-mutation
            logDebug(`Selected transition state: ${soloist.transitionState}`);
        }

        // Mutate rhythmic entropy at section boundaries based on intensity
        // This locks the variation for the next section, preserving micro-level predictability
        const shiftScale = 0.2 + intensity * 0.4; // Max 0.6 shift at high intensity
        soloist.rhythmicEntropy = (Math.random() * 2 - 1) * shiftScale; // @worker-mutation
    } else if (!isFinalMeasure && stepInForm !== coordination.sectionStart) {
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

    if (isFinalMeasure && (soloist.transitionState || null) === 'rest' && !isStrictHeadPlayback) {
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

        // --- Proactive Lead-in Wake-up ---
        if ((soloist.transitionState || null) === 'lead_in') {
            const beatInMeasure = Math.floor(measureStep / stepsPerBeat);
            // If we are in the last beat of the measure, force wake up to play pick-ups
            if (beatInMeasure === tsConfig.beats - 1) {
                soloist.restSteps = 0; // @worker-mutation
                logDebug(`Forced proactive wake-up for lead-in pickups (last beat of measure).`);
            }
        }

        if ((soloist.restSteps || 0) <= 0 || coordination.bypassRhythm || isHeadMode) {
            const isGoodEntry =
                isBeatStart ||
                (measureStep % (stepsPerBeat / 2) === 0 &&
                    Math.random() < intentBehavior.syncopationBias);
            const preventBreakout =
                isFinalMeasure &&
                (soloist.transitionState || null) === 'rest' &&
                Math.floor(measureStep / stepsPerBeat) >= 2;

            if (
                !preventBreakout &&
                (isGoodEntry ||
                    isHeadMode ||
                    coordination.bypassRhythm ||
                    (soloist.restSteps || 0) < -stepsPerMeasure)
            ) {
                soloist.isResting = false; // @worker-mutation
                soloist.phrasingState = 'active'; // @worker-mutation
                soloist.phraseCount = (soloist.phraseCount || 0) + 1; // @worker-mutation

                const baseLength = config.maxNotesPerPhrase * (0.3 + intensity * 0.7);
                let _nextActiveSteps = Math.floor(
                    baseLength * stepsPerBeat * (0.3 + Math.random() * 1.2),
                );

                if (isHeadMode && soloist.sessionSeed) {
                    _nextActiveSteps = soloist.sessionSeed.loopLengthSteps;
                }

                soloist.activeSteps = _nextActiveSteps; /* @worker-mutation */
                logDebug(
                    `Waking up for ~${soloist.activeSteps} steps${isHeadMode ? ' (Head Mode)' : ''}. Generating new rhythm plan.`,
                );

                // --- Call & Response Framework ---
                if (['blues', 'jazz', 'rock', 'scalar'].includes(activeStyle)) {
                    const wasCall = (soloist.phraseContext?.role || 'call') === 'call';
                    const responseProb = wasCall ? 0.7 : 0.2;
                    const nextRole = Math.random() < responseProb ? 'response' : 'call';

                    logDebug(
                        `C&R transition: ${soloist.phraseContext?.role} -> ${nextRole} (prob: ${responseProb})`,
                    );

                    if (soloist.phraseContext) {
                        soloist.phraseContext.role = nextRole; // @worker-mutation
                    }
                } else {
                    if (soloist.phraseContext) {
                        soloist.phraseContext.role = 'call'; // @worker-mutation
                    }
                }

                // GENERATE RHYTHM PLAN FOR THE PHRASE
                const nextRhythmPlan = generateRhythmPlan(
                    step,
                    soloist.activeSteps || 0,
                    activeStyle,
                    intensity,
                    stepsPerMeasure,
                    stepsPerBeat,
                    coordination,
                    soloist.sessionSteps || 0,
                    soloist,
                    stepInfo,
                );
                soloist.rhythmPlan = nextRhythmPlan; // @worker-mutation

                logDebug(`Generated rhythm plan of length: ${soloist.rhythmPlan.length}`);

                // Capture skeleton for future responses
                if (nextRhythmPlan.length > 0) {
                    // Skeleton is relative steps from phrase start
                    soloist.phraseContext.skeleton = nextRhythmPlan.map(
                        (/** @type {any} */ n) => n.stepTarget - step,
                    ); // @worker-mutation
                }
            }
        }
        if (soloist.isResting) {
            return null;
        }
    } else {
        soloist.activeSteps = (soloist.activeSteps || 0) - 1; // @worker-mutation

        const isStrongResolution =
            measureStep === stepsPerMeasure - 1 || (isBackbeat && intensity > 0.5);

        if (
            (soloist.activeSteps || 0) <= 0 &&
            isStrongResolution &&
            !coordination.bypassRhythm &&
            !isHeadMode
        ) {
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
            logDebug(
                `Active steps expired on strong resolution. Entering 'rest' state for ~${soloist.restSteps} steps.`,
            );
            // Clear rhythm plan just in case
            soloist.rhythmPlan = []; // @worker-mutation
            return null;
        }
    }

    // --- 3. Rhythm Plan Execution & Pitch Selection ---
    if (
        !soloist.rhythmPlan ||
        (soloist.rhythmPlan.length === 0 &&
            !soloist.isResting &&
            (soloist.activeSteps <= 0 || coordination.bypassRhythm))
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
            if (soloist.activeSteps === undefined || soloist.activeSteps <= 0) {
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
                state,
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
                intentBehavior,
            );
        }
    }

    return null; // Idle waiting for next attack or resting
}
