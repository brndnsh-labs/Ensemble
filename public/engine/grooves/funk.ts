import {
    applyStandardBase,
    binaryTier,
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
    backbeatCrack: true,
    entropyMultiplier: 0.06, // Tight but expressive
};

/**
 * Maps intensity to motif complexity for Funk.
 * Motifs: 0=Grounded pocket, 1=Ghost heavy, 2=Displaced, 3=Linear
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.7, 0.4),
    {
        picks: [[0.2, 0], [0.5, 1], [0.75, 2], 3],
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
        isPulse,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        orchestration,
        sectionSeed,
        barIndex,
        isTurnaround,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- "The One" Absolute Reinforcement ---
    if (context.inst.name === 'Kick' && isDownbeat) {
        shouldPlay = true;
        velocity = scaleVelocity(1.35, intensity, 0.1);
    }

    // --- Hi-Hat & Open Dynamics ---
    if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;

        const useOrchestration = orchestration?.rideVoice !== undefined;
        const voice = orchestration?.rideVoice;
        const rideSection = voice === 'Ride';
        const openSection = voice === 'Open';
        const phraseSeed = getPhraseSeed(sectionSeed, barIndex, 2, activeMotif + 3);
        const accentBeat = phraseSeed < 0.5 ? 0 : 2;
        const barkBeat = activeMotif === 2 ? (phraseSeed < 0.5 ? 1 : 3) : phraseSeed < 0.66 ? 1 : 3;
        const barkUsesA = activeMotif === 3 ? phraseSeed > 0.45 : phraseSeed > 0.62;
        const barkSubdivisionHit = barkUsesA ? isAOfBeat : isEOfBeat;
        const phraseBark =
            barkSubdivisionHit &&
            beatIndex === barkBeat &&
            (openSection || activeMotif >= 2 || intensity > 0.78 || phraseSeed > 0.72);
        const phraseLift = isOffbeat && beatIndex === accentBeat;
        const phraseRelease = isOffbeat && beatIndex === 3 && intensity > 0.72;
        const dropSixteenth =
            !rideSection &&
            intensity < 0.62 &&
            phraseSeed > 0.78 &&
            ((isAOfBeat && beatIndex === 2) || (isEOfBeat && beatIndex === 3));
        const openAccent = phraseBark || (phraseRelease && (openSection || intensity > 0.78));

        // 16th note shimmer (Texture)
        if (intensity > 0.5 || (useOrchestration && voice !== 'None')) {
            shouldPlay = true;
            soundName = rideSection && (isBeatStart || isOffbeat) ? 'Ride' : 'HiHat';

            // Tiered velocity for the shimmer
            if (isBeatStart) {
                velocity = scaleVelocity(0.85, intensity, 0.15);
            } else if (isOffbeat) {
                velocity = scaleVelocity(0.7, intensity, 0.1);
            } else {
                velocity = scaleVelocity(0.45, intensity, 0.1);
            }

            if (dropSixteenth && !openAccent) {
                shouldPlay = false;
            }

            if (shouldPlay) {
                if (openAccent) {
                    // Epic 4 S3: the funk "bark" is a quick open-then-choke,
                    // not a full wash — a half-open hat the following closed
                    // 16th snaps shut. The bigger section-turnaround barks
                    // below stay full-open.
                    soundName = 'HiHatHalf';
                    velocity = openSection ? 0.96 : 1.0;
                    instTimeOffset -= barkUsesA ? 0.001 : 0.002;
                } else if (phraseLift) {
                    velocity += 0.08;
                    instTimeOffset -= 0.0015;
                } else if (isEOfBeat) {
                    velocity += phraseSeed > 0.55 ? 0.04 : 0;
                    instTimeOffset -= 0.001;
                } else if (isAOfBeat) {
                    velocity += phraseSeed < 0.35 ? 0.03 : 0;
                    instTimeOffset += 0.001;
                } else if (isOffbeat && beatIndex === 3) {
                    velocity += 0.05;
                    instTimeOffset -= 0.0015;
                }
            }
        } else if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.8 : 0.6;

            if (phraseRelease && intensity > 0.82) {
                shouldPlay = true;
                // Epic 4 S3: a controlled half-open bark (see openAccent above).
                soundName = 'HiHatHalf';
                velocity = 0.94;
                instTimeOffset -= 0.0015;
            }
        }

        // Turnaround Bark
        if (isTurnaround && isOffbeat && beatIndex === 3) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.12;
            instTimeOffset -= 0.002;
        } else if (isTurnaround && barkSubdivisionHit && beatIndex >= 2) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.0;
            instTimeOffset -= 0.0015;
        }

        if (shouldPlay) {
            velocity = scaleVelocity(
                velocity,
                intensity,
                soundName === 'Open' ? 0.05 : soundName === 'Ride' ? 0.07 : 0.05,
            );
            const ownsArticulation =
                context.inst.name === 'Open' ? soundName === 'Open' : soundName !== 'Open';
            shouldPlay = ownsArticulation;
        }
    }
    // --- Snare Pocket ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // Fundamental Backbeat
        if (activeMotif === 2) {
            // why: drums.md P1 #9 — "displaced backbeat" was 50/50 coin flips
            // per step (scatter, not displacement). Real funk displacement
            // (Stubblefield "Funky Drummer", Garibaldi pocket) commits to a
            // displacement amount for an entire phrase, then returns. Pick the
            // displacement ONCE per 2-bar phrase via phraseSeed, then fire
            // deterministically on both backbeats at the chosen offset.
            // Salt 17 is distinct from the hat-lane `phraseSeed` above
            // (salt = activeMotif + 3 = 5 for motif 2) so snare and hat
            // displacement decisions are independent.
            const snarePhraseSeed = getPhraseSeed(sectionSeed, barIndex, 2, 17);
            // Buckets: 40% normal, 35% +1 (laid-back e of backbeat),
            // 25% +2 (full offbeat shift). The "normal" bucket exists so a
            // motif-2 section still occasionally returns to the spine
            // backbeat — the displacement reads as a deliberate gesture, not
            // a permanent setting.
            const displacement = snarePhraseSeed < 0.4 ? 0 : snarePhraseSeed < 0.75 ? 1 : 2;
            // why (Epic 12 S6 B5): asymmetric phrase scope. +0 (normal) and +1
            // (laid-back e of backbeat) are canonically *sustained* groove choices
            // — a drummer who picks them commits for the phrase. +2 (full offbeat
            // shift) is canonically a 1-bar fill setup, not a sustained 2-bar
            // groove. Restrict +2 to bar 1 of the 2-bar phrase; on bar 2 it
            // collapses back to the spine backbeat so the gesture reads as a
            // setup-and-return, not a sustained displacement.
            const barInPhrase = barIndex % 2; // 0 = bar 1, 1 = bar 2 of the 2-bar phrase
            const effectiveDisplacement =
                displacement === 2 && barInPhrase === 1 ? 0 : displacement;
            const onBackbeatTuple = beatIndex === 1 || beatIndex === 3;
            const isDisplacedHit =
                onBackbeatTuple &&
                ((effectiveDisplacement === 0 && isBackbeat) ||
                    (effectiveDisplacement === 1 && isEOfBeat) ||
                    (effectiveDisplacement === 2 && isOffbeat && !isPulse));
            if (isDisplacedHit) {
                shouldPlay = true;
                // why: full-displacement (+2) hits a touch harder — that's the
                // most overt gesture and drummers play it with more commitment.
                // Uses original `displacement` (not effective) so the velocity
                // intent applies on bar 1 of a +2 phrase; bar 2 falls back to the
                // spine backbeat (effectiveDisplacement === 0) at 1.15 anyway.
                velocity = displacement === 2 ? 1.18 : 1.15;
            }
        } else {
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            if (orchestration?.snareVoice === 'Sidestick') {
                soundName = 'Sidestick';
                velocity = 0.8;
            } else if (orchestration?.snareVoice === 'None') {
                shouldPlay = false;
            } else {
                // why: gate lowered from 0.4 → 0.3 (S8). Prior 0.4 was a
                // conductor-calibration choice — at default bandIntensity (0.35)
                // the funk backbeat read as Sidestick where a real funk drummer
                // plays full Snare. Companion fixes: ramp inversion + Funk genre
                // floor 0.45 in `conductor.ts`. Bossa/jazz/acoustic gates stay
                // higher because Sidestick is genre-correct at low energy there.
                soundName = intensity > 0.3 ? 'Snare' : 'Sidestick';
                velocity = scaleVelocity(1.2, intensity, 0.1);
            }
        }

        // Motif 1: The Funky Drummer (Dense Ghosting)
        if (activeMotif === 1 && !shouldPlay) {
            // High probability for ghosting on all non-beat steps
            if (!isBeatStart && roll(0.6 + intensity * 0.3)) {
                shouldPlay = true;
                soundName = 'Sidestick';
                velocity = scaleVelocity(0.15, intensity, 0.15) + Math.random() * 0.1;
            }
        }

        // Motif 3: Linear Snare (interlocking)
        if (activeMotif === 3 && !shouldPlay) {
            if (isAOfBeat && !isBackbeat && isPulse) {
                if (roll(0.7, intensity)) {
                    shouldPlay = true;
                    soundName = 'Sidestick';
                    velocity = 0.5;
                }
            }
        }

        // General Syncopation
        if (intensity > 0.6 && !shouldPlay) {
            // General syncopation on 'a' of beats or offbeats
            if ((isAOfBeat && isBackbeat) || (isOffbeat && roll(0.2))) {
                if (roll(0.3)) {
                    shouldPlay = true;
                    soundName = intensity > 0.8 ? 'Snare' : 'Sidestick';
                    velocity = 0.7;
                }
            }
        }

        // Low intensity fallback
        if (shouldPlay && intensity < 0.35 && velocity > 0.8) {
            soundName = 'Sidestick';
        }
    }
    // --- Kick Drum ---
    else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        // Grounding
        if (isDownbeat || (isPulse && isBackbeat)) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.3 : 1.1;
        }

        // Motif 3: Linear Kick
        if (activeMotif === 3) {
            if (isEOfBeat && isBackbeat) {
                shouldPlay = true;
                velocity = 0.9;
            }
        }

        // General Syncopation
        if (intensity > 0.7 && !shouldPlay) {
            const syncProb = activeMotif === 1 ? 0.5 : 0.2;
            if (isOffbeat && roll(syncProb)) {
                shouldPlay = true;
                velocity = 0.85;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
