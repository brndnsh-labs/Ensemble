/**
 * Shared utility functions for generative drum strategies.
 */
import { scrambleHash } from '../hash-utils.js';

export const INTENSITY_BANDS = {
    LOW: 0.35,
    MID: 0.65,
    HIGH: 0.85,
};

export interface GrooveContext {
    step: number;
    inst: { name: string; muted: boolean };
    stepVal: number;
    playback: {
        bandIntensity: number;
        bpm?: number;
        songMode?: boolean;
        isEndingPending?: boolean;
    };
    groove: Record<string, unknown>;
    isDownbeat: boolean;
    isBeatStart: boolean;
    isPulse: boolean;
    isPulseStart: boolean;
    isGroupStart: boolean;
    isBackbeat: boolean;
    isOffbeat: boolean;
    isEOfBeat: boolean;
    isAOfBeat: boolean;
    beatIndex: number;
    tsConfig?: { pulse?: number[]; grouping?: number[]; stepsPerBeat?: number };
    mStep: number;
    isCompound: boolean;
    stepInGroup: number;
    groupIndex: number;
    stepsPerBar: number;
    loopStep: number;
    drumComplexity: number;
    orchestration: { rideVoice?: string; snareVoice?: string } | null;
    barIndex: number;
    isFirstStepOfNewBar: boolean;
    sectionSeed: number;
    isTurnaround: boolean;
    isSoloistBusy: boolean;
    // #790: a deterministic base seed for this (barIndex, sectionId, loopStep,
    // inst.name) tick, supplied by the groove engine. Strategy `roll()` calls
    // derive a per-decision seed from it via `rollSeed(context, salt)` so
    // ghost/decoration decisions are reproducible across loops and critique
    // runs instead of re-rolling raw `Math.random` every pass. Absent only for
    // bare test contexts that call a strategy directly — those keep the legacy
    // unseeded `roll()` path.
    rollBaseSeed?: number;
}

export interface DrumStepBase {
    shouldPlay: boolean;
    velocity: number;
    soundName: string;
    instTimeOffset: number;
}

export interface DrumStepExtended extends DrumStepBase {
    intensity: number;
    isEighthNote: boolean;
    halfBarStep: number;
}

type MotifTier = { maxIntensity?: number; picks: ([number, number] | number)[] };

/**
 * Returns true if a roll is successful, scaled by intensity.
 *
 * #790: when `seed` is provided the draw is the deterministic `scrambleHash(seed)`
 * instead of `Math.random()`, so a looped/critique-replayed bar produces the same
 * ghost/decoration decisions every pass (a practice drummer that settles instead
 * of re-rolling chaos). Production call sites in the genre strategies pass
 * `rollSeed(context, salt)`; bare test contexts (no `rollBaseSeed`) get `undefined`
 * and fall back to the legacy `Math.random()` path unchanged.
 */
export function roll(probability: number, intensity = 1.0, seed?: number): boolean {
    const draw = seed === undefined ? Math.random() : scrambleHash(seed | 0);
    return draw < probability * intensity;
}

/**
 * #790: derive a per-decision deterministic seed for a `roll()` call from the
 * tick's `context.rollBaseSeed` (which folds barIndex, sectionId, loopStep and
 * inst.name) and a call-site `salt` that keeps co-located rolls independent.
 * Returns `undefined` when the context carries no base seed (bare strategy-unit
 * test contexts) so `roll()` cleanly falls back to its legacy unseeded behavior.
 *
 * Salts only need to be distinct among the roll sites reachable for the SAME
 * instrument in one tick — the base seed already folds inst.name, so different
 * lanes never collide. Assigning a unique salt per site within a strategy file
 * is the simple, collision-proof convention.
 */
export function rollSeed(context: GrooveContext, salt: number): number | undefined {
    if (context.rollBaseSeed === undefined) {
        return undefined;
    }
    // 0x85ebca6b: an odd 32-bit avalanche mixing constant — multiplying the salt
    // by it scatters adjacent salts across the seed space, well clear of the
    // entropy phase's +1/+3/+5 discriminators on the same base seed.
    return (context.rollBaseSeed ^ Math.imul(salt, 0x85ebca6b)) | 0;
}

/**
 * Scales a velocity value based on intensity.
 */
export function scaleVelocity(base: number, intensity: number, factor = 0.2): number {
    return base + intensity * factor;
}

