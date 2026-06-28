import {
    applyStandardBase,
    binaryTier,
    compoundHatAllowed,
    compoundKickAllowed,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    makeMotifSelector,
    placementSkew,
    roll,
    rollSeed,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.04, // Rock solid timing
    blockAdjacentSnare: false,
    backbeatCrack: false,
};

/**
 * Motifs for Country:
 * 0: Traditional Two-Step, 1: Train Beat Light, 2: Full Heavy Train Beat
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.6, 0.6),
    {
        picks: [[0.3, 0], [0.8, 1], 2],
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

    if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // Train Beat snare is consistent 16ths
        // why: epic-1-compound-meter S16b — the train beat's full-16th lattice
        // (`isBeatStart || isOffbeat || isEOfBeat || isAOfBeat`) is a 4/4 honky-
        // tonk idiom. In 6/8 (stepsPerBeat=2) the predicates collapse to every
        // step → 12 snare hits/bar. There is no idiomatic 6/8 country train beat;
        // gate the train-beat motif to simple meters and fall back to motif 0
        // (standard two-step backbeat).
        if (activeMotif > 0 && !context.isCompound) {
            shouldPlay = true;

            // Add a small amount of random jitter to all snare hits to prevent "machine gun" effect
            const jitter = (placementSkew(context, 1) - 0.5) * 0.08;

            if (isBackbeat) {
                // why: gate lowered from 0.4 → 0.3 (S8 sweep). Same conductor-
                // calibration story as `funk.ts:195`: at default bandIntensity
                // the train-beat backbeat read as rim, not the country snare crack.
                soundName = intensity > 0.3 ? 'Snare' : 'Sidestick';
                velocity = scaleVelocity(0.95, intensity, 0.1) + jitter;
            } else if (isBeatStart) {
                soundName = 'Snare';
                velocity = scaleVelocity(0.35, intensity, 0.1) + jitter;
            } else if (isOffbeat) {
                soundName = 'Snare';
                velocity = scaleVelocity(0.3, intensity, 0.1) + jitter;
            } else if (isEOfBeat || isAOfBeat) {
                // The "chicka" ghosts (16ths)
                // why: a real train beat — light OR heavy — plays the full 16th lattice
                // (every "e" AND "a"). The difference between Light Train (motif 1) and
                // Heavy Train (motif 2) is velocity dynamic, not rhythmic spacing. Replaces
                // the prior `roll(0.5 + intensity * 0.5)` (rhythmic gaps → machine-gun
                // stutter) AND the brief E-only motif-1 thinning (which lost the "a" hits
                // that define the train pocket). Motif 1 = 60% of motif 2's ghost velocity.
                shouldPlay = true;
                soundName = 'Snare';
                const ghostScale = activeMotif >= 2 ? 0.15 : 0.09;
                velocity = scaleVelocity(ghostScale, intensity, 0.08) + jitter;
            }
        } else {
            // Motif 0: Standard Two-Step
            if (isBackbeat) {
                shouldPlay = true;
                // why: gate kept at 0.4 (NOT swept with the train-beat sibling above).
                // The slow honky-tonk ballad two-step (motif 0) has a strong rim-click
                // tradition at moderate intensity — the Snare crack is reserved for
                // higher-energy train beats (motifs 1-2). Lowering this gate would
                // homogenize the ballad-vs-train dynamic distinction. (S8 review 2026-05-17)
                soundName = intensity < 0.4 ? 'Sidestick' : 'Snare';
                velocity = scaleVelocity(0.9, intensity, 0.1);
            }
        }
    } else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        // Foundation: 1 and 3
        if (isDownbeat || (isBeatStart && beatIndex === 2)) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.25 : 1.1;
        }
        // why: epic-1-compound-meter S16b F1 — beat 3 (`beatIndex === 2`) does
        // not exist in 6/8's 2-beat structure, so the boom-chick foundation
        // above collapses to "downbeat only" in compound. Add an explicit
        // second-pulse emission so the boom-chick alternation reads as
        // "kick on each dotted-quarter pulse" in 6/8 (mStep {0, 6}).
        if (isCompound && isPulseStart && !shouldPlay) {
            shouldPlay = true;
            velocity = 1.1;
        }
        // Four-on-the-floor drive at high intensity
        else if (isBeatStart && intensity > 0.8 && roll(0.8, 1.0, rollSeed(context, 1))) {
            shouldPlay = true;
            velocity = scaleVelocity(0.6, intensity, 0.1); // Feathered
        }

        if (shouldPlay && !compoundKickAllowed(context)) {
            shouldPlay = false;
        }
    } else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;

        // Hats are secondary in a train beat
        if (activeMotif === 0) {
            // Simple eighths for two-step
            if (isBeatStart || isOffbeat) {
                shouldPlay = true;
                velocity = isBeatStart ? 0.8 : 0.6;
                soundName = 'HiHat';
            }
        } else {
            // Quarter note "clicks" to cut through the snare
            if (isBeatStart) {
                shouldPlay = true;
                velocity = 0.75;
                soundName = 'HiHat';

                if (intensity > 0.82 && beatIndex === 3) {
                    soundName = 'Open';
                    velocity = 0.85;
                }
            }
        }

        if (shouldPlay && !compoundHatAllowed(context, { soundName })) {
            shouldPlay = false;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
