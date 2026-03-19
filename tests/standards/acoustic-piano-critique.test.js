import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Acoustic Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.3, complexity: 0.5, step: 0, intent: {} },
            groove: { genreFeel: 'Acoustic', pocket: 0, instruments: [] },
            soloist: { enabled: true, busySteps: 0, lastFreq: 0 },
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Acoustic performance (Low Intensity)', () => {
        const chordC = {
            rootMidi: 60,
            quality: 'major',
            intervals: [0, 4, 7],
            freqs: [261.63, 329.63, 392.0],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let singleNoteHits = 0;
        let totalActiveSteps = 0;

        for (let i = 0; i < totalSteps; i++) {
            mockState.playback.step = i;
            const stepInMeasure = i % 16;
            const notes = getAccompanimentNotes(
                chordC,
                i,
                stepInMeasure,
                stepInMeasure,
                { isBeatStart: stepInMeasure % 4 === 0 },
                {},
            );

            if (notes.length > 0 && notes[0].midi > 0) {
                totalActiveSteps++;
                if (notes.length <= 2) {
                    singleNoteHits++;
                }
            }
        }

        const fingerpickScore = singleNoteHits / totalActiveSteps;

        console.log(
            '\n--- ACOUSTIC PIANO CRITIQUE REPORT ---\n' +
                `[Fingerpicking Accuracy] ${(fingerpickScore * 100).toFixed(1)}%\n` +
                `[Rhythmic Density]       ${(totalActiveSteps / totalMeasures).toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        expect(fingerpickScore).toBeGreaterThan(0.9);
        expect(totalActiveSteps / totalMeasures).toBeGreaterThanOrEqual(4.0);
    });
});