/**
 * Derive a deterministic phrase-level seed so grooves can vary bar-to-bar without
 * falling back to unconstrained randomness. Reusing the same phrase seed across a
 * small bar span helps hats and cymbals read like a player shaping a phrase.
 */
export function getPhraseSeed(
    sectionSeed: number,
    barIndex: number,
    phraseBars = 2,
    salt = 0,
): number {
    const normalizedSeed = Math.max(0, Math.min(0.999, sectionSeed || 0));
    const phraseIndex = Math.floor(barIndex / Math.max(1, phraseBars));
    const seedInt = Math.floor(normalizedSeed * 256);
    return ((phraseIndex * 97 + seedInt * 53 + salt * 29) % 256) / 256;
}

/**
 * Default configuration for drum strategies.
 *
 * `suppressEntropyBelow`: when `playback.bandIntensity <= this value`, the
 * groove engine's entropy phase (random snare/hihat sprinkle) is skipped
 * entirely for this genre. (Strict `>` gate — the floor value itself is in
 * the suppressed range, since the audit's canonical "broken case" sits
 * exactly at the floor: Reggae One Drop at 0.5, Jazz ride at 0.45.) why: drums.md P0 #2 — Reggae One Drop holes at
 * intensity 0.5 get filled by phantom snares, and Jazz at intensity 0.3
 * gets ~4% random snare hits that contaminate intentional ride emptiness.
 * Genres that want quiet sections to actually breathe set this per-genre.
 * Default 0 = no suppression (legacy behavior — entropy always runs).
 */
export const DEFAULT_CONFIG = {
    entropyMultiplier: 0.15,
    suppressEntropyBelow: 0,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: false,
    isLatin: false,
    // why: epic-deferred-followups S8(b) — the post-turnaround section-boundary
    // splash + soloist crash-catch hard-coded `'Crash'`. On Metal at high
    // intensity the genre already splashes China on every downbeat (metal.ts
    // line ~171) but reverted to a plain Crash on the strongest accent, which
    // is the wrong cymbal for the section. Genre strategies declare the accent
    // cymbal here; groove-engine.ts reads `config.accentCymbal` for both the
    // section-boundary and crash-catch blocks. Default 'Crash' = legacy.
    accentCymbal: 'Crash' as 'Crash' | 'China',
};

/**
 * The 16th-note steps immediately flanking a backbeat (4/4: steps 3, 5, 11, 13).
 * A non-backbeat snare landing on one of these reads as a snare a 16th
 * before/after beat 2 or 4 — heard as "two snares in a row", since the backbeat
 * already owns that pocket. Shared by every embellishment layer that can add a snare
 * outside the canonical backbeat (soloist snare-stab accents in groove-engine,
 * the entropy ghost phase, and the strategy 16th-ghosts) so they all keep clear
 * of the backbeat's space and the backbeat reads clean.
 *
 * Backbeats sit on beats 2 & 4; for a 16-step (4/4) bar that's steps 4 & 12,
 * whose flanking 16ths are {3,5} and {11,13}. Non-16-step bars (compound/odd
 * meters) return false — matching the prior 4/4-only inline entropy guard.
 * Extend per-meter if a non-4/4 crowding case ever surfaces by ear.
 *
 * Invariant: 4/4 is currently the ONLY meter with 16 steps/bar in
 * TIME_SIGNATURES, so `stepsPerBar === 16` is an exact proxy for 4/4 and the
 * "beats 2 & 4 are the backbeats" assumption holds. If a non-4/4 16-step meter
 * is ever added, this must take the backbeat positions explicitly rather than
 * assume them — otherwise it would silently apply 4/4 snare discipline there.
 */
export function isBackbeatAdjacentStep(loopStep: number, stepsPerBar: number): boolean {
    if (stepsPerBar !== 16) {
        return false;
    }
    const stepsPerBeat = stepsPerBar / 4;
    const backbeat2 = stepsPerBeat; // beat 2 → step 4
    const backbeat4 = stepsPerBeat * 3; // beat 4 → step 12
    return (
        loopStep === backbeat2 - 1 ||
        loopStep === backbeat2 + 1 ||
        loopStep === backbeat4 - 1 ||
        loopStep === backbeat4 + 1
    );
}

