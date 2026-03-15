import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/harmonies.js';
import { getState } from '../../public/state.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Bossa Nova Harmony Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Bossa Nova',
                pocket: {
                    globalDrive: 0,
                    tightness: 1,
                    bassGravity: 1,
                    chordGravity: 1,
                    soloistGravity: 1,
                },
            },
            soloist: { enabled: true, isResting: true, notesInPhrase: 0 },
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Bossa Nova performance', () => {
        const chordC = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let validPatternHits = 0;
        let totalStabs = 0;
        const BOSSA_STEPS = [0, 6, 12, 18, 24, 30]; // Authentic 2-Bar Bossa Pattern steps (0-31)

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const stepInTwoBars = i % 32;
            const notes = getHarmonyNotes(
                getState(),
                chordC,
                null,
                i,
                64,
                'smart',
                stepInMeasure,
                null,
                {},
            );

            if (notes.length > 0) {
                totalStabs++;
                if (BOSSA_STEPS.includes(stepInTwoBars)) {
                    validPatternHits++;
                }
            }
        }

        const patternScore = validPatternHits / totalStabs;

        console.log(
            '\n--- BOSSA NOVA HARMONY CRITIQUE REPORT ---\n' +
                `[Pattern Alignment]     ${(patternScore * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Rhythmic Density]      ${(totalStabs / totalMeasures).toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        expect(patternScore).toBe(1.0);
        expect(totalStabs / totalMeasures).toBeGreaterThan(2.0);
    });
});
