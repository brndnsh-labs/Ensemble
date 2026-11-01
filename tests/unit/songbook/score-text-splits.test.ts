import { describe, expect, it } from 'vitest';
import { offGridBarSplit, parseChordBar } from '../../../core/songbook/score-text.js';

describe('chords with no lengths that do not land on the grid are chosen, not assumed (#1980)', () => {
    const labels = (text: string, meter: string) =>
        offGridBarSplit(text, meter)?.choices.map((choice) => choice.label);

    it('offers 2+1+1, 1+2+1, 1+1+2 for three chords in 4/4, written out with lengths', () => {
        const split = offGridBarSplit('C Dm G7', '4/4');
        expect(split?.choices.map((choice) => choice.label)).toEqual(['2+1+1', '1+2+1', '1+1+2']);
        expect(split?.choices[0].text).toBe('C:2 Dm:1 G7:1');
        // Every offered text parses and fills the bar.
        for (const choice of split?.choices ?? []) {
            expect(parseChordBar(choice.text, '4/4').kind).toBe('ok');
        }
    });

    it('generalises to the counts left over', () => {
        // Two chords in 5/4 are 2.5 beats each: on the grid, so nothing to choose.
        expect(offGridBarSplit('C F', '5/4')).toBeNull();
        expect(labels('C F G', '5/4')).toEqual(['2+2+1', '2+1+2', '1+2+2']);
        expect(labels('C F G Am Bb', '6/8')).toEqual([
            '2+1+1+1+1',
            '1+2+1+1+1',
            '1+1+2+1+1',
            '1+1+1+2+1',
            '1+1+1+1+2',
        ]);
    });

    it('leaves alone what divides onto the grid, explicit lengths, and what does not read', () => {
        for (const [text, meter] of [
            ['C', '4/4'],
            ['C G', '4/4'],
            ['C F G Am', '4/4'],
            ['C F G Am Bb C D E', '4/4'],
            ['C G', '3/4'],
            ['C G7 F', '6/8'],
            ['C:2 Dm:1 G7:1', '4/4'],
            ['C Dm Nope', '4/4'],
        ] as const) {
            expect(offGridBarSplit(text, meter)).toBeNull();
        }
    });

    it('offers no short list when there are more chords than counts', () => {
        expect(offGridBarSplit('C F G Am Bb', '4/4')).toMatchObject({ chords: 5, choices: [] });
    });
});
