import { PPQ } from '../core/types.js';
import { FIXTURES, score } from '../test/scores.js';
import { buildMeter } from './meter.js';
import { chordAt, compileTimeline, FERMATA_STRETCH, secondsAt } from './timeline.js';

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
