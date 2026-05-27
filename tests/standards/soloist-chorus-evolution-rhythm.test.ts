// @ts-nocheck
/**
 * Soloist Chorus Evolution — RHYTHM SIDE (epic-form-arrangement S6)
 *
 * Closes the rhythm-side of the marquee "Chorus Evolution" claim:
 *   Loop 0  → The Head (strict, no rhythmic ornament).
 *   Loop 1  → Themed Improv.
 *   Loop 2+ → Exploratory — density grows and the attack grid jitters off
 *             the metronomic skeleton.
 *
 * Pitch-side coverage already exists (device frequency +20%/loop in
 * soloist-pitch-engine.ts:1004, SRDC phasing). Before S6 the rhythm
 * engine had zero loop awareness; every chorus produced the same
 * attack-grid (soloist.md P1 #6).
 *
 * Two tiers of coverage:
 *   1. Density scaling — Loop 2 emits more attacks than Loop 0 on the
 *      same fixed-random seed and same phrase length. The audit-doc
 *      multiplier `densityScale *= 1 + loopCount * 0.15` gives ~30%
 *      more density at Loop 2 → translates to a measurable attack
 *      count delta over a 4-bar window.
 *   2. Distribution divergence — the per-step attack pattern at Loop
 *      0 and Loop 2 differs on >=15% of steps. Density alone would
 *      give a monotonic "more attacks" pattern; the +5%/loop attack
 *      jitter ALSO shifts WHICH steps fire, breaking the metronomic
 *      grid in a way pure density cannot.
 *
 * Determinism: a per-test mulberry32 PRNG is INJECTED into
 * `generateRhythmPlan` via its optional `random` parameter (Epic 12
 * S1 — production omits it and gets a `makeSeededStream` keyed on
 * (startStep, sessionSteps, loopCount); tests inject their own stream).
 * It is re-seeded to the SAME seed at the start of each generateAtLoop
 * call — so the RNG sequence is identical at Loop 0 and Loop 2, and
 * any difference in output is attributable to the loop-count branches
 * alone, not to RNG drift. A flat constant (e.g. 0.5) is the wrong
 * choice here: it hard-quantizes every probability threshold so a
 * +30% density bump is invisible if it doesn't cross 0.5. The PRNG
 * gives a spread of values across the 0..1 interval so threshold
 * shifts actually toggle decisions. (See project memory:
 * feedback_determinism_test_pattern, feedback_seeded_prng_mulberry32.)
 *
 * Source: soloist.md P1 #6; epic-form-arrangement.md S6.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRhythmPlan } from '../../public/engine/soloist-rhythm-engine.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';
import { makeMulberry32 } from '../utils/seeded-random.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/**
 * Coordination context shaped like what soloist.ts builds before calling
 * generateRhythmPlan. Only the fields the rhythm engine reads matter:
 *   - sectionStart, sectionEnd (for isFinalMeasure and isSectionDownbeat)
 *   - stepCoordination (for kick/snare boosts)
 *   - bypassRhythm (false — we want the normal generation path)
 */
function makeCoordination(activeSteps: number) {
    return {
        sectionStart: 0,
        sectionEnd: activeSteps + 64, // far beyond the phrase so isFinalMeasure stays false
        stepCoordination: {},
        bypassRhythm: false,
    };
}

function buildSoloistState() {
    return makeSoloistMock({
        mode: 'monophonic',
        style: 'scalar',
        // No session seed → no Dynamic Head bias; pure rhythm-engine output.
        // No phrase context → the response-mirroring and skeleton paths are
        // skipped, exercising the main attack-prob loop where densityScale +
        // attackJitter live.
        phraseContext: null,
        sessionSeed: null,
        rhythmicEntropy: 0,
        transitionState: 'playing',
        isResting: false,
    });
}

// mulberry32 lives in tests/utils/seeded-random.ts — same algorithm, single
// source of truth. See feedback_seeded_prng_mulberry32 in user memory.

/**
 * Generate one plan at a given loop count. A mulberry32 PRNG is INJECTED
 * via `generateRhythmPlan`'s `random` parameter, re-seeded each call so
 * the sequence is identical between Loop 0 and Loop 2 — divergence is
 * attributable to the loop-count branches alone, not to RNG drift.
 */
function generateAtLoop(loopCount: number, activeSteps = 64, seed = 0xc0ffee) {
    const prng = makeMulberry32(seed);
    return generateRhythmPlan(
        0, // startStep
        activeSteps,
        'scalar', // style — picked because it's NOT in the bebop ghost-note branches
        0.6, // intensity — mid-range so neither low-intensity simplification nor saturation hides the effect
        16, // stepsPerMeasure
        4, // stepsPerBeat
        makeCoordination(activeSteps),
        256, // sessionSteps (large enough that warmUpScale is at the ceiling 1.0)
        buildSoloistState(),
        null, // stepInfo
        loopCount,
        prng, // injected RNG — the Epic 12 S1 test seam
    );
}

