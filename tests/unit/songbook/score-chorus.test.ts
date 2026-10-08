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

    it('departs from a final ending, which the route only moves on from', () => {
        // An open last ending (Aisha, Cheetah): passed once, and nothing behind it follows.
        const score = scoreFixture(
            [
                bar('a', [{ kind: 'repeat-start' }]),
                bar(
                    'first',
                    [{ kind: 'ending-start', passes: [1] }],
                    [{ kind: 'repeat-end', times: 2 }],
                ),
                bar(
                    'second',
                    [{ kind: 'ending-start', passes: [2] }],
                    [{ kind: 'coda', label: 'to-coda' }, lastChorus],
                ),
                bar('turn'),
            ],
            [bar('c', [{ kind: 'coda', label: 'coda' }])],
        );
        expect(byChorus({ ...score, choruses: 2 })).toEqual([
            ['a', 'first', 'a', 'second', 'turn'],
            ['a', 'first', 'a', 'second', 'c'],
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
        [
            // Passed twice, though no bar behind the start of its own bar is played again.
            'at the start of a repeat',
            scoreFixture(
                [
                    bar('a', [
                        { kind: 'repeat-start' },
                        { kind: 'coda', label: 'to-coda' },
                        lastChorus,
                    ]),
                    bar('b', [], [{ kind: 'repeat-end', times: 2 }]),
                ],
                [bar('c', [{ kind: 'coda', label: 'coda' }])],
            ),
        ],
        [
            // Passed once, on pass 1 only: the route then goes back for pass 2 and its ending,
            // which the last chorus would never play (#1476 review).
            'inside a first ending',
            scoreFixture(
                [
                    bar('a', [{ kind: 'repeat-start' }]),
                    bar('b'),
                    bar(
                        'first',
                        [{ kind: 'ending-start', passes: [1] }],
                        [
                            { kind: 'coda', label: 'to-coda' },
                            lastChorus,
                            { kind: 'repeat-end', times: 2 },
                        ],
                    ),
                    bar('second', [{ kind: 'ending-start', passes: [2] }]),
                    bar('out'),
                ],
                [bar('c', [{ kind: 'coda', label: 'coda' }])],
            ),
        ],
        [
            'inside a first ending, beside a repeat with no bars of its own after it',
            scoreFixture(
                [
                    bar('a', [{ kind: 'repeat-start' }]),
                    bar(
                        'first',
                        [{ kind: 'ending-start', passes: [1] }],
                        [
                            { kind: 'coda', label: 'to-coda' },
                            lastChorus,
                            { kind: 'repeat-end', times: 2 },
                        ],
                    ),
                    bar('second', [{ kind: 'ending-start', passes: [2] }]),
                ],
                [bar('c', [{ kind: 'coda', label: 'coda' }])],
            ),
        ],
    ])('is refused %s, where which pass is the last time is ambiguous', (_, score) => {
        expect(() => compileScoreForm({ ...score, choruses: 2 })).toThrow(
            /departs inside a repeated passage/,
        );
    });
});

