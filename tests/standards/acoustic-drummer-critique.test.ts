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

    // --- Compound-meter coverage — epic-2 S8 ---
    // The harness above is hardcoded 16-step 4/4 with a partial param set; this one
    // drives a true compound bar through full getStepInfo so the compound* filters and
    // isPulseStart/isCompound/groupIndex predicates are live. Acoustic's idiomatic
    // meters are 4/4 + 3/4 — compound is off-idiom, so the bar is "groove, don't break".
    const simulateCompound = (tsKey, numBars, intensityValue) => {
        const ts = TIME_SIGNATURES[tsKey];
        const STEPS = ts.grouping.reduce((a, b) => a + b, 0) * ts.stepsPerBeat;
        const mockState = {
            playback: { bandIntensity: intensityValue, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Acoustic',
                creativity: true,
                lastDrumPreset: 'Acoustic',
                instruments: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        };
        getState.mockReturnValue(mockState);

        const history = [];
        for (let bar = 0; bar < numBars; bar++) {
            const barSteps = [];
            for (let step = 0; step < STEPS; step++) {
                const abs = bar * STEPS + step;
                const info = getStepInfo(abs, ts, [], TIME_SIGNATURES);
                const stepData = { mStep: info.mStep, instruments: {} };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                    const params = {
                        step: abs,
                        inst: { name: instName, muted: false, steps: [] },
                        stepVal: 0,
                        playback: mockState.playback,
                        groove: mockState.groove,
                        isDownbeat: info.isDownbeat,
                        isBeatStart: info.isBeatStart,
                        isBackbeat: info.isBackbeat,
                        isGroupStart: info.isGroupStart,
                        isPulse: info.isPulse,
                        isPulseStart: info.isPulseStart,
                        isCompound: info.isCompound,
                        isOffbeat: info.isOffbeat,
                        isEOfBeat: info.isEOfBeat,
                        isAOfBeat: info.isAOfBeat,
                        beatIndex: info.beatIndex,
                        groupIndex: info.groupIndex,
                        stepInGroup: info.stepInGroup,
                        tsConfig: info.tsConfig,
                    };
                    const result = applyGrooveOverrides(getState(), params);
                    if (result.shouldPlay) {
                        stepData.instruments[instName] = { velocity: result.velocity };
                    }
                }
                barSteps.push(stepData);
            }
            history.push(barSteps);
        }
        return history;
    };

    const kickHitsAtMStep = (perf, mStep) =>
        perf.filter((bar) => bar.some((s) => s.mStep === mStep && s.instruments.Kick)).length;

    it('should place the "beat 3 presence" kick on the felt secondary pulse in compound meters', () => {
        // Regression guard for epic-2 S8: the old kick keyed "beat 3 presence" on
        // beatIndex===2, which is mStep 4 in compound (a mid-group weak position) — not
        // a dotted-quarter pulse. compoundKickAllowed can DROP but not ADD, so the
        // secondary pulse would have been silent. The meter-relative isSecondStrongBeat
        // moves it to the middle group's pulse (mStep 6 in 6/8, mStep 12 in 12/8).
        // Assert by POSITION: the presence kick lands on the felt pulse, and the old
        // mis-map position (mStep 4) gets NO kick. High intensity (0.95) selects motif
        // >=1 on ~80% of bars (the tiers that carry the presence kick).
        const cases = [
            { ts: '6/8', secondary: 6 },
            { ts: '12/8', secondary: 12 },
        ];
        for (const { ts, secondary } of cases) {
            const numBars = 64;
            const perf = simulateCompound(ts, numBars, 0.95);
            const foundation = kickHitsAtMStep(perf, 0); // beat 1, every bar
            const secondaryHits = kickHitsAtMStep(perf, secondary); // motif >=1 presence
            const misMap = kickHitsAtMStep(perf, 4); // old beatIndex===2 position
            console.log(
                `[Acoustic ${ts} @0.95] foundation(m0): ${foundation}/${numBars}, secondary(m${secondary}): ${secondaryHits}/${numBars}, old-mis-map(m4): ${misMap}/${numBars}`,
            );
            expect(foundation).toBe(numBars); // downbeat anchored every bar
            expect(secondaryHits).toBeGreaterThan(numBars * 0.5); // presence on the felt pulse
            expect(misMap).toBe(0); // the 4/4 mis-map position never fires in compound
        }
    });

    it('should keep the compound kick sparse (acoustic restraint, not over-dense)', () => {
        // compoundKickAllowed trims the syncopation roll (mid-group weak steps) so the
        // compound kick stays to the foundation + the single secondary pulse — at most
        // ~2/bar. Guards against an over-dense kick in the off-idiom meter.
        for (const ts of ['6/8', '12/8']) {
            const perf = simulateCompound(ts, 64, 0.95);
            const total = perf.reduce(
                (sum, bar) => sum + bar.filter((s) => s.instruments.Kick).length,
                0,
            );
            const perBar = total / perf.length;
            console.log(`[Acoustic ${ts} kick density @0.95] ${perBar.toFixed(2)}/bar`);
            expect(perBar).toBeLessThanOrEqual(2.5);
        }
    });

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

    it('should preserve quiet-section silence at intensity 0.4 (entropy floor)', () => {
        // why: drums.md P0 #2 / epic-drums-idiom S3 — acoustic ballad quiet
        // sections should breathe without random snare/hat sprinkles. S3 adds
        // `suppressEntropyBelow: 0.5` on acoustic.config; at intensity 0.4
        // the entropy block is fully off. The acoustic snare strategy plays
        // only on beat-start positions (motif 0: beat 3 / step 8; other motifs:
        // beats 2+4 / steps 4+12). Any snare hit on a non-beat-start position
        // (i.e. loopStep % 4 !== 0) at intensity 0.4 would prove entropy is
        // still firing. Additionally the strategy's "ghost chatter" branch
        // gates on `intensity > 0.7`, so at 0.4 it's inactive — no strategy
        // snare on odd/"&" positions.
        const numBars = 64;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.4, bpm: 90, songMode: false },
        });

        let nonStrategySnareHits = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.loopStep % 4 !== 0 && stepData.instruments.Snare) {
                    nonStrategySnareHits++;
                }
            });
        });

        console.log(
            `[Acoustic Silence @ 0.4] Snare hits on non-beat-start steps: ` +
                `${nonStrategySnareHits} (Target: 0 — entropy gate off below 0.5)`,
        );
        expect(nonStrategySnareHits).toBe(0);
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
