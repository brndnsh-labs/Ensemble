/**
 * #1472: a chart's chorus count and its last-chorus coda in the score form. The before/after
 * proof that an uncounted chart is unchanged lives in `score-form-differential.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { compileTimeline } from '../../../band/form/timeline.js';
import { compileScoreForm } from '../../../public/songbook/score-form.js';
import type {
    ScoreDestination,
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

function scoreFixture(...sections: ScoreMeasure[][]): SemanticScore {
    return {
        notation: 'name',
        key: 'C',
        isMinor: false,
        meter: '4/4',
        grouping: null,
        sections: sections.map((measures, i) => ({
            id: `section-${i}`,
            label: String.fromCharCode(65 + i),
            repeat: 1,
            measures,
        })),
    };
}

const lastChorus: ScoreDirection = {
    kind: 'last-chorus',
    destination: { kind: 'coda', via: 'to-coda', target: 'coda' },
};

/** A head with "To Coda, last chorus" at the end of its last A, and a written two-bar coda. */
function codaChart(choruses?: number): SemanticScore {
    const score = scoreFixture(
        [bar('a1'), bar('a2')],
        [bar('b1'), bar('b2', [], [{ kind: 'coda', label: 'to-coda' }, lastChorus])],
        [bar('turn')],
        [bar('c1', [{ kind: 'coda', label: 'coda' }]), bar('c2')],
    );
    return choruses === undefined ? score : { ...score, choruses };
}

function ids(score: SemanticScore): string[] {
    return compileScoreForm(score).map(
        ({ sectionIndex, measureIndex }) => score.sections[sectionIndex].measures[measureIndex].id,
    );
}

function byChorus(score: SemanticScore): string[][] {
    const out: string[][] = [];
    for (const { sectionIndex, measureIndex, chorus } of compileScoreForm(score)) {
        out[chorus] = [
            ...(out[chorus] ?? []),
            score.sections[sectionIndex].measures[measureIndex].id,
        ];
    }
    return out;
}

function ds(destination: ScoreDestination): ScoreDirection {
    return { kind: 'jump', from: 'segno', segno: 'sign', destination, repeats: 'skip' };
}

function dc(destination: ScoreDestination): ScoreDirection {
    return { kind: 'jump', from: 'start', destination, repeats: 'skip' };
}

describe('chorus count (#1472)', () => {
    it('plays the form once per chorus, numbering each visit from chorus 0', () => {
        const score = { ...scoreFixture([bar('a'), bar('b')]), choruses: 3 };
        expect(ids(score)).toEqual(['a', 'b', 'a', 'b', 'a', 'b']);
        expect(compileScoreForm(score).map(({ chorus }) => chorus)).toEqual([0, 0, 1, 1, 2, 2]);
    });

    it('restarts written repeats and endings in every chorus', () => {
        const score = {
            ...scoreFixture([
                bar('a', [{ kind: 'repeat-start' }]),
                bar(
                    'one',
                    [{ kind: 'ending-start', passes: [1] }],
                    [{ kind: 'repeat-end', times: 2 }],
                ),
                bar('two', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            ]),
            choruses: 2,
        };
        expect(byChorus(score)).toEqual([
            ['a', 'one', 'a', 'two'],
            ['a', 'one', 'a', 'two'],
        ]);
        expect(compileScoreForm(score).map(({ repeatPasses }) => repeatPasses)).toEqual([
            [1],
            [1],
            [2],
            [2],
            [1],
            [1],
            [2],
            [2],
        ]);
    });

    it('takes an explicit D.S. al Coda in every chorus, not just the first', () => {
        const chart = scoreFixture(
            [bar('intro'), bar('a', [{ kind: 'segno', label: 'sign' }])],
            [
                bar('b', [], [{ kind: 'coda', label: 'to-coda' }]),
                bar('jump', [], [ds({ kind: 'coda', via: 'to-coda', target: 'tail' })]),
            ],
            [bar('c', [{ kind: 'coda', label: 'tail' }]), bar('d')],
        );
        const once = ids(chart);
        expect(once).toEqual(['intro', 'a', 'b', 'jump', 'a', 'b', 'c', 'd']);
        expect(byChorus({ ...chart, choruses: 2 })).toEqual([once, once]);
    });

    it('caps the whole counted performance, not each chorus, at the playback limit', () => {
        const form = (length: number) => ({
            ...scoreFixture(Array.from({ length }, (_, i) => bar(`m${i}`))),
            choruses: 64,
        });
        // 256 × 64 is exactly 16,384 performed measures; one more bar a chorus is 64 too many.
        expect(compileScoreForm(form(256))).toHaveLength(16_384);
        // Fewer choruses is a way out for a counted chart, so the message names it.
        expect(() => compileScoreForm(form(257))).toThrow(
            'This chart expands beyond the playback limit of 16,384 measures. Reduce repeats or choruses.',
        );
        // An uncounted chart's message is the one it always had (the differential compares it).
        const { choruses: _, ...uncounted } = form(257);
        uncounted.sections[0].measures[0].start = [{ kind: 'repeat-start' }];
        uncounted.sections[0].measures[256].end = [{ kind: 'repeat-end', times: 64 }];
        expect(() => compileScoreForm(uncounted)).toThrow(
            /^This chart expands beyond the playback limit of 16,384 measures\. Reduce repeats\.$/,
        );
        // One chorus alone is over the limit: fewer choruses cannot help, so it is not offered.
        expect(() => compileScoreForm({ ...uncounted, choruses: 2 })).toThrow(
            /^This chart expands beyond the playback limit of 16,384 measures\. Reduce repeats\.$/,
        );
    });

    it('takes a D.C. al 2nd ending in every chorus (#1473)', () => {
        const chart = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('one', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 2 }]),
            bar('two', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'fine', label: 'stop' }]),
            bar('bridge'),
            bar('jump', [], [dc({ kind: 'ending', pass: 2 })]),
        ]);
        const once = ids(chart);
        expect(once).toEqual(['a', 'one', 'a', 'two', 'bridge', 'jump', 'a', 'two']);
        expect(byChorus({ ...chart, choruses: 3 })).toEqual([once, once, once]);
        expect(compileScoreForm({ ...chart, choruses: 3 }).map(({ chorus }) => chorus)).toEqual(
            [0, 1, 2].flatMap((chorus) => Array(once.length).fill(chorus)),
        );
    });
});

