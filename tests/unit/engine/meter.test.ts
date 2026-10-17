import { isValidTimeSignatureGrouping } from '../../../public/meter.js';

// The songbook codec trusts this to decide whether a saved custom grouping is kept
// (`public/songbook/codec.ts`).
describe('isValidTimeSignatureGrouping', () => {
    it('accepts a partition of the meter into positive whole beats', () => {
        expect(isValidTimeSignatureGrouping([2, 3], '5/4')).toBe(true);
        expect(isValidTimeSignatureGrouping([3, 2], '5/4')).toBe(true);
        expect(isValidTimeSignatureGrouping([2, 2, 3], '7/8')).toBe(true);
        expect(isValidTimeSignatureGrouping([4], '4/4')).toBe(true);
    });

    it('refuses a grouping that does not add up to the meter', () => {
        expect(isValidTimeSignatureGrouping([4, 4], '5/4')).toBe(false);
        expect(isValidTimeSignatureGrouping([2, 2], '5/4')).toBe(false);
        expect(isValidTimeSignatureGrouping([2, 2, 2, 2], '7/8')).toBe(false);
    });

    it('refuses groups that are not positive whole numbers', () => {
        expect(isValidTimeSignatureGrouping([5, 0], '5/4')).toBe(false);
        expect(isValidTimeSignatureGrouping([6, -1], '5/4')).toBe(false);
        expect(isValidTimeSignatureGrouping([2.5, 2.5], '5/4')).toBe(false);
        expect(isValidTimeSignatureGrouping(['2', '3'], '5/4')).toBe(false);
    });

    it('refuses an empty grouping, a non-array and a meter it does not know', () => {
        expect(isValidTimeSignatureGrouping([], '5/4')).toBe(false);
        expect(isValidTimeSignatureGrouping(null, '5/4')).toBe(false);
        expect(isValidTimeSignatureGrouping('2+3', '5/4')).toBe(false);
        expect(isValidTimeSignatureGrouping([2, 3], '5/3')).toBe(false);
        // A persisted key that names an inherited property, not a meter.
        expect(isValidTimeSignatureGrouping([1], 'constructor')).toBe(false);
    });
});