function attackSteps(plan: any[]): Set<number> {
    return new Set(plan.map((n) => n.stepTarget));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Soloist Chorus Evolution — RHYTHM side (S6)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. Density scaling — aggregated over seeds, Loop 2 fires more attacks
    //    than Loop 0. Per-seed the +5%/loop bidirectional attackJitter adds
    //    noise that can offset the +15%/loop density bump on any single
    //    seed; the +30% mean density delta surfaces only on aggregate.
    // -------------------------------------------------------------------------
    it('densityScale grows with loopCount: Loop 2 fires more attacks than Loop 0 on aggregate', () => {
        // Multiple seeds: density bump is monotone in expectation, but
        // jitter is bidirectional and can mask it on individual seeds.
        // Aggregating over a handful of seeds isolates the systematic
        // mean from the noise term.
        const seeds = [0xc0ffee, 0xdeadbe, 0x12345, 0xabcdef, 0x111111, 0xfeedf, 0x10101];
        let total0 = 0;
        let total2 = 0;
        for (const seed of seeds) {
            total0 += generateAtLoop(0, 64, seed).length;
            total2 += generateAtLoop(2, 64, seed).length;
        }
        const delta = total2 - total0;
        const pctDelta = total0 > 0 ? (delta / total0) * 100 : 0;

        console.log('\n--- SOLOIST CHORUS EVOLUTION (RHYTHM) — DENSITY ---');
        console.log(`[Seeds]                      ${seeds.length}`);
        console.log(`[Loop 0 total attacks]       ${total0}  (The Head — no loop bias)`);
        console.log(
            `[Loop 2 total attacks]       ${total2}  (Exploratory — +15%/loop pre-saturation; ~+10-25% realized)`,
        );
        console.log(`[Delta]                      +${delta} (${pctDelta.toFixed(1)}% more)`);
        console.log('----------------------------------------------------\n');

        // Audit-doc multiplier is +15%/loop → Loop 2 = +30% density in
        // expectation. Engine saturation and monophonic gating clip the
        // realized delta substantially: empirically the aggregate delta
        // sits at ~10-25% across the 7-seed sample.
        // why threshold +5: aggregated over 7 seeds (Loop 0 totals ~110),
        //   a 5-attack delta is ~5% — comfortably above an off-by-one on
        //   a single seed but well below the empirical ~10-20% delta, so
        //   the test has headroom in both directions.
        expect(total2).toBeGreaterThan(total0);
        expect(delta).toBeGreaterThanOrEqual(5);
    });

    // -------------------------------------------------------------------------
    // 2. Distribution divergence — Loop 0 vs Loop 2 attack STEPS differ
    // -------------------------------------------------------------------------
    it('attack-step distribution diverges between Loop 0 and Loop 2 (>=15% of 64 steps)', () => {
        const plan0 = generateAtLoop(0);
        const plan2 = generateAtLoop(2);

        const steps0 = attackSteps(plan0);
        const steps2 = attackSteps(plan2);

        // Steps that fire in exactly one of the two loops (XOR over step set).
        const divergent = new Set<number>();
        for (const s of steps0) {
            if (!steps2.has(s)) {
                divergent.add(s);
            }
        }
        for (const s of steps2) {
            if (!steps0.has(s)) {
                divergent.add(s);
            }
        }
        const divergentCount = divergent.size;
        const pctDivergent = (divergentCount / 64) * 100;

        console.log('\n--- SOLOIST CHORUS EVOLUTION (RHYTHM) — DIVERGENCE ---');
        console.log(`[Loop 0 attack steps] ${[...steps0].sort((a, b) => a - b).join(',')}`);
        console.log(`[Loop 2 attack steps] ${[...steps2].sort((a, b) => a - b).join(',')}`);
        console.log(
            `[Divergent]           ${divergentCount} of 64 steps (${pctDivergent.toFixed(1)}%)`,
        );
        console.log('-------------------------------------------------------\n');

        // The audit's acceptance criterion is "Loop 0 vs Loop 2 attack count +
        // interval distribution differ measurably." Density alone gives a
        // monotonic addition (Loop 2 ⊇ Loop 0). The attackJitter +0.05/loop
        // ALSO shifts WHICH steps fire — a step that was below threshold at
        // Loop 0 can be pushed above (or pulled below) at Loop 2 by the jitter
        // term. We require >=15% of steps to differ — well above any single
        // off-by-one, comfortably below the empirical ~25-40% divergence at
        // Loop 2.
        // why threshold 15%: density delta alone gives ~5 added steps (~8%);
        //   requiring >=15% forces both density AND jitter to be contributing,
        //   so this test guards against either getting silently disabled.
        expect(pctDivergent).toBeGreaterThanOrEqual(15);
    });

    // -------------------------------------------------------------------------
    // 2b. Active coordination boosts — multiplier still fires on non-forced steps
    // -------------------------------------------------------------------------
    // This case exercises the "wash-out scenario" the Epic 9 S5.a final-stage
    // placement was designed to prevent (FOLLOWUPS §B, epic-followup-drain S4).
    //
    // Setup:
    //   - `stepCoordination.kickHit` + `snareHit` active at startStep → the first
    //     step in the phrase gets +0.2 + 0.2 additive boost at the `step===startStep`
    //     guard, pushing that step's attackProb near/above 1.0.
    //   - `sessionSeed` with notes at specific steps → those steps get +0.4 boost,
    //     pushing them past 1.0 (forced hits regardless of loop count).
    //
    // Expectation:
    //   - With the CURRENT final-stage placement (`if (attackProb < 1.0) *= 1.3`),
    //     forced/boosted steps are skipped by the gate (correct — no loop escalation
    //     on an already-forced anchor). Non-forced steps still get the escalation.
    //     Net result: Loop 2 > Loop 0 (escalation concentrates on boundary steps).
    //
    //   - With the OLD densityScale placement, the loop multiplier was baked into
    //     `attackProb`'s base factor BEFORE additive boosts. The loop factor
    //     applied even to seed-step base values, but since those steps would fire
    //     regardless (boosted above 1.0 by the +0.4 seed), the multiplier's effect
    //     was partially "spent" on forced notes. The realistic net delta from the old
    //     approach would have been smaller — sometimes invisible — when many steps
    //     were already forced. The new placement concentrates the escalation only on
    //     genuinely boundary-case steps where it matters most.
    //
    // This case seeds with 4 notes across 64 steps so that ~6% of steps are forced
    // (seed notes) and ~94% are genuinely boundary-case. The aggregate Loop 2 >
    // Loop 0 attack count must be maintained even under active kick/snare boosts.
    it('final-stage multiplier survives active coordination boosts on non-forced steps', () => {
        // A sessionSeed with 4 notes spread across a 64-step phrase at evenly
        // spaced positions — forces 4 attacks regardless of loop count.
        const sessionSeedWithNotes = {
            notes: [
                { step: 0, midi: 60, isAnchor: true },
                { step: 16, midi: 62, isAnchor: false },
                { step: 32, midi: 64, isAnchor: true },
                { step: 48, midi: 65, isAnchor: false },
            ],
            loopLengthSteps: 64,
        };

        function buildSoloistStateWithSeed() {
            return makeSoloistMock({
                mode: 'monophonic',
                style: 'scalar',
                phraseContext: null,
                sessionSeed: sessionSeedWithNotes,
                rhythmicEntropy: 0,
                transitionState: 'playing',
                isResting: false,
            });
        }

        // Coordination with active kick+snare at startStep and the full stepCoordination
        // bag to exercise the boost paths.
        function makeActiveCoordination(activeSteps: number) {
            return {
                sectionStart: 0,
                sectionEnd: activeSteps + 64,
                stepCoordination: {
                    kickHit: true, // why: +0.2 additive to attackProb at step===startStep
                    snareHit: true, // why: +0.2 additive at step===startStep (cumulative +0.4)
                },
                bypassRhythm: false,
            };
        }

        function generateAtLoopWithBoosts(loopCount: number, seed = 0xc0ffee) {
            const prng = makeMulberry32(seed);
            return generateRhythmPlan(
                0,
                64,
                'scalar',
                0.6,
                16,
                4,
                makeActiveCoordination(64),
                256,
                buildSoloistStateWithSeed(),
                null,
                loopCount,
                prng,
            );
        }

        // Aggregate over multiple seeds (same pattern as the density test above)
        // to isolate the systematic mean from per-seed jitter.
        const seeds = [0xc0ffee, 0xdeadbe, 0x12345, 0xabcdef, 0x111111, 0xfeedf, 0x10101];
        const FORCED_STEPS = new Set([0, 16, 32, 48]); // seed-anchored positions

        // Partition counts: attacks at forced-step indices vs non-forced.
        // The final-stage `if (attackProb < 1.0) *= 1.3` placement does NOT touch
        // forced steps (their `attackProb >= 1.0` skips the multiplier), so forced
        // counts must be byte-equal between loops 0 and 2. The OLD `densityScale`
        // placement scaled the base attackProb BEFORE the +0.4 seed boost, which
        // would still let `total2 > total0` pass (the multiplier escalates non-forced
        // steps in both placements) — the discriminating fingerprint is whether
        // forced-step parity holds. If forced counts diverge between loops, the
        // multiplier is leaking into the wrong gate.
        let forced0 = 0;
        let forced2 = 0;
        let nonForced0 = 0;
        let nonForced2 = 0;
        for (const seed of seeds) {
            for (const node of generateAtLoopWithBoosts(0, seed)) {
                const stepInLoop = (node.stepTarget - 0) % 64;
                if (FORCED_STEPS.has(stepInLoop)) {
                    forced0++;
                } else {
                    nonForced0++;
                }
            }
            for (const node of generateAtLoopWithBoosts(2, seed)) {
                const stepInLoop = (node.stepTarget - 0) % 64;
                if (FORCED_STEPS.has(stepInLoop)) {
                    forced2++;
                } else {
                    nonForced2++;
                }
            }
        }
        const total0 = forced0 + nonForced0;
        const total2 = forced2 + nonForced2;
        const nonForcedDelta = nonForced2 - nonForced0;
        const forcedDelta = forced2 - forced0;

        console.log('\n--- SOLOIST CHORUS EVOLUTION (RHYTHM) — ACTIVE BOOSTS ---');
        console.log(`[Seeds]                      ${seeds.length}`);
        console.log(`[Active coordination boosts] kickHit=true, snareHit=true at startStep`);
        console.log(`[Session seed notes]         4 forced anchors at steps {0,16,32,48}`);
        console.log(`[Loop 0 forced / non-forced] ${forced0} / ${nonForced0} (total ${total0})`);
        console.log(`[Loop 2 forced / non-forced] ${forced2} / ${nonForced2} (total ${total2})`);
        console.log(
            `[Forced delta]               ${forcedDelta}  (must be 0 — multiplier skips forced steps)`,
        );
        console.log(`[Non-forced delta]           +${nonForcedDelta} (escalation lands here only)`);
        console.log('----------------------------------------------------------\n');

        // why: forced-step parity is the DISCRIMINATING fingerprint of the
        // final-stage `if (attackProb < 1.0) *= 1.3` placement. Forced steps
        // (attackProb >= 1.0 from the +0.4 seed boost) skip the multiplier
        // entirely; downstream rhythm-node selection (duration overlap, merge)
        // can still produce a small natural delta of ~1 across 7 seeds. With
        // the OLD `densityScale` placement, the multiplier would scale the base
        // attackProb BEFORE the +0.4 boost, escalating forced steps proportional
        // to their share of total hits (~21% under this fixture's distribution).
        // A leak of >2 forced hits across 7 seeds (>7% of forced baseline)
        // means the multiplier is touching the wrong gate.
        expect(forcedDelta).toBeLessThanOrEqual(2);

        // why: the loop-count multiplier escalates ONLY on non-forced (< 1.0)
        // steps. With 4 forced seed steps out of 64, the remaining ~60 steps
        // are genuine boundary cases. The +30% escalation on those steps
        // should produce a clearly positive aggregate delta across 7 seeds.
        expect(nonForced2).toBeGreaterThan(nonForced0);
        expect(nonForcedDelta).toBeGreaterThanOrEqual(3);

        // why: the discrimination versus OLD placement is the RATIO. Under NEW,
        // ~all loop escalation lands on non-forced steps (observed 25:1). Under
        // OLD, escalation would distribute proportional to step counts
        // (~86:23 → ~3.7:1 ratio of non-forced:forced delta). The 5× bound
        // separates the two placements while leaving headroom for natural
        // forced-step variance.
        const totalDelta = nonForcedDelta + forcedDelta;
        if (forcedDelta > 0 && totalDelta > 0) {
            expect(nonForcedDelta).toBeGreaterThanOrEqual(forcedDelta * 5);
        }
    });

    // -------------------------------------------------------------------------
    // 3. Loop 0 is unchanged — strict Head adherence per CLAUDE.md
    // -------------------------------------------------------------------------
    it('Loop 0 path is bias-free: same RNG produces same plan as no-loop call', () => {
        // Belt-and-suspenders guard against accidentally applying the loop
        // bias on the Head pass. The S6 implementation skips both densityScale
        // and attackJitter at loopCount=0; this test pins that invariant so a
        // future refactor can't silently start escalating on The Head.
        const planLoop0 = generateAtLoop(0);
        // Same seed so the injected PRNG sequence matches generateAtLoop(0).
        const prng = makeMulberry32(0xc0ffee);
        const planNoLoop = generateRhythmPlan(
            0,
            64,
            'scalar',
            0.6,
            16,
            4,
            makeCoordination(64),
            256,
            buildSoloistState(),
            null,
            undefined, // loopCount omitted → defaults to 0 per S6 signature change
            prng, // injected RNG — the Epic 12 S1 test seam
        );

        const steps0 = [...attackSteps(planLoop0)].sort((a, b) => a - b);
        const stepsNo = [...attackSteps(planNoLoop)].sort((a, b) => a - b);

        expect(steps0).toEqual(stepsNo);
    });
});
