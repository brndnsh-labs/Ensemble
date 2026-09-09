import { describe, expect, it } from 'vitest';
import { validateSemanticScore } from '../../../public/songbook/score-codec.js';
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

function dc(
    destination: ScoreDestination = { kind: 'end' },
    repeats: 'play' | 'skip' = 'skip',
): ScoreDirection {
    return { kind: 'jump', from: 'start', destination, repeats };
}

function ds(
    destination: ScoreDestination = { kind: 'end' },
    repeats: 'play' | 'skip' = 'skip',
): ScoreDirection {
    return { kind: 'jump', from: 'segno', segno: 'sign', destination, repeats };
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

function performedIds(score: SemanticScore): string[] {
    return compileScoreForm(score).map(
        ({ sectionIndex, measureIndex }) => score.sections[sectionIndex].measures[measureIndex].id,
    );
}

function codaFixture(): SemanticScore {
    return scoreFixture(
        [bar('intro'), bar('a', [{ kind: 'segno', label: 'sign' }])],
        [
            bar('b', [], [{ kind: 'coda', label: 'to-coda' }]),
            bar('jump', [], [ds({ kind: 'coda', via: 'to-coda', target: 'tail' })]),
        ],
        [bar('c', [{ kind: 'coda', label: 'tail' }]), bar('d')],
    );
}

function nestedFixture(policy: 'play' | 'skip'): SemanticScore {
    return scoreFixture(
        [
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'repeat-start' }]),
            bar('c', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 2 }]),
            bar('d', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            bar('e', [], [{ kind: 'repeat-end', times: 2 }]),
        ],
        [bar('jump', [], [dc({ kind: 'end' }, policy)])],
    );
}