function pickBySeed(seed: number, picks: ([number, number] | number)[]): number {
    for (let i = 0; i < picks.length - 1; i++) {
        const [threshold, motif] = picks[i] as [number, number];
        if (seed < threshold) {
            return motif;
        }
    }
    const last = picks[picks.length - 1];
    return Array.isArray(last) ? last[1] : (last as number);
}

/**
 * Convenience factory for the common "low-intensity binary tier":
 * returns motif 0 when `seed < seedThreshold`, otherwise motif 1.
 */
export function binaryTier(maxIntensity: number, seedThreshold: number): MotifTier {
    return { maxIntensity, picks: [[seedThreshold, 0], 1] };
}

/**
 * Factory that creates a deterministic motif selector from a tier configuration.
 * Each tier maps an intensity ceiling to seed-based motif indices.
 * The last tier (omit `maxIntensity`) acts as the high-intensity default.
 *
 * Picks arrays may end with a bare motif number instead of `[1.0, motif]`.
 *
 * @example
 * const getMotif = makeMotifSelector([
 *   binaryTier(0.6, 0.6),                          // seed < 0.6 → 0, else → 1
 *   { picks: [[0.3, 0], [0.7, 1], 2] },             // high-intensity tier
 * ]);
 */
export function makeMotifSelector(
    tiers: MotifTier[],
    opts: { complexityThreshold?: number; intensityFloor?: number } = {},
): (seed: number, complexity: number, intensity?: number) => number {
    const complexityThreshold = opts.complexityThreshold ?? 0.3;
    const intensityFloor = opts.intensityFloor ?? INTENSITY_BANDS.LOW;

    return function getMotif(seed: number, complexity: number, intensity = 1.0): number {
        if (complexity < complexityThreshold || intensity < intensityFloor) {
            return 0;
        }
        for (const tier of tiers) {
            if (tier.maxIntensity === undefined || intensity < tier.maxIntensity) {
                return pickBySeed(seed, tier.picks);
            }
        }
        return 0;
    };
}

/**
 * Compound-meter hat-density gate. In 6/8 / 12/8, callers that use `isBeatStart`
 * or `isOffbeat` as hat-density predicates fire on every step of the bar (12/bar
 * in 6/8) because `stepsPerBeat=2` makes each step itself an eighth note.
 *
 * Two profiles, since "the hat" plays different musical roles across genres:
 *
 *   'sparse'  — Rock / Metal / Country / Blues / Acoustic / Reggae / Latin:
 *               the hat is *secondary* to the pulse, idiomatic compound density
 *               is 2–4 hits/bar (think a 6/8 ballad ride pattern).
 *
 *     intensity ≤ 0.5    → pulses only            (2/bar in 6/8)
 *     intensity 0.5–0.75 → pulses + and-of-pulse  (4/bar in 6/8)
 *     intensity > 0.75   → pulses + offbeats      (10/bar in 6/8)
 *
 *   'shimmer' — Funk / Hip Hop / Neo-Soul / Disco: the hat IS the genre-identity
 *               time-keeper (the constant 8th-grid shimmer between pulses).
 *               Suppressing it to pulses-only at moderate intensity would invert
 *               the role — hat becomes the ornament instead of the metronome.
 *               Compound floor is *steady 8ths* (= `isBeatStart` = 6/bar in 6/8).
 *
 *     intensity ≤ 0.4    → pulses only            (2/bar in 6/8)
 *     intensity > 0.4    → all 8th-grid beats     (6/bar in 6/8)
 *
 * Intentional structural accents (`'Open'`, `'HiHatHalf'`) pass through
 * unconditionally — section-turnaround barks and phrase-end punctuation are not
 * the over-density we're suppressing.
 *
 * Used as a post-hoc filter over each genre's existing 4/4 hat predicate, so
 * velocity / voicing / motif shaping survives; only the over-density emissions
 * are dropped. Returns `true` in simple meters so callers can apply
 * unconditionally without an `if (isCompound)` wrapper.
 *
 * why: epic-1-compound-meter S16 — every genre's hat lane (excepting jazz, which
 * has its own compound branch) gates on `isEighthNote` (= `isBeatStart \|\| isOffbeat`)
 * and fires every step in 6/8. This is the dominant audible "drums feel too busy"
 * symptom the user reported during the S15 listening session. The "and-of-pulse"
 * slot at `stepInGroup === groupSteps - 2` matches the canonical compound
 * syncopation position (mStep {4, 10} in 6/8 grouping [3,3]) — same slot the jazz
 * S11 skip-beat fix uses. Two-profile split added 2026-05-27 per S16 review —
 * uniform suppression would have inverted shimmer-genre identity at moderate
 * intensity.
 */
