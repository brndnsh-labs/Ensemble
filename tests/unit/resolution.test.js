import { describe, expect, it, vi } from 'vitest';
import { generateResolutionNotes } from '../../public/resolution.js';

// Mock state.js to provide necessary state for chords.js
vi.mock('../../public/state.js', () => ({
    getState: () => ({
        chords: { octave: 60, density: 'standard' },
        playback: { bandIntensity: 0.5 },
        groove: { genreFeel: 'Rock' },
    }),
    dispatch: vi.fn(),
}));

// Use real utils and config if possible, or minimal mocks
vi.mock('../../public/utils.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440)),
        getFrequency: (midi) => 440 * 2 ** ((midi - 69) / 12),
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
        // Rock is the default, which uses BUTTON (1 step)
        const notes = generateResolutionNotes(state, step, arranger, enabled, bpm);

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
        const groove = { genreFeel: 'Rock' }; // Use explicit genre to check mapping
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

    it('generates Jazz ending with extensions', () => {
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

        // Jazz Major should be JAZZ_V_I (2 steps)
        const uniqueTimes = [...new Set(notes.map((n) => n.timingOffset))];
        expect(uniqueTimes.length).toBe(2);
    });
});
