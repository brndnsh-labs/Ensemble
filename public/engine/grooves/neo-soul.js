import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    dillaFeel: true,
};

/**
 * Maps intensity to motif complexity for Neo-Soul / Hip Hop.
...
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

export function applyOverrides(context, state) {
    const { inst, loopStep, playback, drumComplexity, sectionSeed, isTurnaround } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. THE EXPRESSIVE DRAG (Dilla Micro-timing) ---
    // At high intensity, we push/pull the boundaries further for that "leaning" feel.
    const snareDrag = 0.004 + intensity * 0.008; // Up to +0.012s delay
    const hiHatPush = -0.006 - intensity * 0.009; // Up to -0.015s rush

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        instTimeOffset += hiHatPush;
    } else if (inst.name === 'Snare') {
        instTimeOffset += snareDrag;
    } else if (inst.name === 'Kick') {
        instTimeOffset += 0.005; // Standard kick weight
    }

    if (inst.muted) {
        return state;
    }

    // --- 2. DRUNKEN JITTER ---
    // Non-backbeat steps drift noticeably as intensity rises.
    const drunkenFactor = intensity * 0.015;
    const isBackbeat = loopStep === 4 || loopStep === 12;
    const isDownbeat = loopStep % 4 === 0;

    if (!isBackbeat && !isDownbeat) {
        instTimeOffset += (Math.random() - 0.5) * drunkenFactor;
    }

    // --- 3. HI-HAT DYNAMICS ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        if (shouldPlay) {
            // Subtle shuffle on 16ths
            if (loopStep % 2 === 1) {
                velocity *= 0.75 - intensity * 0.1; // Softer 16ths as it gets "lazier"
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        // --- Snare Motif Logic ---
        if (activeMotif === 1 || activeMotif === 3) {
            // Motif 1 & 3: Ghost Note Heavy / Percussive
            if (isBackbeat) {
                shouldPlay = true;
                velocity = scaleVelocity(1.05, intensity, 0.1);
            } else if ([3, 7, 11, 15].includes(loopStep)) {
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
            if ([14, 15].includes(loopStep) && roll(0.6)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.3, intensity, 0.3);
                instTimeOffset += 0.01; // Extra drag on turnaround ghosts
            }
        }

        if (shouldPlay && intensity < 0.35) {
            soundName = 'Sidestick';
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;

        // --- Kick Motif Logic ---
        if (activeMotif === 0) {
            // Boom Bap: 1, & of 3
            if (loopStep === 0 || loopStep === 10) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // Dilla Skips: 1, pickup to 3, pickup to 1, "a" of 4
            if ([0, 7, 10, 15].includes(loopStep)) {
                shouldPlay = true;
            }
        } else {
            // Standard foundation
            if (loopStep === 0 || loopStep === 8) {
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

        if (inst.name === 'Snare' && intensity < INTENSITY_BANDS.LOW) {
            soundName = 'Sidestick';
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
