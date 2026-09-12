import { describe, expect, it } from 'vitest';
import {
    changeGuidedForm,
    type GuidedGroup,
    guidedGroups,
    guidedRoute,
} from '../../../prototypes/v2/lib/guided-form';
import { compileScoreForm } from '../../../public/songbook/score-form';
import type { SemanticScore } from '../../../public/songbook/score-types';

function score(): SemanticScore {
    return {
        notation: 'name',
        key: 'C',
        isMinor: false,
        meter: '4/4',
        grouping: null,
        sections: [
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: ['C', 'G', 'Am', 'F'].map((symbol, index) => ({
                    id: `bar-${index}`,
                    content: {
                        kind: 'events',
                        events: [{ kind: 'chord', symbol, duration: [4, 1] }],
                    },
                })),
            },
        ],
    };
}
const endings: GuidedGroup = {
    body: { start: 0, end: 1 },
    times: 2,
    first: { start: 2, end: 2 },
    second: { start: 3, end: 3 },
};
const visits = (source: SemanticScore) =>
    compileScoreForm(source).map((visit) => visit.measureIndex + 1);

describe('guided written form operations', () => {
    it('pairs a selected range with N total plays and retains every source bar and chord', () => {
        const source = score();
        const original = structuredClone(source);
        const group = { body: { start: 1, end: 2 }, times: 3 };
        const candidate = changeGuidedForm(source, 'a', group);
        expect(source).toEqual(original);
        expect(visits(candidate)).toEqual([1, 2, 3, 2, 3, 2, 3, 4]);
        expect(candidate.sections[0].measures.map(({ id, content }) => ({ id, content }))).toEqual(
            source.sections[0].measures.map(({ id, content }) => ({ id, content })),
        );
        expect(guidedGroups(candidate.sections[0])).toEqual([group]);
    });

    it('creates, reopens, edits and removes paired endings without unfolding or deleting music', () => {
        const source = score();
        const withEndings = changeGuidedForm(source, 'a', endings);
        expect(visits(withEndings)).toEqual([1, 2, 3, 1, 2, 4]);
        expect(guidedRoute(withEndings)).toBe('1–2–3 → 1–2–4');
        expect(guidedGroups(withEndings.sections[0])).toEqual([endings]);
        const shifted = { ...endings, body: { start: 0, end: 0 }, first: { start: 1, end: 2 } };
        const edited = changeGuidedForm(withEndings, 'a', shifted, endings);
        expect(visits(edited)).toEqual([1, 2, 3, 1, 4]);
        expect(changeGuidedForm(edited, 'a', null, shifted)).toEqual(source);
    });

    it('protects another group including its unmarked interior and leaves failed candidates detached', () => {
        const first = { body: { start: 0, end: 2 }, times: 2 };
        const source = changeGuidedForm(score(), 'a', first);
        const original = structuredClone(source);
        expect(() =>
            changeGuidedForm(source, 'a', { body: { start: 1, end: 1 }, times: 2 }),
        ).toThrow(/overlap/);
        expect(source).toEqual(original);
        const next = { body: { start: 3, end: 3 }, times: 2 };
        const two = changeGuidedForm(source, 'a', next);
        expect(guidedGroups(two.sections[0])).toEqual([first, next]);
        expect(changeGuidedForm(two, 'a', null, next)).toEqual(source);
    });

    it.each([
        { ...endings, body: { start: 1, end: 0 } },
        { ...endings, body: { start: -1, end: 1 } },
        { ...endings, second: { start: 3, end: 4 } },
        { ...endings, first: { start: 1, end: 2 } },
        { ...endings, body: { start: 0, end: 0 } },
        { ...endings, times: 3 },
        { body: { start: 0, end: 1 }, times: 0 },
        { body: { start: 0, end: 1 }, times: 2.5 },
        { body: { start: 0, end: 1 }, times: 65 },
    ])('rejects invalid ranges, overlaps, gaps and counts without changing source: %j', (group) => {
        const source = score();
        const original = structuredClone(source);
        expect(() => changeGuidedForm(source, 'a', group)).toThrow();
        expect(source).toEqual(original);
    });

    it('refuses nested, implicit and alternate-boundary forms without flattening them', () => {
        const nested = changeGuidedForm(score(), 'a', { body: { start: 0, end: 3 }, times: 2 });
        nested.sections[0].measures[1].start = [{ kind: 'repeat-start' }];
        nested.sections[0].measures[2].end = [{ kind: 'repeat-end', times: 2 }];
        const implicit = changeGuidedForm(score(), 'a', endings);
        delete implicit.sections[0].measures[0].start;
        const alternate = changeGuidedForm(score(), 'a', endings);
        alternate.sections[0].measures[2].end!.push({ kind: 'ending-end' });
        for (const source of [nested, implicit, alternate]) {
            const original = structuredClone(source);
            expect(compileScoreForm(source).length).toBeGreaterThan(4);
            expect(guidedGroups(source.sections[0])).toBeNull();
            expect(() => changeGuidedForm(source, 'a', endings)).toThrow(/Advanced/);
            expect(source).toEqual(original);
        }
    });

    it('preserves global navigation and derives its final-pass return from the compiler', () => {
        const source = score();
        source.sections.push({
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [
                {
                    id: 'b-1',
                    content: {
                        kind: 'events',
                        events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }],
                    },
                    end: [
                        {
                            kind: 'jump',
                            from: 'start',
                            destination: { kind: 'end' },
                            repeats: 'skip',
                        },
                    ],
                },
            ],
        });
        const candidate = changeGuidedForm(source, 'a', endings);
        expect(guidedRoute(candidate)).toBe('A 1–A 2–A 3 → A 1–A 2–A 4 → B 1 → A 1–A 2–A 4 → B 1');
        expect(candidate.sections[1]).toEqual(source.sections[1]);
        expect(changeGuidedForm(candidate, 'a', null, endings)).toEqual(source);
    });
});
