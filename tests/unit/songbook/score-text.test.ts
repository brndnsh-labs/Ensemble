import { describe, expect, it } from 'vitest';
import {
    addScoreDurations,
    durationToSteps,
    scoreDuration,
    scoreMeter,
} from '../../../public/songbook/score-duration.js';
import { parseChordBar, printChordBar } from '../../../public/songbook/score-text.js';
import type { ScoreEvent } from '../../../public/songbook/score-types.js';

function expectBar(text: string, meter: string, expected: ScoreEvent[]): void {
    expect(parseChordBar(text, meter)).toEqual({ kind: 'ok', value: expected });
}

function expectInvalidBar(text: string, meter = '4/4'): void {
    expect(parseChordBar(text, meter)).toEqual({
        kind: 'invalid',
        issues: [expect.objectContaining({ path: '$.bar', code: 'invalid-value' })],
    });
}

describe('semantic score durations', () => {
    it.each([
        [0, 1, [0, 1]],
        [2, 4, [1, 2]],
    ] as const)('reduces %i/%i to %j/%j', (numerator, denominator, expected) => {
        expect(scoreDuration(numerator, denominator)).toEqual(expected);
    });

    it.each([
        [-1, 4],
        [1, 0],
        [1, -4],
        [1, 2.5],
        [Number.MAX_SAFE_INTEGER + 1, 1],
        [1_000_001, 1],
    ] as const)(
        'rejects negative, invalid-denominator, non-integral, unsafe, and oversized %p/%p',
        (n, d) => {
            expect(() => scoreDuration(n, d)).toThrow();
        },
    );

    it('adds reduced rational values exactly, including thirds', () => {
        const third = scoreDuration(1, 3);
        expect(addScoreDurations(third, scoreDuration(1, 6))).toEqual([1, 2]);
        expect(addScoreDurations(addScoreDurations(third, third), third)).toEqual([1, 1]);
    });

    it('refuses unsafe duration arithmetic rather than returning an imprecise value', () => {
        expect(() => addScoreDurations([Number.MAX_SAFE_INTEGER, 1], [1, 1])).toThrow();
    });

    it.each([
        ['4/4', { counts: 4, unit: 4, length: [4, 1] }],
        ['6/8', { counts: 6, unit: 8, length: [3, 1] }],
        ['3/4', { counts: 3, unit: 4, length: [3, 1] }],
    ] as const)('gives %s its exact quarter-note bar length', (meter, expected) => {
        expect(scoreMeter(meter)).toEqual(expected);
    });

    it.each(['04/4', '4/3'])('rejects non-canonical or unsupported meter %s', (meter) => {
        expect(() => scoreMeter(meter)).toThrow();
    });

    it.each([
        [[1, 4], 1],
        [[3, 2], 6],
        [[1, 3], null],
        [[0, 1], null],
    ] as const)(
        'converts only exact sixteenth-grid durations %j to %j steps',
        (duration, steps) => {
            expect(durationToSteps(duration)).toBe(steps);
        },
    );
});

describe('semantic score chord-bar text', () => {
    it.each([
        [
            'C:2 F:1 G:1',
            '4/4',
            [
                { kind: 'chord', symbol: 'C', duration: [2, 1] },
                { kind: 'chord', symbol: 'F', duration: [1, 1] },
                { kind: 'chord', symbol: 'G', duration: [1, 1] },
            ],
        ],
        [
            'C:3 G7:3',
            '6/8',
            [
                { kind: 'chord', symbol: 'C', duration: [3, 2] },
                { kind: 'chord', symbol: 'G7', duration: [3, 2] },
            ],
        ],
        [
            'C F',
            '3/4',
            [
                { kind: 'chord', symbol: 'C', duration: [3, 2] },
                { kind: 'chord', symbol: 'F', duration: [3, 2] },
            ],
        ],
        [
            'C:4/3 F:4/3 G:4/3',
            '4/4',
            [
                { kind: 'chord', symbol: 'C', duration: [4, 3] },
                { kind: 'chord', symbol: 'F', duration: [4, 3] },
                { kind: 'chord', symbol: 'G', duration: [4, 3] },
            ],
        ],
        ['C7/E:4', '4/4', [{ kind: 'chord', symbol: 'C7/E', duration: [4, 1] }]],
        ['C6/9:4', '4/4', [{ kind: 'chord', symbol: 'C6/9', duration: [4, 1] }]],
        ['C♯m7:4', '4/4', [{ kind: 'chord', symbol: 'C♯m7', duration: [4, 1] }]],
        ['♭IIImaj7:4', '4/4', [{ kind: 'chord', symbol: '♭IIImaj7', duration: [4, 1] }]],
        ['#4m7:4', '4/4', [{ kind: 'chord', symbol: '#4m7', duration: [4, 1] }]],
        ['C7b9#11:4', '4/4', [{ kind: 'chord', symbol: 'C7b9#11', duration: [4, 1] }]],
        ['Cmaj(add4):4', '4/4', [{ kind: 'chord', symbol: 'Cmaj(add4)', duration: [4, 1] }]],
        [
            'C7[F7,Bb7]:4',
            '4/4',
            [
                {
                    kind: 'chord',
                    symbol: 'C7',
                    alternates: ['F7', 'Bb7'],
                    duration: [4, 1],
                },
            ],
        ],
        [
            'N.C.:2 /:2',
            '4/4',
            [
                { kind: 'no-chord', duration: [2, 1] },
                { kind: 'hold', duration: [2, 1] },
            ],
        ],
    ] satisfies [string, string, ScoreEvent[]][])(
        'parses complete %s bars in %s',
        (text, meter, events) => {
            expectBar(text, meter, events);
        },
    );

    it.each(['', 'C:2 F', 'C:0 D:4', 'C:3', 'C:5', 'Cnope:4', 'C'.repeat(4001)])(
        'retains malformed, incomplete, oversized, and unknown input as an error: %p',
        (text) => {
            expectInvalidBar(text);
        },
    );

    it('prints a lossless, parseable bar', () => {
        const meter = '4/4';
        const events: ScoreEvent[] = [
            { kind: 'chord', symbol: 'C7', alternates: ['F7', 'Bb7'], duration: [2, 1] },
            { kind: 'hold', duration: [1, 1] },
            { kind: 'no-chord', duration: [1, 1] },
        ];
        const text = printChordBar(events as ScoreEvent[], meter);
        expect(parseChordBar(text, meter)).toEqual({ kind: 'ok', value: events });
    });

    it('refuses a lossy fermata serialization', () => {
        const events: ScoreEvent[] = [
            {
                kind: 'chord',
                symbol: 'C',
                duration: [4, 1],
                fermata: true,
            },
        ];
        expect(() => printChordBar(events, '4/4')).toThrow(/fermata/i);
    });
});
