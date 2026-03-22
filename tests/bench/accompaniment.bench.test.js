import { describe, it } from 'vitest';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

const { arranger, playback, chords } = getState();

describe('Accompaniment Performance', () => {
    it('measures getAccompanimentNotes performance with sticky genre logic', () => {
        // Setup state to trigger the "sticky" path
        chords.enabled = true;
        chords.style = 'funk'; // Triggers genre='Funk' which is in stickyGenres
        playback.bandIntensity = 0.8;
        playback.complexity = 0.5;
        arranger.timeSignature = '4/4';
        arranger.progression = [
            {
                rootMidi: 60,
                freqs: [261.63, 329.63, 392.0, 493.88],
                quality: 'maj7',
                beats: 4,
                sectionId: 's1',
            },
        ];

        // Reset comping state
        compingState.lockedUntil = 0;
        compingState.lastSectionId = null;

        const iterations = 100000;
        const mockChord = arranger.progression[0];

        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            // Simulate stepping through a measure
            // We pass different step values to force some logic execution
            const step = i % 16;
            getAccompanimentNotes(getState(), mockChord, i, step, step, {
                isBeatStart: step % 4 === 0,
            });
        }

        const end = performance.now();
        const duration = end - start;

        console.log(
            `getAccompanimentNotes (${iterations} iterations, Funk style) took ${duration.toFixed(2)}ms`,
        );

        // Sanity check to ensure we actually got something back (implies code ran)
        // We don't check every result, just that it didn't crash.
    });
});
