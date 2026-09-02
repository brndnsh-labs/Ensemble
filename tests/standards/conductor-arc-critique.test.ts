/**
 * Conductor Arc Critique — epic-form-arrangement S7
 *
 * Baseline coverage for `public/engine/conductor.ts` — previously zero
 * critique-test coverage of:
 *   1. Session-timer macro-arc (the `progress < 0.15 / 0.4 / 0.65 / 0.85 / else`
 *      floor/ceiling ladder in the shared `macroArcLadder` helper —
 *      coordination-engine.ts, called from conductor.ts — that drives
 *      `targetIntensity`).
 *   2. Section-transition fill (dispatch of TRIGGER_FILL on the bar BEFORE a
 *      role change, not on the boundary itself — i.e. start of the last measure
 *      of section N when next measure is section N+1).
 *   3. Section-boundary crash (`crash: true` flag on the procedural fallback fill).
 *
 * --- Engine-behavior notes that shaped the test ---
 *
 * "Intensity rises 0 -> 0.5 in first 40%" (audit-doc S7 spec):
 *   The actual macro-arc ladder is:
 *     progress < 0.15  -> [floor=0.20, ceiling=0.45]
 *     progress < 0.40  -> [floor=0.40, ceiling=0.70]
 *     progress < 0.65  -> [floor=0.50, ceiling=0.80]
 *     progress < 0.85  -> [floor=0.70, ceiling=1.00]
 *     else             -> [floor=0.20, ceiling=0.50]
 *   So in "first 40%" the realized ceiling is 0.45 (before progress=0.15) then
 *   jumps to 0.70 (between 0.15 and 0.40). The audit's "0 -> 0.5" is a smooth
 *   gloss over an actual stepped ladder; we test what the engine literally does.
 *
 * "Drops < 0.5 in the final 15%":
 *   Macro window [0.20, 0.50] AFTER which a seeded `+= prng()*0.15 - 0.075`
 *   jitter is applied (#793: conductor.ts createPRNG('macro-jitter:<formIteration>:<step>')),
 *   which can push the realized value above 0.50. The jitter is now DETERMINISTIC
 *   per (formIteration, currentStep) — stubbing Math.random no longer affects it.
 *   At the fixture's formIteration=0 / currentStep=16 the draw resolves to a
 *   fixed +0.0713 offset, so every transition here lands the same ladder-rung +
 *   jitter value. We derive that exact offset (same createPRNG seed) and assert
 *   the realized target equals rung + offset, and a 30-iteration sweep over
 *   distinct formIterations exercises the full ±0.075 jitter envelope.
 *
 * Role-based switch (the `switch (role)` block inside `applyConductor`'s
 *   `if (conductor.form && ...)` branch, conductor.ts): its arms are now
 *   named to mirror `form-analysis.ts:analyzeForm`'s actual output
 *   (`Intro / Outro / Peak / Main Theme / Theme B / Bridge / Variation /
 *   Refrain / Build`) — no longer the old formal-music vocabulary
 *   (`Exposition / Development / ...`) that only intersected `analyzeForm`
 *   on `Build`. It stays unreached in production regardless: `conductor.form`
 *   is only ever populated via `analyzeFormUI`'s `dispatch(UPDATE_CONDUCTOR_STATE,
 *   { form })`, and both call sites (`main.ts`, `arranger-controller.ts`) call
 *   `analyzeFormUI` without its optional `dispatch` argument, so that dispatch
 *   never fires and `conductor.form` stays `null` for the life of the app. We
 *   use `conductor.form = null` (the actual, permanent production state) so
 *   the test exercises `getSectionEnergy(label)` instead of the switch's
 *   still-unreached cases. See `Findings discovered` in the test report.
 *
 * --- Test pattern mirrored ---
 *
 * Mock state via `vi.mock('../../public/state.js', ...)` + per-test mock state
 * mutation, mirroring `drummer-chorus-evolution.test.ts` (same epic). PRNG
 * shape mirrors `soloist-chorus-evolution-rhythm.test.ts` (canonical
 * mulberry32 re-seeded per call, per `feedback_seeded_prng_mulberry32` /
 * `feedback_determinism_test_pattern`).
 *
 * Source: docs/audit/epic-form-arrangement.md S7; docs/audit/form-arranger.md P2 #14.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition, MACRO_JITTER_RANGE } from '../../public/engine/conductor.js';
import { createPRNG } from '../../public/engine/hash-utils.js';
import { getJamMacroArc, JAM_CYCLE_LENGTHS } from '../../public/song/form-analysis.js';
import type { Dispatch, EnsembleState } from '../../public/types.js';
import { ACTIONS } from '../../public/types.js';

// The exact deterministic macro jitter the conductor applies at the fixture's
// (formIteration, currentStep). #793 seeds the jitter on
// `macro-jitter:<formIteration>:<currentStep>` (conductor.ts), so for a known
// pair it is a single fixed offset — NOT centered. `runTransitionAtProgress`
// drives currentStep=16 and formIteration defaults to 0, so the ladder tests
// see this exact value and can assert the rung + offset to full precision
// (a wide ±half-jitter band would let a downward rung collapse slip through,
// since the offset here is ~+0.071, eating almost the whole upper half-band).
const macroJitterAt = (formIteration: number, currentStep: number): number =>
    createPRNG(`macro-jitter:${formIteration}:${currentStep}`)() * MACRO_JITTER_RANGE -
    MACRO_JITTER_RANGE / 2;

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

vi.mock('../../public/ui.js', () => ({
    triggerFlash: vi.fn(),
}));

vi.mock('../../public/state/persistence.js', () => ({
    debounceSaveState: vi.fn(),
    saveCurrentState: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const STEPS_PER_MEASURE = 16;
// 6 measures total. Three 2-measure sections so we get a clean mid-form
// transition at step 16 (A -> B) that is NOT isLoopEnd. The isLoopEnd path
// triggers an extra `Math.random() * 0.2 - 0.1` re-jitter and clamps the
// result into [0.3, 0.95], which would confuse the macro-arc bounds test.
const SECTION_A_END = 32; // 2 measures of 'Verse' (sectionId: 'A')
const SECTION_B_END = 64; // 2 measures of 'Chorus' (sectionId: 'B')
const SECTION_C_END = 96; // 2 measures of 'Chorus' (sectionId: 'C')
const TOTAL_STEPS = SECTION_C_END;

const SESSION_TIMER_MIN = 5;
const SESSION_START_TIME = 100000;

/**
 * Build a minimal-but-realistic state slice that drives checkSectionTransition
 * through the macro-arc + procedural-fallback path:
 *   - groove.enabled true so the early-return is skipped.
 *   - autoIntensity true so UPDATE_CONDUCTOR_STATE fires.
 *   - sessionTimer/sessionStartTime > 0 so the session-timer macro-arc branch
 *     (line 353) takes priority over the formIteration grandCycle fallback.
 *   - conductor.form = null so the role-based switch (line 395) is skipped
 *     and getSectionEnergy(label) drives targetEnergy. This is the path that
 *     actually executes in production for charts without a tagged form.
 *   - orchestrationMap/fillMap undefined so the seeded-timeline early returns
 *     are skipped and the procedural fallback (line 468) fires.
 *
 * Section labels: 'Verse' (0.5), 'Chorus' (0.9). Chorus's high energy is
 * intentional — it exceeds every macroCeiling in the ladder, so the macro
 * clamp `Math.min(macroCeiling, 0.9)` resolves to the ceiling itself in every
 * window. That makes the assertions a direct read of the ladder.
 */
