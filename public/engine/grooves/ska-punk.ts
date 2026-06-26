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
        isPulseStart,
        isCompound,
        motifCeiling,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = Math.min(
        getMotif(sectionSeed, drumComplexity, intensity),
        motifCeiling ?? Number.POSITIVE_INFINITY,
    );

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
                if (roll(accentChance, 1.0, rollSeed(context, 1))) {
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
        if (isOpenLane && isDownbeat && intensity > 0.8 && roll(0.4, 1.0, rollSeed(context, 2))) {
            shouldPlay = true;
            soundName = 'Crash';
            velocity = 1.4;
        }

        // why: epic-2 S7 — 'sparse' is the better of the two shared profiles for ska's
        // offbeat skank. The skank lives on offbeats (odd mSteps); 'shimmer' keeps only
        // isBeatStart (even mSteps) and would kill the skank at EVERY intensity, so it's
        // strictly worse here. 'sparse' readmits the offbeat skank at intensity >0.75
        // (where ska-punk is energetic) and trims compound over-density below that —
        // the low-intensity "Classic Ska" tier sacrifices the skank to the pulse, which
        // is an acceptable off-idiom compromise (it grooves, doesn't over-densify). The
        // shared filter has no profile that preserves an *offbeat* time-keeper across the
        // range — a utils.ts limitation, out of S7's scope. 'Open'/'Crash' structural
        // accents pass through unconditionally; pass soundName so the filter sees them.
        if (shouldPlay && !compoundHatAllowed(context, { profile: 'sparse', soundName })) {
            shouldPlay = false;
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

        // why: epic-2 S7 — anchor every felt pulse in compound meters across ALL motifs.
        // In 6/8/12/8 the 4/4 predicates above miss the second dotted-quarter pulse:
        // motif 0's `!isBackbeat` strips mStep 6 (the backbeat IS the 2nd pulse in 6/8),
        // and motif 3's `beatIndex===2` lands on mStep 4 (mid-group), never mStep 6.
        // compoundKickAllowed can DROP a hit but cannot ADD one, so the predicate itself
        // must place the pulse or the bar collapses to a single downbeat. isPulseStart
        // marks every dotted-quarter pulse (m0/m6 in 6/8; m0/m6/m12/m18 in 12/8). Gated
        // by isCompound so 4/4 is byte-identical (there isPulseStart=beat-starts, already
        // covered by the motif predicates).
        if (isCompound && isPulseStart) {
            shouldPlay = true;
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.15);
        }

        // why: epic-2 S7 — post-hoc density safety-net for compound meters. The motif
        // predicates above (isBeatStart, isOffbeat) fire on every step in 6/8
        // (stepsPerBeat=2), producing up to 12 kick hits/bar. compoundKickAllowed trims
        // to pulses only at intensity ≤0.7, adding the and-of-pulse syncopation slot at
        // intensity >0.7. The isCompound/isPulseStart anchor above guarantees both
        // pulses survive (isPulseStart → compoundKickAllowed returns true). Simple meters
        // pass through unconditionally — no if(isCompound) wrapper needed.
        if (shouldPlay && !compoundKickAllowed(context)) {
            shouldPlay = false;
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
