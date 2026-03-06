import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Latin Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.6, bpm: 140, songMode: false },
        groove: {
            genreFeel: 'Bossa Nova',
            creativity: true,
            lastDrumPreset: 'Bossa Nova',
            lastSmartGenre: 'Bossa',
            instruments: [],
        },
        soloist: { enabled: false, busySteps: 0 },
    };

    it('should assign valid Latin Motifs', () => {
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Bossa Nova', 0.8));
        }
        expect(motifs.has(0)).toBe(true);
        expect(motifs.has(1)).toBe(true);
    });

    describe('Apply Groove Overrides - Bossa Patterns', () => {
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
                beatIndex: Math.floor((step % 16) / 4),
            };
        };

        it('should play the Surdo "heartbeat" on Kick (0, 3, 8, 11)', () => {
            getState.mockReturnValue(mockState);

            // Typical Bossa kick steps
            const heartbeatSteps = [0, 3, 8, 11];
            for (const step of heartbeatSteps) {
                const result = applyGrooveOverrides(createParams(step, 'Kick'));
                expect(result.shouldPlay).toBe(true);
            }

            // Offbeat check
            const offStep = 1;
            const resultOff = applyGrooveOverrides(createParams(offStep, 'Kick'));
            expect(resultOff.shouldPlay).toBe(false);
        });

        it('should play the 3-2 Clave on Snare for Motif 0', () => {
            getState.mockReturnValue(mockState);

            let barIndexMotif0 = -1;
            for (let i = 0; i < 100; i++) {
                if (
                    getDrumMotif(((i * 137 + 42) % 256) / 256, 'Bossa Nova', 0.8) === 0 &&
                    i % 4 !== 3
                ) {
                    barIndexMotif0 = i;
                    break;
                }
            }
            if (barIndexMotif0 === -1) {
                return;
            }

            // 3-2 Bossa Clave: 0, 3, 6, 10, 13
            const claveSteps = [0, 3, 6, 10, 13].map((s) => barIndexMotif0 * 16 + s);
            for (const step of claveSteps) {
                const result = applyGrooveOverrides(createParams(step, 'Snare'));
                expect(result.shouldPlay).toBe(true);
                expect(result.soundName).toBe('Sidestick');
            }
        });

        it('should play steady 16th Shakers with 8th note accents', () => {
            getState.mockReturnValue(mockState);

            const step8th = 0;
            const step16th = 1;

            const result8th = applyGrooveOverrides(createParams(step8th, 'Shaker', 1));
            const result16th = applyGrooveOverrides(createParams(step16th, 'Shaker', 1));

            expect(result8th.shouldPlay).toBe(true);
            expect(result16th.shouldPlay).toBe(true);
            expect(result8th.velocity).toBeGreaterThan(result16th.velocity);
        });
    });
});
