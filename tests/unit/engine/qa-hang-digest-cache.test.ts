// #1157 — worker-contract guard for the Q&A window digest cache (`getQaHangAt`).
//
// The digest memoizes an O(notes²) pairing scan in a WeakMap keyed by the seed
// OBJECT. On the main thread that is sound (a regenerated seed is a new object),
// but on the WORKER it is not: `recursiveSafeSync` (worker-utils.ts) deep-merges
// a plain-object field into the existing target rather than replacing it, so
// `soloist.session.seed` KEEPS ITS IDENTITY across a mid-playback regeneration
// (`regenerateSessionSeeds` in state-effects.ts — fires on a key change / chart
// edit while playing) while its `notes` are swapped underneath.
//
// Identity-only caching therefore served the OLD seed's hang pitch classes and
// window positions against the NEW line until stop→play — audible as the comper
// echoing the pre-transpose key. `seedId` (stamped per generation by
// `generateSessionSeed`) is the validity token that catches it.
//
// These tests mutate the seed IN PLACE, exactly as the worker's sync does — a
// test that swapped in a fresh object would pass against the broken cache.
import { describe, expect, it } from 'vitest';
import { getQaHangAt } from '../../../public/engine/soloist-phrase-first.js';

const SPB = 4; // steps per beat
const SPM = 16; // steps per measure (4/4)
const TOTAL = 64; // arrangement steps per lap

/**
 * A minimal seed carrying one question→answer pair inside a 4-bar block.
 * `transpose` shifts every note, modelling the real trigger for a mid-playback
 * regeneration (a key change), which is also what makes the content-derived
 * `drawSalt` move.
 *
 * The high note at step 4 is load-bearing: it makes the cycle's apex sit BEHIND
 * the question, so the apex-dovetail exclusion (a question within 2 bars ahead
 * of the apex is skipped, because the live engine re-points those hangs at the
 * money note) doesn't swallow the window under test.
 */
function makeSeed(transpose: number, seedId: number) {
    const n = (step: number, midi: number, extra: Record<string, unknown> = {}) => ({
        step,
        midi: midi + transpose,
        isAnchor: false,
        durationSteps: 8,
        velocity: 0.7,
        ...extra,
    });
    return {
        seedId,
        loopLengthSteps: TOTAL,
        notes: [
            n(0, 60, { isAnchor: true, durationSteps: 4 }),
            n(4, 84), // cycle apex, safely behind the question
            n(20, 62, { qaRole: 'question' }), // hangs at bar 1
            n(40, 64, { isAnchor: true }),
            n(44, 60, { qaRole: 'answer' }), // resolves at bar 3
        ],
    };
}

describe('#1157 getQaHangAt — worker in-place seed regeneration', () => {
    it('serves the NEW hang pitch after an in-place seed swap (worker sync shape)', () => {
        // D (62) hangs → pc 2.
        const seed: any = makeSeed(0, 1);
        const before = getQaHangAt(seed, 20, SPB, SPM, TOTAL);
        expect(before).not.toBeNull();
        expect(before?.pc).toBe(2);

        // The worker's `recursiveSafeSync` shape: same object, new contents.
        // A transpose up a whole step — E (64) now hangs → pc 4.
        const regenerated = makeSeed(2, 2);
        seed.notes = regenerated.notes;
        seed.loopLengthSteps = regenerated.loopLengthSteps;
        seed.seedId = regenerated.seedId;

        const after = getQaHangAt(seed, 20, SPB, SPM, TOTAL);
        expect(after).not.toBeNull();
        // Regression: with identity-only caching this stayed 2 (the pre-transpose
        // key's tension tone) and the comper echoed the wrong pitch class.
        expect(after?.pc).toBe(4);
    });

    it('re-derives the participation salt after an in-place swap', () => {
        // The salt seeds the comper's per-question draw; a stale salt would keep
        // answering the pre-edit chart's questions.
        const seed: any = makeSeed(0, 10);
        const before = getQaHangAt(seed, 20, SPB, SPM, TOTAL);
        expect(before?.drawSalt).toBeDefined();

        const regenerated = makeSeed(5, 11);
        seed.notes = regenerated.notes;
        seed.seedId = regenerated.seedId;

        const after = getQaHangAt(seed, 20, SPB, SPM, TOTAL);
        expect(after?.drawSalt).not.toBe(before?.drawSalt);
    });

    it('still caches within one generation (same seedId → identical result object)', () => {
        // The cache must remain a cache: repeated ticks inside one generation
        // must not re-run the O(notes²) scan.
        const seed: any = makeSeed(0, 20);
        const a = getQaHangAt(seed, 20, SPB, SPM, TOTAL);
        const b = getQaHangAt(seed, 22, SPB, SPM, TOTAL);
        expect(a?.pc).toBe(b?.pc);
        expect(a?.hangStartStep).toBe(b?.hangStartStep);
        expect(a?.drawSalt).toBe(b?.drawSalt);
    });

    it('re-keys on a meter change even when seedId is unchanged', () => {
        // 3/4 moves the resolution bar; the grid tuple is the other half of the
        // validity key.
        const seed: any = makeSeed(0, 30);
        const in44 = getQaHangAt(seed, 20, SPB, SPM, TOTAL);
        const in34 = getQaHangAt(seed, 20, SPB, 12, TOTAL);
        expect(in44?.resolutionBarStart).not.toBe(in34?.resolutionBarStart);
    });

    it('uses the answer section actual measure bounds in a mixed-meter chart', () => {
        const seed: any = {
            seedId: 40,
            loopLengthSteps: 46,
            notes: [
                { step: 13, midi: 84, isAnchor: false, durationSteps: 4, velocity: 0.7 },
                {
                    step: 20,
                    midi: 62,
                    isAnchor: false,
                    durationSteps: 4,
                    velocity: 0.7,
                    qaRole: 'question',
                },
                {
                    step: 30,
                    midi: 64,
                    isAnchor: true,
                    durationSteps: 4,
                    velocity: 0.7,
                    qaRole: 'answer',
                },
            ],
        };
        const arranger: any = {
            totalSteps: 46,
            timeSignature: '7/8',
            grouping: null,
            measureMap: [
                { start: 0, end: 14, ts: '7/8' },
                { start: 14, end: 30, ts: '4/4' },
                { start: 30, end: 46, ts: '4/4' },
            ],
        };

        const hang = getQaHangAt(seed, 30, 4, 16, 46, arranger);

        expect(hang?.resolutionBarStart).toBe(30);
        expect(hang?.resolutionBarEnd).toBe(46);
    });

    it('tolerates a seed with no seedId (hand-built fixture) without throwing', () => {
        const seed: any = makeSeed(0, 0);
        seed.seedId = undefined;
        expect(() => getQaHangAt(seed, 20, SPB, SPM, TOTAL)).not.toThrow();
        expect(getQaHangAt(seed, 20, SPB, SPM, TOTAL)?.pc).toBe(2);
    });
});
