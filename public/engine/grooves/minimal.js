import { DEFAULT_CONFIG, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.02,
    blockAdjacentSnare: true,
    backbeatCrack: false,
};

/**
 * @param {number} _seed
 * @param {number} _complexity
 * @param {number} [intensity=1.0]
 * @returns {number}
 */
export function getMotif(_seed, _complexity, intensity = 1.0) {
    if (intensity < 0.4) {
        return 0; // Extremely sparse
    }
    if (intensity < 0.7) {
        return 1; // Sparse
    }
    return 2; // Slightly more active
}

/**
 * @param {any} context
 * @param {import('../../types.js').EnsembleState & any} state
 * @returns {any}
 */
export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        stepsPerBar,
        loopStep,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;
    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const safeIsOffbeat = isOffbeat !== undefined ? isOffbeat : loopStep % (stepsPerBar / 8) === 2;

    if (inst.name === 'Kick') {
        shouldPlay = false;
        if (isDownbeat) {
            shouldPlay = true;
        } else if (activeMotif >= 1 && isBeatStart && beatIndex === 2) {
            shouldPlay = true; // Beat 3
        } else if (activeMotif === 2 && safeIsOffbeat && beatIndex === 1) {
            shouldPlay = true; // "And" of 2
        }

        if (shouldPlay) {
            velocity = scaleVelocity(0.8, intensity, 0.1);
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        soundName = intensity < 0.8 ? 'Sidestick' : 'Snare';

        if (isBackbeat && (activeMotif > 0 || beatIndex === 1)) {
            // At motif 0, only play on beat 2. At motif 1+, play 2 and 4.
            shouldPlay = true;
        }

        if (shouldPlay) {
            velocity = scaleVelocity(0.7, intensity, 0.2);
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;
        soundName = 'HiHat'; // Rarely open in minimal

        if (activeMotif === 0) {
            if (isDownbeat) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            if (isBeatStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            if (isBeatStart || safeIsOffbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(0.4, intensity, 0.2);
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
