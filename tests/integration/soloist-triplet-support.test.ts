// @ts-nocheck
// Soloist triplet support — PRODUCTION-FAITHFUL on the live phrase-first engine
// (epic #10, #865). Rerouted from the legacy getSoloistNote; the legacy
// `anchorExactRate` head-replay assertions were DROPPED (phrase-first develops
// loop-1 rather than replaying head-exact), but the triplet-FEEL property is
// genuinely live-valid: the triplet-aware seeder (soloist-seeder.ts
// getTripletPlacementTag) tags jazz/blues theme notes with `tripletPlacement`,
// and the live engine replays those seed notes, so the swing-vs-straight genre
// distinction survives on the engine that actually plays. The harness attributes
// triplets via `event.seedNote.tripletPlacement` (soloist-analysis-utils.ts:317).
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
        console.log(
            `[triplet agg] jazz=${jazz.aggregate.tripletAttackShare} blues=${blues.aggregate.tripletAttackShare} rock=${rock.aggregate.tripletAttackShare}`,
        );

        // Jazz and Blues swing in triplets; Rock stays straight. Baseline for "no
        // triplet feel" is exactly 0 (the seeder tags none), so any positive share is
        // a real swing signal. Live: jazz ~5.9%, blues ~3.8%, rock 0. Floors set with
        // headroom below the live shares; rock must be exactly straight.
        expect(jazz.aggregate.tripletAttackShare).toBeGreaterThanOrEqual(0.045);
        expect(blues.aggregate.tripletAttackShare).toBeGreaterThanOrEqual(0.03);
        expect(rock.aggregate.tripletAttackShare).toBe(0);
    }, 30_000);

    it('keeps fixed-seed triplet cadences audible on the head audit seed', () => {
        const arrangement = buildHookAuditArrangement('4/4');
        const head = (genre) =>
            buildSeedSweep({
                arrangement,
                genre,
                bpm: 102,
                intensity: 0.5,
                timeSignature: arrangement.timeSignature,
                style: 'smart',
                seeds: ['HEAD_AUDIT'],
            })[0];
        const jazzHead = head('Jazz');
        const bluesHead = head('Blues');
        console.log(
            `[triplet head] jazz=${jazzHead?.tripletAttackShare} blues=${bluesHead?.tripletAttackShare}`,
        );

        expect(jazzHead).toBeDefined();
        expect(bluesHead).toBeDefined();
        // The single audit head seed carries audible triplet cadences on the live
        // engine (jazz ~8.7%, blues ~6.4%); floors below with headroom over baseline 0.
        expect(jazzHead?.tripletAttackShare).toBeGreaterThanOrEqual(0.07);
        expect(bluesHead?.tripletAttackShare).toBeGreaterThanOrEqual(0.05);
    });

    it('keeps compound blues phrasing distinct from explicit 4/4 triplet tagging', () => {
        const arrangement = buildAuditArrangement('blues', '6/8');
        const bluesSixEight = buildTripletSummary('Blues', arrangement, arrangement.timeSignature);
        console.log(
            `[6/8] triplet=${bluesSixEight.aggregate.tripletAttackShare} notes/meas=${bluesSixEight.aggregate.notesPerMeasure} stableCadence=${bluesSixEight.aggregate.stableCadenceShare}`,
        );

        // Compound blues is NOT 4/4-triplet-tagged (the seeder uses native compound
        // pulse, not explicit triplet tags) — must be exactly 0.
        expect(bluesSixEight.aggregate.tripletAttackShare).toBe(0);
        // Still a real, resolved line: a non-trivial note density (live ~2.94/measure;
        // phrase-first is sparser than the legacy engine, so the floor is 2, not the
        // legacy 5) and a majority of stable cadences (live ~0.68).
        expect(bluesSixEight.aggregate.notesPerMeasure).toBeGreaterThanOrEqual(2);
        expect(bluesSixEight.aggregate.stableCadenceShare).toBeGreaterThanOrEqual(0.6);
    });
});
