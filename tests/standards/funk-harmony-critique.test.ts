// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Funk Harmony Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.7, complexity: 0.8 },
            groove: {
                genreFeel: 'Funk',
                pocket: {
                    globalDrive: 0,
                    tightness: 1,
                    bassGravity: 1,
                    chordGravity: 1,
                    soloistGravity: 1,
                },
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: { enabled: true, complexity: 0.8, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Funk performance', () => {
        const chordC = { rootMidi: 60, quality: '7', intervals: [0, 4, 7, 10], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let syncopatedHits = 0; // Hits on "e" or "a" (steps 1, 3, 5, 7...)
        let downbeatHits = 0;
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
                if (stepInTwoBars === 0 || stepInTwoBars === 16) {
                    downbeatHits++;
                } else if (stepInTwoBars % 2 !== 0) {
                    syncopatedHits++;
                }
            }
        }

        const downbeatScore = downbeatHits / totalStabs;
        const syncopationScore = syncopatedHits / totalStabs;

        console.log(
            '\n--- FUNK HARMONY CRITIQUE REPORT ---\n' +
                `[The One Solidity]      ${(downbeatScore * 100).toFixed(1)}% (Target: >15%)\n` +
                `[16th Syncopation]      ${(syncopationScore * 100).toFixed(1)}% (Target: >30%)\n` +
                `[Rhythmic Density]      ${(totalStabs / totalMeasures).toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        expect(downbeatScore).toBeGreaterThan(0.15);
        expect(syncopationScore).toBeGreaterThan(0.3);
    });
});
