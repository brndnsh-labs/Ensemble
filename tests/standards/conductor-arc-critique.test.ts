/**
 * Conductor Arc Critique — epic-form-arrangement S7
 *
 * Baseline coverage for `public/engine/conductor.ts` — previously zero
 * critique-test coverage of:
 *   1. Session-timer macro-arc (the `progress < 0.15 / 0.4 / 0.65 / 0.85 / else`
 *      floor/ceiling ladder at conductor.ts:357-372 that drives `targetIntensity`).
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
 *   Macro window [0.20, 0.50] AFTER which `+= Math.random() * 0.15 - 0.075`
 *   jitter is applied (line 445), which can push the realized value above 0.50.
 *   With Math.random stubbed to 0.5 the jitter resolves to 0 and the bound is
 *   exact. We assert with that stub (deterministic) AND run a 30-iteration
 *   varied-seed sweep that allows for the +/-0.075 jitter.
 *
 * Role-based switch (conductor.ts:401-428): The switch handles roles
 *   `Exposition / Development / Contrast / Build / Climax / Recapitulation /
 *   Resolution`, but `form-analysis.ts:analyzeForm` only ever assigns
 *   `Main Theme / Theme B / Bridge / Variation / Refrain / Build / Peak /
 *   Intro / Outro`. The only intersection is `Build`. We use `conductor.form
 *   = null` (the production code-path that actually happens for nearly every
 *   chart) so the test exercises `getSectionEnergy(label)` instead of the
 *   never-reached cases. See `Findings discovered` in the test report.
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
import { checkSectionTransition } from '../../public/engine/conductor.js';
import { ACTIONS } from '../../public/types.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

vi.mock('../../public/ui.js', () => ({
    triggerFlash: vi.fn(),
}));

vi.mock('../../public/persistence.js', () => ({
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
            creativity: false,
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
 * `randomImpl` is the Math.random replacement. The macro-arc has a
 * Math.random()*0.15 - 0.075 jitter at line 445; the procedural-fill template
 * picker at fills.ts:266 also calls Math.random(). Both share this stub.
 */
