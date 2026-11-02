/**
 * A section loop is a derived chart (#1989): just the section, repeating continuously. Pinned
 * here: what that chart holds, where the full chart carries on when the loop is cleared
 * (`loopEntry`), how the stand draws it (`loopView`), and that its fills into its own top are a
 * looping chart's own — the loop gets no rules of its own.
 */
import { planBars } from '@band/arrange/plan';
import { compileTimeline, DEFAULT_SETTINGS } from '@band/index';
import type { ScoreEvent, ScoreMeasure, SemanticScore } from '@core/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { bandChart } from './band-chart';
import { loopEntry, loopScore, loopView } from './section-loop';

const chord = (symbol: string): ScoreEvent => ({ kind: 'chord', symbol, duration: [4, 1] });
const bar = (id: string, symbol: string, extra: Partial<ScoreMeasure> = {}): ScoreMeasure => ({
    id,
    content: { kind: 'events', events: [chord(symbol)] },
    ...extra,
});
const song = (sections: SemanticScore['sections'], choruses?: number): SemanticScore => ({
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter: '4/4',
    grouping: null,
    sections,
    ...(choruses ? { choruses } : {}),
});

/** A (2 bars), B (4 bars), C (2 bars). */
const abc = song(
    [
        { id: 'a', label: 'A', repeat: 1, measures: [bar('a1', 'C'), bar('a2', 'F')] },
        {
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [bar('b1', 'Dm7'), bar('b2', 'G7'), bar('b3', 'Em7'), bar('b4', 'A7')],
        },
        { id: 'c', label: 'C', repeat: 1, measures: [bar('c1', 'F'), bar('c2', 'G7')] },
    ],
    3,
);

describe('loopScore', () => {
    it('holds just the section, repeating continuously', () => {
        const loop = loopScore(abc, 'b')!;
        expect(loop.sections.map((section) => section.id)).toEqual(['b']);
        expect(loop.choruses).toBeUndefined();
        expect(loop.key).toBe('C');
        expect(compileTimeline(loop).bars.map((b) => b.spans[0].chord?.symbol)).toEqual([
            'Dm7',
            'G7',
            'Em7',
            'A7',
        ]);
        // The chart itself is untouched.
        expect(abc.choruses).toBe(3);
        expect(abc.sections).toHaveLength(3);
    });

    it('writes out a bar repeating a bar of another section', () => {
        const score = song([
            { id: 'a', label: 'A', repeat: 1, measures: [bar('a1', 'C')] },
            {
                id: 'b',
                label: 'B',
                repeat: 1,
                measures: [
                    bar('b1', 'F'),
                    {
                        id: 'b2',
                        content: { kind: 'repeat', measureId: 'b1', display: 'one-bar' },
                    },
                ],
            },
        ]);
        const loop = loopScore(score, 'b')!;
        expect(compileTimeline(loop).bars.map((b) => b.spans[0].chord?.symbol)).toEqual(['F', 'F']);
    });

    it("keeps the section's own repeat and leaves out a jump to the rest of the song", () => {
        const score = song([
            { id: 'a', label: 'A', repeat: 1, measures: [bar('a1', 'C')] },
            {
                id: 'b',
                label: 'B',
                repeat: 1,
                measures: [
                    bar('b1', 'F', { start: [{ kind: 'repeat-start' }] }),
                    bar('b2', 'G7', {
                        end: [
                            { kind: 'repeat-end', times: 2 },
                            {
                                kind: 'jump',
                                from: 'start',
                                destination: { kind: 'end' },
                                repeats: 'skip',
                            },
                        ],
                    }),
                ],
            },
        ]);
        const loop = loopScore(score, 'b')!;
        expect(loop.sections[0].measures[1].end).toEqual([{ kind: 'repeat-end', times: 2 }]);
        expect(compileTimeline(loop).bars).toHaveLength(4);
    });

    it('is null for a section the chart does not have', () => {
        expect(loopScore(abc, 'z')).toBeNull();
    });
});

