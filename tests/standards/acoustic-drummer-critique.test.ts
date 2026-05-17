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

describe('Acoustic Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Acoustic',
                creativity: true,
                lastDrumPreset: 'Acoustic',
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

    it('should pass an authenticity critique for a 128-bar Acoustic performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
            groove: { creativity: true, genreFeel: 'Acoustic' },
        });

        let kickOnOne = 0;
        let _snareActive = 0;
        let highIntensitySnareSound = 0;
        let constantHats = 0;
        const totalBars = performance.length;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                // --- CRITIQUE: Kick on 1 (step 0) ---
                if (s === 0 && stepData.instruments.Kick) {
                    kickOnOne++;
                }

                // --- CRITIQUE: Snare/Sidestick Presence ---
                if (stepData.instruments.Snare) {
                    _snareActive++;
                    if (s % 4 === 0) {
                        if (stepData.instruments.Snare.sound === 'Snare') {
                            highIntensitySnareSound++;
                        }
                    }
                }

                // --- CRITIQUE: Constant Hats (Shaker feel) ---
                if (stepData.instruments.HiHat) {
                    constantHats++;
                }
            });
        });

        const kickScore = kickOnOne / totalBars;

        // Count how many snare hits occurred on main beats (quarter notes)
        let mainSnareHits = 0;
        performance.forEach((bar) => {
            bar.forEach((s) => {
                if (s.loopStep % 4 === 0 && s.instruments.Snare) {
                    mainSnareHits++;
                }
            });
        });

        const snareSoundScore = highIntensitySnareSound / (mainSnareHits || 1);
        const hatDensity = constantHats / (totalBars * 16);

        console.log('\n--- ACOUSTIC DRUMMER CRITIQUE REPORT ---');
        console.log(`[Kick Solidity]         ${(kickScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(
            `[High Intensity Snare]  ${(snareSoundScore * 100).toFixed(1)}% (Target: 100% at 0.75 intensity)`,
        );
        console.log(`[HiHat/Shaker Density]  ${(hatDensity * 100).toFixed(1)}% (Target: 100%)`);
        console.log('------------------------------------\n');

        expect(kickScore).toBe(1.0);
        expect(snareSoundScore).toBe(1.0);
        expect(hatDensity).toBe(1.0);
    });

    it('should use Sidestick sound at low intensity', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.3 } });

        let sidestickHits = 0;
        let snareHits = 0;

        performance.forEach((bar) =>
            bar.forEach((step) => {
                if (step.instruments.Snare) {
                    if (step.instruments.Snare.sound === 'Sidestick') {
                        sidestickHits++;
                    }
                    if (step.instruments.Snare.sound === 'Snare') {
                        snareHits++;
                    }
                }
            }),
        );

        console.log(
            `[Acoustic Dynamics] Low Intensity: ${sidestickHits} Sidesticks, ${snareHits} Snares (Target: Sidesticks >25, Snares 0)`,
        );
        // Engine routes snare → Sidestick when intensity < 0.75 (acoustic.ts:50).
        // Motif distribution at intensity 0.3 averages ~1.4 snare events/bar.
        // Over 32 bars expect ~40 Sidesticks; threshold 25 keeps statistical headroom.
        expect(sidestickHits).toBeGreaterThan(25);
        expect(snareHits).toBe(0);
    });

    it('should lock backbeat snare at intensity 0.75 with motif >= 1', () => {
        // At intensity 0.75 the binaryTier still applies (intensity < 0.65 is false →
        // second tier picks dominate). Motif 1+ fires snare on beats 2 and 4. Run
        // enough bars to wash out motif-0 seed-paths and measure backbeat coverage
        // across all motifs.
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
        });
        let backbeatHits = 0;
        let motif0Bars = 0;
        performance.forEach((bar) => {
            let hadBackbeat = false;
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                if ((s === 4 || s === 12) && stepData.instruments.Snare) {
                    backbeatHits++;
                    hadBackbeat = true;
                }
            });
            if (!hadBackbeat) {
                motif0Bars++;
            }
        });
        const backbeatScore = backbeatHits / (numBars * 2);
        console.log(
            `[Acoustic Backbeat] ${(backbeatScore * 100).toFixed(1)}% (motif-0 'half-time' bars: ${motif0Bars})`,
        );
        // Motif 0 (Minimal) fires snare on beat 3 only; motif 1+ fires on backbeats.
        // Engine picks motif 0 when seed < 0.2 → ~20% of bars. Floor at 75% catches
        // the lane firing while still allowing the half-time motif to exist.
        expect(backbeatScore).toBeGreaterThan(0.7);
    });

    it('should fire snare on beat 3 only for half-time motif 0', () => {
        // Motif 0 is the half-time pattern: snare on beat 3 (step 8) only, NOT on
        // beats 2 (step 4) and 4 (step 12). At intensity 0.5, binaryTier(0.65, 0.6)
        // returns the first tier (intensity < 0.65), and the first tier's breakpoint
        // is 0.6 — so motif 0 fires when sectionSeed < 0.6, roughly 60% of bars.
        // Audit finding: drums.md P1 #12 (acoustic motif 0 renamed to "Half-time").
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.5 },
        });

        let halfTimeBars = 0;
        performance.forEach((bar) => {
            let hasBeat3 = false;
            let hasBackbeat = false;
            bar.forEach((stepData) => {
                if (!stepData.instruments.Snare) {
                    return;
                }
                if (stepData.loopStep === 8) {
                    hasBeat3 = true;
                }
                if (stepData.loopStep === 4 || stepData.loopStep === 12) {
                    hasBackbeat = true;
                }
            });
            if (hasBeat3 && !hasBackbeat) {
                halfTimeBars++;
            }
        });

        console.log(
            `[Acoustic Half-time Motif 0] half-time bars (beat-3 hit, no backbeat): ${halfTimeBars}/${numBars}`,
        );
        // Motif 0 selected when sectionSeed < 0.6 at intensity 0.5 → ~60% of bars.
        // Each motif-0 bar emits exactly one half-time pattern (beat 3 snare, no
        // backbeat snare). Expected ~76 half-time bars over 128. Floor at 8 keeps
        // generous statistical headroom while still proving the pattern fires.
        expect(halfTimeBars).toBeGreaterThan(8);
    });

    it('should add kick syncopation above intensity 0.5', () => {
        // Engine: kick syncopation gate at `intensity > 0.5 && isOffbeat && beatIndex
        // === 1 || 3` with roll(0.4, intensity). Below 0.5 no syncopated kicks.
        const lowPerf = simulatePerformance(64, { playback: { bandIntensity: 0.4 } });
        const highPerf = simulatePerformance(64, { playback: { bandIntensity: 0.95 } });

        const syncopatedKicks = (perf) => {
            let h = 0;
            perf.forEach((b) =>
                b.forEach((stepData) => {
                    if (
                        stepData.instruments.Kick &&
                        (stepData.loopStep === 6 || stepData.loopStep === 14)
                    ) {
                        h++;
                    }
                }),
            );
            return h;
        };
        const lowSync = syncopatedKicks(lowPerf);
        const highSync = syncopatedKicks(highPerf);
        console.log(`[Acoustic Kick Syncopation] 0.4=${lowSync} → 0.95=${highSync}`);
        // Low gate (0.4) is below the 0.5 threshold so engine fires 0 syncopated
        // kicks. High intensity expects ~40-50% of the 128 possible offbeat positions
        // (roll(0.4, 0.95) ≈ 0.38 prob). Threshold > 30 catches the lane firing.
        expect(lowSync).toBe(0);
        expect(highSync).toBeGreaterThan(30);
    });
});
