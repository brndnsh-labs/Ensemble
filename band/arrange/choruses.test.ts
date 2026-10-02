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
                            if (
                                chorus === CHORUSES - 2 &&
                                chorus > 0 &&
                                leadRole(looped, bar, chorus, trade).kind === 'head'
                            ) {
                                // Where the loop brings the head back (for the soloist, or the
                                // band's soloist returning while you trade with the drummer),
                                // the chorus before the out-head keeps blowing instead.
                                if (
                                    leadRole(counted, chorus * length + bar, chorus, trade).kind ===
                                    'head'
                                ) {
                                    failures.push(`${where} (head before the out-head)`);
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

/**
 * The lead's job in each chorus of a counted blues: H the head, S1–S3 a solo chorus of the
 * arc, T traded (the roles a chorus's bars take, joined when they differ).
 */
function rolesByChorus(choruses: number, trade: TradeSettings | null): string {
    const timeline = compileTimeline({ ...FIXTURES.blues, choruses });
    const length = timeline.bars.length / choruses;
    return Array.from({ length: choruses }, (_, chorus) => {
        const kinds = new Set(
            Array.from({ length }, (_, bar) => {
                const role = leadRole(timeline, chorus * length + bar, chorus, trade);
                return role.kind === 'solo'
                    ? `S${role.chorus}`
                    : role.kind === 'head'
                      ? 'H'
                      : role.kind === 'trade'
                        ? 'T'
                        : 'rest';
            }),
        );
        return [...kinds].join('+');
    }).join(',');
}

/** What each chorus is for, N = 1–12, per trade setting. */
const ROLE_TABLES: [string, TradeSettings | null, string[]][] = [
    [
        'no trade',
        null,
        [
            'H',
            'H,H',
            'H,S1,H',
            'H,S1,S2,H',
            'H,S1,S2,S3,H',
            'H,S1,S2,S2,S3,H',
            'H,S1,S2,S3,H,S1,H',
            'H,S1,S2,S3,H,S1,S2,H',
            'H,S1,S2,S3,H,S1,S2,S3,H',
            'H,S1,S2,S3,H,S1,S2,S2,S3,H',
            'H,S1,S2,S3,H,S1,S2,S3,H,S1,H',
            'H,S1,S2,S3,H,S1,S2,S3,H,S1,S2,H',
        ],
    ],
    [
        'trading, the head back every chorus',
        { with: 'lead', bars: 4, choruses: 1 },
        [
            'H',
            'H,H',
            'H,T,H',
            'H,T,T,H',
            'H,T,H,T,H',
            'H,T,H,T,T,H',
            'H,T,H,T,H,T,H',
            'H,T,H,T,H,T,T,H',
            'H,T,H,T,H,T,H,T,H',
            'H,T,H,T,H,T,H,T,T,H',
            'H,T,H,T,H,T,H,T,H,T,H',
            'H,T,H,T,H,T,H,T,H,T,T,H',
        ],
    ],
    [
        'trading, the head back every two',
        { with: 'lead', bars: 4, choruses: 2 },
        [
            'H',
            'H,H',
            'H,T,H',
            'H,T,T,H',
            'H,T,T,T,H',
            'H,T,T,H,T,H',
            'H,T,T,H,T,T,H',
            'H,T,T,H,T,T,T,H',
            'H,T,T,H,T,T,H,T,H',
            'H,T,T,H,T,T,H,T,T,H',
            'H,T,T,H,T,T,H,T,T,T,H',
            'H,T,T,H,T,T,H,T,T,H,T,H',
        ],
    ],
    [
        'trading with the drummer, the head never back',
        { with: 'drums', bars: 4, choruses: null },
        Array.from({ length: 12 }, (_, i) =>
            i === 0 ? 'H' : ['H', ...Array.from({ length: i - 1 }, () => 'T'), 'H'].join(','),
        ),
    ],
];

describe('a counted performance ends on the out-head', () => {
    for (const choruses of [2, 3, 4, 5, 8]) {
        for (const trade of TRADES) {
            it(`${choruses} choruses, ${trade ? `trading ${JSON.stringify(trade)}` : 'no trade'}`, () => {
                const roles = rolesByChorus(choruses, trade).split(',');
                expect(roles[0]).toBe('H');
                expect(roles.at(-1)).toBe('H');
                // Every chorus between is a solo or a trade, or a head the cycle brings back.
                for (const role of roles.slice(1, -1)) {
                    expect(role).toMatch(trade ? /^(H|T)$/ : /^(S[123]|H)$/);
                }
            });
        }
    }

    for (const [name, trade, table] of ROLE_TABLES) {
        it(`plays, ${name}, what each chorus is for — never the head twice at the end`, () => {
            const roles = table.map((_, i) => rolesByChorus(i + 1, trade));
            expect(roles).toEqual(table);
            // Two choruses are the head and its restatement by design; from three on, the
            // chorus before the out-head is never a head as well.
            for (const row of roles.slice(2)) {
                expect(row.endsWith('H,H'), row).toBe(false);
            }
        });
    }

    it('restates the in-head up to its closing cadence, and takes a last-chorus coda under the head', () => {
        const timeline = compileTimeline(COUNTED_FIXTURES.bluesCoda);
        const settings: BandSettings = { ...DEFAULT_SETTINGS, style: 'blues', lanes: ALL_LANES };
        const { events } = performPass(timeline, settings, { pass: 0, looping: false });
        const length = 12;
        const lead = (from: number, to: number) =>
            events
                .filter((e) => e.lane === 'lead' && e.bar >= from && e.bar < to)
                .map((e) => (e.lane === 'lead' ? [e.midi, e.dur] : []));
        // The same tune (the head is keyed by section) up to its last phrase, where the in-head
        // leads on into the next chorus and the out-head resolves.
        const lastPhrase = timeline.bars[length - 1].phrase.length;
        expect(lead(2 * length, 3 * length - lastPhrase)).toEqual(lead(0, length - lastPhrase));
        expect(lead(2 * length, 3 * length - lastPhrase).length).toBeGreaterThan(0);
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
    // differ by design (the out-head, and the chorus that leads into it). The lead, drums and
    // bass are compared whole, and the comp on every bar but its last, traded or not: the
    // comp remembers where the lead's last note ends as a song tick, which a loop's wrap moves
    // into the next lap's own ticks (#1492), so the top of a lap hears the lead as the top of
    // the chorus does. The last bar differs by design: a chord it pushes rings into the next
    // chorus's first bar, where the whole pass voices it under that chorus's lead (and swings
    // its end in that bar), which a loop cannot do across its wrap.
    const CHORUS_COUNT = 5;
    const COMPARED = 3;
    const LANES: Lane[] = ['lead', 'drums', 'bass', 'comp'];
    const interior = (events: BandEvent[], from: number, length: number) =>
        events.filter((e) => e.lane !== 'comp' || e.bar < from + length - 1);
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
                        { with: 'lead', bars: 4, choruses: null } as const,
                        // The drummer's fours, where he solos (jazz): his motif is seeded too.
                        ...(STYLES[style].drums.solos
                            ? [{ with: 'drums', bars: 4, choruses: null } as const]
                            : []),
                    ]) {
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
                            const from = chorus * length;
                            if (
                                lapOf(
                                    interior(once.events, from, length),
                                    counted,
                                    from,
                                    length,
                                    LANES,
                                ) !==
                                lapOf(interior(lap.events, 0, length), looped, 0, length, LANES)
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
