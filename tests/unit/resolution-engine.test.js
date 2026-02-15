import { describe, it, expect } from 'vitest';
import { generateResolutionNotes } from '../../public/resolution.js';

describe('Resolution Engine', () => {
    const mockArranger = {
        key: 'C',
        isMinor: false,
        stepMap: [{ start: 0, end: 16, chord: { key: 'C', value: 'I' } }]
    };
    const enabled = { bass: true, chords: true, soloist: true, harmony: true, groove: true };

    it('should generate a 3-step cadence for Jazz genre', () => {
        const notes = generateResolutionNotes(0, mockArranger, enabled, 120, { genreFeel: 'Jazz' });
        
        // Find distinct chord timings in the output
        const timings = [...new Set(notes.filter(n => n.module === 'chords' && n.midi > 0).map(n => n.timingOffset))];
        // Note: some timings might be very close due to strumming, so we group them
        const uniqueBeats = timings.reduce((acc, t) => {
            const beat = Math.round(t / (60/120));
            if (!acc.includes(beat)) acc.push(beat);
            return acc;
        }, []);

        // Jazz (ii-V-I) should have 3 distinct chord steps (at beats 0, 2, 4)
        expect(uniqueBeats.length).toBe(3);
        expect(uniqueBeats).toContain(0);
        expect(uniqueBeats).toContain(2);
        expect(uniqueBeats).toContain(4);
    });

    it('should generate a 2-step cadence for Rock genre', () => {
        const notes = generateResolutionNotes(0, mockArranger, enabled, 120, { genreFeel: 'Rock' });
        
        const timings = [...new Set(notes.filter(n => n.module === 'chords' && n.midi > 0).map(n => n.timingOffset))];
        const uniqueBeats = timings.reduce((acc, t) => {
            const beat = Math.round(t / (60/120));
            if (!acc.includes(beat)) acc.push(beat);
            return acc;
        }, []);

        // Rock (IV-I) should have 2 distinct chord steps (at beats 0, 2)
        expect(uniqueBeats.length).toBe(2);
        expect(uniqueBeats).toContain(0);
        expect(uniqueBeats).toContain(2);
    });

    it('should include drum fills for Jazz/Blues', () => {
        const jazzNotes = generateResolutionNotes(0, mockArranger, enabled, 120, { genreFeel: 'Jazz' });
        const rockNotes = generateResolutionNotes(0, mockArranger, enabled, 120, { genreFeel: 'Rock' });

        const jazzSnare = jazzNotes.filter(n => n.module === 'groove' && n.name === 'Snare');
        const rockSnare = rockNotes.filter(n => n.module === 'groove' && n.name === 'Snare');

        expect(jazzSnare.length).toBeGreaterThan(0);
        expect(rockSnare.length).toBe(0); // Rock doesn't have the snare roll flourish in this impl
    });

    it('should include chromatic bass approach for Jazz', () => {
        const notes = generateResolutionNotes(0, mockArranger, enabled, 120, { genreFeel: 'Jazz' });
        
        // Approach notes are scheduled at (time - 0.5) beats
        const approachNotes = notes.filter(n => n.module === 'bass' && n.timingOffset < 0);
        // Step 2 approach is at 1.5 beats, Step 3 at 3.5 beats
        const beatTimings = notes.filter(n => n.module === 'bass').map(n => n.timingOffset / (60/120));
        
        expect(beatTimings).toContain(1.5);
        expect(beatTimings).toContain(3.5);
    });
});
