import type { ScoreEvent, SemanticScore } from '../../public/songbook/score-types.js';
import { PPQ } from '../core/types.js';
import { COUNTED_FIXTURES, FIXTURES, score } from '../test/scores.js';
import { buildMeter } from './meter.js';
import {
    chordAt,
    compileTimeline,
    FERMATA_STRETCH,
    firstSpanAfter,
    secondsAt,
    spanIndexAt,
    type Timeline,
} from './timeline.js';

const BAR = PPQ * 4;

describe('meter skeleton', () => {
    it.each([
        ['4/4', null, [0, 480, 960, 1440], ['down', 'back', 'strong', 'back']],
        ['3/4', null, [0, 480, 960], ['down', 'back', 'back']],
        ['6/8', null, [0, 720], ['down', 'back']],
        ['7/8', [2, 2, 3], [0, 480, 960], ['down', 'back', 'back']],
        ['7/8', null, [0, 480, 960], ['down', 'back', 'back']],
        ['5/4', null, [0, 480, 960, 1440, 1920], ['down', 'back', 'strong', 'back', 'back']],
    ] as const)('%s %j', (name, grouping, pulses, roles) => {
        const meter = buildMeter(name, grouping ? [...grouping] : null);
        expect(meter.pulses).toEqual(pulses);
        expect(meter.roles).toEqual(roles);
    });

    it('marks only quarter-note pulses as able to swing', () => {
        expect(buildMeter('4/4', null).quarterPulse).toBe(true);
        expect(buildMeter('6/8', null).quarterPulse).toBe(false);
    });
});

