/**
 * The beat groupings the editors offer (#1376). Pinned: the table itself, the engine's default
 * leading each list (so "the first choice" is what playback already does), and the meters that
 * get no control.
 */
import { TIME_SIGNATURES } from '@engine/config';
import { scoreMeter } from '@engine/songbook/score-duration';
import { describe, expect, it } from 'vitest';
import { defaultGrouping, groupingsFor, groupingText, parseGrouping } from './grouping';

const offered = (meter: string) => groupingsFor(meter).map(groupingText);

describe('groupingsFor', () => {
    it('pins the table for the meters the editors list', () => {
        expect(offered('5/4')).toEqual(['3+2', '2+3']);
        expect(offered('7/8')).toEqual(['2+2+3', '3+2+2', '2+3+2', '4+3', '3+4']);
        expect(offered('7/4')).toEqual(['4+3', '2+2+3', '3+2+2', '2+3+2', '3+4']);
        expect(offered('12/8')).toEqual(['3+3+3+3', '3+3+2+2+2']);
    });

    it('covers the uneven meters an import can carry', () => {
        expect(offered('8/8')).toEqual(['3+3+2', '3+2+3', '2+3+3']);
        expect(offered('9/8')).toHaveLength(5);
        expect(offered('10/8')).toHaveLength(3);
        expect(offered('11/8')).toEqual(['2+2+3+2+2', '3+3+3+2']);
    });

    it('offers nothing where a meter has one natural grouping', () => {
        for (const meter of ['2/4', '3/4', '4/4', '6/8', '1/4', '13/8']) {
            expect(groupingsFor(meter)).toEqual([]);
        }
    });

    it("leads with the engine's own default wherever the engine has one", () => {
        for (const meter of Object.keys(TIME_SIGNATURES)) {
            const choices = groupingsFor(meter);
            if (choices.length) {
                expect(choices[0]).toEqual(defaultGrouping(meter));
            }
        }
    });

    it('every offered grouping fills its bar', () => {
        for (const meter of ['5/4', '7/8', '7/4', '8/8', '9/8', '10/8', '11/8', '12/8']) {
            const { counts } = scoreMeter(meter);
            for (const grouping of groupingsFor(meter)) {
                expect(grouping.reduce((sum, n) => sum + n, 0)).toBe(counts);
            }
        }
    });
});

describe('grouping text', () => {
    it('round-trips', () => {
        expect(parseGrouping(groupingText([2, 2, 3]))).toEqual([2, 2, 3]);
    });

    it('has no inherited entries for a hostile meter key', () => {
        expect(defaultGrouping('constructor')).toBeNull();
    });
});