function runTransitionAtProgress(
    progress: number,
    opts: { randomImpl?: () => number; mockState?: any } = {},
): {
    dispatched: Array<{ type: string; payload: any }>;
    targetIntensity: number | undefined;
} {
    const mockState = opts.mockState ?? makeMockState();
    const dispatched: Array<{ type: string; payload: any }> = [];
    const dispatch = (type: string, payload: any) => {
        dispatched.push({ type, payload });
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
    // With Math.random stubbed to 0.5 the +/-0.075 jitter resolves to exactly
    // 0 (`0.5 * 0.15 - 0.075 = 0`), so we can assert the EXACT macro-clamp
    // value rather than a range. This is deliberate — for the deterministic
    // shape test the goal is "the ladder is wired" and exact values are the
    // tightest possible guard. The varied-seed sweep below asserts the same
    // claims under realistic jitter.
    // ---------------------------------------------------------------------
    describe('session-timer macro-arc (Math.random stubbed = 0.5)', () => {
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
            it(`${phase} -> targetIntensity == ${expected}`, () => {
                const { targetIntensity } = runTransitionAtProgress(progress);
                expect(targetIntensity).toBeCloseTo(expected, 5);
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
        // With Math.random stubbed to 0.5 the jitter is exactly 0 -> 0.50.
        // The audit says "< 0.5"; the engine's macroCeiling IS 0.5 so the
        // realized target is <= 0.5 (with possible +0.075 jitter excursion
        // under noise). We assert <= 0.5 deterministically and document the
        // looser bound in the varied-seed sweep.
        it('audit claim: target <= 0.5 in final 15% (deterministic, no jitter)', () => {
            const { targetIntensity } = runTransitionAtProgress(0.95);
            // why 0.5: macroCeiling for the p>=0.85 window. The audit-doc
            // "< 0.5" cannot hold exactly because the engine clamps AT the
            // ceiling, not strictly below it. We assert <=, matching engine
            // reality. The varied-seed sweep below catches the jitter
            // contribution (target can rise to ~0.575 under noise).
            expect(targetIntensity).toBeLessThanOrEqual(0.5);
        });

        // Direction guard: climax window is strictly higher than cool-down.
        // This catches a swap-the-ladder-rows regression that point-checks
        // alone could miss.
        it('climax target > cool-down target (arc-direction guard)', () => {
            const climax = runTransitionAtProgress(0.75).targetIntensity ?? 0;
            const coolDown = runTransitionAtProgress(0.95).targetIntensity ?? 0;
            expect(climax).toBeGreaterThan(coolDown);
            // Headroom: climax-deterministic is 0.9, cool-down 0.5 -> gap 0.4.
            // Under jitter both move +/-0.075 so worst-case gap is 0.25.
            // Threshold 0.20 with 0.05 cushion below worst-case.
            expect(climax - coolDown).toBeGreaterThanOrEqual(0.2);
        });
    });

    // ---------------------------------------------------------------------
    // 2. Varied-seed reliability sweep — 30 distinct mulberry32 seeds across
    //    the macro-arc claims. Targets must hold across the engine's natural
    //    jitter envelope, not just at the convenient 0.5 stub.
    //
    //    The jitter adds Math.random()*0.15 - 0.075, range [-0.075, +0.075]:
    //      warmup    p=0.10: 0.45 +/- 0.075 -> [0.375, 0.525]
    //      climax    p=0.75: 0.90 +/- 0.075 -> [0.825, 0.975]
    //      cool-down p=0.95: 0.50 +/- 0.075 -> [0.425, 0.575]
    //
    //    Reliability target: each seed-claim pair must hold for ALL 30 seeds.
    //    Reported in console as "X/30 passes" so a regression that shrinks the
    //    envelope shows up as a partial fail rather than a binary pass/fail.
    // ---------------------------------------------------------------------
    describe('varied-seed reliability sweep (30 mulberry32 seeds)', () => {
        const SEEDS = Array.from({ length: 30 }, (_, i) => 0xc0ffee + i * 0x101);

        it('climax window: target > 0.7 across 30 seeds', () => {
            let passes = 0;
            const samples: number[] = [];
            for (const seed of SEEDS) {
                const prng = makeMulberry32(seed);
                const { targetIntensity } = runTransitionAtProgress(0.75, {
                    randomImpl: prng,
                });
                samples.push(targetIntensity ?? 0);
                if ((targetIntensity ?? 0) > 0.7) {
                    passes++;
                }
            }
            console.log('\n--- CONDUCTOR ARC CRITIQUE — CLIMAX SWEEP ---');
            console.log(`[Seeds]              30 (mulberry32)`);
            console.log(`[Target window]      progress 0.75 (climax: macro [0.7, 1.0])`);
            console.log(`[Assertion]          targetIntensity > 0.7`);
            console.log(`[Passes]             ${passes}/30`);
            console.log(
                `[Sample mean]        ${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3)}`,
            );
            console.log(
                `[Sample min/max]     ${Math.min(...samples).toFixed(3)} / ${Math.max(...samples).toFixed(3)}`,
            );
            console.log('--------------------------------------------\n');

            // Engine reality: with macroCeiling=1.0 and Chorus-label clamp
            // landing at 0.9, the +/-0.075 jitter gives samples in [0.825,
            // 0.975] — all above 0.7. 30/30 is the bar.
            expect(passes).toBeGreaterThanOrEqual(30);
        });

        it('cool-down window: target < 0.6 across 30 seeds', () => {
            let passes = 0;
            const samples: number[] = [];
            for (const seed of SEEDS) {
                const prng = makeMulberry32(seed);
                const { targetIntensity } = runTransitionAtProgress(0.95, {
                    randomImpl: prng,
                });
                samples.push(targetIntensity ?? 0);
                if ((targetIntensity ?? 0) < 0.6) {
                    passes++;
                }
            }
            console.log('\n--- CONDUCTOR ARC CRITIQUE — COOL-DOWN SWEEP ---');
            console.log(`[Seeds]              30 (mulberry32)`);
            console.log(`[Target window]      progress 0.95 (cool-down: macro [0.2, 0.5])`);
            console.log(`[Assertion]          targetIntensity < 0.6`);
            console.log(`[Audit-doc claim]    "drops < 0.5 in final 15%"`);
            console.log(
                `[Engine reality]     clamps at ceiling 0.5; +/-0.075 jitter -> [0.425, 0.575]`,
            );
            console.log(`[Passes]             ${passes}/30`);
            console.log(
                `[Sample mean]        ${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3)}`,
            );
            console.log(
                `[Sample min/max]     ${Math.min(...samples).toFixed(3)} / ${Math.max(...samples).toFixed(3)}`,
            );
            console.log('-------------------------------------------------\n');

            // Engine reality: max realized value is 0.5 + 0.075 = 0.575 (with
            // Chorus-label clamp at ceiling 0.5). 0.6 with 0.025 cushion above
            // the engine's worst-case sample.
            expect(passes).toBeGreaterThanOrEqual(30);
        });

        it('arc-direction: climax > cool-down for every seed', () => {
            let passes = 0;
            const deltas: number[] = [];
            for (const seed of SEEDS) {
                // Same seed for both calls -> the jitter-add inside each call
                // consumes one prng() value, so the *jitter* applied to climax
                // and cool-down are different draws — exactly the comparison
                // a listener would make across the actual session arc.
                const prngClimax = makeMulberry32(seed);
                const prngCool = makeMulberry32(seed);
                const climax =
                    runTransitionAtProgress(0.75, { randomImpl: prngClimax }).targetIntensity ?? 0;
                const coolDown =
                    runTransitionAtProgress(0.95, { randomImpl: prngCool }).targetIntensity ?? 0;
                deltas.push(climax - coolDown);
                if (climax > coolDown) {
                    passes++;
                }
            }
            console.log('\n--- CONDUCTOR ARC CRITIQUE — DIRECTION SWEEP ---');
            console.log(`[Seeds]              30 (mulberry32)`);
            console.log(`[Assertion]          climax > cool-down for every seed`);
            console.log(`[Passes]             ${passes}/30`);
            console.log(
                `[Delta mean]         ${(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(3)}`,
            );
            console.log(
                `[Delta min/max]      ${Math.min(...deltas).toFixed(3)} / ${Math.max(...deltas).toFixed(3)}`,
            );
            console.log('-------------------------------------------------\n');

            // Engine reality: climax in [0.825, 0.975], cool-down in [0.425,
            // 0.575] -> delta in [0.25, 0.55]. Always positive, never below 0.25.
            expect(passes).toBeGreaterThanOrEqual(30);
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
    // 4. Section-boundary crash — the conductor signals `crash: true` on
    //    the procedural-fallback transition fill (conductor.ts:478).
    //
    //    Audit-doc claim: "verify a crash cymbal is part of the transition
    //    fill where the conductor signals one."
    //    Engine reality: the procedural-fallback path hard-codes `crash:
    //    true` regardless of genre/intensity. This test pins that invariant.
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
            const mockState = makeMockState();
            const dispatched: Array<{ type: string; payload: any }> = [];
            const dispatch = (type: string, payload: any) => {
                dispatched.push({ type, payload });
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
});
