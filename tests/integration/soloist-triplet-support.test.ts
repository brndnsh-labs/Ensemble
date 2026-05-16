// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
    buildAuditArrangement,
    buildHookAuditArrangement,
    buildSeedSweep,
    buildSeedSweepSummary,
} from '../../scripts/soloist-analysis-utils.js';

const FIXED_HEAD_SEEDS = ['HEAD_AUDIT', 'HEAD_B', 'HEAD_C', 'HEAD_D', 'HEAD_E', 'HEAD_F'];

function buildTripletSummary(genre, arrangement, timeSignature) {
    return buildSeedSweepSummary(
        buildSeedSweep({
            arrangement,
            genre,
            bpm: 102,
            intensity: 0.5,
            timeSignature,
            style: 'smart',
            seeds: FIXED_HEAD_SEEDS,
        }),
    );
}

describe('Soloist Triplet Support', () => {
    it('adds triplet motion to Jazz and Blues hooks while keeping Rock straight', () => {
        const arrangement = buildHookAuditArrangement('4/4');
        const jazz = buildTripletSummary('Jazz', arrangement, arrangement.timeSignature);
        const blues = buildTripletSummary('Blues', arrangement, arrangement.timeSignature);
        const rock = buildTripletSummary('Rock', arrangement, arrangement.timeSignature);

        expect(jazz.aggregate.tripletAttackShare).toBeGreaterThanOrEqual(0.05);
        expect(blues.aggregate.tripletAttackShare).toBeGreaterThanOrEqual(0.04);
        expect(rock.aggregate.tripletAttackShare).toBe(0);
        expect(jazz.aggregate.anchorExactRate).toBeGreaterThanOrEqual(0.95);
        expect(blues.aggregate.anchorExactRate).toBeGreaterThanOrEqual(0.75);
        expect(blues.aggregate.tripletAttackShare).toBeGreaterThan(0.03);
    }, 30_000);

    it('keeps fixed-seed triplet cadences audible on the head audit seed', () => {
        const arrangement = buildHookAuditArrangement('4/4');
        const jazzHead = buildSeedSweep({
            arrangement,
            genre: 'Jazz',
            bpm: 102,
            intensity: 0.5,
            timeSignature: arrangement.timeSignature,
            style: 'smart',
            seeds: ['HEAD_AUDIT'],
        })[0];
        const bluesHead = buildSeedSweep({
            arrangement,
            genre: 'Blues',
            bpm: 102,
            intensity: 0.5,
            timeSignature: arrangement.timeSignature,
            style: 'smart',
            seeds: ['HEAD_AUDIT'],
        })[0];

        expect(jazzHead).toBeDefined();
        expect(bluesHead).toBeDefined();
        expect(jazzHead?.tripletAttackShare).toBeGreaterThanOrEqual(0.08);
        expect(bluesHead?.tripletAttackShare).toBeGreaterThanOrEqual(0.07);
        expect(jazzHead?.anchorExactRate).toBe(1);
        expect(bluesHead?.anchorExactRate).toBe(1);
    });

    it('keeps compound blues phrasing distinct from explicit 4/4 triplet tagging', () => {
        const arrangement = buildAuditArrangement('blues', '6/8');
        const bluesSixEight = buildTripletSummary('Blues', arrangement, arrangement.timeSignature);

        expect(bluesSixEight.aggregate.tripletAttackShare).toBe(0);
        expect(bluesSixEight.aggregate.notesPerMeasure).toBeGreaterThanOrEqual(5);
        expect(bluesSixEight.aggregate.stableCadenceShare).toBeGreaterThanOrEqual(0.65);
    });
});
