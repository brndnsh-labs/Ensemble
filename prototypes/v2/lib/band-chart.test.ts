/**
 * The band engine's chart display (`band-chart.ts`). Pinned here: every written event gets a
 * place on the sheet (holds, N.C. and fermatas included), each performed event lands exactly on
 * the band timeline's ticks, and the playhead lookup agrees with the timeline at the edges.
 */
import { compileTimeline, PPQ } from '@band/index';
import type { ScoreEvent, ScoreMeasure, SemanticScore } from '@engine/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { auditionMidis, bandChart, chordNames, sectionSteps, slotAt } from './band-chart';

const chord = (symbol: string, n: number, d = 1, fermata = false): ScoreEvent => ({
    kind: 'chord',
    symbol,
    duration: [n, d],
    ...(fermata ? { fermata: true } : {}),
});
const bar = (id: string, events: ScoreEvent[]): ScoreMeasure => ({
    id,
    content: { kind: 'events', events },
});
const song = (sections: SemanticScore['sections']): SemanticScore => ({
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter: '4/4',
    grouping: null,
    sections,
});
const BAR = 4 * PPQ;
const STEP = PPQ / 4;

/** C | hold | N.C. | G7 (fermata) — the chart the old engine refuses outright. */
const unplayable = song([
    {
        id: 'a',
        label: 'A',
        repeat: 1,
        measures: [
            bar('m1', [chord('C', 4)]),
            bar('m2', [{ kind: 'hold', duration: [4, 1] }]),
            bar('m3', [{ kind: 'no-chord', duration: [4, 1] }]),
            bar('m4', [chord('G7', 4, 1, true)]),
        ],
    },
]);

describe('bandChart', () => {
    it('draws every written event, holds, N.C. and fermatas included', () => {
        const view = bandChart(unplayable, compileTimeline(unplayable));
        expect(view.blocks).toHaveLength(1);
        expect(view.blocks[0].measures.map((m) => m.chords.map((c) => c.kind))).toEqual([
            ['chord'],
            ['hold'],
            ['no-chord'],
            ['chord'],
        ]);
        expect(view.chords.map((c) => c.absName)).toEqual(['C', '/', 'N.C.', 'G7']);
        expect(view.chords.map((c) => c.fermata)).toEqual([false, false, false, true]);
        expect(view.chords.map((c) => c.chord?.symbol ?? null)).toEqual(['C', null, null, 'G7']);
        expect(view.blocks[0].measures.map((m) => m.startsSection)).toEqual([
            true,
            false,
            false,
            false,
        ]);
    });

    it('performs each written event at the timeline ticks, in order, without gaps', () => {
        const timeline = compileTimeline(unplayable);
        const view = bandChart(unplayable, timeline);
        expect(view.slots.map((s) => [s.from, s.to, s.display])).toEqual([
            [0, BAR, 0],
            [BAR, 2 * BAR, 1],
            [2 * BAR, 3 * BAR, 2],
            [3 * BAR, 4 * BAR, 3],
        ]);
        expect(view.slots.at(-1)!.to).toBe(timeline.ticks);
        // The timeline still says C rings through the hold: the display follows the bar,
        // the chord authority stays the span.
        expect(timeline.spans[0]).toMatchObject({ start: 0, end: 2 * BAR });
        expect(timeline.spans[1].chord).toBeNull();
        expect(timeline.spans[2].fermata).toBe(true);
    });

    it('finds the slot under a tick, at both edges of each slot', () => {
        const view = bandChart(unplayable, compileTimeline(unplayable));
        expect(slotAt(view, 0)).toBe(0);
        expect(slotAt(view, BAR - 1)).toBe(0);
        expect(slotAt(view, BAR)).toBe(1);
        expect(slotAt(view, 3 * BAR + 5)).toBe(3);
        expect(slotAt(view, 4 * BAR)).toBe(-1);
    });

    it('keeps off-grid lengths exact instead of rounding them to sixteenths', () => {
        // Half-note triplets: 4/3 of a quarter each, which the old step grid cannot hold.
        const triplets = song([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [bar('m1', [chord('C', 4, 3), chord('F', 4, 3), chord('G', 4, 3)])],
            },
        ]);
        const timeline = compileTimeline(triplets);
        const view = bandChart(triplets, timeline);
        expect(view.slots.map((s) => s.from)).toEqual([0, 640, 1280]);
        expect(view.slots.map((s) => s.from)).toEqual(timeline.spans.map((s) => s.start));
        expect(view.chords[1].start).toBeCloseTo(640 / STEP);
        expect(view.chords[1].end - view.chords[1].start).toBeCloseTo(640 / STEP);
    });

    it('maps every pass of a repeat back to the written bar, and loops the whole section', () => {
        const repeated = song([
            {
                id: 'a',
                label: 'A',
                repeat: 2,
                measures: [bar('m1', [chord('C', 2), chord('G', 2)]), bar('m2', [chord('F', 4)])],
            },
            { id: 'b', label: 'B', repeat: 1, measures: [bar('m3', [chord('Am', 4)])] },
        ]);
        const view = bandChart(repeated, compileTimeline(repeated));
        expect(view.slots.map((s) => s.display)).toEqual([0, 1, 2, 0, 1, 2, 3]);
        // A chord is placed where it is first played.
        expect(view.chords.map((c) => c.start)).toEqual([0, 8, 16, 64]);
        // Both passes of A are one loop window; B follows them.
        expect(sectionSteps(view, 'a')).toEqual({ start: 0, end: 64 });
        expect(sectionSteps(view, 'b')).toEqual({ start: 64, end: 80 });
        expect(sectionSteps(view, 'nope')).toBeNull();
    });
});

