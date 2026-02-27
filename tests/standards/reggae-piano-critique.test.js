import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/accompaniment.js';
import { getState } from '../../public/state.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Reggae Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, step: 0, intent: {} },
            groove: { genreFeel: 'Reggae', pocket: 0, instruments: [] },
            soloist: { enabled: true, busySteps: 0, lastFreq: 0 },
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Reggae skank performance', () => {
        const chordC = {
            rootMidi: 60,
            quality: 'minor',
            intervals: [0, 3, 7],
            freqs: [261.63, 311.13, 392.0],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let authenticHits = 0;
        let totalStabs = 0;

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
                totalStabs++;
                // Authentic Reggae steps: Skanks (4, 12) or Bubbles (1, 3, 5, 7, 9, 11, 13, 15)
                if (stepInMeasure !== 0 && stepInMeasure !== 8) {
                    authenticHits++;
                }
            }
        }

        const authenticRatio = authenticHits / totalStabs;

        console.log(
            '\n--- REGGAE PIANO CRITIQUE REPORT ---\n' +
                `[Authentic Pattern]     ${(authenticRatio * 100).toFixed(1)}%\n` +
                `[Rhythmic Density]      ${(totalStabs / totalMeasures).toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        expect(authenticRatio).toBeGreaterThan(0.9);
        expect(totalStabs / totalMeasures).toBeGreaterThanOrEqual(2.0);
    });
});
