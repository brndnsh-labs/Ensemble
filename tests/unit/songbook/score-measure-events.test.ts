import { describe, expect, it } from 'vitest';
import { validateSemanticScore } from '../../../public/songbook/score-codec.js';
import { resolveScoreMeasureEvents } from '../../../public/songbook/score-measure-events.js';
import type {
    ScoreDuration,
    ScoreEvent,
    ScoreMeasure,
    SemanticScore,
} from '../../../public/songbook/score-types.js';

function chord(symbol: string, duration: ScoreDuration = [4, 1]): ScoreEvent {
    return { kind: 'chord', symbol, duration };
}

function bar(id: string, events = [chord('C')]): ScoreMeasure {
    return { id, content: { kind: 'events', events } };
}

function repeat(
    id: string,
    measureId: string,
    display: 'one-bar' | 'two-bar-start' | 'two-bar-end' = 'one-bar',
): ScoreMeasure {
    return { id, content: { kind: 'repeat', measureId, display } };
}

function scoreFixture(measures: ScoreMeasure[]): SemanticScore {
    return {
        key: 'C',
        isMinor: false,
        notation: 'name',
        meter: '4/4',
        grouping: null,
        sections: [{ id: 'a', label: 'A', repeat: 1, measures }],
    };
}

function symbols(events: ScoreEvent[][][]) {
    return events.map((section) =>
        section.map((measure) =>
            measure.map((event) => (event.kind === 'chord' ? event.symbol : event.kind)),
        ),
    );
}

