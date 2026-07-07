// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { DRUM_PRESETS } from '../../public/data/drum-presets.js';
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

    it('should implement a true "One Drop" at low intensity (kick + rim on beat 3 only)', () => {
        // A true One Drop drops beats 1, 2 & 4 entirely and lands a single kick+rim
        // unison on beat 3 (step 8) — the genre-defining "drop". (#794, replacing the
        // old assertion that One Drop was a kick+snare backbeat on 2 & 4.)
        const numBars = 16;
        const performance = simulatePerformance(numBars, { playback: { bandIntensity: 0.3 } });

        let kickOnDownbeat = 0; // beat 1 (step 0) — the "hole"
        let kickOnBackbeat = 0; // beats 2 & 4 — must be empty
        let snareOnBackbeat = 0;
        let kickOnBeat3 = 0; // step 8 — the drop
        let rimOnBeat3 = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.isDownbeat && stepData.instruments.Kick) {
                    kickOnDownbeat++;
                }
                if (stepData.isBackbeat && stepData.isBeatStart) {
                    if (stepData.instruments.Kick) {
                        kickOnBackbeat++;
                    }
                    if (stepData.instruments.Snare || stepData.instruments.Sidestick) {
                        snareOnBackbeat++;
                    }
                }
                if (stepData.loopStep === 8) {
                    if (stepData.instruments.Kick) {
                        kickOnBeat3++;
                    }
                    // The rim is a cross-stick (Sidestick); Snare guards a louder variant.
                    if (stepData.instruments.Sidestick || stepData.instruments.Snare) {
                        rimOnBeat3++;
                    }
                }
            });
        });

        console.log(
            `[Reggae One Drop] beat-1 kicks: ${kickOnDownbeat}, 2&4 kick/snare: ${kickOnBackbeat}/${snareOnBackbeat}, ` +
                `beat-3 kick/rim: ${kickOnBeat3}/${rimOnBeat3} over ${numBars} bars`,
        );

        // Beats 1, 2 & 4 carry no kick/snare; a single kick+rim unison on beat 3 every bar.
        expect(kickOnDownbeat).toBe(0);
        expect(kickOnBackbeat).toBe(0);
        expect(snareOnBackbeat).toBe(0);
        expect(kickOnBeat3).toBe(numBars);
        expect(rimOnBeat3).toBe(numBars);
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

    it('should layer sparse hand percussion clear of the one-drop backbeat (#1007)', () => {
        // #1007: preset-data aux-percussion spread (Epic 7 S5 pattern). Reggae
        // gets a shaker on the 8th offbeats plus two syncopated conga colors,
        // ALL kept off the one-drop (step 8) so the drop still lands naked. The
        // reggae strategy leaves both lanes untouched, so they replay literally.
        const shakerLane = DRUM_PRESETS.Reggae.Shaker;
        const congaLane = DRUM_PRESETS.Reggae.Conga;
        // Presence: both aux lanes must exist in the preset data now.
        expect(Array.isArray(shakerLane)).toBe(true);
        expect(Array.isArray(congaLane)).toBe(true);
        expect(shakerLane.some((v: number) => v > 0)).toBe(true);
        expect(congaLane.some((v: number) => v > 0)).toBe(true);

        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: { genreFeel: 'Reggae', lastDrumPreset: 'Reggae', instruments: [] },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        };
        getState.mockReturnValue(mockState);

        const numBars = 32;
        const runLane = (name: string, lane: number[]) => {
            let hits = 0;
            let onDrop = 0; // step 8 — the one-drop backbeat
            let velSum = 0;
            const positions = new Set<number>();
            for (let bar = 0; bar < numBars; bar++) {
                for (let step = 0; step < 16; step++) {
                    const info = getStepInfo(
                        bar * 16 + step,
                        TIME_SIGNATURES['4/4'],
                        [],
                        TIME_SIGNATURES,
                    );
                    const result = applyGrooveOverrides(getState(), {
                        step: bar * 16 + step,
                        inst: { name, muted: false, steps: lane },
                        stepVal: lane[step],
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
                        loopStep: step,
                        stepsPerBar: 16,
                    });
                    if (result.shouldPlay) {
                        hits++;
                        velSum += result.velocity;
                        positions.add(step);
                        if (step === 8) {
                            onDrop++;
                        }
                    }
                }
            }
            return {
                hits,
                onDrop,
                avgVel: velSum / (hits || 1),
                positions: [...positions].sort((a, b) => a - b),
            };
        };

        const shaker = runLane('Shaker', shakerLane);
        const conga = runLane('Conga', congaLane);
        console.log('\n--- REGGAE AUX-PERCUSSION CRITIQUE (#1007) ---');
        console.log(
            `[Shaker] ${(shaker.hits / numBars).toFixed(2)}/bar, pos [${shaker.positions}], onDrop ${shaker.onDrop}, vel ${shaker.avgVel.toFixed(3)}`,
        );
        console.log(
            `[Conga]  ${(conga.hits / numBars).toFixed(2)}/bar, pos [${conga.positions}], onDrop ${conga.onDrop}, vel ${conga.avgVel.toFixed(3)}`,
        );
        console.log('----------------------------------------------\n');

        // Shaker: sparse 8th-offbeat "chick" — ~4/bar. Floor 3 (dead lane = 0),
        // ceiling 5 rules out a runaway.
        expect(shaker.hits / numBars).toBeGreaterThan(3);
        expect(shaker.hits / numBars).toBeLessThanOrEqual(5);
        // Conga: two syncopated color hits per bar — ~2/bar.
        expect(conga.hits / numBars).toBeGreaterThan(1);
        expect(conga.hits / numBars).toBeLessThanOrEqual(3);
        // Idiom (the whole point): NEITHER lane touches the one-drop at step 8,
        // so the genre-defining drop stays exposed.
        expect(shaker.onDrop).toBe(0);
        expect(conga.onDrop).toBe(0);
        // Pin the exact subdivision each lane claims (guard the test name, not just
        // "off the drop"): Shaker on the 8th offbeats ("&"), Conga on the "a" of
        // beats 1 & 3 (4th sixteenth). A wrong-offbeat lane would pass onDrop=0.
        expect(shaker.positions).toEqual([2, 6, 10, 14]);
        expect(conga.positions).toEqual([3, 11]);
        // Sits under the kit: ghost-level velocity on both lanes.
        expect(shaker.avgVel).toBeLessThan(1.0);
        expect(conga.avgVel).toBeLessThan(1.0);
    });
});
