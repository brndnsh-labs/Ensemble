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
        const bossa = buildMotivicSummary('Bossa', arrangement, FIXED_NEO_SEEDS);

        expect(jazz.aggregate.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.62);
        expect(jazz.aggregate.laterLoopRhythmReuseShare).toBeGreaterThanOrEqual(0.6);
        expect(jazz.aggregate.laterLoopCadenceStability).toBeGreaterThanOrEqual(0.58);
        expect(jazz.aggregate.laterLoopAnchorExactRate).toBeGreaterThanOrEqual(0.75);
        expect(jazz.aggregate.laterLoopTripletCarryShare).toBeGreaterThanOrEqual(0.35);
        expect(jazz.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThanOrEqual(0.68);
        expect(jazz.aggregate.laterLoopSectionRhythmRecallShare).toBeGreaterThanOrEqual(0.65);
        expect(jazz.aggregate.laterLoopSectionCadenceStability).toBeGreaterThanOrEqual(0.72);

        expect(blues.aggregate.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.5);
        expect(blues.aggregate.loop1AnchorExactRate).toBeGreaterThanOrEqual(0.7);
        expect(blues.aggregate.laterLoopCadenceStability).toBeGreaterThanOrEqual(0.45);
        expect(blues.aggregate.laterLoopAnchorExactRate).toBeGreaterThanOrEqual(0.78);
        expect(blues.aggregate.laterLoopTripletCarryShare).toBeGreaterThanOrEqual(0.45);

        expect(rock.aggregate.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.67);
        expect(rock.aggregate.loop1ContourEchoShare).toBeGreaterThanOrEqual(0.35);
        expect(rock.aggregate.laterLoopAnchorExactRate).toBeGreaterThanOrEqual(0.82);
        expect(rock.aggregate.laterLoopTripletCarryShare).toBe(0);
        expect(rock.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThanOrEqual(0.78);
        expect(rock.aggregate.laterLoopSectionRhythmRecallShare).toBeGreaterThanOrEqual(0.84);

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

        expect(bossa.aggregate.loop1RhythmReuseShare).toBeLessThanOrEqual(0.5);
        expect(bossa.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThanOrEqual(0.72);
        expect(bossa.aggregate.laterLoopSectionRhythmRecallShare).toBeGreaterThanOrEqual(0.75);
        expect(bossa.aggregate.laterLoopSectionCadenceStability).toBeGreaterThanOrEqual(0.65);
        expect(bossa.aggregate.loop1SectionRhythmRecallShare).toBeGreaterThan(
            bossa.aggregate.loop1RhythmReuseShare + 0.2,
        );
    }, 25_000);

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
        expect(rock?.loop1RhythmReuseShare).toBeGreaterThanOrEqual(0.5);
        expect(rock?.laterLoopTripletCarryShare).toBe(0);
    }, 15_000);
});