describe('written measure-repeat event resolution', () => {
    it('returns exact authored events grouped by written section and bar, not performed visits', () => {
        const first = bar('a1', [chord('C', [2, 1]), chord('Dm', [1, 1]), chord('G7', [1, 1])]);
        first.start = [{ kind: 'repeat-start' }];
        const last = repeat('a2', 'a1');
        last.end = [{ kind: 'repeat-end', times: 3 }];
        const score = scoreFixture([first, last]);
        score.sections[0].repeat = 4;
        score.sections.push({
            id: 'b',
            label: 'B',
            repeat: 2,
            measures: [bar('b1', [chord('F')])],
        });
        expect(resolveScoreMeasureEvents(score)).toEqual([
            [
                [chord('C', [2, 1]), chord('Dm', [1, 1]), chord('G7', [1, 1])],
                [chord('C', [2, 1]), chord('Dm', [1, 1]), chord('G7', [1, 1])],
            ],
            [[chord('F')]],
        ]);
    });

    it('uses the explicit earlier source identity instead of the previous written bar', () => {
        const score = scoreFixture([
            bar('original', [chord('C7/E')]),
            bar('intervening', [chord('F7')]),
            repeat('copy', 'original'),
        ]);
        expect(symbols(resolveScoreMeasureEvents(score))).toEqual([[['C7/E'], ['F7'], ['C7/E']]]);
        score.sections[0].measures.reverse();
        score.sections[0].measures.push(score.sections[0].measures.shift()!);
        expect(symbols(resolveScoreMeasureEvents(score))).toEqual([[['F7'], ['C7/E'], ['C7/E']]]);
    });

    it('resolves a reference to a bar skipped by a performed ending using its written content', () => {
        const a1 = bar('a1', [chord('C')]);
        a1.start = [{ kind: 'repeat-start' }];
        const a2 = bar('a2', [chord('F')]);
        a2.start = [{ kind: 'ending-start', passes: [1] }];
        a2.end = [{ kind: 'repeat-end', times: 2 }];
        const a3 = repeat('a3', 'a2');
        a3.start = [{ kind: 'ending-start', passes: [2] }];
        a3.end = [{ kind: 'ending-end' }];
        expect(symbols(resolveScoreMeasureEvents(scoreFixture([a1, a2, a3])))).toEqual([
            [['C'], ['F'], ['F']],
        ]);
    });

    it.each([
        ['name', 'C#m7/G#'],
        ['roman', 'ii7'],
        ['nns', 'b7'],
    ] as const)(
        'preserves %s symbols through chains without chord interpretation',
        (notation, symbol) => {
            const score = scoreFixture([
                bar('a1', [chord(symbol, [1, 3]), chord('G7', [2, 3]), chord('F', [3, 1])]),
                repeat('a2', 'a1'),
                repeat('a3', 'a2'),
            ]);
            score.notation = notation;
            const events = resolveScoreMeasureEvents(score)[0];
            expect(events).toEqual(
                Array.from({ length: 3 }, () => [
                    chord(symbol, [1, 3]),
                    chord('G7', [2, 3]),
                    chord('F', [3, 1]),
                ]),
            );
        },
    );

    it('allows cross-section one-bar references and chains when effective contexts match', () => {
        const source = bar('a1', [chord('I')]);
        source.key = 'D';
        source.isMinor = true;
        source.grouping = [2, 2];
        const score = scoreFixture([source, repeat('a2', 'a1')]);
        score.sections.push({
            id: 'b',
            label: 'B',
            key: 'D',
            isMinor: true,
            grouping: [2, 2],
            repeat: 1,
            measures: [repeat('b1', 'a2'), repeat('b2', 'b1')],
        });
        expect(symbols(resolveScoreMeasureEvents(score))).toEqual([
            [['I'], ['I']],
            [['I'], ['I']],
        ]);
    });

    it('copies a complete two-bar source from earlier identities, including chained pairs', () => {
        const score = scoreFixture([
            bar('a1', [chord('C', [3, 1]), chord('G7', [1, 1])]),
            bar('a2', [chord('F')]),
            bar('gap', [chord('Am')]),
            repeat('a3', 'a1', 'two-bar-start'),
            repeat('a4', 'a2', 'two-bar-end'),
            repeat('a5', 'a3', 'two-bar-start'),
            repeat('a6', 'a4', 'two-bar-end'),
            repeat('a7', 'a6'),
        ]);
        expect(symbols(resolveScoreMeasureEvents(score))).toEqual([
            [['C', 'G7'], ['F'], ['Am'], ['C', 'G7'], ['F'], ['C', 'G7'], ['F'], ['F']],
        ]);
        expect(resolveScoreMeasureEvents(score)[0][3]).toEqual([
            chord('C', [3, 1]),
            chord('G7', [1, 1]),
        ]);
    });

    it('allows a complete source pair in another section with matching per-bar contexts', () => {
        const source1 = bar('a1', [chord('C')]);
        const source2 = bar('a2', [chord('I', [3, 1])]);
        source2.key = 'G';
        source2.meter = '3/4';
        const destination1 = repeat('b1', 'a1', 'two-bar-start');
        const destination2 = repeat('b2', 'a2', 'two-bar-end');
        destination2.key = 'G';
        destination2.meter = '3/4';
        const score = scoreFixture([source1, source2]);
        score.sections.push({
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [destination1, destination2],
        });
        expect(resolveScoreMeasureEvents(score)).toEqual([
            [[chord('C')], [chord('I', [3, 1])]],
            [[chord('C')], [chord('I', [3, 1])]],
        ]);
    });

    it('preserves unsupported event types and modifiers for the separate playback checker', () => {
        const events: ScoreEvent[] = [
            {
                kind: 'chord',
                symbol: 'C',
                duration: [1, 1],
                alternates: ['Am', 'Dm'],
                fermata: true,
            },
            { kind: 'no-chord', duration: [1, 1], fermata: false },
            { kind: 'hold', duration: [2, 1], fermata: true },
        ];
        const score = scoreFixture([bar('a1', events), repeat('a2', 'a1'), repeat('a3', 'a2')]);
        const before = structuredClone(score);
        const resolved = resolveScoreMeasureEvents(score);
        expect(resolved).toEqual([[events, events, events]]);
        expect(score).toEqual(before);
        expect(resolved[0][1]).not.toBe(resolved[0][0]);
        expect(resolved[0][2]).not.toBe(resolved[0][1]);
        for (const measure of resolved[0]) {
            for (const [index, event] of measure.entries()) {
                expect(event).not.toBe(events[index]);
                expect(event.duration).not.toBe(events[index].duration);
            }
        }
        const copied = resolved[0][1][0];
        if (copied.kind !== 'chord') {
            throw new Error('Expected preserved chord');
        }
        copied.symbol = 'G';
        copied.duration[0] = 99;
        copied.alternates!.push('F');
        resolved[0][1].push(chord('E'));
        expect(resolved[0][0]).toEqual(events);
        expect(resolved[0][2]).toEqual(events);
        expect(score).toEqual(before);
    });

    it('respects a written meter reset that clears inherited beat grouping', () => {
        const source = bar('a1');
        source.meter = '4/4';
        const target = repeat('a2', 'a1');
        target.meter = '4/4';
        const score = scoreFixture([source, target]);
        score.grouping = [2, 2];
        expect(symbols(resolveScoreMeasureEvents(score))).toEqual([[['C'], ['C']]]);
    });
});

