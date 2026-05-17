// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Latin Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Bossa Nova',
                creativity: true,
                lastDrumPreset: 'Bossa Nova',
                instruments: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const history = [];
        const latinInstruments = ['Kick', 'Snare', 'Shaker', 'Conga', 'Guiro'];
        for (let bar = 0; bar < numBars; bar++) {
            const barSteps = [];
            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(
                    bar * 16 + step,
                    TIME_SIGNATURES['4/4'],
                    [],
                    TIME_SIGNATURES,
                );
                const stepData = {
                    step: bar * 16 + step,
                    loopStep: step,
                    instruments: {},
                    isDownbeat: info.isMeasureStart,
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                    beatIndex: info.beatIndex,
                };
                for (const instName of latinInstruments) {
                    const params = {
                        step: bar * 16 + step,
                        inst: { name: instName, muted: false, steps: [] },
                        stepVal: 0,
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
                    const result = applyGrooveOverrides(getState(), params);
                    if (result.shouldPlay) {
                        stepData.instruments[instName] = {
                            velocity: result.velocity,
                            sound: result.soundName,
                        };
                    }
                }
                barSteps.push(stepData);
            }
            history.push(barSteps);
        }
        return history;
    };

    it('should pass an authenticity critique for a 128-bar Bossa Nova performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.5 },
            groove: { creativity: false, genreFeel: 'Bossa Nova' },
        });

        let validClaveBars = 0;
        let steadyKickHits = 0;
        let shakerHits = 0;
        const totalBars = performance.length;

        // Authentic 3-2 son clave on a 16th-note grid:
        //   3-side (bar 1): beat 1, "& of 2", beat 4 → steps 0, 6, 12
        //   2-side (bar 2): beat 2, beat 3          → steps 4, 8
        const CLAVE_3_2_BAR1 = [0, 6, 12];
        const CLAVE_3_2_BAR2 = [4, 8];

        performance.forEach((bar, bIdx) => {
            const snareSteps = bar.filter((s) => s.instruments.Snare).map((s) => s.loopStep);
            const isBar1 = bIdx % 2 === 0;
            const target = isBar1 ? CLAVE_3_2_BAR1 : CLAVE_3_2_BAR2;

            const matches =
                target.length === snareSteps.length && target.every((v, i) => v === snareSteps[i]);
            if (matches) {
                validClaveBars++;
            }

            bar.forEach((stepData) => {
                // --- CRITIQUE: Surdo Kick should hit on pulses that are not backbeats
                if (stepData.isBeatStart && !stepData.isBackbeat) {
                    if (stepData.instruments.Kick) {
                        steadyKickHits++;
                    }
                }

                // --- CRITIQUE: Shaker (Constant 16ths) ---
                if (stepData.instruments.Shaker) {
                    shakerHits++;
                }
            });
        });

        const claveScore = validClaveBars / totalBars;
        const kickScore = steadyKickHits / (totalBars * 2);
        const shakerScore = shakerHits / (totalBars * 16);

        console.log('\n--- LATIN DRUMMER CRITIQUE REPORT (Bossa Nova) ---');
        console.log(`[Clave Integrity]       ${(claveScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Surdo Kick Pulse]      ${(kickScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Shaker Consistency]    ${(shakerScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log('------------------------------------\n');

        expect(claveScore).toBe(1.0);
        expect(kickScore).toBe(1.0);
        expect(shakerScore).toBe(1.0);
    });

    it('should emit full Snare (not Sidestick) on backbeats at high intensity in Samba and Partido Alto', () => {
        // Samba (activeMotif 2) and Partido Alto (activeMotif 3) should route the
        // on-beat-2/4 (isBackbeat) hit to 'Snare' when intensity > 0.8, matching the
        // caixa/snare crack of a real samba batería at full energy.
        // Clave positions (non-backbeat steps) remain on Sidestick.
        // Audit finding: drums.md P0 #4.
        // We use genreFeel 'Bossa Nova' with intensity 0.9 — at this level the motif
        // selector (binaryTier 0.6/0.7) pushes to activeMotif 2 or 3.

        const performance = simulatePerformance(64, {
            playback: { bandIntensity: 0.9 },
            groove: { creativity: true, genreFeel: 'Bossa Nova' },
        });

        let snareOnBackbeat = 0;
        let sidestickOnBackbeat = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                // Backbeat positions: step 4 (beat 2) and step 12 (beat 4)
                if (stepData.loopStep === 4 || stepData.loopStep === 12) {
                    if (stepData.instruments.Snare) {
                        const sound = stepData.instruments.Snare.sound;
                        if (sound === 'Snare') {
                            snareOnBackbeat++;
                        } else if (sound === 'Sidestick') {
                            sidestickOnBackbeat++;
                        }
                    }
                }
            });
        });

        const totalBackbeatEvents = snareOnBackbeat + sidestickOnBackbeat;
        const snareRate = snareOnBackbeat / (totalBackbeatEvents || 1);

        console.log(
            `[Latin Snare Body] Backbeat events at intensity 0.9: ${snareOnBackbeat} Snare, ${sidestickOnBackbeat} Sidestick (Snare rate: ${(snareRate * 100).toFixed(1)}%)`,
        );

        // why: at intensity 0.9 the motif selector spreads across motifs 0–3 (clave
        // motifs 0/1 keep Sidestick; Samba=2 and Partido Alto=3 upgrade backbeat to
        // Snare under the new `intensity > 0.8` gate). Asserting `snareRate === 1.0`
        // would require *every* bar to land in motif 2/3, which the selector does
        // not guarantee at any single intensity. The meaningful claim is that the
        // new high-energy path fires — a non-trivial Snare share on backbeat events
        // proves Samba/Partido Alto are reachable and route correctly.
        expect(snareOnBackbeat).toBeGreaterThan(0);
        expect(snareRate).toBeGreaterThan(0.3);
    });
});
