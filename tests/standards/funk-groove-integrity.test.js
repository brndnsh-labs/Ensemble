import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Funk Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should assign valid Funk Motifs based on seed and complexity', () => {
        expect(getDrumMotif(((0 * 137 + 0) % 256) / 256, 'Funk', 0.2)).toBe(0); // Low complexity = Standard

        // At high complexity, we expect non-zero motifs depending on the barIndex seed
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Funk', 0.8));
        }
        expect(motifs.has(1)).toBe(true);
        expect(motifs.has(2)).toBe(true);
        expect(motifs.has(3)).toBe(true);
    });

    describe('Apply Groove Overrides - Funk Motifs', () => {
        const mockState = {
            playback: { bandIntensity: 0.8, bpm: 110, songMode: false },
            groove: {
                genreFeel: 'Funk',
                creativity: true,
                lastDrumPreset: 'Funk',
                sectionSeedMap: { 1: 0.5 }, // Consistent seed for tests
            },
            soloist: { enabled: false, busySteps: 0 },
            arranger: {
                timeSignature: '4/4',
                stepMap: [{ start: 0, end: 1000, chord: { sectionId: '1' } }],
            },
        };

        const createParams = (step, instName, stepVal = 0) => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback: mockState.playback,
                groove: mockState.groove,
                isDownbeat: info.isMeasureStart,
                isBeatStart: info.isBeatStart,
                isBackbeat: info.isBackbeat,
                isGroupStart: info.isGroupStart,
                beatIndex: info.beatIndex,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                tsConfig: info.tsConfig,
                stepsPerBar: 16,
            };
        };

        it('should play structured ghost notes for Motif 1 (The Funky Drummer)', () => {
            getState.mockReturnValue(mockState);

            // Force a seed that maps to Motif 1 (0.2 - 0.5)
            mockState.groove.sectionSeedMap['1'] = 0.3;

            // Force math.random to ensure the 'roll' succeeds
            const mockMath = vi.spyOn(Math, 'random').mockReturnValue(0.01);

            const stepGhost = 6; // step 6 is an offbeat (non-beatStart)
            const resultSnare = applyGrooveOverrides(createParams(stepGhost, 'Snare'));

            // The ghost note should play, but with low velocity
            expect(resultSnare.shouldPlay).toBe(true);
            expect(resultSnare.velocity).toBeLessThan(0.5);

            mockMath.mockRestore();
        });

        it('should displace the backbeat for Motif 2 (Cold Sweat Style)', () => {
            getState.mockReturnValue(mockState);

            // Force a seed that maps to Motif 2
            mockState.groove.sectionSeedMap['1'] = 0.5;

            // Motif 2 often moves the snare backbeat to the "and" of 4
            const normalBackbeat = 12; // beat 4
            const displacedBackbeat = 14; // "and" of 4

            const resultNormal = applyGrooveOverrides(createParams(normalBackbeat, 'Snare'));
            const resultDisplaced = applyGrooveOverrides(createParams(displacedBackbeat, 'Snare'));

            // In a displaced motif, the normal backbeat is often silent, and the "and" is strong
            expect(resultNormal.shouldPlay).toBe(false);
            expect(resultDisplaced.shouldPlay).toBe(true);
            expect(resultDisplaced.velocity).toBeGreaterThan(0.85);
        });

        it('should trigger anticipatory hi-hat barks on phrase turnarounds', () => {
            getState.mockReturnValue(mockState);
            mockState.groove.sectionSeedMap['1'] = 0.5;

            // Set up a turnaround
            mockState.arranger.sectionMap = [{ start: 0, end: 64 }]; // 4 bar section
            const beat4And = 62; // Step 62 is "and" of 4 in bar 4 (3*16 + 14)

            // Force math.random to trigger the turnaround
            const mockMath = vi.spyOn(Math, 'random').mockReturnValue(0.1);

            const resultHat = applyGrooveOverrides(createParams(beat4And, 'HiHat'));

            // Should convert to an 'Open' bark
            expect(resultHat.shouldPlay).toBe(true);
            expect(resultHat.soundName).toBe('Open');
            expect(resultHat.velocity).toBeGreaterThan(0.9);

            mockMath.mockRestore();
        });
    });
});
