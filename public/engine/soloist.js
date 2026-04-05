import { TIME_SIGNATURES } from '../config.js';
import { applyBluesBends, calculateTimingOffset, getFrequency } from '../utils.js';
import {
    INFLUENCE_POOLS,
    resolveSoloistStyle,
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

    const activeStyle = resolveSoloistStyle(style, groove.genreFeel);

    let intensity = playback.bandIntensity || 0.5;

    // --- Greats Profiles: Intensity/Density Overrides ---
    if (activeStyle === 'blues' && soloist.phraseContext?.profile === 'miles') {
        intensity *= 0.6; // Miles uses much more space
    }

    // Loop-Aware Intensity Nudge: Subtle boost per loop (+0.05) to build energy
    const loopCount = playback.currentLoopCount !== undefined ? playback.currentLoopCount : -1;
    const effectiveIntensity = Math.min(1.0, intensity + Math.max(0, loopCount) * 0.05);

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

    const intentBehavior = calculateSoloistIntent(effectiveIntensity, activeStyle);

    const config = /** @type {any} */ (STYLE_CONFIG)[activeStyle] || STYLE_CONFIG.scalar;
    const tsConfig =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;

    const hasSessionSeed = Boolean(soloist.sessionSeed && soloist.sessionSeed.notes.length > 0);
    const headSessionSeed = hasSessionSeed ? soloist.sessionSeed : null;
    const headNotes = headSessionSeed
        ? headSessionSeed.notes.filter((/** @type {any} */ n) => {
              if (step < 0 && n.step === step) {
                  return true;
              }
              const wrappedNoteStep =
                  ((n.step % headSessionSeed.loopLengthSteps) + headSessionSeed.loopLengthSteps) %
                  headSessionSeed.loopLengthSteps;
              const stepInLoop =
                  ((step % headSessionSeed.loopLengthSteps) + headSessionSeed.loopLengthSteps) %
                  headSessionSeed.loopLengthSteps;
              return wrappedNoteStep === stepInLoop;
          })
        : [];
    /**
     * @param {number} currentSeedStep
     * @returns {{ gap: number, nextSeedNote: any }}
     */
    const getNextSeedStepInfo = (currentSeedStep) => {
        if (!headSessionSeed?.notes?.length) {
            return {
                gap: Number.POSITIVE_INFINITY,
                nextSeedNote: null,
            };
        }

        const loopLength = headSessionSeed.loopLengthSteps;
        const normalizedCurrent = ((currentSeedStep % loopLength) + loopLength) % loopLength;
        let minGap = loopLength;
        let nextSeedNote = null;

        for (const seedNote of headSessionSeed.notes) {
            const normalizedStep = ((seedNote.step % loopLength) + loopLength) % loopLength;
            let diff = normalizedStep - normalizedCurrent;
            if (diff <= 0) {
                diff += loopLength;
            }
            if (diff < minGap) {
                minGap = diff;
                nextSeedNote = seedNote;
            }
        }

        return { gap: minGap, nextSeedNote };
    };

    // We only force strict head playback on loop 0, AND if there is actually a seed to play.
    const isStrictHeadPlayback = loopCount === 0 && hasSessionSeed;
    const isFirstRestatementLoop = loopCount === 1 && hasSessionSeed;

    // Later loops should always acknowledge seed-note moments, but the spaces between those moments
    // belong to the generative engine. This keeps anchors intelligible without making every future
    // chorus a rigid replay.
    const isThemedImprov = hasSessionSeed && (isFirstRestatementLoop || headNotes.length > 0);

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
            const entropyTimingScale = isFirstRestatementLoop ? 0.5 : 1.0;
            timingOffset += (soloist.rhythmicEntropy || 0) * 0.02 * entropyTimingScale;
        }

        primary.timingOffset = (primary.timingOffset || 0) + timingOffset;

        if (!primary.isDoubleStop) {
            soloist.lastFreq = getFrequency(primary.midi); // @worker-mutation
        }

        applyBluesBends(primary, activeStyle, currentChord);
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
    if (isHeadPerformanceMode && headSessionSeed) {
        // While playing the head/themed improv, the soloist is technically actively phrasing,
        // so we must force isResting = false to prevent the global orchestrator from giving
        // the solo away to comping instruments due to assumed inactivity.
        soloist.isResting = false; // @worker-mutation
        soloist.phrasingState = 'active'; // @worker-mutation
        const sessionSeed = headSessionSeed;
        let shouldFallThrough = false;

        if (headNotes.length > 0) {
            const headNote = headNotes[0];

            // HYBRID PHRASING PERFORMANCE ENGINE (v2)
            // 1. Macro-Phrasing (Duty Cycle)
            // Determine if we are in a "Breath Zone" (e.g., end of 8-measure block)
            const sectionMap = arranger?.sectionMap || [
                { start: 0, end: stepsPerMeasure * 8, label: 'Default' },
            ];
            const currentSection =
                sectionMap.find((s) => step >= s.start && step < s.end) || sectionMap[0];
            const measuresInSection = Math.floor((step - currentSection.start) / stepsPerMeasure);
            const sectionTotalMeasures = Math.floor(
                (currentSection.end - currentSection.start) / stepsPerMeasure,
            );
            const isMacroRestZone =
                sectionTotalMeasures > 4 && measuresInSection >= sectionTotalMeasures - 2;

            // 2. Micro-Phrasing (Probability Gate)
            // Survival Probability:
            // The seeder has already spaced the notes. We don't apply densityBase here to avoid double-penalizing the melody.
            const isProtectedSeedTone =
                headNote.isAnchor ||
                isDownbeat ||
                measureStep >= stepsPerMeasure - stepsPerBeat ||
                (headNote.durationSteps || 0) >= stepsPerBeat;

            let survivalProb = 1.0;

            if (headNote.isAnchor) {
                survivalProb = 1.0; // Anchors always play unless macro-rest overrules
            } else {
                if (isStrictHeadPlayback) {
                    // Loop 0: Play exactly as composed. Guaranteed density for the head.
                    survivalProb = 1.0;
                } else if (isFirstRestatementLoop) {
                    // Loop 1: Preserve the head as a paraphrase, especially at cadence tones.
                    survivalProb = isProtectedSeedTone
                        ? 1.0
                        : Math.min(0.98, 0.82 + intentBehavior.thematicAnchorScale * 0.12);
                } else {
                    // Later loops: keep structural notes audible, but let non-anchors become
                    // springboards for more generative motion instead of simply disappearing.
                    survivalProb = isProtectedSeedTone
                        ? Math.min(0.96, 0.84 + intentBehavior.thematicAnchorScale * 0.12)
                        : 0.55 + effectiveIntensity * 0.28;
                }
            }

            // Macro-rest overrides:
            // High intensity soloists "push through" structural boundaries to build tension,
            // while low intensity soloists respect the "Breath Zone" to leave space.
            if (
                isMacroRestZone &&
                !headNote.isAnchor &&
                !isStrictHeadPlayback &&
                !isFirstRestatementLoop &&
                Math.random() > intentBehavior.phrasingBridgeProb
            ) {
                survivalProb = 0; // Force "Breath"
            }

            if (Math.random() < survivalProb) {
                // Duration protection: Mark soloist as busy for the duration of the note minus 1.
                // This ensures we hold the note but don't block the immediately adjacent step.
                const durationBusySteps = Math.max(0, Math.ceil(headNote.durationSteps || 1) - 1);
                const nextSeedInfo = getNextSeedStepInfo(headNote.step);
                const shouldCapBusyToSpacing = Boolean(
                    headNote.tripletPlacement || nextSeedInfo.nextSeedNote?.tripletPlacement,
                );
                const spacingBusySteps =
                    shouldCapBusyToSpacing && Number.isFinite(nextSeedInfo.gap)
                        ? Math.max(0, nextSeedInfo.gap - 1)
                        : durationBusySteps;
                soloist.busySteps = Math.min(durationBusySteps, spacingBusySteps); // @worker-mutation

                logDebug(
                    `[Head/Themed Performance] Playing seeded note: MIDI ${headNote.midi}. (Prob: ${survivalProb.toFixed(2)}, isAnchor: ${headNote.isAnchor})`,
                );

                // --- Improvisation Layer (Phase 3) ---
                let targetMidi = headNote.midi;
                if (isThemedImprov && !isProtectedSeedTone) {
                    // Keep the first paraphrase close to the tune: only light offbeat nudges.
                    const jitterRange = isFirstRestatementLoop
                        ? 1
                        : effectiveIntensity > 0.75
                          ? 3
                          : effectiveIntensity > 0.5
                            ? 2
                            : 1;
                    const jitterProb = isFirstRestatementLoop ? 0.16 : 0.32;
                    if (Math.random() < jitterProb) {
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
                    seedNote: headNote, // Pass the original seed note for context
                };

                soloist.lastAttackStep = step; // @worker-mutation

                return selectPitchAndDevices(
                    state,
                    step,
                    pseudoRhythmNode,
                    currentChord,
                    nextChord,
                    activeStyle,
                    effectiveIntensity,
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
                const canSubstituteGeneratively =
                    loopCount > 1 && !headNote.isAnchor && !isProtectedSeedTone;
                if (canSubstituteGeneratively) {
                    shouldFallThrough = true;
                } else if (coordination) {
                    coordination.soloistYield = true;
                }
            }
        }
        if ((soloist.busySteps || 0) > 0) {
            soloist.busySteps = (soloist.busySteps || 0) - 1; // @worker-mutation
            return null;
        }

        // --- Gap-Fill Improvisation ---
        // If we are in themed improv, have no seeded note here, and aren't busy,
        // see if the gap to the next note is large enough to warrant a generative fill.
        if (isThemedImprov && headNotes.length === 0 && (soloist.activeSteps || 0) <= 0) {
            const stepInLoop =
                ((step % sessionSeed.loopLengthSteps) + sessionSeed.loopLengthSteps) %
                sessionSeed.loopLengthSteps;
            let minGap = sessionSeed.loopLengthSteps;
            let nextSeedNote = null;
            for (let i = 0; i < sessionSeed.notes.length; i++) {
                let nStep = sessionSeed.notes[i].step;
                if (nStep < 0) {
                    nStep += sessionSeed.loopLengthSteps;
                }
                let diff = nStep - stepInLoop;
                if (diff <= 0) {
                    diff += sessionSeed.loopLengthSteps;
                }
                if (diff < minGap) {
                    minGap = diff;
                    nextSeedNote = sessionSeed.notes[i];
                }
            }

            const fillGapThreshold = isFirstRestatementLoop
                ? Math.max(stepsPerBeat * 2, Math.floor(stepsPerMeasure * 0.5))
                : stepsPerBeat;
            const gapFillProb = isFirstRestatementLoop
                ? Math.min(0.85, 0.25 + effectiveIntensity * 0.45)
                : Math.min(0.9, 0.4 + effectiveIntensity * 0.4);
            const isCadenceGap = measureStep >= stepsPerMeasure - stepsPerBeat;
            const leavesRunwayIntoAnchor = nextSeedNote?.isAnchor && minGap <= stepsPerBeat * 2;

            // Loop 1 should only fill long interior gaps; later loops can be more talkative.
            if (
                !isCadenceGap &&
                !leavesRunwayIntoAnchor &&
                minGap >= fillGapThreshold &&
                Math.random() < gapFillProb
            ) {
                shouldFallThrough = true;
                // Keep the first restatement's fills short so the next seed note still feels inevitable.
                const gapFillSteps = isFirstRestatementLoop
                    ? Math.max(2, Math.floor(stepsPerBeat / 2), Math.floor(minGap / 3))
                    : Math.floor(minGap / 2);
                soloist.activeSteps = gapFillSteps; // @worker-mutation
                soloist.isResting = false; // @worker-mutation
                logDebug(
                    `[Gap-Fill] Found gap of ${minGap} steps. Waking generative engine for ${soloist.activeSteps} steps.`,
                );
            }
        }

        if (!shouldFallThrough) {
            return null;
        }
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
        if (step < 0 && effectiveIntensity > 0.3) {
            soloist.transitionState = 'lead_in'; // @worker-mutation
            logDebug(`Forcing START-OF-SONG lead-in`);
        }
    }

    // Transition evaluation at structural points (Downbeat of final measure)
    if (isFinalMeasure && isDownbeat) {
        // PRE-HEAT: If we are at the start of the song, preserve the forced lead_in
        const isStartOfSong = step < 0 && step === -stepsPerMeasure;
        if (!isStartOfSong || soloist.transitionState === null) {
            soloist.transitionState =
                Math.random() < 0.6 - effectiveIntensity * 0.4 ? 'rest' : 'lead_in'; // @worker-mutation
            logDebug(`Selected transition state: ${soloist.transitionState}`);
        }

        // Mutate rhythmic entropy at section boundaries based on intensity
        // This locks the variation for the next section, preserving micro-level predictability
        const shiftScale = 0.2 + effectiveIntensity * 0.4; // Max 0.6 shift at high intensity
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

        if ((soloist.restSteps || 0) <= 0 || coordination.bypassRhythm || isStrictHeadPlayback) {
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
                    isStrictHeadPlayback ||
                    coordination.bypassRhythm ||
                    (soloist.restSteps || 0) < -stepsPerMeasure)
            ) {
                soloist.isResting = false; // @worker-mutation
                soloist.phrasingState = 'active'; // @worker-mutation
                soloist.phraseCount = (soloist.phraseCount || 0) + 1; // @worker-mutation

                const baseLength = config.maxNotesPerPhrase * (0.3 + effectiveIntensity * 0.7);
                let _nextActiveSteps = Math.floor(
                    baseLength * stepsPerBeat * (0.3 + Math.random() * 1.2),
                );

                if (isStrictHeadPlayback && soloist.sessionSeed) {
                    _nextActiveSteps = soloist.sessionSeed.loopLengthSteps;
                }

                soloist.activeSteps = _nextActiveSteps; /* @worker-mutation */
                logDebug(
                    `Waking up for ~${soloist.activeSteps} steps${isStrictHeadPlayback ? ' (Head Mode)' : ''}. Generating new rhythm plan.`,
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
                    effectiveIntensity,
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
            measureStep === stepsPerMeasure - 1 || (isBackbeat && effectiveIntensity > 0.5);

        if (
            (soloist.activeSteps || 0) <= 0 &&
            isStrongResolution &&
            !coordination.bypassRhythm &&
            !isStrictHeadPlayback
        ) {
            soloist.isResting = true; // @worker-mutation
            soloist.phrasingState = 'rest'; // @worker-mutation
            if (coordination) {
                coordination.soloistPhraseEnd = true;
            }
            const restMultiplier = config.restBase * (2.0 - effectiveIntensity * 1.5);
            // Fatigue Decay: Shorten breaths as song progresses (0.9x per loop)
            const fatigueMultiplier = Math.max(0.5, 1.0 - Math.max(0, loopCount) * 0.1);
            const nextRestSteps = Math.floor(
                stepsPerMeasure * restMultiplier * fatigueMultiplier * (0.5 + Math.random() * 1.5),
            );
            soloist.restSteps = nextRestSteps; // @worker-mutation

            const minimumRestSteps =
                activeStyle === 'bird'
                    ? 0
                    : activeStyle === 'jazz'
                      ? 3
                      : activeStyle === 'blues'
                        ? 3
                        : 4;
            if (soloist.restSteps < minimumRestSteps) {
                soloist.restSteps = minimumRestSteps; // @worker-mutation
            }
            logDebug(
                `Active steps expired on strong resolution. Entering 'rest' state for ~${soloist.restSteps} steps. (Fatigue: ${fatigueMultiplier.toFixed(2)})`,
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
            const baseLength = config.maxNotesPerPhrase * (0.3 + effectiveIntensity * 0.7);
            const planSteps =
                soloist.activeSteps && soloist.activeSteps > 0
                    ? soloist.activeSteps
                    : Math.floor(baseLength * stepsPerBeat * (0.5 + Math.random() * 0.5));
            const nextRhythmPlan = generateRhythmPlan(
                step,
                planSteps,
                activeStyle,
                effectiveIntensity,
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
                effectiveIntensity,
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