describe('timeline', () => {
    it('lays bars end to end in ticks with one span per chord', () => {
        const t = compileTimeline(FIXTURES.blues);
        expect(t.bars).toHaveLength(12);
        expect(t.ticks).toBe(12 * BAR);
        expect(
            t.bars[10].spans.map((s) => [s.start - t.bars[10].start, s.end - t.bars[10].start]),
        ).toEqual([
            [0, 960],
            [960, 1920],
        ]);
    });

    it('unrolls section repeats into separate visits', () => {
        const t = compileTimeline(FIXTURES.rhythmChanges);
        expect(t.bars).toHaveLength(32);
        expect(t.visits.map((v) => [v.label, v.pass, v.barCount])).toEqual([
            ['A', 0, 8],
            ['A', 1, 8],
            ['B', 0, 8],
            ['A', 0, 8],
        ]);
        expect(t.bars[9].barInVisit).toBe(1);
    });

    it('follows written repeats with endings', () => {
        const t = compileTimeline(
            score([
                {
                    label: 'A',
                    bars: 'C | F | G | Am',
                    start: {
                        0: [{ kind: 'repeat-start' }],
                        2: [{ kind: 'ending-start', passes: [1] }],
                        3: [{ kind: 'ending-start', passes: [2] }],
                    },
                    end: { 2: [{ kind: 'repeat-end', times: 2 }], 3: [{ kind: 'ending-end' }] },
                },
            ]),
        );
        // First time C F G, second time C F Am.
        expect(t.bars.map((b) => b.spans[0].chord?.root)).toEqual([0, 5, 7, 0, 5, 9]);
    });

    it('starts a new visit where a D.S. jumps back inside a section, not at an inner repeat', () => {
        // D.S. to a segno on bar 2 of the same section: the return is its own visit, not bars
        // 5–7 of one long one.
        const ds = compileTimeline(
            score([
                {
                    label: 'A',
                    bars: 'C | F | G | Am',
                    start: { 1: [{ kind: 'segno', label: 'S' }] },
                    end: {
                        3: [
                            {
                                kind: 'jump',
                                from: 'segno',
                                segno: 'S',
                                destination: { kind: 'end' },
                                repeats: 'play',
                            },
                        ],
                    },
                },
            ]),
        );
        expect(ds.visits.map((v) => [v.label, v.barCount])).toEqual([
            ['A', 4],
            ['A', 3],
        ]);
        expect(ds.bars.map((b) => b.barInVisit)).toEqual([0, 1, 2, 3, 0, 1, 2]);
        const repeat = compileTimeline(
            score([
                {
                    label: 'A',
                    bars: 'C | F | G | Am',
                    start: { 1: [{ kind: 'repeat-start' }] },
                    end: { 2: [{ kind: 'repeat-end', times: 3 }] },
                },
            ]),
        );
        // A written repeat from bar 2 (a vamp, three times) stays inside its visit.
        expect(repeat.visits.map((v) => v.barCount)).toEqual([8]);
        expect(repeat.bars.map((b) => b.barInVisit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        // A repeat from the section's first bar starts a visit per lap; its second ending
        // skips forward, which stays inside the visit.
        const endings = compileTimeline(
            score([
                {
                    label: 'A',
                    bars: 'C | F | G | Am',
                    start: {
                        0: [{ kind: 'repeat-start' }],
                        2: [{ kind: 'ending-start', passes: [1] }],
                        3: [{ kind: 'ending-start', passes: [2] }],
                    },
                    end: { 2: [{ kind: 'repeat-end', times: 2 }], 3: [{ kind: 'ending-end' }] },
                },
            ]),
        );
        expect(endings.visits.map((v) => v.barCount)).toEqual([3, 3]);
    });

    it('resolves roman numerals against the section key', () => {
        const t = compileTimeline(FIXTURES.romanNumerals);
        expect(chordAt(t, 0)?.root).toBe(7); // I in G
        expect(chordAt(t, 3 * BAR)?.root).toBe(2); // V7 in G = D
    });

    it('extends holds, rests on N.C., and stretches fermatas', () => {
        const t = compileTimeline(FIXTURES.awkward);
        const holds = t.bars.filter((b) => b.visit.label === 'Holds');
        // Bar 0 C and bar 1 hold are one span; bar 1 sees it without an attack.
        expect(holds[1].spans).toHaveLength(1);
        expect(holds[1].spans[0].attack).toBe(false);
        expect(holds[1].spans[0].chord?.root).toBe(0);
        expect(holds[2].spans[0].chord).toBeNull();
        expect(holds[3].spans.map((s) => s.chord === null)).toEqual([false, true]);
        expect(holds[4].spans[0].fermata).toBe(true);
        const last = holds[4];
        const bpm = 120;
        const written = (BAR / PPQ) * (60 / bpm);
        expect(secondsAt(t, last.start + BAR, bpm) - secondsAt(t, last.start, bpm)).toBeCloseTo(
            written * FERMATA_STRETCH,
        );
    });

    it('gives every meter its own bar length', () => {
        const t = compileTimeline(FIXTURES.awkward);
        const lengths = t.bars.map((b) => [b.visit.label, b.meter.barTicks]);
        expect(lengths).toContainEqual(['Waltz', 3 * PPQ]);
        expect(lengths).toContainEqual(['Seven', 7 * (PPQ / 2)]);
        expect(lengths).toContainEqual(['Six', 6 * (PPQ / 2)]);
    });

    it('phrases in fours, folding a short tail into the last phrase', () => {
        const t = compileTimeline(FIXTURES.blues);
        expect(t.bars.map((b) => b.phrase.index)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
        const six = compileTimeline(score([{ label: 'A', bars: 'C|C|C|C|C|C' }]));
        expect(six.bars.map((b) => b.phrase.length)).toEqual([6, 6, 6, 6, 6, 6]);
    });

    it('compiles every fixture', () => {
        for (const [name, s] of Object.entries(FIXTURES)) {
            const t = compileTimeline(s);
            expect(t.bars.length, name).toBeGreaterThan(0);
            for (const bar of t.bars) {
                const covered = bar.spans.reduce((sum, span) => sum + span.end - span.start, 0);
                expect(covered, `${name} bar ${bar.index}`).toBe(bar.meter.barTicks);
            }
        }
    });
});

/**
 * The tick lookups are binary searches over spans sorted by start (#1475: a counted chart's
 * timeline holds every chorus, and a scan from the top made every lookup cost the performance
 * so far). Pinned against the plain scans they replaced, written out here, at every place a
 * search can go wrong: each span's edges and their neighbours, midpoints, bar starts, before
 * the first span and at and past the end — on every fixture, counted ones, and two charts
 * whose rounded durations overrun a barline (the overlap the walk back exists for).
 */
describe('tick lookups', () => {
    const scanIndex = (t: Timeline, tick: number) =>
        t.spans.findIndex((s) => s.start <= tick && tick < s.end);
    const scanAfter = (t: Timeline, tick: number) => {
        const i = t.spans.findIndex((s) => s.start > tick);
        return i < 0 ? t.spans.length : i;
    };
    const chord = (symbol: string, n: number, d: number): ScoreEvent => ({
        kind: 'chord',
        symbol,
        duration: [n, d],
    });
    const hold = (n: number, d: number): ScoreEvent => ({ kind: 'hold', duration: [n, d] });
    const twoBars = (first: ScoreEvent[]): SemanticScore => ({
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
                measures: [
                    { id: 'm1', content: { kind: 'events', events: first } },
                    { id: 'm2', content: { kind: 'events', events: [chord('G7', 4, 1)] } },
                ],
            },
        ],
    });
    // Seven sevenths of a quarter round to 69 ticks each: the bar's last span ends at 1923,
    // past the next bar's first span at 1920.
    const overrun = twoBars([
        chord('C', 3, 1),
        ...Array.from({ length: 7 }, (_, i) => chord(i % 2 ? 'F' : 'Dm', 1, 7)),
    ]);
    // The same overrun on the very first span: a chord held over 27 sevenths, ending at 1932.
    const overrunFirst = twoBars([
        chord('C', 1, 7),
        ...Array.from({ length: 27 }, () => hold(1, 7)),
    ]);

    it('the overrun charts really overlap at the barline', () => {
        expect(
            compileTimeline(overrun)
                .spans.slice(7, 9)
                .map((s) => [s.start, s.end]),
        ).toEqual([
            [1854, 1923],
            [1920, 3840],
        ]);
        expect(
            compileTimeline(overrunFirst)
                .spans.slice(0, 2)
                .map((s) => [s.start, s.end]),
        ).toEqual([
            [0, 1932],
            [1920, 3840],
        ]);
    });

    const charts: [string, SemanticScore][] = [
        ...Object.entries(FIXTURES),
        ...Object.entries(FIXTURES).map(
            ([name, s]) => [`${name} x3`, { ...s, choruses: 3 }] as [string, SemanticScore],
        ),
        ...Object.entries(COUNTED_FIXTURES),
        ['overrun', overrun],
        ['overrun x2', { ...overrun, choruses: 2 }],
        ['overrunFirst', overrunFirst],
    ];
    it.each(charts)('%s: the searches answer what the scans answer', (_name, chart) => {
        const t = compileTimeline(chart);
        const ticks = new Set<number>([-1, -0.5, 0, t.ticks - 1, t.ticks, t.ticks + 1, 1e9]);
        for (const s of t.spans) {
            for (const edge of [s.start, s.end]) {
                for (const d of [-1, -0.5, 0, 0.5, 1]) {
                    ticks.add(edge + d);
                }
            }
            ticks.add((s.start + s.end) / 2);
        }
        for (const bar of t.bars) {
            ticks.add(bar.start);
        }
        const failures: string[] = [];
        for (const tick of ticks) {
            const index = scanIndex(t, tick);
            if (spanIndexAt(t, tick) !== index) {
                failures.push(`spanIndexAt ${tick}`);
            }
            if (firstSpanAfter(t, tick) !== scanAfter(t, tick)) {
                failures.push(`firstSpanAfter ${tick}`);
            }
            if (chordAt(t, tick) !== (t.spans[index]?.chord ?? null)) {
                failures.push(`chordAt ${tick}`);
            }
        }
        expect(failures.slice(0, 10)).toEqual([]);
    });
});
