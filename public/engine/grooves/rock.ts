import {
    applyStandardBase,
    binaryTier,
    compoundHatAllowed,
    compoundKickAllowed,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    getPhraseSeed,
    INTENSITY_BANDS,
    makeMotifSelector,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05, // Tighter for rock precision
    blockAdjacentSnare: true,
    backbeatCrack: true,
};

/**
 * Rock Motifs:
 * 0: Classic Standard, 1: Driving Double-Kick, 2: Half-time Feel, 3: Anthem/Stadium
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.6, 0.6),
    {
        maxIntensity: INTENSITY_BANDS.HIGH,
        picks: [[0.3, 0], [0.6, 1], [0.85, 2], 3],
    },
    {
        picks: [[0.2, 1], [0.5, 2], 3],
    },
]);

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

    const {
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isCompound,
        isPulseStart,
        beatIndex,
        drumComplexity,
        orchestration,
        sectionSeed,
        barIndex,
        isTurnaround,
        loopStep,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity, isEighthNote, halfBarStep } =
        base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. HI-HAT / RIDE ---
    if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        const rideVoice = orchestration?.rideVoice;
        const phraseSeed = getPhraseSeed(sectionSeed, barIndex, 2, activeMotif + 1);
        const liftBeat = phraseSeed < 0.45 ? 1 : 3;
        const secondaryLiftBeat = phraseSeed > 0.72 ? 2 : phraseSeed < 0.18 ? 0 : -1;
        const rideSection = rideVoice === 'Ride' || (!rideVoice && activeMotif === 3);
        const openSection = rideVoice === 'Open';
        const dropBeat =
            !rideSection &&
            !openSection &&
            intensity < 0.68 &&
            activeMotif !== 3 &&
            phraseSeed > 0.84
                ? 2
                : -1;

        if (isTurnaround && loopStep >= halfBarStep) {
            // Drop for fills
        } else if (isEighthNote) {
            shouldPlay = true;

            const phraseEndOpen =
                isOffbeat &&
                beatIndex === 3 &&
                intensity > 0.62 &&
                ((openSection && phraseSeed > 0.25) ||
                    intensity > 0.86 ||
                    activeMotif === 3 ||
                    phraseSeed > 0.56);
            const liftOpen =
                isOffbeat &&
                beatIndex === liftBeat &&
                intensity > 0.85 &&
                (openSection || activeMotif === 3 || phraseSeed > 0.68);
            const anthemOpen =
                isOffbeat &&
                beatIndex === secondaryLiftBeat &&
                intensity > 0.92 &&
                activeMotif === 3;
            const openAccent = phraseEndOpen || liftOpen || anthemOpen;

            if (!openAccent && isOffbeat && beatIndex === dropBeat) {
                shouldPlay = false;
            }

            if (shouldPlay) {
                if (openAccent) {
                    // Epic 4 S3: a phrase-ending hat is a *controlled* half-open
                    // into the downbeat — punchier and tighter than a full wash.
                    // The bigger lift/anthem opens stay full-open.
                    soundName = liftOpen || anthemOpen ? 'Open' : 'HiHatHalf';
                    velocity = beatIndex === 3 ? 0.92 : 0.86;
                    instTimeOffset -= 0.0015 + intensity * 0.001;
                } else if (rideSection) {
                    soundName = 'Ride';
                    velocity = isBeatStart
                        ? isDownbeat
                            ? 1.04
                            : beatIndex === 2
                              ? 0.98
                              : 0.94
                        : 0.78;

                    if (isOffbeat && (beatIndex === liftBeat || beatIndex === 3)) {
                        velocity += 0.08;
                        instTimeOffset -= 0.0025 + intensity * 0.001;
                    }
                } else {
                    soundName = 'HiHat';
                    velocity = isBeatStart
                        ? isDownbeat
                            ? 0.96
                            : beatIndex === 2
                              ? 0.91
                              : 0.88
                        : 0.7;

                    if (isOffbeat && beatIndex === liftBeat) {
                        velocity += 0.08;
                        instTimeOffset -= 0.002 + intensity * 0.001;
                        // Epic 4 S3: the accented "lift" offbeat hat breathes
                        // slightly open — the loose-rock drive between a tight
                        // hat and a full bark.
                        soundName = 'HiHatQuarter';
                    } else if (isOffbeat && beatIndex === 3) {
                        velocity += 0.05;
                        instTimeOffset -= 0.003 + intensity * 0.0015;
                    } else if (isBeatStart && beatIndex === 2) {
                        instTimeOffset += 0.0015;
                    }
                }

                if (isOffbeat && beatIndex === secondaryLiftBeat && soundName !== 'Open') {
                    velocity += 0.04;
                }

                velocity = scaleVelocity(
                    velocity,
                    intensity,
                    soundName === 'Open' ? 0.08 : soundName === 'Ride' ? 0.07 : 0.06,
                );

                const ownsArticulation =
                    context.inst.name === 'Open' ? soundName === 'Open' : soundName !== 'Open';
                shouldPlay = ownsArticulation;
            }
        }

        if (shouldPlay && !compoundHatAllowed(context, { soundName })) {
            shouldPlay = false;
        }
    }
    // --- 2. KICK DRUM ---
    else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        // Foundation: Always on non-backbeat pulses
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.25 : 1.15;
        }
        // why: epic-1-compound-meter S16b F1 — the `!isBackbeat` guard above
        // excludes the second-pulse position in 6/8 (since default backbeat[1]
        // aligns with isPulseStart at mStep 6), leaving only the downbeat as
        // foundation. Compound rock at intensity 0.5 needs both dotted-quarter
        // pulses to anchor the bar — without this line, the listener hears
        // "kick on 1 only" instead of "kick on both pulses."
        if (isCompound && isPulseStart && !shouldPlay) {
            shouldPlay = true;
            velocity = 1.15;
        }

        // Motif 1: Double Kicks (offbeats after non-backbeat pulses)
        if (activeMotif === 1 && isOffbeat && !isBackbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(0.9, intensity, 0.15);
        }

        // Motif 2: Half-time (Heavier kick on downbeat, optional next non-backbeat pulse)
        if (activeMotif === 2) {
            if (isDownbeat) {
                shouldPlay = true;
                velocity = 1.4;
            } else if (isBeatStart && !isBackbeat && !isDownbeat && roll(0.6, intensity)) {
                shouldPlay = true;
                velocity = 1.1;
            } else if (isOffbeat && isBackbeat && roll(0.4, intensity)) {
                shouldPlay = true; // Anticipation
                velocity = 0.85;
            }
        }

        // Motif 3: Anthem (Feathered on backbeats)
        if (activeMotif === 3 && isBeatStart && isBackbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(0.65, intensity, 0.1); // Feathered to anchor
        }

        // General Syncopation (Random kicks)
        if (intensity > 0.7 && !shouldPlay && isOffbeat && roll(0.2, intensity)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.7, intensity, 0.2);
        }

        if (shouldPlay && !compoundKickAllowed(context)) {
            shouldPlay = false;
        }
    }
    // --- 3. SNARE ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        if (activeMotif === 2) {
            if (isBackbeat) {
                shouldPlay = true;
            }
        } else {
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            // Orchestration Override
            if (orchestration?.snareVoice === 'Sidestick') {
                soundName = 'Sidestick';
                velocity = 0.8;
            } else if (orchestration?.snareVoice === 'None') {
                shouldPlay = false;
            } else {
                soundName = 'Snare';
                // Higher floor for rock snare to ensure it "cracks"
                velocity = scaleVelocity(1.15, intensity, 0.15);
            }
        }

        // Ghost notes (Modern/Driving)
        if (intensity > 0.6 && !shouldPlay && isOffbeat && roll(0.15, intensity)) {
            shouldPlay = true;
            soundName = 'Sidestick';
            velocity = 0.4;
        }

        // Turnaround Fills
        if (isTurnaround && loopStep >= halfBarStep) {
            if (isEighthNote && roll(0.5, intensity)) {
                shouldPlay = true;
                soundName = 'Snare';
                velocity = 1.1;
            }
        }
    }
    // --- 4. TOMS ---
    else if (context.inst.name.includes('Tom')) {
        if (isTurnaround && loopStep >= halfBarStep) {
            // Distribute across toms for energy
            if (isEighthNote && roll(0.6, intensity)) {
                shouldPlay = true;
                velocity = 1.15;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