describe('semantic navigation: global D.C./D.S. itineraries', () => {
    it('takes an end-destination D.C. only once, including its own completed bar', () => {
        const score = scoreFixture([bar('a'), bar('b', [], [dc()])]);
        expect(performedIds(score)).toEqual(['a', 'b', 'a', 'b']);
    });

    it('arms Fine only after D.C. and returns across section boundaries without regrouping', () => {
        const score = scoreFixture(
            [bar('a'), bar('b', [], [{ kind: 'fine', label: 'stop' }])],
            [bar('c', [], [dc({ kind: 'fine', label: 'stop' })])],
        );
        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a', 'b']);
        expect(compileScoreForm(score).map(({ sectionIndex }) => sectionIndex)).toEqual([
            0, 0, 1, 0, 0,
        ]);
    });

    it('stops before a start-boundary Fine and after an end-boundary Fine', () => {
        const score = scoreFixture([
            bar('a'),
            bar('b', [{ kind: 'fine', label: 'stop' }]),
            bar('c', [], [dc({ kind: 'fine', label: 'stop' })]),
        ]);
        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a']);
        score.sections[0].measures[1].end = score.sections[0].measures[1].start;
        delete score.sections[0].measures[1].start;
        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a', 'b']);
    });

    it('does not invent an extra bar when Fine is at the top of the returned form', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'fine', label: 'stop' }]),
            bar('b', [], [dc({ kind: 'fine', label: 'stop' })]),
        ]);
        expect(performedIds(score)).toEqual(['a', 'b']);
    });

    it('starts at a Segno start boundary without replaying the introduction', () => {
        const score = scoreFixture([
            bar('intro'),
            bar('a', [{ kind: 'segno', label: 'sign' }]),
            bar('b', [], [ds()]),
        ]);
        expect(performedIds(score)).toEqual(['intro', 'a', 'b', 'a', 'b']);
    });

    it('resumes after the Segno measure when its marker is at the end boundary', () => {
        const score = scoreFixture([
            bar('intro'),
            bar('a', [], [{ kind: 'segno', label: 'sign' }]),
            bar('b', [], [ds()]),
        ]);
        expect(performedIds(score)).toEqual(['intro', 'a', 'b', 'b']);
    });

    it('keeps coda departures inactive until the D.S. arms that exact labeled route', () => {
        expect(performedIds(codaFixture())).toEqual([
            'intro',
            'a',
            'b',
            'jump',
            'a',
            'b',
            'c',
            'd',
        ]);
    });

    it('keeps a genuinely unperformed written gap out of the coda itinerary', () => {
        const score = codaFixture();
        score.sections[2].measures.unshift(bar('written-gap'));
        expect(performedIds(score)).toEqual(['intro', 'a', 'b', 'jump', 'a', 'b', 'c', 'd']);
        expect(score.sections[2].measures[0].id).toBe('written-gap');
    });

    it('executes an independent command in the coda once, without rearming the earlier coda jump', () => {
        const score = codaFixture();
        score.sections[2].measures[1].end = [dc()];
        expect(performedIds(score)).toEqual([
            'intro',
            'a',
            'b',
            'jump',
            'a',
            'b',
            'c',
            'd',
            'intro',
            'a',
            'b',
            'jump',
            'c',
            'd',
        ]);
    });

    it('supports D.C. al Coda with the same departure/arrival contract', () => {
        const score = codaFixture();
        score.sections[1].measures[1].end = [dc({ kind: 'coda', via: 'to-coda', target: 'tail' })];
        expect(performedIds(score)).toEqual([
            'intro',
            'a',
            'b',
            'jump',
            'intro',
            'a',
            'b',
            'c',
            'd',
        ]);
    });

    it('takes a start-boundary coda before playing that measure again', () => {
        const score = codaFixture();
        score.sections[1].measures[0].start = score.sections[1].measures[0].end;
        delete score.sections[1].measures[0].end;
        expect(performedIds(score)).toEqual(['intro', 'a', 'b', 'jump', 'a', 'c', 'd']);
    });

    it('lands after an end-boundary coda arrival instead of adding its preceding bar', () => {
        const score = codaFixture();
        score.sections[2].measures[0].end = score.sections[2].measures[0].start;
        delete score.sections[2].measures[0].start;
        expect(performedIds(score)).toEqual(['intro', 'a', 'b', 'jump', 'a', 'b', 'd']);
    });

    it('allows an end-boundary coda at the last bar to end the returned form', () => {
        const score = codaFixture();
        delete score.sections[2].measures[0].start;
        score.sections[2].measures[1].end = [{ kind: 'coda', label: 'tail' }];
        expect(performedIds(score)).toEqual(['intro', 'a', 'b', 'jump', 'a', 'b']);
    });

    it('ignores unrelated labeled Fine and coda markers rather than treating every sign as active', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'coda', label: 'unused-coda' }], [{ kind: 'fine', label: 'other' }]),
            bar('b', [], [{ kind: 'fine', label: 'stop' }]),
            bar('c', [], [dc({ kind: 'fine', label: 'stop' })]),
        ]);
        expect(performedIds(score)).toEqual(['a', 'b', 'c', 'a', 'b']);
    });

    it('keeps harmless unreferenced navigation markers without inventing jumps or stops', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'segno', label: 'sign' }], [{ kind: 'fine', label: 'unused-fine' }]),
            bar('b', [{ kind: 'coda', label: 'unused-coda' }]),
        ]);
        expect(performedIds(score)).toEqual(['a', 'b']);
    });

    it('executes each distinct end-destination command once without resetting earlier commands', () => {
        const score = scoreFixture([bar('a', [], [dc()]), bar('b', [], [dc()])]);
        expect(performedIds(score)).toEqual(['a', 'a', 'b', 'a', 'b']);
    });

    it('does not mutate authored directions or share returned repeat-pass arrays', () => {
        const score = codaFixture();
        const original = structuredClone(score);
        const visits = compileScoreForm(score);
        visits[0].repeatPasses.push(999);
        visits[0].measureIndex = 99;
        expect(score).toEqual(original);
        expect(compileScoreForm(score)[0]).toEqual({
            sectionIndex: 0,
            measureIndex: 0,
            sectionPass: 0,
            repeatPasses: [],
        });
        expect(visits[1].repeatPasses).toEqual([]);
    });
});

