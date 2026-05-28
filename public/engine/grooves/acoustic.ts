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
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.06, // Tighter for acoustic precision
    blockAdjacentSnare: true,
    // why: acoustic ballad quiet sections (intro, breakdown) should have a
    // sparse cajon/shaker pulse without random snare/hat sprinkles. Entropy
    // sprinkle at or below 0.5 reads as a drummer who "can't sit still" — the
    // opposite of the genre's tasteful restraint. Strictly above 0.5 (the
    // half-time Folk/Soft-Rock territory) entropy resumes for natural feel.
    // (drums.md P0 #2)
    suppressEntropyBelow: 0.5,
};

/**
 * Maps intensity to motif complexity for Acoustic.
 * 0: Half-time (kick on 1, snare on 3), 1: Driving Folk, 2: Soft Rock/Shaker-driven, 3: Dynamic Build
 * why: motif 0 produces kick-1 / snare-3 — the Americana half-time backbeat, not "Minimal Folk/Cajon".
 * Renamed to "Half-time" to match the actual output (audit finding drums.md P1 #12).
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.65, 0.6),
    {
        picks: [[0.2, 0], [0.45, 1], [0.8, 2], 3],
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
        isDownbeat,
        isBeatStart,
        isOffbeat,
        beatIndex,
        isPulseStart,
        isCompound,
        groupIndex,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // why: epic-2 S8 — "beat 3 presence" is the bar's single secondary strong beat.
    // In 4/4 that's beat 3 (beatIndex 2). In compound (6/8/12/8, stepsPerBeat=2)
    // beatIndex 2 is mStep 4 — a mid-group weak position, NOT a dotted-quarter pulse.
    // Read it meter-relative as the middle group's pulse so the kick anchors the felt
    // secondary pulse: 6/8 [3,3] → group 1 (mStep 6); 12/8 [3,3,3,3] → group 2 (mStep 12).
    const midGroup = Math.floor((context.tsConfig?.grouping?.length ?? 2) / 2);
    const isSecondStrongBeat = isCompound
        ? isPulseStart && groupIndex === midGroup
        : isBeatStart && beatIndex === 2;

    // --- Lay-back: Acoustic is relaxed ---
    instTimeOffset += 0.004 + intensity * 0.004;

    // --- 1. SNARE / SIDESTICK (Cajon Feel) ---
    if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // Transition from Sidestick to full Snare as intensity rises
        soundName = intensity >= 0.75 ? 'Snare' : 'Sidestick';

        if (activeMotif === 0) {
            // Half-time: Snare on beat 3 only (beatIndex 2).
            // why: kick-1 + snare-3 is the textbook Americana half-time pattern; keeping snare
            // off beats 2 and 4 maintains the "space" that defines the half-time groove feel.
            if (isBeatStart && beatIndex === 2) {
                shouldPlay = true;
            }
        } else {
            // Standard backbeat on 2 and 4
            if (isBeatStart && (beatIndex === 1 || beatIndex === 3)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(0.9, intensity, 0.15);
        }

        // Occasional light ghost chatter at high intensity
        if (intensity > 0.7 && !shouldPlay && isOffbeat && roll(0.3)) {
            shouldPlay = true;
            soundName = 'Sidestick';
            velocity = 0.4;
        }
    }
    // --- 2. KICK (Deep & Grounded) ---
    else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        // Foundation: Beat 1
        if (isDownbeat) {
            shouldPlay = true;
            velocity = 1.2;
        }

        // Motif 1 & 2: Beat 3 presence (meter-relative secondary strong beat)
        if (activeMotif >= 1 && isSecondStrongBeat) {
            shouldPlay = true;
            velocity = 1.05;
        }

        // Syncopation: "& of 2" or "& of 4"
        if (intensity > 0.5 && !shouldPlay && isOffbeat && (beatIndex === 1 || beatIndex === 3)) {
            if (roll(0.4, intensity)) {
                shouldPlay = true;
                velocity = 0.85;
            }
        }

        // why: epic-2 S8 — post-hoc density safety-net for compound meters. The motif
        // predicates above fire the syncopation roll on mid-group weak steps in 6/8
        // (stepsPerBeat=2); compoundKickAllowed trims those, leaving the foundation
        // (mStep 0) + the isSecondStrongBeat pulse (mStep 6 / 12), which survive via the
        // isPulseStart passthrough. (The helper's >0.7 and-of-pulse tier is a no-op here:
        // no acoustic kick predicate targets the and-of-pulse — it exists for genres that
        // do.) Motif 0 (half-time, kick on beat 1 only) is faithful in compound — a single
        // downbeat kick in 6/8 is intentional, not a collapse. Simple meters pass through
        // unconditionally — no if(isCompound) wrapper needed.
        if (shouldPlay && !compoundKickAllowed(context)) {
            shouldPlay = false;
        }
    }
    // --- 3. HI-HAT (Pulse Shaker) ---
    else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        // Acoustic HiHats often act as a constant shaker-like pulse
        shouldPlay = true;

        if (isBeatStart) {
            velocity = scaleVelocity(0.7, intensity, 0.15);
            soundName = 'HiHat';
        } else if (isOffbeat) {
            velocity = scaleVelocity(0.6, intensity, 0.1);
            soundName = 'HiHat';
        } else {
            // 16th note "ghost" pulse
            velocity = scaleVelocity(0.3, intensity, 0.1);
            soundName = 'HiHat';
            if (intensity < 0.5 && roll(0.4)) {
                shouldPlay = false; // lower density at low intensity
            }
        }

        // Open Hat "Breath"
        if (isOffbeat && beatIndex === 3 && intensity > 0.6 && roll(0.3)) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 0.95;
        }

        if (shouldPlay && !compoundHatAllowed(context, { soundName })) {
            shouldPlay = false;
        }
    }
    // --- 4. PERCUSSION (Tambourine/Shaker) ---
    else if (context.inst.name === 'Shaker' || context.inst.name === 'Tambourine') {
        // High intensity shimmers
        shouldPlay = intensity > 0.6;
        if (shouldPlay) {
            velocity = isBeatStart ? 0.8 : 0.5;
            velocity *= scaleVelocity(0.7, intensity, 0.3);
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
