// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { generateResolutionNotes } from '../../../public/engine/resolution.js';

// Mock state.js to provide necessary state for chords.js
vi.mock('../../../public/state.js', () => ({
    getState: () => ({
        chords: { octave: 60, density: 'standard' },
        playback: { bandIntensity: 0.5 },
        groove: { genreFeel: 'Rock' },
    }),
    dispatch: vi.fn(),
}));

// Minimal mocks for pure functions to allow logic to run
vi.mock('../../../public/utils.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440)),
        getFrequency: (midi) => 440 * 2 ** ((midi - 69) / 12),
        applyBluesBends: vi.fn(),
        midiToNote: () => ({ name: 'C', octave: 4 }),
    };
});

describe('Resolution Engine Profiles', () => {
    const mockArranger = {
        key: 'C',
        isMinor: false,
        stepMap: [
            { start: 0, end: 16, chord: { key: 'C', value: 'I', rootMidi: 60, quality: 'Major' } },
        ],
    };
    const enabled = { bass: true, chords: true, soloist: true, harmony: true, groove: true };
    const state = {
        playback: { bandIntensity: 0.5 },
        groove: { genreFeel: 'Rock' },
    };

    const getUniqueChordTimes = (notes) => {
        const chordEvents = notes.filter((n) => n.module === 'chords' && n.midi > 0);
        chordEvents.sort((a, b) => a.timingOffset - b.timingOffset);
        const uniqueTimes = [];
        const threshold = 0.2;

        chordEvents.forEach((n) => {
            if (
                uniqueTimes.length === 0 ||
                n.timingOffset - uniqueTimes[uniqueTimes.length - 1] > threshold
            ) {
                uniqueTimes.push(n.timingOffset);
            }
        });
        return uniqueTimes;
    };

    it('Jazz Profile: Generates 2-step V-I with ritardando', () => {
        const notes = generateResolutionNotes(state, 0, mockArranger, enabled, 120, {
            genreFeel: 'Jazz',
        });
        const uniqueTimes = getUniqueChordTimes(notes);

        // Should have 2 distinct chords (V and I)
        expect(uniqueTimes.length).toBe(2);

        // Ritardando check: Interval between the two chords should be significant
        if (uniqueTimes.length === 2) {
            const d1 = uniqueTimes[1] - uniqueTimes[0];
            expect(d1).toBeGreaterThan(1.0); // At 120BPM, 2 beats * (1 + 1.2 ritardando) = 1.1s
        }
    });

    it('Rock Profile: Generates 1-step BUTTON hit', () => {
        const notes = generateResolutionNotes(state, 0, mockArranger, enabled, 120, {
            genreFeel: 'Rock',
        });
        const uniqueTimes = getUniqueChordTimes(notes);

        // Should be 1 step (BUTTON)
        expect(uniqueTimes.length).toBe(1);
    });

    it('Blues Profile: Generates 2-step resolution', () => {
        const notes = generateResolutionNotes(state, 0, mockArranger, enabled, 120, {
            genreFeel: 'Blues',
        });
        const uniqueTimes = getUniqueChordTimes(notes);

        // Blues now uses STANDARD_V_I (2 steps)
        expect(uniqueTimes.length).toBe(2);
    });
});
