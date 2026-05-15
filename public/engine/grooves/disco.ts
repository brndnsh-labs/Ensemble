import {
    applyStandardBase,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    getPhraseSeed,
    INTENSITY_BANDS,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
};

/**
 * Maps intensity to motif complexity for Disco.
 * 0: Classic 4-on-the-floor, 1: Shimmering hats, 2: Syncopated interplay, 3: Octave Percussion
 */
export function getMotif(seed: number, complexity: number, intensity = 1.0): number {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Pure 4-on-the-floor foundation
    }

    if (seed < 0.25) {
        return 0; // Classic is always an option
    }
    if (seed < 0.55) {
        return 1; // Shimmering hats reachable at mid intensity
    }

    if (intensity < 0.7) {
        return seed < 0.8 ? 0 : 1;
    }

    if (seed < 0.8) {
        return 2; // Syncopated interplay
    }
    return 3; // Octave Percussion
}

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

    const {
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        barIndex,
        isTurnaround,
        stepsPerBar,
        loopStep,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity, isEighthNote } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. KICK (Strict 4-on-the-floor) ---
    if (context.inst.name === 'Kick') {
        shouldPlay = isBeatStart;
        if (shouldPlay) {
            velocity =
                beatIndex === 0
                    ? scaleVelocity(1.2, intensity, 0.15)
                    : scaleVelocity(1.1, intensity, 0.1);
        }
    } else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        // Standard Disco backbeat
        if (isBackbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(1.15, intensity, 0.1);
        }

        // --- Snare Ghosts & Turnarounds ---
        if (intensity > 0.7 && activeMotif >= 2) {
            if (isAOfBeat && beatIndex >= 3 && roll(0.4, intensity)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.3, intensity, 0.3);
            }
        }

        if (isTurnaround && intensity > 0.65) {
            if (loopStep === stepsPerBar - 1) {
                shouldPlay = true;
                velocity = 1.3;
                soundName = 'Snare'; // Full crack
            }
        }

        if (shouldPlay && intensity < INTENSITY_BANDS.LOW) {
            soundName = 'Sidestick';
        }
    } else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        const phraseSeed = getPhraseSeed(sectionSeed, barIndex, 2, activeMotif + 5);
        const supportBeat = phraseSeed > 0.6 ? 2 : 0;
        const supportUsesA = phraseSeed > 0.52;
        const supportSubdivisionHit = supportUsesA ? isAOfBeat : isEOfBeat;
        const supportSubdivision =
            (activeMotif === 1 || activeMotif === 3) &&
            supportSubdivisionHit &&
            (beatIndex === supportBeat || beatIndex === 3);
        const syncopatedTexture = activeMotif === 2 && isEOfBeat && beatIndex === 1;
        const phraseLift = isOffbeat && beatIndex === (phraseSeed < 0.5 ? 1 : 3);

        // Core Offbeat Open Hat (The Disco "And")
        if (isOffbeat) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = phraseLift ? 1.1 : 1.02;
            instTimeOffset -= isTurnaround && beatIndex === 3 ? 0.0025 : 0.0015;
        } else if (isBeatStart) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = beatIndex === supportBeat ? 0.76 : 0.71;
        } else if (supportSubdivision || syncopatedTexture) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = syncopatedTexture ? 0.48 : 0.42;
            instTimeOffset += supportUsesA ? 0.0005 : -0.0005;
        }

        if (isTurnaround && isOffbeat && beatIndex === 3) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.14;
            instTimeOffset -= 0.0025;
        }
    } else if (context.inst.name === 'Perc' || context.inst.name.includes('Cowbell')) {
        // Motif 3: Octave Cowbells
        if (activeMotif === 3) {
            if (isEighthNote) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, intensity, 0.2);
                soundName =
                    isBeatStart && (beatIndex === 0 || beatIndex === 2)
                        ? 'CowbellHigh'
                        : 'CowbellLow';
            }
            if (intensity > 0.9 && !isEighthNote && roll(0.3)) {
                shouldPlay = true;
                velocity = 0.6;
                soundName = 'CowbellHigh';
            }
        }
    }

    // --- FINAL POLISH ---
    if (shouldPlay) {
        if (context.inst.name === 'Snare' && intensity < 0.35) {
            soundName = 'Sidestick';
        }
        if (context.inst.name === 'Open') {
            velocity *= 1.15;
        }
        if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
            velocity = scaleVelocity(velocity, intensity, soundName === 'Open' ? 0.05 : 0.04);
            const ownsArticulation =
                context.inst.name === 'Open' ? soundName === 'Open' : soundName !== 'Open';
            shouldPlay = ownsArticulation;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
