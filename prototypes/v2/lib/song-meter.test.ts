/**
 * The song-level meter change (#1371). What is pinned here is which bars it may touch and that it
 * never rounds: the bar editor's `No rounding` contract (`docs/design/ensemble-v2-charts.md`)
 * applies to a whole-song change exactly as it does to one typed bar.
 */
import { validateSemanticScore } from '@engine/songbook/score-codec';
import type { ScoreEvent, ScoreMeasure, SemanticScore } from '@engine/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { withSectionMeter, withSongMeter } from './song-meter';

const chord = (symbol: string, n: number, d = 1): Extract<ScoreEvent, { kind: 'chord' }> => ({
    kind: 'chord',
    symbol,
    duration: [n, d],
});
const bar = (
    id: string,
    events: ScoreEvent[],
    extra: Partial<ScoreMeasure> = {},
): ScoreMeasure => ({
    id,
    content: { kind: 'events', events },
    ...extra,
});
const song = (sections: SemanticScore['sections'], meter = '4/4'): SemanticScore => ({
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter,
    grouping: null,
    sections,
});
const section = (id: string, measures: ScoreMeasure[], extra = {}) => ({
    id,
    label: id.toUpperCase(),
    repeat: 1,
    measures,
    ...extra,
});
const durations = (score: SemanticScore, sectionIndex = 0) =>
    score.sections[sectionIndex].measures.map((measure) =>
        measure.content.kind === 'events'
            ? measure.content.events.map((event) => event.duration.join('/'))
            : measure.content.kind,
    );

function changed(score: SemanticScore, meter: string): SemanticScore {
    const result = withSongMeter(score, meter);
    if (result.kind !== 'ok') {
        throw new Error(result.message);
    }
    // The shell validates before adopting; a result the codec refuses is a bug here.
    expect(validateSemanticScore(result.score).kind).toBe('ok');
    return result.score;
}

describe('withSongMeter', () => {
    it('re-divides whole-bar and equal-length bars, and leaves the source untouched', () => {
        const source = song([
            section('a', [bar('m1', [chord('C', 4)]), bar('m2', [chord('F', 2), chord('G7', 2)])]),
        ]);
        const next = changed(source, '3/4');
        expect(next.meter).toBe('3/4');
        expect(durations(next)).toEqual([['3/1'], ['3/2', '3/2']]);
        expect(source.meter).toBe('4/4');
        expect(durations(source)).toEqual([['4/1'], ['2/1', '2/1']]);
    });

    it('keeps written lengths that already fill the new bar (6/8 ↔ 3/4)', () => {
        const source = song([section('a', [bar('m1', [chord('C', 2), chord('G', 1)])])], '3/4');
        expect(durations(changed(source, '6/8'))).toEqual([['2/1', '1/1']]);
    });

    it('blocks on the first bar with unequal lengths that no longer fit, changing nothing', () => {
        const source = song([
            section('a', [
                bar('m1', [chord('C', 4)]),
                bar('m2', [chord('C', 2), chord('Dm', 1), chord('G7', 1)]),
            ]),
        ]);
        const before = structuredClone(source);
        const result = withSongMeter(source, '3/4');
        expect(result).toMatchObject({ kind: 'blocked', measureId: 'm2' });
        expect(result.kind === 'blocked' && result.message).toContain('A · bar 2');
        expect(result.kind === 'blocked' && result.message).toContain('add up to 4');
        expect(source).toEqual(before);
    });

    it('blocks an equal split the engine cannot place, rather than saving an unplayable bar', () => {
        // Three equal chords are one beat each in 3/4 and 4/3 of a beat in 4/4 — off the grid.
        const source = song(
            [section('a', [bar('m1', [chord('C', 1), chord('Dm', 1), chord('G7', 1)])])],
            '3/4',
        );
        expect(withSongMeter(source, '4/4')).toMatchObject({ kind: 'blocked', measureId: 'm1' });
    });

    it('never touches bars under a section or bar meter override', () => {
        const source = song([
            section('a', [
                bar('m1', [chord('C', 4)]),
                // From here to the end of the section the bar's own 5/4 is in force.
                bar('m2', [chord('F', 3), chord('G', 2)], { meter: '5/4' }),
                bar('m3', [chord('C', 5)]),
            ]),
            section('b', [bar('m4', [chord('Am', 1), chord('D7', 1)])], { meter: '2/4' }),
            // A new section resets to the song context, so this one follows the change.
            section('c', [bar('m5', [chord('G', 4)])]),
        ]);
        const next = changed(source, '3/4');
        expect(durations(next, 0)).toEqual([['3/1'], ['3/1', '2/1'], ['5/1']]);
        expect(durations(next, 1)).toEqual([['1/1', '1/1']]);
        expect(durations(next, 2)).toEqual([['3/1']]);
        expect(next.sections[0].measures[1].meter).toBe('5/4');
        expect(next.sections[1].meter).toBe('2/4');
    });

    it('preserves everything on an event but its length, and leaves measure repeats alone', () => {
        const source = song([
            section('a', [
                bar('m1', [{ ...chord('C', 4), fermata: true, alternates: ['Am'] }]),
                { id: 'm2', content: { kind: 'repeat', measureId: 'm1', display: 'one-bar' } },
            ]),
        ]);
        const next = changed(source, '3/4');
        expect(next.sections[0].measures[0].content).toEqual({
            kind: 'events',
            events: [
                { kind: 'chord', symbol: 'C', duration: [3, 1], fermata: true, alternates: ['Am'] },
            ],
        });
        expect(next.sections[0].measures[1]).toEqual(source.sections[0].measures[1]);
    });

    it('resets the song grouping, which described the old meter', () => {
        const source = { ...song([section('a', [bar('m1', [chord('C', 4)])])]), grouping: [2, 2] };
        expect(changed(source, '3/4').grouping).toBeNull();
    });

    it('drops an inherited-meter grouping with the meter it divided, and keeps one that stands', () => {
        const source = song([
            section('a', [bar('m1', [chord('C', 4)], { grouping: [3, 1] })], { grouping: [1, 3] }),
            section('b', [bar('m2', [chord('C', 5)])], { meter: '5/4', grouping: [3, 2] }),
        ]);
        const next = changed(source, '3/4');
        expect(next.sections[0]).not.toHaveProperty('grouping');
        expect(next.sections[0].measures[0]).not.toHaveProperty('grouping');
        expect(next.sections[1].grouping).toEqual([3, 2]);
    });

    it('is a no-op for the meter already in force, and refuses a malformed one', () => {
        const source = song([section('a', [bar('m1', [chord('C', 4)])])]);
        expect(withSongMeter(source, '4/4')).toEqual({ kind: 'ok', score: source });
        expect(() => withSongMeter(source, '04/4')).toThrow();
    });
});

