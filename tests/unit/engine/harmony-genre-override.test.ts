// @ts-nocheck
// Intent guard for the #728 per-genre voicing-override extraction
// (applyGenreVoicingOverride in harmonies.ts). The extraction was proven
// behavior-preserving by a full characterization grid at refactor time; these
// tests lock the two invariants most at risk in a FUTURE edit to the helper —
// asserted through the real getHarmonyNotes consumer, not the private helper.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHarmonyMemory, getHarmonyNotes } from '../../../public/engine/harmonies.js';
import { getState } from '../../../public/state.js';
import { makeSoloistMock } from '../../utils/mock-soloist.js';

vi.mock('../../../public/state.js', () => ({ getState: vi.fn() }));

const mkState = (genre, intensity) => ({
    playback: { bandIntensity: intensity, complexity: 0.5, currentLoopCount: 1 },
    groove: {
        genreFeel: genre,
    },
    soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
    harmony: {
        enabled: true,
        complexity: 0.5,
        lastMidis: [],
        rhythmicMask: 0,
        volume: 0.8,
        reverb: 0.3,
    },
    arranger: { timeSignature: '4/4' },
    chords: { style: 'smart', octave: 60 },
});

// First non-empty harmony emission across a bar (harmony is rhythmically gated,
// so most steps return []).
const firstEmission = (genre, intensity, chord) => {
    const state = mkState(genre, intensity);
    getState.mockReturnValue(state);
    clearHarmonyMemory(state);
    for (let step = 0; step < 16; step++) {
        const notes = getHarmonyNotes(
            getState(),
            chord,
            null,
            step,
            60,
            'smart',
            step,
            null,
            {},
            undefined,
        );
        if (notes && notes.length > 0) {
            return notes;
        }
    }
    return [];
};

const pcsFromRoot = (notes, rootMidi) =>
    new Set(notes.map((n) => (((n.midi - rootMidi) % 12) + 12) % 12));

describe('#728 per-genre voicing override', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('Metal power chord — root/5th/octave, no 3rd, at every intensity', () => {
        // The whole point of the power chord is that it is quality-neutral and
        // survives the taste-rules over BOTH major and minor roots, unlike Rock
        // (which only reaches a power-5th at high intensity).
        for (const quality of [
            { rootMidi: 60, quality: 'maj', intervals: [0, 4, 7] },
            { rootMidi: 62, quality: 'min', intervals: [0, 3, 7] },
        ]) {
            for (const intensity of [0.25, 0.6, 0.9]) {
                it(`${quality.quality} @ ${intensity}: PCs are {root, 5th} only`, () => {
                    const notes = firstEmission('Metal', intensity, { ...quality, sectionId: 'A' });
                    expect(notes.length).toBeGreaterThan(0);
                    const pcs = pcsFromRoot(notes, quality.rootMidi);
                    // root (0) + 5th (7); the octave (12) collapses to 0. No 3rd (3 or 4).
                    expect([...pcs].sort((a, b) => a - b)).toEqual([0, 7]);
                    expect(pcs.has(3)).toBe(false);
                    expect(pcs.has(4)).toBe(false);
                });
            }
        }
    });

    describe('Country pedal-steel add6 — plain major only', () => {
        it('plain major gains the add6 (6th above the root)', () => {
            const chord = { rootMidi: 60, quality: 'maj', intervals: [0, 4, 7], sectionId: 'A' };
            const notes = firstEmission('Country', 0.5, chord);
            expect(notes.length).toBeGreaterThan(0);
            // add6 → root-3rd-6th voicing; the major 6th is PC 9 above the root.
            expect(pcsFromRoot(notes, chord.rootMidi).has(9)).toBe(true);
        });

        it('a 7th chord keeps its color — no add6 replacement', () => {
            // min7 has a b7 (PC 10); the add6 (PC 9) must NOT appear, so the
            // chord keeps its seventh rather than losing it to the 6th.
            const chord = {
                rootMidi: 62,
                quality: 'min7',
                intervals: [0, 3, 7, 10],
                sectionId: 'A',
            };
            const notes = firstEmission('Country', 0.5, chord);
            expect(notes.length).toBeGreaterThan(0);
            expect(pcsFromRoot(notes, chord.rootMidi).has(9)).toBe(false);
        });

        it('a dominant 7 keeps its color — the b7 blocks the add6, not the absence of a major 3rd', () => {
            // Airtight version of the guard: a dom7 [0,4,7,10] SHARES the major
            // 3rd (PC 4) with the plain triad, so the only thing distinguishing it
            // is the b7 (PC 10). If PC 9 is still absent, the `!ci.includes(10)`
            // guard — not merely a missing 3rd — is what withholds the add6.
            const chord = {
                rootMidi: 67,
                quality: '7',
                intervals: [0, 4, 7, 10],
                sectionId: 'A',
            };
            const notes = firstEmission('Country', 0.5, chord);
            expect(notes.length).toBeGreaterThan(0);
            expect(pcsFromRoot(notes, chord.rootMidi).has(9)).toBe(false);
        });
    });
});