describe('last-chorus coda with no departure sign: a tag (#1487)', () => {
    const tag: ScoreDirection = {
        kind: 'last-chorus',
        destination: { kind: 'coda', target: 'coda' },
    };
    const sign: ScoreDirection = { kind: 'coda', label: 'coda' };

    /** A two-bar head, its turnaround, and a two-bar tag marked only by its own coda sign. */
    function tagChart(choruses?: number): SemanticScore {
        const score = scoreFixture(
            [bar('a1'), bar('a2'), bar('turn')],
            [bar('t1', [sign, tag]), bar('t2')],
        );
        return choruses === undefined ? score : { ...score, choruses };
    }

    it('plays the whole form every chorus and adds the tag once, after the last', () => {
        // Unlike a coda with a departure sign, the last chorus skips nothing: `turn` is played.
        expect(byChorus(tagChart(3))).toEqual([
            ['a1', 'a2', 'turn'],
            ['a1', 'a2', 'turn'],
            ['a1', 'a2', 'turn', 't1', 't2'],
        ]);
        expect(ids(tagChart(1))).toEqual(['a1', 'a2', 'turn', 't1', 't2']);
    });

    it('never performs the tag when the choruses are not counted', () => {
        expect(ids(tagChart())).toEqual(['a1', 'a2', 'turn']);
    });

    it('ends the band timeline in its coda only when the tag is played', () => {
        expect(compileTimeline(tagChart(2)).coda).toBe(true);
        expect(compileTimeline(tagChart()).coda).toBeUndefined();
    });

    it('lets the tag itself repeat: its sign is passed again, but only the first time is the way in', () => {
        const score = scoreFixture(
            [bar('a'), bar('b')],
            [
                bar('v1', [sign, tag, { kind: 'repeat-start' }]),
                bar('v2', [], [{ kind: 'repeat-end', times: 2 }]),
            ],
        );
        expect(byChorus({ ...score, choruses: 2 })).toEqual([
            ['a', 'b'],
            ['a', 'b', 'v1', 'v2', 'v1', 'v2'],
        ]);
    });

    it('lets a tag be a whole repeated section, but not sit later in one', () => {
        const score = scoreFixture([bar('a'), bar('b')], [bar('t1', [sign, tag]), bar('t2')]);
        score.sections[1].repeat = 2;
        expect(byChorus({ ...score, choruses: 2 })).toEqual([
            ['a', 'b'],
            ['a', 'b', 't1', 't2', 't1', 't2'],
        ]);
        delete score.sections[1].measures[0].start;
        score.sections[1].measures[1].start = [sign, tag];
        expect(() => compileScoreForm({ ...score, choruses: 2 })).toThrow(
            /departs inside a repeated passage/,
        );
    });

    it('takes a sign on the end barline of the bar before the tag too', () => {
        const score = scoreFixture([bar('a'), bar('b', [], [sign, tag]), bar('t')]);
        expect(byChorus({ ...score, choruses: 2 })).toEqual([
            ['a', 'b'],
            ['a', 'b', 't'],
        ]);
    });

    it('must sit on its coda sign', () => {
        const score = tagChart(2);
        score.sections[1].measures[0].start = [sign];
        score.sections[1].measures[1].start = [tag];
        expect(() => compileScoreForm(score)).toThrow(
            /B, bar 2: Place a last-chorus coda with no departure sign on the same bar boundary as its coda sign/,
        );
    });

    it('is refused in the first bar, where every chorus but the last would be empty', () => {
        const score = scoreFixture([bar('t1', [sign, tag]), bar('t2')]);
        for (const candidate of [score, { ...score, choruses: 2 }]) {
            expect(() => compileScoreForm(candidate)).toThrow(
                /A, bar 1: A last-chorus coda with no departure sign needs at least one bar of form before it/,
            );
        }
    });

    it('is refused when a repeat goes back behind its sign', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('t', [sign, tag], [{ kind: 'repeat-end', times: 2 }]),
        ]);
        expect(() => compileScoreForm({ ...score, choruses: 2 })).toThrow(
            /departs inside a repeated passage/,
        );
    });

    it('is still refused beside a D.C./D.S. jump', () => {
        const score = tagChart(2);
        score.sections[0].measures[0].start = [{ kind: 'segno', label: 'sign' }];
        score.sections[0].measures[2].end = [ds({ kind: 'end' })];
        expect(() => compileScoreForm(score)).toThrow(
            /A last-chorus coda cannot share a chart with a D\.C\.\/D\.S\. jump yet/,
        );
    });
});

