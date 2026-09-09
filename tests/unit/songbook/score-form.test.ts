import { describe, expect, it } from 'vitest';
import { validateSemanticScore } from '../../../public/songbook/score-codec.js';
import { compileScoreForm } from '../../../public/songbook/score-form.js';
import type {
    ScoreDirection,
    ScoreMeasure,
    SemanticScore,
} from '../../../public/songbook/score-types.js';

function bar(id: string, start: ScoreDirection[] = [], end: ScoreDirection[] = []): ScoreMeasure {
    return {
        id,
        content: { kind: 'events', events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }] },
        ...(start.length ? { start } : {}),
        ...(end.length ? { end } : {}),
    };
}

function scoreFixture(measures: ScoreMeasure[]): SemanticScore {
    return {
        notation: 'name',
        key: 'C',
        isMinor: false,
        meter: '4/4',
        grouping: null,
        sections: [{ id: 'section-a', label: 'A', repeat: 1, measures }],
    };
}

function performedIds(score: SemanticScore): string[] {
    return compileScoreForm(score).map(
        ({ sectionIndex, measureIndex }) => score.sections[sectionIndex].measures[measureIndex].id,
    );
}

function alternateEndings(): SemanticScore {
    // Original five-bar form: shared A B, first ending C, second ending D, then tail E.
    return scoreFixture([
        bar('a', [{ kind: 'repeat-start' }]),
        bar('b'),
        bar('c', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 2 }]),
        bar('d', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
        bar('e'),
    ]);
}

function nestedRepeats(depth: number, times: number): SemanticScore {
    return scoreFixture([
        ...Array.from({ length: depth }, (_, i) => bar(`open-${i}`, [{ kind: 'repeat-start' }])),
        ...Array.from({ length: depth }, (_, i) =>
            bar(`close-${i}`, [], [{ kind: 'repeat-end', times }]),
        ),
    ]);
}

function freezeRecursively(value: unknown): void {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value)) {
            freezeRecursively(child);
        }
        Object.freeze(value);
    }
}