describe('last-chorus coda (#1472)', () => {
    it('hops to the coda only on the final chorus of a counted performance', () => {
        expect(byChorus(codaChart(3))).toEqual([
            ['a1', 'a2', 'b1', 'b2', 'turn'],
            ['a1', 'a2', 'b1', 'b2', 'turn'],
            ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
        ]);
    });

    it('never performs the coda when the choruses are not counted', () => {
        const visits = compileScoreForm(codaChart());
        expect(ids(codaChart())).toEqual(['a1', 'a2', 'b1', 'b2', 'turn']);
        expect(visits.every(({ chorus }) => chorus === 0)).toBe(true);
    });

    it('treats a single counted chorus as the last one', () => {
        expect(ids(codaChart(1))).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'c2']);
    });

    it('ends a non-final chorus where its coda sign falls: before a start sign, after an end sign', () => {
        const score = scoreFixture([
            bar('a', [], [{ kind: 'coda', label: 'to-coda' }, lastChorus]),
            bar('b'),
            bar('turn', [], [{ kind: 'coda', label: 'coda' }]),
            bar('c'),
        ]);
        expect(byChorus({ ...score, choruses: 2 })).toEqual([
            ['a', 'b', 'turn'],
            ['a', 'c'],
        ]);
    });

    it('keeps written repeats inside the chorus and the coda', () => {
        const score = {
            ...scoreFixture(
                [
                    bar('a', [{ kind: 'repeat-start' }]),
                    bar('b', [], [{ kind: 'repeat-end', times: 2 }]),
                    bar('out', [], [{ kind: 'coda', label: 'to-coda' }, lastChorus]),
                    bar('turn'),
                ],
                [
                    bar('vamp', [{ kind: 'coda', label: 'coda' }, { kind: 'repeat-start' }], []),
                    bar('end', [], [{ kind: 'repeat-end', times: 3 }]),
                ],
            ),
            choruses: 2,
        };
        expect(byChorus(score)).toEqual([
            ['a', 'b', 'a', 'b', 'out', 'turn'],
            ['a', 'b', 'a', 'b', 'out', 'vamp', 'end', 'vamp', 'end', 'vamp', 'end'],
        ]);
    });

    it('is refused beside a D.C./D.S. jump, whose last time through the departure is ambiguous', () => {
        const score = codaChart(2);
        score.sections[0].measures[0].start = [{ kind: 'segno', label: 'sign' }];
        score.sections[2].measures[0].end = [ds({ kind: 'end' })];
        expect(() => compileScoreForm(score)).toThrow(
            /B, bar 2: A last-chorus coda cannot share a chart with a D\.C\.\/D\.S\. jump yet/,
        );
        // Refused whether or not the chorus count would ever reach it.
        const { choruses: _, ...uncounted } = score;
        expect(() => compileScoreForm(uncounted)).toThrow(/cannot share a chart/);
    });

    it('is refused twice in one chart', () => {
        const score = codaChart(2);
        score.sections[0].measures[0].end = [
            { kind: 'coda', label: 'early' },
            { kind: 'last-chorus', destination: { kind: 'coda', via: 'early', target: 'coda' } },
        ];
        expect(() => compileScoreForm(score)).toThrow(/takes one last-chorus coda/);
    });

    it('must sit on its departure sign', () => {
        const score = codaChart(2);
        score.sections[1].measures[1].end = [{ kind: 'coda', label: 'to-coda' }];
        score.sections[1].measures[0].end = [lastChorus];
        expect(() => compileScoreForm(score)).toThrow(
            /B, bar 1: Place the last-chorus coda on the same bar boundary as its departure coda sign/,
        );
    });

    it('lets the last chorus play straight on into a coda written right after its departure', () => {
        const score = scoreFixture(
            [bar('a'), bar('b', [], [{ kind: 'coda', label: 'to-coda' }, lastChorus])],
            [bar('tag', [{ kind: 'coda', label: 'coda' }])],
        );
        expect(byChorus({ ...score, choruses: 2 })).toEqual([
            ['a', 'b'],
            ['a', 'b', 'tag'],
        ]);
    });

    it('is refused when the coda comes before its departure', () => {
        const score = scoreFixture([
            bar('c', [{ kind: 'coda', label: 'coda' }]),
            bar('a', [], [{ kind: 'coda', label: 'to-coda' }, lastChorus]),
        ]);
        expect(() => compileScoreForm({ ...score, choruses: 2 })).toThrow(
            /a backward coda would create a navigation cycle/,
        );
        // Same barline, wrong side: the arrival closes bar 1 and the departure opens bar 2, so
        // the performed route reaches the coda first and the hop would land behind itself.
        const sameBarline = scoreFixture([
            bar('a', [], [{ kind: 'coda', label: 'coda' }]),
            bar('b', [{ kind: 'coda', label: 'to-coda' }, lastChorus]),
        ]);
        expect(() => compileScoreForm({ ...sameBarline, choruses: 2 })).toThrow(
            /A, bar 2: The coda arrival must follow its departure in the performed repeat route/,
        );
    });

    it.each([
        [
            'inside a written repeat',
            scoreFixture(
                [
                    bar('a', [{ kind: 'repeat-start' }]),
                    bar(
                        'b',
                        [],
                        [
                            { kind: 'coda', label: 'to-coda' },
                            lastChorus,
                            { kind: 'repeat-end', times: 2 },
                        ],
                    ),
                ],
                [bar('c', [{ kind: 'coda', label: 'coda' }])],
            ),
        ],
        [
            'inside a repeated section',
            (() => {
                const score = codaChart();
                score.sections[1].repeat = 2;
                return score;
            })(),
        ],
    ])('is refused %s, where which pass is the last time is ambiguous', (_, score) => {
        expect(() => compileScoreForm({ ...score, choruses: 2 })).toThrow(
            /departs inside a repeated passage/,
        );
    });
});

describe('the band timeline carries the chorus (#1472)', () => {
    it('gives every chorus its own section visits, even of a one-section form', () => {
        const single = { ...scoreFixture([bar('a'), bar('b')]), choruses: 3 };
        const timeline = compileTimeline(single);
        expect(timeline.visits.map(({ chorus, barCount }) => [chorus, barCount])).toEqual([
            [0, 2],
            [1, 2],
            [2, 2],
        ]);
        expect(timeline.bars.map(({ visit }) => visit.chorus)).toEqual([0, 0, 1, 1, 2, 2]);
    });

    it('plays the coda bars only in the final chorus', () => {
        const timeline = compileTimeline(codaChart(2));
        expect(timeline.visits.map(({ label, chorus }) => `${label}${chorus}`)).toEqual([
            'A0',
            'B0',
            'C0',
            'A1',
            'B1',
            'D1',
        ]);
    });
});
