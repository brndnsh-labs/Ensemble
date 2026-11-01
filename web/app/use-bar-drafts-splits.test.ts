/**
 * Chords typed with no lengths that would be triplets are never applied or saved unchosen
 * (#1980); a saved triplet bar whose settings alone change keeps its music.
 */
import type { ScoreMeasure, SemanticScore } from '@core/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { type BarDraft, barFields, barProblem, commitBarDrafts } from './use-bar-drafts';

const third: [number, number] = [4, 3];
const triplets: ScoreMeasure = {
    id: 'm2',
    content: {
        kind: 'events',
        events: ['C', 'Dm', 'G7'].map((symbol) => ({ kind: 'chord', symbol, duration: third })),
    },
};
const whole: ScoreMeasure = {
    id: 'm1',
    content: { kind: 'events', events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }] },
};
const score: SemanticScore = {
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter: '4/4',
    grouping: null,
    sections: [{ id: 'a', label: 'A', repeat: 1, measures: [whole, triplets] }],
};
const draft = (text: string, fermata = false): BarDraft => ({
    text,
    context: {},
    form: null,
    fermata,
});

describe('off-grid chords wait for a split (#1980)', () => {
    it('are a pending problem with choices, and Save refuses them', () => {
        const drafts = new Map([['m1', draft('C Dm G7')]]);
        expect(barProblem(score, drafts, 'm1')).toMatch(/^Choose how the 3 chords/);
        expect(
            barFields(score, drafts)
                .get('m1')
                ?.splits?.map((s) => s.label),
        ).toEqual(['2+1+1', '1+2+1', '1+1+2']);
        expect(() => commitBarDrafts(score, drafts)).toThrow(/Choose how the 3 chords/);
    });

    it('are applied once a split is chosen', () => {
        const drafts = new Map([['m1', draft('C:2 Dm:1 G7:1')]]);
        expect(barProblem(score, drafts, 'm1')).toBeNull();
        const content = commitBarDrafts(score, drafts).sections[0].measures[0].content;
        expect(content.kind === 'events' && content.events.map((e) => e.duration)).toEqual([
            [2, 1],
            [1, 1],
            [1, 1],
        ]);
    });

    it('leave a saved triplet bar alone when only its settings change', () => {
        const drafts = new Map([['m2', draft('C Dm G7', true)]]);
        expect(barProblem(score, drafts, 'm2')).toBeNull();
        expect(barFields(score, drafts).get('m2')?.splits).toBeNull();
        const content = commitBarDrafts(score, drafts).sections[0].measures[1].content;
        expect(content.kind === 'events' && content.events.map((e) => e.duration)).toEqual([
            third,
            third,
            third,
        ]);
        // Retyping its chords asks, though.
        expect(barProblem(score, new Map([['m2', draft('C Em G7')]]), 'm2')).toMatch(/^Choose/);
    });

    it('with no short list ask for written lengths', () => {
        const drafts = new Map([['m1', draft('C F G Am Bb')]]);
        expect(barProblem(score, drafts, 'm1')).toMatch(/give each a length/);
        expect(barFields(score, drafts).get('m1')?.splits).toBeNull();
    });
});
