import { describe, expect, it } from 'vitest';
import { foldPracticeStep, isPracticeLooping } from '../../../public/engine/section-overrides.js';

/**
 * #1016 — section practice. The scheduler and worker keep `step` monotonic and
 * call `foldPracticeStep` to derive the drilled chart position. These tests pin
 * the load-bearing math and the byte-identity guarantee (no fold when no loop),
 * which is what keeps normal playback unchanged.
 */
describe('section-practice fold (#1016)', () => {
    describe('isPracticeLooping', () => {
        it('is false for the cleared sentinel, missing fields, or inverted ranges', () => {
            expect(isPracticeLooping(null)).toBe(false);
            expect(isPracticeLooping(undefined)).toBe(false);
            expect(isPracticeLooping({})).toBe(false);
            expect(isPracticeLooping({ loopStartStep: -1, loopEndStep: -1 })).toBe(false);
            expect(isPracticeLooping({ loopStartStep: 32, loopEndStep: 32 })).toBe(false);
            expect(isPracticeLooping({ loopStartStep: 64, loopEndStep: 32 })).toBe(false);
        });

        it('is true for a valid, non-empty window', () => {
            expect(isPracticeLooping({ loopStartStep: 0, loopEndStep: 32 })).toBe(true);
            expect(isPracticeLooping({ loopStartStep: 32, loopEndStep: 64 })).toBe(true);
        });
    });

    describe('foldPracticeStep', () => {
        it('is the identity when no loop is active (byte-identical playback)', () => {
            const cleared = { loopStartStep: -1, loopEndStep: -1 };
            for (const step of [0, 1, 63, 64, 999, 4096]) {
                expect(foldPracticeStep(step, cleared)).toBe(step);
                expect(foldPracticeStep(step, null)).toBe(step);
            }
        });

        it('passes through steps before the window (drill not yet reached)', () => {
            const pb = { loopStartStep: 32, loopEndStep: 64 };
            expect(foldPracticeStep(0, pb)).toBe(0);
            expect(foldPracticeStep(31, pb)).toBe(31);
        });

        it('cycles monotonic steps within [start, end)', () => {
            const pb = { loopStartStep: 32, loopEndStep: 64 }; // width 32
            expect(foldPracticeStep(32, pb)).toBe(32); // first step of the drill
            expect(foldPracticeStep(63, pb)).toBe(63); // last step of lap 1
            expect(foldPracticeStep(64, pb)).toBe(32); // wraps to the top of the section
            expect(foldPracticeStep(65, pb)).toBe(33);
            expect(foldPracticeStep(95, pb)).toBe(63); // end of lap 2
            expect(foldPracticeStep(96, pb)).toBe(32); // lap 3
        });

        it('stays strictly inside the window for a long monotonic run', () => {
            const pb = { loopStartStep: 16, loopEndStep: 48 };
            for (let step = pb.loopStartStep; step < 5000; step++) {
                const folded = foldPracticeStep(step, pb);
                expect(folded).toBeGreaterThanOrEqual(pb.loopStartStep);
                expect(folded).toBeLessThan(pb.loopEndStep);
            }
        });

        it('handles a section that starts at 0 (loop the head)', () => {
            const pb = { loopStartStep: 0, loopEndStep: 16 };
            expect(foldPracticeStep(0, pb)).toBe(0);
            expect(foldPracticeStep(15, pb)).toBe(15);
            expect(foldPracticeStep(16, pb)).toBe(0);
            expect(foldPracticeStep(33, pb)).toBe(1);
        });
    });
});
