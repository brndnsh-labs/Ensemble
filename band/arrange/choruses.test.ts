/**
 * A counted chart (`SemanticScore.choruses`, #1475) is one pass over a timeline that holds
 * every chorus. The band must still hear each chorus as its next time through the song: the
 * head on the first, solos and trades after it, the pass lift — what an uncounted chart's loop
 * plays on its later laps — down to the lead's phrases and the notes the band plays. Except
 * the last chorus: a counted performance ends on the out-head, the melody restated.
 */
import {
    type BandEvent,
    type BandSettings,
    DEFAULT_SETTINGS,
    type Lane,
    type StyleId,
    type TradeSettings,
} from '../core/types.js';
import { compileTimeline, type Timeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { soloArc } from '../players/lead/form.js';
import { STYLE_IDS, STYLES } from '../styles/index.js';
import { COUNTED_FIXTURES, FIXTURES } from '../test/scores.js';
import { leadRole } from './cycle.js';
import { planBars } from './plan.js';

const CHORUSES = 4;
const TRADES: (TradeSettings | null)[] = [
    null,
    { with: 'lead', bars: 4, choruses: 2 },
    { with: 'lead', bars: 2, choruses: null },
    { with: 'drums', bars: 4, choruses: null },
    { with: 'drums', bars: 8, choruses: 1 },
];
// Jazz's drummer solos (trading with him is live); rock's doesn't (the trade is paused).
const STYLE_CASES = ['jazz', 'rock'] as const;
const ALL_LANES = { drums: true, bass: true, comp: true, lead: true };

describe('a counted chart plans each chorus as the loop plans that lap', () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
        it(name, () => {
            const looped = compileTimeline(fixture);
            const counted = compileTimeline({ ...fixture, choruses: CHORUSES });
            const length = looped.bars.length;
            expect(counted.bars).toHaveLength(length * CHORUSES);
            const failures: string[] = [];
            for (const style of STYLE_CASES) {
                const drumSolos = Boolean(STYLES[style].drums.solos);
                for (const trade of TRADES) {
                    const settings: BandSettings = {
                        ...DEFAULT_SETTINGS,
                        style,
                        lanes: ALL_LANES,
                        trade,
                    };
                    const once = planBars(counted, settings, {
                        pass: 0,
                        looping: false,
                        window: { from: 0, to: counted.bars.length, wrapTo: 0 },
                        drumSolos,
                    });
                    const laps = Array.from({ length: CHORUSES }, (_, pass) =>
                        planBars(looped, settings, {
                            pass,
                            looping: true,
                            window: { from: 0, to: length, wrapTo: 0 },
                            drumSolos,
                        }),
                    );
                    for (let chorus = 0; chorus < CHORUSES; chorus++) {
                        for (let bar = 0; bar < length; bar++) {
                            const plan = once[chorus * length + bar];
                            const where = `${style} ${JSON.stringify(trade)} chorus ${chorus} bar ${bar}`;
                            if (chorus === CHORUSES - 1) {
                                // The out-head: the lead and the lanes of the first time through
                                // (a trade hands back to the band), at the energy of this lap.
                                const head = laps[0][bar];
                                if (
                                    JSON.stringify([plan.lead, plan.lanes]) !==
                                        JSON.stringify([head.lead, head.lanes]) ||
                                    plan.energy !== laps[chorus][bar].energy
                                ) {
                                    failures.push(`${where} (out-head)`);
                                }
                                continue;
                            }
                            // A trade turn names its first bar by index: in the counted
                            // timeline that is the same bar of a later chorus.
                            const relative =
                                plan.lead.kind === 'trade'
                                    ? {
                                          ...plan,
                                          lead: {
                                              ...plan.lead,
                                              from: plan.lead.from - chorus * length,
                                          },
                                      }
                                    : plan;
                            if (JSON.stringify(relative) !== JSON.stringify(laps[chorus][bar])) {
                                failures.push(where);
                            }
                        }
                    }
                }
            }
            expect(failures).toEqual([]);
        });
    }

    it("shapes a solo chorus's arc over its own chorus, not the whole performance", () => {
        const looped = compileTimeline(FIXTURES.rhythmChanges);
        const counted = compileTimeline({ ...FIXTURES.rhythmChanges, choruses: CHORUSES });
        const length = looped.bars.length;
        for (const chorus of [1, 2, 3] as const) {
            for (let slot = 0; slot < length; slot += looped.bars[slot].phrase.length) {
                for (const tier of ['low', 'mid', 'high'] as const) {
                    expect(soloArc(chorus, counted, chorus * length + slot, tier)).toEqual(
                        soloArc(chorus, looped, slot, tier),
                    );
                }
            }
        }
    });
});

