/**
 * Drum fills are sized by where the music is going, and a short loop counts its laps (#2009).
 */
import { DEFAULT_SETTINGS, type DrumHit, type StyleId } from '../core/types.js';
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
                    plan: { fill: 'section', energy, ending: false, fillOrdinal: 0 },
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