describe('measure-repeat boundaries reject ambiguous music without changing its source', () => {
    it.each([
        ['key', { key: 'D' }],
        ['major/minor mode', { isMinor: true }],
        ['meter', { meter: '2/2' }],
        ['beat grouping', { grouping: [2, 2] }],
    ] as const)('rejects changed %s even if repeated duration would fit', (field, change) => {
        const target = { ...repeat('a2', 'a1'), ...change } as ScoreMeasure;
        const score = scoreFixture([bar('a1', [chord('I')]), target]);
        const before = structuredClone(score);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => resolveScoreMeasureEvents(score)).toThrow(
            `A, bar 2: The repeat source has different ${field}`,
        );
        expect(() => resolveScoreMeasureEvents(score)).toThrow('Write out the music');
        expect(score).toEqual(before);
    });

    it('compares grouping contents rather than just their sum or object identity', () => {
        const score = scoreFixture([bar('a1'), repeat('a2', 'a1')]);
        score.sections[0].measures[0].grouping = [1, 3];
        score.sections[0].measures[1].grouping = [3, 1];
        expect(() => resolveScoreMeasureEvents(score)).toThrow('different beat grouping');
        score.sections[0].measures[1].grouping = [1, 3];
        expect(symbols(resolveScoreMeasureEvents(score))).toEqual([[['C'], ['C']]]);
    });

    it('does not leak sticky measure context across section boundaries', () => {
        const source = bar('a1');
        source.key = 'D';
        const score = scoreFixture([source]);
        score.sections.push({ id: 'b', label: 'B', repeat: 1, measures: [repeat('b1', 'a1')] });
        expect(() => resolveScoreMeasureEvents(score)).toThrow(
            'B, bar 1: The repeat source has different key',
        );
    });

    it.each([
        ['missing', [bar('a1'), repeat('a2', 'missing')]],
        ['forward', [repeat('a1', 'a2'), bar('a2')]],
        ['self', [repeat('a1', 'a1')]],
        ['cyclic', [repeat('a1', 'a2'), repeat('a2', 'a1')]],
    ] as const)('rejects a %s reference through full authored validation', (_name, measures) => {
        const score = scoreFixture([...measures]);
        const before = structuredClone(score);
        expect(() => resolveScoreMeasureEvents(score)).toThrow(
            'earlier source of the same duration',
        );
        expect(score).toEqual(before);
    });

    it('rejects a source-duration mismatch before resolving any reference', () => {
        const target = repeat('a2', 'a1');
        target.meter = '3/4';
        expect(() => resolveScoreMeasureEvents(scoreFixture([bar('a1'), target]))).toThrow(
            'earlier source of the same duration',
        );
    });

    it.each([
        ['unclosed start', [bar('a1'), repeat('a2', 'a1', 'two-bar-start')]],
        ['unopened end', [bar('a1'), repeat('a2', 'a1', 'two-bar-end')]],
        ['interrupted pair', [bar('a1'), repeat('a2', 'a1', 'two-bar-start'), bar('a3')]],
    ] as const)('rejects an %s', (_name, measures) => {
        expect(() => resolveScoreMeasureEvents(scoreFixture([...measures]))).toThrow(
            'two-bar repeat',
        );
    });

    it.each([
        ['nonconsecutive', 'a1', 'a3'],
        ['reversed', 'a2', 'a1'],
        ['duplicated', 'a1', 'a1'],
        ['overlapping', 'a3', 'a4'],
    ])('rejects %s source identities in a two-bar pair', (_name, first, second) => {
        const score = scoreFixture([
            bar('a1'),
            bar('a2', [chord('F')]),
            bar('a3', [chord('G')]),
            repeat('a4', first, 'two-bar-start'),
            repeat('a5', second, 'two-bar-end'),
        ]);
        expect(validateSemanticScore(score).kind).toBe('ok');
        const before = structuredClone(score);
        expect(() => resolveScoreMeasureEvents(score)).toThrow(
            'A, bar 5: A two-bar repeat must reference two consecutive bars',
        );
        expect(score).toEqual(before);
    });

    it('rejects a two-bar destination split across sections', () => {
        const score = scoreFixture([
            bar('a1'),
            bar('a2', [chord('F')]),
            repeat('a3', 'a1', 'two-bar-start'),
        ]);
        score.sections.push({
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [repeat('b1', 'a2', 'two-bar-end')],
        });
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => resolveScoreMeasureEvents(score)).toThrow(
            'B, bar 1: Keep both bars of a two-bar repeat in the same section',
        );
    });

    it('rejects an otherwise consecutive source pair split across sections', () => {
        const score = scoreFixture([bar('a1')]);
        score.sections.push({
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [
                bar('b1', [chord('F')]),
                repeat('b2', 'a1', 'two-bar-start'),
                repeat('b3', 'b1', 'two-bar-end'),
            ],
        });
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => resolveScoreMeasureEvents(score)).toThrow(
            'B, bar 3: A two-bar repeat must reference two consecutive bars',
        );
    });

    it('validates the entire candidate, including unused source bars and unsafe data shapes', () => {
        const badDuration = scoreFixture([bar('a1', [chord('C', [3, 1])])]);
        expect(() => resolveScoreMeasureEvents(badDuration)).toThrow(
            'Events must fill exactly one measure',
        );
        const score = scoreFixture([bar('a1')]);
        Object.defineProperty(score, 'key', {
            enumerable: true,
            get: () => {
                throw new Error('Getter must never execute');
            },
        });
        expect(() => resolveScoreMeasureEvents(score)).toThrow('data properties only');
        expect(() => resolveScoreMeasureEvents(null)).toThrow(
            'The chart source has not been changed',
        );
    });

    it('resolves the maximum 4,096-bar reference chain iteratively without a recursion limit', () => {
        const measures = [bar('m0')];
        for (let index = 1; index < 4096; index++) {
            measures.push(repeat(`m${index}`, `m${index - 1}`));
        }
        const score = scoreFixture(measures);
        const resolved = resolveScoreMeasureEvents(score);
        expect(resolved[0]).toHaveLength(4096);
        expect(resolved[0][4095]).toEqual([chord('C')]);
        expect(resolved[0][4095][0]).not.toBe(resolved[0][0][0]);
        score.sections.push({
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [repeat('m4096', 'm4095')],
        });
        expect(() => resolveScoreMeasureEvents(score)).toThrow(
            'Score exceeds 4,096 authored measures',
        );
    });

    it('caps expanded event copies before a compact reference list can amplify memory use', () => {
        const dense = bar(
            'm0',
            Array.from({ length: 64 }, () => chord('C', [1, 16])),
        );
        const measures = [dense];
        for (let index = 1; index < 1024; index++) {
            measures.push(repeat(`m${index}`, `m${index - 1}`));
        }
        const score = scoreFixture(measures);
        const resolved = resolveScoreMeasureEvents(score);
        expect(resolved[0]).toHaveLength(1024);
        expect(resolved[0][1023]).toHaveLength(64);
        measures.push(repeat('m1024', 'm1023'));
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => resolveScoreMeasureEvents(score)).toThrow(
            'A, bar 1025: Measure repeats expand beyond 65,536 events',
        );
    });
});
