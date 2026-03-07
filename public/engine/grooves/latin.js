import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    isLatin: true,
};

/**
 * Maps intensity to motif complexity for Latin / Bossa.
 * 0: Classic Bossa Nova (Understated/Grounded)
 * 1: Busy Bossa / Songo Style (Increased Syncopation)
 * 2: Driving Samba (High 16th Density)
 * 3: Partido Alto (Syncopated Displacement)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Pure Bossa Nova at low intensity
    }

    // Stable seed ranges for core motifs
    if (seed < 0.2) {
        return 0;
    }
    if (seed < 0.5) {
        return 1;
    }

    if (intensity < 0.75) {
        return seed < 0.8 ? 0 : 1;
    }

    if (seed < 0.8) {
        return 2; // Samba
    }
    return 3; // Partido Alto
}

export function applyOverrides(context, state) {
    const {
        step,
        inst,
        playback,
        groove,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isBeatStart,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        stepsPerBar,
        tsConfig,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    const midBeatIndex = tsConfig.isCompound
        ? Math.floor(tsConfig.grouping.length / 2)
        : Math.floor(tsConfig.beats / 2);
    const quarterBeatIndex = Math.floor(midBeatIndex / 2);
    const lastBeatIndex = tsConfig.isCompound ? tsConfig.grouping.length - 1 : tsConfig.beats - 1;

    // --- 1. KICK PATTERNS (Surdo Feel) ---
    if (inst.name === 'Kick') {
        shouldPlay = false;
        // Basic Bossa/Samba Kick: 1, pickup to 2, 3, pickup to 4
        if (
            isDownbeat ||
            (isAOfBeat && beatIndex === 0) ||
            (isBeatStart && beatIndex === midBeatIndex) ||
            (isAOfBeat && beatIndex === midBeatIndex)
        ) {
            shouldPlay = true;
            velocity = isBeatStart
                ? scaleVelocity(1.1, intensity, 0.1)
                : scaleVelocity(0.85, intensity, 0.1);
        }

        if (intensity > 0.75 && (activeMotif === 2 || activeMotif === 3)) {
            if (isAOfBeat && (beatIndex === midBeatIndex - 1 || beatIndex === lastBeatIndex)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.7, intensity, 0.2);
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        soundName = 'Sidestick';

        if (activeMotif === 0) {
            if (
                isDownbeat ||
                (isAOfBeat && beatIndex === 0) ||
                (isOffbeat && beatIndex === quarterBeatIndex) ||
                (isOffbeat && beatIndex === midBeatIndex) ||
                (isEOfBeat && beatIndex === lastBeatIndex)
            ) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            if (
                (isOffbeat && beatIndex === 0) ||
                (isEOfBeat && beatIndex === quarterBeatIndex) ||
                (isBeatStart && beatIndex === midBeatIndex) ||
                (isAOfBeat && beatIndex === midBeatIndex) ||
                (isOffbeat && beatIndex === lastBeatIndex)
            ) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            if (
                isDownbeat ||
                (isBeatStart && beatIndex === quarterBeatIndex) ||
                (isAOfBeat && beatIndex === quarterBeatIndex) ||
                (isBeatStart && beatIndex === midBeatIndex) ||
                (isAOfBeat && beatIndex === midBeatIndex) ||
                (isEOfBeat && beatIndex === lastBeatIndex) ||
                (isAOfBeat && beatIndex === lastBeatIndex)
            ) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            if (
                isDownbeat ||
                (isAOfBeat && beatIndex === 0) ||
                (isOffbeat && beatIndex === quarterBeatIndex) ||
                (isOffbeat && beatIndex === midBeatIndex) ||
                (isBeatStart && beatIndex === lastBeatIndex)
            ) {
                shouldPlay = true;
            }
        }

        if (isTurnaround && intensity > 0.8) {
            if (beatIndex === lastBeatIndex) {
                shouldPlay = true;
                velocity = 1.0 + Math.random() * 0.2;
                soundName = 'Snare';
            }
        }

        if (shouldPlay) {
            velocity = 0.9 + intensity * 0.1 + Math.random() * 0.2;
            if (intensity > 0.85 && roll(0.4)) {
                soundName = 'Snare';
                velocity *= 1.15;
            }
        }

        if (groove.lastDrumPreset === 'Bossa Nova') {
            soundName = 'Sidestick';
            const bossaStep = step % (stepsPerBar * 2);
            const isFirstBar = bossaStep < stepsPerBar;
            if (isFirstBar) {
                if (
                    isDownbeat ||
                    (isAOfBeat && beatIndex === 0) ||
                    (isOffbeat && beatIndex === quarterBeatIndex) ||
                    (isOffbeat && beatIndex === midBeatIndex) ||
                    (isEOfBeat && beatIndex === lastBeatIndex)
                ) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.9, intensity, 0.15);
                }
            } else {
                if (
                    (isBeatStart && beatIndex === 0) ||
                    (isAOfBeat && beatIndex === 0) ||
                    (isOffbeat && beatIndex === quarterBeatIndex) ||
                    (isEOfBeat && beatIndex === midBeatIndex) ||
                    (isEOfBeat && beatIndex === lastBeatIndex)
                ) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.9, intensity, 0.15);
                }
            }
        }
    } else if (inst.name === 'Shaker') {
        shouldPlay = true;
        velocity =
            isBeatStart || isOffbeat
                ? scaleVelocity(0.8, intensity, 0.15)
                : scaleVelocity(0.4, intensity, 0.3);
        if (isBeatStart) {
            velocity *= 1.15;
        }
    } else if (inst.name === 'Conga') {
        if (
            (isBeatStart && beatIndex === quarterBeatIndex) ||
            (isAOfBeat && beatIndex === midBeatIndex) ||
            (isBeatStart && beatIndex === lastBeatIndex) ||
            (isAOfBeat && beatIndex === lastBeatIndex)
        ) {
            shouldPlay = true;
            if (isBeatStart && beatIndex === lastBeatIndex) {
                soundName = 'CongaHighSlap';
                velocity = scaleVelocity(0.8, intensity, 0.25);
            } else if (isAOfBeat && beatIndex === lastBeatIndex) {
                soundName = 'CongaHigh';
                velocity = scaleVelocity(0.7, intensity, 0.1);
            } else {
                soundName = 'CongaHighMute';
                velocity = 0.6;
            }
        }
    } else if (inst.name === 'Agogo' || inst.name.includes('Cowbell')) {
        if (intensity > 0.8 && (activeMotif === 2 || activeMotif === 3)) {
            if (
                ((isAOfBeat && beatIndex === 0) ||
                    (isOffbeat && beatIndex === quarterBeatIndex) ||
                    (isAOfBeat && beatIndex === midBeatIndex) ||
                    (isOffbeat && beatIndex === lastBeatIndex)) &&
                roll(0.25, intensity)
            ) {
                shouldPlay = true;
                velocity = 0.9;
                soundName = beatIndex < midBeatIndex ? 'CowbellHigh' : 'CowbellLow';
            }
        }
    }

    if (shouldPlay && inst.name === 'Snare' && intensity < INTENSITY_BANDS.LOW) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
