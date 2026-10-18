/**
 * The bar menu's beat ruler (#1725). Pinned: what the ruler writes reads back through
 * `parseChordBar` as the lengths it drew, in 4/4, 3/4 and 6/8 — and what the musician types
 * (`Gm7 / / C7`, `Gm7:3 C7:1`) draws as the ruler they would expect.
 */
import { parseChordBar } from '@core/songbook/score-text';
import { describe, expect, it } from 'vitest';
import {
    countsLabel,
    movedSplit,
    readRuler,
    rulerText,
    snapSplit,
    splitAt,
    splitRange,
    stepSplit,
} from './bar-ruler';

/** Each chord's length in counts as the parser reads `text`, holds folded into the chord. */
function lengths(text: string, meter: string): [string, number][] {
    const parsed = parseChordBar(text, meter);
    if (parsed.kind !== 'ok') {
        throw new Error(`does not read: ${text}`);
    }
    const unit = Number(meter.split('/')[1]);
    const out: [string, number][] = [];
    for (const event of parsed.value) {
        const counts = (event.duration[0] * unit) / (4 * event.duration[1]);
        if (event.kind === 'hold' && out.length) {
            out[out.length - 1][1] += counts;
        } else {
            out.push([event.kind === 'chord' ? event.symbol : event.kind, counts]);
        }
    }
    return out;
}

describe('readRuler', () => {
    it('draws holds as the chord before them held', () => {
        expect(readRuler('Gm7 / / C7', '4/4')?.spans).toEqual([
            { text: 'Gm7', halves: 6 },
            { text: 'C7', halves: 2 },
        ]);
        expect(readRuler('Gm7:3 C7:1', '4/4')?.spans).toEqual([
            { text: 'Gm7', halves: 6 },
            { text: 'C7', halves: 2 },
        ]);
    });

    it('shares equal chords across the bar, in any meter', () => {
        expect(readRuler('Gm7 C7', '4/4')?.spans.map((s) => s.halves)).toEqual([4, 4]);
        expect(readRuler('C G D', '3/4')?.spans.map((s) => s.halves)).toEqual([2, 2, 2]);
        expect(readRuler('C G', '6/8')).toMatchObject({ total: 12, counts: 6, grain: 1 });
    });

    it('keeps alternates and N.C. as written', () => {
        expect(readRuler('C[Am]:3 N.C.:1', '4/4')?.spans.map((s) => s.text)).toEqual([
            'C[Am]',
            'N.C.',
        ]);
    });

    it('has no ruler for text that does not read, or lengths finer than half a count', () => {
        expect(readRuler('Gm7 C7x', '4/4')).toBeNull();
        expect(readRuler('C:3 G:2', '4/4')).toBeNull();
        expect(readRuler('C:4/3 D:4/3 E:4/3', '4/4')).toBeNull();
    });

    it('allows half counts only where they are on the step grid', () => {
        expect(readRuler('C', '4/4')?.grain).toBe(1);
        expect(readRuler('C', '6/16')?.grain).toBe(2);
    });
});

describe('rulerText round-trips through parseChordBar', () => {
    const cases: [meter: string, text: string, at: number, expected: [string, number][]][] = [
        [
            '4/4',
            'Gm7 C7',
            6,
            [
                ['Gm7', 3],
                ['C7', 1],
            ],
        ],
        [
            '4/4',
            'Gm7 / / C7',
            4,
            [
                ['Gm7', 2],
                ['C7', 2],
            ],
        ],
        [
            '4/4',
            'Gm7 C7',
            3,
            [
                ['Gm7', 1.5],
                ['C7', 2.5],
            ],
        ],
        [
            '3/4',
            'C G',
            4,
            [
                ['C', 2],
                ['G', 1],
            ],
        ],
        [
            '6/8',
            'C G',
            8,
            [
                ['C', 4],
                ['G', 2],
            ],
        ],
        [
            '6/8',
            'C:4 G:2',
            6,
            [
                ['C', 3],
                ['G', 3],
            ],
        ],
    ];
    for (const [meter, text, at, expected] of cases) {
        it(`${text} in ${meter}, split moved to ${at / 2}`, () => {
            const ruler = readRuler(text, meter);
            expect(ruler).not.toBeNull();
            const written = rulerText(movedSplit(ruler!, 0, at));
            expect(lengths(written, meter)).toEqual(expected);
            // And back: the ruler reads what it wrote as what it drew.
            expect(readRuler(written, meter)?.spans).toEqual(movedSplit(ruler!, 0, at));
        });
    }

    it('writes equal lengths plainly and unequal ones with counts', () => {
        const ruler = readRuler('Gm7 C7', '4/4')!;
        expect(rulerText(movedSplit(ruler, 0, 6))).toBe('Gm7:3 C7:1');
        expect(rulerText(movedSplit(ruler, 0, 3))).toBe('Gm7:3/2 C7:5/2');
        expect(rulerText(readRuler('Gm7 / / C7', '4/4')!.spans)).toBe('Gm7:3 C7:1');
        expect(rulerText(readRuler('Gm7:2 C7:2', '4/4')!.spans)).toBe('Gm7 C7');
    });
});

