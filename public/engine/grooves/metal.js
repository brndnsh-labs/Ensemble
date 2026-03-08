import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.1,
    blockAdjacentSnare: false,
    backbeatCrack: true,
};

export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.4 || intensity < 0.5) {
        return 0; // Standard Heavy Rock
    }
    if (intensity < 0.7) {
        return seed < 0.5 ? 1 : 2; // Double Kick 8ths / Syncopated
    }
    if (seed < 0.4) {
        return 3; // Double Kick 16ths (Blast/Run)
    }
    return 4; // Intense Syncopation
}

export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        stepsPerBar,
        loopStep,
        isTurnaround,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;
    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const safeIsOffbeat = isOffbeat !== undefined ? isOffbeat : loopStep % (stepsPerBar / 8) === 2;
    const isEighthNote = isBeatStart || safeIsOffbeat;
    const halfBarStep = Math.floor(stepsPerBar / 2);

    if (inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // standard rock kick but heavy
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            }
            if (safeIsOffbeat && beatIndex === 2) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1 || activeMotif === 2) {
            // 8th note double kicks
            if (isEighthNote) {
                if (activeMotif === 1 || (activeMotif === 2 && beatIndex !== 3)) {
                    shouldPlay = true;
                }
            }
        } else if (activeMotif >= 3) {
            // 16th note double kicks (continuous)
            shouldPlay = true;
            if (activeMotif === 4 && isBackbeat) {
                shouldPlay = false; // give space for snare
            }
        }

        if (shouldPlay) {
            velocity = isDownbeat ? 1.25 : 1.1;
            // Slight humanization on 16th note runs
            if (!isEighthNote) {
                velocity *= 0.9;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        soundName = 'Snare';

        if (activeMotif === 3 && intensity > 0.85) {
            // Blast beat (snare on every 8th note)
            if (isEighthNote) {
                shouldPlay = true;
            }
        } else {
            // Standard backbeat
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        if (isTurnaround && loopStep >= halfBarStep) {
            if (isEighthNote || isEOfBeat || isAOfBeat) {
                shouldPlay = true; // snare fill
            }
        }

        if (shouldPlay) {
            velocity = 1.2; // Maximum crack
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open' || inst.name === 'Crash') {
        shouldPlay = false;

        if (isTurnaround && loopStep >= halfBarStep) {
            // Let the snare fill breathe
        } else if (intensity > 0.8) {
            // Washy open hats or cymbals
            soundName = 'Open';
            if (isEighthNote) {
                shouldPlay = true;
            }
        } else {
            soundName = intensity > 0.5 ? 'Open' : 'HiHat';
            if (isEighthNote) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = isBeatStart ? 1.1 : 0.9;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
