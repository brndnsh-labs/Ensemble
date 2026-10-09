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
const REST_AT_TOP = { ...score([{ label: 'A', bars: 'N.C. | C7 | F7 | G7:3 C7:1' }]), choruses: 3 };
const HOLDS = {
    ...score([{ label: 'A', bars: 'C | / | N.C. | G7:3 N.C.:1 | C', fermataBars: [4] }]),
    choruses: 3,
};

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
            window: { from, to: timeline.bars.length, origin: 0 },
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
        const window = { from: 0, to: timeline.bars.length, origin: 0 };
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
    // whole pass, event for event, every lane — the organ on a one-chord vamp included, since
    // it re-presses a held chord at each phrase top, a chorus's first bar among them (the look's
    // cap, which would end an unstruck hold, never binds on a real comp: see the cap test below).
    describe.each(STYLE_IDS)('%s joins into the whole pass', (style: StyleId) => {
        for (const [name, chart] of Object.entries({
            ...COUNTED_FIXTURES,
            rhythmChanges: { ...FIXTURES.rhythmChanges, choruses: 2 },
            awkward: { ...FIXTURES.awkward, choruses: 2 },
            // An N.C. at the top of each chorus: a hold across the seam stops at the rest.
            restAtTop: REST_AT_TOP,
            holds: HOLDS,
            // A one-chord vamp: the organ re-presses at each phrase top (a chorus's first bar
            // among them), so the look stops there.
            vamp: organVamp(8, 3),
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
        // Chunks are generated on the main thread inside a 150 ms lookahead, so each may cost
        // at most two choruses' bars. On the vamp the organ re-presses at each phrase top, the
        // chorus's first bar among them, so the look stops one bar in. Counted in bars played,
        // not in time.
        const timeline = compileTimeline(organVamp(32, 64));
        const perChunk = chunkBars(timeline, 32);
        expect(perChunk).toHaveLength(64);
        expect(Math.max(...perChunk)).toBeLessThanOrEqual(64);
        expect(perChunk.slice(0, -1).every((bars) => bars === 33)).toBe(true);
    });

    it('stops a look that finds no strike at the end of the next chorus, and the hold there', () => {
        // A comp that never strikes again past the seam (silenced here from bar `until` on):
        // the look runs a whole chorus and stops, and the last chord's hold ends where the look
        // ended — the cap the look is bounded by.
        const timeline = compileTimeline(organVamp(8, 4));
        const book = STYLES.rock.comp.keyboard;
        const play = book.play.bind(book);
        const silent = vi
            .spyOn(book, 'play')
            .mockImplementation((ctx, memory) =>
                ctx.bar.index >= 8 ? { events: [], memory } : play(ctx, memory),
            );
        try {
            expect(chunkBars(timeline, 8, 1)).toEqual([16]);
            const { events } = performPass(timeline, ORGAN, {
                pass: 0,
                looping: false,
                window: { from: 0, to: timeline.bars.length, origin: 0 },
                until: 8,
            });
            const last = events.filter((e) => e.lane === 'comp').at(-1)!;
            expect(last.lane === 'comp' && last.tick + last.dur).toBe(timeline.bars[16].start);
        } finally {
            silent.mockRestore();
        }
    });

    it('keeps an organ on a one-chord vamp sounding in every chorus, every style', () => {
        // An organist re-presses a held chord at each phrase, the top of each chorus included:
        // the chord is never tied silently across the whole performance, so every bar of every
        // chorus sounds, as played live.
        const timeline = compileTimeline(organVamp(8, 8));
        for (const style of STYLE_IDS) {
            const settings = { ...ORGAN, style };
            const sounding = Array(8).fill(0);
            const bars = new Set<number>();
            for (const e of chunked(timeline, settings)) {
                if (e.lane !== 'comp' || e.muted) {
                    continue;
                }
                for (const bar of timeline.bars) {
                    if (bar.start < e.tick + e.dur && e.tick < bar.start + bar.meter.barTicks) {
                        bars.add(bar.index);
                    }
                }
            }
            for (const bar of bars) {
                sounding[timeline.bars[bar].visit.chorus]++;
            }
            expect(sounding, style).toEqual(Array(8).fill(8));
        }
    });

    it('never extends a hold across the start of an N.C. bar', () => {
        // `sustain` holds an organ chord to its next strike, but lets go at a rest. A written
        // length may run over a mid-bar N.C. (as it always has); a hold that `sustain` extends
        // past the bar the note was struck in must stop at the start of an N.C. bar.
        const charts = [
            ...Object.values(FIXTURES),
            ...Object.values(COUNTED_FIXTURES),
            { ...FIXTURES.awkward, choruses: 2 },
            REST_AT_TOP,
            HOLDS,
        ];
        const failures: string[] = [];
        for (const chart of charts) {
            const timeline = compileTimeline(chart);
            const rests = timeline.bars
                .filter(
                    (bar) =>
                        bar.spans[0] && !bar.spans[0].chord && bar.spans[0].start === bar.start,
                )
                .map((bar) => bar.start);
            for (const style of STYLE_IDS) {
                const settings = { ...ORGAN, style };
                for (const events of [
                    performPass(timeline, settings, { pass: 0, looping: false }).events,
                    chunked(timeline, settings),
                ]) {
                    for (const e of events) {
                        if (e.lane !== 'comp' || e.muted) {
                            continue;
                        }
                        const barEnd =
                            timeline.bars[e.bar].start + timeline.bars[e.bar].meter.barTicks;
                        const end = e.tick + e.dur;
                        const crossed = rests.find((at) => at > e.tick && at < end - 1e-6);
                        if (end > barEnd + 1e-6 && crossed !== undefined) {
                            failures.push(
                                `${style} ${e.tick}+${e.dur} over the N.C. at ${crossed}`,
                            );
                        }
                    }
                }
            }
        }
        expect(failures.slice(0, 5)).toEqual([]);
    });
});

/** A one-chord vamp of `length` bars, counted. */
function organVamp(length: number, choruses: number) {
    return { ...score([{ label: 'A', bars: Array(length).fill('Dm7').join(' | ') }]), choruses };
}

const ORGAN: BandSettings = {
    ...DEFAULT_SETTINGS,
    style: 'rock',
    comp: 'organ',
    lanes: { drums: true, bass: true, comp: true, lead: false },
};

/** Bars played (the drummer's, one per bar) by each chunk of `length` bars, up to `count`. */
function chunkBars(timeline: Timeline, length: number, count = Number.POSITIVE_INFINITY): number[] {
    const played = vi.spyOn(STYLES.rock.drums, 'play');
    const perChunk: number[] = [];
    let memory: PassMemory | undefined;
    try {
        for (let from = 0; from < timeline.bars.length && perChunk.length < count; from += length) {
            played.mockClear();
            const result = performPass(timeline, ORGAN, {
                pass: 0,
                looping: false,
                memory,
                window: { from, to: timeline.bars.length, origin: 0 },
                until: from + length,
            });
            memory = result.memory;
            perChunk.push(played.mock.calls.length);
        }
    } finally {
        played.mockRestore();
    }
    return perChunk;
}
