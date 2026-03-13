import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
    backbeatCrack: true,
    exemptFromPulseShaping: true, // Trap hats need exact velocities
};

/**
 * Maps intensity to motif complexity for Hip Hop.
 * 0: Classic Boom Bap (MPC Style)
 * 1: Trap Foundation (Consistent 16ths)
 * 2: Trap Skitter (Hi-hat rolls)
 * 3: Modern Hybrid (Syncopated & Busy)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Solid Boom Bap foundation
    }

    if (intensity < 0.65) {
        if (seed < 0.6) {
            return 0;
        }
        return 1; // Trap
    }

    // High Intensity
    if (seed < 0.3) {
        return 1; // Trap Foundation
    }
    if (seed < 0.7) {
        return 2; // Trap Skitters
    }
    return 3; // Hybrid
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
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;
    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. KICK (808 vs Boom Bap) ---
    if (inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // Boom Bap: Grounded 1, optional & of 3
            if (isDownbeat) {
                shouldPlay = true;
            }
            if (isOffbeat && beatIndex === 2 && roll(0.7, intensity)) {
                shouldPlay = true;
            }
        } else {
            // Trap: Highly syncopated
            if (isDownbeat) {
                shouldPlay = true;
            } else if (isOffbeat && (beatIndex === 1 || beatIndex === 2)) {
                if (roll(0.6, intensity)) {
                    shouldPlay = true;
                }
            } else if (isAOfBeat && roll(0.4 * intensity)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.1, intensity, 0.15);
            // Kicks in Hip Hop are slightly lazy (behind)
            instTimeOffset += 0.005 + intensity * 0.005;
        }
    }
    // --- 2. SNARE / CLAP ---
    else if (inst.name === 'Snare') {
        shouldPlay = false;
        soundName = intensity < 0.4 ? 'Sidestick' : 'Snare';

        if (isBackbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(1.1, intensity, 0.1);
        }

        // Occasional ghosting / chatter for Boom Bap
        if (activeMotif === 0 && !shouldPlay && intensity > 0.6 && isOffbeat && roll(0.3)) {
            shouldPlay = true;
            soundName = 'Sidestick';
            velocity = 0.4;
        }
    }
    // --- 3. HI-HATS (The Engine) ---
    else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // Foundation: 8ths or 16ths
        if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.85 : 0.65;
        } else if (activeMotif >= 2 && intensity > 0.7 && (isEOfBeat || isAOfBeat)) {
            // Skitters (32nd note rolls) for Motif 2 & 3
            // Priority over simple 16th fills
            const skitterProb = activeMotif === 2 ? 0.6 : 0.3;
            if (roll(skitterProb)) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = 0.35;
                // Move the skitter slightly to separate it from the grid
                instTimeOffset += (Math.random() - 0.5) * 0.005;
            }
        }

        if (!shouldPlay && activeMotif >= 1 && intensity > 0.5 && (isEOfBeat || isAOfBeat)) {
            // Fill 16ths for Trap
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = 0.45;
        }

        // Offbeat Barks (Open)
        if (isOffbeat && beatIndex === 3 && intensity > 0.65 && roll(0.4)) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.05;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