describe('semantic score form: written measures to performed visits', () => {
    it('uses zero-based source indices and section passes, with no invented bar-repeat pass', () => {
        const score = scoreFixture([bar('a'), bar('b')]);
        score.sections[0].repeat = 2;
        score.sections.push({ id: 'section-b', label: 'B', repeat: 1, measures: [bar('c')] });

        expect(compileScoreForm(score)).toEqual([
            { sectionIndex: 0, measureIndex: 0, sectionPass: 0, repeatPasses: [] },
            { sectionIndex: 0, measureIndex: 1, sectionPass: 0, repeatPasses: [] },
            { sectionIndex: 0, measureIndex: 0, sectionPass: 1, repeatPasses: [] },
            { sectionIndex: 0, measureIndex: 1, sectionPass: 1, repeatPasses: [] },
            { sectionIndex: 1, measureIndex: 0, sectionPass: 0, repeatPasses: [] },
        ]);
    });

    it('repeats only the marked passage, keeping its introduction and tail outside', () => {
        const score = scoreFixture([
            bar('intro'),
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [], [{ kind: 'repeat-end', times: 2 }]),
            bar('tail'),
        ]);

        expect(performedIds(score)).toEqual(['intro', 'a', 'b', 'a', 'b', 'tail']);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [],
            [1],
            [1],
            [2],
            [2],
            [],
        ]);
    });

    it.each([1, 3])('interprets repeat-end times=%i as total plays, not extra repeats', (times) => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [], [{ kind: 'repeat-end', times }]),
            bar('tail'),
        ]);

        expect(performedIds(score)).toEqual(
            times === 1 ? ['a', 'b', 'tail'] : ['a', 'b', 'a', 'b', 'a', 'b', 'tail'],
        );
        expect(compileScoreForm(score).at(-2)?.repeatPasses).toEqual([times]);
    });

    it('accepts a repeat end with the conventional implicit start at the section beginning', () => {
        const score = scoreFixture([
            bar('a'),
            bar('b', [], [{ kind: 'repeat-end', times: 2 }]),
            bar('tail'),
        ]);

        expect(performedIds(score)).toEqual(['a', 'b', 'a', 'b', 'tail']);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [1],
            [2],
            [2],
            [],
        ]);
    });

    it('supports a repeat whose start and end enclose one written measure', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }], [{ kind: 'repeat-end', times: 3 }]),
            bar('tail'),
        ]);
        expect(performedIds(score)).toEqual(['a', 'a', 'a', 'tail']);
    });

    it('keeps adjacent repeated passages independent', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }], [{ kind: 'repeat-end', times: 2 }]),
            bar('b', [{ kind: 'repeat-start' }], [{ kind: 'repeat-end', times: 3 }]),
        ]);

        expect(performedIds(score)).toEqual(['a', 'a', 'b', 'b', 'b']);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [2],
            [1],
            [2],
            [3],
        ]);
    });

    it('resets an inner repeat on every outer pass and records pass nesting outermost first', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'repeat-start' }]),
            bar('c', [], [{ kind: 'repeat-end', times: 2 }]),
            bar('d', [], [{ kind: 'repeat-end', times: 2 }]),
            bar('tail'),
        ]);

        expect(performedIds(score)).toEqual([
            'a',
            'b',
            'c',
            'b',
            'c',
            'd',
            'a',
            'b',
            'c',
            'b',
            'c',
            'd',
            'tail',
        ]);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [1, 1],
            [1, 1],
            [1, 2],
            [1, 2],
            [1],
            [2],
            [2, 1],
            [2, 1],
            [2, 2],
            [2, 2],
            [2],
            [],
        ]);
    });

    it('performs first and second endings without playing the skipped branch', () => {
        const score = alternateEndings();

        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a', 'b', 'd', 'e']);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [1],
            [1],
            [2],
            [2],
            [2],
            [],
        ]);
    });

    it('keeps every measure in a multi-bar ending on its own passes only', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b'),
            bar('c', [{ kind: 'ending-start', passes: [1] }]),
            bar('d', [], [{ kind: 'repeat-end', times: 2 }]),
            bar('e', [{ kind: 'ending-start', passes: [2] }]),
            bar('f', [], [{ kind: 'ending-end' }]),
            bar('tail'),
        ]);

        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'd', 'a', 'b', 'e', 'f', 'tail']);
    });

    it('plays a shared first ending on passes one and two before taking ending three', () => {
        const score = alternateEndings();
        score.sections[0].measures[2].start = [{ kind: 'ending-start', passes: [1, 2] }];
        score.sections[0].measures[2].end = [{ kind: 'repeat-end', times: 3 }];
        score.sections[0].measures[3].start = [{ kind: 'ending-start', passes: [3] }];

        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'd', 'e']);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [1],
            [1],
            [2],
            [2],
            [2],
            [3],
            [3],
            [3],
            [],
        ]);
    });

    it('selects three independently closed ending branches by the current repeat pass', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 3 }]),
            bar('c', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            bar('d', [{ kind: 'ending-start', passes: [3] }], [{ kind: 'ending-end' }]),
            bar('tail'),
        ]);

        expect(performedIds(score)).toEqual(['a', 'b', 'a', 'c', 'a', 'd', 'tail']);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [1],
            [2],
            [2],
            [3],
            [3],
            [],
        ]);
    });

    it('selects nonconsecutive pass sets numerically, not by physical ending order', () => {
        const score = alternateEndings();
        score.sections[0].measures[2].start = [{ kind: 'ending-start', passes: [1, 3] }];
        score.sections[0].measures[2].end = [{ kind: 'repeat-end', times: 3 }];

        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a', 'b', 'd', 'a', 'b', 'c', 'e']);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [1],
            [1],
            [2],
            [2],
            [2],
            [3],
            [3],
            [3],
            [],
        ]);
    });

    it('closes the previous ending and opens the next at the same start boundary', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 3 }]),
            bar('c', [{ kind: 'ending-start', passes: [2] }]),
            bar(
                'd',
                [{ kind: 'ending-end' }, { kind: 'ending-start', passes: [3] }],
                [{ kind: 'ending-end' }],
            ),
            bar('tail'),
        ]);
        expect(performedIds(score)).toEqual(['a', 'b', 'a', 'c', 'a', 'd', 'tail']);
    });

    it('accepts an explicit first-ending closure alongside the repeat end', () => {
        const score = alternateEndings();
        score.sections[0].measures[2].end?.push({ kind: 'ending-end' });
        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a', 'b', 'd', 'e']);
    });

    it('allows the last ending to close at the section boundary', () => {
        const score = alternateEndings();
        score.sections[0].measures.pop();
        delete score.sections[0].measures[3].end;
        score.sections.push({ id: 'section-b', label: 'B', repeat: 1, measures: [bar('tail')] });

        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a', 'b', 'd', 'tail']);
        expect(compileScoreForm(score).at(-1)).toEqual({
            sectionIndex: 1,
            measureIndex: 0,
            sectionPass: 0,
            repeatPasses: [],
        });
    });

    it('closes an ending before a bar carrying a start-boundary ending-end', () => {
        const score = alternateEndings();
        delete score.sections[0].measures[3].end;
        score.sections[0].measures[4].start = [{ kind: 'ending-end' }];

        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a', 'b', 'd', 'e']);
        expect(compileScoreForm(score).at(-1)?.repeatPasses).toEqual([]);
    });

    it('restarts alternate-ending decisions on the next whole-section pass', () => {
        const score = alternateEndings();
        score.sections[0].repeat = 2;

        expect(performedIds(score)).toEqual([
            'a',
            'b',
            'c',
            'a',
            'b',
            'd',
            'e',
            'a',
            'b',
            'c',
            'a',
            'b',
            'd',
            'e',
        ]);
        expect(compileScoreForm(score).map((visit) => visit.sectionPass)).toEqual([
            0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1,
        ]);
        expect(compileScoreForm(score)[10].repeatPasses).toEqual([2]);
    });

    it('supports alternate endings inside an outer repeated passage', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'repeat-start' }]),
            bar('c', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 2 }]),
            bar('d', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            bar('e', [], [{ kind: 'repeat-end', times: 2 }]),
            bar('tail'),
        ]);

        expect(performedIds(score)).toEqual([
            'a',
            'b',
            'c',
            'b',
            'd',
            'e',
            'a',
            'b',
            'c',
            'b',
            'd',
            'e',
            'tail',
        ]);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [1, 1],
            [1, 1],
            [1, 2],
            [1, 2],
            [1],
            [2],
            [2, 1],
            [2, 1],
            [2, 2],
            [2, 2],
            [2],
            [],
        ]);
    });

    it('gives a following ending to the enclosing repeat after all inner passes are covered', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'repeat-start' }]),
            bar('c', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 2 }]),
            bar('d', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            bar('e', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 2 }]),
            bar('f', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            bar('tail'),
        ]);

        expect(performedIds(score)).toEqual([
            'a',
            'b',
            'c',
            'b',
            'd',
            'e',
            'a',
            'b',
            'c',
            'b',
            'd',
            'f',
            'tail',
        ]);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [1, 1],
            [1, 1],
            [1, 2],
            [1, 2],
            [1],
            [2],
            [2, 1],
            [2, 1],
            [2, 2],
            [2, 2],
            [2],
            [],
        ]);
    });

    it('allows an ending branch to contain a complete nested repeat', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'ending-start', passes: [1] }, { kind: 'repeat-start' }]),
            bar('c', [], [{ kind: 'repeat-end', times: 2 }]),
            bar('d', [], [{ kind: 'repeat-end', times: 2 }]),
            bar('e', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            bar('tail'),
        ]);

        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'b', 'c', 'd', 'a', 'e', 'tail']);
        expect(compileScoreForm(score).map((visit) => visit.repeatPasses)).toEqual([
            [1],
            [1, 1],
            [1, 1],
            [1, 2],
            [1, 2],
            [1],
            [2],
            [2],
            [],
        ]);
    });

    it('gives an inner final ending its closure at the outer first-ending repeat barline (FP1)', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'ending-start', passes: [1] }, { kind: 'repeat-start' }]),
            bar('c', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 2 }]),
            bar(
                'd',
                [{ kind: 'ending-start', passes: [2] }],
                [{ kind: 'ending-end' }, { kind: 'repeat-end', times: 2 }],
            ),
            bar('e', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            bar('tail'),
        ]);
        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'b', 'd', 'a', 'e', 'tail']);
    });

    it('rejects an ending closure that cuts through a nested repeat (FP2)', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 2 }]),
            bar('c', [{ kind: 'ending-start', passes: [2] }]),
            bar('d', [{ kind: 'repeat-start' }], [{ kind: 'ending-end' }]),
            bar('e', [], [{ kind: 'repeat-end', times: 2 }]),
            bar('tail'),
        ]);
        expect(() => compileScoreForm(score)).toThrow(/ending|boundary|repeat/i);
    });

    it('keeps a self-opening nested ending inside the already open outer ending (FP3)', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'repeat-end', times: 2 }]),
            bar('c', [{ kind: 'ending-start', passes: [1] }]),
            bar(
                'd',
                [{ kind: 'repeat-start' }, { kind: 'ending-start', passes: [1] }],
                [{ kind: 'repeat-end', times: 2 }],
            ),
            bar('e', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
        ]);
        expect(performedIds(score)).toEqual(['a', 'c', 'd', 'e', 'a', 'b']);
    });

    it('returns a detached itinerary without changing authored directions, context or annotations', () => {
        const score = alternateEndings();
        score.sections[0].measures[1].key = 'D';
        score.sections[0].measures[1].isMinor = true;
        score.sections[0].measures[1].annotations = [
            { text: 'Play softly', at: [0, 1], placement: 'above' },
        ];
        const before = structuredClone(score);
        freezeRecursively(score);

        const first = compileScoreForm(score);
        expect(score).toEqual(before);
        first[0].repeatPasses.push(99);
        first[0].measureIndex = 4;
        expect(compileScoreForm(score)[0]).toEqual({
            sectionIndex: 0,
            measureIndex: 0,
            sectionPass: 0,
            repeatPasses: [1],
        });
        expect(first[1].repeatPasses).toEqual([1]);
        expect(score).toEqual(before);
    });

    it('leaves earlier-measure content references attached to their written destination visit', () => {
        const score = scoreFixture([bar('source'), bar('destination')]);
        score.sections[0].measures[1].content = {
            kind: 'repeat',
            measureId: 'source',
            display: 'one-bar',
        };

        expect(performedIds(score)).toEqual(['source', 'destination']);
        expect(score.sections[0].measures[1].content).toEqual({
            kind: 'repeat',
            measureId: 'source',
            display: 'one-bar',
        });
    });
});

