import { beforeEach, describe, expect, it } from 'vitest';
import { getScaleForChord } from '../../public/engine/theory-scales.js';
import { getState } from '../../public/state.js';

const { arranger, soloist, groove } = getState();

describe('Dissonance Prevention', () => {
    beforeEach(() => {
        arranger.key = 'C';
        arranger.isMinor = false;
        groove.genreFeel = 'Rock';
        soloist.tension = 0;
    });

    it('should return Ionian/Lydian for F Major even if global key is C Minor (State Leak)', () => {
        // Simulate "Metal Core" (Minor) -> "Pop Standard" (Major) transition
        arranger.key = 'C';
        arranger.isMinor = true; // State leaked from previous preset!

        const chordF = {
            rootMidi: 65, // F4
            quality: 'major',
            intervals: [0, 4, 7], // Triad
            // chord.key might be missing or 'C'
            key: 'C',
        };

        // F Major (F A C) vs C Minor (C D Eb F G Ab Bb)
        // A is not in C Minor. 'every' check will fail.
        // Logic falls back to default.

        const scale = getScaleForChord(chordF, null, 'scalar');

        // Before Fix: Mixolydian (contains 10/Eb) -> Dissonant
        // After Fix: Ionian (contains 11/E) or Lydian -> Consonant-ish (Major 7)

        const hasFlat7 = scale.includes(10);
        const hasMajor7 = scale.includes(11);

        expect(hasFlat7).toBe(false); // Should NOT have Eb
        expect(hasMajor7).toBe(true); // Should have E natural
    });

    it('should fallback to Ionian (Major) for non-diatonic chords (Safety First)', () => {
        // F# Major (Tritone sub?) - Definitely not in C Major
        const chordFSharp = {
            rootMidi: 66, // F#4
            quality: 'major',
            intervals: [0, 4, 7],
            key: 'C',
        };

        const scale = getScaleForChord(chordFSharp, null, 'scalar');
        // Expect Ionian/Lydian default (clean), NOT Mixolydian (bluesy/clashing)
        expect(scale.includes(10)).toBe(false); // No b7
        expect(scale.includes(11)).toBe(true); // Major 7
    });
});
