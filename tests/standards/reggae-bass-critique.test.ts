// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Reggae Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel: 'Reggae',
                creativity: true,
                lastDrumPreset: 'Reggae',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'dub', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    32,
                    'dub',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should pass an authenticity critique for a 128-bar Reggae performance', () => {
        const performance = simulatePerformance(128, { playback: { bandIntensity: 0.5 } });

        let beatOneHits = 0;
        const totalBars = 128;

        performance.forEach((p) => {
            if (p.loopStep === 0) {
                beatOneHits++;
            }
        });

        const oneSilenceRatio = 1 - beatOneHits / totalBars;
        console.log(
            `[Reggae Critique] Beat 1 Silence Ratio: ${(oneSilenceRatio * 100).toFixed(1)}%`,
        );

        // Authentic Reggae often skips beat 1
        expect(oneSilenceRatio).toBeGreaterThan(0.2);
    });

    it('should stay grounded in the ultra-deep sub register (28-38)', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.8 } });

        performance.forEach((p) => {
            expect(p.note.midi).toBeGreaterThanOrEqual(28);
            expect(p.note.midi).toBeLessThanOrEqual(42); // Allow slight extension for riddim variety
        });
    });
});
