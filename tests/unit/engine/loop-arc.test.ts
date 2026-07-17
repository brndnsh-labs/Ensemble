import { describe, expect, it } from 'vitest';
import { loopArcMultiplier } from '../../../public/engine/arc.js';
import { classifyArc } from '../../../scripts/audio-analysis.js';

describe('loopArcMultiplier', () => {
    it('returns 1.0 for single-loop (bit-identical guard)', () => {
        expect(loopArcMultiplier(0, 1)).toBe(1.0);
    });

    it('returns 1.0 when loopLimit is 0 (free-form playback)', () => {
        expect(loopArcMultiplier(0, 0)).toBe(1.0);
        expect(loopArcMultiplier(3, 0)).toBe(1.0);
    });

    it('returns 1.0 for non-finite inputs', () => {
        expect(loopArcMultiplier(NaN, 4)).toBe(1.0);
        expect(loopArcMultiplier(0, NaN)).toBe(1.0);
        expect(loopArcMultiplier(0, Infinity)).toBe(1.0);
    });

    it('produces a head→peak→release shape on the DoD case N=4', () => {
        const curve = [0, 1, 2, 3].map((i) => loopArcMultiplier(i, 4));
        expect(curve).toEqual([0.92, 1.05, 1.3, 0.95]);
        const peakIdx = curve.indexOf(Math.max(...curve));
        expect(peakIdx).toBe(2);
        expect(curve[3]).toBeLessThan(curve[2]);
    });

    it('produces a hold→build→peak→release shape on N=8', () => {
        const curve = Array.from({ length: 8 }, (_, i) => loopArcMultiplier(i, 8));
        expect(curve[0]).toBe(0.85);
        expect(curve[7]).toBe(0.95);
        expect(Math.max(...curve)).toBe(1.3);
        // First half builds monotonically
        for (let i = 1; i <= 4; i++) {
            expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
        }
    });

    it('clamps overflow loopIndex to the final value', () => {
        const last = loopArcMultiplier(3, 4);
        expect(loopArcMultiplier(10, 4)).toBe(last);
    });

    it('clamps negative loopIndex to the head value', () => {
        const head = loopArcMultiplier(0, 4);
        expect(loopArcMultiplier(-5, 4)).toBe(head);
    });

    it.each([2, 3, 4, 5, 6, 7, 8])(
        'N=%i: peak NOT at index 0 (so the gate never classifies front-loaded)',
        (N) => {
            const curve = Array.from({ length: N }, (_, i) => loopArcMultiplier(i, N));
            const peakIdx = curve.indexOf(Math.max(...curve));
            expect(peakIdx).toBeGreaterThan(0);
        },
    );

    it.each([3, 4, 5, 6, 7, 8])(
        'N=%i: final loop is below peak (release shape, not monotonic build)',
        (N) => {
            const curve = Array.from({ length: N }, (_, i) => loopArcMultiplier(i, N));
            expect(curve[N - 1]).toBeLessThan(Math.max(...curve));
        },
    );

    it('handles large N (>8) via fallback formula without throwing', () => {
        const curve = Array.from({ length: 12 }, (_, i) => loopArcMultiplier(i, 12));
        expect(curve[11]).toBe(0.95); // release
        expect(curve[10]).toBe(1.3); // peak at N-2
        expect(Math.max(...curve)).toBe(1.3);
        const peakIdx = curve.indexOf(1.3);
        expect(peakIdx).toBeGreaterThan(0);
    });

    it('classifier-compat: synthetic 4-loop RMS shaped by the arc passes as building or arc', () => {
        // Simulate the per-loop RMS dB shape that a stem broadcasting bandIntensity *
        // arcMultiplier would produce. A 0.92 → 1.30 swing across four engines'
        // velocity / hit-probability gates should clear the classifier's 1.5 dB floor;
        // we approximate the per-loop RMS dB ≈ 20 * log10(arcMultiplier) plus a baseline.
        const baseline = -18;
        const loopRmsDb = [0, 1, 2, 3].map(
            (i) => baseline + 20 * Math.log10(loopArcMultiplier(i, 4)),
        );
        const label = classifyArc(loopRmsDb);
        expect(['arc', 'building']).toContain(label);
    });
});
