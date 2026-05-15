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
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
    backbeatCrack: true,
    exemptFromPulseShaping: true, // Trap hats need exact velocities
};

/**
 * Maps intensity to motif complexity for Hip Hop.
 * 0: Classic Boom Bap (MPC Style), 1: Trap Foundation (Consistent 16ths),
 * 2: Trap Skitter (Hi-hat rolls), 3: Modern Hybrid (Syncopated & Busy)
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.65, 0.6),
    {
        picks: [[0.3, 1], [0.7, 2], 3],
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
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        barIndex,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. KICK (808 vs Boom Bap) ---
    if (context.inst.name === 'Kick') {
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
    else if (context.inst.name === 'Snare') {
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
    else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        const phraseSeed = getPhraseSeed(
            sectionSeed,
            barIndex,
            activeMotif === 0 ? 4 : 2,
            activeMotif,
        );
        const releaseBeat = activeMotif === 0 ? 3 : phraseSeed < 0.45 ? 2 : 3;
        const skitterBeat = phraseSeed < 0.34 ? 1 : phraseSeed < 0.67 ? 2 : 3;
        const skitterUsesA = activeMotif === 3 ? phraseSeed > 0.42 : phraseSeed > 0.58;
        const phraseLift = isOffbeat && beatIndex === (phraseSeed < 0.5 ? 1 : 3);
        const boomBapOpen =
            activeMotif === 0 && isOffbeat && beatIndex === releaseBeat && intensity > 0.72;
        const trapOpen =
            activeMotif >= 1 &&
            ((isOffbeat && beatIndex === releaseBeat && intensity > 0.68) ||
                (activeMotif >= 2 &&
                    skitterUsesA &&
                    isAOfBeat &&
                    beatIndex === 3 &&
                    intensity > 0.8));
        const skitterHit =
            activeMotif >= 2 && (skitterUsesA ? isAOfBeat : isEOfBeat) && beatIndex === skitterBeat;

        if (activeMotif === 0) {
            if (isBeatStart || isOffbeat) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = isBeatStart ? 0.82 : 0.62;

                if (isOffbeat) {
                    instTimeOffset += phraseLift ? 0.003 : 0.0015;
                    if (phraseLift) {
                        velocity += 0.08;
                    }
                }
            } else if (isEOfBeat && beatIndex === 1 && phraseSeed > 0.72 && intensity > 0.65) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = 0.34;
                instTimeOffset += 0.0025;
            }
        } else {
            if (isBeatStart || isOffbeat || isEOfBeat || isAOfBeat) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = isBeatStart ? 0.84 : isOffbeat ? 0.64 : 0.42;
            }

            if (phraseLift && soundName === 'HiHat') {
                velocity += 0.07;
            }

            if (skitterHit) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = activeMotif === 2 ? 0.33 : 0.37;
                instTimeOffset += skitterUsesA ? 0.0025 : -0.001;
            }
        }

        if (boomBapOpen || trapOpen) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = activeMotif >= 2 ? 1.02 : 0.94;
            instTimeOffset += activeMotif === 0 ? 0.002 : 0.001;
        }

        if (shouldPlay) {
            velocity = scaleVelocity(velocity, intensity, soundName === 'Open' ? 0.04 : 0.03);
            const ownsArticulation =
                context.inst.name === 'Open' ? soundName === 'Open' : soundName !== 'Open';
            shouldPlay = ownsArticulation;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
