import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Neo-Soul Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.7, step: 0, intent: { layBack: 0.05 } },
            groove: { genreFeel: 'Neo-Soul', pocket: 0, instruments: [] },
            soloist: { enabled: true, busySteps: 0, lastFreq: 0 },
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Neo-Soul performance', () => {
        const chordC = {
            rootMidi: 60,
            quality: 'm9',
            intervals: [0, 3, 7, 10, 2],
            freqs: [261.63, 311.13, 392.0, 466.16, 587.33],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let laidBackHits = 0;
        let totalStabs = 0;
        let richVoicings = 0;

        for (let i = 0; i < totalSteps; i++) {
            mockState.playback.step = i;
            const stepInMeasure = i % 16;
            const notes = getAccompanimentNotes(
                getState(),
                chordC,
                i,
                stepInMeasure,
                stepInMeasure,
                { isBeatStart: stepInMeasure % 4 === 0 },
                {},
            );

            if (notes.length > 0 && notes[0].midi > 0) {
                totalStabs++;
                const note = notes[0];
                if (note.timingOffset > 0.02) {
                    laidBackHits++;
                }
                if (notes.length >= 3) {
                    richVoicings++;
                }
            }
        }

        const lagRatio = laidBackHits / totalStabs;
        const richRatio = richVoicings / totalStabs;

        console.log(
            '\n--- NEO-SOUL PIANO CRITIQUE REPORT ---\n' +
                `[Dilla Pocket Lag]      ${(lagRatio * 100).toFixed(1)}%\n` +
                `[Voicing Richness]      ${(richRatio * 100).toFixed(1)}%\n` +
                '------------------------------------\n',
        );

        expect(lagRatio).toBeGreaterThan(0.9);
        expect(richRatio).toBeGreaterThan(0.8);
    });
});
