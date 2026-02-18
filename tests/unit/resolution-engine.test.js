import { describe, it, expect, vi } from 'vitest';
import { generateResolutionNotes } from '../../public/resolution.js';

// Mock state.js to provide necessary state for chords.js
vi.mock('../../public/state.js', () => ({
    getState: () => ({
        chords: { octave: 60, density: 'standard' },
        playback: { bandIntensity: 0.5 },
        groove: { genreFeel: 'Rock' }
    }),
    dispatch: vi.fn()
}));

// Minimal mocks for pure functions to allow logic to run
vi.mock('../../public/utils.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440)),
        getFrequency: (midi) => 440 * Math.pow(2, (midi - 69) / 12),
        calculateTimingOffset: vi.fn(() => 0),
        midiToNote: () => ({ name: 'C', octave: 4 })
    };
});

describe('Resolution Engine Profiles', () => {
    const mockArranger = {
        key: 'C',
        isMinor: false,
        stepMap: [{ start: 0, end: 16, chord: { key: 'C', value: 'I', rootMidi: 60, quality: 'Major' } }]
    };
    const enabled = { bass: true, chords: true, soloist: true, harmony: true, groove: true };

    const getUniqueChordTimes = (notes) => {
        const chordEvents = notes.filter(n => n.module === 'chords' && n.midi > 0);
        chordEvents.sort((a, b) => a.timingOffset - b.timingOffset);
        const uniqueTimes = [];
        const threshold = 0.2; 
        
        chordEvents.forEach(n => {
            if (uniqueTimes.length === 0 || (n.timingOffset - uniqueTimes[uniqueTimes.length - 1] > threshold)) {
                uniqueTimes.push(n.timingOffset);
            }
        });
        return uniqueTimes;
    };

    it('Jazz Profile: Generates 3-step ii-V-I with ritardando', () => {
        const notes = generateResolutionNotes(0, mockArranger, enabled, 120, { genreFeel: 'Jazz' });
        const uniqueTimes = getUniqueChordTimes(notes);
        
        // Should have 3 distinct chords
        expect(uniqueTimes.length).toBeGreaterThanOrEqual(3);
        
        // Ritardando check: Interval between 2nd and 3rd chord > Interval between 1st and 2nd
        if (uniqueTimes.length >= 3) {
            const d1 = uniqueTimes[1] - uniqueTimes[0];
            const d2 = uniqueTimes[2] - uniqueTimes[1];
            expect(d2).toBeGreaterThan(d1);
        }
    });

    it('Rock Profile: Generates 3-step bVI-bVII-I (Epic)', () => {
        const notes = generateResolutionNotes(0, mockArranger, enabled, 120, { genreFeel: 'Rock' });
        const uniqueTimes = getUniqueChordTimes(notes);

        // Should be 3 steps now (bVI, bVII, I)
        expect(uniqueTimes.length).toBeGreaterThanOrEqual(3);
    });

    it('Blues Profile: Generates Turnaround', () => {
        const notes = generateResolutionNotes(0, mockArranger, enabled, 120, { genreFeel: 'Blues' });
        const uniqueTimes = getUniqueChordTimes(notes);
        
        // Blues turnaround has 5 steps
        expect(uniqueTimes.length).toBeGreaterThanOrEqual(4); 
    });
});
