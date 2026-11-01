import { resolveScoreMeasureEvents } from '../../core/songbook/score-measure-events.js';
import type { ScoreEvent, SemanticScore } from '../../core/songbook/score-types.js';
import { PPQ } from '../core/types.js';
import { COUNTED_FIXTURES, FIXTURES, score } from '../test/scores.js';
import { buildMeter } from './meter.js';
import {
    chordAt,
    compileTimeline,
    FERMATA_STRETCH,
    firstSpanAfter,
    MAX_PERFORMED_SPANS,
    secondsAt,
    spanIndexAt,
    type Timeline,
} from './timeline.js';

// The real resolver, wrapped only so the ceiling test can see that it never ran.
vi.mock('../../core/songbook/score-measure-events.js', async (original) => {
    const real = await original<typeof import('../../core/songbook/score-measure-events.js')>();
    return { ...real, resolveScoreMeasureEvents: vi.fn(real.resolveScoreMeasureEvents) };
});

const BAR = PPQ * 4;

/** A chart whose second bar changes the key and the meter mid-section, with a D.C. al Fine. */
const BAR_CONTEXT: SemanticScore = (() => {
    const built = score([
        { label: 'A', bars: 'I' },
        { label: 'waltz', meter: '3/4', bars: 'I | I' },
        { label: 'B', bars: 'I' },
    ]);
    const [a, waltz, b] = built.sections;
    // The 3/4 bars join A as bars of A: the meter is written on the bar, not on a section.
    a.measures.push(...waltz.measures);
    a.measures[1] = { ...a.measures[1], key: 'D', meter: '3/4' };
    a.measures[2] = { ...a.measures[2], end: [{ kind: 'fine', label: 'finish' }] };
    b.measures[0] = {
        ...b.measures[0],
        end: [
            {
                kind: 'jump',
                from: 'start',
                destination: { kind: 'fine', label: 'finish' },
                repeats: 'skip',
            },
        ],
    };
    return { ...built, sections: [a, b] };
})();

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

    it("keeps a bar's key and meter change to the end of its section, and again on a D.C.", () => {
        // A: I | I (now in D, 3/4) | I, Fine.  B: I, D.C. al Fine. The change written on A's
        // second bar holds for its third, is gone at B (which starts over from the score), and
        // is back when the D.C. plays A again.
        const t = compileTimeline(BAR_CONTEXT);
        expect(t.bars.map((b) => b.visit.label)).toEqual(['A', 'A', 'A', 'B', 'A', 'A', 'A']);
        expect(t.bars.map((b) => b.key.tonic)).toEqual([0, 2, 2, 0, 0, 2, 2]);
        const waltz = 3 * PPQ;
        expect(t.bars.map((b) => b.meter.barTicks)).toEqual([
            BAR,
            waltz,
            waltz,
            BAR,
            BAR,
            waltz,
            waltz,
        ]);
        // Each bar starts where the one before ended, whatever its length.
        const starts = [0, BAR, BAR + waltz, BAR + 2 * waltz, 2 * BAR + 2 * waltz];
        expect(t.bars.slice(0, 5).map((b) => b.start)).toEqual(starts);
        // The I chord is the tonic of whichever key its bar is in.
        expect(t.bars.map((b) => chordAt(t, b.start)?.root)).toEqual([0, 2, 2, 0, 0, 2, 2]);
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
    // Seven sevenths of a quarter are 68.57 ticks each. Rounded one by one they took 69 and the
    // bar's last span ended at 1923, past the next bar's first span at 1920.
    const overrun = twoBars([
        chord('C', 3, 1),
        ...Array.from({ length: 7 }, (_, i) => chord(i % 2 ? 'F' : 'Dm', 1, 7)),
    ]);
    // The same on the very first span: a chord held over 27 sevenths, which ended at 1932.
    const overrunFirst = twoBars([
        chord('C', 1, 7),
        ...Array.from({ length: 27 }, () => hold(1, 7)),
    ]);
    // #1684: a long chord, then 63 chords of 0.6 ticks each. Rounded one by one, each took a
    // whole tick, so the bar ran 25 ticks past the barline and its last chords started after
    // the next bar's first: out of start order, which the binary searches assume.
    const outOfOrder = twoBars([
        chord('C', 3137, 800),
        ...Array.from({ length: 63 }, (_, i) => chord(i % 2 ? 'F' : 'Dm', 1, 800)),
    ]);

    it('rounding never carries a bar past its barline (#1684)', () => {
        expect(
            compileTimeline(overrun)
                .spans.slice(7, 9)
                .map((s) => [s.start, s.end]),
        ).toEqual([
            [1851, 1920],
            [1920, 3840],
        ]);
        expect(
            compileTimeline(overrunFirst)
                .spans.slice(0, 2)
                .map((s) => [s.start, s.end]),
        ).toEqual([
            [0, 1920],
            [1920, 3840],
        ]);
        const charts = [
            ...Object.values(FIXTURES),
            ...Object.values(COUNTED_FIXTURES),
            overrun,
            overrunFirst,
            outOfOrder,
            { ...outOfOrder, choruses: 2 },
        ];
        for (const chart of charts) {
            const t = compileTimeline(chart);
            const gaps = t.spans.filter((s, i) => s.start !== (i ? t.spans[i - 1].end : 0));
            expect(gaps).toEqual([]);
            expect(t.spans.at(-1)?.end).toBe(t.ticks);
        }
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
        ['outOfOrder', outOfOrder],
        ['outOfOrder x2', { ...outOfOrder, choruses: 2 }],
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

describe('performed span ceiling (#1632)', () => {
    /** A section of `bars` 4/4 bars, each of `perBar` equal chord events (durations are in beats). */
    function denseSection(label: string, bars: number, perBar: number, repeat = 1) {
        const built = score([{ label, bars: Array(bars).fill('C').join(' | '), repeat }]);
        const [section] = built.sections;
        section.id = `section-${label}`;
        section.measures = section.measures.map((measure, i) => ({
            ...measure,
            id: `${label}-${i}`,
            content: {
                kind: 'events' as const,
                events: Array.from({ length: perBar }, () => ({
                    kind: 'chord' as const,
                    symbol: 'C',
                    duration: (perBar === 1 ? [4, 1] : [1, perBar / 4]) as [number, number],
                })),
            },
        }));
        return section;
    }
    const chart = (sections: SemanticScore['sections'], choruses?: number): SemanticScore => ({
        ...score([{ label: 'x', bars: 'C' }]),
        sections,
        ...(choruses ? { choruses } : {}),
    });

    it('accepts exactly the ceiling and refuses one past it', () => {
        // 16 bars x 64 events, played 64 times: exactly 65,536 performed events.
        const at = [denseSection('A', 16, 64, 64)];
        expect(compileTimeline(chart(at)).spans).toHaveLength(MAX_PERFORMED_SPANS);
        // One more single-event bar is 65,537.
        const past = [...at, denseSection('B', 1, 1)];
        expect(() => compileTimeline(chart(past))).toThrow(
            'This chart plays more than the playback limit of 65,536 chord events. Reduce repeats or chords per bar.',
        );
    });

    it('refuses the 256 bars x 64 events x 64 choruses probe before any event is copied', () => {
        const probe = chart([denseSection('A', 256, 64)], 64);
        vi.mocked(resolveScoreMeasureEvents).mockClear();
        // A counted chart is told choruses are one of the things to reduce.
        expect(() => compileTimeline(probe)).toThrow(
            'This chart plays more than the playback limit of 65,536 chord events. Reduce repeats, choruses or chords per bar.',
        );
        // The count comes from the written events and the performed bar order alone: the
        // step that would copy a million events never runs.
        expect(resolveScoreMeasureEvents).not.toHaveBeenCalled();
    });
});

describe('fermata time (#1665)', () => {
    const chord = (n: number, d: number, fermata = true): ScoreEvent => ({
        kind: 'chord',
        symbol: 'C',
        duration: [n, d],
        ...(fermata ? { fermata } : {}),
    });
    /** A 4/4 chart of the given bars, played `repeat` times. */
    const chart = (bars: ScoreEvent[][], repeat = 1): SemanticScore => {
        const built = score([{ label: 'A', bars: bars.map(() => 'C').join(' | '), repeat }]);
        built.sections[0].measures.forEach((measure, i) => {
            measure.content = { kind: 'events', events: bars[i] };
        });
        return built;
    };
    /** What `secondsAt` answered when it walked every stretch: the reference. */
    function scanSeconds(t: Timeline, tick: number, bpm: number): number {
        const perTick = 60 / bpm / PPQ;
        let seconds = tick * perTick;
        for (const s of t.stretches) {
            if (s.start >= tick) {
                break;
            }
            seconds += (Math.min(tick, s.end) - s.start) * perTick * (s.factor - 1);
        }
        return seconds;
    }

    const sixteenths = Array.from({ length: 16 }, (_, i) => chord(1, 4, i % 3 !== 1));
    // 63 fermatas of half a tick each. Rounded one by one they took a tick each and overran the
    // bar by 31 ticks, starting after the next bar's first stretches (#1684).
    const halfTicks = Array.from({ length: 63 }, () => chord(1, 960));
    const overrun = chart(
        [
            [chord(1259, 320), ...halfTicks],
            [...halfTicks, chord(1259, 320)],
        ],
        2,
    );
    // Too short for a tick: stretches of no length, all on one tick.
    const noTicks = Array.from({ length: 5 }, () => chord(1, 1_000_000));
    const charts: [string, SemanticScore][] = [
        ['awkward', FIXTURES.awkward],
        ['some bars', chart([[chord(4, 1)], [chord(4, 1, false)], [chord(2, 1), chord(2, 1)]], 3)],
        ['sixteenths', chart([sixteenths, sixteenths], 2)],
        ['overrun', overrun],
        ['no length', chart([[...noTicks, chord(799_999, 200_000)], [chord(4, 1)]], 2)],
    ];

    it('stretches run in order and never overlap, however their bars round (#1684)', () => {
        for (const [name, written] of charts) {
            const { stretches } = compileTimeline(written);
            const crossed = stretches.filter((s, i) => i > 0 && s.start < stretches[i - 1].end);
            expect(crossed, name).toEqual([]);
        }
    });

    it.each(charts)('%s: the search answers what the scan answers', (_name, written) => {
        const t = compileTimeline(written);
        expect(t.stretches.length).toBeGreaterThan(0);
        const ticks = new Set<number>([-1, 0, t.ticks, t.ticks + 1, 1e9]);
        for (const s of t.stretches) {
            for (const edge of [s.start, s.end]) {
                for (const d of [-1, -0.5, 0, 0.5, 1]) {
                    ticks.add(edge + d);
                }
            }
            ticks.add((s.start + s.end) / 2);
        }
        const failures: string[] = [];
        for (const bpm of [60, 97, 183.5]) {
            for (const tick of ticks) {
                // The same time to a part in a million million: the scan summed the same
                // stretches in a different order.
                const scanned = scanSeconds(t, tick, bpm);
                if (Math.abs(secondsAt(t, tick, bpm) - scanned) > 1e-12 * Math.abs(scanned)) {
                    failures.push(`${tick} at ${bpm}`);
                }
            }
        }
        expect(failures.slice(0, 10)).toEqual([]);
    });

    it('is the written time, to the bit, where no fermata has begun', () => {
        const t = compileTimeline(chart([[chord(4, 1, false)], [chord(4, 1)]]));
        for (const tick of [0, 1, 479.5, 960, BAR]) {
            expect(secondsAt(t, tick, 97)).toBe(tick * (60 / 97 / PPQ));
        }
    });

    it('does not walk the stretches for each answer', () => {
        // 64 bars of 64 fermatas. Each stretch counts how often it is read.
        const dense = Array.from({ length: 64 }, () => chord(1, 16));
        const t = compileTimeline(chart(Array.from({ length: 64 }, () => dense)));
        expect(t.stretches).toHaveLength(4096);
        let reads = 0;
        const counted: Timeline = {
            ...t,
            stretches: t.stretches.map(
                (s) =>
                    new Proxy(s, {
                        get(target, key, receiver) {
                            reads++;
                            return Reflect.get(target, key, receiver);
                        },
                    }),
            ),
        };
        // The first answer may index them all; the rest must not.
        secondsAt(counted, t.ticks, 120);
        reads = 0;
        const asked = 1000;
        for (let i = 1; i <= asked; i++) {
            const tick = Math.floor((t.ticks * i) / asked);
            expect(secondsAt(counted, tick, 120)).toBeCloseTo(scanSeconds(t, tick, 120), 9);
        }
        // A walk reads half of them on average: 2,048 stretches an answer. A search reads a
        // dozen at most, three fields each.
        expect(reads / asked).toBeLessThan(3 * Math.log2(t.stretches.length));
    });
});

describe('modal tonics and implied tensions (#2011)', () => {
    const scaleAt = (bars: string, opts: { key: string; isMinor: boolean }, bar: number) => {
        const t = compileTimeline(score([{ label: 'A', bars }], opts));
        return chordAt(t, t.bars[bar].start)?.scale;
    };
    const DORIAN = [0, 2, 3, 5, 7, 9, 10];
    const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
    const E = { key: 'E', isMinor: true };

    it('plays dorian on a minor tonic beside a major or dominant IV', () => {
        expect(scaleAt('Em7 | A7 | Em7 | A7', E, 0)).toEqual(DORIAN);
        expect(scaleAt('Em7 | Amaj7 | Em7 | Amaj7', E, 2)).toEqual(DORIAN);
    });

    it('keeps natural minor beside a bVI, and with no IV', () => {
        expect(scaleAt('Em7 | C | Em7 | C', E, 0)).toEqual(AEOLIAN);
        expect(scaleAt('Em7 | A7 | C | Em7', E, 3)).toEqual(AEOLIAN);
        expect(scaleAt('Em7 | B7 | Em7 | B7', E, 0)).toEqual(AEOLIAN);
        expect(scaleAt('Em7 | Am7 | Em7 | Am7', E, 0)).toEqual(AEOLIAN);
    });

    it('measures the IV from the chord root, not a slash bass', () => {
        // E/A is the tonic chord over a IV bass, not a IV root.
        expect(scaleAt('Em7 | E/A | Em7 | E/A', E, 0)).toEqual(AEOLIAN);
    });

    it('swaps the natural 13 for b13 on a written b9/#9 dominant into a minor chord', () => {
        const C = { key: 'C', isMinor: true };
        for (const [sym, scale] of [
            ['G7b9', [0, 1, 4, 5, 7, 8, 10]],
            ['G7#9', [0, 1, 3, 4, 7, 8, 10]],
        ] as const) {
            const t = compileTimeline(score([{ label: 'A', bars: `${sym} | Cm7` }], C));
            const g = chordAt(t, 0);
            expect(g?.scale, sym).toEqual(scale);
            expect(g?.implied?.thirteenth, sym).toBe(8);
        }
        // A written 13 is the musician's call.
        const t = compileTimeline(score([{ label: 'A', bars: 'G13b9 | Cm7' }], C));
        expect(chordAt(t, 0)?.implied).toBeUndefined();
    });

    it('does not touch a b9 dominant that does not resolve to minor', () => {
        const t = compileTimeline(
            score([{ label: 'A', bars: 'G7b9 | Cmaj7' }], { key: 'C', isMinor: false }),
        );
        expect(chordAt(t, 0)?.implied).toBeUndefined();
    });
});
