import { type DrumHit, type PitchedNote, PPQ } from '../core/types.js';
import { compileTimeline } from '../form/timeline.js';
import { score } from '../test/scores.js';
import { applyFeel, swingRatio } from './feel.js';

const timeline = compileTimeline(score([{ label: 'A', bars: 'C | C' }]));
const waltz = compileTimeline(score([{ label: 'A', bars: 'C | C', meter: '6/8' }]));
const feel = { swing: 0, swingGrid: 8 as const, lean: { bass: 5, keys: -3 }, humanize: 0 };
const hit = (tick: number): DrumHit => ({
    lane: 'drums',
    piece: 'hat',
    tick,
    velocity: 90,
    offsetMs: 0,
    bar: 0,
});
const note = (tick: number, dur: number): PitchedNote => ({
    lane: 'bass',
    midi: 40,
    tick,
    dur,
    velocity: 90,
    offsetMs: 0,
    bar: 0,
});

describe('feel', () => {
    it('maps swing 0–100 onto straight → triplet', () => {
        expect(swingRatio(0)).toBe(0.5);
        expect(swingRatio(100)).toBeCloseTo(2 / 3);
    });

    it('moves only offbeats, keeps beats fixed, and splits swung eighths evenly', () => {
        const settings = { swing: 100, humanize: 0, seed: 's' };
        const [one, e, and, a, two] = applyFeel(
            [hit(0), hit(120), hit(240), hit(360), hit(PPQ)],
            timeline,
            feel,
            settings,
        );
        expect(one.tick).toBe(0);
        expect(two.tick).toBe(PPQ);
        expect(and.tick).toBeCloseTo(320); // the triplet "and"
        expect(e.tick).toBeCloseTo(160); // midway through the swung first eighth
        expect(a.tick).toBeCloseTo(400);
    });

    it('stretches a note so it still ends where its (swung) end lands', () => {
        const [n] = applyFeel([note(0, 240)], timeline, feel, {
            swing: 100,
            humanize: 0,
            seed: 's',
        });
        expect(n.lane === 'bass' && n.dur).toBeCloseTo(320);
    });

    it('never swings a compound meter', () => {
        const [and] = applyFeel([hit(240)], waltz, feel, { swing: 100, humanize: 0, seed: 's' });
        expect(and.tick).toBe(240);
    });

    it('leans melodic lanes against drums that never lean', () => {
        const [d, b] = applyFeel([hit(0), note(0, 480)], timeline, feel, {
            swing: 0,
            humanize: 0,
            seed: 's',
        });
        expect(d.offsetMs).toBe(0);
        expect(b.offsetMs).toBe(5);
    });

    it('places the same grid position the same way in every bar (settled, not noisy)', () => {
        const settings = { swing: 0, humanize: 100, seed: 's' };
        const [a, b] = applyFeel(
            [hit(240), { ...hit(1920 + 240), bar: 1 }],
            timeline,
            feel,
            settings,
        );
        expect(a.offsetMs).toBeCloseTo(b.offsetMs);
        expect(a.offsetMs).not.toBe(0);
    });
});
