import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

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
                    const info = getStepInfo(
                        bar * 16 + step,
                        TIME_SIGNATURES['4/4'],
                        [],
                        TIME_SIGNATURES,
                    );
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
        const _weakBackbeats = 0;
        let eighthNoteHats = 0;
        let nonEighthNoteHats = 0;
        let snareGhostHits = 0;
        let kickSolidHits = 0;
        let _openHatHighIntensityCount = 0;
        let _totalSnareVelocity = 0;
        let _totalGhostVelocity = 0;
        let rideHits = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                const isEighth = s % 2 === 0;

                // --- CRITIQUE: Backbeat (Snare 2 and 4, or 3 in half-time) ---
                const snare = stepData.instruments.Snare;
                if (snare) {
                    if (snare.velocity >= 1.1) {
                        backbeatHits++;
                        _totalSnareVelocity += snare.velocity;
                    } else {
                        // --- CRITIQUE: Snare Ghost/Entropy ---
                        snareGhostHits++;
                        _totalGhostVelocity += snare.velocity;
                    }
                }

                // --- CRITIQUE: Kick Solid (1 and 3) ---
                if ((s === 0 || s === 8) && stepData.instruments.Kick) {
                    kickSolidHits++;
                }

                // --- CRITIQUE: Eighth Note Pulse (Hats/Ride) ---
                const hat =
                    stepData.instruments.HiHat ||
                    stepData.instruments.Open ||
                    stepData.instruments.Ride;
                if (hat) {
                    if (isEighth) {
                        eighthNoteHats++;
                        if (hat.sound === 'Open') {
                            _openHatHighIntensityCount++;
                        }
                        if (hat.sound === 'Ride') {
                            rideHits++;
                        }
                    } else {
                        nonEighthNoteHats++;
                    }
                }
            });
        });

        const totalBars = performance.length;
        // In Rock, we expect at least 2 snare hits per bar (standard or half-time)
        const _backbeatScore = backbeatHits / (totalBars * 1); // Minimum 1 per bar (half-time)
        const eighthHatScore = eighthNoteHats / (eighthNoteHats + nonEighthNoteHats);

        const kickScore = kickSolidHits / (totalBars * 2);

        console.log('\n--- ROCK DRUMMER CRITIQUE REPORT ---');
        console.log(`[Backbeat Authority]   ${backbeatHits} strong hits over ${totalBars} bars`);
        console.log(`[Eighth Note Pulse]    ${(eighthHatScore * 100).toFixed(1)}% (Target: >95%)`);
        console.log(`[Kick Solidity]        ${(kickScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Ghost Note Density]   ${(snareGhostHits / totalBars).toFixed(2)} hits/bar`);
        console.log(`[Ride Participation]   ${rideHits} hits (at 0.75 intensity)`);
        console.log('------------------------------------\n');

        // CRITICAL: Rock drummer MUST have strong backbeats.
        expect(backbeatHits).toBeGreaterThan(totalBars);

        // CRITICAL: Kick should ground the 1 and 3 in most motifs.
        expect(kickScore).toBeGreaterThan(0.9);

        // MUSICAL: Rock hats/ride should be consistent eighth notes.
        expect(eighthHatScore).toBeGreaterThan(0.9);

        // MUSICAL: Snare extra hits (ghosting) should be minimal.
        expect(snareGhostHits / totalBars).toBeLessThan(2.0);
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
