import { CYCLE, cycleLength, leadRole } from './arrange/cycle.js';
import { DEFAULT_SETTINGS, type PitchedNote, PPQ } from './core/types.js';
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

describe('trading fours', () => {
    const lanes = { drums: true, bass: true, comp: true, lead: true };
    const jazz = { ...DEFAULT_SETTINGS, style: 'jazz' as const, lanes, lead: 'sax' as const };
    type Timeline = ReturnType<typeof compileTimeline>;
    const turns = (timeline: Timeline, pass: number) =>
        timeline.bars
            .filter((bar) => bar.phrase.bar === 0)
            .map((bar) => {
                const role = leadRole(timeline, bar.index, pass, true);
                return role.kind === 'trade' ? (role.turn === 'lead' ? 'L' : 'D') : '-';
            })
            .join('');
    const drummers = (timeline: Timeline, pass: number) =>
        timeline.bars
            .filter((bar) => {
                const role = leadRole(timeline, bar.index, pass, true);
                return role.kind === 'trade' && role.turn === 'drums';
            })
            .map((bar) => bar.index);
    const rhythmChanges = compileTimeline(FIXTURES.rhythmChanges);
    const blues = compileTimeline(FIXTURES.blues);

    it('trades horn first and drummer last, over two choruses when the chorus is odd', () => {
        expect(cycleLength(rhythmChanges, true)).toBe(CYCLE + 1);
        expect(turns(rhythmChanges, CYCLE)).toBe('LDLDLDLD');
        // A 12-bar blues is three fours: it trades across 24 bars.
        expect(cycleLength(blues, true)).toBe(CYCLE + 2);
        expect(turns(blues, CYCLE)).toBe('LDL');
        expect(turns(blues, CYCLE + 1)).toBe('DLD');
        expect(leadRole(blues, 0, CYCLE + 2, true).kind).toBe('head');
        expect(cycleLength(blues, false)).toBe(CYCLE);
    });

    it("leaves the drummer's four to the drums, even an organ's held chord", () => {
        const bars = drummers(rhythmChanges, CYCLE);
        for (const seed of ['a', 'b', 'c', 'd']) {
            const { events } = performPass(
                rhythmChanges,
                { ...jazz, seed, comp: 'organ' },
                { pass: CYCLE, looping: true },
            );
            for (const index of bars) {
                const bar = rhythmChanges.bars[index];
                const end = bar.start + bar.meter.barTicks;
                const sounding = events.filter(
                    (e) => e.lane !== 'drums' && e.tick < end && e.tick + e.dur > bar.start,
                );
                expect(sounding, `seed ${seed} bar ${index}`).toEqual([]);
            }
        }
    });

    it('lets nothing ring across the barline into fours that open with the drummer', () => {
        // The blues' second chorus of fours opens with the drums; so does nothing else, but
        // the solo chorus before the fours ends into the horn. Both boundaries are checked.
        for (const pass of [CYCLE - 1, CYCLE]) {
            for (const seed of 'abcdefghijklmnop') {
                for (const comp of ['piano', 'organ'] as const) {
                    const { events } = performPass(
                        blues,
                        { ...jazz, seed, comp, intensity: 0.8 },
                        { pass, looping: true },
                    );
                    const opensWithDrums = turns(blues, pass + 1)[0] === 'D';
                    const over = events.filter(
                        (e) => e.lane !== 'drums' && e.tick + e.dur > blues.ticks,
                    );
                    if (opensWithDrums) {
                        expect(over, `pass ${pass} seed ${seed} ${comp}`).toEqual([]);
                    }
                }
            }
        }
    });

    it('resumes at any barline of the fours and around them exactly as the full pass', () => {
        for (const pass of [CYCLE, CYCLE + 1, CYCLE + 3]) {
            const full = performPass(rhythmChanges, jazz, { pass, looping: true });
            for (const from of [5, 6, 12, 13]) {
                const resumed = performPass(rhythmChanges, jazz, {
                    pass,
                    looping: true,
                    memory: full.snapshots[from],
                    window: { from, to: rhythmChanges.bars.length, wrapTo: 0 },
                });
                expect(JSON.stringify(resumed.events), `pass ${pass} from ${from}`).toBe(
                    JSON.stringify(full.events.filter((e) => e.bar >= from)),
                );
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
            const pass = CYCLE;
            const time = performPass(timeline, jazz, { pass: 1, looping: true }).events;
            const fours = performPass(timeline, jazz, { pass, looping: true }).events;
            const foot = (events: typeof time, bar: number) =>
                events
                    .filter((e) => e.lane === 'drums' && e.piece === 'hatPedal' && e.bar === bar)
                    .map((e) => e.tick);
            const bars = drummers(timeline, pass);
            expect(bars.length, meter).toBeGreaterThan(0);
            for (const bar of bars) {
                expect(foot(fours, bar), `${meter} bar ${bar}`).toEqual(foot(time, bar));
            }
        }
    });

    it('trades only with the lead on, over the whole song, in a style that trades', () => {
        const bars = drummers(rhythmChanges, CYCLE);
        const cases = [
            { settings: { ...jazz, lanes: { ...lanes, lead: false } }, window: undefined },
            { settings: jazz, window: { from: 0, to: 8, wrapTo: 0 } },
            { settings: { ...jazz, style: 'bossa' as const }, window: undefined },
        ];
        for (const { settings, window } of cases) {
            const { events } = performPass(rhythmChanges, settings, {
                pass: CYCLE,
                looping: true,
                window,
            });
            const played = bars.filter((i) => !window || i < window.to);
            expect(
                played.every((i) => events.some((e) => e.lane === 'bass' && e.bar === i)),
                settings.style,
            ).toBe(true);
        }
    });
});