describe('with Hold last chord on', () => {
    it('keeps the holds that end the bar as their own span, so the fermata still holds a hold', () => {
        const ruler = readRuler('Gm7 C7 / /', '4/4', true)!;
        expect(ruler.spans).toEqual([
            { text: 'Gm7', halves: 2 },
            { text: 'C7', halves: 2 },
            { text: '/', halves: 4 },
        ]);
        const written = rulerText(movedSplit(ruler, 1, 6));
        expect(written).toBe('Gm7:1 C7:2 /:1');
        const parsed = parseChordBar(written, '4/4');
        expect(parsed.kind === 'ok' && parsed.value.at(-1)?.kind).toBe('hold');
        // Moving the other split leaves the final hold where it is too.
        const parsedToo = parseChordBar(rulerText(movedSplit(ruler, 0, 3)), '4/4');
        expect(parsedToo.kind === 'ok' && parsedToo.value.at(-1)?.kind).toBe('hold');
    });

    it('still folds holds inside the bar, and every hold when the toggle is off', () => {
        expect(readRuler('Gm7 / C7 /', '4/4', true)?.spans.map((s) => s.text)).toEqual([
            'Gm7',
            'C7',
            '/',
        ]);
        expect(readRuler('Gm7 C7 / /', '4/4')?.spans.map((s) => s.text)).toEqual(['Gm7', 'C7']);
    });
});

describe('moving a split', () => {
    const three = readRuler('C Dm G7 C', '4/4')!;

    it('stays between its neighbours, each keeping at least half a count', () => {
        expect(splitAt(three, 1)).toBe(4);
        expect(splitRange(three, 1)).toEqual({ min: 3, max: 5 });
    });

    it('snaps to whole counts, or half counts when asked', () => {
        const two = readRuler('Gm7 C7', '4/4')!;
        expect(snapSplit(two, 0, 5.2)).toBe(6);
        expect(snapSplit(two, 0, 5.2, true)).toBe(5);
        // Dragged past the end: the last whole count that leaves C7 a beat.
        expect(snapSplit(two, 0, 40)).toBe(6);
        expect(snapSplit(two, 0, -3)).toBe(2);
    });

    it('steps by a count with the arrow keys, and to either end', () => {
        const two = readRuler('Gm7 C7', '4/4')!;
        expect(stepSplit(two, 0, 1)).toBe(6);
        expect(stepSplit(two, 0, -1)).toBe(2);
        expect(stepSplit(two, 0, 1, true)).toBe(5);
        expect(stepSplit(two, 0, 'end')).toBe(6);
        expect(stepSplit(two, 0, 'start')).toBe(2);
        const end = readRuler('Gm7:3 C7:1', '4/4')!;
        expect(stepSplit(end, 0, 1)).toBe(6);
        expect(stepSplit(end, 0, 1, true)).toBe(7);
    });

    it('falls back to half counts between two half-count chords', () => {
        const halves = readRuler('C:1/2 D:1/2 E:3', '4/4')!;
        expect(snapSplit(halves, 0, 0.2)).toBe(1);
    });

    it('labels lengths for a reader', () => {
        expect([countsLabel(6), countsLabel(3), countsLabel(1)]).toEqual(['3', '1½', '½']);
    });
});
