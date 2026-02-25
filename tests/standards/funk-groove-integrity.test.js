import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Funk Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should assign valid Funk Motifs based on seed and complexity', () => {
        expect(getDrumMotif(0, 'Funk', false, 0.2)).toBe(0); // Low complexity = Standard

        // At high complexity, we expect non-zero motifs depending on the barIndex seed
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(i, 'Funk', true, 0.8));
        }
        expect(motifs.has(1)).toBe(true);
        expect(motifs.has(2)).toBe(true);
        expect(motifs.has(3)).toBe(true);
    });

    describe('Apply Groove Overrides - Funk Motifs', () => {
        const mockState = {
            playback: { bandIntensity: 0.8, bpm: 110, songMode: false },
            groove: { genreFeel: 'Funk', creativity: true, lastDrumPreset: 'Funk' },
            soloist: { enabled: false, busySteps: 0 },
        };

        const createParams = (step, instName, stepVal = 0) => {
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback: mockState.playback,
                groove: mockState.groove,
                isDownbeat: step % 16 === 0,
                isQuarter: step % 4 === 0,
                isBackbeat: step % 16 === 4 || step % 16 === 12,
                isGroupStart: step % 16 === 0 || step % 16 === 8,
            };
        };

        it('should play structured ghost notes for Motif 1 (The Funky Drummer)', () => {
            getState.mockReturnValue(mockState);

            // Find a barIndex that maps to Motif 1
            let barIndexMotif1 = -1;
            for (let i = 0; i < 100; i++) {
                if (getDrumMotif(i, 'Funk', true, 0.8) === 1 && i % 4 !== 3) {
                    barIndexMotif1 = i;
                    break;
                }
            }
            if (barIndexMotif1 === -1) {
                return; // Wait for implementation
            }

            const stepGhost = barIndexMotif1 * 16 + 7; // step 7 is the "a" of 2 (classic ghost spot)
            const resultSnare = applyGrooveOverrides(createParams(stepGhost, 'Snare'));

            // The ghost note should play, but with low velocity
            expect(resultSnare.shouldPlay).toBe(true);
            expect(resultSnare.velocity).toBeLessThan(0.5);
        });

        it('should displace the backbeat for Motif 2 (Cold Sweat Style)', () => {
            getState.mockReturnValue(mockState);

            let barIndexMotif2 = -1;
            for (let i = 0; i < 100; i++) {
                if (getDrumMotif(i, 'Funk', true, 0.8) === 2 && i % 4 !== 3) {
                    barIndexMotif2 = i;
                    break;
                }
            }
            if (barIndexMotif2 === -1) {
                return;
            }

            // Motif 2 often moves the snare backbeat to the "and" of 4
            const normalBackbeat = barIndexMotif2 * 16 + 12; // beat 4
            const displacedBackbeat = barIndexMotif2 * 16 + 14; // "and" of 4

            const resultNormal = applyGrooveOverrides(createParams(normalBackbeat, 'Snare'));
            const resultDisplaced = applyGrooveOverrides(createParams(displacedBackbeat, 'Snare'));

            // In a displaced motif, the normal backbeat is often silent, and the "and" is strong
            expect(resultNormal.shouldPlay).toBe(false);
            expect(resultDisplaced.shouldPlay).toBe(true);
            expect(resultDisplaced.velocity).toBeGreaterThan(0.9);
        });

        it('should trigger anticipatory hi-hat barks on phrase turnarounds (barIndex % 4 === 3)', () => {
            getState.mockReturnValue(mockState);

            const turnaroundBarIndex = 3; // 3 % 4 === 3
            const beat4And = turnaroundBarIndex * 16 + 14; // "and" of 4 leading into next phrase

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
