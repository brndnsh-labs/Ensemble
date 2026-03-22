import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

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
            };
        };

        it('should play the Surdo pulse on Kick for non-backbeat pulses', () => {
            getState.mockReturnValue(mockState);

            // Surdo Kick: Non-backbeat pulses (e.g., 0, 8 in 4/4)
            const ts44 = TIME_SIGNATURES['4/4'];
            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                const result = applyGrooveOverrides(getState(), createParams(step, 'Kick'));

                if (info.isBeatStart && !info.isBackbeat) {
                    expect(result.shouldPlay).toBe(true);
                }
            }

            // Offbeat check
            const offStep = 1;
            const resultOff = applyGrooveOverrides(getState(), createParams(offStep, 'Kick'));
            expect(resultOff.shouldPlay).toBe(false);
        });

        it('should play the 3-2 Clave on Snare for Motif 0', () => {
            getState.mockReturnValue(mockState);

            let barIndexMotif0 = -1;
            // Find an EVEN bar index for Bar 1 check
            for (let i = 0; i < 100; i++) {
                if (
                    getDrumMotif(((i * 137 + 42) % 256) / 256, 'Bossa Nova', 0.8) === 0 &&
                    i % 2 === 0
                ) {
                    barIndexMotif0 = i;
                    break;
                }
            }
            if (barIndexMotif0 === -1) {
                return;
            }

            const ts44 = TIME_SIGNATURES['4/4'];

            // Bar 1 (3-side): In 4/4, the 3 clave hits occur on Downbeat, Beat 2 offbeat, Beat 4 start
            const bar1ExpectedSteps = [];
            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                if (
                    info.isMeasureStart ||
                    (info.beatIndex === 1 && info.isOffbeat) ||
                    (info.beatIndex === 3 && info.isBeatStart)
                ) {
                    bar1ExpectedSteps.push(barIndexMotif0 * 16 + step);
                }
            }

            for (const step of bar1ExpectedSteps) {
                const result = applyGrooveOverrides(getState(), createParams(step, 'Snare'));
                expect(result.shouldPlay).toBe(true);
                expect(result.soundName).toBe('Sidestick');
            }

            // Bar 2 (2-side): In 4/4, the 2 clave hits occur on Downbeat offbeat, Beat 3 start
            const bar2ExpectedSteps = [];
            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                if (
                    (info.isMeasureStart && info.isOffbeat) ||
                    (info.beatIndex === 2 && info.isBeatStart)
                ) {
                    bar2ExpectedSteps.push((barIndexMotif0 + 1) * 16 + step);
                }
            }

            for (const step of bar2ExpectedSteps) {
                const result = applyGrooveOverrides(getState(), createParams(step, 'Snare'));
                expect(result.shouldPlay).toBe(true);
                expect(result.soundName).toBe('Sidestick');
            }
        });

        it('should play steady 16th Shakers with 8th note accents', () => {
            getState.mockReturnValue(mockState);

            const step8th = 0;
            const step16th = 1;

            const result8th = applyGrooveOverrides(getState(), createParams(step8th, 'Shaker', 1));
            const result16th = applyGrooveOverrides(
                getState(),
                createParams(step16th, 'Shaker', 1),
            );

            expect(result8th.shouldPlay).toBe(true);
            expect(result16th.shouldPlay).toBe(true);
            expect(result8th.velocity).toBeGreaterThan(result16th.velocity);
        });
    });
});
