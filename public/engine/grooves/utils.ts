/**
 * Shared utility functions for generative drum strategies.
 */

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
 * Returns true if a random roll is successful, scaled by intensity.
 */
export function roll(probability: number, intensity = 1.0): boolean {
    return Math.random() < probability * intensity;
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
