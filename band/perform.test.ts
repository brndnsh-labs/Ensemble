import { DEFAULT_SETTINGS, PPQ } from './core/types.js';
import { compileTimeline } from './form/timeline.js';
import { performPass } from './perform.js';
import { FIXTURES, score } from './test/scores.js';

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
                (e) => e.lane === 'keys' && e.bar === 7 && e.tick >= 7 * BAR + 14 * 120,
            );
            const pcs = new Set(pushed.map((e) => (e.lane === 'keys' ? e.midi % 12 : -1)));
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
        for (const style of ['rock', 'jazz', 'funk', 'bossa'] as const) {
            const { events } = performPass(
                timeline,
                { ...DEFAULT_SETTINGS, style, seed: 'f' },
                { pass: 0, looping: true },
            );
            const last = events.filter((e) => e.bar === 3);
            const drums = last.filter((e) => e.lane === 'drums');
            const bass = last.filter((e) => e.lane === 'bass');
            const onsets = new Set(last.filter((e) => e.lane === 'keys').map((e) => e.tick));
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
