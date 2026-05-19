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

describe('Metal Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 140, songMode: false },
            groove: {
                genreFeel: 'Metal',
                creativity: true,
                lastDrumPreset: 'Metal (Speed)',
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
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open', 'Crash']) {
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
                        isTurnaround: false,
                        stepsPerBar: 16,
                        loopStep: step,
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

    it('should implement high-speed Double Kick at maximum intensity', () => {
        const performance = simulatePerformance(64, { playback: { bandIntensity: 0.95 } });

        let kickHits = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.instruments.Kick) {
                    kickHits++;
                }
            });
        });

        const totalSteps = 64 * 16;
        const kickDensity = kickHits / totalSteps;
        console.log(
            `[Metal Critique] Kick Density at Max Intensity: ${(kickDensity * 100).toFixed(1)}% (Target: >55%)`,
        );

        // At intensity 0.95 the motif selector mixes motif 2 (gallop, ~75% kick coverage),
        // motif 3 (16ths, 100%), and motif 4 (blast — offbeat-eighths-only, 25%). Expected
        // weighted density ≈ 0.25*0.75 + 0.35*1.0 + 0.4*0.25 ≈ 63%. Threshold > 0.55 leaves
        // headroom across motif-4 share variance from the seeded picker over 64 bars.
        expect(kickDensity).toBeGreaterThan(0.55);
    });

    it('should ALTERNATE snare and kick on blast-beat bars (not co-articulate)', () => {
        // why: drums.md P1 #6 — real blast beats are kick-on-offbeat-eighth + snare-on-
        // downbeat-eighth ALTERNATION. The previous test counted bars where snare and kick
        // shared a step (co-articulation), which codified the unison bug. The genre-defining
        // buzz comes from alternation, so we assert disjointness on the blast-pattern bars.
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.95 },
            groove: { creativity: true, genreFeel: 'Metal' },
        });

        const DOWNBEAT_EIGHTHS = [0, 4, 8, 12];
        const OFFBEAT_EIGHTHS = [2, 6, 10, 14];

        // A blast-pattern bar: snare lands on >=3 of the downbeat eighths AND kick lands on
        // >=3 of the offbeat eighths. (Strict 4/4 would be ideal, but allow 1 missed slot
        // to absorb fill-overrides from the isTurnaround branch when it ever fires.)
        let blastBars = 0;
        let snareKickLocksOnBlast = 0; // co-articulation count on blast bars (should be ~0)
        let snareOnOffbeatOnBlast = 0; // wrong-half snare on blast bars (should be ~0)
        let kickOnDownbeatOnBlast = 0; // wrong-half kick on blast bars (should be ~0)
        let blastBarUnisonStepsTotal = 0;

        performance.forEach((bar) => {
            const snareOnDownEighths = DOWNBEAT_EIGHTHS.filter(
                (s) => bar[s]?.instruments.Snare,
            ).length;
            const kickOnOffEighths = OFFBEAT_EIGHTHS.filter((s) => bar[s]?.instruments.Kick).length;
            const isBlastBar = snareOnDownEighths >= 3 && kickOnOffEighths >= 3;
            if (!isBlastBar) {
                return;
            }
            blastBars++;
            bar.forEach((stepData) => {
                if (stepData.instruments.Snare && stepData.instruments.Kick) {
                    snareKickLocksOnBlast++;
                    blastBarUnisonStepsTotal++;
                }
                if (OFFBEAT_EIGHTHS.includes(stepData.loopStep) && stepData.instruments.Snare) {
                    snareOnOffbeatOnBlast++;
                }
                if (DOWNBEAT_EIGHTHS.includes(stepData.loopStep) && stepData.instruments.Kick) {
                    kickOnDownbeatOnBlast++;
                }
            });
        });

        const unisonRate = blastBars === 0 ? 0 : blastBarUnisonStepsTotal / (blastBars * 16);
        console.log(
            `[Metal Blast Alternation] ${blastBars}/128 bars detected as blast; unison rate ${(unisonRate * 100).toFixed(1)}% (target <5%); snare-on-offbeat ${snareOnOffbeatOnBlast} (target 0); kick-on-downbeat ${kickOnDownbeatOnBlast} (target 0)`,
        );

        // Over 128 seeded bars at intensity 0.95, motif 4 fires ~40% of the time
        // (picks: [[0.25,2],[0.6,3], 4]) so expected blast bars ≈ 51.
        expect(blastBars).toBeGreaterThan(30);
        // ALTERNATION: snare and kick must NOT share steps on blast bars.
        expect(snareKickLocksOnBlast).toBe(0);
        // Motif-4 snare fires ONLY on isBeatStart — not on isOffbeat.
        expect(snareOnOffbeatOnBlast).toBe(0);
        // Motif-4 kick fires ONLY on isOffbeat — not on isBeatStart.
        expect(kickOnDownbeatOnBlast).toBe(0);
    });

    it('should emit China at section downbeats at high intensity on Open lane only', () => {
        // why: drums.md P1 #6 — section-accent block at metal.ts used to write
        // soundName='Open' despite the "China/Crash" comment. After the fix it emits
        // 'China' on downbeats at intensity > 0.8, scoped to the Open lane only
        // (matches the post-turnaround Crash convention at groove-engine.ts:226).
        // The HiHat and Crash lanes keep their steady-state eighth-pulse voicing on
        // the downbeat — guards against the triple-stack regression that produced
        // three China hits choking each other via groove.lastCrashGain.
        const numBars = 32;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.9 },
        });

        let chinaOnOpen = 0;
        let chinaOnHiHat = 0;
        let chinaOnCrash = 0;
        performance.forEach((bar) => {
            const downbeat = bar[0];
            if (downbeat.instruments.Open?.sound === 'China') {
                chinaOnOpen++;
            }
            if (downbeat.instruments.HiHat?.sound === 'China') {
                chinaOnHiHat++;
            }
            if (downbeat.instruments.Crash?.sound === 'China') {
                chinaOnCrash++;
            }
        });

        console.log(
            `[Metal China Accent] Open=${chinaOnOpen}/${numBars} (target ${numBars}); HiHat=${chinaOnHiHat} (target 0); Crash=${chinaOnCrash} (target 0)`,
        );
        // Every downbeat at intensity 0.9 > 0.8 must emit China on the Open lane.
        expect(chinaOnOpen).toBe(numBars);
        // HiHat and Crash lanes must NOT carry China on downbeats — they keep the
        // steady-state Ride/Open/HiHat voicing from the eighth-pulse block above.
        expect(chinaOnHiHat).toBe(0);
        expect(chinaOnCrash).toBe(0);
    });

    it('should hold the backbeat at moderate intensity (non-blast motifs)', () => {
        // At intensity 0.6, motif selector lands on motif 1, 2, or 3 — none of which
        // override the backbeat. Engine fires snare on every step 4 / 12.
        const numBars = 64;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.6 },
        });

        let backbeatHits = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                if ((s === 4 || s === 12) && stepData.instruments.Snare) {
                    backbeatHits++;
                }
            });
        });

        const backbeatScore = backbeatHits / (numBars * 2);
        console.log(
            `[Metal Backbeat] ${(backbeatScore * 100).toFixed(1)}% at intensity 0.6 (Target: 100%)`,
        );
        expect(backbeatScore).toBe(1.0);
    });

    it('should ride eighth-pulse cymbals at high intensity', () => {
        // Engine fires HiHat/Open on every eighth (metal.ts:138). At intensity > 0.75
        // it switches to Ride/Open; at > 0.5 to Open; else HiHat. Density should be
        // ~100% of eighth positions regardless of timbre.
        const numBars = 32;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.9 },
        });
        let cymbalHits = 0;
        const eighthSteps = [0, 2, 4, 6, 8, 10, 12, 14];
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (eighthSteps.includes(stepData.loopStep)) {
                    if (stepData.instruments.HiHat || stepData.instruments.Open) {
                        cymbalHits++;
                    }
                }
            });
        });
        const cymbalScore = cymbalHits / (numBars * 8);
        console.log(
            `[Metal Cymbal Pulse] ${(cymbalScore * 100).toFixed(1)}% eighth coverage at intensity 0.9 (Target: >95%)`,
        );
        expect(cymbalScore).toBeGreaterThan(0.95);
    });

    it('should increase kick density monotonically with intensity', () => {
        // Phase 2 intensity-response check. Engine: motif selector escalates
        // 0 → 1 → 2 → 3 → 4 as intensity rises, each adding more kick hits.
        const lowPerf = simulatePerformance(64, { playback: { bandIntensity: 0.3 } });
        const midPerf = simulatePerformance(64, { playback: { bandIntensity: 0.6 } });
        const highPerf = simulatePerformance(64, { playback: { bandIntensity: 0.95 } });

        const kickCount = (perf) => {
            let h = 0;
            perf.forEach((b) => b.forEach((s) => s.instruments.Kick && h++));
            return h;
        };

        const lowK = kickCount(lowPerf);
        const midK = kickCount(midPerf);
        const highK = kickCount(highPerf);

        console.log(`[Metal Intensity] Kicks 0.3=${lowK} → 0.6=${midK} → 0.95=${highK}`);
        // Motif 0 fires kick on every beat + & of 3 (5/16). Motif 3/4 fire on all 16.
        // Expected ratio high/low ≈ 16/5 ≈ 3.2x. Conservative threshold 2x.
        expect(midK).toBeGreaterThan(lowK);
        expect(highK).toBeGreaterThan(midK);
        expect(highK).toBeGreaterThan(lowK * 2);
    });
});
