import { describe, expect, it, vi } from 'vitest';
import { generateResolutionNotes as generateResolutionNotesImpl } from '../../../public/engine/resolution.js';

// Tests pass partial state/arranger objects; cast to any for the test boundary.
const generateResolutionNotes = generateResolutionNotesImpl as (...args: any[]) => any[];

// Mock state.js to provide necessary state for chords.js
vi.mock('../../../public/state.js', () => ({
    getState: () => ({
        chords: { octave: 60, density: 'standard' },
        playback: { bandIntensity: 0.5 },
        groove: { genreFeel: 'Rock' },
    }),
    dispatch: vi.fn(),
}));

// Use real utils and config if possible, or minimal mocks
vi.mock('../../../public/utils.js', async (importOriginal) => {
    const actual = (await importOriginal()) as any;
    return {
        ...actual,
        getMidi: (freq: any) => Math.round(69 + 12 * Math.log2(freq / 440)),
        getFrequency: (midi: any) => 440 * 2 ** ((midi - 69) / 12),
        applyBluesBends: vi.fn(),
        calculateTimingOffset: vi.fn(() => 0),
        midiToNote: () => ({ name: 'C', octave: 4 }), // Simple mock
    };
});

describe('Resolution Logic', () => {
    it('generates resolution notes for enabled instruments (Major)', () => {
        const arranger = { key: 'C', isMinor: false };
        const enabled = { bass: true, chords: true, soloist: true, harmony: true, groove: true };
        const bpm = 120;
        const step = 64;

        const state = { playback: { bandIntensity: 0.5 }, groove: { genreFeel: 'Rock' } };
        const notes = generateResolutionNotes(
            state as any,
            step,
            arranger as any,
            enabled as any,
            bpm,
        );

        expect(notes.length).toBeGreaterThan(0);

        // Check for Bass Notes (Rock is BUTTON hit)
        const bassNotes = notes.filter((n) => n.module === 'bass');
        expect(bassNotes.length).toBe(1);

        // Check timing offsets
        const times = notes.map((n) => n.timingOffset);
        times.forEach((t) => expect(t).toBeDefined());
    });

    it('handles minor key resolution correctly', () => {
        const arranger = { key: 'C', isMinor: true };
        const enabled = { chords: true, bass: true };
        const groove = { genreFeel: 'Rock' };
        const notes = generateResolutionNotes(
            { playback: { bandIntensity: 0.5 }, groove: { genreFeel: 'Rock' } },
            0,
            arranger,
            enabled,
            100,
            groove,
        );

        expect(notes.length).toBeGreaterThan(0);

        // Check Chord Intervals
        const chordNotes = notes.filter((n) => n.module === 'chords');
        expect(chordNotes.length).toBeGreaterThan(0);
    });

    it('generates Jazz ending with extensions and staggered timing', () => {
        const arranger = { key: 'F', isMinor: false };
        const enabled = { chords: true };
        const groove = { genreFeel: 'Jazz' };

        const notes = generateResolutionNotes(
            { playback: { bandIntensity: 0.5 }, groove: { genreFeel: 'Rock' } },
            0,
            arranger,
            enabled,
            100,
            groove,
        );

        // Jazz Major should be JAZZ_V_I (2 cadence steps)
        // Since we have staggering, unique times will be many, but they should fall into two clusters
        const times = notes.map((n) => n.timingOffset);
        const uniqueClusters = [...new Set(times.map((t) => Math.round(t * 2) / 2))];
        expect(uniqueClusters.length).toBe(2);
    });

    it('scales velocity based on band intensity', () => {
        const arranger = { key: 'C', isMinor: false };
        const enabled = { bass: true };
        const bpm = 120;

        const stateLow = { playback: { bandIntensity: 0.0 }, groove: { genreFeel: 'Rock' } };
        const stateHigh = { playback: { bandIntensity: 1.0 }, groove: { genreFeel: 'Rock' } };

        const notesLow = generateResolutionNotes(stateLow, 0, arranger, enabled, bpm);
        const notesHigh = generateResolutionNotes(stateHigh, 0, arranger, enabled, bpm);

        expect(notesHigh[0].velocity).toBeGreaterThan(notesLow[0].velocity);
    });

    it('applies micro-staggering to final hit notes', () => {
        const arranger = { key: 'C', isMinor: false };
        const enabled = { chords: true };
        const bpm = 120;

        const state = { playback: { bandIntensity: 0.5 }, groove: { genreFeel: 'Rock' } };
        const notes = generateResolutionNotes(state, 0, arranger, enabled, bpm);

        // Chords usually have multiple notes. Check if they are exactly aligned.
        const chordNotes = notes.filter((n) => n.module === 'chords');
        if (chordNotes.length > 1) {
            const allSame = chordNotes.every((n) => n.timingOffset === chordNotes[0].timingOffset);
            expect(allSame).toBe(false);
        }
    });

    it('applies global resolution normalization tamer', () => {
        const arranger = { key: 'C', isMinor: false };
        const enabled = { bass: true };
        const bpm = 120;

        const state = { playback: { bandIntensity: 1.0 }, groove: { genreFeel: 'Rock' } };
        const notes = generateResolutionNotes(state, 0, arranger, enabled, bpm);

        // Even at 1.0 intensity, velocity should not be 1.0 because of the tamer (0.85)
        expect(notes[0].velocity).toBeLessThan(0.9);
    });

    it('keeps the final cadence in the same velocity lane as the setup note', () => {
        const arranger = { key: 'C', isMinor: false };
        const enabled = { bass: true };
        const groove = { genreFeel: 'Jazz' };

        const notes = generateResolutionNotes(
            { playback: { bandIntensity: 1.0 }, groove },
            0,
            arranger,
            enabled,
            120,
            groove,
        );

        const bassNotes = notes.filter((n) => n.module === 'bass');
        expect(bassNotes.length).toBe(2);
        expect(bassNotes[1].midiVelocity).toBeLessThanOrEqual(bassNotes[0].midiVelocity);
    });
});
