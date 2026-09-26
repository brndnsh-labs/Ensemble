import { leadRole } from './arrange/cycle.js';
import { fullWindow, planBars } from './arrange/plan.js';
import { DEFAULT_SETTINGS, type PitchedNote, PPQ, type TradeSettings } from './core/types.js';
import { chordAt, compileTimeline } from './form/timeline.js';
import { performPass } from './perform.js';
import { FIXTURES, score } from './test/scores.js';
import { fifthOf } from './theory/chord.js';

const BAR = PPQ * 4;

describe('performPass windows', () => {
    const timeline = compileTimeline(FIXTURES.bossa);
    const settings = { ...DEFAULT_SETTINGS, style: 'bossa' as const, seed: 'w' };

    it('plays only the bars in the window', () => {
        const { events } = performPass(timeline, settings, {
            pass: 0,
            looping: true,
            window: { from: 2, to: 6, wrapTo: 2 },
        });
        expect(events.every((e) => e.bar >= 2 && e.bar < 6)).toBe(true);
    });

    it('leads a practice loop back to its own start, not on to the next section', () => {
        // Loop section A (bars 0–7). Its last bar anticipates Dm7 (bar 0), never B's Gm7.
        for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
            const { events } = performPass(
                timeline,
                { ...settings, seed },
                {
                    pass: 1,
                    looping: true,
                    window: { from: 0, to: 8, wrapTo: 0 },
                },
            );
            const pushed = events.filter(
                (e) => e.lane === 'comp' && e.bar === 7 && e.tick >= 7 * BAR + 14 * 120,
            );
            const pcs = new Set(pushed.map((e) => (e.lane === 'comp' ? e.midi % 12 : -1)));
            // Gm7 would bring a Bb (10); Dm's anticipation never does.
            expect(pcs.has(10), `seed ${seed}`).toBe(false);
        }
    });

    it('resumes at any barline from the snapshot and reproduces the rest of the pass', () => {
        const whole = performPass(timeline, settings, { pass: 0, looping: true });
        const tail = performPass(timeline, settings, {
            pass: 0,
            looping: true,
            memory: whole.snapshots[5],
            window: { from: 5, to: timeline.bars.length, wrapTo: 0 },
        });
        const strip = (es: typeof whole.events) => JSON.stringify(es.filter((e) => e.bar >= 5));
        expect(strip(tail.events)).toBe(strip(whole.events));
    });
});

describe('fermatas', () => {
    it('hold one chord instead of slowing the groove', () => {
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'C | F | G7 | C', fermataBars: [3] }]),
        );
        for (const [style, comp] of [
            ['rock', 'piano'],
            ['jazz', 'piano'],
            ['funk', 'piano'],
            ['bossa', 'piano'],
            ['funk', 'guitar'],
            ['bossa', 'nylon'],
        ] as const) {
            const { events } = performPass(
                timeline,
                { ...DEFAULT_SETTINGS, style, comp, seed: 'f' },
                { pass: 0, looping: true },
            );
            const last = events.filter((e) => e.bar === 3);
            const drums = last.filter((e) => e.lane === 'drums');
            const bass = last.filter((e) => e.lane === 'bass');
            const onsets = new Set(last.filter((e) => e.lane === 'comp').map((e) => e.tick));
            expect(drums.map((e) => (e.lane === 'drums' ? e.piece : '')).sort(), style).toEqual([
                'crash',
                'kick',
            ]);
            expect(bass, style).toHaveLength(1);
            expect(onsets.size, style).toBe(1);
        }
    });

    it('on a hold, ties over without striking again', () => {
        const timeline = compileTimeline(score([{ label: 'A', bars: 'C | /', fermataBars: [1] }]));
        const { events } = performPass(
            timeline,
            { ...DEFAULT_SETTINGS, style: 'rock', seed: 'f' },
            { pass: 0, looping: true },
        );
        expect(events.filter((e) => e.bar === 1)).toEqual([]);
        const rings = events.filter((e) => e.lane !== 'drums' && e.tick + e.dur >= 2 * BAR - 1);
        expect(rings.length).toBeGreaterThan(0);
    });
});