describe('loopEntry', () => {
    const full = compileTimeline(abc);
    const loop = compileTimeline(loopScore(abc, 'b')!);

    it("carries on at the chart's bar playing the same written bar", () => {
        const entry = loopEntry(full, loop, 'b')!;
        // B is the chart's bars 2–5 (its first chorus); the loop's bar k is the chart's 2 + k.
        expect([0, 1, 2, 3].map(entry)).toEqual([2, 3, 4, 5]);
        // The top of the loop's next lap is B's top in the chart: the bars already played
        // were made leading back into it.
        expect(entry(4)).toBe(2);
        for (const k of [0, 1, 2, 3]) {
            expect(full.bars[entry(k)!].spans[0].chord?.symbol).toBe(
                loop.bars[k].spans[0].chord?.symbol,
            );
        }
    });

    it('carries on only at the top of a lap when the bars do not match', () => {
        // The loop of a section whose first visit in the chart is not the same bars: here the
        // chart's B is a different section with the same id's bars changed under it.
        const other = compileTimeline(
            song([
                { id: 'a', label: 'A', repeat: 1, measures: [bar('a1', 'C')] },
                {
                    id: 'b',
                    label: 'B',
                    repeat: 1,
                    measures: [bar('b1', 'Dm7'), bar('b2', 'G7'), bar('b3', 'C'), bar('b4', 'C')],
                },
            ]),
        );
        const entry = loopEntry(other, loop, 'b')!;
        expect([0, 1, 2, 3, 4].map(entry)).toEqual([1, null, null, null, 1]);
    });

    it('is null when the chart does not perform the section', () => {
        expect(loopEntry(compileTimeline(song([abc.sections[0]])), loop, 'b')).toBeNull();
    });
});

describe('loopView', () => {
    it("lights the section's bars where the chart shows them", () => {
        const fullView = bandChart(abc, compileTimeline(abc));
        const score = loopScore(abc, 'b')!;
        const view = loopView(fullView, bandChart(score, compileTimeline(score)), 'b')!;
        expect(view.blocks).toBe(fullView.blocks);
        expect(view.chords).toBe(fullView.chords);
        expect(view.slots.map((slot) => fullView.chords[slot.display].absName)).toEqual([
            'Dm7',
            'G7',
            'Em7',
            'A7',
        ]);
        expect(view.slots.map((slot) => fullView.chords[slot.display].measureId)).toEqual([
            'b1',
            'b2',
            'b3',
            'b4',
        ]);
    });
});

describe("a loop's fills into its own top", () => {
    const eight = song([
        {
            id: 'a',
            label: 'A',
            repeat: 1,
            measures: ['C', 'A7', 'Dm7', 'G7', 'C', 'A7', 'Dm7', 'G7'].map((symbol, i) =>
                bar(`a${i}`, symbol),
            ),
        },
        { id: 'b', label: 'B', repeat: 1, measures: [bar('b1', 'F'), bar('b2', 'G7')] },
    ]);
    const plans = (score: SemanticScore, pass: number) => {
        const timeline = compileTimeline(score);
        return planBars(timeline, DEFAULT_SETTINGS, {
            pass,
            looping: true,
            window: { from: 0, to: timeline.bars.length },
        });
    };

    it('an 8-bar section looped fills into its top every lap and crashes on it', () => {
        // An 8-bar form carries the 8-bar period on its own wrap (#2009's SHORT_FORM): the wrap
        // is a section fill, as the song's own wrap would be.
        const loop = loopScore(eight, 'a')!;
        for (const pass of [0, 1, 2, 3]) {
            const lap = plans(loop, pass);
            expect(lap[7].fill).toBe('section');
            expect(lap.slice(0, 7).every((plan) => plan.fill !== 'section')).toBe(true);
            if (pass > 0) {
                expect(lap[0].crash).toBe(true);
            }
        }
    });

    it('a 2-bar section looped counts its laps toward the 8- and 16-bar periods (#2009)', () => {
        const loop = loopScore(eight, 'b')!;
        // Laps end at bars 2, 4, 6, 8 …: a small fill at each 8, a section fill at each 16.
        const fills = [0, 1, 2, 3, 4, 5, 6, 7].map((pass) => plans(loop, pass)[1].fill);
        expect(fills).toEqual([
            'none',
            'none',
            'none',
            'phrase',
            'none',
            'none',
            'none',
            'section',
        ]);
    });
});
