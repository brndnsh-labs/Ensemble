import {
    applyStandardBase,
    binaryTier,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    makeMotifSelector,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    isLatin: true,
};

/**
 * Maps intensity to motif complexity for Latin / Bossa.
 * 0: Pure Bossa Nova, 1: Mid-intensity Latin, 2: Samba, 3: Partido Alto
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.6, 0.7),
    {
        picks: [[0.3, 0], [0.6, 1], [0.85, 2], 3],
    },
]);

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

    const {
        step,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isPulseStart,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isAOfBeat,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- Lay-back: Bossa is relaxed ---
    instTimeOffset += 0.005 + intensity * 0.005;

    // --- 1. KICK PATTERNS (Surdo Feel) ---
    if (context.inst.name === 'Kick') {
        shouldPlay = false;
        // Foundation: 1 and 3 in 4/4 (Surdo heart), generalizing to non-backbeat pulses
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
            const accent = !isDownbeat ? 1.15 : 1.0;
            velocity = scaleVelocity(1.1 * accent, intensity, 0.1);
            if (!isDownbeat) {
                instTimeOffset += 0.005;
            }
        }

        // Samba variation: Add 16th note pushes
        if (activeMotif >= 2 && !shouldPlay) {
            if (isAOfBeat && !isBackbeat) {
                if (roll(0.6, intensity)) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.7, intensity, 0.1);
                }
            }
        }
    }
    // --- 2. CLAVE (Sidestick) ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        soundName = 'Sidestick';

        // 2-Bar Clave Logic
        const barIndex = Math.floor(step / context.stepsPerBar);
        const isBar1 = barIndex % 2 === 0;
        const stepInBar = step % context.stepsPerBar;

        if (activeMotif === 0 || activeMotif === 1) {
            // Authentic 3-2 Son Clave (Cuban origin, foundational for bossa sidestick)
            // 3-side (bar 1): beat 1, "& of 2", beat 4 → 16th steps 0, 6, 12
            // 2-side (bar 2): beat 2, beat 3        → 16th steps 4, 8
            if (isBar1) {
                if (stepInBar === 0 || stepInBar === 6 || stepInBar === 12) {
                    shouldPlay = true;
                }
            } else {
                if (stepInBar === 4 || stepInBar === 8) {
                    shouldPlay = true;
                }
            }

            // High-complexity embellishments: occasional offbeat ghost between clave hits
            if (!shouldPlay && drumComplexity > 0.7 && intensity > 0.6) {
                if (isOffbeat && roll(0.3)) {
                    shouldPlay = true;
                    velocity = 0.5;
                }
            }
        } else if (activeMotif === 2) {
            // Samba (Busy cross-stick)
            if (isBeatStart || isOffbeat) {
                if (roll(0.7, intensity)) {
                    shouldPlay = true;
                }
            }
        } else {
            // Partido Alto
            if (isBar1) {
                if ((isOffbeat && !isBackbeat) || (isPulseStart && isBackbeat)) {
                    shouldPlay = true;
                }
            } else {
                if ((isPulseStart && !isBackbeat) || (isOffbeat && isBackbeat)) {
                    shouldPlay = true;
                }
            }
        }

        if (isTurnaround && intensity > 0.8) {
            if (isPulseStart && isBackbeat) {
                shouldPlay = true;
                velocity = 1.1;
                soundName = 'Snare';
            }
        }

        if (shouldPlay && soundName === 'Sidestick') {
            velocity = scaleVelocity(0.9, intensity, 0.1) + (Math.random() - 0.5) * 0.1;
        }
    }
    // --- 3. HI-HAT (Steady 8ths) ---
    else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.8 : 0.6;
        }
    }
    // --- 4. PERCUSSION (Ganza/Shaker) ---
    else if (context.inst.name === 'Shaker' || context.inst.name === 'Perc') {
        shouldPlay = true;
        if (isBeatStart) {
            velocity = scaleVelocity(0.95, intensity, 0.1);
        } else if (isOffbeat) {
            velocity = scaleVelocity(0.75, intensity, 0.1);
        } else {
            velocity = scaleVelocity(0.45, intensity, 0.1);
        }

        if (context.inst.name === 'Perc') {
            shouldPlay = activeMotif >= 2 && roll(0.4, intensity);
            soundName = 'AgogoHigh';
        }
    }

    if (shouldPlay && context.inst.name === 'Snare' && intensity < 0.4) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
