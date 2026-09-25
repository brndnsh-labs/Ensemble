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