describe('chordNames', () => {
    const names = (symbol: string, key = 'C', minor = false) => {
        const { display } = chordNames(symbol, key, minor);
        const text = (part: typeof display.name) =>
            `${part.root}${part.suffix}${part.bass ? `/${part.bass}` : ''}`;
        return { name: text(display.name), roman: text(display.roman), nns: text(display.nns) };
    };

    it('keeps the written quality and moves only the root between notations', () => {
        expect(names('C^7')).toEqual({ name: 'C^7', roman: 'I^7', nns: '1^7' });
        expect(names('G7/B')).toEqual({ name: 'G7/B', roman: 'V7/VII', nns: '57/7' });
        expect(names('bVII7')).toEqual({ name: 'Bb7', roman: 'bVII7', nns: 'b77' });
        expect(names('C6/9')).toEqual({ name: 'C6/9', roman: 'I6/9', nns: '16/9' });
    });

    it('spells the minor third the way each notation does', () => {
        expect(names('Dm7')).toEqual({ name: 'Dm7', roman: 'ii7', nns: '2-7' });
        expect(names('D-7')).toEqual({ name: 'D-7', roman: 'ii7', nns: '2-7' });
        expect(names('ii7')).toEqual({ name: 'Dm7', roman: 'ii7', nns: '2-7' });
        expect(names('Cmaj7').roman).toBe('Imaj7');
    });

    it('spells roots in the key', () => {
        expect(names('IV', 'F').name).toBe('Bb');
        expect(names('III', 'E').name).toBe('G#');
    });
});

describe('auditionMidis', () => {
    it('voices a chord inside the keys register, a named bass beneath it', () => {
        const view = bandChart(unplayable, compileTimeline(unplayable));
        const g7 = auditionMidis(view.chords[3].chord!);
        expect(Math.min(...g7)).toBeGreaterThanOrEqual(52);
        expect(Math.max(...g7)).toBeLessThanOrEqual(84);
        expect(g7.map((m) => m % 12)).toEqual([7, 11, 2, 5]);
        const slash = chordNames('C/E', 'C', false);
        const withBass = song([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [bar('m1', [chord('C/E', 4)])],
            },
        ]);
        const onE = auditionMidis(bandChart(withBass, compileTimeline(withBass)).chords[0].chord!);
        expect(slash.absName).toBe('C/E');
        expect(onE[0] % 12).toBe(4);
        expect(onE[0]).toBeLessThan(onE[1]);
    });
});
