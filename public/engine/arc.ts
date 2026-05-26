/**
 * Loop-driven intensity arc — the conductor's shared "head → build → peak → release" envelope.
 *
 * Synth-audit Epic 7 S4. With `--loops=3+` renders, individual stems show motion (drums
 * front-loaded, soloist building monotonically, harmony flat) but the full mix classifies
 * as `flat` because the stems cancel. This helper returns a per-loop multiplier that all
 * four engines bias toward (via `playback.bandIntensity`), so per-stem motion sums
 * constructively into an audible arc across loops.
 *
 * Shape: hold + lift + peak + release. Final loop drops to ~0.95 of the section's
 * targetEnergy. The soloist's separate monotonic chorus-evolution boost (`+ loopCount *
 * 0.05` in `soloist.ts:959-960`) preserves the Epic 3 head→themed→exploratory signal
 * — note that it partially compensates for the release dip, so the soloist's effective
 * intensity tracks the arc with a slight late-loop lift rather than climaxing over a
 * thinning bed (one shared bandIntensity channel can't do both simultaneously; a true
 * "soloist climaxes over thinning bed" effect would need a separate soloistArcBoost
 * channel — deferred follow-up).
 *
 * Calibration: peak at 1.30× keeps the busy scenes (funk base 0.60 → 0.78) under the
 * 0.85 "rich" chord-density threshold in conductor.ts, so no compressor pumping
 * confounds the measurement. Head-to-peak swing of ~0.40× summed across four engines'
 * bandIntensity gates clears the 1.5 dB classifier floor in
 * `scripts/audio-analysis.ts:classifyArc`.
 *
 * Per-N curve numbers (head value, build slope) are empirically tuned against the
 * classifier floor: each row is the smallest swing that flips the full-mix `arc` label
 * from `'flat'` to `'arc'`/`'building'` on `mix:report --loops=N`. Head value deepens
 * as N grows (0.85 at N=8 vs 0.92 at N=4) so longer renders get a wider dynamic
 * window without inflating the peak.
 *
 * Single-loop or no-loop-limit cases return 1.0 (bit-identical guard for free-form
 * playback). The live conductor path is additionally gated on `playback.loopLimit > 1`
 * so users without a finite loop limit (or single-loop renders) get bit-identical
 * playback.
 *
 * Known limitations (deferred follow-ups):
 *   - Uniform arc shape across genres. Funk/disco "flat pocket" idioms may want a
 *     shallower curve (or no arc); per-genre arc tables would be a follow-up if the
 *     listening gate surfaces this.
 *   - Multiplicative composition with section roles in `checkSectionTransition` means
 *     the arc rides on top of macro-arc cycles and section targets. Section ordering
 *     is preserved in practice (a Peak's release is still louder than an Intro's
 *     peak at typical floors), but a chart with extreme section spreads could see
 *     ordering inversions at peak/release loop boundaries.
 *   - Genre floors (`macroFloor` in conductor.ts) are applied before the arc, so a
 *     0.95× release can dip slightly below the genre's audibility floor. Magnitude
 *     is small (5%) and the absolute clamp at 0.1 still guards.
 */

const ARC_CURVES: Record<number, readonly number[]> = {
    1: [1.0],
    2: [0.9, 1.25],
    3: [0.95, 1.3, 0.95],
    4: [0.92, 1.05, 1.3, 0.95],
    5: [0.9, 1.0, 1.2, 1.3, 0.95],
    6: [0.88, 0.98, 1.15, 1.28, 1.3, 0.95],
    7: [0.87, 0.95, 1.05, 1.18, 1.28, 1.3, 0.95],
    8: [0.85, 0.92, 1.0, 1.12, 1.22, 1.3, 1.28, 0.95],
};

const PEAK = 1.3;
const RELEASE = 0.95;
const FALLBACK_HEAD = 0.85;

/**
 * @param loopIndex 0-based index of the current loop (clamped to [0, loopLimit-1]).
 * @param loopLimit Total number of loops in the render / playback session.
 * @returns Multiplier in roughly [0.85, 1.30]. Returns 1.0 when loopLimit ≤ 1 or non-finite.
 */
export function loopArcMultiplier(loopIndex: number, loopLimit: number): number {
    if (!Number.isFinite(loopLimit) || !Number.isFinite(loopIndex)) {
        return 1.0;
    }
    const N = Math.floor(loopLimit);
    if (N <= 1) {
        return 1.0;
    }
    const i = Math.max(0, Math.min(Math.floor(loopIndex), N - 1));

    const table = ARC_CURVES[N];
    if (table) {
        return table[i];
    }

    // N > 8: linear interpolation from FALLBACK_HEAD at i=0 up to PEAK at i=N-2,
    // then RELEASE at i=N-1. Renders this deep are rare; this just keeps the shape
    // sane rather than special-casing.
    if (i === N - 1) {
        return RELEASE;
    }
    if (i === N - 2) {
        return PEAK;
    }
    const t = i / (N - 2);
    return FALLBACK_HEAD + (PEAK - FALLBACK_HEAD) * t;
}

/**
 * Resolve a session into a concrete whole-loop count regardless of whether the
 * user chose "loops" or "minutes" mode in Settings.
 *
 * why: timer mode was always intended to be a *fuzzy* duration — "play for
 * ~3 minutes" meant "round to the nearest whole loop that fits." Without this
 * helper, the engine treated timer and loop modes as fundamentally different
 * paths: timer mode bypassed the macro-arc entirely (`loopLimit > 1` gate in
 * conductor.ts) and ended at the elapsed-minute cutoff, often mid-bar. After
 * routing through this helper, both modes converge on a loop-count and the
 * macro-arc fires for time-bounded sessions too.
 *
 * Returns 0 when neither mode supplies usable data — engines should fall back
 * to "free-form jam" (no arc, no end condition) in that case.
 */
export function getEffectiveLoopLimit(
    loopLimit: number,
    sessionTimer: number,
    bpm: number,
    totalSteps: number,
): number {
    // Explicit loop count always wins.
    if (Number.isFinite(loopLimit) && loopLimit > 0) {
        return Math.floor(loopLimit);
    }
    // Timer-mode resolution requires a known chart length + tempo.
    if (
        !Number.isFinite(sessionTimer) ||
        sessionTimer <= 0 ||
        !Number.isFinite(bpm) ||
        bpm <= 0 ||
        !Number.isFinite(totalSteps) ||
        totalSteps <= 0
    ) {
        return 0;
    }
    // 16 steps per bar at 4/4, 4 steps per beat → seconds-per-step = 60/bpm/4.
    // This matches the same calc Settings.tsx uses for its "Est. Time" display.
    const secPerStep = 60 / bpm / 4;
    const secPerLoop = totalSteps * secPerStep;
    if (secPerLoop <= 0) {
        return 0;
    }
    const totalSec = sessionTimer * 60;
    return Math.max(1, Math.round(totalSec / secPerLoop));
}
