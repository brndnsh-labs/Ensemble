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
                measures: numBars,
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
            const active = isBassActive(getState(), 'dub', globalStep, globalStep % 16, info);

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

    it('should skip Beat 1 frequently at medium intensity (One-Drop bias)', () => {
        // bass-styles.ts:696 gates beat 1 with `intensity < 0.7 && random < 0.8`, so
        // medium intensity should produce ~80% silence on bar downbeats.
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 90 },
        });

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

        // 80% engine gate; observed across runs should hover near 80% with stdev ~3.5%.
        expect(oneSilenceRatio).toBeGreaterThan(0.7);
        expect(oneSilenceRatio).toBeLessThan(0.9);
    });

    it('should leave Beat 1 fully open at high intensity (Steppers riddim)', () => {
        // intensity > 0.85 selects 'Steppers' which DOES have a step-0 entry.
        // The 80% silencer at line 696 only fires when intensity < 0.7, so at 0.95
        // every bar's beat 1 should fire.
        const performance = simulatePerformance(64, {
            playback: { bandIntensity: 0.95, complexity: 0.5, bpm: 90 },
        });
        const beatOneHits = performance.filter((p) => p.loopStep === 0).length;
        console.log(`[Reggae Critique] Steppers beat-1 hits: ${beatOneHits}/64`);
        expect(beatOneHits).toBe(64); // deterministic — no random gate at this intensity
    });

    it('should stay grounded in the ultra-deep sub register (23-42)', () => {
        // bass-engine.ts:127-128 sets extended-range softMin=23 / softMax=57 for Reggae.
        // bass-styles.ts:700-708 then forces finalDeepRoot <= 38 (octave-down loop) and
        // >= absMin. The added riddim interval (0 or 7) can push the resulting note up
        // to ~45. Range 23–42 covers both pure-root and 5th-of-root riddim slots.
        const performance = simulatePerformance(32, {
            playback: { bandIntensity: 0.8, complexity: 0.5, bpm: 90 },
        });

        expect(performance.length).toBeGreaterThan(20); // sanity: bass actually fired
        performance.forEach((p) => {
            expect(p.note.midi).toBeGreaterThanOrEqual(23);
            expect(p.note.midi).toBeLessThanOrEqual(42);
        });
    });

    it('should switch riddims based on intensity', () => {
        // bass-styles.ts:710-719 picks riddim by intensity bands:
        //   > 0.85 Steppers (positions 0, 4, 8, 12 — 4 hits/bar)
        //   > 0.65 Stalag (positions 0, 2, 4, 6, 10, 12 — 6 hits/bar)
        //   > 0.45 54-46 (positions 0, 2, 6, 8, 10, 14 — 6 hits/bar)
        //   else   One Drop (position 8 only — 1 hit/bar)
        const oneDrop = simulatePerformance(32, {
            playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 90 },
        });
        const steppers = simulatePerformance(32, {
            playback: { bandIntensity: 0.95, complexity: 0.5, bpm: 90 },
        });

        // One Drop: only step 8 fires
        const oneDropPositions = new Set(oneDrop.map((p) => p.loopStep));
        // Steppers: steps 0, 4, 8, 12 fire
        const steppersPositions = new Set(steppers.map((p) => p.loopStep));

        console.log(
            `[Reggae Critique] Riddim positions — OneDrop: [${[...oneDropPositions].sort((a, b) => a - b).join(',')}] Steppers: [${[...steppersPositions].sort((a, b) => a - b).join(',')}]`,
        );

        // One Drop has the 80% silencer on beat 1 too (line 696 fires on isOne, not just
        // isDownbeat — and isDownbeat includes the One-Drop pos 8 hit). So position 8
        // also gets silenced sometimes. The riddim still constrains *which* positions
        // could ever fire.
        for (const pos of oneDropPositions) {
            expect(pos).toBe(8);
        }
        // Steppers fires on a 4-on-the-floor pattern at high intensity.
        expect(steppersPositions).toEqual(new Set([0, 4, 8, 12]));
    });
});
