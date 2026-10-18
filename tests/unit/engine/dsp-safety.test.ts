// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import { clampFreq, createSoftClipCurve } from '../../../core/engine/audio-graph-utils.js';

describe('DSP & Signal Safety', () => {
    it('should generate a valid soft-clip curve for the saturator', () => {
        const curve = createSoftClipCurve();
        expect(curve).toBeInstanceOf(Float32Array);
        expect(curve.length).toBe(44100);

        // Midpoint should be 0
        expect(curve[22050]).toBeCloseTo(0, 2);

        // Ends should be clamped/saturated
        expect(curve[0]).toBeLessThan(-0.9);
        expect(curve[44099]).toBeGreaterThan(0.9);

        // Monotonic check
        for (let i = 1; i < curve.length; i += 100) {
            expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
        }
    });

    describe('DSP Clamping', () => {
        it('should clamp frequencies above 24000Hz to 24000Hz', () => {
            expect(clampFreq(25000)).toBe(24000);
            expect(clampFreq(24001)).toBe(24000);
            expect(clampFreq(24000)).toBe(24000);
            expect(clampFreq(25087.7)).toBe(24000);
        });

        it('should clamp negative frequencies to 0Hz', () => {
            expect(clampFreq(-100)).toBe(0);
            expect(clampFreq(-1)).toBe(0);
            expect(clampFreq(0)).toBe(0);
        });

        it('should allow frequencies within the valid range', () => {
            expect(clampFreq(100)).toBe(100);
            expect(clampFreq(10000)).toBe(10000);
            expect(clampFreq(23999)).toBe(23999);
        });

        it('should respect custom max', () => {
            expect(clampFreq(25000, 22050)).toBe(22050);
            expect(clampFreq(20000, 22050)).toBe(20000);
        });
    });
});
