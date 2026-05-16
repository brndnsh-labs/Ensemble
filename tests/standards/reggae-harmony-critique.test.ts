// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Reggae Harmony Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Reggae',
                pocket: {
                    globalDrive: 0,
                    tightness: 1,
                    bassGravity: 1,
                    chordGravity: 1,
                    soloistGravity: 1,
                },
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Reggae skank performance', () => {
        const chordC = { rootMidi: 60, quality: 'm', intervals: [0, 3, 7], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let skankHits = 0; // Hits on beats 2 and 4 (steps 4, 12)
        let _invalidHits = 0;
        let totalStabs = 0;

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
                const s = stepInTwoBars;
                if (s === 4 || s === 12 || s === 20 || s === 28) {
                    skankHits++;
                } else {
                    _invalidHits++;
                }
            }
        }

        const skankScore = skankHits / (totalMeasures * 2);
        const precisionScore = skankHits / totalStabs;

        console.log(
            '\n--- REGGAE HARMONY CRITIQUE REPORT ---\n' +
                `[Skank Consistency]     ${(skankScore * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Rhythmic Precision]    ${(precisionScore * 100).toFixed(1)}% (Target: 100%)\n` +
                '------------------------------------\n',
        );

        expect(skankScore).toBe(1.0);
        expect(precisionScore).toBe(1.0);
    });
});
