// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { sectionSweepArranger } from '../utils/groove-seed.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Hip Hop Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Hip Hop',
                lastDrumPreset: 'Hip Hop',
                instruments: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            // #791: section seeds are now sticky per (sectionId, songSeed). An
            // empty arranger collapses the whole run to ONE motif; the sweep
            // arranger restores the per-bar motif spread the burst/authenticity
            // metrics sample (one deterministic section per bar).
            arranger: sectionSweepArranger(numBars),
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

    it('should pass an authenticity critique for a 128-bar Hip Hop performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.8 },
            groove: { genreFeel: 'Hip Hop' },
        });

        let backbeatHits = 0;
        let _kickHits = 0;
        let syncopatedKickHits = 0;
        let hiHatHits = 0;
        const totalBars = performance.length;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                if (s === 4 || s === 12) {
                    if (stepData.instruments.Snare) {
                        backbeatHits++;
                    }
                }

                if (stepData.instruments.Kick) {
                    _kickHits++;
                    if (s !== 0 && s !== 8) {
                        syncopatedKickHits++;
                    }
                }

                if (stepData.instruments.HiHat) {
                    hiHatHits++;
                }
            });
        });

        const backbeatScore = backbeatHits / (totalBars * 2);
        const syncopatedKickRatio = syncopatedKickHits / totalBars;
        const hiHatDensity = hiHatHits / totalBars;

        console.log('\n--- HIP HOP DRUMMER CRITIQUE REPORT ---');
        console.log(`[Backbeat Consistency]  ${(backbeatScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(
            `[Kick Syncopation]      ${syncopatedKickRatio.toFixed(2)} hits/bar (Target: >1.5)`,
        );
        console.log(`[HiHat Density]         ${hiHatDensity.toFixed(2)} hits/bar (Target: >10.0)`);
        console.log('---------------------------------------\n');

        // CRITICAL: Snare lands on beats 2 and 4 every bar — the genre's spine.
        // Engine delivers 100%; threshold pinned at 0.99 so a single missed
        // backbeat would fail.
        expect(backbeatScore).toBeGreaterThan(0.99);

        // MUSICAL: Hip hop kicks anchor beats 1/3 and weave around the rest.
        // Engine delivers ~2.3 syncopated kicks/bar at intensity 0.8 (trap
        // motif); 1.5 is the floor that still requires the engine to do more
        // than just kick on the anchors.
        expect(syncopatedKickRatio).toBeGreaterThan(1.5);

        // MUSICAL: Hi-hats are the engine of hip hop. Engine delivers ~15/bar
        // (near-continuous 16ths in trap mode at intensity 0.8). Threshold
        // pinned at 10/bar so the engine still has to drive eighth-or-faster
        // motion — boom-bap eighths (8/bar) would fail, but that's correct:
        // the test runs at high intensity where dense hihat is the claim.
        expect(hiHatDensity).toBeGreaterThan(10.0);
    });

    it('motif-2 trap-roll burst: monotonic velocity ramp on one beat per bar, minority of bars', () => {
        // drums.md P1 #8: motif 2 is labeled "Trap Skitter (Hi-hat rolls)"
        // but old code only ever added a single extra 16th via skitterHit.
        // New gesture: when activeMotif >= 2 AND rollPhraseSeed > 0.7, fire
        // HiHat on ALL 4 16ths of one chosen beat with a MONOTONICALLY
        // INCREASING velocity ramp (0.55 → 0.6 → 0.7 → 0.85) — the "rush"
        // toward the next downbeat. The base motif-≥1 hat pattern also
        // hits all 4 16ths per beat but uses a TIERED velocity profile
        // (0.84/0.42/0.64/0.42) — NOT monotonic. So the burst signature is
        // the strict velocity ramp, not the hit count.
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.85 },
            groove: { genreFeel: 'Hip Hop' },
        });

        const RAMP_EPSILON = 0.01; // velocity ramp tolerance for scaleVelocity adjustments
        let burstBars = 0;
        let burstBeats = 0;
        let burstsOnBeatZero = 0;
        let openHitsOnBurstBeat = 0;
        const burstFinalVelocities = [];
        const burstStartVelocities = [];
        performance.forEach((bar) => {
            const velPerStepInBeat = [
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
            ];
            const openHitsPerBeat = [0, 0, 0, 0];
            bar.forEach((stepData) => {
                const hit = stepData.instruments.HiHat;
                const beat = Math.floor(stepData.loopStep / 4);
                if (hit) {
                    const slot = stepData.loopStep % 4;
                    velPerStepInBeat[beat][slot] = hit.velocity;
                }
                if (stepData.instruments.Open) {
                    openHitsPerBeat[beat]++;
                }
            });
            let barHasBurst = false;
            velPerStepInBeat.forEach((slots, beat) => {
                // All 4 16ths fired AND strictly increasing velocity =
                // burst signature.
                if (slots.every((v) => v !== null)) {
                    const ramping =
                        slots[1] > slots[0] + RAMP_EPSILON &&
                        slots[2] > slots[1] + RAMP_EPSILON &&
                        slots[3] > slots[2] + RAMP_EPSILON;
                    if (ramping) {
                        barHasBurst = true;
                        burstBeats++;
                        if (beat === 0) {
                            burstsOnBeatZero++;
                        }
                        // Positive guard: an Open hit on the burst beat
                        // would punch through the ramp peak and break the
                        // roll character (drums.md P1 #8 review found this
                        // collision silently passing the prior burst test).
                        openHitsOnBurstBeat += openHitsPerBeat[beat];
                        burstStartVelocities.push(slots[0]);
                        burstFinalVelocities.push(slots[3]);
                    }
                }
            });
            if (barHasBurst) {
                burstBars++;
            }
        });

        console.log('\n--- HIP HOP TRAP-ROLL BURST CRITIQUE ---');
        console.log(`[Bars w/ burst]         ${burstBars}/${numBars}`);
        console.log(`[Total burst beats]     ${burstBeats}`);
        console.log(`[Bursts on beat 0]      ${burstsOnBeatZero} (must be 0)`);
        console.log(`[Open hits on burst]    ${openHitsOnBurstBeat} (must be 0)`);
        if (burstFinalVelocities.length > 0) {
            const avgStart =
                burstStartVelocities.reduce((a, b) => a + b, 0) / burstStartVelocities.length;
            const avgFinal =
                burstFinalVelocities.reduce((a, b) => a + b, 0) / burstFinalVelocities.length;
            console.log(`[Avg start vel]         ${avgStart.toFixed(3)}`);
            console.log(`[Avg final vel]         ${avgFinal.toFixed(3)}`);
        }
        console.log('-----------------------------------------\n');

        // CRITICAL: bursts must actually happen. At intensity 0.85 with
        // creativity:true, motif >= 2 fires for ~70% of bars; of those
        // rollPhraseSeed > 0.7 → ~30%. Expected ~30 burst bars per 128.
        // 20-run empirical min (2026-05-28): 26 bars (deterministic engine,
        // same seed each run). Floor set to 18 with an 8-bar statistical
        // cushion below the observed minimum (~31% headroom).
        expect(burstBars).toBeGreaterThanOrEqual(18);

        // CRITICAL: bursts must be a MINORITY — they're a bar-level accent,
        // not every-bar wallpaper. Engine gates on phraseSeed > 0.7 so
        // expected ratio is ~30%. Threshold pinned at 60% to catch a
        // regression where the gate is removed or inverted.
        expect(burstBars / numBars).toBeLessThan(0.6);

        // CRITICAL: bursts must never land on beat 0 — the kick on the One
        // is sacred (drums.md P1 #8 fix sketch). Engine picks from {1, 2, 3}.
        expect(burstsOnBeatZero).toBe(0);

        // CRITICAL: no Open-hat hits on a burst beat. The trap-roll IS the
        // gesture on that beat — an Open release mid-burst at vel ~1.02
        // punches through the ramp peak and converts "tk-tk-tk-TK" into
        // open-splash-mid-bar, a different idiom. The original burst test
        // missed this because Open-converted slots silently dropped the
        // burst from the count rather than failing it (reviewer P0).
        expect(openHitsOnBurstBeat).toBe(0);

        // CRITICAL: the burst "rushes" toward the next downbeat — the final
        // "a" velocity must average noticeably louder than the start. Engine
        // ramps 0.55 → 0.85 (raw) then scaleVelocity bumps it ~0.025. The
        // final velocity should sit ~0.3 above the start.
        if (burstFinalVelocities.length > 0) {
            const avgStart =
                burstStartVelocities.reduce((a, b) => a + b, 0) / burstStartVelocities.length;
            const avgFinal =
                burstFinalVelocities.reduce((a, b) => a + b, 0) / burstFinalVelocities.length;
            expect(avgFinal - avgStart).toBeGreaterThan(0.15);
        }

        // CRITICAL: non-burst bars still have a dense hat pattern (the
        // existing motif-≥1 16th grid). Bars without a burst should still
        // average > 10 HiHat hits — the genre claim from the main test.
        let nonBurstHits = 0;
        let nonBurstBars = 0;
        performance.forEach((bar) => {
            const velPerBeat = [
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
                [null, null, null, null],
            ];
            let barHits = 0;
            bar.forEach((stepData) => {
                const hit = stepData.instruments.HiHat;
                if (hit) {
                    barHits++;
                    const beat = Math.floor(stepData.loopStep / 4);
                    velPerBeat[beat][stepData.loopStep % 4] = hit.velocity;
                }
            });
            const hasBurst = velPerBeat.some(
                (slots) =>
                    slots.every((v) => v !== null) &&
                    slots[1] > slots[0] + RAMP_EPSILON &&
                    slots[2] > slots[1] + RAMP_EPSILON &&
                    slots[3] > slots[2] + RAMP_EPSILON,
            );
            if (!hasBurst) {
                nonBurstHits += barHits;
                nonBurstBars++;
            }
        });
        const nonBurstDensity = nonBurstHits / Math.max(1, nonBurstBars);
        console.log(
            `[Non-burst HiHat dens.] ${nonBurstDensity.toFixed(2)} hits/bar (Target: > 10.0)`,
        );
        expect(nonBurstDensity).toBeGreaterThan(10.0);
    });
});