describe('comp instruments', () => {
    const timeline = compileTimeline(FIXTURES.bossa);

    it("a bossa guitarist's thumb plays the bass only when there is no bassist", () => {
        const play = (bass: boolean) =>
            performPass(
                timeline,
                {
                    ...DEFAULT_SETTINGS,
                    style: 'bossa',
                    comp: 'nylon',
                    seed: 't',
                    lanes: { drums: true, bass, comp: true, lead: false },
                },
                { pass: 0, looping: true },
            ).events.filter((e): e is PitchedNote => e.lane === 'comp');
        const single = (notes: PitchedNote[]) =>
            notes.filter((e) => notes.filter((n) => n.tick === e.tick).length === 1);
        expect(single(play(true))).toEqual([]);
        // Without a bass the thumb plucks alone between the fingers' grips.
        const thumb = single(play(false));
        expect(thumb.length).toBeGreaterThan(timeline.bars.length / 2);
        for (const note of thumb) {
            const chord = chordAt(timeline, note.tick);
            const pcs = [chord?.bass, chord && (chord.root + fifthOf(chord)) % 12];
            expect(pcs, `thumb ${note.midi} @${note.tick}`).toContain(note.midi % 12);
        }
    });

    it('an organ presses once per chord and holds it until the next', () => {
        for (const style of ['rock', 'jazz', 'funk', 'bossa'] as const) {
            const comp = performPass(
                timeline,
                { ...DEFAULT_SETTINGS, style, comp: 'organ', seed: 'o' },
                { pass: 0, looping: true },
            ).events.filter((e): e is PitchedNote => e.lane === 'comp');
            const strikes = [...new Set(comp.map((e) => e.tick))];
            // It presses only on a change: two presses in a row never play the same chord.
            const chord = (tick: number) =>
                comp
                    .filter((e) => e.tick === tick)
                    .map((e) => e.midi)
                    .sort()
                    .join(',');
            for (let i = 0; i + 1 < strikes.length; i++) {
                expect(chord(strikes[i + 1]), `${style} re-press @${strikes[i + 1]}`).not.toBe(
                    chord(strikes[i]),
                );
            }
            for (let i = 0; i + 1 < strikes.length; i++) {
                const ends = comp.filter((e) => e.tick === strikes[i]).map((e) => e.tick + e.dur);
                // Within a bar, the pad sounds right up to the next chord.
                if (Math.floor(strikes[i] / BAR) === Math.floor(strikes[i + 1] / BAR)) {
                    expect(Math.min(...ends), `${style} @${strikes[i]}`).toBeGreaterThanOrEqual(
                        strikes[i + 1] - 1,
                    );
                }
            }
        }
    });
});

