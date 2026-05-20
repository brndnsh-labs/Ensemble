import {
    applyStandardBase,
    binaryTier,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    INTENSITY_BANDS,
    makeMotifSelector,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05, // Rock solid precision
    blockAdjacentSnare: false,
    backbeatCrack: true,
    // why: S8(b) — Metal already splashes China on downbeats at high intensity
    // (see the Crash branch ~line 171); the post-turnaround section-boundary
    // accent + soloist crash-catch should match that voice rather than dropping
    // to a plain Crash. Shred inherits this via `...Metal.config`.
    accentCymbal: 'China' as 'Crash' | 'China',
};

/**
 * Metal Motifs:
 * 0: Standard Heavy, 1: Driving 8th Kick, 2: The Gallop, 3: Double Kick 16ths, 4: Blast Beat
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.65, 0.6),
    {
        maxIntensity: INTENSITY_BANDS.HIGH,
        picks: [[0.3, 1], [0.7, 2], 3],
    },
    {
        picks: [[0.25, 2], [0.6, 3], 4],
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
        loopStep,
        isTurnaround,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity, isEighthNote, halfBarStep } =
        base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. KICK DRUM (The Engine) ---
    if (context.inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // Standard Heavy
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            }
            if (isOffbeat && beatIndex === 2) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Driving 8ths
            if (isEighthNote) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // The Gallop (16-16-8)
            if (isBeatStart || isOffbeat || isAOfBeat) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // Double Kick 16ths — continuous 16ths under the cymbal pulse.
            shouldPlay = true;
        } else if (activeMotif === 4) {
            // why: blast-beat ALTERNATION (drums.md P1 #6) — kick fires only on offbeat
            // eighths (steps 2,6,10,14) so it interlocks with snare on the downbeat eighths.
            // Real blast beats (extreme-metal kick-on-offbeat style) are kick-snare ALTERNATION
            // at 8th-note rate, producing the genre-defining buzz; co-articulating both on
            // every eighth collapses the rhythm into unison thuds.
            if (isOffbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = isDownbeat ? 1.3 : isBeatStart ? 1.15 : 0.95;
            // Humanize continuous runs
            if (!isBeatStart) {
                instTimeOffset += (Math.random() - 0.5) * 0.003;
            }
        }
    }
    // --- 2. SNARE (The Anchor) ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        soundName = 'Snare';

        if (activeMotif === 4 && intensity > 0.85) {
            // why: blast-beat ALTERNATION (drums.md P1 #6) — snare fires only on downbeat
            // eighths (steps 0,4,8,12), answering the kick's offbeat-eighth alternation.
            // Snare-on-downbeat + kick-on-offbeat at 8th-note rate is the canonical blast
            // (extreme-metal blast style) — the alternation IS the buzz, not co-articulation.
            if (isBeatStart) {
                shouldPlay = true;
            }
        } else {
            // Standard Backbeat
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        // Fill Logic
        if (isTurnaround && loopStep >= halfBarStep) {
            if (isEighthNote || isEOfBeat || isAOfBeat) {
                if (roll(0.7, intensity)) {
                    shouldPlay = true;
                    velocity = 1.15;
                }
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.1);
            if (intensity < 0.4) {
                soundName = 'Sidestick';
            }
        }
    }
    // --- 3. CYMBALS / HATS ---
    else if (
        context.inst.name === 'HiHat' ||
        context.inst.name === 'Open' ||
        context.inst.name === 'Crash'
    ) {
        shouldPlay = false;

        if (isEighthNote) {
            shouldPlay = true;
            // Use China/Open sounds at high intensity
            if (intensity > 0.75) {
                soundName = sectionSeed > 0.5 ? 'Ride' : 'Open';
                velocity = 1.15;
            } else {
                soundName = intensity > 0.5 ? 'Open' : 'HiHat';
                velocity = 1.0;
            }
        }

        // Section Accents
        // why: scope the China splash to the Open lane only — same pattern as the
        // section-boundary Crash at groove-engine.ts:226 and crash-catch at :247.
        // Firing on HiHat + Open + Crash lanes produces three stacked drumHits per
        // downbeat that route through `groove.lastCrashGain` and choke each other
        // (audible flam + gain stutter). HiHat and Crash lanes keep the steady-state
        // eighth-pulse cymbal voicing on the downbeat.
        if (isDownbeat && intensity > 0.8 && context.inst.name === 'Open') {
            shouldPlay = true;
            soundName = 'China';
            velocity = 1.4;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
