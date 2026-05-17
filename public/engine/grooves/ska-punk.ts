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
    exemptFromPulseShaping: true,
    entropyMultiplier: 0.04, // Rock solid fast timing
};

/**
 * Maps intensity to motif complexity for Ska-Punk.
 * 0: Classic Ska, 1: Driving 2-Step, 2: Double-Time/Skate Punk, 3: D-Beat
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.6, 0.6),
    {
        picks: [[0.2, 0], [0.5, 1], [0.8, 2], 3],
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
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isAOfBeat,
        isEOfBeat,
        beatIndex,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. ENERGETIC PUSH (Micro-timing) ---
    // Rushing the beat drives the Ska-Punk energy.
    instTimeOffset -= 0.006 + intensity * 0.008;

    // --- 2. HI-HAT / OPEN DYNAMICS ---
    if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        const isOpenLane = context.inst.name === 'Open';
        shouldPlay = false;

        if (isOffbeat) {
            if (!isOpenLane) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = scaleVelocity(1.3, intensity, 0.1);
            } else if (intensity > 0.78 && activeMotif >= 1) {
                const accentChance = beatIndex === 3 ? 0.35 : 0.18;
                if (roll(accentChance)) {
                    shouldPlay = true;
                    soundName = 'Open';
                    velocity = scaleVelocity(1.1, intensity, 0.08);
                }
            }
        } else if (!isOpenLane && isBeatStart && (activeMotif >= 1 || intensity > 0.6)) {
            // Keep the eighth notes moving for punk motifs with closed hats.
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = scaleVelocity(0.8, intensity, 0.1);
        }

        // D-beat open hat on "and of 4": the breath accent that completes the gallop phrase.
        // why: real D-beat (Discharge / crust-punk) consistently accents the "&4" position
        // with an open hat — it functions as a phrase exhale matching the doubled kick on
        // beats 1+&1 and 3+&3.
        if (isOpenLane && activeMotif === 3 && isOffbeat && beatIndex === 3) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = scaleVelocity(1.0, intensity, 0.1);
        }

        // Crash on the One for section energy
        // why: route to the real Crash voice (not Open) — matches the S1 fix in groove-engine.ts
        // that points section-marker hits at the actual crash branch in synth-drums.ts.
        if (isOpenLane && isDownbeat && intensity > 0.8 && roll(0.4)) {
            shouldPlay = true;
            soundName = 'Crash';
            velocity = 1.4;
        }
    }
    // --- 3. KICK DRUM ---
    else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // Classic Ska: 1 and 3
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1 || activeMotif === 2) {
            // 2-Step & Double-Time: Every quarter note
            if (isBeatStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // D-Beat (Discharge / crust-punk): kick on 1, "and of 1", 3, "and of 3".
            // why: the defining D-beat gallop is the doubled offbeat kick (beat 1 + &1,
            // beat 3 + &3), not a syncopated pattern. This creates the driving, urgent
            // crust-punk feel. Snare locks to 2 and 4 (standard backbeat, handled in the
            // Snare section). Open hat lands on "and of 4" for a breath accent.
            if (
                isDownbeat || // beat 1
                (isOffbeat && beatIndex === 0) || // "and of 1"
                (isBeatStart && beatIndex === 2) || // beat 3
                (isOffbeat && beatIndex === 2) // "and of 3"
            ) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.15);
        }
    }
    // --- 4. SNARE POCKET ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        if (activeMotif === 2) {
            // Double Time: Snare on the offbeats!
            if (isOffbeat) {
                shouldPlay = true;
            }
        } else {
            // Standard Backbeat
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.1);
            // why: gate lowered from 0.4 → 0.3 (S8 sweep). Ska-punk is a
            // high-energy genre by definition — sidestick at moderate intensity
            // misreads as a polka, not a punk backbeat. No genre floor in the
            // map yet for ska-punk so the per-tick gate carries the load.
            soundName = intensity > 0.3 ? 'Snare' : 'Sidestick';
        }

        // Turnaround Fill
        if (isTurnaround && intensity > 0.7 && !shouldPlay) {
            if (beatIndex >= 3 && (isEOfBeat || isAOfBeat)) {
                shouldPlay = true;
                soundName = 'Snare';
                velocity = 1.1;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
