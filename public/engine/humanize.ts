/**
 * humanize.ts — the shared, seeded humanization primitives (#1068).
 *
 * Deliberately a LEAF module: it imports nothing but `hash-utils.js`, because
 * both the main-thread synth layer (`scheduler-core.ts`, `synth-chords.ts`) and
 * the worker-side generative engines (`groove-engine.ts`, `harmonies.ts`,
 * `midi-worker-logic.ts`) consume it. These primitives used to live in
 * `synth-utils.ts`, which pulls in `sample-voice.ts` / `pack-runtime.ts` —
 * importing that from a worker-side engine would drag the whole audio-synthesis
 * tree across the thread boundary for three pure functions.
 */
import { scrambleHash, stringHash31 } from './hash-utils.js';
// --- Shared seeded humanization (#1068 re-model) ----------------------------
//
// Real players never repeat a note byte-identically: micro-timing, velocity
// and pitch all wander a little. The original (Epic 0 S6) helper drew all three
// off ONE per-(step, instrument, voice) seed, which made every property
// re-roll every bar — white noise that averages to "slightly sloppy" rather
// than a player's own placement. #1068 splits it along the same seam
// `grooves/utils.ts` already established for the drum strategies:
//
//   * PLACEMENT (`humanizePlacement`, the sibling of `placementSkew`) is keyed
//     ONLY on `(barStep, lane, voiceIndex)` — deliberately bar-INDEPENDENT, so a
//     given 16th in a given lane leans the SAME way every bar. That is what
//     makes it read as a deliberate, consistent placement behind/ahead of the
//     grid instead of per-hit noise.
//   * COLOUR (`humanizeColor`, the sibling of `humanizeDraw`) — velocity and
//     detune — stays keyed on the absolute step, because dynamics genuinely do
//     vary bar-to-bar in a way placement should not.
//
// Both are gated by `humanizeScale(groove.humanize)`, which is EXACTLY 0 at
// knob 0: at `humanize: 0` every lane is bit-for-bit grid-locked, no residual
// base offset anywhere (that is the #1068 acceptance, and the reason both
// helpers early-return rather than multiply by zero — `-0` is not `0`).

/**
 * Per-instrument humanization character. Each spread is the ± maximum at full
 * strength (the `groove.humanize` knob = 100), *before* the position weight.
 * Callers pass `humanizeScale(groove.humanize)` as the `scale` argument.
 */
export interface HumanizeProfile {
    /** ± timing deviation, in seconds. */
    readonly timeSpread: number;
    /** ± velocity deviation, as a fraction (0.08 = ±8%). */
    readonly velSpread: number;
    /** ± pitch detune, in cents. */
    readonly detuneSpread: number;
}

/** One note's humanization colour — two independent seeded draws. */
export interface HumanizedNote {
    /** Factor to multiply the note velocity by (centered on 1.0). */
    readonly velocityMult: number;
    /** Cents to add to the note's detune. */
    readonly detuneCents: number;
}

/** The knob-off result — shared so the `scale <= 0` path allocates nothing new. */
const NEUTRAL_COLOR: HumanizedNote = { velocityMult: 1, detuneCents: 0 };

/**
 * Per-instrument feel profiles. A drummer plays tighter than a soloist, so the
 * spreads widen across `drums → bass → chords → harmonies → soloist`. Drums
 * carry no detune (the kit voices have no meaningful pitch in this sense).
 *
 * why these magnitudes (#1068): the pre-remodel spreads (drums ±10 ms at knob
 * 100) put the SHIPPED DEFAULT of 20 at ~±2 ms — under the ~3 ms onset-shift
 * perceptual floor, i.e. the knob's whole useful range was inaudible and only
 * the top of the slider did anything. Widened so that at the default, after the
 * concave knob curve (≈0.38) and the offbeat position weight (1.0), the tightest
 * lane still displaces ±6.9 ms peak / ~3.4 ms mean — audibly *placed* — while
 * downbeats stay near the grid (weight 0.35 → ±2.4 ms). At the top of the slider
 * a lane is genuinely loose (soloist ±34 ms ≈ a quarter of a 16th at 120 bpm),
 * which is what a 100% "humanize" ought to mean. Ear-tunable; #1068 is Needs-ear.
 *
 * Velocity spreads sit deliberately *under* what the removed unseeded jitter did
 * (drums ±20% in `synth-drums.ts`) because the drum lane also carries the groove
 * engine's own seeded `humanizeVelocity` (±4-8%, now knob-gated) baked into the
 * note before it reaches the scheduler — the two compose.
 */
