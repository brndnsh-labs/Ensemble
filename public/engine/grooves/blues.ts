import {
    applyStandardBase,
    binaryTier,
    compoundHatAllowed,
    compoundKickAllowed,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    INTENSITY_BANDS,
    isBackbeatAdjacentStep,
    makeMotifSelector,
    roll,
    rollSeed,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.04, // Even tighter for a rock-solid shuffle pocket
    blockAdjacentSnare: true,
};

/**
 * Motifs represent different "feels" within the Blues Shuffle universe.
 * 0: Standard tight shuffle, 1: Driving shuffle, 2: Heavy shuffle, 3: Texas Double Shuffle
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.6, 0.75),
    {
        maxIntensity: INTENSITY_BANDS.HIGH,
        picks: [[0.5, 0], [0.8, 1], 2],
    },
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
        isCompound,
        isPulseStart,
        beatIndex,
        drumComplexity,
        sectionSeed,
        motifCeiling,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = Math.min(
        getMotif(sectionSeed, drumComplexity, context.motifIntensity ?? intensity),
        motifCeiling ?? Number.POSITIVE_INFINITY,
    );
    const beatsPerMeasure = context.stepsPerBar / 4;
    const lastBeatIndex = beatsPerMeasure - 1;

    // --- Crashes ---
    if (
        context.inst.name === 'Open' &&
        isDownbeat &&
        intensity > 0.75 &&
        roll(0.25, 1.0, rollSeed(context, 1))
    ) {
        shouldPlay = true;
        velocity = 1.25;
        soundName = 'Crash';
        return { shouldPlay, velocity, soundName, instTimeOffset };
    }

    // --- HiHat / Ride (The Shuffle Engine) ---
    if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;

        // The core shuffle pattern: downbeats and the swung offbeat
        if (isBeatStart || isOffbeat) {
            // Spang-a-lang: Occasionally omit the offbeat on beats 1 and 3 at lower complexity
            if (
                isOffbeat &&
                !isBackbeat &&
                drumComplexity < 0.5 &&
                roll(0.4, 1.0, rollSeed(context, 2))
            ) {
                return { shouldPlay: false, velocity, soundName, instTimeOffset };
            }

            shouldPlay = true;

            if (activeMotif >= 2 || intensity > 0.85) {
                soundName = 'Ride';
            } else {
                soundName = 'HiHat';
            }

            if (isBeatStart) {
                // Macro-dynamics: Slight accent on the backbeat ride hits (2 and 4)
                const isBackbeatBeat = beatIndex === 1 || beatIndex === 3;
                const accent = isBackbeatBeat ? 1.1 : 1.0;
                velocity = scaleVelocity(0.9 * accent, intensity, 0.15);
            } else {
                // The offbeat is lighter, and even lighter when leading into a backbeat
                // or following one to create the "circular" lope.
                const isBackbeatBeat = beatIndex === 1 || beatIndex === 3;
                const lopeWeight = isBackbeatBeat ? 0.8 : 1.0;
                velocity = scaleVelocity(0.5 * lopeWeight, intensity, 0.1);
            }

            // Turnaround Open Hat on the offbeat of 4
            if (
                isOffbeat &&
                beatIndex === lastBeatIndex &&
                activeMotif >= 1 &&
                roll(0.4, 1.0, rollSeed(context, 3))
            ) {
                soundName = 'Open';
                velocity = scaleVelocity(0.7, intensity, 0.1);
            }
        }

        if (shouldPlay && !compoundHatAllowed(context, { soundName })) {
            shouldPlay = false;
        }
    }
    // --- Kick Drum (Simplified Anchor) ---
    else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        // Foundation Beats (1 and 3)
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.3 : 1.15;
        }
        // why: epic-1-compound-meter S16b F1 — the `!isBackbeat` guard above
        // excludes mStep 6 in default 6/8 (backbeat overlaps with second
        // pulse), leaving only mStep 0 as foundation. Compound blues shuffle
        // needs both pulses to anchor the dotted-quarter feel.
        if (isCompound && isPulseStart && !shouldPlay) {
            shouldPlay = true;
            velocity = 1.15;
        }

        // The Shuffle Push (ONLY on the offbeat of 4)
        if (isOffbeat && beatIndex === lastBeatIndex && activeMotif >= 1) {
            shouldPlay = true;
            velocity = scaleVelocity(0.65, intensity, 0.1);
        }

        // "Four-on-the-Floor" Drive (High intensity only)
        if (
            isBeatStart &&
            isBackbeat &&
            intensity > 0.8 &&
            roll(0.7, intensity, rollSeed(context, 4))
        ) {
            shouldPlay = true;
            velocity = scaleVelocity(0.55, intensity, 0.1); // Significantly quieter than primary hits
        }

        if (shouldPlay && !compoundKickAllowed(context)) {
            shouldPlay = false;
        }
    }
    // --- Snare (The Pocket) ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // Solid backbeat on 2 and 4
        if (isBackbeat) {
            shouldPlay = true;
            velocity = 1.2;
        }

        // why (#973): motif 3 is Texas Double Shuffle, so at
        // sufficient complexity it gets 0.7 non-backbeat shuffle-grid ghost
        // participation. Other Blues Shuffle motifs borrow the gesture only at
        // intensity >0.7, and then at 0.3, keeping ordinary shuffles, backbeats,
        // and low-complexity playing clear. These magnitudes are by-ear balance,
        // not a stronger taste oracle.
        const texasProb = activeMotif === 3 ? 0.7 : intensity > 0.7 ? 0.3 : 0;
        if (isOffbeat && !isBackbeat && drumComplexity > 0.6) {
            if (roll(texasProb, 1.0, rollSeed(context, 5))) {
                shouldPlay = true;
                velocity = scaleVelocity(0.35, intensity, 0.1);
                instTimeOffset += 0.008; // Lay it back for the 'shuffle' feel
            }
        } else if (activeMotif >= 2 && !isOffbeat && !isBeatStart) {
            // Very occasional 16th ghost notes at high intensity.
            const stepInMeasure = context.mStep;
            // Skip the "e" of beats 1 & 3 (steps 1, 9) — those flam against the
            // kick — AND any 16th flanking a backbeat (3, 5, 11, 13), which would
            // crowd the beat-2/4 snare and read as "two snares in a row". That
            // leaves the "a" of beats 2 & 4 (steps 7, 15) as the open ghost slots
            // — 15 is a natural pickup into the next downbeat. The Texas-shuffle
            // offbeats (2/6/10/14) above are an 8th away and stay untouched.
            const isEOfBeat1Or3 = stepInMeasure === 1 || stepInMeasure === 9;
            const crowdsBackbeat = isBackbeatAdjacentStep(stepInMeasure, context.stepsPerBar);
            if (!isEOfBeat1Or3 && !crowdsBackbeat) {
                if (roll(0.2, intensity, rollSeed(context, 6))) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.25, intensity, 0.1);
                }
            }
        }
    }

    // Use Sidestick for low intensity backbeats
    if (shouldPlay && context.inst.name === 'Snare' && isBackbeat && intensity < 0.3) {
        soundName = 'Sidestick';
        velocity = scaleVelocity(0.95, intensity, 0.05);
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