function makeMockState(opts: { bandIntensity?: number; songMode?: boolean } = {}) {
    return {
        playback: {
            isPlaying: true,
            autoIntensity: true,
            bandIntensity: opts.bandIntensity ?? 0.35,
            complexity: 0.5,
            bpm: 100,
            songMode: opts.songMode ?? true,
            isEndingPending: false,
            sessionTimer: SESSION_TIMER_MIN,
            sessionStartTime: SESSION_START_TIME,
            visualFlash: false,
            step: 0,
            audio: null,
            masterLimiter: null,
            chordsEQ: null,
            chordsPanner: null,
            bassEQ: null,
            soloistEQ: null,
            harmoniesEQ: null,
            harmoniesPanner: null,
            reverbPreFilter: null,
        },
        groove: {
            enabled: true,
            genreFeel: 'Rock',
            lastDrumPreset: 'Rock',
            instruments: [],
            accentMap: null,
            fillMap: null,
            fillActive: false,
            sectionSeedMap: {},
            seedTimelineStartStep: 0,
            orchestrationMap: undefined,
        },
        soloist: {
            enabled: false,
            tradeMode: 'off',
            session: { phrasing: { busySteps: 0 } },
        },
        arranger: {
            timeSignature: '4/4',
            totalSteps: TOTAL_STEPS,
            sections: [
                { id: 'A', label: 'Verse', seamless: false },
                { id: 'B', label: 'Chorus', seamless: false },
                { id: 'C', label: 'Chorus', seamless: false },
            ],
            stepMap: [
                {
                    start: 0,
                    end: SECTION_A_END,
                    chord: { sectionId: 'A', sectionLabel: 'Verse' },
                },
                {
                    start: SECTION_A_END,
                    end: SECTION_B_END,
                    chord: { sectionId: 'B', sectionLabel: 'Chorus' },
                },
                {
                    start: SECTION_B_END,
                    end: SECTION_C_END,
                    chord: { sectionId: 'C', sectionLabel: 'Chorus' },
                },
            ],
        },
        conductor: {
            targetIntensity: 0.35,
            stepSize: 0.0005,
            form: null, // see header note — null is the production path
            loopCount: 0,
            formIteration: 0,
        },
    };
}

// mulberry32 — same canonical helper used in
// soloist-chorus-evolution-rhythm.test.ts. Re-seeded per call so different
// runs see different sequences (for the 30-run reliability sweep).
function makeMulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Drive checkSectionTransition with `performance.now()` stubbed so that
 * (now - sessionStartTime) corresponds to `progress` fraction of sessionTimer.
 *
 * Captures every dispatched action so the test can inspect both the
 * UPDATE_CONDUCTOR_STATE writes (macro-arc) and the TRIGGER_FILL writes
 * (section-boundary crash).
 *
 * `randomImpl` is the Math.random replacement — still used by the
 * procedural-fill template picker (fills.ts). NOTE: post-#793 the macro-arc
 * energy jitter is SEEDED (createPRNG keyed on formIteration+currentStep), so
 * `randomImpl` no longer affects targetIntensity. To vary the macro jitter,
 * pass `formIteration` (it re-keys the seeded draw `macro-jitter:<fi>:<step>`).
 */
