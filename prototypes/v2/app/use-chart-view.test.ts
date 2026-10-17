/**
 * The Following look-ahead's next-bar cue (#1458). Pinned here: `nextBarIndex`'s bar-skip and
 * wrap rules, in isolation from the band engine and React — the sibling coverage for what
 * `band-chart.test.ts` pins at the `BandChart` level (`BandSlot.bar`).
 */
import { describe, expect, it } from 'vitest';
import { nextBarIndex } from './use-chart-view';

/** A minimal item `nextBarIndex` can walk: `start` in steps, `bar` its performed-bar ordinal. */
const item = (start: number, bar: number) => ({ start, bar });
const barOf = (i: { bar: number }) => i.bar;

describe('nextBarIndex', () => {
    it('returns the very next item when its bar already differs (the common case)', () => {
        const items = [item(0, 0), item(4, 1), item(8, 2)];
        expect(nextBarIndex(items, 0, barOf)).toBe(1);
        expect(nextBarIndex(items, 1, barOf)).toBe(2);
    });

    it('skips every further chord still inside the SAME bar (a multi-chord bar, P1-1)', () => {
        // Bar 0 holds two chords (steps 0 and 2), bar 1 holds one (step 4).
        const items = [item(0, 0), item(2, 0), item(4, 1)];
        expect(nextBarIndex(items, 0, barOf)).toBe(2); // from the FIRST chord of bar 0
        expect(nextBarIndex(items, 1, barOf)).toBe(2); // from the SECOND chord of bar 0
    });

    it('wraps to item 0 at the end of the form (the band loops the whole song)', () => {
        const items = [item(0, 0), item(4, 1), item(8, 2)];
        expect(nextBarIndex(items, 2, barOf)).toBe(0);
    });

    it('a one-bar written repeat (`||: F7 :|| x4`) points at the SAME bar through pass 3, the following one on pass 4', () => {
        // display stays 0 (same written bar) for all four passes; `bar` is the performed ordinal.
        const passes = [
            { start: 0, bar: 0, display: 0 },
            { start: 4, bar: 1, display: 0 },
            { start: 8, bar: 2, display: 0 },
            { start: 12, bar: 3, display: 0 },
        ];
        for (const activeIdx of [0, 1, 2]) {
            const next = nextBarIndex(passes, activeIdx, barOf);
            expect(next).toBe(activeIdx + 1);
            expect(
                passes[next!].display,
                `pass ${activeIdx + 1} points at the SAME written bar`,
            ).toBe(0);
        }
        // Pass 4 (no further items): wraps to the form's own start.
        expect(nextBarIndex(passes, 3, barOf)).toBe(0);
    });

    it('returns null off the ends of the array', () => {
        expect(nextBarIndex([], 0, barOf)).toBeNull();
        expect(nextBarIndex([item(0, 0)], -1, barOf)).toBeNull();
        expect(nextBarIndex([item(0, 0)], 5, barOf)).toBeNull();
    });
});
