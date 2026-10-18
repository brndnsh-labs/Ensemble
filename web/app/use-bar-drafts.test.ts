/**
 * The bar drafts the chart's in-bar field and the panel share (#1723). Pinned: applying one bar
 * alone is only right when no other pending bar changes how it reads — an earlier bar's pending
 * meter change makes it read in 3/4, and a lone apply would parse it in 4/4 (review P1).
 */
import type { ScoreMeasure, SemanticScore } from '@core/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { type BarDraft, commitBarDrafts, dependsOnPending } from './use-bar-drafts';

const bar = (id: string, symbol: string): ScoreMeasure => ({
    id,
    content: { kind: 'events', events: [{ kind: 'chord', symbol, duration: [4, 1] }] },
});
const score: SemanticScore = {
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
            measures: [bar('m1', 'C'), bar('m2', 'F'), bar('m3', 'G7')],
        },
    ],
};
const draft = (text: string, context: BarDraft['context'] = {}): BarDraft => ({
    text,
    context,
    form: null,
    fermata: false,
});

describe('dependsOnPending', () => {
    it('is false for a bar no other pending bar affects', () => {
        const drafts = new Map([['m2', draft('Dm7 G7')]]);
        expect(dependsOnPending(score, drafts, 'm2')).toBe(false);
    });

    it('is true for a bar after a pending meter change, and only a full commit reads it right', () => {
        const drafts = new Map([
            ['m1', draft('C', { meter: '3/4' })],
            ['m2', draft('Dm7 E7 F7')],
        ]);
        expect(dependsOnPending(score, drafts, 'm2')).toBe(true);
        // m3 still holds four beats of G7, so the full commit needs it to fit 3/4 too.
        drafts.set('m3', draft('G7'));
        const all = commitBarDrafts(score, drafts);
        const m2 = all.sections[0].measures[1].content;
        expect(m2.kind === 'events' && m2.events.map((event) => event.duration)).toEqual([
            [1, 1],
            [1, 1],
            [1, 1],
        ]);
    });
});
