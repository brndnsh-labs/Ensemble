import {
    applyStandardBase,
    binaryTier,
    compoundHatAllowed,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    getPhraseSeed,
    makeMotifSelector,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
    backbeatCrack: true,
    exemptFromPulseShaping: true, // Trap hats need exact velocities
};

/**
 * Maps intensity to motif complexity for Hip Hop.
 * 0: Classic Boom Bap (MPC Style), 1: Trap Foundation (Consistent 16ths),
 * 2: Trap Skitter (Hi-hat rolls), 3: Modern Hybrid (Syncopated & Busy)
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.65, 0.6),
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
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        barIndex,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. KICK (808 vs Boom Bap) ---
    if (context.inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // Boom Bap: Grounded 1, optional & of 3
            if (isDownbeat) {
                shouldPlay = true;
            }
            if (isOffbeat && beatIndex === 2 && roll(0.7, intensity)) {
                shouldPlay = true;
            }
        } else {
            // Trap: Highly syncopated
            if (isDownbeat) {
                shouldPlay = true;
            } else if (isOffbeat && (beatIndex === 1 || beatIndex === 2)) {
                if (roll(0.6, intensity)) {
                    shouldPlay = true;
                }
            } else if (isAOfBeat && roll(0.4 * intensity)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.1, intensity, 0.15);
            // Kicks in Hip Hop are slightly lazy (behind)
            instTimeOffset += 0.005 + intensity * 0.005;
        }
    }
    // --- 2. SNARE / CLAP ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        // why: gate lowered from 0.4 → 0.3 (S8 sweep). Boom-bap snare at
        // default intensity should crack — the 808-snap aesthetic is sidestick
        // only at very low energy (lo-fi/chill). Matches funk/country sweep.
        // Lo-fi/chill protection comes from the macro-arc (`conductor.ts`) dragging
        // intensity below 0.3 for low-energy sections — there's no hip-hop entry in
        // `GENRE_INTENSITY_FLOORS`, so the macro-arc is free to take it down to 0.1.
        // The per-tick gate is the wrong place to express the lo-fi/chill carve-out;
        // if a future per-motif branch wants explicit Sidestick at moderate
        // intensity, add an `activeMotif === <chill>` gate above this line. (S8 2026-05-17)
        soundName = intensity < 0.3 ? 'Sidestick' : 'Snare';

        if (isBackbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(1.1, intensity, 0.1);
        }

        // Occasional ghosting / chatter for Boom Bap
        if (activeMotif === 0 && !shouldPlay && intensity > 0.6 && isOffbeat && roll(0.3)) {
            shouldPlay = true;
            soundName = 'Sidestick';
            velocity = 0.4;
        }
    }
    // --- 3. HI-HATS (The Engine) ---
    else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        const phraseSeed = getPhraseSeed(
            sectionSeed,
            barIndex,
            activeMotif === 0 ? 4 : 2,
            activeMotif,
        );
        const releaseBeat = activeMotif === 0 ? 3 : phraseSeed < 0.45 ? 2 : 3;
        const skitterBeat = phraseSeed < 0.34 ? 1 : phraseSeed < 0.67 ? 2 : 3;
        const skitterUsesA = activeMotif === 3 ? phraseSeed > 0.42 : phraseSeed > 0.58;
        const phraseLift = isOffbeat && beatIndex === (phraseSeed < 0.5 ? 1 : 3);
        const boomBapOpen =
            activeMotif === 0 && isOffbeat && beatIndex === releaseBeat && intensity > 0.72;
        const trapOpen =
            activeMotif >= 1 &&
            ((isOffbeat && beatIndex === releaseBeat && intensity > 0.68) ||
                (activeMotif >= 2 &&
                    skitterUsesA &&
                    isAOfBeat &&
                    beatIndex === 3 &&
                    intensity > 0.8));
        const skitterHit =
            activeMotif >= 2 && (skitterUsesA ? isAOfBeat : isEOfBeat) && beatIndex === skitterBeat;

        // why: drums.md P1 #8 — motif 2 is labeled "Trap Skitter (Hi-hat rolls)"
        // but the old code only added a single extra 16th via `skitterHit`. The
        // genre-defining gesture is a stutter burst that announces the beat —
        // at our 16th-note grid that's all 4 16ths of one beat fired in
        // succession with a velocity ramp + forward time-skew (the "rush" toward
        // the next downbeat). We gate it on phraseSeed > 0.7 so the burst is a
        // bar-level accent, not every-bar wallpaper. A distinct salt isolates
        // this seed from the existing skitter `phraseSeed` above so the two
        // phrase decisions don't lock-step.
        const rollPhraseSeed = getPhraseSeed(sectionSeed, barIndex, 1, 11);
        const trapRollActive = activeMotif >= 2 && rollPhraseSeed > 0.7;
        // Pick burst beat from {1, 2, 3} — avoid beat 0 so the kick on the
        // downbeat stays clean (the burst is an accent AGAINST the One, not
        // ON it). Weighted toward beat 3: a trap roll's musical job is to
        // rush INTO the next bar's downbeat, so the lead-in slot deserves
        // the largest share. Beat 2 (rushing INTO snare-on-3) is the
        // second-strongest gesture. Beat 1 (right after kick-on-1) is the
        // weakest "rush" target since the next downbeat is 3 steps away.
        const rollBeat = rollPhraseSeed < 0.8 ? 3 : rollPhraseSeed < 0.9 ? 2 : 1;
        const trapRollHere = trapRollActive && beatIndex === rollBeat;

        if (activeMotif === 0) {
            if (isBeatStart || isOffbeat) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = isBeatStart ? 0.82 : 0.62;

                if (isOffbeat) {
                    instTimeOffset += phraseLift ? 0.003 : 0.0015;
                    if (phraseLift) {
                        velocity += 0.08;
                    }
                }
            } else if (isEOfBeat && beatIndex === 1 && phraseSeed > 0.72 && intensity > 0.65) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = 0.34;
                instTimeOffset += 0.0025;
            }
        } else {
            if (isBeatStart || isOffbeat || isEOfBeat || isAOfBeat) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = isBeatStart ? 0.84 : isOffbeat ? 0.64 : 0.42;
            }

            if (phraseLift && soundName === 'HiHat') {
                velocity += 0.07;
            }

            if (skitterHit && !trapRollHere) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = activeMotif === 2 ? 0.33 : 0.37;
                instTimeOffset += skitterUsesA ? 0.0025 : -0.001;
            }

            // why: trap-roll burst — all 4 16ths of one beat with a velocity
            // ramp (0.55 → 0.6 → 0.7 → 0.85) and forward `instTimeOffset` skew
            // so the burst "rushes" toward the next downbeat. Overrides the
            // normal motif-2 skitter on this beat (handled by the `&& !trapRollHere`
            // guard above); the other 3 beats keep their normal articulation.
            // drums.md P1 #8.
            if (trapRollHere) {
                shouldPlay = true;
                soundName = 'HiHat';
                if (isBeatStart) {
                    velocity = 0.55;
                    instTimeOffset += 0.001;
                } else if (isEOfBeat) {
                    velocity = 0.6;
                    instTimeOffset += 0.0015;
                } else if (isOffbeat) {
                    velocity = 0.7;
                    instTimeOffset += 0.002;
                } else if (isAOfBeat) {
                    velocity = 0.85;
                    instTimeOffset += 0.0025;
                }
            }
        }

        // why: Open-release is suppressed on the burst beat. The trap-roll
        // gesture IS the release on this beat — a mid-burst Open hat at vel
        // 1.02 would punch through the ramp peak and turn the closed-hat
        // rush into an open splash mid-bar (a different idiom — open release,
        // not roll). Open release continues to fire normally on the 3
        // non-burst beats.
        if ((boomBapOpen || trapOpen) && !trapRollHere) {
            shouldPlay = true;
            // Epic 4 S3: boom-bap's open hat is a tight, controlled half-open —
            // the vintage "ts-tss" release. Trap's open hat stays a fuller open
            // accent. (boomBapOpen is motif 0; trapOpen is motif >= 1 — exclusive.)
            soundName = boomBapOpen ? 'HiHatHalf' : 'Open';
            velocity = activeMotif >= 2 ? 1.02 : 0.94;
            instTimeOffset += activeMotif === 0 ? 0.002 : 0.001;
        }

        if (shouldPlay) {
            velocity = scaleVelocity(velocity, intensity, soundName === 'Open' ? 0.04 : 0.03);
            const ownsArticulation =
                context.inst.name === 'Open' ? soundName === 'Open' : soundName !== 'Open';
            shouldPlay = ownsArticulation;
        }

        if (shouldPlay && !compoundHatAllowed(context, { profile: 'shimmer', soundName })) {
            shouldPlay = false;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
