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

        // "The One Solidity" measures whether the harmony engine hits step 0 of every bar —
        // the *per-bar lock rate*, not the proportion of stabs that happen to land on the One.
        // The old metric (downbeatHits / totalStabs) was mathematically suppressed by the very
        // syncopation that makes Funk feel funky: a busier groove pushed the score down even
        // when The One was hit on every bar. The new metric reflects the actual musical claim.
        const barsWithDownbeat = new Set();
        let syncopatedHits = 0; // Hits on "e" or "a" within a bar
        let totalStabs = 0;

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const barIndex = Math.floor(i / 16);
            const notes = getHarmonyNotes(
                getState(),
                chordC,
                null,
                i,
                64,
                'smart',
                stepInMeasure,
                null,
                // soloistResting/soloistNotesInPhrase are now read from coordination
                // context (S4); set to match the mock's isResting:true, notesInPhrase:0.
                { soloistResting: true, soloistNotesInPhrase: 0 },
            );

            if (notes.length > 0) {
                totalStabs++;
                if (stepInMeasure === 0) {
                    barsWithDownbeat.add(barIndex);
                } else if (stepInMeasure % 2 !== 0) {
                    syncopatedHits++;
                }
            }
        }

        const downbeatLockRate = barsWithDownbeat.size / totalMeasures;
        const syncopationScore = syncopatedHits / totalStabs;

        console.log(
            '\n--- FUNK HARMONY CRITIQUE REPORT ---\n' +
                `[The One Solidity]      ${(downbeatLockRate * 100).toFixed(1)}% of bars (Target: >95%)\n` +
                `[16th Syncopation]      ${(syncopationScore * 100).toFixed(1)}% of stabs (Target: >30%)\n` +
                `[Rhythmic Density]      ${(totalStabs / totalMeasures).toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        // Funk's One is non-negotiable: every bar should have a stab on step 0.
        expect(downbeatLockRate).toBeGreaterThan(0.95);
        expect(syncopationScore).toBeGreaterThan(0.3);
    });
});
