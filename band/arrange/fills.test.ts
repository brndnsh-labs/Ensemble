/**
 * Drum fills are sized by where the music is going, and a short loop counts its laps (#2009).
 */
import { DEFAULT_SETTINGS, type DrumHit, PPQ, type StyleId } from '../core/types.js';
import { compileTimeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { type DrumBook, fillStart } from '../players/drums/kit.js';
import { STYLE_IDS } from '../styles/index.js';
import type { BarContext } from '../styles/types.js';
import { score } from '../test/scores.js';
import { fillTier, fullWindow, planBars } from './plan.js';

const LOOP = score([{ label: 'Main', bars: 'C | G | Am | F' }]);
const LAPS = 8;

function lapPlans(style: StyleId) {
    const timeline = compileTimeline(LOOP);
    const settings = { ...DEFAULT_SETTINGS, style, seed: 'fills' };
    return Array.from({ length: LAPS }, (_, pass) =>
        planBars(timeline, settings, { pass, looping: true, window: fullWindow(timeline) }),
    );
}

/** Per lap, the drum hits of the lap's last bar. */
function lapFills(style: StyleId) {
    const timeline = compileTimeline(LOOP);
    const settings = { ...DEFAULT_SETTINGS, style, seed: 'fills' };
    const out: DrumHit[][] = [];
    let memory: PassMemory | undefined;
    for (let pass = 0; pass < LAPS; pass++) {
        const result = performPass(timeline, settings, { pass, looping: true, memory });
        memory = result.memory;
        const drums = result.events.filter((e): e is DrumHit => e.lane === 'drums');
        out.push(drums.filter((e) => e.bar === 3));
    }
    return out;
}

describe('a short loop counts its laps toward 8- and 16-bar periods', () => {
    it.each(STYLE_IDS)('%s: small fill at 8 bars, section fill at 16, none between', (style) => {
        const fills = lapPlans(style).map((plans) => plans[3].fill);
        expect(fills).toEqual([
            'none',
            'phrase',
            'none',
            'section',
            'none',
            'phrase',
            'none',
            'section',
        ]);
    });

    it.each(STYLE_IDS)('%s: a 4-bar loop crashes at most every 16 bars', (style) => {
        const crashes = lapPlans(style).map((plans) => plans[0].crash);
        // The top of lap k is bar 4k: only the 16-bar marks (k = 4) crash once the loop is going.
        expect(crashes.slice(1, 4)).toEqual([false, false, false]);
        expect(crashes[4]).toBe(true);
        expect(crashes.slice(5, 8)).toEqual([false, false, false]);
    });

    // Bossa, neo-soul and acoustic fill a mid-energy section with one beat or less
    // (`fillLength`): there is no shorter pickup to alternate with, by design.
    const SPARING: StyleId[] = ['bossa', 'neosoul', 'acoustic'];
    it.each(STYLE_IDS.filter((s) => !SPARING.includes(s)))(
        '%s: the section fills of two laps are not the same bar',
        (style) => {
            const laps = lapFills(style);
            const sig = (i: number) => JSON.stringify(laps[i].map((e) => [e.piece, e.velocity]));
            expect(sig(3)).not.toEqual(sig(7));
        },
    );

    it('the bigger boundary gets the full fill: 16 small, 32 full, 48 small, 64 full', () => {
        const ordinals = lapPlans('rock').map((plans) => plans[3].fillOrdinal);
        // Laps 1, 3, 5, 7 end at 8, 16, 24, 32… bars played (lap k ends at 4(k+1)).
        expect([ordinals[3], ordinals[7]]).toEqual([1, 2]);
        const sizes = (laps: number) =>
            Array.from({ length: laps }, (_, pass) => {
                const timeline = compileTimeline(LOOP);
                const plans = planBars(
                    timeline,
                    { ...DEFAULT_SETTINGS, style: 'rock' },
                    {
                        pass,
                        looping: true,
                        window: fullWindow(timeline),
                    },
                );
                return plans[3].fill === 'section' ? plans[3].fillOrdinal % 2 : null;
            }).filter((x) => x !== null);
        // Section fills at 16, 32, 48, 64: small (odd), full, small, full.
        expect(sizes(16)).toEqual([1, 0, 1, 0]);
    });

    it('a loop of 8 bars or more still fills every lap', () => {
        const timeline = compileTimeline(
            score([{ label: 'A', bars: Array(8).fill('C').join(' | ') }]),
        );
        const plans = planBars(timeline, DEFAULT_SETTINGS, {
            pass: 1,
            looping: true,
            window: fullWindow(timeline),
        });
        expect(plans[7].fill).toBe('section');
        expect(plans[0].crash).toBe(true);
    });
});

describe('a short counted chart counts its choruses as laps (#2071, from #2009)', () => {
    const timeline = compileTimeline({ ...LOOP, choruses: LAPS });
    const plansFor = (style: StyleId) =>
        planBars(
            timeline,
            { ...DEFAULT_SETTINGS, style, seed: 'fills' },
            { pass: 0, looping: false, window: fullWindow(timeline) },
        );

    it.each(STYLE_IDS)('%s: its chorus seams fill as the loop’s laps do', (style) => {
        const plans = plansFor(style);
        const seams = Array.from({ length: LAPS }, (_, k) => plans[4 * k + 3]);
        // The last chorus ends the song on a held ending, not a fill.
        expect(seams.map((p) => p.fill)).toEqual([
            'none',
            'phrase',
            'none',
            'section',
            'none',
            'phrase',
            'none',
            'none',
        ]);
        expect(seams.at(-1)?.ending).not.toBeNull();
        // The same boundaries the loop marks, sized alike.
        expect(seams[3].fillOrdinal).toBe(1);
        // Only the 16-bar top crashes once the song is going.
        const tops = Array.from({ length: LAPS }, (_, k) => plans[4 * k].crash);
        expect(tops.slice(1)).toEqual([false, false, false, true, false, false, false]);
    });

    it('counts a 7-bar chorus as a lap too: only 8 bars or more is a section', () => {
        const t = compileTimeline({
            ...score([{ label: 'A', bars: Array(7).fill('C').join(' | ') }]),
            choruses: 3,
        });
        const plans = planBars(t, DEFAULT_SETTINGS, {
            pass: 0,
            looping: false,
            window: fullWindow(t),
        });
        // The first seam (7 bars played) crosses no 8-bar line: no fill, no crash after it. The
        // second (14 bars) crosses the 8: a small fill.
        expect(plans[6].fill).toBe('none');
        expect(plans[7].crash).toBe(false);
        expect(plans[13].fill).toBe('phrase');
    });

    it('keeps the section fill where a chorus is a real section seam', () => {
        // Two sections a chorus, or one of 8 bars: every chorus seam is still an arrival.
        for (const chart of [
            score([
                { label: 'A', bars: 'C | G' },
                { label: 'B', bars: 'Am | F' },
            ]),
            score([{ label: 'A', bars: Array(8).fill('C').join(' | ') }]),
        ]) {
            const t = compileTimeline({ ...chart, choruses: 3 });
            const plans = planBars(t, DEFAULT_SETTINGS, {
                pass: 0,
                looping: false,
                window: fullWindow(t),
            });
            const length = t.bars.length / 3;
            expect(plans[length - 1].fill).toBe('section');
            expect(plans[length].crash).toBe(true);
        }
    });
});

describe('hip hop rolls into a louder section on every lap, whatever lifts the bar (#2071)', () => {
    // An intro at its role's own level (low) into a verse (mid). The build into the verse and,
    // from the fourth lap, the pass lift carry the intro's last bar over the low/mid line; the
    // verse is still the louder section.
    const timeline = compileTimeline(
        score([
            { label: 'Intro', bars: 'C | G | Am | F' },
            { label: 'Verse', bars: 'C | G | Am | F' },
        ]),
    );
    const intro = timeline.bars[3];
    it.each([0, 1, 2, 3, 4, 5])('pass %i', (pass) => {
        const { events } = performPass(
            timeline,
            { ...DEFAULT_SETTINGS, style: 'hiphop' },
            { pass, looping: true },
        );
        // The roll: snare in the last beat of the intro, where a drop would leave silence.
        const lastBeat = intro.start + intro.meter.barTicks - PPQ;
        const roll = events.filter(
            (e) =>
                e.lane === 'drums' &&
                e.bar === intro.index &&
                e.piece === 'snare' &&
                e.tick >= lastBeat,
        );
        expect(roll.length).toBeGreaterThanOrEqual(2);
    });

    it('and does not roll into a section that is no louder', () => {
        const level = compileTimeline(
            score([
                { label: 'Verse', bars: 'C | G | Am | F' },
                { label: 'Verse 2', bars: 'C | G | Am | F' },
            ]),
        );
        const { events } = performPass(
            level,
            { ...DEFAULT_SETTINGS, style: 'hiphop' },
            { pass: 3, looping: true },
        );
        const lastBeat = level.bars[3].start + level.bars[3].meter.barTicks - PPQ;
        const snares = events.filter(
            (e) => e.lane === 'drums' && e.bar === 3 && e.piece === 'snare' && e.tick >= lastBeat,
        );
        // It drops out instead: no snare at all where the roll would be.
        expect(snares).toHaveLength(0);
    });
});

describe('a fill is sized by the bigger tier of here and where it leads', () => {
    it('takes the destination tier when it is higher, and keeps its own when it is', () => {
        expect(fillTier(0.5, 0.75)).toBe('high');
        expect(fillTier(0.75, 0.5)).toBe('high');
        expect(fillTier(0.5, 0.5)).toBe('mid');
        expect(fillTier(0.3, null)).toBe('low');
    });

    it('sizes the fill by the destination tier, not the bar it starts in', () => {
        const timeline = compileTimeline(LOOP);
        const book = {
            fillLength: {
                phrase: { low: 1, mid: 2, high: 4 },
                section: { low: 2, mid: 4, high: 8 },
            },
        } as unknown as DrumBook;
        const at = (energy: number, next: number | null) =>
            fillStart(
                {
                    bar: timeline.bars[3],
                    plan: { fill: 'section', energy, level: energy, ending: null, fillOrdinal: 0 },
                    next: next === null ? null : { plan: { energy: next } },
                } as unknown as BarContext,
                book,
            );
        // A 16-step bar: mid into high starts where a high bar's fill starts, 8 steps from the end.
        expect(at(0.5, 0.8)).toBe(16 - 8);
        expect(at(0.5, 0.5)).toBe(16 - 4);
        // Out of a chorus into a verse keeps the chorus's size, so into is never shorter.
        expect(at(0.8, 0.5)).toBe(16 - 8);
    });
});

describe('odd-length vamps and the last lap', () => {
    it.each([2, 3, 5, 6, 7])('a %i-bar loop fills about every 8 bars', (n) => {
        const timeline = compileTimeline(
            score([{ label: 'A', bars: Array(n).fill('C').join(' | ') }]),
        );
        const settings = { ...DEFAULT_SETTINGS, style: 'rock' as const };
        const laps = 40;
        const filled: number[] = [];
        for (let pass = 0; pass < laps; pass++) {
            const plans = planBars(timeline, settings, {
                pass,
                looping: true,
                window: fullWindow(timeline),
            });
            if (plans[n - 1].fill !== 'none') {
                filled.push((pass + 1) * n);
            }
        }
        // Never more than a lap past 16 bars without a fill, and fewer fills than laps.
        for (let k = 1; k < filled.length; k++) {
            expect(filled[k] - filled[k - 1]).toBeLessThanOrEqual(16);
        }
        expect(filled.length).toBeLessThan(laps);
    });

    it('the final, non-looping lap crashes at its top only after a section fill', () => {
        const timeline = compileTimeline(LOOP);
        const settings = { ...DEFAULT_SETTINGS, style: 'rock' as const };
        for (const pass of [1, 2, 3, 4]) {
            const plans = planBars(timeline, settings, {
                pass,
                looping: false,
                window: fullWindow(timeline),
            });
            // The lap before ends at bar 4 * pass: a section fill only at the 16-bar marks.
            expect(plans[0].crash).toBe(pass % 4 === 0);
        }
    });

    it('a two-section short form keeps its fill at the section seam and the wrap', () => {
        const timeline = compileTimeline(
            score([
                { label: 'A', bars: 'C | G' },
                { label: 'B', bars: 'Am | F' },
            ]),
        );
        const plans = planBars(timeline, DEFAULT_SETTINGS, {
            pass: 0,
            looping: true,
            window: fullWindow(timeline),
        });
        expect(plans[1].fill).toBe('section');
        expect(plans[3].fill).toBe('section');
    });
});
