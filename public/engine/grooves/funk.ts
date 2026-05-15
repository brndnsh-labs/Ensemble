import {
    applyStandardBase,
    binaryTier,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    getPhraseSeed,
    makeMotifSelector,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    backbeatCrack: true,
    entropyMultiplier: 0.06, // Tight but expressive
};

/**
 * Maps intensity to motif complexity for Funk.
 * Motifs: 0=Grounded pocket, 1=Ghost heavy, 2=Displaced, 3=Linear
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.7, 0.4),
    {
        picks: [[0.2, 0], [0.5, 1], [0.75, 2], 3],
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
        isPulse,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        orchestration,
        sectionSeed,
        barIndex,
        isTurnaround,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- "The One" Absolute Reinforcement ---
    if (context.inst.name === 'Kick' && isDownbeat) {
        shouldPlay = true;
        velocity = scaleVelocity(1.35, intensity, 0.1);
    }

    // --- Hi-Hat & Open Dynamics ---
    if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;

        const useOrchestration = orchestration?.rideVoice !== undefined;
        const voice = orchestration?.rideVoice;
        const rideSection = voice === 'Ride';
        const openSection = voice === 'Open';
        const phraseSeed = getPhraseSeed(sectionSeed, barIndex, 2, activeMotif + 3);
        const accentBeat = phraseSeed < 0.5 ? 0 : 2;
        const barkBeat = activeMotif === 2 ? (phraseSeed < 0.5 ? 1 : 3) : phraseSeed < 0.66 ? 1 : 3;
        const barkUsesA = activeMotif === 3 ? phraseSeed > 0.45 : phraseSeed > 0.62;
        const barkSubdivisionHit = barkUsesA ? isAOfBeat : isEOfBeat;
        const phraseBark =
            barkSubdivisionHit &&
            beatIndex === barkBeat &&
            (openSection || activeMotif >= 2 || intensity > 0.78 || phraseSeed > 0.72);
        const phraseLift = isOffbeat && beatIndex === accentBeat;
        const phraseRelease = isOffbeat && beatIndex === 3 && intensity > 0.72;
        const dropSixteenth =
            !rideSection &&
            intensity < 0.62 &&
            phraseSeed > 0.78 &&
            ((isAOfBeat && beatIndex === 2) || (isEOfBeat && beatIndex === 3));
        const openAccent = phraseBark || (phraseRelease && (openSection || intensity > 0.78));

        // 16th note shimmer (Texture)
        if (intensity > 0.5 || (useOrchestration && voice !== 'None')) {
            shouldPlay = true;
            soundName = rideSection && (isBeatStart || isOffbeat) ? 'Ride' : 'HiHat';

            // Tiered velocity for the shimmer
            if (isBeatStart) {
                velocity = scaleVelocity(0.85, intensity, 0.15);
            } else if (isOffbeat) {
                velocity = scaleVelocity(0.7, intensity, 0.1);
            } else {
                velocity = scaleVelocity(0.45, intensity, 0.1);
            }

            if (dropSixteenth && !openAccent) {
                shouldPlay = false;
            }

            if (shouldPlay) {
                if (openAccent) {
                    soundName = 'Open';
                    velocity = openSection ? 0.96 : 1.0;
                    instTimeOffset -= barkUsesA ? 0.001 : 0.002;
                } else if (phraseLift) {
                    velocity += 0.08;
                    instTimeOffset -= 0.0015;
                } else if (isEOfBeat) {
                    velocity += phraseSeed > 0.55 ? 0.04 : 0;
                    instTimeOffset -= 0.001;
                } else if (isAOfBeat) {
                    velocity += phraseSeed < 0.35 ? 0.03 : 0;
                    instTimeOffset += 0.001;
                } else if (isOffbeat && beatIndex === 3) {
                    velocity += 0.05;
                    instTimeOffset -= 0.0015;
                }
            }
        } else if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.8 : 0.6;

            if (phraseRelease && intensity > 0.82) {
                shouldPlay = true;
                soundName = 'Open';
                velocity = 0.94;
                instTimeOffset -= 0.0015;
            }
        }

        // Turnaround Bark
        if (isTurnaround && isOffbeat && beatIndex === 3) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.12;
            instTimeOffset -= 0.002;
        } else if (isTurnaround && barkSubdivisionHit && beatIndex >= 2) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.0;
            instTimeOffset -= 0.0015;
        }

        if (shouldPlay) {
            velocity = scaleVelocity(
                velocity,
                intensity,
                soundName === 'Open' ? 0.05 : soundName === 'Ride' ? 0.07 : 0.05,
            );
            const ownsArticulation =
                context.inst.name === 'Open' ? soundName === 'Open' : soundName !== 'Open';
            shouldPlay = ownsArticulation;
        }
    }
    // --- Snare Pocket ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // Fundamental Backbeat
        if (activeMotif === 2) {
            // Displaced backbeat: First backbeat is normal, later ones are displaced to the offbeat
            if (isBackbeat) {
                if (roll(0.5)) {
                    shouldPlay = true;
                    velocity = 1.15;
                }
            } else if (isOffbeat && !isPulse) {
                // Displaced hits on offbeats, higher intensity means more displacement
                if (roll(0.8, intensity)) {
                    shouldPlay = true;
                    velocity = 1.1;
                }
            }
        } else {
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            if (orchestration?.snareVoice === 'Sidestick') {
                soundName = 'Sidestick';
                velocity = 0.8;
            } else if (orchestration?.snareVoice === 'None') {
                shouldPlay = false;
            } else {
                soundName = intensity > 0.4 ? 'Snare' : 'Sidestick';
                velocity = scaleVelocity(1.2, intensity, 0.1);
            }
        }

        // Motif 1: The Funky Drummer (Dense Ghosting)
        if (activeMotif === 1 && !shouldPlay) {
            // High probability for ghosting on all non-beat steps
            if (!isBeatStart && roll(0.6 + intensity * 0.3)) {
                shouldPlay = true;
                soundName = 'Sidestick';
                velocity = scaleVelocity(0.15, intensity, 0.15) + Math.random() * 0.1;
            }
        }

        // Motif 3: Linear Snare (interlocking)
        if (activeMotif === 3 && !shouldPlay) {
            if (isAOfBeat && !isBackbeat && isPulse) {
                if (roll(0.7, intensity)) {
                    shouldPlay = true;
                    soundName = 'Sidestick';
                    velocity = 0.5;
                }
            }
        }

        // General Syncopation
        if (intensity > 0.6 && !shouldPlay) {
            // General syncopation on 'a' of beats or offbeats
            if ((isAOfBeat && isBackbeat) || (isOffbeat && roll(0.2))) {
                if (roll(0.3)) {
                    shouldPlay = true;
                    soundName = intensity > 0.8 ? 'Snare' : 'Sidestick';
                    velocity = 0.7;
                }
            }
        }

        // Low intensity fallback
        if (shouldPlay && intensity < 0.35 && velocity > 0.8) {
            soundName = 'Sidestick';
        }
    }
    // --- Kick Drum ---
    else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        // Grounding
        if (isDownbeat || (isPulse && isBackbeat)) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.3 : 1.1;
        }

        // Motif 3: Linear Kick
        if (activeMotif === 3) {
            if (isEOfBeat && isBackbeat) {
                shouldPlay = true;
                velocity = 0.9;
            }
        }

        // General Syncopation
        if (intensity > 0.7 && !shouldPlay) {
            const syncProb = activeMotif === 1 ? 0.5 : 0.2;
            if (isOffbeat && roll(syncProb)) {
                shouldPlay = true;
                velocity = 0.85;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
