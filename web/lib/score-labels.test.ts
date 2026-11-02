import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIRealImport } from '../../core/songbook/ireal-import';
import type { ScoreDirection, ScoreMeasure, SemanticScore } from '../../core/songbook/score-types';
import { ignoredSignsSentence, signIsIgnored } from './score-labels';

function fixture(slug: string): SemanticScore {
    const text = readFileSync(resolve(__dirname, `../../tests/fixtures/ireal/${slug}.txt`), 'utf8');
    return parseIRealImport(text.trim()).songs[0]!.score!;
}

function scoreWith(marks: Array<ScoreDirection[]>): SemanticScore {
    const measures: ScoreMeasure[] = marks.map((end, i) => ({
        id: `m${i}`,
        content: {
            kind: 'events',
            events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }],
        },
        end,
    }));
    return {
        notation: 'chord-symbols',
        key: 'C',
        isMinor: false,
        meter: '4/4',
        grouping: null,
        sections: [{ id: 'a', label: 'A', repeat: 1, measures }],
    } as unknown as SemanticScore;
}

function signsOf(score: SemanticScore, ignored: boolean): string[] {
    const test = signIsIgnored(score);
    return score.sections
        .flatMap((s) => s.measures)
        .flatMap((m) => [...(m.start ?? []), ...(m.end ?? [])])
        .filter((d) => ['segno', 'coda', 'fine'].includes(d.kind) && test(d) === ignored)
        .map((d) => d.kind);
}

describe('signs the band does not take (#2005)', () => {
    it('Round Midnight: the segno, Fine and coda are drawn but the D.S. text is not a jump', () => {
        const score = fixture('round-midnight');
        expect(signsOf(score, true).sort()).toEqual(['coda', 'fine', 'segno']);
        expect(signsOf(score, false)).toEqual([]);
        expect(ignoredSignsSentence(score)).toBe(
            "The band plays straight through and loops; it won't take the D.S. al 2nd ending.",
        );
    });

    it('a chart with no signs says nothing', () => {
        expect(ignoredSignsSentence(fixture('autumn-leaves'))).toBeNull();
    });

    it('a D.S. al Fine the band takes greys neither the segno nor the Fine', () => {
        const score = scoreWith([
            [{ kind: 'segno', label: 'segno-1' }],
            [{ kind: 'fine', label: 'fine-1' }],
            [
                {
                    kind: 'jump',
                    from: 'segno',
                    segno: 'segno-1',
                    destination: { kind: 'fine', label: 'fine-1' },
                    repeats: 'skip',
                },
            ],
        ]);
        expect(signsOf(score, true)).toEqual([]);
        expect(signsOf(score, false)).toEqual(['segno', 'fine']);
        expect(ignoredSignsSentence(score)).toBeNull();
    });

    it('takes a coda pair and a last-chorus coda, but not a segno nothing names', () => {
        const score = scoreWith([
            [{ kind: 'segno', label: 'segno-1' }],
            [
                { kind: 'coda', label: 'coda-1' },
                {
                    kind: 'jump',
                    from: 'start',
                    destination: { kind: 'coda', via: 'coda-1', target: 'coda-2' },
                    repeats: 'skip',
                },
            ],
            [{ kind: 'coda', label: 'coda-2' }],
        ]);
        expect(signsOf(score, false)).toEqual(['coda', 'coda']);
        expect(signsOf(score, true)).toEqual(['segno']);
        expect(ignoredSignsSentence(score)).toBe(
            "The band plays straight through and loops; it won't take the Segno sign.",
        );
        const tag = scoreWith([
            [
                {
                    kind: 'last-chorus',
                    destination: { kind: 'coda', target: 'coda-2' },
                },
                { kind: 'coda', label: 'coda-2' },
            ],
        ]);
        expect(signsOf(tag, true)).toEqual([]);
    });

    it('beside a real jump the sentence names the signs, not a stray D.S. text', () => {
        const score = scoreWith([
            [{ kind: 'segno', label: 'segno-1' }],
            [
                {
                    kind: 'jump',
                    from: 'start',
                    destination: { kind: 'end' },
                    repeats: 'skip',
                },
            ],
        ]);
        score.sections[0]!.measures[0]!.annotations = [
            { text: 'D.S. al coda', at: [0, 1], placement: 'above' },
        ];
        expect(ignoredSignsSentence(score)).toBe(
            "The band plays straight through and loops; it won't take the Segno sign.",
        );
    });

    it('an al-ending jump takes the Fine on its way', () => {
        const score = scoreWith([
            [{ kind: 'fine', label: 'fine-1' }],
            [
                {
                    kind: 'jump',
                    from: 'start',
                    destination: { kind: 'ending', pass: 2 },
                    repeats: 'skip',
                },
            ],
        ]);
        expect(signsOf(score, true)).toEqual([]);
    });
});
