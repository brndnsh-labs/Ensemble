// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Acoustic harmony critique (#787).
 *
 * Acoustic harmony is now the SUSTAINED STRING PAD. The fingerpick arpeggio that
 * used to live here (#561) moved to the chords lane (the 'arp' chord style — see
 * acoustic-piano-critique), because the bowed strings sample wants to HOLD, not
 * pluck. The signature is now the opposite of the old roll: a polyphonic chord
 * voicing, re-struck sparsely (one voicing per chord that then holds) rather than
 * a single-note ~8-notes-per-bar line. (Legato carry across chord changes is
 * covered by harmony-pad-sustain.test.ts.)
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

    it('holds a sustained chord pad (polyphonic, sparsely re-struck), not an 8-note roll', () => {
        const bars = 64;
        let emissions = 0;
        let polyphonic = 0;
        for (let bar = 0; bar < bars; bar++) {
            const chord = PROG[bar % PROG.length];
            const nextChord = PROG[(bar + 1) % PROG.length];
            for (let s = 0; s < 16; s++) {
                const step = bar * 16 + s;
                const notes = getHarmonyNotes(
                    getState(),
                    chord,
                    nextChord,
                    step,
                    60,
                    'strings',
                    s,
                    null,
                    {
                        soloistResting: true,
                        soloistNotesInPhrase: 0,
                    },
                );
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
            '\n--- ACOUSTIC HARMONY CRITIQUE REPORT (pad shape) ---\n' +
                `[Emissions]        ${emissions}\n` +
                `[Polyphonic]       ${polyphonic} (Target: >0 — it's a held chord voicing)\n` +
                `[Notes / bar]      ${avgPerBar.toFixed(1)} (Target: sparse — a sustained pad, not an ~8-note roll)\n` +
                '-----------------------------------------------------\n',
        );

        // A held chord voicing, not a mono line: EVERY re-strike is the full pad
        // (a single mono emission slipping through would be a regression).
        expect(polyphonic).toBe(emissions);
        // Sustained, not a rolling eighth-note line — far below the old ~8/bar.
        expect(avgPerBar).toBeLessThan(4);
    });

    it('sounds the chord (the pad voicing holds real chord tones)', () => {
        // One C-major bar: the sustained pad must voice the chord — at least the
        // root and third present (a real triad pad, not noise or a single tone).
        const pcs = new Set();
        for (let s = 0; s < 16; s++) {
            const notes = getHarmonyNotes(getState(), C, Am, s, 60, 'strings', s, null, {
                soloistResting: true,
                soloistNotesInPhrase: 0,
            });
            for (const n of notes) {
                pcs.add(((n.midi % 12) + 12) % 12);
            }
        }
        const root = 0; // C
        const third = 4; // E

        console.log(
            `\n--- ACOUSTIC HARMONY CRITIQUE REPORT (C bar pad voicing) ---\n` +
                `[PCs sounded]   {${[...pcs].sort((a, b) => a - b).join(', ')}}\n` +
                `[Need]          root 0 + 3rd 4 (a real triad pad)\n` +
                '--------------------------------------------------------------\n',
        );

        // The pad is a polyphonic voicing built from the chord's tones.
        expect(pcs.size).toBeGreaterThanOrEqual(2);
        expect(pcs.has(root)).toBe(true);
        expect(pcs.has(third)).toBe(true);
    });
});
