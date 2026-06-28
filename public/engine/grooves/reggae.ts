import {
    applyStandardBase,
    binaryTier,
    compoundHatAllowed,
    compoundKickAllowed,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    makeMotifSelector,
    roll,
    rollSeed,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    // why: Reggae One Drop's identity is the beat-1 silence. The entropy phase's
    // ~4% random snare hit at intensity 0.5 lands phantom snares in exactly the
    // hole that defines the genre. Suppress entropy at/below 0.5 so quiet/mid
    // sections preserve the One Drop emptiness; strictly above 0.5
    // (Steppers/Rockers/Dub territory) the entropy sprinkle is welcome as
    // expressive chatter.
    // (drums.md P0 #2)
    suppressEntropyBelow: 0.5,
};

/**
 * Maps intensity to motif complexity for Reggae.
 * 0: True One Drop, 1: Steppers, 2: Rockers, 3: Dub/Rub-a-Dub
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.7, 0.6),
    {
        picks: [[0.1, 0], [0.6, 1], [0.85, 2], 3],
    },
]);

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

    const {
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isPulseStart,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        motifCeiling,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = Math.min(
        getMotif(sectionSeed, drumComplexity, context.motifIntensity ?? intensity),
        motifCeiling ?? Number.POSITIVE_INFINITY,
    );

    // --- Lay-back: Reggae is consistently behind the beat ---
    // why: scope lay-back to Kick + Snare only. The One Drop feel depends on the
    // HiHat/Open lane staying locked to the grid while the kick/snare hit drags
    // behind it — applying the offset to ALL lanes (the previous behavior) drags
    // the entire kit together and erases the "drummer pushing the backbeat against
    // a metronomic hat" tension that defines the genre. (drums.md P1 #10)
    if (context.inst.name === 'Kick' || context.inst.name === 'Snare') {
        instTimeOffset += 0.008 + intensity * 0.005;
    }

    // --- 1. KICK & SNARE ---
    if (context.inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // One Drop: Kick only on the backbeat
            if (isBackbeat && isBeatStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Steppers: Kick on every beat (or pulse)
            if (isPulseStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // Rockers: Syncopated
            if (
                isPulseStart ||
                (isOffbeat && !isBackbeat && !isDownbeat) ||
                (isAOfBeat && isBackbeat)
            ) {
                shouldPlay = true;
            }
        } else {
            // Dub: Heavy syncopation
            if (isDownbeat || (isAOfBeat && !isBackbeat)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.15, intensity, 0.1);
        }

        // why: epic-1-compound-meter S16c — One Drop/Steppers/Dub already resolve to
        // pulse-aligned hits in 6/8 (all ⊆ isPulseStart), so the filter is a no-op
        // for them. Rockers (motif 2) is the only over-dense motif — it adds every
        // offbeat → 8 kicks/bar. The filter collapses Rockers to the two
        // dotted-quarter pulses {0,6}: its and-of-pulse tier (mStep {4,10}) is
        // inert here because Rockers emits only odd-step offbeats {1,3,5,7,9,11},
        // none of which is {4,10}. Net: every motif keeps One Drop's beat-1 silence
        // behavior intact while the Rockers bloat is trimmed.
        if (shouldPlay && !compoundKickAllowed(context)) {
            shouldPlay = false;
        }
    } else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // Universal Reggae Backbeat
        if (isBackbeat && isBeatStart) {
            shouldPlay = true;
            soundName = intensity > 0.7 ? 'Snare' : 'Sidestick';
            velocity = scaleVelocity(1.2, intensity, 0.1);
        }

        // Dub/Rub-a-Dub Chatter
        if (activeMotif === 3 && !shouldPlay) {
            if (isAOfBeat && roll(0.4, intensity, rollSeed(context, 1))) {
                shouldPlay = true;
                soundName = 'Sidestick';
                velocity = 0.5;
            }
        }

        // Turnaround Fills (Rimshot rolls)
        if (isTurnaround && intensity > 0.6 && !shouldPlay) {
            if (isAOfBeat && roll(0.6, 1.0, rollSeed(context, 2))) {
                shouldPlay = true;
                soundName = 'Sidestick';
                velocity = 0.85;
            }
        }
    } else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;

        // Standard 8th note hats
        if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.85 : 0.65;

            // Subtle 16th note shuffle at high intensity
            if (
                intensity > 0.75 &&
                (isAOfBeat || isEOfBeat) &&
                roll(0.3, 1.0, rollSeed(context, 3))
            ) {
                shouldPlay = true;
                velocity = 0.35;
            }
        }

        // Offbeat Open Barks
        if (isOffbeat && isBackbeat && intensity > 0.65 && roll(0.4, 1.0, rollSeed(context, 4))) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.1;
        }

        if (shouldPlay && !compoundHatAllowed(context, { soundName })) {
            shouldPlay = false;
        }
    }

    if (shouldPlay && context.inst.name === 'Snare' && intensity < 0.4) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
