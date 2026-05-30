import { scrambleHash } from '../hash-utils.js';
import {
    applyStandardBase,
    compoundHatAllowed,
    compoundKickAllowed,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    getPhraseSeed,
    INTENSITY_BANDS,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
};

/**
 * Disco motif selection — two-motif system.
 *
 * 0: Foundation — strict 4-on-the-floor + offbeat open hat + on-beat closed
 *    hat. The canonical disco skeleton with no extras.
 * 1: Busy — adds support subdivisions on the closed hat, plus either snare
 *    ghosts + syncopated hat texture OR an octave-cowbell lane on eighths
 *    (sub-flavor chosen per-bar in applyOverrides).
 *
 * why drums.md §18 — pre-collapse the engine had 4 motifs gated behind
 * `intensity > 0.7`, locking intensities 0-0.7 to motifs 0/1. The audit's
 * musical claim is that disco scales on *velocity/timbre*, not density: a
 * quiet chorus should still get cowbells (just quieter), and a loud verse
 * should be free to stay sparse. So the busy/foundation decision is now
 * seed-driven (density axis) and intensity governs velocity only via
 * scaleVelocity calls below — never gates which lane fires.
 */
export function getMotif(seed: number, complexity: number, _intensity = 1.0): number {
    // why: low-complexity sections still collapse to foundation. `complexity`
    // is the orchestration-driven drum-complexity signal (capped motif / 3, or
    // the default 0.8 when no orchestration), so a sparse orchestration entry
    // still routes through the foundation-only path.
    if (complexity < 0.3) {
        return 0;
    }
    // why: 45/55 split toward "busy" — disco's signature texture (open hat
    // shimmer + cowbells or ghost snares) is what makes it sound like disco
    // rather than generic four-on-the-floor pop. Tilting slightly busy keeps
    // the genre identifiable while still leaving foundation reachable for
    // verse/section contrast.
    return seed < 0.45 ? 0 : 1;
}

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

    const {
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        barIndex,
        isTurnaround,
        stepsPerBar,
        loopStep,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity, isEighthNote } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // why: when busy is selected, pick a per-bar sub-flavor that decides
    // whether this bar leans into syncopation (ghost snares + e-of-2 closed
    // hat) or octave cowbells. Keyed on (barIndex/2, sectionSeed) so flavor
    // stays stable for 2 bars at a time — disco grooves typically commit to a
    // texture for at least half a phrase before swapping. scrambleHash
    // (mulberry32) gives a well-distributed float; see hash-utils.ts.
    const sectionSeedInt = Math.floor(Math.max(0, Math.min(0.999, sectionSeed || 0)) * 256);
    const flavorRoll =
        activeMotif === 1 ? scrambleHash(Math.floor(barIndex / 2) * 131 + sectionSeedInt * 17) : 0;
    // why: 50/50 split between syncopation and cowbell flavors — both are
    // signature disco textures (hi-hat shimmer + ghost snares vs. cowbell
    // eighths). Neither should dominate.
    const isCowbellFlavor = activeMotif === 1 && flavorRoll >= 0.5;
    const isSyncopationFlavor = activeMotif === 1 && flavorRoll < 0.5;

    // --- 1. KICK (Strict 4-on-the-floor) ---
    // why: epic-1-compound-meter S16b — "4-on-the-floor" gating on `isBeatStart`
    // fires every step in 6/8 (stepsPerBeat=2) → 6 kicks/bar instead of disco's
    // canonical 4. The `compoundKickAllowed` filter below trims this to the
    // dotted-quarter pulses (2/bar), which is the natural 6/8 reinterpretation
    // of disco's anchored-bass-drum feel. Disco-in-6/8 is unusual; this keeps
    // the genre marker (kick on every pulse) without the over-density.
    if (context.inst.name === 'Kick') {
        shouldPlay = isBeatStart;
        if (shouldPlay) {
            velocity =
                beatIndex === 0
                    ? scaleVelocity(1.2, intensity, 0.15)
                    : scaleVelocity(1.1, intensity, 0.1);
        }

        if (shouldPlay && !compoundKickAllowed(context)) {
            shouldPlay = false;
        }
    } else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        // Standard Disco backbeat
        if (isBackbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(1.15, intensity, 0.1);
        }

        // --- Snare Ghosts ---
        // why drums.md §18 — ghost no longer gated by `intensity > 0.7`. The
        // density choice (foundation vs busy-syncopation) is now seed-driven,
        // and ghost loudness comes from scaleVelocity below. roll(0.4,
        // intensity) keeps the per-step rate proportional to intensity, so a
        // low-intensity busy section gets quieter, sparser ghosts naturally —
        // not a binary on/off cliff at 0.7.
        if (isSyncopationFlavor) {
            if (isAOfBeat && beatIndex >= 3 && roll(0.4, intensity)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.3, intensity, 0.3);
            }
        }

        if (isTurnaround && intensity > 0.65) {
            if (loopStep === stepsPerBar - 1) {
                shouldPlay = true;
                velocity = 1.3;
                soundName = 'Snare'; // Full crack
            }
        }

        if (shouldPlay && intensity < INTENSITY_BANDS.LOW) {
            soundName = 'Sidestick';
        }
    } else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        // why: support subdivisions and syncopated texture both live under the
        // "busy" motif. The phrase seed picks WHERE the support hit lands
        // (beat 2 or beat 0, e-or-a of beat) so the hat shimmer reads as a
        // shaped phrase rather than a uniform 16th roll.
        const phraseSeed = getPhraseSeed(sectionSeed, barIndex, 2, activeMotif + 5);
        const supportBeat = phraseSeed > 0.6 ? 2 : 0;
        const supportUsesA = phraseSeed > 0.52;
        const supportSubdivisionHit = supportUsesA ? isAOfBeat : isEOfBeat;
        // why: busy adds support subdivisions on both flavors (closed-hat
        // shimmer is part of disco's identity regardless of whether the bar
        // leans syncopated or cowbell-driven).
        const supportSubdivision =
            activeMotif === 1 &&
            supportSubdivisionHit &&
            (beatIndex === supportBeat || beatIndex === 3);
        // why: syncopated texture (closed hat on e-of-2) only fires on the
        // syncopation flavor — cowbell-flavor bars don't want a competing
        // closed-hat accent on the syncopated 16th.
        const syncopatedTexture = isSyncopationFlavor && isEOfBeat && beatIndex === 1;
        const phraseLift = isOffbeat && beatIndex === (phraseSeed < 0.5 ? 1 : 3);

        // Core Offbeat Open Hat (The Disco "And")
        if (isOffbeat) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = phraseLift ? 1.1 : 1.02;
            instTimeOffset -= isTurnaround && beatIndex === 3 ? 0.0025 : 0.0015;
        } else if (isBeatStart) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = beatIndex === supportBeat ? 0.76 : 0.71;
        } else if (supportSubdivision || syncopatedTexture) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = syncopatedTexture ? 0.48 : 0.42;
            instTimeOffset += supportUsesA ? 0.0005 : -0.0005;
        }

        if (isTurnaround && isOffbeat && beatIndex === 3) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.14;
            instTimeOffset -= 0.0025;
        }

        if (shouldPlay && !compoundHatAllowed(context, { profile: 'shimmer', soundName })) {
            shouldPlay = false;
        }
    } else if (context.inst.name === 'Perc' || context.inst.name.includes('Cowbell')) {
        // why drums.md §18 — cowbell no longer gated by `intensity > 0.7 &&
        // seed >= 0.8`. Fires whenever the bar is on the cowbell-flavor sub-roll, at
        // any intensity. Velocity scales via scaleVelocity, so a quiet
        // chorus's cowbell is audibly softer than a loud one rather than
        // disappearing entirely. The intensity > 0.9 fill roll on
        // non-eighths is preserved as a high-intensity flourish only.
        if (isCowbellFlavor) {
            if (isEighthNote) {
                shouldPlay = true;
                // why: reviewer P1 — old `scaleVelocity(0.8, intensity, 0.2)`
                // gave only ~0.16 velocity delta across the full intensity
                // range (0.83 at intensity 0.15 vs 0.99 at 0.95) — ≈1.5 dB,
                // not enough to honor drums.md §18's "loudness, not density"
                // claim. Wider range (0.62 at 0.15 vs 0.98 at 0.95, ≈4 dB)
                // lets a quiet verse's cowbell sit notably under a loud
                // chorus's, which is the audible arc the audit asked for.
                velocity = scaleVelocity(0.55, intensity, 0.45);
                // why: H/L alternation — High on beats 1 & 3, Low on the "&"
                // (offbeats). Mirrors classic disco percussion arrangements
                // where the cowbell carries an octave shape across the bar.
                soundName =
                    isBeatStart && (beatIndex === 0 || beatIndex === 2)
                        ? 'CowbellHigh'
                        : 'CowbellLow';
            }
            if (intensity > 0.9 && !isEighthNote && roll(0.3)) {
                shouldPlay = true;
                velocity = 0.6;
                soundName = 'CowbellHigh';
            }
        }
    }

    // --- FINAL POLISH ---
    if (shouldPlay) {
        if (context.inst.name === 'Snare' && intensity < 0.35) {
            soundName = 'Sidestick';
        }
        if (context.inst.name === 'Open') {
            velocity *= 1.15;
        }
        if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
            velocity = scaleVelocity(velocity, intensity, soundName === 'Open' ? 0.05 : 0.04);
            const ownsArticulation =
                context.inst.name === 'Open' ? soundName === 'Open' : soundName !== 'Open';
            shouldPlay = ownsArticulation;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