/** The lead's job in each chorus of a counted blues, by the first bar's role. */
function rolesByChorus(choruses: number, trade: TradeSettings | null): string[] {
    const timeline = compileTimeline({ ...FIXTURES.blues, choruses });
    const length = timeline.bars.length / choruses;
    return Array.from({ length: choruses }, (_, chorus) => {
        const kinds = new Set(
            Array.from({ length }, (_, bar) => {
                const role = leadRole(timeline, chorus * length + bar, chorus, trade);
                return role.kind === 'solo' ? `solo${role.chorus}` : role.kind;
            }),
        );
        return [...kinds].join('+');
    });
}

describe('a counted performance ends on the out-head', () => {
    for (const choruses of [2, 3, 4, 5, 8]) {
        for (const trade of TRADES) {
            it(`${choruses} choruses, ${trade ? `trading ${JSON.stringify(trade)}` : 'no trade'}`, () => {
                const roles = rolesByChorus(choruses, trade);
                expect(roles[0]).toBe('head');
                expect(roles.at(-1)).toBe('head');
                // Every chorus between is a solo or a trade, never a stray head.
                for (const role of roles.slice(1, -1)) {
                    if (trade) {
                        expect(['head', 'trade']).toContain(role);
                    } else {
                        expect(role).toMatch(/^(solo[123]|head)$/);
                    }
                }
            });
        }
    }

    it('plays the cycle as a loop does, then the head: what each chorus is for', () => {
        expect(rolesByChorus(1, null)).toEqual(['head']);
        expect(rolesByChorus(2, null)).toEqual(['head', 'head']);
        expect(rolesByChorus(3, null)).toEqual(['head', 'solo1', 'head']);
        expect(rolesByChorus(4, null)).toEqual(['head', 'solo1', 'solo2', 'head']);
        expect(rolesByChorus(5, null)).toEqual(['head', 'solo1', 'solo2', 'solo3', 'head']);
        expect(rolesByChorus(8, null)).toEqual([
            'head',
            'solo1',
            'solo2',
            'solo3',
            'head',
            'solo1',
            'solo2',
            'head',
        ]);
    });

    it('restates the in-head note for note, and takes a last-chorus coda under the head', () => {
        const timeline = compileTimeline(COUNTED_FIXTURES.bluesCoda);
        const settings: BandSettings = { ...DEFAULT_SETTINGS, style: 'blues', lanes: ALL_LANES };
        const { events } = performPass(timeline, settings, { pass: 0, looping: false });
        const length = 12;
        const lead = (from: number, to: number) =>
            events
                .filter((e) => e.lane === 'lead' && e.bar >= from && e.bar < to)
                .map((e) => (e.lane === 'lead' ? [e.midi, e.dur] : []));
        expect(lead(2 * length, 3 * length)).toEqual(lead(0, length));
        const codaBars = timeline.bars.filter((b) => b.visit.label === 'Coda');
        expect(codaBars.map((b) => b.visit.chorus)).toEqual([2, 2]);
        expect(codaBars.every((b) => leadRole(timeline, b.index, 2, null).kind === 'head')).toBe(
            true,
        );
    });
});

