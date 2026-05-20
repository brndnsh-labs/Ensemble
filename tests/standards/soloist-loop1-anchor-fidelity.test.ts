// @ts-nocheck
/**
 * Soloist Loop-1 Anchor Fidelity — TURNAROUND CARRYOVER GUARD (Epic 11 S10)
 *
 * A blues turnaround is a cadential setup gesture: a 16-step `deviceBuffer`
 * (soloist-devices.ts, `bluesTurnaround`) that resolves V-IV-I INTO the
 * next chorus's downbeat. The defect S10 closes: when that turnaround
 * fired near the end of loop 0, its tail was still queued when loop 1
 * began, and `getSoloistNote` drains `deviceBuffer` at the top of the
 * function — BEFORE the head-bypass path runs. The stale tail then
 * clobbered the loop-1 step-0 head anchor with a leftover turnaround
 * pitch, and a long device note drained on the step before the anchor
 * left `busySteps > 0`, silencing the anchor entirely.
 *
 * Musically a turnaround must never bleed PAST the chorus boundary it is
 * setting up. The S10 fix discards any carried device/embellishment
 * buffer (and clears the residual `busySteps`) when the current step is a
 * loop-1 head anchor, so the head's opening anchor wins outright.
 *
 * Why this test is STREAM-INDEPENDENT — and why that matters:
 *
 *   The bug was an *alignment* artifact: it only bit when the turnaround
 *   happened to land such that its tail crossed step 0 of loop 1. A test
 *   that pinned a single RNG stream could pass purely because that one
 *   stream never produced an overrunning turnaround — a coincidence, not
 *   a guarantee.
 *
 *   Instead this sweep runs the REAL soloist over a 4-loop performance
 *   for SIX distinct head seeds (`HEAD_AUDIT`..`HEAD_F`). Each seed
 *   produces a different head melody AND a different generative RNG
 *   stream, so the turnaround device fires at different phrase positions
 *   across the set — different carryover offsets relative to the loop
 *   boundary. The acceptance assertion is per-seed: EVERY seed's loop-1
 *   head anchors must emit their exact seed pitch. A guarantee holds for
 *   all streams; an alignment coincidence would fail at least one.
 *
 * Genre is Blues — the style that emits `bluesTurnaround` most readily,
 * so this is the worst case for turnaround carryover.
 *
 * Source: soloist.md (loop-1 anchor fidelity); docs/audit/epic-11 S10.
 */
import { describe, expect, it } from 'vitest';
import { buildHookAuditArrangement, buildSeedSweep } from '../../scripts/soloist-analysis-utils.js';

// Six fixed head seeds — each one a distinct head melody and a distinct
// generative RNG stream. The turnaround device lands at different phrase
// positions across the set, exercising a spread of carryover offsets.
const HEAD_SEEDS = ['HEAD_AUDIT', 'HEAD_B', 'HEAD_C', 'HEAD_D', 'HEAD_E', 'HEAD_F'];

function sweepBlues(arrangement) {
    return buildSeedSweep({
        arrangement,
        genre: 'Blues',
        bpm: 102,
        intensity: 0.5,
        timeSignature: arrangement.timeSignature,
        style: 'smart',
        seeds: HEAD_SEEDS,
        loops: 4,
    });
}

describe('Soloist Loop-1 Anchor Fidelity (Epic 11 S10)', () => {
    it('loop-1 head anchors emit exact head pitch for every seed, independent of RNG-stream position', () => {
        const arrangement = buildHookAuditArrangement('4/4');
        const rows = sweepBlues(arrangement);

        expect(rows.length).toBe(HEAD_SEEDS.length);

        const perSeed = rows.map((row) => ({
            seed: row.seed,
            loop1AnchorExactRate: row.loop1AnchorExactRate || 0,
        }));
        const minRate = Math.min(...perSeed.map((r) => r.loop1AnchorExactRate));
        const meanRate =
            perSeed.reduce((sum, r) => sum + r.loop1AnchorExactRate, 0) / perSeed.length;

        console.log('\n--- SOLOIST LOOP-1 ANCHOR FIDELITY (turnaround carryover) ---');
        for (const r of perSeed) {
            console.log(
                `[${r.seed.padEnd(11)}] loop-1 anchor exact ${(r.loop1AnchorExactRate * 100).toFixed(1)}%`,
            );
        }
        console.log(
            `[Aggregate]   min ${(minRate * 100).toFixed(1)}%  mean ${(meanRate * 100).toFixed(1)}%`,
        );
        console.log('-------------------------------------------------------------\n');

        // Per-seed guarantee — NOT an aggregate. The carryover bug was an
        // alignment artifact, so a coincidence would manifest as a single
        // failing seed while the mean still looked healthy. Each of the six
        // distinct head/RNG streams must independently keep its loop-1
        // anchors exact.
        //
        // The assertion is EQUALITY (rate === 1), not a statistical floor.
        // `loop1AnchorExactRate` is computed over anchor notes ONLY
        // (soloist-analysis-utils.ts — `anchorNotes = filter(n => n.isAnchor)`),
        // so the non-anchor paraphrase jitter cannot move it. With the hard
        // `deviceBaseProb = 0` kill, the turnaround-substitution suppression,
        // and the carryover-buffer guard all in place, a loop-1 anchor
        // emitting anything but its exact head pitch is now categorically
        // impossible — so the test asserts the guarantee, not a tendency.
        // This is not a forbidden rigid snapshot on generative output: only
        // the anchor skeleton is pinned; the non-anchor melody is still free
        // to vary loop-to-loop.
        for (const r of perSeed) {
            expect(
                r.loop1AnchorExactRate,
                `seed ${r.seed} loop-1 anchors not exact — turnaround tail likely clobbered an anchor`,
            ).toBe(1);
        }

        // Restated explicitly as the stream-independence claim: the worst
        // seed in the sweep is also a full guarantee, not a coincidence.
        expect(minRate).toBe(1);
    }, 45_000);
});
