/**
 * A counted chart's performance is generated a chorus at a time (`PassOptions.until`), live
 * and for export (#1475). Pinned here: the chunks join into the one-shot pass, and a chunk's
 * look across its seam is bounded.
 */
import {
    type BandEvent,
    type BandSettings,
    DEFAULT_SETTINGS,
    type StyleId,
    type TradeSettings,
} from '../core/types.js';
import { compileTimeline, type Timeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { STYLE_IDS, STYLES } from '../styles/index.js';
import { COUNTED_FIXTURES, FIXTURES, score } from '../test/scores.js';

const ALL_LANES = { drums: true, bass: true, comp: true, lead: true };

/** The counted performance as the live host and the export generate it: a chorus at a time. */
function chunked(timeline: Timeline, settings: BandSettings): BandEvent[] {
    const events: BandEvent[] = [];
    let memory: PassMemory | undefined;
    let from = 0;
    while (from < timeline.bars.length) {
        let until = from + 1;
        while (
            until < timeline.bars.length &&
            timeline.bars[until].visit.chorus === timeline.bars[from].visit.chorus
        ) {
            until++;
        }
        const result = performPass(timeline, settings, {
            pass: 0,
            looping: false,
            memory,
            window: { from, to: timeline.bars.length, wrapTo: 0, origin: 0 },
            until,
        });
        events.push(...result.events);
        memory = result.memory;
        from = until;
    }
    return events;
}

describe('a counted performance generated a chorus at a time (`PassOptions.until`)', () => {
    it('plays only the bars before `until`, and hands on the memory before it', () => {
        const timeline = compileTimeline({ ...FIXTURES.blues, choruses: 3 });
        const length = timeline.bars.length / 3;
        const settings = { ...DEFAULT_SETTINGS, style: 'blues' as const, seed: 'chunk' };
        const window = { from: 0, to: timeline.bars.length, wrapTo: 0, origin: 0 };
        const first = performPass(timeline, settings, {
            pass: 0,
            looping: false,
            window,
            until: length,
        });
        expect(first.events.every((e) => e.bar < length)).toBe(true);
        expect(first.events.some((e) => e.bar === length - 1)).toBe(true);
        expect(first.snapshots).toHaveLength(length);
        const whole = performPass(timeline, settings, { pass: 0, looping: false, window });
        expect(first.memory).toEqual(whole.snapshots[length]);
    });

    // Each chunk plays past its end and drops those bars, so what the whole pass does across a
    // chorus seam (a held organ chord, a comp voice yielding to the lead, a hold that stops at
    // an N.C. or at the drummer's turn) is done in the chunk too: the chunks join into the
    // whole pass, event for event, every lane — short of a chord held unstruck through a whole
    // chorus past the seam, which the look's cap ends there (the vamp test below).
    describe.each(STYLE_IDS)('%s joins into the whole pass', (style: StyleId) => {
        for (const [name, chart] of Object.entries({
            ...COUNTED_FIXTURES,
            rhythmChanges: { ...FIXTURES.rhythmChanges, choruses: 2 },
            awkward: { ...FIXTURES.awkward, choruses: 2 },
            // An N.C. at the top of each chorus: a hold across the seam stops at the rest.
            restAtTop: {
                ...score([{ label: 'A', bars: 'N.C. | C7 | F7 | G7:3 C7:1' }]),
                choruses: 3,
            },
            holds: {
                ...score([
                    { label: 'A', bars: 'C | / | N.C. | G7:3 N.C.:1 | C', fermataBars: [4] },
                ]),
                choruses: 3,
            },
        })) {
            it(name, () => {
                const timeline = compileTimeline(chart);
                const failures: string[] = [];
                const trades: (TradeSettings | null)[] = [
                    null,
                    ...(STYLES[style].lead
                        ? [{ with: 'lead', bars: 4, choruses: null } as const]
                        : []),
                    // The drummer's turn is a bar the comp sits out: a hold stops there.
                    ...(STYLES[style].drums.solos
                        ? [{ with: 'drums', bars: 4, choruses: null } as const]
                        : []),
                ];
                for (const trade of trades) {
                    for (const comp of [
                        'piano',
                        'rhodes',
                        'organ',
                        'clav',
                        'guitar',
                        'nylon',
                    ] as const) {
                        const settings: BandSettings = {
                            ...DEFAULT_SETTINGS,
                            style,
                            comp,
                            lanes: { ...ALL_LANES, lead: !!STYLES[style].lead },
                            lead: STYLES[style].lead?.prefers ?? DEFAULT_SETTINGS.lead,
                            trade,
                        };
                        const whole = performPass(timeline, settings, { pass: 0, looping: false });
                        if (
                            JSON.stringify(chunked(timeline, settings)) !==
                            JSON.stringify(whole.events)
                        ) {
                            failures.push(`${comp} ${trade ? `${trade.with} ${trade.bars}` : ''}`);
                        }
                    }
                }
                expect(failures).toEqual([]);
            });
        }
    });

    it('looks across a seam at most to the end of the next chorus: a 64-chorus organ vamp', () => {
        // An organ on one chord never strikes again, so the look would run to the end of the
        // performance; chunks are generated on the main thread inside a 150 ms lookahead, so
        // each costs at most two choruses' bars. Counted in bars played, not in time.
        const vamp = {
            ...score([{ label: 'A', bars: Array(32).fill('Dm7').join(' | ') }]),
            choruses: 64,
        };
        const timeline = compileTimeline(vamp);
        const settings: BandSettings = {
            ...DEFAULT_SETTINGS,
            style: 'rock',
            comp: 'organ',
            lanes: { drums: true, bass: true, comp: true, lead: false },
        };
        const drums = STYLES.rock.drums;
        const played = vi.spyOn(drums, 'play');
        const perChunk: number[] = [];
        let memory: PassMemory | undefined;
        try {
            for (let from = 0; from < timeline.bars.length; from += 32) {
                played.mockClear();
                const result = performPass(timeline, settings, {
                    pass: 0,
                    looping: false,
                    memory,
                    window: { from, to: timeline.bars.length, wrapTo: 0, origin: 0 },
                    until: from + 32,
                });
                memory = result.memory;
                perChunk.push(played.mock.calls.length);
            }
        } finally {
            played.mockRestore();
        }
        expect(perChunk).toHaveLength(64);
        expect(Math.max(...perChunk)).toBeLessThanOrEqual(64);
        // The hold still reaches across the seam, to where the look ended.
        expect(perChunk[0]).toBe(64);
    });
});