/** Ticks to a millionth: swing's arithmetic far into a long timeline rounds differently. */
const fine = (n: number) => Math.round(n * 1e6) / 1e6;

/** A lane's events of bars `[from, from + length)`, moved to start at bar 0, tick 0. */
function lapOf(
    events: BandEvent[],
    timeline: Timeline,
    from: number,
    length: number,
    lanes: Lane[],
): string {
    const start = timeline.bars[from].start;
    return JSON.stringify(
        events
            .filter((e) => lanes.includes(e.lane) && e.bar >= from && e.bar < from + length)
            .map((e) => ({
                ...e,
                tick: fine(e.tick - start),
                ...(e.lane === 'drums' ? {} : { dur: fine(e.dur) }),
                offsetMs: fine(e.offsetMs),
                bar: e.bar - from,
            })),
    );
}

describe("a counted chorus plays its lap's music", () => {
    // Chorus k against lap k for the choruses whose next one is still a lap's: the last two
    // differ by design (the out-head, and the bar that leads into it). The lead, drums and
    // bass are compared whole. The comp is not: at a seam a comp chord can ring into the next
    // chorus's first bar (an organ's hold, a pushed chord a keyboard voices under the lead),
    // which the whole pass does across a chorus and a loop cannot do across its wrap.
    const CHORUS_COUNT = 5;
    const COMPARED = 3;
    const LANES: Lane[] = ['lead', 'drums', 'bass'];
    describe.each(STYLE_IDS.filter((id) => STYLES[id].lead))('%s', (style: StyleId) => {
        for (const name of ['blues', 'rhythmChanges', 'bossa'] as const) {
            it(name, () => {
                const looped = compileTimeline(FIXTURES[name]);
                const counted = compileTimeline({ ...FIXTURES[name], choruses: CHORUS_COUNT });
                const length = looped.bars.length;
                const failures: string[] = [];
                for (const seed of ['a', 'b', 'c', 'd']) {
                    for (const trade of [
                        null,
                        { with: 'lead', bars: 4, choruses: null },
                    ] as const) {
                        const settings: BandSettings = {
                            ...DEFAULT_SETTINGS,
                            style,
                            seed,
                            lanes: ALL_LANES,
                            lead: STYLES[style].lead?.prefers ?? DEFAULT_SETTINGS.lead,
                            trade,
                        };
                        const once = performPass(counted, settings, { pass: 0, looping: false });
                        let memory: PassMemory | undefined;
                        for (let chorus = 0; chorus < COMPARED; chorus++) {
                            const lap = performPass(looped, settings, {
                                pass: chorus,
                                looping: true,
                                memory,
                            });
                            memory = lap.memory;
                            if (
                                lapOf(once.events, counted, chorus * length, length, LANES) !==
                                lapOf(lap.events, looped, 0, length, LANES)
                            ) {
                                failures.push(`${seed} ${trade ? 'trading' : ''} chorus ${chorus}`);
                            }
                        }
                    }
                }
                expect(failures).toEqual([]);
            });
        }
    });
});

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

    // Each chunk plays one bar past its end and drops it, so what the whole pass does across a
    // chorus seam (a held organ chord, a comp voice yielding to the lead) is done in the chunk
    // too: the chunks join into the whole pass, event for event, every lane.
    describe.each(STYLE_IDS)('%s joins into the whole pass', (style: StyleId) => {
        for (const [name, score] of Object.entries({
            ...COUNTED_FIXTURES,
            rhythmChanges: { ...FIXTURES.rhythmChanges, choruses: 2 },
            awkward: { ...FIXTURES.awkward, choruses: 2 },
        })) {
            it(name, () => {
                const timeline = compileTimeline(score);
                const failures: string[] = [];
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
                    };
                    const whole = performPass(timeline, settings, { pass: 0, looping: false });
                    if (
                        JSON.stringify(chunked(timeline, settings)) !== JSON.stringify(whole.events)
                    ) {
                        failures.push(comp);
                    }
                }
                expect(failures).toEqual([]);
            });
        }
    });
});
