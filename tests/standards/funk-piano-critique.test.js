import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Funk Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.7, complexity: 0.7, step: 0, intent: {} },
            groove: { genreFeel: 'Funk', pocket: 0, instruments: [] },
            soloist: { enabled: true, busySteps: 0, lastFreq: 0 },
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Funk performance', () => {
        const chordC7 = {
            rootMidi: 60,
            quality: '7',
            intervals: [0, 4, 7, 10],
            freqs: [261.63, 329.63, 392.0, 466.16],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC7];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let syncopatedHits = 0;
        let totalStabs = 0;
        let leanVoicings = 0;

        for (let i = 0; i < totalSteps; i++) {
            mockState.playback.step = i;
            const stepInMeasure = i % 16;
            const notes = getAccompanimentNotes(
                chordC7,
                i,
                stepInMeasure,
                stepInMeasure,
                { isBeatStart: stepInMeasure % 4 === 0 },
                {},
            );

            if (notes.length > 0 && notes[0].midi > 0) {
                totalStabs++;
                if (stepInMeasure % 2 !== 0) {
                    syncopatedHits++;
                }
                if (notes.length <= 3) {
                    leanVoicings++;
                }
            }
        }

        const syncopationRatio = syncopatedHits / totalStabs;
        const leanRatio = leanVoicings / totalStabs;

        console.log(
            '\n--- FUNK PIANO CRITIQUE REPORT ---\n' +
                `[16th Syncopation]      ${(syncopationRatio * 100).toFixed(1)}%\n` +
                `[Lean Voicing (Clav)]   ${(leanRatio * 100).toFixed(1)}%\n` +
                `[Rhythmic Density]      ${(totalStabs / totalMeasures).toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        expect(syncopationRatio).toBeGreaterThan(0.4);
        expect(leanRatio).toBeGreaterThan(0.9);
    });
});
