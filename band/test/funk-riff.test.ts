/**
 * #2078: the funk riff's 5 and 7 are chord tones above the chord root (not the sounding slash
 * bass), and its last note before a change meets the next root instead of leaping a seventh.
 */

import { type BandEvent, DEFAULT_SETTINGS, type PitchedNote } from '../core/types.js';
import { chordAt, compileTimeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { mod12 } from '../theory/pitch.js';
import { score } from './scores.js';

const SEEDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** Every sounding funk bass note of a few seeded passes, in order, with the chord it sits over. */
function bassOver(chart: ReturnType<typeof score>) {
    const timeline = compileTimeline(chart);
    const runs: { note: PitchedNote; symbol: string }[][] = [];
    for (const seed of SEEDS) {
        let memory: PassMemory | undefined;
        for (let pass = 0; pass < 3; pass++) {
            const settings = { ...DEFAULT_SETTINGS, style: 'funk' as const, seed, swing: 0 };
            const result = performPass(timeline, settings, { pass, looping: true, memory });
            memory = result.memory;
            const run: { note: PitchedNote; symbol: string }[] = [];
            for (const e of result.events as BandEvent[]) {
                const chord =
                    e.lane === 'bass' && 'midi' in e && !e.muted ? chordAt(timeline, e.tick) : null;
                if (chord) {
                    run.push({ note: e as PitchedNote, symbol: chord.symbol });
                }
            }
            runs.push(run.sort((a, b) => a.note.tick - b.note.tick));
        }
    }
    return runs;
}

describe('funk riff chord tones (#2078)', () => {
    it('over C/E the 5 is G, never B (the major 7th of C)', () => {
        const runs = bassOver(score([{ label: 'A', bars: 'C/E | C/E | C/E | C/E' }]));
        const pcs = new Set(runs.flat().map((n) => mod12(n.note.midi)));
        expect(pcs.has(7)).toBe(true);
        expect(pcs.has(11)).toBe(false);
    });

    it('over C7/E the 7 is Bb, never D', () => {
        const runs = bassOver(score([{ label: 'A', bars: 'C7/E | C7/E | C7/E | C7/E' }]));
        const pcs = new Set(runs.flat().map((n) => mod12(n.note.midi)));
        expect(pcs.has(10)).toBe(true);
        expect(pcs.has(2)).toBe(false);
    });

    it('vi to IV: the leading tone B sits beside the C it falls into', () => {
        const chart = score([{ label: 'A', bars: 'Em9 | Cmaj7 | Em9 | Cmaj7' }], { key: 'G' });
        const runs = bassOver(chart);
        let crossings = 0;
        for (const run of runs) {
            for (let i = 1; i < run.length; i++) {
                if (run[i - 1].symbol === 'Em9' && run[i].symbol === 'Cmaj7') {
                    if (mod12(run[i - 1].note.midi) !== 11) {
                        continue; // an octave pump or a root, not a leading tone
                    }
                    crossings++;
                    expect(Math.abs(run[i - 1].note.midi - run[i].note.midi)).toBeLessThanOrEqual(
                        2,
                    );
                }
            }
        }
        expect(crossings).toBeGreaterThan(0);
    });
});
