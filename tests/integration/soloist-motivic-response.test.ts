// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
    buildHookAuditArrangement,
    buildSeedSweep,
    buildSeedSweepSummary,
} from '../../scripts/soloist-analysis-utils.js';

const FIXED_HEAD_SEEDS = ['HEAD_AUDIT', 'HEAD_B', 'HEAD_C', 'HEAD_D', 'HEAD_E', 'HEAD_F'];
const FIXED_NEO_SEEDS = ['HEAD_AUDIT', 'HEAD_B', 'HEAD_C'];

function buildMotivicSummary(genre, arrangement, seeds = FIXED_HEAD_SEEDS) {
    return buildSeedSweepSummary(
        buildSeedSweep({
            arrangement,
            genre,
            bpm: 102,
            intensity: 0.5,
            timeSignature: arrangement.timeSignature,
            style: 'smart',
            seeds,
            loops: 4,
        }),
    );
}

function buildSingleSeedMotivicRow(genre, arrangement, seed = 'HEAD_AUDIT') {
    return buildSeedSweep({
        arrangement,
        genre,
        bpm: 102,
        intensity: 0.5,
        timeSignature: arrangement.timeSignature,
        style: 'smart',
        seeds: [seed],
        loops: 4,
    })[0];
}

describe('Soloist Motivic Response', () => {
    it('keeps later-loop paraphrases recognizable across core hook styles', () => {
        const arrangement = buildHookAuditArrangement('4/4');
        const jazz = buildMotivicSummary('Jazz', arrangement);
        const blues = buildMotivicSummary('Blues', arrangement);
        const rock = buildMotivicSummary('Rock', arrangement);
        const neo = buildMotivicSummary('Neo-Soul', arrangement, FIXED_NEO_SEEDS);
        // why: the soloist has no per-genre branch on Bossa Nova specifically;
        // this row exercises the genre-agnostic motivic-response metrics under
        // a Bossa-shaped RNG-stream alignment (different from Jazz/Blues/Rock
        // by virtue of `chord: 'jazz'` + `bass: 'bossa'` smart-genre routing
        // shifting downstream draw counts). Not a "Bossa-specific behavior"
        // assertion — see the §G.16 canonicalization commit for context.
        const bossa = buildMotivicSummary('Bossa Nova', arrangement, FIXED_NEO_SEEDS);

        // why (S7a re-baseline): Epic 11 S7a swapped the soloist's uniform device
        // pick for a rank-weighted one (`pickByRank`). That changes WHICH device
        // fires, and different device bodies consume different counts of internal
        // `Math.random()` draws — so the seeded analysis stream realigns and every
        // RNG-gated downstream path lands differently (notably blues' 60%-gated
        // `bluesTurnaround`). The musical behavior is correct; three thresholds
        // below are lowered to the post-S7a measured values (deterministic, FIXED
        // seeds). This is a measurement realignment, not a behavior regression —
        // same class as S10's Neo-Soul `richContourShare` artifact.
        expect(jazz.aggregate.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.62);
        expect(jazz.aggregate.laterLoopRhythmReuseShare).toBeGreaterThanOrEqual(0.6);
        expect(jazz.aggregate.laterLoopCadenceStability).toBeGreaterThanOrEqual(0.58);
        expect(jazz.aggregate.laterLoopAnchorExactRate).toBeGreaterThanOrEqual(0.75);
        expect(jazz.aggregate.laterLoopTripletCarryShare).toBeGreaterThanOrEqual(0.35);
        expect(jazz.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThanOrEqual(0.68);
        expect(jazz.aggregate.laterLoopSectionRhythmRecallShare).toBeGreaterThanOrEqual(0.65);
        // S7a re-baseline: 0.72 → 0.70 (measured 0.7083). See the block note above.
        expect(jazz.aggregate.laterLoopSectionCadenceStability).toBeGreaterThanOrEqual(0.7);
        expect(jazz.aggregate.laterLoopFormResponseShare).toBeGreaterThanOrEqual(0.08);

        expect(blues.aggregate.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.5);
        expect(blues.aggregate.loop1AnchorExactRate).toBeGreaterThanOrEqual(0.7);
        expect(blues.aggregate.laterLoopCadenceStability).toBeGreaterThanOrEqual(0.45);
        // S7a re-baseline: 0.78 → 0.65 (measured 0.6875). Blues is the most
        // stream-sensitive genre here — its anchor exactness is dominated by the
        // 60%-gated `bluesTurnaround` substitution, so the S7a stream realignment
        // moves this metric most. See the block note above.
        expect(blues.aggregate.laterLoopAnchorExactRate).toBeGreaterThanOrEqual(0.65);
        expect(blues.aggregate.laterLoopTripletCarryShare).toBeGreaterThanOrEqual(0.45);
        expect(blues.aggregate.laterLoopFormResponseShare).toBeGreaterThanOrEqual(0.08);

        // why (#592 re-baseline): the Rock GENRE in smart mode now resolves to the
        // tailored 'rock' profile (bends/double-stops/pentatonic), not 'shred'.
        // Different device bodies consume different `Math.random()` draw counts, so
        // these FIXED-seed motivic metrics realign — same class as the S7a note
        // above. The recognizability property STRENGTHENS (laterLoopAnchorExactRate
        // measures a perfect 1.0); the 'rock' profile simply paraphrases its rhythm
        // more freely in loop 1 (the Conversational loop). Floors lowered to the
        // measured 'rock'-profile values. NOTE: the loop-1 rhythm-reuse drop
        // (0.67→0.41) is a genuine character shift flagged for the Rock listen.
        expect(rock.aggregate.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.38); // measured 0.408
        expect(rock.aggregate.loop1ContourEchoShare).toBeGreaterThanOrEqual(0.17); // measured 0.186
        expect(rock.aggregate.laterLoopAnchorExactRate).toBeGreaterThanOrEqual(0.95); // measured 1.0
        expect(rock.aggregate.laterLoopTripletCarryShare).toBe(0);
        expect(rock.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThanOrEqual(0.78); // measured 0.906
        expect(rock.aggregate.laterLoopSectionRhythmRecallShare).toBeGreaterThanOrEqual(0.62); // measured 0.675
        expect(rock.aggregate.laterLoopFormResponseShare).toBe(0);

        expect(neo.aggregate.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.35);
        expect(neo.aggregate.loop1RhythmReuseShare).toBeLessThanOrEqual(0.6);
        expect(neo.aggregate.laterLoopCadenceStability).toBeGreaterThanOrEqual(0.6);
        expect(neo.aggregate.laterLoopRhythmReuseShare).toBeLessThan(
            jazz.aggregate.laterLoopRhythmReuseShare,
        );
        expect(neo.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThanOrEqual(0.85);
        expect(neo.aggregate.laterLoopSectionRhythmRecallShare).toBeGreaterThanOrEqual(0.75);
        expect(neo.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThan(
            neo.aggregate.loop1RhythmReuseShare + 0.25,
        );
        expect(neo.aggregate.laterLoopFormResponseShare).toBeGreaterThanOrEqual(0.04);

        expect(bossa.aggregate.loop1RhythmReuseShare).toBeLessThanOrEqual(0.5);
        expect(bossa.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThanOrEqual(0.72);
        // S7a re-baseline: 0.75 → 0.72 (measured 0.7418). See the block note above.
        expect(bossa.aggregate.laterLoopSectionRhythmRecallShare).toBeGreaterThanOrEqual(0.72);
        expect(bossa.aggregate.laterLoopSectionCadenceStability).toBeGreaterThanOrEqual(0.65);
        expect(bossa.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThan(
            bossa.aggregate.loop1RhythmReuseShare + 0.2,
        );
        expect(bossa.aggregate.laterLoopFormResponseShare).toBeGreaterThanOrEqual(0.04);
    }, 45_000);

    it('keeps the audit head seed anchored and triplet-aware on later loops', () => {
        const arrangement = buildHookAuditArrangement('4/4');
        const jazz = buildSingleSeedMotivicRow('Jazz', arrangement);
        const blues = buildSingleSeedMotivicRow('Blues', arrangement);
        const rock = buildSingleSeedMotivicRow('Rock', arrangement);

        expect(jazz).toBeDefined();
        expect(blues).toBeDefined();
        expect(rock).toBeDefined();

        expect(jazz?.loop1AnchorExactRate).toBeGreaterThanOrEqual(0.75);
        expect(jazz?.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.58);
        expect(jazz?.laterLoopTripletCarryShare).toBeGreaterThanOrEqual(0.8);

        expect(blues?.loop1AnchorExactRate).toBeGreaterThanOrEqual(0.75);
        expect(blues?.loop1CadenceStability).toBeGreaterThanOrEqual(0.55);
        expect(blues?.laterLoopTripletCarryShare).toBeGreaterThanOrEqual(0.8);

        expect(rock?.loop1AnchorExactRate).toBeGreaterThanOrEqual(0.95);
        // #592 re-baseline (see aggregate block above): smart Rock → 'rock'
        // profile paraphrases loop-1 rhythm more freely. Measured 0.315.
        expect(rock?.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.28);
        expect(rock?.laterLoopTripletCarryShare).toBe(0);
    }, 30_000);
});
