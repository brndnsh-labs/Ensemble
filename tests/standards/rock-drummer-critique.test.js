import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Rock Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Rock',
                creativity: true,
                lastDrumPreset: 'Rock',
                instruments: [],
            },
            soloist: { enabled: false, busySteps: 0 },
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const history = [];
        for (let bar = 0; bar < numBars; bar++) {
            const barSteps = [];
            for (let step = 0; step < 16; step++) {
                const stepData = { step: bar * 16 + step, loopStep: step, instruments: {} };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                    const params = {
                        step: bar * 16 + step,
                        inst: { name: instName, muted: false, steps: [] },
                        stepVal: 0,
                        playback: mockState.playback,
                        groove: mockState.groove,
                        isDownbeat: step === 0,
                        isQuarter: step % 4 === 0,
                        isBackbeat: step === 4 || step === 12,
                        isGroupStart: step === 0 || step === 8,
                        beatIndex: Math.floor(step / 4),
                    };
                    const result = applyGrooveOverrides(params);
                    if (result.shouldPlay && result.soundName === instName) {
                        stepData.instruments[instName] = {
                            velocity: result.velocity,
                            sound: result.soundName,
                            offset: result.instTimeOffset,
                        };
                    }
                }
                barSteps.push(stepData);
            }
            history.push(barSteps);
        }
        return history;
    };

    it('should pass an authenticity critique for a 128-bar Rock performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
            groove: { creativity: true, genreFeel: 'Rock' },
        });

        let backbeatHits = 0;
        let weakBackbeats = 0;
        let eighthNoteHats = 0;
        let nonEighthNoteHats = 0;
        let snareGhostHits = 0;
        let kickSolidHits = 0;
        let openHatHighIntensityCount = 0;
        let totalSnareVelocity = 0;
        let totalGhostVelocity = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                const isEighth = s % 2 === 0;

                // --- CRITIQUE: Backbeat (Snare 2 and 4) ---
                if (s === 4 || s === 12) {
                    if (stepData.instruments.Snare) {
                        backbeatHits++;
                        const vel = stepData.instruments.Snare.velocity;
                        totalSnareVelocity += vel;
                        if (vel < 1.0) {
                            weakBackbeats++;
                        }
                    }
                } else if (stepData.instruments.Snare) {
                    // --- CRITIQUE: Snare Ghost/Entropy ---
                    snareGhostHits++;
                    totalGhostVelocity += stepData.instruments.Snare.velocity;
                }

                // --- CRITIQUE: Kick Solid (1 and 3) ---
                if ((s === 0 || s === 8) && stepData.instruments.Kick) {
                    kickSolidHits++;
                }

                // --- CRITIQUE: Eighth Note Hats (Rock Standard) ---
                if (isEighth) {
                    if (stepData.instruments.HiHat || stepData.instruments.Open) {
                        eighthNoteHats++;
                        if (stepData.instruments.Open) {
                            openHatHighIntensityCount++;
                        }
                    }
                } else {
                    if (stepData.instruments.HiHat || stepData.instruments.Open) {
                        nonEighthNoteHats++;
                    }
                }
            });
        });

        const totalBars = performance.length;
        const backbeatScore = backbeatHits / (totalBars * 2);
        const eighthHatScore = eighthNoteHats / (eighthNoteHats + nonEighthNoteHats);
        const kickScore = kickSolidHits / (totalBars * 2);
        const ghostToBackbeatRatio = totalGhostVelocity / (totalSnareVelocity || 1);
        const intensityAwareHats = openHatHighIntensityCount / eighthNoteHats;

        console.log('\n--- ROCK DRUMMER CRITIQUE REPORT ---');
        console.log(`[Backbeat Consistency]  ${(backbeatScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(
            `[Backbeat Authority]    ${weakBackbeats === 0 ? 'PASS' : 'FAIL'} (${weakBackbeats} weak hits)`,
        );
        console.log(`[Eighth Note Pulse]    ${(eighthHatScore * 100).toFixed(1)}% (Target: >95%)`);
        console.log(`[Kick Solidity]        ${(kickScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Ghost Note Density]   ${(snareGhostHits / totalBars).toFixed(2)} hits/bar`);
        console.log(
            `[Intensity Awareness]  ${(intensityAwareHats * 100).toFixed(1)}% Open Hats (at 0.75 intensity)`,
        );
        console.log('------------------------------------\n');

        // CRITICAL: Rock drummer NEVER misses the backbeat on 2 and 4.
        expect(backbeatScore).toBe(1.0);
        expect(weakBackbeats).toBe(0);

        // CRITICAL: Kick should ground the 1 and 3.
        expect(kickScore).toBe(1.0);

        // MUSICAL: Rock hats should be consistent eighth notes.
        expect(eighthHatScore).toBeGreaterThan(0.95);

        // MUSICAL: Rock Snare extra hits (ghosting) should be minimal compared to Funk/Jazz.
        expect(snareGhostHits / totalBars).toBeLessThan(1.0);
        expect(ghostToBackbeatRatio).toBeLessThan(0.18);
    });

    it('should switch from HiHat to Open sounds at high intensity', () => {
        const lowIntensityPerf = simulatePerformance(32, { playback: { bandIntensity: 0.3 } });
        const highIntensityPerf = simulatePerformance(32, { playback: { bandIntensity: 0.9 } });

        const countOpenHats = (perf) => {
            let count = 0;
            perf.forEach((bar) =>
                bar.forEach((step) => {
                    if (step.instruments.Open) {
                        count++;
                    }
                }),
            );
            return count;
        };

        const lowOpen = countOpenHats(lowIntensityPerf);
        const highOpen = countOpenHats(highIntensityPerf);

        console.log(
            `[Rock Intensity] Low (0.3) Open Hats: ${lowOpen}, High (0.9) Open Hats: ${highOpen}`,
        );
        expect(highOpen).toBeGreaterThan(lowOpen);
        expect(lowOpen).toBe(0); // Should be mostly closed at low intensity
    });
});