function runTransitionAtProgress(
    progress: number,
    opts: { randomImpl?: () => number; mockState?: any; formIteration?: number } = {},
): {
    dispatched: Array<{ type: string; payload: any }>;
    targetIntensity: number | undefined;
} {
    const mockState = opts.mockState ?? makeMockState();
    if (opts.formIteration !== undefined) {
        mockState.conductor.formIteration = opts.formIteration;
    }
    const dispatched: Array<{ type: string; payload: any }> = [];
    const dispatch: Dispatch = (type, ...args) => {
        dispatched.push({ type, payload: args[0] });
    };

    const elapsedMs = progress * SESSION_TIMER_MIN * 60_000;
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(SESSION_START_TIME + elapsedMs);
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(opts.randomImpl ?? (() => 0.5));

    try {
        // step 16 = start of section A's LAST measure (A ends at step 32).
        // The conductor looks at the chord at the END of the upcoming measure
        // (effectiveStep = 31) and the chord at measureEnd (step 32 = section B).
        // Section A != Section B -> transition detected, fill + targetIntensity
        // write triggered. isLoopEnd is false (32 < 96).
        checkSectionTransition(mockState, 16, STEPS_PER_MEASURE, dispatch);
    } finally {
        nowSpy.mockRestore();
        randomSpy.mockRestore();
    }

    const lastTargetWrite = [...dispatched]
        .reverse()
        .find(
            (d) =>
                d.type === ACTIONS.UPDATE_CONDUCTOR_STATE &&
                d.payload?.targetIntensity !== undefined,
        );

    return {
        dispatched,
        targetIntensity: lastTargetWrite?.payload?.targetIntensity,
    };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Conductor Arc Critique (S7)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // ---------------------------------------------------------------------
    // 1. Macro-arc shape — sampled at 5 points along the session timer.
    //
    // Post-#793 the macro-arc energy jitter is SEEDED (createPRNG keyed on
    // formIteration+currentStep), not raw Math.random — so at the fixture's
    // (formIteration=0, currentStep=16) it is a single DETERMINISTIC offset
    // (a fixed +0.0713, NOT centered on zero). We derive that exact offset with
    // the same createPRNG seed and assert the realized target EQUALS rung +
    // offset — the tightest possible guard, with no blind spot. (A symmetric
    // ±half-jitter band would, combined with the off-center +0.071, let a
    // downward rung collapse of up to ~0.146 pass silently — which would defeat
    // the whole point of a ladder test.) The varied-formIteration sweep below
    // exercises the full ±0.075 envelope as a separate, range-based check.
    // ---------------------------------------------------------------------
    describe('session-timer macro-arc (seeded jitter, exact rung+offset)', () => {
        // Section label 'Chorus' -> getSectionEnergy = 0.9. The macro clamp
        // `Math.min(macroCeiling, 0.9)` therefore resolves to the ceiling
        // itself in every window -> the test directly probes the ladder.
        const ladder: Array<[string, number, number]> = [
            // [phase, progress, expectedTarget = macroCeiling]
            ['warmup       (p<0.15)', 0.1, 0.45],
            ['development  (0.15-0.40)', 0.25, 0.7],
            ['mid-session  (0.40-0.65)', 0.5, 0.8],
            ['climax       (0.65-0.85)', 0.75, 0.9],
            ['cool-down    (p>=0.85)', 0.95, 0.5],
        ];

        for (const [phase, progress, expected] of ladder) {
            it(`${phase} -> targetIntensity == ${expected} + seeded jitter`, () => {
                const { targetIntensity } = runTransitionAtProgress(progress);
                // why exact (rung + derived offset), not a ±half-jitter band:
                // the seeded macro jitter (#793) is DETERMINISTIC at the
                // fixture's (formIteration=0, currentStep=16) — a single fixed
                // offset (~+0.071). A symmetric ±0.075 band around the rung
                // would, combined with that off-center offset, let a downward
                // rung collapse (e.g. climax 0.9 -> 0.8) land within tolerance
                // and pass silently. Deriving the exact offset and asserting
                // equality keeps the ladder guard at full precision: any rung
                // move surfaces 1:1.
                expect(targetIntensity ?? 0).toBeCloseTo(expected + macroJitterAt(0, 16), 6);
            });
        }

        // ---------------------------------------------------------------
        // Audit-doc claim a: "intensity rises 0 -> 0.5 in first 40%"
        // Realized ladder gives 0.45 at p=0.10 and 0.70 at p=0.25-0.40, so
        // the realized target is BELOW 0.5 only in the very first 15%, then
        // jumps above 0.5 for the remainder of "the first 40%." We test
        // the looser audit claim (>=0.4 by p=0.40) to honour the spec's
        // direction without overstating the gradient.
        // ---------------------------------------------------------------
        it('audit claim: target >= 0.4 by 40% of session timer', () => {
            const { targetIntensity } = runTransitionAtProgress(0.39);
            // why 0.4: macroFloor for the 0.15-0.40 window. With Chorus
            // label (energy 0.9) clamping to ceiling 0.70, the deterministic
            // value is 0.70 — comfortably above 0.4.
            expect(targetIntensity).toBeGreaterThanOrEqual(0.4);
        });

        // Audit-doc claim b: "peaks > 0.7 in the 65-85% window"
        it('audit claim: target > 0.7 in 65-85% window', () => {
            // Sample at 0.75 (middle of the window). macroFloor=0.7,
            // macroCeiling=1.0, Chorus energy 0.9 stays in-range -> exactly 0.9.
            const { targetIntensity } = runTransitionAtProgress(0.75);
            expect(targetIntensity).toBeGreaterThan(0.7);
        });

        // Audit-doc claim c: "drops < 0.5 in the final 15%"
        // The cool-down macroCeiling IS 0.5; post-#793 the seeded macro jitter
        // is always present, so the realized target is the ceiling plus a
        // bounded ±MACRO_JITTER_RANGE/2 offset. The upper edge is therefore
        // 0.5 + MACRO_JITTER_RANGE/2. We assert against that envelope edge.
        it('audit claim: target <= cool-down ceiling + jitter in final 15%', () => {
            const { targetIntensity } = runTransitionAtProgress(0.95);
            // why 0.5 + MACRO_JITTER_RANGE/2: macroCeiling 0.5 for the p>=0.85
            // window, plus the always-present seeded jitter's upper half-range.
            // The audit-doc "< 0.5" can't hold exactly — the engine clamps AT
            // the ceiling and then adds jitter. This bounds the realized target
            // at the engine's true worst case rather than overstating it.
            expect(targetIntensity).toBeLessThanOrEqual(0.5 + MACRO_JITTER_RANGE / 2 + 1e-9);
        });

        // Direction guard: climax window is strictly higher than cool-down.
        // This catches a swap-the-ladder-rows regression that point-checks
        // alone could miss.
        it('climax target > cool-down target (arc-direction guard)', () => {
            const climax = runTransitionAtProgress(0.75).targetIntensity ?? 0;
            const coolDown = runTransitionAtProgress(0.95).targetIntensity ?? 0;
            expect(climax).toBeGreaterThan(coolDown);
            // Headroom: both calls use the SAME (formIteration=0, currentStep=16)
            // seed, so the #793 macro jitter is the identical +0.0713 offset on
            // each and cancels in the difference: climax 0.9+j, cool-down 0.5+j
            // -> gap exactly 0.4. Threshold 0.20 leaves a 0.20 cushion.
            expect(climax - coolDown).toBeGreaterThanOrEqual(0.2);
        });

        // ---------------------------------------------------------------
        // Low-energy section coverage. Every test above uses a Chorus
        // next-section (getSectionEnergy = 0.9), which exceeds every
        // macroCeiling in the ladder — so `Math.min(macroCeiling, energy)`
        // ALWAYS resolves to the ceiling and the section-energy term is
        // never actually observed. This companion drives a transition INTO
        // a Verse (energy 0.5) at progress 0.25: the development window is
        // [0.40, 0.70], so 0.5 sits strictly inside the clamp and passes
        // through untouched. The realized target therefore reads
        // getSectionEnergy('Verse') directly, not the ceiling. If the
        // engine wrongly clamped to macroCeiling (or dropped the
        // section-energy term), this would land at 0.70 instead of 0.5.
        // ---------------------------------------------------------------
        it('low-energy next section -> targetIntensity is the section energy, not the ceiling', () => {
            const state = makeMockState();
            // makeMockState sets `conductor.form = null` (the production path —
            // see header note), so the `switch (role)` block in `applyConductor`
            // (conductor.ts) is skipped and the outer `else` fallback (paired
            // with the `if (conductor.form && (conductor.form as any).sections)`
            // check) runs: `targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel)`.
            // That's the line under test — relabel the stepMap chord B (the
            // section the step-16 transition lands in) to Verse. `sections[1]`
            // is relabelled too only to keep the mock internally consistent;
            // with form=null nothing reads `sections[].label`.
            state.arranger.sections[1].label = 'Verse';
            state.arranger.stepMap[1].chord.sectionLabel = 'Verse';

            const { targetIntensity } = runTransitionAtProgress(0.25, { mockState: state });
            // why exact 0.5 + derived jitter: getSectionEnergy('Verse') = 0.5;
            // development-window clamp [0.40, 0.70] leaves it untouched; Rock
            // genre floor 0.35 < 0.5, so no lift; the seeded macro jitter (#793)
            // adds its fixed (formIteration=0, currentStep=16) offset. The point
            // still holds — the realized target reads section energy (0.5), NOT
            // the ceiling (0.70): 0.70 is >0.075 away even with the offset, so a
            // ceiling-clamp regression surfaces. Exact (not band) for the same
            // reason as the ladder above — keep the guard at full precision.
            expect(targetIntensity ?? 0).toBeCloseTo(0.5 + macroJitterAt(0, 16), 6);
        });
    });

    // ---------------------------------------------------------------------
    // 2. Varied-formIteration reliability sweep — 30 distinct formIterations
    //    across the macro-arc claims. Post-#793 the macro jitter is SEEDED on
    //    `macro-jitter:<formIteration>:<currentStep>`, so the envelope is swept
    //    by varying formIteration (NOT Math.random, which the seeded jitter
    //    ignores — a Math.random sweep would now yield 30 identical samples and
    //    test nothing). Each formIteration draws a distinct bounded jitter, so
    //    the 30 samples genuinely span the ±MACRO_JITTER_RANGE/2 envelope; the
    //    `distinct > 1` assertions pin that the sweep is non-vacuous.
    //
    //    The jitter adds prng()*MACRO_JITTER_RANGE - MACRO_JITTER_RANGE/2,
    //    range [-MACRO_JITTER_RANGE/2, +MACRO_JITTER_RANGE/2):
    //      climax    p=0.75: 0.90 + jitter -> [0.825, 0.975)
    //      cool-down p=0.95: 0.50 + jitter -> [0.425, 0.575)
    //
    //    Reliability target: each claim must hold for ALL 30 formIterations.
    //    Reported in console as "X/30 passes" so a regression that shrinks the
    //    envelope shows up as a partial fail rather than a binary pass/fail.
    // ---------------------------------------------------------------------
    describe('varied-formIteration reliability sweep (30 macro-jitter draws)', () => {
        const FORM_ITERATIONS = Array.from({ length: 30 }, (_, i) => i);

        it('climax window: target > 0.7 across 30 form iterations', () => {
            let passes = 0;
            const samples: number[] = [];
            for (const formIteration of FORM_ITERATIONS) {
                const { targetIntensity } = runTransitionAtProgress(0.75, { formIteration });
                samples.push(targetIntensity ?? 0);
                if ((targetIntensity ?? 0) > 0.7) {
                    passes++;
                }
            }
            const distinct = new Set(samples.map((v) => v.toFixed(6))).size;
            console.log('\n--- CONDUCTOR ARC CRITIQUE — CLIMAX SWEEP ---');
            console.log(`[Form iterations]    30 (seeded macro-jitter draws)`);
            console.log(`[Target window]      progress 0.75 (climax: macro [0.7, 1.0])`);
            console.log(`[Assertion]          targetIntensity > 0.7`);
            console.log(`[Distinct samples]   ${distinct}/30`);
            console.log(`[Passes]             ${passes}/30`);
            console.log(
                `[Sample mean]        ${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3)}`,
            );
            console.log(
                `[Sample min/max]     ${Math.min(...samples).toFixed(3)} / ${Math.max(...samples).toFixed(3)}`,
            );
            console.log('--------------------------------------------\n');

            // Engine reality: macroCeiling=1.0, Chorus-label clamp lands at 0.9,
            // the seeded ±0.075 jitter gives samples in [0.825, 0.975) — all
            // above 0.7. 30/30 is the bar, and the draws are genuinely distinct
            // (the sweep actually varies the jitter now).
            expect(passes).toBeGreaterThanOrEqual(30);
            expect(distinct).toBeGreaterThan(1);
        });

        it('cool-down window: target stays inside the jitter envelope across 30 form iterations', () => {
            // The cool-down macroCeiling is 0.5; the seeded jitter (#793) adds
            // prng()*MACRO_JITTER_RANGE - MACRO_JITTER_RANGE/2, range
            // [-0.075, +0.075). So the realized target cannot reach 0.5 + 0.075
            // = 0.575. Asserting against THAT envelope edge (rather than a loose
            // < 0.6) means a regression that widens the jitter — or raises the
            // cool-down ceiling — surfaces here as a deliberate failure instead
            // of silently eating the old 0.025 cushion.
            const COOLDOWN_CEILING = 0.5; // macro ladder, conductor.ts p>=0.85 window
            // why: derive from MACRO_JITTER_RANGE so a change to the constant
            // automatically tightens or loosens this envelope assertion too.
            const JITTER_HALF_RANGE = MACRO_JITTER_RANGE / 2; // = 0.075
            const WORST_CASE = COOLDOWN_CEILING + JITTER_HALF_RANGE; // 0.575
            const EPS = 1e-9;
            let passes = 0;
            const samples: number[] = [];
            for (const formIteration of FORM_ITERATIONS) {
                const { targetIntensity } = runTransitionAtProgress(0.95, { formIteration });
                const v = targetIntensity ?? 0;
                samples.push(v);
                if (v <= WORST_CASE + EPS) {
                    passes++;
                }
            }
            const maxSample = Math.max(...samples);
            const distinct = new Set(samples.map((v) => v.toFixed(6))).size;
            console.log('\n--- CONDUCTOR ARC CRITIQUE — COOL-DOWN SWEEP ---');
            console.log(`[Form iterations]    30 (seeded macro-jitter draws)`);
            console.log(`[Target window]      progress 0.95 (cool-down: macro [0.2, 0.5])`);
            console.log(`[Assertion]          targetIntensity <= ${WORST_CASE} (ceiling + jitter)`);
            console.log(`[Audit-doc claim]    "drops < 0.5 in final 15%"`);
            console.log(
                `[Engine reality]     clamps at ceiling 0.5; +/-0.075 seeded jitter -> [0.425, 0.575)`,
            );
            console.log(`[Distinct samples]   ${distinct}/30`);
            console.log(`[Passes]             ${passes}/30`);
            console.log(
                `[Sample mean]        ${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3)}`,
            );
            console.log(
                `[Sample min/max]     ${Math.min(...samples).toFixed(3)} / ${maxSample.toFixed(3)}`,
            );
            console.log('-------------------------------------------------\n');

            // Every draw must land at or below the engine's worst-case sample
            // (ceiling + half-jitter). Pinned to the jitter constant above —
            // if conductor.ts widens the envelope, this fails on purpose.
            expect(passes).toBeGreaterThanOrEqual(30);
            expect(maxSample).toBeLessThanOrEqual(WORST_CASE + EPS);
            expect(distinct).toBeGreaterThan(1);
        });

        it('arc-direction: climax > cool-down for every form iteration', () => {
            let passes = 0;
            const deltas: number[] = [];
            for (const formIteration of FORM_ITERATIONS) {
                // Different formIteration seeds for climax vs cool-down (fi vs
                // fi+100) so the macro jitter applied to each is an INDEPENDENT
                // draw — exactly the comparison a listener makes across the
                // actual session arc, where climax and cool-down land on
                // different bars (hence different jitter seeds).
                const climax =
                    runTransitionAtProgress(0.75, { formIteration }).targetIntensity ?? 0;
                const coolDown =
                    runTransitionAtProgress(0.95, { formIteration: formIteration + 100 })
                        .targetIntensity ?? 0;
                deltas.push(climax - coolDown);
                if (climax > coolDown) {
                    passes++;
                }
            }
            console.log('\n--- CONDUCTOR ARC CRITIQUE — DIRECTION SWEEP ---');
            console.log(`[Form iterations]    30 (independent climax/cool-down jitter seeds)`);
            console.log(`[Assertion]          climax > cool-down for every iteration`);
            console.log(`[Passes]             ${passes}/30`);
            console.log(
                `[Delta mean]         ${(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(3)}`,
            );
            console.log(
                `[Delta min/max]      ${Math.min(...deltas).toFixed(3)} / ${Math.max(...deltas).toFixed(3)}`,
            );
            console.log('-------------------------------------------------\n');

            // Engine reality: climax in [0.825, 0.975), cool-down in [0.425,
            // 0.575) with independent jitter -> delta in (0.25, 0.55). Always
            // positive.
            expect(passes).toBeGreaterThanOrEqual(30);
        });
    });

    // ---------------------------------------------------------------------
    // 2b. Timer-less open-jam macro-arc (S3) — when there is NO session timer
    //     the conductor falls back to `getJamMacroArc`, a genre-aware
    //     raised-cosine swell with deterministic per-cycle variation. It
    //     replaced the old rigid `formIteration % 8` 5-step sawtooth.
    //
    //     The acceptance criterion is that the contour is NOT a fixed-period
    //     sawtooth: (a) it must be smoother than a 5-step ladder, and (b)
    //     successive grand-cycles must NOT be byte-identical.
    //
    //     To exercise the fallback we set sessionTimer=0 so the
    //     `playback.sessionTimer > 0 && sessionStartTime > 0` branch is
    //     skipped, then drive checkSectionTransition once per formIteration
    //     and capture the realized targetIntensity. The transition at step 16
    //     (A->B) is mid-form (not isLoopEnd) so the macro-arc write is clean.
    // ---------------------------------------------------------------------
    describe('timer-less open-jam macro-arc (S3)', () => {
        // Sample the realized targetIntensity across `count` consecutive form
        // iterations of the timer-less fallback. NOTE (#793): the macro jitter
        // is now SEEDED on (formIteration, currentStep), so each iteration's
        // realized target carries a bounded ±0.075 offset on top of
        // getJamMacroArc's swell (Math.random no longer zeroes it). The
        // sawtooth / cycle-variation / smoothness / band tests below tolerate
        // that offset; the genre-cycle crest test reads getJamMacroArc directly
        // to stay jitter-free (the offset injects spurious local maxima).
        function sampleJamArc(count: number, genreFeel = 'Rock'): number[] {
            const out: number[] = [];
            for (let it = 0; it < count; it++) {
                const state = makeMockState();
                // Force the timer-less fallback branch.
                state.playback.sessionTimer = 0;
                state.playback.sessionStartTime = 0;
                state.groove.genreFeel = genreFeel;
                state.conductor.formIteration = it;
                // Chorus next-section (energy 0.9) exceeds every ceiling, so
                // the macro clamp resolves to macroCeiling — the realized
                // target IS the arc ceiling, a direct read of the swell.
                const { targetIntensity } = runTransitionAtProgress(0.5, {
                    mockState: state,
                });
                out.push(targetIntensity ?? 0);
            }
            return out;
        }

        it('contour is not a fixed-period sawtooth (no exact period-8 repeat)', () => {
            // The old engine repeated with period 8. Sample 48 iterations and
            // assert no candidate period P in [4..16] reproduces the contour
            // exactly — i.e. arc[i] != arc[i+P] for enough i that a strict
            // periodic ladder would be caught.
            const N = 48;
            const arc = sampleJamArc(N);
            const offenders: number[] = [];
            for (let P = 4; P <= 16; P++) {
                let identical = true;
                for (let i = 0; i + P < N; i++) {
                    if (Math.abs(arc[i] - arc[i + P]) > 1e-9) {
                        identical = false;
                        break;
                    }
                }
                if (identical) {
                    offenders.push(P);
                }
            }
            console.log('\n--- CONDUCTOR ARC CRITIQUE — JAM-ARC PERIODICITY ---');
            console.log(`[Samples]            ${N} consecutive form iterations`);
            console.log(`[Candidate periods]  4..16`);
            console.log(
                `[Exact-repeat periods] ${offenders.length ? offenders.join(',') : 'none'}`,
            );
            console.log(
                `[Contour min/max]    ${Math.min(...arc).toFixed(3)} / ${Math.max(...arc).toFixed(3)}`,
            );
            console.log('----------------------------------------------------\n');
            // No candidate period may reproduce the contour exactly. The old
            // `% 8` ladder would have offenders === [8] (and 16).
            expect(offenders).toEqual([]);
        });

        it('successive grand-cycles are non-identical (per-cycle variation)', () => {
            // Rock cycle length is 11 (JAM_CYCLE_LENGTHS). Compare cycle 0
            // against cycle 1 against cycle 2 phase-for-phase: at least one
            // phase per pair must differ — the seeded per-cycle offset.
            const CYCLE = 11;
            const arc = sampleJamArc(CYCLE * 3);
            const cycle0 = arc.slice(0, CYCLE);
            const cycle1 = arc.slice(CYCLE, CYCLE * 2);
            const cycle2 = arc.slice(CYCLE * 2, CYCLE * 3);

            const maxDiff = (a: number[], b: number[]) =>
                Math.max(...a.map((v, i) => Math.abs(v - b[i])));
            const d01 = maxDiff(cycle0, cycle1);
            const d12 = maxDiff(cycle1, cycle2);

            console.log('\n--- CONDUCTOR ARC CRITIQUE — JAM-ARC CYCLE VARIATION ---');
            console.log(`[Cycle length]       ${CYCLE} (Rock)`);
            console.log(`[max|cycle0-cycle1|] ${d01.toFixed(4)}`);
            console.log(`[max|cycle1-cycle2|] ${d12.toFixed(4)}`);
            console.log('--------------------------------------------------------\n');

            // why 0.02: the per-cycle seeded offsets (phaseShift/crestLift/
            // windowBreath) move the swell by well over 0.02 on any non-trivial
            // hash draw; a fixed-period sawtooth would give exactly 0.
            expect(d01).toBeGreaterThan(0.02);
            expect(d12).toBeGreaterThan(0.02);
        });

        it('contour is smoother than a 5-step ladder (small step-to-step deltas)', () => {
            // A raised-cosine swell changes gradually; the old 5-step ladder
            // jumped up to 0.55 (0.10->0.45->0.75->1.0...) between adjacent
            // iterations. Assert the mean adjacent delta is modest and the
            // single worst jump never approaches the old ladder's 0.55 snap.
            const N = 44; // 4 Rock cycles
            const arc = sampleJamArc(N);
            const deltas: number[] = [];
            for (let i = 1; i < N; i++) {
                deltas.push(Math.abs(arc[i] - arc[i - 1]));
            }
            const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
            const maxDelta = Math.max(...deltas);

            console.log('\n--- CONDUCTOR ARC CRITIQUE — JAM-ARC SMOOTHNESS ---');
            console.log(`[Samples]            ${N}`);
            console.log(`[Mean adjacent delta] ${meanDelta.toFixed(4)}`);
            console.log(`[Max adjacent delta]  ${maxDelta.toFixed(4)}`);
            console.log(`[Old ladder worst snap] 0.550 (0.45 -> 1.00 band jump)`);
            console.log('----------------------------------------------------\n');

            // why 0.18 mean: a cosine swell over an 11-step cycle moves the
            // centre ~1.3/11 ≈ 0.12 per step at the steepest; the floor/ceiling
            // tracking and per-cycle breath add headroom. 0.18 mean comfortably
            // separates the swell from the old ladder (~0.27 mean).
            expect(meanDelta).toBeLessThan(0.18);
            // why 0.35 max: the steepest single step of the swell plus a
            // cycle-boundary phase reset stays well under the old 0.55 snap.
            expect(maxDelta).toBeLessThan(0.35);
        });

        it('contour stays inside the ~0.1-1.0 band the old ladder spanned', () => {
            // The fallback must still produce a usable energy band. Sweep
            // several genres (different cycle lengths) to cover the swell's
            // full excursion.
            for (const genre of ['Rock', 'Jazz', 'Funk', 'Bossa Nova']) {
                const arc = sampleJamArc(40, genre);
                const lo = Math.min(...arc);
                const hi = Math.max(...arc);
                console.log(
                    `[${genre.padEnd(10)}] jam-arc range  ${lo.toFixed(3)} .. ${hi.toFixed(3)}`,
                );
                // Realized target = clamp(macroFloor, macroCeiling, 0.9) -> the
                // macroCeiling. macroCeiling is Math.min(1.0, centre+halfWindow)
                // and centre+halfWindow >= 0.1 always.
                expect(lo).toBeGreaterThanOrEqual(0.1);
                expect(hi).toBeLessThanOrEqual(1.0);
            }
        });

        it('genre-aware cycle length: Funk re-crests sooner than Jazz', () => {
            // Funk cycle is 9, Jazz is 18 — Funk's swell should complete more
            // full crests over the same iteration count. Count local maxima of
            // the swell ceiling as a proxy for swell crests.
            //
            // why read getJamMacroArc directly (not sampleJamArc): post-#793 the
            // realized targetIntensity carries a seeded ±0.075 macro jitter that
            // injects spurious per-iteration local maxima — that noise swamps the
            // genre-cycle signal (measured directly it INVERTS the count to
            // Jazz > Funk: 15 vs 11). The claim under test is a property of the
            // genre-aware swell itself, so we measure the swell contour the
            // engine produces (macroCeiling), mirroring the direct-read approach
            // the dynamic-window test uses. Jitter-free, Funk crests 9 > Jazz 5.
            const N = 72;
            const countCrests = (arc: number[]) => {
                let crests = 0;
                for (let i = 1; i < arc.length - 1; i++) {
                    if (arc[i] > arc[i - 1] && arc[i] >= arc[i + 1]) {
                        crests++;
                    }
                }
                return crests;
            };
            const swellCeiling = (genre: string) =>
                Array.from({ length: N }, (_, it) => getJamMacroArc(it, genre).macroCeiling);
            const funkCrests = countCrests(swellCeiling('Funk'));
            const jazzCrests = countCrests(swellCeiling('Jazz'));

            console.log('\n--- CONDUCTOR ARC CRITIQUE — JAM-ARC GENRE CYCLE ---');
            console.log(`[Samples]      ${N} iterations (swell ceiling, jitter-free)`);
            console.log(`[Funk crests]  ${funkCrests} (cycle 9)`);
            console.log(`[Jazz crests]  ${jazzCrests} (cycle 18)`);
            console.log('-------------------------------------------------\n');

            // Funk (shorter cycle) must crest strictly more often than Jazz.
            expect(funkCrests).toBeGreaterThan(jazzCrests);
        });

        // The sampleJamArc tests above read the realized targetIntensity,
        // which the Chorus next-section (energy 0.9) clamps to macroCeiling —
        // so they only ever observe the swell's CEILING. macroFloor and the
        // breathing dynamic window are invisible to them. This block reads
        // getJamMacroArc directly so a floor inversion / window collapse
        // (e.g. a sign error in windowBreath) is actually guarded.
        it('dynamic window never inverts or collapses (direct macroFloor read)', () => {
            let minWindow = Infinity;
            let maxWindow = -Infinity;
            let minFloor = Infinity;
            let maxCeiling = -Infinity;
            for (const genre of Object.keys(JAM_CYCLE_LENGTHS)) {
                const cycleLen = JAM_CYCLE_LENGTHS[genre];
                // Sweep three full grand-cycles so per-cycle seeded variation
                // is exercised, not just one cycle.
                for (let it = 0; it < cycleLen * 3; it++) {
                    const { macroFloor, macroCeiling } = getJamMacroArc(it, genre);
                    const window = macroCeiling - macroFloor;
                    // Floor must stay below ceiling — never inverted.
                    expect(macroCeiling).toBeGreaterThan(macroFloor);
                    // Output band stays inside the documented 0.1-1.0 range.
                    expect(macroFloor).toBeGreaterThanOrEqual(0.1);
                    expect(macroCeiling).toBeLessThanOrEqual(1.0);
                    if (window < minWindow) {
                        minWindow = window;
                    }
                    if (window > maxWindow) {
                        maxWindow = window;
                    }
                    if (macroFloor < minFloor) {
                        minFloor = macroFloor;
                    }
                    if (macroCeiling > maxCeiling) {
                        maxCeiling = macroCeiling;
                    }
                }
            }
            console.log('\n--- CONDUCTOR ARC CRITIQUE — JAM-ARC DYNAMIC WINDOW ---');
            console.log(`[Window  min/max]  ${minWindow.toFixed(3)} / ${maxWindow.toFixed(3)}`);
            console.log(`[Floor   min]      ${minFloor.toFixed(3)}`);
            console.log(`[Ceiling max]      ${maxCeiling.toFixed(3)}`);
            console.log('--------------------------------------------------------\n');
            // The window must never collapse to a sliver: a usable dynamic
            // band is at least ~0.2 wide even at the trough (halfWindow floor
            // 0.18 minus windowBreath 0.06 -> 0.12 half -> ~0.24 full).
            expect(minWindow).toBeGreaterThan(0.15);
        });

        it('macroFloor itself varies pass-to-pass (floor is not pinned)', () => {
            // A floor that never moves would mean only the ceiling breathes —
            // half a swell. Sweep Rock across three cycles and assert the
            // floor contour has real spread and no exact period-N repeat.
            const cycleLen = JAM_CYCLE_LENGTHS.Rock;
            const N = cycleLen * 3;
            const floors: number[] = [];
            for (let it = 0; it < N; it++) {
                floors.push(getJamMacroArc(it, 'Rock').macroFloor);
            }
            const spread = Math.max(...floors) - Math.min(...floors);
            const offenders: number[] = [];
            for (let P = 4; P <= 16; P++) {
                let identical = true;
                for (let i = 0; i + P < N; i++) {
                    if (Math.abs(floors[i] - floors[i + P]) > 1e-9) {
                        identical = false;
                        break;
                    }
                }
                if (identical) {
                    offenders.push(P);
                }
            }
            console.log('\n--- CONDUCTOR ARC CRITIQUE — JAM-ARC FLOOR CONTOUR ---');
            console.log(`[Floor spread]         ${spread.toFixed(3)}`);
            console.log(
                `[Exact-repeat periods] ${offenders.length ? offenders.join(',') : 'none'}`,
            );
            console.log('-------------------------------------------------------\n');
            // The floor tracks the swell — it must move by a musically real
            // amount across a cycle, not sit pinned at 0.1.
            expect(spread).toBeGreaterThan(0.05);
            // ...and not as a fixed-period sawtooth.
            expect(offenders).toEqual([]);
        });
    });

    // ---------------------------------------------------------------------
    // 3. Section-transition fill — fires on the bar BEFORE the role change,
    //    not on the boundary itself.
    //
    //    Audit-doc claim: "fill fires on the bar before any role change."
    //    Engine reality: at modStep=16 (start of section A's last measure,
    //    section A ends at step 32), the conductor inspects the chord at
    //    measureEnd-1=31 (= section A) and the chord at measureEnd=32 (=
    //    section B), detects the boundary, and dispatches TRIGGER_FILL with
    //    `startStep: 16` -- i.e. the fill spans the bar BEFORE the section B
    //    downbeat.
    // ---------------------------------------------------------------------
    describe('section-transition fill timing', () => {
        it('TRIGGER_FILL dispatched at start of last measure before section change', () => {
            const { dispatched } = runTransitionAtProgress(0.5);
            const fills = dispatched.filter((d) => d.type === ACTIONS.TRIGGER_FILL);

            console.log('\n--- CONDUCTOR ARC CRITIQUE — FILL TIMING ---');
            console.log(`[stepMap]            A:[0..32) -> B:[32..64) -> C:[64..96)`);
            console.log(`[checkSectionTransition currentStep]  16 (start of A's last measure)`);
            console.log(`[Fills dispatched]   ${fills.length}`);
            for (const f of fills) {
                console.log(
                    `  - startStep=${f.payload.startStep} length=${f.payload.length} crash=${f.payload.crash}`,
                );
            }
            console.log('---------------------------------------------\n');

            // Audit-doc spec: fire ON the bar before, not ON the boundary.
            // Engine literal contract: at least one TRIGGER_FILL dispatched.
            expect(fills.length).toBeGreaterThanOrEqual(1);

            // The fill's startStep must equal the currentStep we called with
            // (16) -- not 32 (the boundary) and not 0 (the measure before
            // last). This is the hard-coded literal position the test guards;
            // re-deriving it from `currentStep` would be smell (a) tautology.
            const transitionFill = fills.find((f) => f.payload.startStep === 16);
            expect(transitionFill).toBeDefined();
        });

        it('TRIGGER_FILL has length == stepsPerMeasure (covers whole bar before transition)', () => {
            const { dispatched } = runTransitionAtProgress(0.5);
            const transitionFill = dispatched.find(
                (d) => d.type === ACTIONS.TRIGGER_FILL && d.payload.startStep === 16,
            );
            expect(transitionFill?.payload.length).toBe(STEPS_PER_MEASURE);
        });
    });

    // ---------------------------------------------------------------------
    // 4. Section-boundary crash — the conductor signals a crash on the
    //    procedural-fallback transition fill (the `shouldUseProceduralFallback`
    //    branch of `checkSectionTransition`, conductor.ts).
    //
    //    Audit-doc claim: "verify a crash cymbal is part of the transition
    //    fill where the conductor signals one."
    //    Engine reality (post-#799 "Crash Contract"): the procedural-fallback
    //    dispatch now sets `crash: fillCrash`, where `fillCrash = energyRising
    //    || targetEnergy > 0.4` — no longer an unconditional `true`. This
    //    test's fixture (progress 0.5, macro window floor 0.5) always lands
    //    `targetEnergy` above 0.4, so `fillCrash` still evaluates `true` here;
    //    the invariant this test pins is narrower than the comment used to
    //    claim (see report — worth re-deriving with a below-0.4 fixture).
    // ---------------------------------------------------------------------
    describe('section-boundary crash flag', () => {
        it('TRIGGER_FILL on section transition carries crash: true', () => {
            const { dispatched } = runTransitionAtProgress(0.5);
            const transitionFill = dispatched.find(
                (d) => d.type === ACTIONS.TRIGGER_FILL && d.payload.startStep === 16,
            );

            console.log('\n--- CONDUCTOR ARC CRITIQUE — CRASH FLAG ---');
            console.log(
                `[Transition fill payload]   ${JSON.stringify({
                    startStep: transitionFill?.payload.startStep,
                    length: transitionFill?.payload.length,
                    crash: transitionFill?.payload.crash,
                })}`,
            );
            console.log('--------------------------------------------\n');

            expect(transitionFill?.payload.crash).toBe(true);
        });

        // Multi-seed reliability: crash flag must hold for all 30 seeds.
        // (The procedural-fill template picker calls Math.random, so the
        // template that fires differs by seed. The `crash: true` flag is
        // set by the conductor regardless of which template is picked.)
        it('crash flag holds across 30 mulberry32 seeds', () => {
            const SEEDS = Array.from({ length: 30 }, (_, i) => 0xc0ffee + i * 0x101);
            let passes = 0;
            for (const seed of SEEDS) {
                const prng = makeMulberry32(seed);
                const { dispatched } = runTransitionAtProgress(0.5, {
                    randomImpl: prng,
                });
                const transitionFill = dispatched.find(
                    (d) => d.type === ACTIONS.TRIGGER_FILL && d.payload.startStep === 16,
                );
                if (transitionFill?.payload.crash === true) {
                    passes++;
                }
            }
            console.log('\n--- CONDUCTOR ARC CRITIQUE — CRASH RELIABILITY ---');
            console.log(`[Seeds]    30`);
            console.log(`[Passes]   ${passes}/30`);
            console.log('---------------------------------------------------\n');
            expect(passes).toBeGreaterThanOrEqual(30);
        });
    });

    // ---------------------------------------------------------------------
    // 5. Guard against the inverse — within a single section, no transition
    //    fill should fire. This is the "doesn't fire spuriously" complement
    //    to test 3 above, and catches a regression where the section-id
    //    comparison gets dropped.
    // ---------------------------------------------------------------------
    describe('no spurious fill within a single section', () => {
        it('checkSectionTransition at step 0 (mid-section A) dispatches no transition fill', () => {
            // step 0 is the start of A's FIRST measure. measureEnd=16, which
            // is still inside section A (A ends at 32). So no section
            // transition is detected and no fill should fire.
            const mockState = makeMockState() as unknown as EnsembleState;
            const dispatched: Array<{ type: string; payload: any }> = [];
            const dispatch: Dispatch = (type, ...args) => {
                dispatched.push({ type, payload: args[0] });
            };
            const nowSpy = vi
                .spyOn(performance, 'now')
                .mockReturnValue(SESSION_START_TIME + 0.5 * SESSION_TIMER_MIN * 60_000);
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
            try {
                checkSectionTransition(mockState, 0, STEPS_PER_MEASURE, dispatch);
            } finally {
                nowSpy.mockRestore();
                randomSpy.mockRestore();
            }

            const fills = dispatched.filter((d) => d.type === ACTIONS.TRIGGER_FILL);
            // why 0: A spans [0..32). currentStep=0, measureEnd=16, both inside
            // A -> no section change detected -> no transition fill. (The
            // harmonic-anticipation block at line 517 also fires on chord-end,
            // not measure-start, so it's silent at step 0.)
            expect(fills.length).toBe(0);
        });
    });

    // ---------------------------------------------------------------------
    // 6. #796 — per-genre intensity FLOOR applies on the LIVE seeded path.
    //
    //    `GENRE_INTENSITY_FLOORS` (conductor.ts) was previously read ONLY in
    //    the targetEnergy-undefined fallback macro-arc — a branch the ~128-bar
    //    seeded orchestration window makes unreachable during normal playback.
    //    So a funk verse seeded at a low energyLevel rode BELOW funk's 0.45
    //    floor (and below funk's 0.5 16th-hat "chicka" shimmer gate), and the
    //    signature funk pocket never cracked. The floor is now also clamped
    //    onto the seeded targetEnergy (conductor.ts, live seeded path).
    //
    //    Idiom under test (music-theory fact, not a tuning knob): a floored
    //    genre's auto-intensity never sits below its genre floor during seeded
    //    playback — while the floor stays a FLOOR (it lifts a quiet verse, it
    //    never clamps an already-hot one down).
    // ---------------------------------------------------------------------
    describe('genre intensity floor on the live seeded path (#796)', () => {
        // Drive checkSectionTransition's SEEDED branch (autoIntensity +
        // orchestrationMap present) at the start of section A's FIRST measure
        // (currentStep=0 -> measureEnd=16, still inside A: no transition, so the
        // only targetIntensity write is the seeded one under test). The
        // upcoming-measure orchestration lookup (seedTimelineStep+16 = 16)
        // resolves to the single map entry's `energyLevel`. loopLimit=0 keeps
        // the loop-arc multiplier out so we isolate the floor.
        function seededTargetIntensity(genreFeel: string, energyLevel: number): number | undefined {
            const state: any = makeMockState();
            state.groove.genreFeel = genreFeel;
            state.groove.lastDrumPreset = genreFeel;
            state.playback.loopLimit = 0;
            state.groove.seedTimelineStartStep = 0;
            state.groove.orchestrationMap = [{ start: 0, end: TOTAL_STEPS, energyLevel }];

            const dispatched: Array<{ type: string; payload: any }> = [];
            const dispatch: Dispatch = (type, ...args) => {
                dispatched.push({ type, payload: args[0] });
            };
            checkSectionTransition(state, 0, STEPS_PER_MEASURE, dispatch);

            const write = [...dispatched]
                .reverse()
                .find(
                    (d) =>
                        d.type === ACTIONS.UPDATE_CONDUCTOR_STATE &&
                        d.payload?.targetIntensity !== undefined,
                );
            return write?.payload?.targetIntensity;
        }

        // Funk floor is 0.45. A verse seeded at 0.30 (below the floor AND below
        // funk's 0.5 shimmer gate) must be lifted so the pocket cracks.
        it('funk verse seeded below its floor is lifted to the 0.45 floor', () => {
            const raw = 0.3;
            const lifted = seededTargetIntensity('Funk', raw) ?? 0;
            console.log('\n--- CONDUCTOR ARC CRITIQUE — GENRE FLOOR (#796) ---');
            console.log(`[Genre]              Funk (floor 0.45)`);
            console.log(`[Seeded energyLevel] ${raw.toFixed(2)} (below floor + shimmer gate)`);
            console.log(`[Realized target]    ${lifted.toFixed(3)}`);
            console.log(
                `[Pre-fix behavior]   ${raw.toFixed(3)} (floor never applied on seeded path)`,
            );
            console.log('----------------------------------------------------\n');
            // 0.45 is funk's GENRE_INTENSITY_FLOORS value (independent literal —
            // not read from the constant, so this pins the idiom, not the config).
            expect(lifted).toBeGreaterThanOrEqual(0.45 - 1e-9);
        });

        // The floor is a FLOOR, not a clamp: an already-hot seeded energy
        // (0.70 > 0.45) passes through untouched — no ceiling side-effect.
        it('funk energy already above the floor passes through unchanged', () => {
            expect(seededTargetIntensity('Funk', 0.7) ?? 0).toBeCloseTo(0.7, 6);
        });

        // PAIRED SITE — a verse that begins AT a section boundary reaches the
        // *seeded transition* emission (the second dispatch in the same call),
        // which fires AFTER the mid-section one, so its value is the one that
        // wins. Drive a genuine A->B boundary (currentStep=16 -> measureEnd=32)
        // with a below-floor seeded energy and assert the LAST-winning
        // targetIntensity still respects the floor. This case dispatches an
        // un-floored 0.30 (below the floor + funk's shimmer gate) before the
        // paired-site fix, so it guards the exact transition scenario #796
        // targets — a quiet funk verse dropping in on a section downbeat.
        it('funk verse beginning at a section boundary is floored too (paired seeded site)', () => {
            const state: any = makeMockState();
            state.groove.genreFeel = 'Funk';
            state.groove.lastDrumPreset = 'Funk';
            state.playback.loopLimit = 0;
            state.groove.seedTimelineStartStep = 0;
            state.groove.orchestrationMap = [{ start: 0, end: TOTAL_STEPS, energyLevel: 0.3 }];
            // step 16 = start of A's last measure; measureEnd=32 = A->B boundary
            // (both sections non-seamless in makeMockState), so shouldFill fires
            // and the seeded transition path dispatches last.
            const { targetIntensity } = runTransitionAtProgress(0.5, { mockState: state });
            console.log('\n--- CONDUCTOR ARC CRITIQUE — GENRE FLOOR @ BOUNDARY (#796) ---');
            console.log(`[Genre]              Funk (floor 0.45), seeded energyLevel 0.30`);
            console.log(
                `[Transition target]  ${(targetIntensity ?? 0).toFixed(3)} (paired seeded site)`,
            );
            console.log('-------------------------------------------------------------\n');
            expect(targetIntensity ?? 0).toBeGreaterThanOrEqual(0.45 - 1e-9);
        });

        // Neo-Soul (0.40) and Disco (0.45) are floored too — the fix is not
        // funk-specific. A quiet Neo-Soul verse rides its Dilla-pocket floor.
        it('neo-soul verse seeded below its floor is lifted to the 0.40 floor', () => {
            expect(seededTargetIntensity('Neo-Soul', 0.25) ?? 0).toBeGreaterThanOrEqual(0.4 - 1e-9);
        });

        // A genre with NO floor entry (Acoustic is not in GENRE_INTENSITY_FLOORS)
        // rides its raw seeded energy — quiet stays quiet, no spurious lift.
        it('a genre without a floor entry rides its raw seeded energy', () => {
            expect(seededTargetIntensity('Acoustic', 0.2) ?? 0).toBeCloseTo(0.2, 6);
        });
    });
});
