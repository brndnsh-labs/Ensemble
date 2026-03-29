import {
    applyStandardBase,
    DEFAULT_CONFIG,
    getPhraseSeed,
    INTENSITY_BANDS,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    dillaFeel: true,
};

/**
 * Maps intensity to motif complexity for Neo-Soul / Hip Hop.
 * 0: Classic Boom Bap (Solid & Grounded)
 * 1: Ghost Note Heavy (Busy ghosting)
 * 2: Dilla Skips (Heavy syncopation / drunken swing)
 * 3: Modern Hybrid (Percussive & Expressive)
 * @param {number} seed
 * @param {number} complexity
 * @param {number} [intensity=1.0]
 * @returns {number}
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Solid Boom Bap at low intensity
    }

    // Stable seed ranges for core motifs
    if (seed < 0.3) {
        return 0;
    }
    if (seed < 0.6) {
        return 1;
    }

    // For seeds > 0.6, we only allow complex motifs at high intensity
    if (intensity < 0.7) {
        // Fallback to core motifs
        return seed < 0.8 ? 0 : 1;
    }

    if (seed < 0.8) {
        return 2;
    }
    return 3;
}

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
        isTurnaround,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const phraseSeed = getPhraseSeed(sectionSeed, barIndex, 2, activeMotif + 9);
    const phraseLiftBeat = phraseSeed < 0.5 ? 0 : 2;
    const releaseBeat = phraseSeed > 0.62 ? 3 : 1;
    const releaseUsesA = activeMotif >= 2 ? phraseSeed > 0.42 : phraseSeed > 0.8;
    const breathHit =
        (isAOfBeat && beatIndex === 1 && phraseSeed > 0.72) ||
        (isEOfBeat && beatIndex === 3 && phraseSeed < 0.18);

    // --- 1. THE EXPRESSIVE DRAG (Dilla Micro-timing) ---
    // At high intensity, we push/pull the boundaries further for that "leaning" feel.
    const snareDrag = 0.006 + intensity * 0.012; // Up to +0.018s delay
    const hiHatPush = -0.008 - intensity * 0.012; // Up to -0.020s rush

    if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        instTimeOffset += hiHatPush;
    } else if (context.inst.name === 'Snare') {
        instTimeOffset += snareDrag;
    } else if (context.inst.name === 'Kick') {
        instTimeOffset += 0.008; // Heavy kick weight
    }

    // --- 2. DRUNKEN JITTER ---
    // Non-backbeat steps drift noticeably as intensity rises.
    const drunkenFactor = 0.005 + intensity * 0.02;

    if (!isBackbeat) {
        // Even beats drift too, but less than subdivisions
        const multiplier = isBeatStart ? 0.3 : 1.0;
        instTimeOffset += (Math.random() - 0.5) * drunkenFactor * multiplier;
    }

    // --- 3. HI-HAT DYNAMICS ---
    if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        const denseSixteenths = intensity > 0.58 || activeMotif >= 1;
        const releaseAccent =
            (isOffbeat && beatIndex === releaseBeat && intensity > 0.72) ||
            (releaseUsesA && isAOfBeat && beatIndex === 2 && intensity > 0.82);

        if (
            (denseSixteenths && (isBeatStart || isOffbeat || isEOfBeat || isAOfBeat)) ||
            (!denseSixteenths && (isBeatStart || isOffbeat))
        ) {
            shouldPlay = true;
            soundName = 'HiHat';
            if (isBeatStart) {
                velocity = 0.83;
            } else if (isOffbeat) {
                velocity = 0.67;
            } else {
                velocity = 0.4;
                instTimeOffset += phraseSeed > 0.55 ? 0.0035 : 0.005;
            }
        }

        if (shouldPlay && soundName === 'HiHat') {
            if (isOffbeat && beatIndex === phraseLiftBeat) {
                velocity += 0.08;
                instTimeOffset -= 0.0015;
            } else if (isAOfBeat) {
                velocity += phraseSeed < 0.35 ? 0.03 : 0.01;
                instTimeOffset += 0.002;
            }
        }

        if (breathHit && soundName === 'HiHat' && !releaseAccent) {
            shouldPlay = false;
        }

        if (releaseAccent) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = isOffbeat ? 0.96 : 0.9;
            instTimeOffset += 0.004;
        }

        if (shouldPlay) {
            velocity = scaleVelocity(velocity, intensity, soundName === 'Open' ? 0.04 : 0.05);
            const ownsArticulation =
                context.inst.name === 'Open' ? soundName === 'Open' : soundName !== 'Open';
            shouldPlay = ownsArticulation;
        }
    } else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // --- Snare Motif Logic ---
        if (activeMotif === 1 || activeMotif === 3) {
            // Motif 1 & 3: Ghost Note Heavy / Percussive
            if (isBackbeat) {
                shouldPlay = true;
                velocity = scaleVelocity(1.05, intensity, 0.1);
            } else if (isAOfBeat) {
                // Ghost note placements - keep deterministic for "structured" feel
                shouldPlay = true;
                velocity = scaleVelocity(0.15, intensity, 0.15) + Math.random() * 0.1;
            }
        } else {
            // Motif 0 & 2: Solid backbeat
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        // --- Snare Turnarounds ---
        if (isTurnaround && intensity > 0.6) {
            if (beatIndex >= 3 && !isBeatStart && roll(0.6)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.3, intensity, 0.3);
                instTimeOffset += 0.01; // Extra drag on turnaround ghosts
            }
        }

        if (shouldPlay && intensity < 0.35) {
            soundName = 'Sidestick';
        }
    } else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        // --- Kick Motif Logic ---
        if (activeMotif === 0) {
            // Boom Bap: 1, & of 3
            if (isDownbeat || (isOffbeat && beatIndex === 2)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // Dilla Skips: 1, pickup to 3, pickup to 1, "a" of 4
            if (
                isDownbeat ||
                (isAOfBeat && beatIndex === 1) ||
                (isOffbeat && beatIndex === 2) ||
                (isAOfBeat && beatIndex === 3)
            ) {
                shouldPlay = true;
            }
        } else {
            // Standard foundation
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.1, intensity, 0.1);
        }
    }

    // --- 4. GLOBAL MULTIPLIER & POLISH ---
    if (shouldPlay) {
        // Neo-Soul is generally dampened but scales up slightly with intensity
        const dampening = 0.65 + intensity * 0.15;
        velocity *= dampening;

        if (context.inst.name === 'Snare' && intensity < INTENSITY_BANDS.LOW) {
            soundName = 'Sidestick';
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