describe('semantic score form: rejection is visible, complete and bounded', () => {
    it.each([null, {}, 'not a score'])('rejects invalid authored input %j', (candidate) => {
        expect(() => compileScoreForm(candidate)).toThrow(Error);
    });

    it('runs the authored codec rather than accepting structurally plausible form-only input', () => {
        const score = alternateEndings();
        score.sections[0].measures[0].content = {
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [3, 1] }],
        };
        expect(() => compileScoreForm(score)).toThrow(/measure|fill|duration|events/i);
    });

    it('rejects an unclosed explicit repeat start instead of playing through it', () => {
        const score = scoreFixture([bar('a', [{ kind: 'repeat-start' }]), bar('b')]);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/repeat/i);
    });

    it('does not match bar repeats across a section boundary', () => {
        const score = scoreFixture([bar('a', [{ kind: 'repeat-start' }])]);
        score.sections.push({
            id: 'section-b',
            label: 'B',
            repeat: 1,
            measures: [bar('b', [], [{ kind: 'repeat-end', times: 2 }])],
        });
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/repeat|section/i);
    });

    it('rejects an ending without an owning repeated passage', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'ending-end' }]),
        ]);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/ending|repeat/i);
    });

    it.each(['start', 'end'] as const)(
        'rejects an unmatched ending-end at a bar %s',
        (boundary) => {
            const score = scoreFixture([bar('a')]);
            score.sections[0].measures[0][boundary] = [{ kind: 'ending-end' }];
            expect(validateSemanticScore(score).kind).toBe('ok');
            expect(() => compileScoreForm(score)).toThrow(/ending/i);
        },
    );

    it('rejects an ending pass selected by more than one branch', () => {
        const score = alternateEndings();
        score.sections[0].measures[3].start = [{ kind: 'ending-start', passes: [1, 2] }];
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/ending|pass/i);
    });

    it('rejects a repeat pass with no ending instead of dropping that pass or choosing a fallback', () => {
        const score = alternateEndings();
        score.sections[0].measures[2].end = [{ kind: 'repeat-end', times: 3 }];
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/ending|pass/i);
    });

    it('rejects unreachable ending pass numbers outside the repeat count', () => {
        const score = alternateEndings();
        score.sections[0].measures[3].start = [{ kind: 'ending-start', passes: [2, 3] }];
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/ending|pass/i);
    });

    it('rejects duplicate pass numbers within one ending at the authored boundary', () => {
        const score = alternateEndings();
        score.sections[0].measures[2].start = [{ kind: 'ending-start', passes: [1, 1] }];
        expect(() => compileScoreForm(score)).toThrow(/distinct|ending|pass/i);
    });

    it.each([
        ['repeat-start', [{ kind: 'repeat-start' }, { kind: 'repeat-start' }], 'start'],
        [
            'repeat-end',
            [
                { kind: 'repeat-end', times: 2 },
                { kind: 'repeat-end', times: 2 },
            ],
            'end',
        ],
        [
            'ending-start',
            [
                { kind: 'ending-start', passes: [1] },
                { kind: 'ending-start', passes: [2] },
            ],
            'start',
        ],
        ['ending-end', [{ kind: 'ending-end' }, { kind: 'ending-end' }], 'end'],
    ] satisfies [string, ScoreDirection[], 'start' | 'end'][])(
        'rejects ambiguous duplicated %s directions on one boundary',
        (_kind, marks, boundary) => {
            const score = alternateEndings();
            score.sections[0].measures[0][boundary] = structuredClone(marks);
            expect(validateSemanticScore(score).kind).toBe('ok');
            expect(() => compileScoreForm(score)).toThrow(/repeat|ending|duplicate|ambiguous/i);
        },
    );

    it.each(['segno', 'coda', 'fine'] as const)(
        'rejects unsupported %s, even with otherwise valid repeats',
        (kind) => {
            const score = alternateEndings();
            score.sections[0].measures[2].start?.push({ kind, label: 'unsupported-marker' });
            expect(validateSemanticScore(score).kind).toBe('ok');
            expect(() => compileScoreForm(score)).toThrow(
                /segno|coda|fine|navigation|direction|supported/i,
            );
        },
    );

    it('rejects a structurally valid D.C. jump rather than silently omitting it', () => {
        const score = alternateEndings();
        score.sections[0].measures[4].end = [
            {
                kind: 'jump',
                from: 'start',
                destination: { kind: 'end' },
                repeats: 'skip',
            },
        ];
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(
            /D\.C\.|jump|navigation|direction|supported/i,
        );
    });

    it('supports the full sixteen-level nesting boundary when the performed result is small', () => {
        const score = nestedRepeats(16, 1);
        expect(validateSemanticScore(score).kind).toBe('ok');
        const visits = compileScoreForm(score);
        expect(visits).toHaveLength(32);
        expect(visits[15].repeatPasses).toEqual(Array(16).fill(1));
        expect(visits[16].repeatPasses).toEqual(Array(16).fill(1));
        expect(visits.at(-1)?.repeatPasses).toEqual([1]);
    });

    it('rejects a seventeenth repeat level even when every repeat plays once', () => {
        const score = nestedRepeats(17, 1);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/nest|depth|16|sixteen/i);
    });

    it('accepts exactly 16,384 performed measures including whole-section repetitions', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b'),
            bar('c'),
            bar('d', [], [{ kind: 'repeat-end', times: 64 }]),
        ]);
        score.sections[0].repeat = 64;

        const visits = compileScoreForm(score);
        expect(visits).toHaveLength(16_384);
        expect(visits[0]).toEqual({
            sectionIndex: 0,
            measureIndex: 0,
            sectionPass: 0,
            repeatPasses: [1],
        });
        expect(visits.at(-1)).toEqual({
            sectionIndex: 0,
            measureIndex: 3,
            sectionPass: 63,
            repeatPasses: [64],
        });
    });

    it('enforces the performed-measure ceiling across sections, not separately per section', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b'),
            bar('c'),
            bar('d', [], [{ kind: 'repeat-end', times: 64 }]),
        ]);
        score.sections[0].repeat = 64;
        score.sections.push({ id: 'section-b', label: 'B', repeat: 1, measures: [bar('tail')] });
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/16.?384|measure|visit|expan|limit/i);
    });

    it('rejects exponential nested expansion without attempting to materialize it all', () => {
        const score = nestedRepeats(16, 64);
        const before = structuredClone(score);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/16.?384|measure|visit|expan|limit/i);
        expect(score).toEqual(before);
    });
});
