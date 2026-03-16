import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass-engine.js';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Metal Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 140 },
            groove: {
                genreFeel: 'Metal',
                creativity: true,
                lastDrumPreset: 'Metal (Speed)',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: { enabled: false, busySteps: 0 },
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = { rootMidi: 36, intervals: [0, 3, 7], quality: 'm', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive('metal', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'metal',
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

    it('should implement the "Gallop" (16-16-8) at medium-high intensity', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.75, complexity: 0.7 },
        });

        let gallopCount = 0;
        // Check for 16th-16th-8th pattern (steps 0, 1, 2)
        performance.forEach((p, i) => {
            if (p.loopStep % 4 === 0 && i + 2 < performance.length) {
                const n1 = performance[i + 1];
                const n2 = performance[i + 2];
                // Check if they are steps s, s+1, s+2
                if (n1.step === p.step + 1 && n2.step === p.step + 2) {
                    gallopCount++;
                }
            }
        });

        console.log(`[Metal Critique] Gallop Motifs Detected: ${gallopCount}`);
        expect(gallopCount).toBeGreaterThan(5);
    });

    it('should stay grounded in roots and fifths', () => {
        const performance = simulatePerformance(16);

        let rootOrFifthHits = 0;
        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            if (pc === 0 || pc === 7) {
                rootOrFifthHits++;
            }
        });

        const ratio = rootOrFifthHits / (performance.length || 1);
        console.log(`[Metal Critique] Root/Fifth Grounding: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.8);
    });

    it('should implement dense 16th note chugs at maximum intensity', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.95, complexity: 0.9 },
        });

        const totalSteps = 16 * 16;
        const hitDensity = performance.length / totalSteps;

        console.log(
            `[Metal Critique] Hit Density at Max Intensity: ${(hitDensity * 100).toFixed(1)}%`,
        );
        expect(hitDensity).toBeGreaterThan(0.6);
    });
});