export const HUMANIZE_PROFILES: Record<string, HumanizeProfile> = {
    drums: { timeSpread: 0.018, velSpread: 0.1, detuneSpread: 0 },
    bass: { timeSpread: 0.022, velSpread: 0.12, detuneSpread: 3 },
    chords: { timeSpread: 0.026, velSpread: 0.12, detuneSpread: 4 },
    harmonies: { timeSpread: 0.028, velSpread: 0.12, detuneSpread: 5 },
    soloist: { timeSpread: 0.034, velSpread: 0.14, detuneSpread: 7 },
};

/**
 * Knob-response exponent. `humanize` is a 0-100 slider whose default is 20; a
 * linear map made the bottom four fifths of it inaudible (see the profile note
 * above). A concave curve spends the slider where players actually live —
 * 20 → 0.38, 50 → 0.66, 100 → 1.0 — so "a little human" is a real setting
 * rather than a rounding error, without changing what the extremes mean.
 */
const HUMANIZE_KNOB_CURVE = 0.6;

/**
 * Map the `groove.humanize` 0-100 knob to the `scale` every humanize site takes.
 *
 * Returns EXACTLY 0 for 0, a negative, or a malformed (non-finite) value — the
 * single chokepoint that makes "`humanize: 0` means bit-identical output" true
 * at every site instead of site-by-site discipline.
 */
export function humanizeScale(humanize: number | undefined | null): number {
    if (typeof humanize !== 'number' || !Number.isFinite(humanize) || humanize <= 0) {
        return 0;
    }
    return Math.min(1, humanize / 100) ** HUMANIZE_KNOB_CURVE;
}

/**
 * How much of a lane's placement spread applies at a given metric position.
 *
 * why (#1068): human timing is not position-blind. A player's internal clock is
 * anchored at the bar's downbeat and re-anchored at each pulse/beat; deviation
 * grows with distance from the nearest anchor. Downbeats are also where ensemble
 * lock is *heard* — smearing them reads as "the band is sloppy", while the same
 * displacement on an "e"/"a" or an offbeat reads as personal placement (the
 * push/drag that makes a part feel played). So the weights descend toward the
 * strong positions rather than being uniform.
 */
export const PLACEMENT_WEIGHTS = {
    /** Bar downbeat — the band's lock point. Tightest. */
    downbeat: 0.35,
    /** Group/pulse start (beat 3 of 4/4, the second dotted quarter of 6/8). */
    pulse: 0.5,
    /** Any other beat start. */
    beat: 0.6,
    /** Offbeats, "e"/"a" subdivisions, pickups — where placement lives. */
    offbeat: 1.0,
} as const;

/** The subset of `StepInfo` the position weighting reads. */
export interface PlacementPosition {
    readonly isMeasureStart?: boolean;
    readonly isDownbeat?: boolean;
    readonly isPulseStart?: boolean;
    readonly isGroupStart?: boolean;
    readonly isBeatStart?: boolean;
}

/** Resolve the placement weight for one step's metric position. */
export function placementWeight(pos: PlacementPosition | null | undefined): number {
    if (!pos) {
        return PLACEMENT_WEIGHTS.offbeat;
    }
    if (pos.isMeasureStart || pos.isDownbeat) {
        return PLACEMENT_WEIGHTS.downbeat;
    }
    if (pos.isPulseStart || pos.isGroupStart) {
        return PLACEMENT_WEIGHTS.pulse;
    }
    if (pos.isBeatStart) {
        return PLACEMENT_WEIGHTS.beat;
    }
    return PLACEMENT_WEIGHTS.offbeat;
}

