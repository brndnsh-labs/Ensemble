import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Neo-Soul Harmony Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Neo-Soul',
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

    it('should pass an authenticity critique for a 128-bar Neo-Soul performance', () => {
        const chordC = { rootMidi: 60, quality: 'm9', intervals: [0, 3, 7, 10, 2], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let delayedHits = 0; // Positive timing offset
        let ghostNoteHits = 0;
        let totalStabs = 0;

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
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
                const note = notes[0];

                // 1. "Dilla" Lag (Positive timing offset)
                // Neo-soul lag is 0.015 + jitter
                if (note.timingOffset > 0.01) {
                    delayedHits++;
                }

                // 2. Ghost Note Presence (Velocity reduction)
                if (note.velocity < 0.5) {
                    ghostNoteHits++;
                }
            }
        }

        const lagScore = delayedHits / totalStabs;
        const ghostScore = ghostNoteHits / totalStabs;

        console.log(
            '\n--- NEO-SOUL HARMONY CRITIQUE REPORT ---\n' +
                `[Dilla Pocket Lag]      ${(lagScore * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Ghost Note Presence]   ${(ghostScore * 100).toFixed(1)}% (Target: >10%)\n` +
                '------------------------------------\n',
        );

        expect(lagScore).toBe(1.0);
        expect(ghostScore).toBeGreaterThan(0.1);
    });
});
