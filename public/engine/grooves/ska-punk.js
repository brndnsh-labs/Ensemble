import {
    applyStandardBase,
    binaryTier,
    DEFAULT_CONFIG,
    makeMotifSelector,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    exemptFromPulseShaping: true,
    entropyMultiplier: 0.04, // Rock solid fast timing
};

/**
 * Maps intensity to motif complexity for Ska-Punk.
 * 0: Classic Ska, 1: Driving 2-Step, 2: Double-Time/Skate Punk, 3: D-Beat
 * @type {(seed: number, complexity: number, intensity?: number) => number}
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.6, 0.6),
    {
        picks: [[0.2, 0], [0.5, 1], [0.8, 2], 3],
    },
]);

/**
 * @param {any} context
 * @param {import('../../types.js').EnsembleState & any} state
 * @returns {any}
 */
export function applyOverrides(context, state) {
    const { base, muted } = applyStandardBase(context, state);
    if (muted) {
        return base;
    }

    const {
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isAOfBeat,
        isEOfBeat,
        beatIndex,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. ENERGETIC PUSH (Micro-timing) ---
    // Rushing the beat drives the Ska-Punk energy.
    instTimeOffset -= 0.006 + intensity * 0.008;

    // --- 2. HI-HAT / OPEN DYNAMICS ---
    if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        const isOpenLane = context.inst.name === 'Open';
        shouldPlay = false;

        // The Skank should feel tight and choked first.
        // Use the Open lane as an accent, not a second mandatory voice.
        if (isOffbeat) {
            if (!isOpenLane) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = scaleVelocity(1.3, intensity, 0.1);
            } else if (intensity > 0.78 && activeMotif >= 1) {
                const accentChance = beatIndex === 3 ? 0.35 : 0.18;
                if (roll(accentChance)) {
                    shouldPlay = true;
                    soundName = 'Open';
                    velocity = scaleVelocity(1.1, intensity, 0.08);
                }
            }
        } else if (!isOpenLane && isBeatStart && (activeMotif >= 1 || intensity > 0.6)) {
            // Keep the eighth notes moving for punk motifs with closed hats.
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = scaleVelocity(0.8, intensity, 0.1);
        }

        // Crash on the One for section energy
        if (isOpenLane && isDownbeat && intensity > 0.8 && roll(0.4)) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.4;
        }
    }
    // --- 3. KICK DRUM ---
    else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // Classic Ska: 1 and 3
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1 || activeMotif === 2) {
            // 2-Step & Double-Time: Every quarter note
            if (isBeatStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // D-Beat / Syncopated
            if (
                isDownbeat ||
                (isAOfBeat && beatIndex === 0) ||
                (isBeatStart && beatIndex === 2) ||
                (isOffbeat && beatIndex === 3)
            ) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.15);
        }
    }
    // --- 4. SNARE POCKET ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        if (activeMotif === 2) {
            // Double Time: Snare on the offbeats!
            if (isOffbeat) {
                shouldPlay = true;
            }
        } else {
            // Standard Backbeat
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.1);
            soundName = intensity > 0.4 ? 'Snare' : 'Sidestick';
        }

        // Turnaround Fill
        if (isTurnaround && intensity > 0.7 && !shouldPlay) {
            if (beatIndex >= 3 && (isEOfBeat || isAOfBeat)) {
                shouldPlay = true;
                soundName = 'Snare';
                velocity = 1.1;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