/**
 * Compose a deterministic integer seed from a note's identity. Distinct
 * `(step, instrument, voiceIndex)` triples map to well-separated seeds, so
 * each instrument — and each voice within it — draws an independent stream.
 * `voiceIndex` is any integer discriminator (a chord-tone index, or a hashed
 * drum-piece name).
 *
 * This is the COLOUR seed: `step` is the absolute/monotonic transport step, so
 * the draw varies bar to bar. Placement uses `placementSeed` instead.
 */
export const humanizeSeed = (step: number, instrument: string, voiceIndex: number): number =>
    (Math.imul(step + 1, 0x9e3779b1) ^
        stringHash31(instrument) ^
        Math.imul(voiceIndex + 1, 0x85ebca77)) |
    0;

/**
 * The PLACEMENT seed — the direct analogue of `placementSkew` in
 * `grooves/utils.ts`. Keyed on `(barStep, lane, voiceIndex)` and nothing else,
 * so it is bar-independent by construction: pass a BAR-RELATIVE step
 * (`stepInfo.mStep`), never the monotonic transport counter, or the lean
 * re-rolls every bar and the whole point is lost.
 */
const placementSeed = (barStep: number, lane: string, voiceIndex: number): number =>
    (Math.imul(barStep + 1, 0x9e3779b1) ^
        stringHash31(lane) ^
        Math.imul(voiceIndex + 1, 0x85ebca6b)) |
    0;

/**
 * Seeded micro-timing placement, in seconds, for one lane/voice at one bar
 * position. Bar-independent (see `placementSeed`), position-weighted, and
 * exactly 0 when the knob is off.
 *
 * `spread` is the ± maximum at full knob — normally a profile's `timeSpread`,
 * but taken as a scalar so a lane with its own per-style character (harmony's
 * `timingJitter`) can pass that instead of allocating a throwaway profile.
 */
export function humanizePlacement(
    barStep: number,
    lane: string,
    voiceIndex: number,
    spread: number,
    scale: number,
    positionWeight = 1,
): number {
    if (!(scale > 0) || !(spread > 0)) {
        return 0;
    }
    const r = scrambleHash(placementSeed(barStep, lane, voiceIndex));
    return (r - 0.5) * 2 * spread * scale * positionWeight;
}

/**
 * Seeded per-note COLOUR humanization — velocity and detune, two *independent*
 * draws off `seed` (use `humanizeSeed`, i.e. keyed on the absolute step so the
 * dynamics breathe bar to bar).
 *
 * `scale` (default 1) is `humanizeScale(groove.humanize)`: at 0 the result is
 * the exact neutral `{ velocityMult: 1, detuneCents: 0 }`. Deterministic — the
 * same seed always yields the same offsets, so looped playback and critique
 * tests reproduce exactly.
 */
export function humanizeColor(seed: number, profile: HumanizeProfile, scale = 1): HumanizedNote {
    if (!(scale > 0)) {
        return NEUTRAL_COLOR;
    }
    // Two independent draws off one seed: XOR with distinct constants so
    // velocity and detune don't move in lockstep.
    const rVel = scrambleHash(seed ^ 0x9e3779b9);
    const rDetune = scrambleHash(seed ^ 0x85ebca6b);
    return {
        velocityMult: 1 + (rVel - 0.5) * 2 * profile.velSpread * scale,
        detuneCents: (rDetune - 0.5) * 2 * profile.detuneSpread * scale,
    };
}

/** Cents → frequency ratio, for lanes whose voice takes no `detune` param. */
export function detuneRatio(cents: number): number {
    return cents === 0 ? 1 : 2 ** (cents / 1200);
}