/** #1374 — the same re-fit rule, scoped to one section's own meter. */
describe('withSectionMeter', () => {
    function sectionChanged(score: SemanticScore, id: string, meter: string | null) {
        const result = withSectionMeter(score, id, meter);
        if (result.kind !== 'ok') {
            throw new Error(result.message);
        }
        expect(validateSemanticScore(result.score).kind).toBe('ok');
        return result.score;
    }

    it("re-fits only that section's bars and leaves the song meter alone", () => {
        const source = song([
            section('a', [bar('a1', [chord('C', 4)])]),
            section('b', [bar('b1', [chord('F', 4)]), bar('b2', [chord('G', 2), chord('C', 2)])]),
        ]);
        const next = sectionChanged(source, 'b', '6/8');
        expect(next.meter).toBe('4/4');
        expect(next.sections[1].meter).toBe('6/8');
        expect(durations(next, 0)).toEqual([['4/1']]);
        expect(durations(next, 1)).toEqual([['3/1'], ['3/2', '3/2']]);
    });

    it('keeps an inner bar that wrote its own meter, and the bars after it', () => {
        const source = song([
            section('a', [
                bar('a1', [chord('C', 4)]),
                bar('a2', [chord('C', 5)], { meter: '5/4' }),
                bar('a3', [chord('C', 5)]),
            ]),
        ]);
        const next = sectionChanged(source, 'a', '3/4');
        expect(durations(next)).toEqual([['3/1'], ['5/1'], ['5/1']]);
    });

    it('returns to the song meter, dropping the section grouping', () => {
        const source = song([
            section('a', [bar('a1', [chord('C', 5)])], { meter: '5/4', grouping: [3, 2] }),
        ]);
        const next = sectionChanged(source, 'a', null);
        expect(next.sections[0]).not.toHaveProperty('meter');
        expect(next.sections[0]).not.toHaveProperty('grouping');
        expect(durations(next)).toEqual([['4/1']]);
    });

    it('blocks on a bar whose unequal lengths cannot follow, changing nothing', () => {
        const source = song([
            section('a', [bar('a1', [chord('C', 2), chord('Dm', 1), chord('G7', 1)])]),
        ]);
        const result = withSectionMeter(source, 'a', '3/4');
        expect(result).toMatchObject({ kind: 'blocked', measureId: 'a1' });
        expect(result.kind === 'blocked' && result.message).toContain('A · bar 1');
        expect(source.sections[0]).not.toHaveProperty('meter');
    });

    it('is a no-op for the meter the section already writes', () => {
        const source = song([section('a', [bar('a1', [chord('C', 3)])], { meter: '3/4' })]);
        expect(withSectionMeter(source, 'a', '3/4')).toEqual({ kind: 'ok', score: source });
    });
});
