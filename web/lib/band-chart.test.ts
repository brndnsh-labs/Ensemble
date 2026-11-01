/**
 * The band engine's chart display (`band-chart.ts`). Pinned here: every written event gets a
 * place on the sheet (holds, N.C. and fermatas included), each performed event lands exactly on
 * the band timeline's ticks, and the playhead lookup agrees with the timeline at the edges.
 */
import { compileTimeline, PPQ } from '@band/index';
import type { ScoreEvent, ScoreMeasure, SemanticScore } from '@core/songbook/score-types';
import { describe, expect, it } from 'vitest';
import {
    auditionMidis,
    bandChart,
    chordNames,
    sectionSteps,
    shiftedBlocks,
    shiftedChord,
    slotAt,
} from './band-chart';

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

    it("meets the timeline's spans where a bar's lengths are not whole ticks (#1684)", () => {
        // Sevenths of a quarter, and chords of 0.6 ticks: each rounds, and the slots must
        // round where the band's spans do, ending on the barline.
        const uneven = song([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [
                    bar('m1', [
                        chord('C', 3),
                        ...Array.from({ length: 7 }, (_, i) => chord(i % 2 ? 'F' : 'Dm', 1, 7)),
                    ]),
                    bar('m2', [
                        chord('C', 3137, 800),
                        ...Array.from({ length: 63 }, (_, i) => chord(i % 2 ? 'F' : 'Dm', 1, 800)),
                    ]),
                    bar('m3', [chord('G7', 4)]),
                ],
            },
        ]);
        const timeline = compileTimeline(uneven);
        const view = bandChart(uneven, timeline);
        expect(view.slots.map((s) => [s.from, s.to])).toEqual(
            timeline.spans.map((s) => [s.start, s.end]),
        );
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
        // Each performed bar is its own `slots[].bar` value, m1's repeated PASSES included
        // — the multi-chord bar (m1: C, G) puts two slots in bar 0, not one each in bars 0 and 1
        // (#1458 patch review P1-1), and m1's second pass gets bar 2, not bar 0 again (P2-1).
        expect(view.slots.map((s) => s.bar)).toEqual([0, 0, 1, 2, 2, 3, 4]);
    });

    it('loops one time through a section of a counted chart, from the first chorus that plays it (#1475)', () => {
        const counted: SemanticScore = {
            ...song([
                {
                    id: 'a',
                    label: 'A',
                    repeat: 2,
                    measures: [bar('m1', [chord('C', 4)]), bar('m2', [chord('G7', 4)])],
                },
                {
                    id: 'b',
                    label: 'B',
                    repeat: 1,
                    measures: [
                        {
                            ...bar('m3', [chord('F', 4)]),
                            end: [
                                { kind: 'coda', label: 'to-coda' },
                                {
                                    kind: 'last-chorus',
                                    destination: { kind: 'coda', via: 'to-coda', target: 'coda' },
                                },
                            ],
                        },
                    ],
                },
                {
                    id: 'coda',
                    label: 'Coda',
                    repeat: 1,
                    measures: [
                        { ...bar('c1', [chord('C', 4)]), start: [{ kind: 'coda', label: 'coda' }] },
                    ],
                },
            ]),
            choruses: 3,
        };
        const view = bandChart(counted, compileTimeline(counted));
        // Three choruses of A twice and B (5 bars each), then the coda: 16 bars.
        expect(view.slots).toHaveLength(16);
        // A's window is its two passes in the first chorus only, not a span across all three.
        expect(sectionSteps(view, 'a')).toEqual({ start: 0, end: 64 });
        expect(sectionSteps(view, 'b')).toEqual({ start: 64, end: 80 });
        // The coda is played by the last chorus alone, so that is where its loop is.
        expect(sectionSteps(view, 'coda')).toEqual({ start: 240, end: 256 });
    });

    it('a one-bar written repeat (`||: F7 :|| x4`) gives each of its 4 passes its own performed bar', () => {
        const oneBarRepeat = song([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [
                    {
                        id: 'm1',
                        content: { kind: 'events', events: [chord('F7', 4)] },
                        start: [{ kind: 'repeat-start' }],
                        end: [{ kind: 'repeat-end', times: 4 }],
                    },
                ],
            },
        ]);
        const view = bandChart(oneBarRepeat, compileTimeline(oneBarRepeat));
        // One written event, performed 4 times — display never changes, `bar` counts the passes.
        expect(view.slots.map((s) => s.display)).toEqual([0, 0, 0, 0]);
        expect(view.slots.map((s) => s.bar)).toEqual([0, 1, 2, 3]);
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

    it('reads the m of madd9 as the minor third, and writes a minor-major seventh as mMaj7', () => {
        expect(names('imadd9')).toEqual({ name: 'Cmadd9', roman: 'imadd9', nns: '1-add9' });
        expect(names('Cmadd9')).toEqual({ name: 'Cmadd9', roman: 'iadd9', nns: '1-add9' });
        expect(names('iimadd9/5').name).toBe('Dmadd9/G');
        expect(names('imaj7')).toEqual({ name: 'CmMaj7', roman: 'imaj7', nns: '1-maj7' });
        expect(names('CmMaj7')).toEqual({ name: 'CmMaj7', roman: 'iMaj7', nns: '1-Maj7' });
        // Still a major seventh, not a minor third.
        expect(names('Cma7')).toEqual({ name: 'Cma7', roman: 'Ima7', nns: '1ma7' });
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

describe('the chords a transposing instrument reads (#1992)', () => {
    const read = (symbol: string, key: string, isMinor: boolean, shift: number) => {
        const chord = {
            globalIndex: 0,
            start: 0,
            end: 16,
            key,
            keyIsMinor: isMinor,
            timeSignature: '4/4',
            kind: 'chord' as const,
            ...chordNames(symbol, key, isMinor),
        };
        return shiftedChord(chord, shift);
    };
    const name = (symbol: string, key: string, isMinor: boolean, shift: number) =>
        read(symbol, key, isMinor, shift).absName;

    it('a B♭ instrument reads a whole step up, an E♭ one a major sixth up', () => {
        expect(name('C^7', 'C', false, 2)).toBe('D^7');
        expect(name('Dm7', 'C', false, 2)).toBe('Em7');
        expect(name('G7', 'C', false, 2)).toBe('A7');
        expect(name('C^7', 'C', false, 9)).toBe('A^7');
        expect(name('G7', 'C', false, 9)).toBe('E7');
    });

    it('spells from the key the part lands in', () => {
        // Concert E minor on a B♭ horn is F# minor: sharps, never Gb.
        expect(name('Em7', 'E', true, 2)).toBe('F#m7');
        expect(name('B7', 'E', true, 2)).toBe('C#7');
        // Concert F on a B♭ horn is G; on an E♭ horn, D. Concert Bb on E♭ is G.
        expect(name('Bb7', 'F', false, 2)).toBe('C7');
        expect(name('Eb^7', 'Bb', false, 9)).toBe('C^7');
        // Concert Ab major on a B♭ horn is Bb major: flats.
        expect(name('Db^7', 'Ab', false, 2)).toBe('Eb^7');
        // Outside the key, in a sharp key: concert E's secondary dominant G#7 is A#7 in F#.
        expect(name('G#7', 'E', false, 2)).toBe('A#7');
        expect(name('C#7', 'E', false, 2)).toBe('D#7');
        // A borrowed chord in a flat key stays flat: concert C's Ab^7 on an E♭ horn (A) is F^7.
        expect(name('Ab^7', 'C', false, 9)).toBe('F^7');
    });

    it('moves a slash bass with its chord and the key with them', () => {
        const chord = read('C/E', 'C', false, 2);
        expect(chord.absName).toBe('D/F#');
        expect(chord.display?.name.bass).toBe('F#');
        expect(chord.key).toBe('D');
    });

    it('leaves numerals, holds and a concert instrument as they are', () => {
        const chord = read('G7', 'C', false, 2);
        expect(chord.display?.roman).toEqual(read('G7', 'C', false, 0).display?.roman);
        expect(chord.display?.nns).toEqual(read('G7', 'C', false, 0).display?.nns);
        const plain = read('G7', 'C', false, 0);
        expect(shiftedChord(plain, 0)).toBe(plain);
        const hold = { ...plain, kind: 'hold' as const };
        expect(shiftedChord(hold, 2)).toBe(hold);
        const blocks = [{ measures: [] }];
        expect(shiftedBlocks(blocks, 12)).toBe(blocks);
    });
});
