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

describe('Reggae Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Reggae',
                lastDrumPreset: 'Reggae',
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
                    isPulseStart: info.isPulseStart,
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                    beatIndex: info.beatIndex,
                };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                    const params = {
                        step: bar * 16 + step,
                        inst: { name: instName, muted: false, steps: [] },
                        stepVal: 0,
                        playback: mockState.playback,
                        groove: mockState.groove,
                        isDownbeat: info.isMeasureStart,
                        isPulseStart: info.isPulseStart,
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

    it('should implement "One Drop" feel at low intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.3 } });

        let kickOnDownbeat = 0;
        let kickOnBackbeat = 0;
        let snareOnBackbeat = 0;
        let backbeatCount = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.isBackbeat && stepData.isBeatStart) {
                    backbeatCount++;
                    if (stepData.instruments.Kick) {
                        kickOnBackbeat++;
                    }
                    if (stepData.instruments.Snare) {
                        snareOnBackbeat++;
                    }
                } else if (stepData.isDownbeat) {
                    if (stepData.instruments.Kick) {
                        kickOnDownbeat++;
                    }
                }
            });
        });

        console.log(
            `[Reggae Critique] Kick on Downbeat: ${kickOnDownbeat}, Kick/Snare on Backbeat: ${kickOnBackbeat}/${snareOnBackbeat}`,
        );

        // One Drop: No kick on 1, Kick and Snare TOGETHER on backbeat
        expect(kickOnDownbeat).toBe(0);
        expect(kickOnBackbeat).toBe(backbeatCount);
        expect(snareOnBackbeat).toBe(backbeatCount);
    });

    it('should preserve One Drop beat-1 silence at intensity 0.5 (entropy floor)', () => {
        // why: drums.md P0 #2 / epic-drums-idiom S3 — at intensity 0.5 the
        // entropy phase used to sprinkle ~4% phantom snare hits, including on
        // beat 1 (the One Drop "hole"). The S3 floor `suppressEntropyBelow: 0.5`
        // in reggae.ts gates the entire entropy block off at and below 0.5,
        // restoring the genre-defining beat-1 silence. Run 128 bars (the entropy
        // block is always engaged now, so it would fire if the floor didn't gate
        // it) then assert zero non-strategy snare hits on beat 1 (loopStep 0) and on the
        // "and of 1" (loopStep 2 — a common entropy landing site).
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.5, bpm: 90, songMode: false },
            groove: { genreFeel: 'Reggae', lastDrumPreset: 'Reggae' },
        });

        // why: target the snare lane specifically — no reggae motif (One Drop /
        // Steppers / Rockers / Dub) plays a strategy snare anywhere except the
        // backbeat (loopStep 4, 12) and an occasional Dub Sidestick on "and-of"
        // positions. Beat 1 (step 0) and the "and-of-1" (step 2) are positions
        // ONLY the entropy phase would touch. With the S3 floor active, the
        // entropy block is skipped entirely at intensity ≤ 0.5, so these
        // positions must stay clean. Kick lane isn't measurable this way
        // because Steppers/Rockers/Dub all play kick on beat 1 by design.
        let snareHitsBeat1 = 0;
        let snareHitsAndOf1 = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.loopStep === 0 && stepData.instruments.Snare) {
                    snareHitsBeat1++;
                }
                if (stepData.loopStep === 2 && stepData.instruments.Snare) {
                    snareHitsAndOf1++;
                }
            });
        });

        console.log(
            `[Reggae One Drop Silence @ 0.5] Snare on beat-1: ${snareHitsBeat1}, ` +
                `Snare on "and-of-1": ${snareHitsAndOf1}`,
        );

        // No reggae strategy plays snare on beat 1 or "and-of-1" — these
        // positions are entropy-only landing sites. Entropy gate must zero them.
        expect(snareHitsBeat1).toBe(0);
        expect(snareHitsAndOf1).toBe(0);
    });

    it('should lock HiHat/Open to the grid (lay-back applies only to Kick/Snare)', () => {
        // why: drums.md P1 #10 / epic-drums-idiom S3 — Reggae's lay-back
        // (`instTimeOffset += 0.008 + intensity * 0.005`) used to apply to
        // ALL lanes, dragging the hat back with the kick/snare and erasing the
        // "drummer pushing the backbeat against a metronomic hat" tension that
        // defines the One Drop feel. S3 scopes the offset to Kick/Snare only.
        const performance = simulatePerformance(8, {
            playback: { bandIntensity: 0.7, bpm: 90, songMode: false },
        });

        const offsets: Record<string, number[]> = { Kick: [], Snare: [], HiHat: [], Open: [] };
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                for (const [lane, hit] of Object.entries(stepData.instruments)) {
                    if (offsets[lane]) {
                        offsets[lane].push((hit as { offset: number }).offset ?? 0);
                    }
                }
            });
        });

        console.log(
            `[Reggae Lay-back Scope] Kick offsets sample: ${offsets.Kick.slice(0, 3)
                .map((o) => o.toFixed(4))
                .join(', ')}, ` +
                `HiHat offsets sample: ${offsets.HiHat.slice(0, 3)
                    .map((o) => o.toFixed(4))
                    .join(', ')}`,
        );

        // HiHat / Open: every hit must have offset 0 (no lay-back applied).
        for (const o of offsets.HiHat) {
            expect(o).toBe(0);
        }
        for (const o of offsets.Open) {
            expect(o).toBe(0);
        }
        // Kick / Snare: every hit must have a positive offset (lay-back applied).
        // At intensity 0.7 the offset is 0.008 + 0.7*0.005 = 0.0115.
        for (const o of offsets.Kick) {
            expect(o).toBeGreaterThan(0);
        }
        for (const o of offsets.Snare) {
            expect(o).toBeGreaterThan(0);
        }
    });

    it('should drive the kick on most pulses across high-intensity motif rotation', () => {
        // At high intensity the reggae motif selector rotates through all four
        // patterns based on per-bar sectionSeed (reggae.ts getMotif):
        //   Steppers (~50%) and Rockers (~25%) both hit every pulse
        //   Dub (~15%) hits beat 1 only on pulse positions
        //   One Drop (~10%) hits only the backbeat pulses
        // So we expect a majority of bars to have full pulse coverage, not all of them.
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.9 } });

        let totalKickPulses = 0;
        let totalPulses = 0;
        let fullCoverageBars = 0; // bars where every pulse has a kick (Steppers / Rockers)

        performance.forEach((bar) => {
            let pulsesInBar = 0;
            let kicksOnPulseInBar = 0;
            bar.forEach((stepData) => {
                if (stepData.isPulseStart) {
                    pulsesInBar++;
                    totalPulses++;
                    if (stepData.instruments.Kick) {
                        kicksOnPulseInBar++;
                        totalKickPulses++;
                    }
                }
            });
            if (pulsesInBar > 0 && kicksOnPulseInBar === pulsesInBar) {
                fullCoverageBars++;
            }
        });

        const overallDensity = totalKickPulses / totalPulses;
        const fullCoverageRatio = fullCoverageBars / performance.length;

        console.log(
            `[Reggae Critique] Pulse kick density: ${(overallDensity * 100).toFixed(1)}%, ` +
                `full-coverage bars: ${fullCoverageBars}/${performance.length}`,
        );

        // Most bars (Steppers + Rockers ≈ 75% by distribution) should drive every pulse.
        // Allow margin for 16-bar sampling variance and the One Drop / Dub minority.
        expect(fullCoverageRatio).toBeGreaterThan(0.6);
        // Overall pulse-kick density should be well above One Drop alone (50%).
        expect(overallDensity).toBeGreaterThan(0.75);
    });
});
