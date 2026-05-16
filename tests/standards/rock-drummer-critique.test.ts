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
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const history = [];
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
                };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
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
                        stepData.instruments[result.soundName || instName] = {
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

                // --- CRITIQUE: Kick Solid (on non-backbeat pulses) ---
                if (stepData.isBeatStart && !stepData.isBackbeat && stepData.instruments.Kick) {
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
        // Rock backbeat = snare on beats 2 AND 4 every bar → 2 strong hits/bar
        // is the genre's defining feature. Half-time would still hit beat 3
        // with full force; either way the floor is "≈2 strong snare hits per
        // bar on average."
        const backbeatScore = backbeatHits / (totalBars * 2);
        const eighthHatScore = eighthNoteHats / (eighthNoteHats + nonEighthNoteHats);

        const kickScore = kickSolidHits / (totalBars * 2);

        console.log('\n--- ROCK DRUMMER CRITIQUE REPORT ---');
        console.log(
            `[Backbeat Authority]   ${backbeatHits} strong hits over ${totalBars} bars (${(backbeatScore * 100).toFixed(1)}%, Target: >95%)`,
        );
        console.log(`[Eighth Note Pulse]    ${(eighthHatScore * 100).toFixed(1)}% (Target: >95%)`);
        console.log(`[Kick Solidity]        ${(kickScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Ghost Note Density]   ${(snareGhostHits / totalBars).toFixed(2)} hits/bar`);
        console.log(`[Ride Participation]   ${rideHits} hits (at 0.75 intensity)`);
        console.log('------------------------------------\n');

        // CRITICAL: Rock drummer MUST hit the backbeat on 2 AND 4. Engine
        // delivers 100% (256/128/2); 0.95 is the floor that still requires
        // the engine to land both snare anchors on essentially every bar.
        expect(backbeatScore).toBeGreaterThan(0.95);

        // CRITICAL: Kick grounds beats 1 and 3 ("the foundation"). Engine
        // delivers 100%; 0.99 is the floor.
        expect(kickScore).toBeGreaterThan(0.99);

        // MUSICAL: Rock hats/ride drive consistent eighth-note pulse. Engine
        // delivers 100%; tightened from >0.9 to >0.95 to match the logged
        // target.
        expect(eighthHatScore).toBeGreaterThan(0.95);

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

    it('should keep open hats as accents instead of a continuous wash at high intensity', () => {
        const performance = simulatePerformance(64, { playback: { bandIntensity: 0.9 } });
        let openHits = 0;
        let timekeepingHits = 0;

        performance.forEach((bar) =>
            bar.forEach((step) => {
                const hat =
                    step.instruments.HiHat || step.instruments.Open || step.instruments.Ride;
                if (!hat) {
                    return;
                }
                timekeepingHits++;
                if (hat.sound === 'Open') {
                    openHits++;
                }
            }),
        );

        const openRatio = openHits / (timekeepingHits || 1);
        console.log(
            `[Rock Cymbal Focus] Open-hat ratio: ${(openRatio * 100).toFixed(1)}% (Target: <25%)`,
        );
        expect(openRatio).toBeLessThan(0.25);
    });
});
