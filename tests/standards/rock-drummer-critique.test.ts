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

    // Hi-hat family: closed + the Epic 4 S3 in-between articulations
    // (quarter/half-open) + the foot-pedal chick + full open + ride. A
    // timekeeping-hat lookup must see all of them or it silently drops the
    // new articulations and under-counts the pulse.
    const hatFamilyHit = (instruments) =>
        instruments.HiHat ||
        instruments.HiHatQuarter ||
        instruments.HiHatHalf ||
        instruments.HiHatPedal ||
        instruments.Open ||
        instruments.Ride;

    it('should pass an authenticity critique for a 128-bar Rock performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
            groove: { genreFeel: 'Rock' },
        });

        let backbeatHits = 0;
        let eighthNoteHats = 0;
        let nonEighthNoteHats = 0;
        let snareGhostHits = 0;
        let kickSolidHits = 0;
        let openHatHighIntensityCount = 0;
        let totalSnareVelocity = 0;
        let totalGhostVelocity = 0;
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
                        totalSnareVelocity += snare.velocity;
                    } else {
                        // --- CRITIQUE: Snare Ghost/Entropy ---
                        snareGhostHits++;
                        totalGhostVelocity += snare.velocity;
                    }
                }

                // --- CRITIQUE: Kick Solid (on non-backbeat pulses) ---
                if (stepData.isBeatStart && !stepData.isBackbeat && stepData.instruments.Kick) {
                    kickSolidHits++;
                }

                // --- CRITIQUE: Eighth Note Pulse (Hats/Ride) ---
                const hat = hatFamilyHit(stepData.instruments);
                if (hat) {
                    if (isEighth) {
                        eighthNoteHats++;
                        if (hat.sound === 'Open') {
                            openHatHighIntensityCount++;
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
        const ghostAvg = totalGhostVelocity / Math.max(1, snareGhostHits);
        const backbeatAvg = totalSnareVelocity / Math.max(1, backbeatHits);
        console.log(
            `[Snare Dynamics]       ghost avg ${ghostAvg.toFixed(2)} vs backbeat avg ${backbeatAvg.toFixed(2)} (target: ghost < 0.6 * backbeat)`,
        );
        console.log(`[Open Hat @ 0.75]      ${openHatHighIntensityCount} hits`);
        console.log('------------------------------------\n');

        // CRITICAL: Rock drummer MUST hit the backbeat on 2 AND 4. Engine
        // delivers 100% (256/128/2); 0.95 is the floor that still requires
        // the engine to land both snare anchors on essentially every bar.
        expect(backbeatScore).toBeGreaterThan(0.95); // measured: engine delivers 100% (256/256 over 128 bars); floor 0.95 leaves ~5pt headroom

        // CRITICAL: Kick grounds beats 1 and 3 ("the foundation"). Engine
        // delivers 100%; 0.99 is the floor.
        expect(kickScore).toBeGreaterThan(0.99);

        // MUSICAL: Rock hats/ride drive consistent eighth-note pulse. Engine
        // delivers 100%; tightened from >0.9 to >0.95 to match the logged
        // target.
        expect(eighthHatScore).toBeGreaterThan(0.95);

        // MUSICAL: Snare extra hits (ghosting) should be minimal.
        expect(snareGhostHits / totalBars).toBeLessThan(2.0);

        // MUSICAL: Ghost snare hits must be substantially quieter than backbeat
        // hits — the dynamic contrast IS the Rock idiom. Asserting ghost avg <
        // 60% of backbeat avg locks in real dynamic shaping; without this gate
        // a flat-velocity engine could still ship green on count-based checks.
        expect(ghostAvg).toBeLessThan(backbeatAvg * 0.6); // intent: ghost notes must stay quieter than the backbeat — a Rock dynamic-contrast invariant, not a measurement

        // Note: open-hat reachability at intensity 0.75 is intentionally NOT
        // asserted here — opens fire on off-beats (non-eighth steps) in this
        // engine, so this window under-counts. The dedicated low-vs-high
        // intensity test below covers the open-hat ramp directly.
        void openHatHighIntensityCount;
    });

    it('should switch from HiHat to Open sounds at high intensity', () => {
        const lowIntensityPerf = simulatePerformance(32, { playback: { bandIntensity: 0.3 } });
        const highIntensityPerf = simulatePerformance(32, { playback: { bandIntensity: 0.9 } });

        // Count the intensity-gated opens: the full open AND the half-open
        // (both fire only as a high-intensity phrase accent). The quarter-open
        // lift articulation is deliberately excluded — it is an always-on
        // offbeat detail, not part of the "open up when intensity rises"
        // behavior this test measures.
        const countOpenHats = (perf) => {
            let count = 0;
            perf.forEach((bar) =>
                bar.forEach((step) => {
                    if (step.instruments.Open || step.instruments.HiHatHalf) {
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
                const hat = hatFamilyHit(step.instruments);
                if (!hat) {
                    return;
                }
                timekeepingHits++;
                // Only a *full* open is a "wash" — the half/quarter-open
                // articulations are controlled accents, not a continuous
                // open hat, so they are deliberately not counted here.
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

    it('should fire the half-time snare on beat 3 only for motif 2 (#795)', () => {
        // Motif 2 ("Half-time Feel") relocates the backbeat to beat 3 (step 8)
        // alone, leaving beats 2 & 4 (steps 4, 12) free of the strong snare — that
        // displacement IS the feel. Before the fix this branch was byte-identical to
        // the normal 2&4 backbeat, so it produced a standard backbeat (zero such bars).
        //
        // Force motif 2 deterministically: `sectionSeed` is per-section (stable across
        // a run). Map every step to a section 'A' and pin its seed to 0.35 — at
        // intensity 0.9 (tier 3) pickBySeed(0.35, …) → motif 2. `currentLoopCount: 2`
        // lifts the Chorus-Evolution motif ceiling (loop 0 clamps to motif ≤ 1, so
        // motif 2 only exists once the kit has "opened up" — #806).
        const numBars = 16;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.9, currentLoopCount: 2 },
            arranger: {
                timeSignature: '4/4',
                stepMap: [{ start: 0, end: numBars * 16, chord: { sectionId: 'A' } }],
            },
            groove: {
                genreFeel: 'Rock',
                lastDrumPreset: 'Rock',
                instruments: [],
                sectionSeedMap: { A: 0.35 },
            },
        });

        let halfTimeBars = 0;
        performance.forEach((bar) => {
            let strongBeat3 = false;
            let strongBackbeat = false;
            bar.forEach((stepData) => {
                const snare = stepData.instruments.Snare;
                if (!snare || snare.velocity < 1.1) {
                    return;
                }
                if (stepData.loopStep === 8) {
                    strongBeat3 = true;
                }
                if (stepData.loopStep === 4 || stepData.loopStep === 12) {
                    strongBackbeat = true;
                }
            });
            if (strongBeat3 && !strongBackbeat) {
                halfTimeBars++;
            }
        });

        console.log(
            `[Rock Half-time Motif 2] beat-3-only bars (no 2&4 backbeat): ${halfTimeBars}/${numBars}`,
        );
        // With motif 2 forced, every non-turnaround bar is half-time. Floor at 12/16
        // keeps headroom for the occasional turnaround-fill bar that adds a beat-4
        // snare, while proving the displaced backbeat fires (old branch yielded 0).
        expect(halfTimeBars).toBeGreaterThan(12);
    });
});