describe('trading with the player', () => {
    const lanes = { drums: true, bass: true, comp: true, lead: true };
    const jazz = { ...DEFAULT_SETTINGS, style: 'jazz' as const, lanes, lead: 'sax' as const };
    const fours = (w: TradeSettings['with']): TradeSettings => ({
        with: w,
        bars: 4,
        choruses: null,
    });
    type Timeline = ReturnType<typeof compileTimeline>;
    type Events = ReturnType<typeof performPass>['events'];
    /** One letter per turn: B the band's, Y yours, - no trade. */
    const turns = (timeline: Timeline, pass: number, trade: TradeSettings) =>
        timeline.bars
            .map((bar) => leadRole(timeline, bar.index, pass, trade))
            .map((role, i) =>
                role.kind !== 'trade'
                    ? i === 0
                        ? '-'
                        : ''
                    : role.from !== i
                      ? ''
                      : role.turn === 'band'
                        ? 'B'
                        : 'Y',
            )
            .join('');
    const drummerBars = (timeline: Timeline, pass: number) =>
        timeline.bars
            .filter((bar) => {
                const role = leadRole(timeline, bar.index, pass, fours('drums'));
                return role.kind === 'trade' && role.turn === 'band';
            })
            .map((bar) => bar.index);
    const soundingIn = (events: Events, timeline: Timeline, index: number, lane: string) => {
        const bar = timeline.bars[index];
        const end = bar.start + bar.meter.barTicks;
        return events.filter(
            (e) => e.lane === lane && e.tick < end && e.tick + (e as PitchedNote).dur > bar.start,
        );
    };
    const rhythmChanges = compileTimeline(FIXTURES.rhythmChanges);
    const blues = compileTimeline(FIXTURES.blues);
    const popSong = compileTimeline(FIXTURES.popSong);

    it('trades after the head, the band first, on the form, running on across choruses', () => {
        expect(turns(rhythmChanges, 0, fours('lead'))).toBe('-');
        expect(turns(rhythmChanges, 1, fours('lead'))).toBe('BYBYBYBY');
        // A 12-bar blues is three fours: the next chorus starts where the last left off.
        expect(turns(blues, 1, fours('lead'))).toBe('BYB');
        expect(turns(blues, 2, fours('lead'))).toBe('YBY');
        expect(turns(blues, 1, { with: 'lead', bars: 2, choruses: null })).toBe('BYBYBY');
        expect(turns(blues, 1, { with: 'lead', bars: 8, choruses: null })).toBe('BY');
        // The intro is the band's; the turns start on the verse.
        const role = leadRole(popSong, 4, 1, fours('lead'));
        expect(leadRole(popSong, 0, 1, fours('lead')).kind).toBe('rest');
        expect(role.kind === 'trade' && role.from).toBe(4);
    });

    it("with the soloist: it plays the band's turns and lays out for yours", () => {
        const trade = fours('lead');
        const { events } = performPass(
            rhythmChanges,
            { ...jazz, trade },
            { pass: 1, looping: true },
        );
        for (const bar of rhythmChanges.bars) {
            const role = leadRole(rhythmChanges, bar.index, 1, trade);
            const lead = soundingIn(events, rhythmChanges, bar.index, 'lead');
            if (role.kind === 'trade' && role.turn === 'you') {
                expect(lead, `bar ${bar.index}`).toEqual([]);
                expect(events.some((e) => e.lane === 'bass' && e.bar === bar.index)).toBe(true);
            }
        }
        expect(events.some((e) => e.lane === 'lead')).toBe(true);
    });

    it("with the drummer: his turns are the drums alone, even an organ's held chord", () => {
        const bars = drummerBars(rhythmChanges, 1);
        expect(bars.length).toBeGreaterThan(0);
        for (const seed of ['a', 'b', 'c', 'd']) {
            const { events } = performPass(
                rhythmChanges,
                { ...jazz, seed, comp: 'organ', trade: fours('drums') },
                { pass: 1, looping: true },
            );
            expect(events.some((e) => e.lane === 'lead')).toBe(false);
            for (const index of bars) {
                const others = events.filter(
                    (e) =>
                        e.lane !== 'drums' && soundingIn([e], rhythmChanges, index, e.lane).length,
                );
                expect(others, `seed ${seed} bar ${index}`).toEqual([]);
            }
        }
    });

    // Was "...into the drummer taking the first turn", asserted at the pass-0-to-pass-1
    // boundary: trading with the drummer used to be band-first, so that boundary was always
    // the drummer's exposed alone bar. It's you-first now (jazz convention), so that specific
    // boundary is never exposed for the drums partner any more — but a 12-bar blues in fours
    // has an odd turn count, so the exposure flips each chorus and a *later* pass boundary
    // (1 to 2) lands on the drummer again. Guard whichever boundary is actually exposed instead
    // of assuming it's always the first one.
    it("lets nothing ring across a pass boundary into the drummer's exposed turn", () => {
        const trade = fours('drums');
        const exposedBoundaries = [0, 1].filter((pass) => drummerBars(blues, pass + 1).includes(0));
        expect(exposedBoundaries.length, 'no exposed boundary to guard').toBeGreaterThan(0);
        for (const pass of exposedBoundaries) {
            for (const seed of 'abcdefghijklmnop') {
                for (const comp of ['piano', 'organ'] as const) {
                    const { events } = performPass(
                        blues,
                        { ...jazz, seed, comp, intensity: 0.8, trade },
                        { pass, looping: true },
                    );
                    const over = events.filter(
                        (e) => e.lane !== 'drums' && e.tick + e.dur > blues.ticks,
                    );
                    expect(over, `seed ${seed} ${comp} pass ${pass}`).toEqual([]);
                }
            }
        }
    });

    it('resumes at any barline of a traded pass exactly as the full pass', () => {
        for (const trade of [
            fours('drums'),
            fours('lead'),
            { with: 'lead', bars: 2, choruses: null } as const,
        ]) {
            for (const pass of [1, 2]) {
                const settings = { ...jazz, trade };
                const full = performPass(rhythmChanges, settings, { pass, looping: true });
                for (const from of [5, 6, 12, 13]) {
                    const resumed = performPass(rhythmChanges, settings, {
                        pass,
                        looping: true,
                        memory: full.snapshots[from],
                        window: { from, to: rhythmChanges.bars.length, wrapTo: 0 },
                    });
                    expect(
                        JSON.stringify(resumed.events),
                        `${trade.with} ${trade.bars}s pass ${pass} from ${from}`,
                    ).toBe(JSON.stringify(full.events.filter((e) => e.bar >= from)));
                }
            }
        }
    });

    it("keeps the time's own hi-hat foot under the drum solo, in any meter", () => {
        for (const meter of ['3/4', '6/8', '7/8']) {
            const timeline = compileTimeline(
                score([
                    { label: 'A', bars: 'Dm7 | G7 | Cmaj7 | C6 | Dm7 | G7 | Cmaj7 | C6', meter },
                ]),
            );
            const time = performPass(timeline, jazz, { pass: 1, looping: true }).events;
            const traded = performPass(
                timeline,
                { ...jazz, trade: fours('drums') },
                { pass: 1, looping: true },
            ).events;
            const foot = (events: Events, bar: number) =>
                events
                    .filter((e) => e.lane === 'drums' && e.piece === 'hatPedal' && e.bar === bar)
                    .map((e) => e.tick);
            const bars = drummerBars(timeline, 1);
            expect(bars.length, meter).toBeGreaterThan(0);
            for (const bar of bars) {
                expect(foot(traded, bar), `${meter} bar ${bar}`).toEqual(foot(time, bar));
            }
        }
    });

    it('never lets a turn span an intro a D.C. brings back mid-form', () => {
        const timeline = compileTimeline(
            score([
                { label: 'Intro', bars: 'C | G | C | G' },
                {
                    label: 'A',
                    bars: 'C | F | G | C | Am | Dm | G | C',
                    end: { 7: [{ kind: 'fine', label: 'Fine' }] },
                },
                {
                    label: 'B',
                    bars: 'F | F | G | G',
                    end: {
                        3: [
                            {
                                kind: 'jump',
                                from: 'start',
                                destination: { kind: 'fine', label: 'Fine' },
                                repeats: 'skip',
                            },
                        ],
                    },
                },
            ]),
        );
        for (const bars of [4, 8] as const) {
            for (const bar of timeline.bars) {
                const role = leadRole(timeline, bar.index, 2, {
                    with: 'lead',
                    bars,
                    choruses: null,
                });
                if (role.kind !== 'trade') {
                    continue;
                }
                const turn = timeline.bars.slice(role.from, role.from + role.bars);
                expect(
                    turn.every((b) => !/^intro/i.test(b.visit.label)),
                    `${bars}s bar ${bar.index}`,
                ).toBe(true);
                expect(role.from + role.at).toBe(bar.index);
            }
        }
    });

    it('replans a turn when the trade changes in the middle of it', () => {
        // Fours, then eights from bar 2: the soloist's eight-bar turn (bars 0-7) plays on
        // after the change instead of stopping where the four-bar plan ended.
        const four = { ...jazz, trade: fours('lead') };
        const eights = { ...jazz, trade: { with: 'lead', bars: 8, choruses: null } as const };
        const played = performPass(rhythmChanges, four, { pass: 1, looping: true });
        const resumed = performPass(rhythmChanges, eights, {
            pass: 1,
            looping: true,
            memory: played.snapshots[2],
            window: { from: 2, to: rhythmChanges.bars.length, wrapTo: 0 },
        });
        const leadBars = new Set(resumed.events.filter((e) => e.lane === 'lead').map((e) => e.bar));
        expect([4, 5, 6].some((bar) => leadBars.has(bar))).toBe(true);
    });

    it('keeps the soloist out after the head whenever you asked to trade with the drummer', () => {
        const wanted = { ...jazz, trade: fours('drums') };
        const cases = [
            { settings: wanted, window: { from: 0, to: 8, wrapTo: 0 } },
            { settings: { ...wanted, style: 'bossa' as const }, window: undefined },
            { settings: { ...wanted, lanes: { ...lanes, drums: false } }, window: undefined },
        ];
        for (const { settings, window } of cases) {
            const { events } = performPass(rhythmChanges, settings, {
                pass: 1,
                looping: true,
                window,
            });
            expect(
                events.some((e) => e.lane === 'lead'),
                settings.style,
            ).toBe(false);
        }
    });

    it("opens the drummer's turn on the kick, and brings the band back on the crash", () => {
        const { events } = performPass(
            rhythmChanges,
            { ...jazz, trade: fours('drums') },
            { pass: 1, looping: true },
        );
        const crashOn = (bar: number) =>
            events.some(
                (e) =>
                    e.lane === 'drums' &&
                    e.piece === 'crash' &&
                    e.bar === bar &&
                    Math.abs(e.tick - rhythmChanges.bars[bar].start) < 60,
            );
        for (const bar of drummerBars(rhythmChanges, 1).filter((b) => {
            const role = leadRole(rhythmChanges, b, 1, fours('drums'));
            return role.kind === 'trade' && role.at === 0;
        })) {
            expect(crashOn(bar), `drummer bar ${bar}`).toBe(false);
            const after = bar + 4;
            if (after < rhythmChanges.bars.length) {
                expect(crashOn(after), `band back at bar ${after}`).toBe(true);
            }
        }
    });

    it("doesn't trade in a practice loop, without its partner, or where the drummer can't solo", () => {
        const plain = performPass(rhythmChanges, jazz, { pass: 1, looping: true }).events;
        const cases = [
            {
                settings: { ...jazz, trade: fours('lead'), lanes: { ...lanes, lead: false } },
                window: undefined,
            },
            {
                settings: { ...jazz, trade: fours('drums'), lanes: { ...lanes, drums: false } },
                window: undefined,
            },
            { settings: { ...jazz, trade: fours('drums') }, window: { from: 0, to: 8, wrapTo: 0 } },
            {
                settings: { ...jazz, style: 'bossa' as const, trade: fours('drums') },
                window: undefined,
            },
        ];
        for (const { settings, window } of cases) {
            const { events } = performPass(rhythmChanges, settings, {
                pass: 1,
                looping: true,
                window,
            });
            const bars = drummerBars(rhythmChanges, 1).filter((i) => !window || i < window.to);
            expect(
                bars.every((i) => events.some((e) => e.lane === 'bass' && e.bar === i)),
                JSON.stringify(settings.trade) + settings.style,
            ).toBe(true);
        }
        // And with the soloist on but no trade, pass 1 is a solo chorus as before.
        expect(plain.some((e) => e.lane === 'lead')).toBe(true);
    });

    describe('the head returns while trading (choruses)', () => {
        it('trading with the drummer is you-first; trading with the soloist stays band-first', () => {
            const you = leadRole(blues, 0, 1, { with: 'drums', bars: 4, choruses: null });
            expect(you.kind === 'trade' && you.turn).toBe('you');
            const band = leadRole(blues, 0, 1, { with: 'lead', bars: 4, choruses: null });
            expect(band.kind === 'trade' && band.turn).toBe('band');
        });

        it('brings the head back after `choruses` traded passes, and again every block after', () => {
            const trade: TradeSettings = { with: 'lead', bars: 4, choruses: 2 };
            const kindAt = (pass: number) => leadRole(blues, 0, pass, trade).kind;
            expect(kindAt(0)).toBe('head');
            expect(kindAt(1)).toBe('trade');
            expect(kindAt(2)).toBe('trade');
            expect(kindAt(3)).toBe('head');
            expect(kindAt(4)).toBe('trade');
            expect(kindAt(5)).toBe('trade');
            expect(kindAt(6)).toBe('head');
        });

        it('keeps trading forever with `choruses: null` (or 0), never bringing the head back', () => {
            for (const choruses of [null, 0] as const) {
                const trade: TradeSettings = { with: 'lead', bars: 4, choruses };
                for (let pass = 1; pass <= 8; pass++) {
                    expect(
                        leadRole(blues, 0, pass, trade).kind,
                        `choruses ${choruses} pass ${pass}`,
                    ).toBe('trade');
                }
            }
        });

        it('restarts the alternation at the top of each block, the same as the very first one', () => {
            const trade: TradeSettings = { with: 'lead', bars: 4, choruses: 2 };
            expect(turns(blues, 1, trade)).toBe(turns(blues, 4, trade));
            expect(turns(blues, 2, trade)).toBe(turns(blues, 5, trade));
        });

        it('plays the soloist on a returned head trading with the drummer, silences it on a traded pass', () => {
            const trade: TradeSettings = { with: 'drums', bars: 4, choruses: 2 };
            const settings = { ...jazz, trade };
            const options = { looping: true, window: fullWindow(blues), drumSolos: true };
            const head = planBars(blues, settings, { pass: 3, ...options });
            const traded = planBars(blues, settings, { pass: 1, ...options });
            expect(head[0].lead.kind).toBe('head');
            expect(head[0].lanes.lead).toBe(true);
            expect(traded[0].lead.kind).toBe('trade');
            expect(traded[0].lanes.lead).toBe(false);
        });
    });
});
