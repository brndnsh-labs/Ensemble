// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Acoustic harmony critique (#561).
 *
 * Before #561, Acoustic harmony was a flat triadic whole-note pad —
 * indistinguishable from a generic string swell. Acoustic now plays a gently
 * rolling fingerpicked counter-line: ONE chord tone per eighth-note, climbing
 * root → 3rd → 5th → octave → 9th and back down across the bar. The single-note
 * line (not a chord) and the add9 color tone are the signature.
 */
describe('Acoustic Harmony Critique', () => {
    let mockState;

    const C = { rootMidi: 60, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
    const Am = { rootMidi: 57, quality: 'm', intervals: [0, 3, 7], sectionId: 'A', beats: 4 };
    const F = { rootMidi: 65, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
    const G = { rootMidi: 67, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
    const PROG = [C, Am, F, G];

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.5, complexity: 0.5 },
            groove: {
                genreFeel: 'Acoustic',
                pocket: {
                    globalDrive: 0,
                    tightness: 1,
                    bassGravity: 1,
                    chordGravity: 1,
                    soloistGravity: 1,
                },
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: {
                enabled: true,
                complexity: 0.5,
                volume: 0.6,
                lastMidis: [],
                rhythmicMask: 0,
            },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    it('plays a single-note fingerpick roll (not a held chord), ~8 notes/bar', () => {
        const bars = 64;
        let emissions = 0;
        let polyphonic = 0;
        for (let bar = 0; bar < bars; bar++) {
            const chord = PROG[bar % PROG.length];
            for (let s = 0; s < 16; s++) {
                const step = bar * 16 + s;
                const notes = getHarmonyNotes(getState(), chord, null, step, 60, 'smart', s, null, {
                    soloistResting: true,
                    soloistNotesInPhrase: 0,
                });
                if (notes.length > 0) {
                    emissions++;
                    if (notes.length > 1) {
                        polyphonic++;
                    }
                }
            }
        }
        const avgPerBar = emissions / bars;

        console.log(
            '\n--- ACOUSTIC HARMONY CRITIQUE REPORT (line shape) ---\n' +
                `[Emissions]        ${emissions}\n` +
                `[Polyphonic]       ${polyphonic} (Target: 0 — it's a single-note line)\n` +
                `[Notes / bar]      ${avgPerBar.toFixed(1)} (Target: ~8, an eighth-note roll)\n` +
                '-----------------------------------------------------\n',
        );

        // A monophonic rolling line, not a chord pad.
        expect(polyphonic).toBe(0);
        // An eighth-note fingerpick: ~8 notes per bar.
        expect(avgPerBar).toBeGreaterThan(6);
        expect(avgPerBar).toBeLessThanOrEqual(8);
    });

    it('rolls through chord tones plus the open add9 color', () => {
        // One C-major bar: the roll must visit root, 3rd, 5th and the 9th (D).
        const pcs = new Set();
        for (let s = 0; s < 16; s++) {
            const notes = getHarmonyNotes(getState(), C, null, s, 60, 'smart', s, null, {
                soloistResting: true,
                soloistNotesInPhrase: 0,
            });
            for (const n of notes) {
                pcs.add(((n.midi % 12) + 12) % 12);
            }
        }
        const root = 0; // C
        const third = 4; // E
        const fifth = 7; // G
        const ninth = 2; // D

        console.log(
            `\n--- ACOUSTIC HARMONY CRITIQUE REPORT (C bar pitch classes) ---\n` +
                `[PCs visited]   {${[...pcs].sort((a, b) => a - b).join(', ')}}\n` +
                `[Need]          root 0, 3rd 4, 5th 7, 9th 2\n` +
                '--------------------------------------------------------------\n',
        );

        expect(pcs.has(root)).toBe(true);
        expect(pcs.has(third)).toBe(true);
        expect(pcs.has(fifth)).toBe(true);
        expect(pcs.has(ninth)).toBe(true); // the open add9 color
    });
});
