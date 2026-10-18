import { describe, expect, it } from 'vitest';
import { resolveScoreContext } from '../../../core/songbook/score-context.js';

describe('resolveScoreContext', () => {
    const score = { key: 'C', isMinor: false, meter: '4/4', grouping: [2, 2] };

    it('keeps a measure key/meter change for the bars after it, within the section', () => {
        let context = resolveScoreContext(score, {});
        context = resolveScoreContext(context, { key: 'G', isMinor: true, meter: '6/8' });
        expect(context).toEqual({ key: 'G', isMinor: true, meter: '6/8', grouping: null });
        // The next bar writes nothing, so it plays on in G minor, 6/8.
        expect(resolveScoreContext(context, {})).toEqual(context);
    });

    it('leaves the context as it was inherited when nothing is written', () => {
        // A section starts over from the score by resolving against it, not against the last
        // bar: `band/form/timeline.test.ts` checks that end to end.
        expect(resolveScoreContext(score, {})).toEqual(score);
    });

    it('drops the beat grouping when the meter is written, unless it is written too', () => {
        expect(resolveScoreContext(score, { meter: '6/8' }).grouping).toBeNull();
        expect(resolveScoreContext(score, { meter: '6/8', grouping: [3, 3] }).grouping).toEqual([
            3, 3,
        ]);
        expect(resolveScoreContext(score, { key: 'D' }).grouping).toEqual([2, 2]);
    });

    it('copies the grouping instead of sharing the caller array', () => {
        const context = resolveScoreContext(score, {});
        expect(context.grouping).toEqual([2, 2]);
        expect(context.grouping).not.toBe(score.grouping);
    });
});
