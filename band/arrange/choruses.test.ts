/**
 * A counted chart (`SemanticScore.choruses`, #1475) is one pass over a timeline that holds
 * every chorus. The band must still hear each chorus as its next time through the song: the
 * head on the first, solos and trades after it, the pass lift — exactly what an uncounted
 * chart's loop plays on its later laps. Pinned here by planning both and comparing bar by bar.
 */
import { type BandSettings, DEFAULT_SETTINGS, type TradeSettings } from '../core/types.js';
import { compileTimeline } from '../form/timeline.js';
import { performPass } from '../perform.js';
import { soloArc } from '../players/lead/form.js';
import { STYLES } from '../styles/index.js';
import { FIXTURES } from '../test/scores.js';
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
                        lanes: { drums: true, bass: true, comp: true, lead: true },
                        trade,
                    };
                    const once = planBars(counted, settings, {
                        pass: 0,
                        looping: false,
                        window: { from: 0, to: counted.bars.length, wrapTo: 0 },
                        drumSolos,
                    });
                    for (let chorus = 0; chorus < CHORUSES; chorus++) {
                        const lap = planBars(looped, settings, {
                            pass: chorus,
                            looping: true,
                            window: { from: 0, to: length, wrapTo: 0 },
                            drumSolos,
                        });
                        for (let bar = 0; bar < length; bar++) {
                            const index = chorus * length + bar;
                            if (index === counted.bars.length - 1) {
                                // The performance's last bar plays its ending; a lap's wraps.
                                expect(once[index].ending).toBe(true);
                                continue;
                            }
                            // A trade turn names its first bar by index: in the counted
                            // timeline that is the same bar of a later chorus.
                            const plan = once[index];
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
                            if (JSON.stringify(relative) !== JSON.stringify(lap[bar])) {
                                failures.push(
                                    `${style} ${JSON.stringify(trade)} chorus ${chorus} bar ${bar}`,
                                );
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

describe('a counted performance generated a chorus at a time (`PassOptions.until`)', () => {
    it('plays only the bars before `until`, and resumes from where it stopped', () => {
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
        // No ending at the chunk's edge: the performance goes on into the next chorus.
        const whole = performPass(timeline, settings, { pass: 0, looping: false, window });
        const second = performPass(timeline, settings, {
            pass: 0,
            looping: false,
            memory: whole.snapshots[length],
            window: { ...window, from: length },
            until: 2 * length,
        });
        const inSecond = (e: { bar: number }) => e.bar >= length && e.bar < 2 * length;
        expect(JSON.stringify(second.events)).toBe(JSON.stringify(whole.events.filter(inSecond)));
    });
});