describe('semantic navigation: explicit repeat policy', () => {
    const originalPass = ['a', 'b', 'c', 'b', 'd', 'e', 'a', 'b', 'c', 'b', 'd', 'e'];

    it('restarts nested repeats and first/second ending choices for repeats:play', () => {
        const score = nestedFixture('play');
        expect(performedIds(score)).toEqual([...originalPass, 'jump', ...originalPass, 'jump']);
        expect(
            compileScoreForm(score)
                .slice(13)
                .map(({ repeatPasses }) => repeatPasses),
        ).toEqual([
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

    it('takes each nested repeat final pass/ending once for the explicit repeats:skip policy', () => {
        const score = nestedFixture('skip');
        expect(performedIds(score)).toEqual([...originalPass, 'jump', 'a', 'b', 'd', 'e', 'jump']);
        expect(
            compileScoreForm(score)
                .slice(13)
                .map(({ repeatPasses }) => repeatPasses),
        ).toEqual([[2], [2, 2], [2, 2], [2], []]);
    });

    it('chooses the final numerical pass even when its ending is not the last written branch', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar(
                'b',
                [{ kind: 'ending-start', passes: [1, 3] }],
                [{ kind: 'repeat-end', times: 3 }],
            ),
            bar('c', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            bar('jump', [], [dc()]),
        ]);
        expect(performedIds(score)).toEqual([
            'a',
            'b',
            'a',
            'c',
            'a',
            'b',
            'jump',
            'a',
            'b',
            'jump',
        ]);
        expect(
            compileScoreForm(score)
                .slice(7)
                .map(({ repeatPasses }) => repeatPasses),
        ).toEqual([[3], [3], []]);
    });

    it.each(['play', 'skip'] as const)(
        'applies %s to whole-section repeats as well as bar repeats',
        (policy) => {
            const score = scoreFixture([bar('a')], [bar('b', [], [dc({ kind: 'end' }, policy)])]);
            score.sections[0].repeat = 3;
            expect(performedIds(score)).toEqual(
                policy === 'play'
                    ? ['a', 'a', 'a', 'b', 'a', 'a', 'a', 'b']
                    : ['a', 'a', 'a', 'b', 'a', 'b'],
            );
            expect(
                compileScoreForm(score)
                    .slice(4)
                    .map(({ sectionPass }) => sectionPass),
            ).toEqual(policy === 'play' ? [0, 1, 2, 0] : [2, 0]);
        },
    );

    it('seeks a Segno inside a repeated body and resets repeat traversal under play', () => {
        const score = scoreFixture(
            [
                bar('a', [{ kind: 'repeat-start' }]),
                bar('b', [{ kind: 'segno', label: 'sign' }], [{ kind: 'repeat-end', times: 2 }]),
            ],
            [bar('jump', [], [ds({ kind: 'end' }, 'play')])],
        );
        expect(performedIds(score)).toEqual(['a', 'b', 'a', 'b', 'jump', 'b', 'a', 'b', 'jump']);
    });

    it('seeks the final-pass occurrence of a repeated Segno under skip', () => {
        const score = scoreFixture(
            [
                bar('a', [{ kind: 'repeat-start' }]),
                bar('b', [{ kind: 'segno', label: 'sign' }], [{ kind: 'repeat-end', times: 3 }]),
            ],
            [bar('jump', [], [ds()])],
        );
        expect(performedIds(score)).toEqual(['a', 'b', 'a', 'b', 'a', 'b', 'jump', 'b', 'jump']);
        expect(compileScoreForm(score).at(-2)?.repeatPasses).toEqual([3]);
    });

    it('can reach a Fine on the next repeat pass even if its first occurrence precedes the Segno', () => {
        const score = scoreFixture(
            [
                bar('a', [{ kind: 'repeat-start' }], [{ kind: 'fine', label: 'stop' }]),
                bar('b', [{ kind: 'segno', label: 'sign' }], [{ kind: 'repeat-end', times: 2 }]),
            ],
            [bar('jump', [], [ds({ kind: 'fine', label: 'stop' }, 'play')])],
        );
        expect(performedIds(score)).toEqual(['a', 'b', 'a', 'b', 'jump', 'b', 'a']);
        expect(
            compileScoreForm(score)
                .slice(5)
                .map(({ repeatPasses }) => repeatPasses),
        ).toEqual([[1], [2]]);
    });
});

describe('semantic navigation: authored validation, ambiguity and bounds', () => {
    it('retains the codec gate for malformed content after a navigation stop', () => {
        const score = scoreFixture([
            bar('a', [], [{ kind: 'fine', label: 'stop' }]),
            bar('jump', [], [dc({ kind: 'fine', label: 'stop' })]),
            bar('invalid'),
        ]);
        score.sections[0].measures[2].content = {
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [3, 1] }],
        };
        expect(() => compileScoreForm(score)).toThrow(/fill|duration|events/i);
    });

    it('validates repeat ownership in sections never visited after Fine', () => {
        const score = scoreFixture(
            [
                bar('a', [], [{ kind: 'fine', label: 'stop' }]),
                bar('jump', [], [dc({ kind: 'fine', label: 'stop' })]),
            ],
            [bar('bad', [{ kind: 'repeat-start' }])],
        );
        expect(() => compileScoreForm(score)).toThrow(/end repeat|same section/i);
    });

    it.each([
        ds(),
        dc({ kind: 'fine', label: 'missing' }),
        dc({ kind: 'coda', via: 'missing', target: 'also-missing' }),
    ])('rejects missing navigation marker references: %j', (jump) => {
        expect(() => compileScoreForm(scoreFixture([bar('a'), bar('jump', [], [jump])]))).toThrow(
            /missing|destination/i,
        );
    });

    it('rejects globally duplicated marker identities across sections', () => {
        const score = scoreFixture(
            [bar('a', [{ kind: 'segno', label: 'duplicate' }])],
            [bar('b', [{ kind: 'fine', label: 'duplicate' }])],
        );
        expect(() => compileScoreForm(score)).toThrow(/unique|identity/i);
    });

    it('rejects two D.C./D.S. commands on the same boundary before traversal', () => {
        const score = scoreFixture([bar('a'), bar('jump', [], [dc(), dc()])]);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/duplicate|boundary/i);
    });

    it('rejects a start-boundary command rather than moving it to the end', () => {
        expect(() => compileScoreForm(scoreFixture([bar('a', [dc()])]))).toThrow(
            /boundary|direction/i,
        );
    });

    it.each(['repeat', 'section'] as const)('rejects ambiguous jump timing within a %s', (kind) => {
        const score = scoreFixture([bar('a'), bar('jump', [], [dc()])]);
        if (kind === 'repeat') {
            score.sections[0].measures[0].start = [{ kind: 'repeat-start' }];
            score.sections[0].measures[1].end?.push({ kind: 'repeat-end', times: 2 });
        } else {
            score.sections[0].repeat = 2;
        }
        expect(() => compileScoreForm(score)).toThrow(/jump timing.*ambiguous/i);
    });

    it('rejects al-ending rather than guessing its owning repeat or stopping Fine', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar('b', [{ kind: 'ending-start', passes: [1] }], [{ kind: 'repeat-end', times: 2 }]),
            bar('c', [{ kind: 'ending-start', passes: [2] }], [{ kind: 'ending-end' }]),
            bar('jump', [], [dc({ kind: 'ending', pass: 2 })]),
        ]);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/al ending.*not supported.*owning repeat/i);
    });

    it.each(['same', 'later'] as const)(
        'rejects a D.S. sign on the %s boundary as its command',
        (location) => {
            const score = scoreFixture([
                bar(
                    'jump',
                    [],
                    location === 'same' ? [{ kind: 'segno', label: 'sign' }, ds()] : [ds()],
                ),
                bar('later', location === 'later' ? [{ kind: 'segno', label: 'sign' }] : []),
            ]);
            expect(() => compileScoreForm(score)).toThrow(/earlier boundary/i);
        },
    );

    it('rejects Fine before the D.S. landing point instead of silently playing to the end', () => {
        const score = scoreFixture([
            bar('a', [], [{ kind: 'fine', label: 'stop' }]),
            bar('b', [{ kind: 'segno', label: 'sign' }]),
            bar('jump', [], [ds({ kind: 'fine', label: 'stop' })]),
        ]);
        expect(() => compileScoreForm(score)).toThrow(/unreachable/i);
    });

    it('rejects a return to a first-ending Segno excluded by skip', () => {
        const score = nestedFixture('skip');
        score.sections[0].measures[2].start?.push({ kind: 'segno', label: 'sign' });
        score.sections[1].measures[0].end = [ds()];
        expect(() => compileScoreForm(score)).toThrow(/unreachable.*repeat policy/i);
    });

    it('rejects Fine on a first ending that the selected skip policy never visits', () => {
        const score = nestedFixture('skip');
        score.sections[0].measures[2].end?.push({ kind: 'fine', label: 'stop' });
        score.sections[1].measures[0].end = [dc({ kind: 'fine', label: 'stop' })];
        expect(() => compileScoreForm(score)).toThrow(/unreachable.*repeat policy/i);
    });

    it('validates unreachable destinations even on a command bypassed by an earlier Fine', () => {
        const score = scoreFixture([
            bar('a', [], [{ kind: 'fine', label: 'stop' }]),
            bar('first', [], [dc({ kind: 'fine', label: 'stop' })]),
            bar('b', [{ kind: 'segno', label: 'sign' }]),
            bar('unvisited', [], [ds({ kind: 'fine', label: 'stop' })]),
        ]);
        expect(() => compileScoreForm(score)).toThrow(/unreachable/i);
    });

    it('rejects backward or same-boundary coda arrivals visibly', () => {
        const score = codaFixture();
        delete score.sections[2].measures[0].start;
        score.sections[0].measures[0].start = [{ kind: 'coda', label: 'tail' }];
        expect(() => compileScoreForm(score)).toThrow(/coda.*cycle|arrival.*follow/i);
        delete score.sections[0].measures[0].start;
        score.sections[1].measures[1].start = [{ kind: 'coda', label: 'tail' }];
        expect(() => compileScoreForm(score)).toThrow(/coda.*cycle|arrival.*follow/i);
    });

    it.each(['departure', 'arrival'] as const)(
        'rejects a coda %s in a first ending excluded by skip',
        (excluded) => {
            const score = nestedFixture('skip');
            score.sections[0].measures[0].end = [{ kind: 'coda', label: 'to-coda' }];
            score.sections[0].measures[2].end?.push({
                kind: 'coda',
                label: excluded === 'departure' ? 'to-coda' : 'tail',
            });
            if (excluded === 'departure') {
                delete score.sections[0].measures[0].end;
                score.sections.push({
                    id: 'tail-section',
                    label: 'Tail',
                    repeat: 1,
                    measures: [bar('tail', [{ kind: 'coda', label: 'tail' }])],
                });
            }
            score.sections[1].measures[0].end = [
                dc({ kind: 'coda', via: 'to-coda', target: 'tail' }),
            ];
            expect(() => compileScoreForm(score)).toThrow(/unreachable.*repeat policy/i);
        },
    );

    it('rejects a written-forward coda whose first target occurrence is backward in performed ending order', () => {
        const score = scoreFixture([
            bar('a', [{ kind: 'repeat-start' }]),
            bar(
                'b',
                [
                    { kind: 'ending-start', passes: [2] },
                    { kind: 'coda', label: 'to-coda' },
                ],
                [{ kind: 'repeat-end', times: 2 }],
            ),
            bar(
                'c',
                [
                    { kind: 'ending-start', passes: [1] },
                    { kind: 'coda', label: 'tail' },
                ],
                [{ kind: 'ending-end' }],
            ),
            bar('jump', [], [dc({ kind: 'coda', via: 'to-coda', target: 'tail' }, 'play')]),
        ]);
        expect(validateSemanticScore(score).kind).toBe('ok');
        expect(() => compileScoreForm(score)).toThrow(/performed repeat route.*backward/i);
    });

    it('rejects exponential unvisited repeat expansion without materializing its full route', () => {
        const score = scoreFixture(
            [
                bar('a', [], [{ kind: 'fine', label: 'stop' }]),
                bar('jump', [], [dc({ kind: 'fine', label: 'stop' })]),
            ],
            [
                ...Array.from({ length: 16 }, (_, i) =>
                    bar(`open-${i}`, [{ kind: 'repeat-start' }]),
                ),
                ...Array.from({ length: 16 }, (_, i) =>
                    bar(`close-${i}`, [], [{ kind: 'repeat-end', times: 64 }]),
                ),
            ],
        );
        expect(() => compileScoreForm(score)).toThrow(/16,384|limit/i);
    });

    it('rejects another command encountered before the armed Fine rather than replacing the goal', () => {
        const score = scoreFixture([
            bar('a', [], [dc({ kind: 'fine', label: 'stop' })]),
            bar('b', [], [dc()]),
            bar('c', [], [{ kind: 'fine', label: 'stop' }]),
        ]);
        expect(() => compileScoreForm(score)).toThrow(/second jump.*ambiguous/i);
    });

    it('accepts exactly 16,384 visits across both D.C. traversals and rejects one extra bar', () => {
        // 255 * 32 + 32 = 8,192 visits before D.C.; two traversals reach the cap exactly.
        const score = scoreFixture(
            Array.from({ length: 255 }, (_, i) => bar(`a-${i}`)),
            [
                ...Array.from({ length: 31 }, (_, i) => bar(`b-${i}`)),
                bar('jump', [], [dc({ kind: 'end' }, 'play')]),
            ],
        );
        score.sections[0].repeat = 32;
        expect(compileScoreForm(score)).toHaveLength(16_384);
        score.sections[1].measures.push(bar('over-limit'));
        expect(() => compileScoreForm(score)).toThrow(/16,384|limit/i);
    });

    it('still rejects a seventeenth repeat level even if a Fine would bypass that section', () => {
        const score = scoreFixture(
            [
                bar('a', [], [{ kind: 'fine', label: 'stop' }]),
                bar('jump', [], [dc({ kind: 'fine', label: 'stop' })]),
            ],
            [
                ...Array.from({ length: 17 }, (_, i) =>
                    bar(`open-${i}`, [{ kind: 'repeat-start' }]),
                ),
                ...Array.from({ length: 17 }, (_, i) =>
                    bar(`close-${i}`, [], [{ kind: 'repeat-end', times: 1 }]),
                ),
            ],
        );
        expect(() => compileScoreForm(score)).toThrow(/nesting.*16/i);
    });
});