describe('a counted chart plays its intro and its outro once (#1483)', () => {
    /** Sections by label, one or two bars each, named after the label. */
    function song(...labels: string[]): SemanticScore {
        const score = scoreFixture(...labels.map((label) => [bar(`${label}1`), bar(`${label}2`)]));
        score.sections.forEach((section, i) => {
            section.label = labels[i];
        });
        return score;
    }

    it('plays the intro in the first chorus only and the outro in the last only', () => {
        const score = { ...song('Intro', 'Verse', 'Outro'), choruses: 3 };
        expect(byChorus(score)).toEqual([
            ['Intro1', 'Intro2', 'Verse1', 'Verse2'],
            ['Verse1', 'Verse2'],
            ['Verse1', 'Verse2', 'Outro1', 'Outro2'],
        ]);
    });

    it('plays a single counted chorus whole: it is the first and the last', () => {
        const score = { ...song('Intro', 'Verse', 'Outro'), choruses: 1 };
        expect(ids(score)).toEqual(['Intro1', 'Intro2', 'Verse1', 'Verse2', 'Outro1', 'Outro2']);
    });

    it('leaves an uncounted chart looping as written', () => {
        expect(ids(song('Intro', 'Verse', 'Outro'))).toEqual([
            'Intro1',
            'Intro2',
            'Verse1',
            'Verse2',
            'Outro1',
            'Outro2',
        ]);
    });

    it('reads the label the way the band does: its start, any case, any spacing', () => {
        const score = { ...song(' intro 2', 'Interlude', 'OUTRO vamp'), choruses: 2 };
        expect(byChorus(score)).toEqual([
            [' intro 21', ' intro 22', 'Interlude1', 'Interlude2'],
            ['Interlude1', 'Interlude2', 'OUTRO vamp1', 'OUTRO vamp2'],
        ]);
    });

    it('takes every section that opens the chart as its intro, and every one that closes it as its outro', () => {
        const score = { ...song('Intro', 'Intro 2', 'Verse', 'Outro', 'Outro 2'), choruses: 2 };
        expect(byChorus(score)).toEqual([
            ['Intro1', 'Intro2', 'Intro 21', 'Intro 22', 'Verse1', 'Verse2'],
            ['Verse1', 'Verse2', 'Outro1', 'Outro2', 'Outro 21', 'Outro 22'],
        ]);
    });

    it('plays an intro or outro inside the form every chorus: it is an interlude', () => {
        // Sections share a label here, so the bars are named by section.
        const score = scoreFixture(
            ...['i', 'v1', 'riff', 'v2', 'out', 'end', 'o'].map((id) => [bar(id)]),
        );
        ['Intro', 'Verse', 'Intro', 'Verse', 'Outro', 'Ending', 'Outro'].forEach((label, i) => {
            score.sections[i].label = label;
        });
        expect(byChorus({ ...score, choruses: 2 })).toEqual([
            ['i', 'v1', 'riff', 'v2', 'out', 'end'],
            ['v1', 'riff', 'v2', 'out', 'end', 'o'],
        ]);
    });

    it('plays a chart that is all intro and outro as written, so no chorus is empty', () => {
        const whole = ['Intro1', 'Intro2', 'Outro1', 'Outro2'];
        expect(byChorus({ ...song('Intro', 'Outro'), choruses: 3 })).toEqual([whole, whole, whole]);
        // Two choruses would leave neither empty, and would still not be the chart.
        expect(byChorus({ ...song('Intro', 'Outro'), choruses: 2 })).toEqual([whole, whole]);
        expect(byChorus({ ...song('Intro'), choruses: 2 })).toEqual([
            ['Intro1', 'Intro2'],
            ['Intro1', 'Intro2'],
        ]);
    });

    it('plays the chart as written when leaving them out would empty a chorus', () => {
        // The only form is the intro: a tag with no departure sign ends every chorus but the
        // last where it begins, so without the intro the middle chorus would have no bars.
        const score = { ...song('Intro', 'Tag'), choruses: 3 };
        score.sections[1].measures[0].start = [
            { kind: 'coda', label: 'coda' },
            { kind: 'last-chorus', destination: { kind: 'coda', target: 'coda' } },
        ];
        expect(byChorus(score)).toEqual([
            ['Intro1', 'Intro2'],
            ['Intro1', 'Intro2'],
            ['Intro1', 'Intro2', 'Tag1', 'Tag2'],
        ]);
    });

    it('still reads the signs on a bar it leaves out', () => {
        // D.C. al Fine from the end of the outro-less form: the Fine sits on the intro's last
        // barline. Chorus 2 skips the intro's bars, and still stops at its Fine.
        const score = { ...song('Intro', 'Verse'), choruses: 2 };
        score.sections[0].measures[1].end = [{ kind: 'fine', label: 'fine' }];
        score.sections[1].measures[1].end = [dc({ kind: 'fine', label: 'fine' })];
        expect(byChorus(score)).toEqual([
            ['Intro1', 'Intro2', 'Verse1', 'Verse2', 'Intro1', 'Intro2'],
            ['Verse1', 'Verse2'],
        ]);
    });

    it('takes a last-chorus coda and then the outro', () => {
        const score = { ...song('Intro', 'Verse', 'Tag', 'Outro'), choruses: 2 };
        score.sections[1].measures[0].end = [{ kind: 'coda', label: 'to-coda' }, lastChorus];
        score.sections[2].measures[0].start = [{ kind: 'coda', label: 'coda' }];
        expect(byChorus(score)).toEqual([
            ['Intro1', 'Intro2', 'Verse1', 'Verse2'],
            ['Verse1', 'Tag1', 'Tag2', 'Outro1', 'Outro2'],
        ]);
    });

    it('gives the band a timeline with the intro and the outro once', () => {
        const timeline = compileTimeline({ ...song('Intro', 'Verse', 'Outro'), choruses: 3 });
        expect(timeline.visits.map(({ label, chorus }) => `${label}${chorus}`)).toEqual([
            'Intro0',
            'Verse0',
            'Verse1',
            'Verse2',
            'Outro2',
        ]);
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