export function compoundHatAllowed(
    context: GrooveContext,
    opts: { profile?: 'sparse' | 'shimmer'; soundName?: string } = {},
): boolean {
    if (!context.isCompound) {
        return true;
    }
    if (opts.soundName === 'Open' || opts.soundName === 'HiHatHalf') {
        return true;
    }
    if (context.isPulseStart) {
        return true;
    }
    const intensity = context.playback.bandIntensity;
    const profile = opts.profile ?? 'sparse';
    if (profile === 'shimmer') {
        if (intensity > 0.4 && context.isBeatStart) {
            return true;
        }
        return false;
    }
    if (intensity > 0.75 && context.isOffbeat) {
        return true;
    }
    if (intensity > 0.5) {
        const groupSteps =
            (context.tsConfig?.grouping?.[context.groupIndex] || 3) *
            (context.tsConfig?.stepsPerBeat || 2);
        if (context.stepInGroup === groupSteps - 2) {
            return true;
        }
    }
    return false;
}

/**
 * Compound-meter kick-density gate. Mirrors the role of `compoundHatAllowed`
 * but for the kick lane — kick is naturally a low-density voice in compound
 * meters, idiomatically anchored on the dotted-quarter pulses with sparse
 * syncopation, not the eighth grid.
 *
 *   intensity ≤ 0.7  → pulses only           (2/bar in 6/8)
 *   intensity > 0.7  → pulses + and-of-pulse (4/bar in 6/8 — adds the canonical
 *                                              compound syncopation slot at
 *                                              mStep {4, 10})
 *
 * Used as a post-hoc filter over each genre's existing 4/4 kick predicate (same
 * pattern as `compoundHatAllowed`). Genre files retain their velocity / motif /
 * ghosting logic; only the over-density emissions in compound meters are
 * dropped. Returns `true` in simple meters so callers can apply unconditionally.
 *
 * why: epic-1-compound-meter S16b — kick foundations across rock / metal /
 * funk / disco / latin / hiphop / neo-soul gate on `isBeatStart` (or
 * `isEighthNote`), firing 4–12 hits per 6/8 bar instead of the idiomatic 2.
 * Same shape as the S16 hat bug, different lane. No `shimmer` profile here —
 * kick is sparse-only across genres. Motif-level over-density (metal driving
 * 8ths, latin Samba, country train-beat) is gated separately at the motif-block
 * level with `!isCompound`, since those motifs are 4/4-idiomatic by design.
 *
 * why no separate `isBackbeat` tier: in the default 6/8 config (grouping [3,3],
 * backbeat [1]), `isBackbeat` lands at mStep 6 — exactly where `isPulseStart`
 * for group 1 fires. The two predicates overlap entirely, so a middle
 * "backbeat-only" tier would be dead code. If a future TS config wants
 * non-pulse backbeat positions, add a tier then. (Two-tier shape per S16b
 * music-theory review F2.)
 */
export function compoundKickAllowed(context: GrooveContext): boolean {
    if (!context.isCompound) {
        return true;
    }
    if (context.isPulseStart) {
        return true;
    }
    const intensity = context.playback.bandIntensity;
    if (intensity > 0.7) {
        const groupSteps =
            (context.tsConfig?.grouping?.[context.groupIndex] || 3) *
            (context.tsConfig?.stepsPerBeat || 2);
        if (context.stepInGroup === groupSteps - 2) {
            return true;
        }
    }
    return false;
}

/**
 * Standard base logic for groove overrides.
 * Extracts context and handles early returns for muted instruments.
 */
export function applyStandardBase(
    context: GrooveContext,
    state: DrumStepBase,
): { base: DrumStepExtended; muted: false } | { base: DrumStepBase; muted: true } {
    const { inst, playback, stepsPerBar } = context;

    if (inst.muted) {
        return { base: state, muted: true };
    }

    const intensity = playback.bandIntensity;
    const isEighthNote = context.isBeatStart || context.isOffbeat;
    const halfBarStep = Math.floor(stepsPerBar / 2);

    return {
        base: {
            ...state,
            intensity,
            isEighthNote,
            halfBarStep,
        },
        muted: false,
    };
}
