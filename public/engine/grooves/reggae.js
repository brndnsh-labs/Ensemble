import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
};

/**
 * Maps intensity to motif complexity for Reggae.
 * 0: One Drop (Kick only on Step 8/Beat 3)
 * 1: Steppers (Kick on every quarter beat)
 * 2: Rockers (Driving/Syncopated)
 * 3: Dub Variations (Busy/Experimental)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Solid One Drop foundation
    }

    // Stable seed ranges for core motifs (0 and 1)
    if (seed < 0.06) {
        return 0;
    }
    if (seed < 0.15) {
        return 1;
    }

    if (intensity < INTENSITY_BANDS.MID) {
        return seed < 0.98 ? 0 : 1;
    }

    if (seed < 0.6) {
        return 1;
    }
    if (seed < 0.85) {
        return 2;
    }
    return 3;
}

export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isBeatStart,
        isOffbeat,
        isAOfBeat,
        beatIndex,
        tsConfig,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const isEighthNote = isBeatStart || isOffbeat;

    // --- Relative Position Markers ---
    // Reggae phrasing is highly centered around the halfway point (Beat 3 in 4/4)
    const midBeatIndex = tsConfig.isCompound
        ? Math.floor(tsConfig.grouping.length / 2)
        : Math.floor(tsConfig.beats / 2);
    const lastBeatIndex = tsConfig.isCompound ? tsConfig.grouping.length - 1 : tsConfig.beats - 1;
    // --- 1. KICK & SNARE INTERPLAY ---
    if (inst.name === 'Kick') {
        shouldPlay = false;
        if (activeMotif === 0) {
            // One Drop: Halfway point (Beat 3 in 4/4)
            if (isBeatStart && beatIndex === midBeatIndex) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Steppers
            if (isBeatStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // Rockers
            if (isBeatStart || (isOffbeat && beatIndex === lastBeatIndex)) {
                shouldPlay = true;
                if (isOffbeat && beatIndex === lastBeatIndex) {
                    velocity = 0.85;
                }
            }
        } else {
            // Dub/Experimental
            if (
                isDownbeat ||
                (isAOfBeat &&
                    (beatIndex === 0 ||
                        beatIndex === midBeatIndex ||
                        beatIndex === lastBeatIndex)) ||
                (isBeatStart && beatIndex === midBeatIndex)
            ) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.1, intensity, 0.15);
            if (isBeatStart && beatIndex === midBeatIndex) {
                instTimeOffset += 0.005;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        // Core Reggae backbeat on halfway point
        if (isBeatStart && beatIndex === midBeatIndex) {
            shouldPlay = true;
            velocity = scaleVelocity(1.2, intensity, 0.1);
            soundName = intensity > 0.65 ? 'Snare' : 'Sidestick';
        }

        if (activeMotif === 3) {
            if (
                ((isAOfBeat && (beatIndex === 0 || beatIndex === midBeatIndex)) ||
                    (isOffbeat && (beatIndex === 1 || beatIndex === lastBeatIndex))) &&
                roll(0.3, intensity)
            ) {
                shouldPlay = true;
                velocity = scaleVelocity(0.4, intensity, 0.3);
                soundName = 'Sidestick';
            }
        }

        if (isTurnaround && intensity > 0.75) {
            if (isAOfBeat && beatIndex === lastBeatIndex && roll(0.4)) {
                shouldPlay = true;
                velocity = 0.9;
                instTimeOffset -= 0.01;
            }
        }

        if (shouldPlay && soundName === 'Sidestick' && intensity > 0.8) {
            velocity *= 1.15;
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;
        if (isEighthNote) {
            shouldPlay = true;
            velocity = isBeatStart ? 0.9 : 0.7;
            if (activeMotif === 3 && intensity > 0.8 && roll(0.4)) {
                shouldPlay = true;
                velocity = 0.4;
            }
        }
        if (isOffbeat && beatIndex === lastBeatIndex && intensity > 0.7 && roll(0.25)) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.1;
        }
    }

    if (shouldPlay && inst.name === 'Snare' && intensity < INTENSITY_BANDS.LOW) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
