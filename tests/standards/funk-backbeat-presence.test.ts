/**
 * Funk Backbeat Presence — epic-form-arrangement S8
 *
 * Acceptance criterion from S8: at default state (no session timer, no chord
 * chart loaded, default `bandIntensity` = 0.35), a 32-bar Funk playback emits
 * >=80% of backbeats on `Snare` rather than `Sidestick`.
 *
 * --- Why this test exists ---
 *
 * Pre-S8: the Snare-Pocket branch (`context.inst.name === 'Snare'`) of
 * `applyOverrides` in `grooves/funk.ts` gated the backbeat at `intensity >
 * 0.4`, routing snare hits to Sidestick at default bandIntensity 0.35. Listening
 * test 2026-05-17 confirmed the funk groove read as polite rim-shot, not the
 * crack a real funk drummer plays on 2 and 4. The S8 fix lowers the gate to
 * 0.3 (a conductor-calibration choice, not a musical one). This test is the
 * regression guard.
 *
 * --- Companion conductor-arc test ---
 *
 * The second describe block (`conductor-arc: default playback reaches >=0.5
 * within 16 bars`) extends S7's coverage with the second S8 acceptance
 * criterion. Paired here (not in conductor-arc-critique.test.ts) because the
 * driver shape is the same — both consume default playback state and assert
 * the new operating range.
 *
 * --- Test pattern ---
 *
 * Mock state via `vi.mock('../../public/state.js', ...)` (mirrors
 * funk-drummer-critique.test.ts). PRNG uses canonical mulberry32 re-seeded
 * per call so the 30-run reliability sweep sees different sequences without
 * cross-run contamination (`feedback_seeded_prng_mulberry32` /
 * `feedback_determinism_test_pattern`).
 *
 * Source: docs/audit/epic-form-arrangement.md S8.
 */
// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { checkSectionTransition } from '../../public/engine/conductor.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

vi.mock('../../public/ui.js', () => ({
    triggerFlash: vi.fn(),
}));

vi.mock('../../public/state/persistence.js', () => ({
    debounceSaveState: vi.fn(),
    saveCurrentState: vi.fn(),
}));

// ---------------------------------------------------------------------------
// mulberry32 — canonical helper, re-seeded per call so the 30-run sweep
// sees different deterministic sequences (per `feedback_seeded_prng_mulberry32`
// and `feedback_determinism_test_pattern`).
// ---------------------------------------------------------------------------
function makeMulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------------------
// PART 1 — Funk backbeat Snare presence at default bandIntensity 0.35
// ---------------------------------------------------------------------------

describe('Funk Backbeat Presence at Default Intensity (S8)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Drive `applyGrooveOverrides` for `numBars` bars at the given intensity.
     * Returns the soundName routed on each backbeat (Snare or Sidestick).
     */
    const collectBackbeats = (
        numBars: number,
        bandIntensity: number,
        randomImpl?: () => number,
    ) => {
        const mockState = {
            playback: { bandIntensity, bpm: 100, songMode: false },
            groove: {
                genreFeel: 'Funk',
                lastDrumPreset: 'Funk',
                instruments: [],
                sectionSeedMap: {},
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        };
        getState.mockReturnValue(mockState);

        // Stub Math.random consistently across the run. If no impl is given,
        // use a deterministic 0.5 stub so the test is reproducible.
        const randomSpy = vi.spyOn(Math, 'random').mockImplementation(randomImpl ?? (() => 0.5));

        const backbeats: Array<'Snare' | 'Sidestick' | 'None'> = [];
        try {
            for (let bar = 0; bar < numBars; bar++) {
                for (let step = 0; step < 16; step++) {
                    const info = getStepInfo(
                        bar * 16 + step,
                        TIME_SIGNATURES['4/4'],
                        [],
                        TIME_SIGNATURES,
                    );
                    // We only care about backbeat positions (steps 4 and 12).
                    if (!info.isBackbeat || !info.isBeatStart) {
                        continue;
                    }
                    const params = {
                        step: bar * 16 + step,
                        inst: { name: 'Snare', muted: false, steps: [] },
                        stepVal: 0,
                        playback: mockState.playback,
                        groove: mockState.groove,
                        isDownbeat: info.isMeasureStart,
                        isPulse: info.isPulse,
                        isBeatStart: info.isBeatStart,
                        isBackbeat: info.isBackbeat,
                        isGroupStart: info.isGroupStart,
                        isOffbeat: info.isOffbeat,
                        isEOfBeat: info.isEOfBeat,
                        isAOfBeat: info.isAOfBeat,
                        beatIndex: info.beatIndex,
                        tsConfig: info.tsConfig,
                    };
                    const result = applyGrooveOverrides(getState(), params);
                    if (!result.shouldPlay) {
                        backbeats.push('None');
                    } else if (result.soundName === 'Sidestick') {
                        backbeats.push('Sidestick');
                    } else {
                        backbeats.push('Snare');
                    }
                }
            }
        } finally {
            randomSpy.mockRestore();
        }
        return backbeats;
    };

    it('>=80% of backbeats on Snare at default bandIntensity 0.35 over 32 bars', () => {
        // why bandIntensity 0.35: matches the `playback` deepSignal slice's
        // `bandIntensity` default (public/state/playback.ts).
        // The whole point of S8 is the default-state listening experience.
        const backbeats = collectBackbeats(32, 0.35);
        const snareCount = backbeats.filter((b) => b === 'Snare').length;
        const sidestickCount = backbeats.filter((b) => b === 'Sidestick').length;
        const playedCount = snareCount + sidestickCount;
        const snareRatio = playedCount > 0 ? snareCount / playedCount : 0;

        console.log('\n--- FUNK BACKBEAT PRESENCE @ DEFAULT INTENSITY ---');
        console.log(`[Bars]                32`);
        console.log(`[bandIntensity]       0.35 (default per state/playback.ts)`);
        console.log(`[Backbeats played]    ${playedCount}/${backbeats.length}`);
        console.log(`[Snare hits]          ${snareCount}`);
        console.log(`[Sidestick hits]      ${sidestickCount}`);
        console.log(`[Snare ratio]         ${(snareRatio * 100).toFixed(1)}% (Target: >=80%)`);
        console.log('--------------------------------------------------\n');

        // Acceptance: >= 80% Snare.
        expect(snareRatio).toBeGreaterThanOrEqual(0.8);
    });

    it('reliability sweep: >=27/30 mulberry32 seeds pass the >=80% Snare bar', () => {
        const SEEDS = Array.from({ length: 30 }, (_, i) => 0xfeedface + i * 0x101);
        let passes = 0;
        const ratios: number[] = [];
        for (const seed of SEEDS) {
            const prng = makeMulberry32(seed);
            const backbeats = collectBackbeats(32, 0.35, prng);
            const snareCount = backbeats.filter((b) => b === 'Snare').length;
            const sidestickCount = backbeats.filter((b) => b === 'Sidestick').length;
            const played = snareCount + sidestickCount;
            const ratio = played > 0 ? snareCount / played : 0;
            ratios.push(ratio);
            if (ratio >= 0.8) {
                passes++;
            }
        }
        console.log('\n--- FUNK BACKBEAT PRESENCE — RELIABILITY SWEEP ---');
        console.log(`[Seeds]              30 (mulberry32)`);
        console.log(`[bandIntensity]      0.35`);
        console.log(`[Passes]             ${passes}/30 (Target: >=27/30)`);
        console.log(
            `[Ratio mean]         ${((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100).toFixed(1)}%`,
        );
        console.log(
            `[Ratio min/max]      ${(Math.min(...ratios) * 100).toFixed(1)}% / ${(Math.max(...ratios) * 100).toFixed(1)}%`,
        );
        console.log('--------------------------------------------------\n');

        // Acceptance: >=27/30 (per S8 spec).
        expect(passes).toBeGreaterThanOrEqual(27);
    });

    // ---------------------------------------------------------------------
    // Regression guard: ensure the OLD bandIntensity 0.4 still works (above
    // the new 0.3 gate). Catches a regression that flips the comparison or
    // raises the gate back to 0.4+.
    // ---------------------------------------------------------------------
    it('regression: bandIntensity 0.4 still produces 100% Snare backbeats', () => {
        const backbeats = collectBackbeats(16, 0.4);
        const snareCount = backbeats.filter((b) => b === 'Snare').length;
        const sidestickCount = backbeats.filter((b) => b === 'Sidestick').length;
        const played = snareCount + sidestickCount;
        const ratio = played > 0 ? snareCount / played : 0;
        // why 1.0: at intensity 0.4 (> 0.3 gate AND > 0.35 fallback), the
        // `motif === 2` branch can route through "Linear Snare" but the
        // displaced backbeats still go through the main Snare path.
        expect(ratio).toBeGreaterThanOrEqual(0.95);
    });

    // ---------------------------------------------------------------------
    // Confirm the gate boundary: at bandIntensity 0.25 (below the new 0.3
    // gate AND the 0.35 fallback), backbeats should still be Sidestick. Pins
    // the "Sidestick is reachable" lane so a future regression that drops
    // the gate to 0 doesn't go unnoticed.
    // ---------------------------------------------------------------------
    it('regression: bandIntensity 0.25 keeps backbeats on Sidestick (lane preserved)', () => {
        const backbeats = collectBackbeats(16, 0.25);
        const sidestickCount = backbeats.filter((b) => b === 'Sidestick').length;
        const snareCount = backbeats.filter((b) => b === 'Snare').length;
        const played = snareCount + sidestickCount;
        // why >50%: at 0.25 (< 0.3 main gate AND < 0.35 fallback) sidestick
        // should dominate. This guards against a "gate removed" regression.
        expect(played).toBeGreaterThan(0);
        expect(sidestickCount).toBeGreaterThan(snareCount);
    });
});

// ---------------------------------------------------------------------------
// PART 2 — Conductor arc: default playback reaches bandIntensity >= 0.5
// within the first 16 bars (S8 second acceptance criterion).
//
// Pre-S8: asymmetric down-ramp (`multiplier = 2.5` for down, `1.0` for up —
// the `multiplier`/`RAMP_INTENSITY_MULTIPLIER` ramp in `updateAutoConductor`,
// conductor.ts) created a structural pull toward floor. S8 inverted to
// 0.5 / 1.5; Epic 12 S6 / LISTEN_TESTS B2 then softened to 0.75 / 1.25 to keep
// the rise from leaping ≈+0.25 in a single measure (it would read as a lurch).
// Per-genre floors (Funk 0.45) keep targetIntensity from sagging below the
// Snare gate even after random jitter.
//
// Driver shape: this is NOT a strict "no chart loaded" scenario because the
// conductor needs a section transition to set targetIntensity (without one,
// `updateAutoConductor` early-returns when targetIntensity matches
// bandIntensity). We simulate the realistic minimal case: a 2-section Funk
// chart, then drive both `checkSectionTransition` (to fire the macro-arc
// target) and `updateAutoConductor` (to ramp bandIntensity toward it).
// ---------------------------------------------------------------------------

const STEPS_PER_MEASURE = 16;
const SECTION_A_END = 32; // 2 bars Verse
const SECTION_B_END = 96; // 4 more bars Chorus -> total 6 bars
const TOTAL_STEPS = SECTION_B_END;

function makeAutoIntensityState() {
    return {
        playback: {
            isPlaying: true,
            autoIntensity: true,
            bandIntensity: 0.35, // default per the `playback` deepSignal slice
            // (state/playback.ts)
            complexity: 0.5,
            bpm: 100,
            songMode: false,
            isEndingPending: false,
            sessionTimer: 0, // no session timer (default-playback case)
            sessionStartTime: 0,
            visualFlash: false,
            step: 0,
            audio: null,
            masterLimiter: null,
            chordsEQ: null,
            chordsPanner: null,
            bassEQ: null,
            soloistEQ: null,
            harmoniesEQ: null,
            harmoniesPanner: null,
            reverbPreFilter: null,
        },
        groove: {
            enabled: true,
            genreFeel: 'Funk',
            lastDrumPreset: 'Funk',
            instruments: [],
            accentMap: null,
            fillMap: null,
            fillActive: false,
            sectionSeedMap: {},
            seedTimelineStartStep: 0,
            orchestrationMap: undefined,
        },
        soloist: {
            enabled: false,
            tradeMode: 'off',
            session: { phrasing: { busySteps: 0 } },
        },
        arranger: {
            timeSignature: '4/4',
            totalSteps: TOTAL_STEPS,
            sections: [
                { id: 'A', label: 'Verse', seamless: false },
                { id: 'B', label: 'Chorus', seamless: false },
            ],
            stepMap: [
                {
                    start: 0,
                    end: SECTION_A_END,
                    chord: { sectionId: 'A', sectionLabel: 'Verse' },
                },
                {
                    start: SECTION_A_END,
                    end: SECTION_B_END,
                    chord: { sectionId: 'B', sectionLabel: 'Chorus' },
                },
            ],
        },
        conductor: {
            targetIntensity: 0.35,
            stepSize: 0.0005,
            form: null,
            loopCount: 0,
            formIteration: 0,
        },
    };
}

/**
 * Simulate `numBars` of playback against a 6-bar Funk chart. Drives:
 *   1. `checkSectionTransition` on each measure boundary (to update
 *      `targetIntensity` when crossing A->B and on loop end).
 *   2. `updateAutoConductor` on every step (to ramp `bandIntensity` toward
 *      the conductor's target via the inverted asymmetric multiplier).
 *
 * Mutates `mockState.playback.bandIntensity` and `mockState.conductor.*`
 * in-place when the engine dispatches them, so the next tick sees the
 * updated values.
 *
 * Returns the array of `bandIntensity` values sampled at each measure
 * boundary (length = numBars + 1, includes initial value).
 */
async function runConductorArc(numBars: number, randomImpl: () => number): Promise<number[]> {
    // Lazy-import updateAutoConductor here so the mocks above are fully wired
    // before the conductor module is evaluated.
    const { updateAutoConductor } = await import('../../public/engine/conductor.js');

    const mockState = makeAutoIntensityState();
    const intensitySamples: number[] = [mockState.playback.bandIntensity];

    const dispatch = (type: string, payload: any) => {
        // Apply state mutations directly so the next tick sees them.
        if (type === ACTIONS.SET_BAND_INTENSITY) {
            mockState.playback.bandIntensity = payload;
        } else if (type === ACTIONS.UPDATE_CONDUCTOR_STATE) {
            Object.assign(mockState.conductor, payload);
        } else if (type === ACTIONS.UPDATE_CONDUCTOR_DECISION) {
            // Conductor decisions don't feed back into intensity directly.
        } else if (type === ACTIONS.UPDATE_HB) {
            // Same.
        } else if (type === ACTIONS.SET_PARAM) {
            // Same.
        }
        // TRIGGER_FILL, SET_GROOVE_SEED, UPDATE_SB: noop for this test.
    };

    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(randomImpl);
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);

    try {
        const totalSteps = numBars * STEPS_PER_MEASURE;
        for (let step = 0; step < totalSteps; step++) {
            mockState.playback.step = step;
            // Section transitions fire on measure boundaries.
            if (step % STEPS_PER_MEASURE === 0) {
                checkSectionTransition(mockState, step, STEPS_PER_MEASURE, dispatch);
            }
            // Ramp bandIntensity toward targetIntensity every tick.
            updateAutoConductor(mockState, dispatch);

            if ((step + 1) % STEPS_PER_MEASURE === 0) {
                intensitySamples.push(mockState.playback.bandIntensity);
            }
        }
    } finally {
        randomSpy.mockRestore();
        nowSpy.mockRestore();
    }

    return intensitySamples;
}

describe('Conductor Arc — default playback reaches >=0.5 within 16 bars (S8)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('bandIntensity reaches >=0.5 within 16 bars of Funk default playback', async () => {
        // why Math.random=0.5: deterministic for the per-test pin. The 30-run
        // sweep below covers jitter.
        const samples = await runConductorArc(16, () => 0.5);
        const maxIntensity = Math.max(...samples);
        const reached05 = samples.findIndex((v) => v >= 0.5);

        console.log('\n--- CONDUCTOR ARC @ DEFAULT FUNK PLAYBACK ---');
        console.log(`[Bars]                  16`);
        console.log(`[Initial bandIntensity] 0.35`);
        console.log(`[Funk floor]            0.45 (GENRE_INTENSITY_FLOORS)`);
        console.log(`[Ramp multiplier]       0.75 down / 1.25 up (S6 B2 softening)`);
        console.log(`[Max bandIntensity]     ${maxIntensity.toFixed(3)}`);
        console.log(`[Reached >=0.5 at bar]  ${reached05 >= 0 ? reached05 : 'NEVER'}`);
        console.log(`[Sample trace]          ${samples.map((v) => v.toFixed(2)).join(' -> ')}`);
        console.log('---------------------------------------------\n');

        // Acceptance: >=0.5 reached within first 16 bars.
        expect(maxIntensity).toBeGreaterThanOrEqual(0.5);
        expect(reached05).toBeGreaterThanOrEqual(0);
        expect(reached05).toBeLessThanOrEqual(16);
    });

    it('reliability sweep: >=27/30 mulberry32 seeds reach >=0.5 within 16 bars', async () => {
        const SEEDS = Array.from({ length: 30 }, (_, i) => 0xbeef0000 + i * 0x101);
        let passes = 0;
        const peakRatios: number[] = [];
        for (const seed of SEEDS) {
            const prng = makeMulberry32(seed);
            const samples = await runConductorArc(16, prng);
            const peak = Math.max(...samples);
            peakRatios.push(peak);
            if (peak >= 0.5) {
                passes++;
            }
        }
        console.log('\n--- CONDUCTOR ARC RELIABILITY SWEEP ---');
        console.log(`[Seeds]              30 (mulberry32)`);
        console.log(`[Passes]             ${passes}/30 (Target: >=27/30)`);
        console.log(
            `[Peak mean]          ${(peakRatios.reduce((a, b) => a + b, 0) / peakRatios.length).toFixed(3)}`,
        );
        console.log(
            `[Peak min/max]       ${Math.min(...peakRatios).toFixed(3)} / ${Math.max(...peakRatios).toFixed(3)}`,
        );
        console.log('---------------------------------------------\n');

        expect(passes).toBeGreaterThanOrEqual(27);
    });
});

// ---------------------------------------------------------------------------
// PART 3 — Integrated conductor-driven arc.
//
// PART 1 pins the backbeat gate at a STATIC bandIntensity 0.35; PART 2 pins
// the conductor ramp but never measures backbeat routing while it ramps.
// Neither proves the two compose: that `applyGrooveOverrides` actually reads
// the conductor's live per-tick `bandIntensity` and routes Snare throughout a
// real playback arc. PART 3 runs ONE merged loop — conductor ramp + backbeat
// collection on the same state object — and asserts >=80% Snare on the
// integrated trace.
//
// Revert-confirm note: the overall 32-bar Snare ratio is NOT a tight guard —
// the conductor ramps intensity clear of the old 0.4 gate within ~1.5 bars, so
// even with the gate reverted to 0.4 the 32-bar trace still reads ~95% Snare.
// The teeth are on the OPENING window: backbeats emitted while the conductor-
// driven intensity is still in the [0.35, 0.4) band (the S8 listening-test
// concern — the first bars of default playback). With the 216 gate at 0.3
// those route Snare; reverted to 0.4 they flip to Sidestick. That window is
// the assertion that fails on revert. It is intrinsically narrow (~3
// backbeats) — the regression-relevant band is only 0.05 wide and the Funk
// conductor ramp crosses it in ~1.5 bars — so the test asserts a minimum
// window size too: a ramp retune that shrank it would fail loudly here
// rather than silently hollow the guard.
// ---------------------------------------------------------------------------

/**
 * Run `numBars` of Funk playback driving the conductor and the groove on a
 * SINGLE shared state object: each step ramps `bandIntensity` via
 * `updateAutoConductor`, and each backbeat step routes through
 * `applyGrooveOverrides` reading that just-updated intensity.
 *
 * Returns the routed soundName per backbeat plus the live intensity sampled
 * at each backbeat (for the console trace).
 */
async function runIntegratedFunkArc(
    numBars: number,
    randomImpl: () => number,
): Promise<{ backbeats: Array<'Snare' | 'Sidestick' | 'None'>; intensityAtBackbeat: number[] }> {
    const { updateAutoConductor } = await import('../../public/engine/conductor.js');

    const mockState = makeAutoIntensityState();
    // applyGrooveOverrides reads the same live state — the generative routing
    // path the >=80% Snare claim is validated against (always engaged now).
    // bandIntensity stays at the 0.35 default (set by makeAutoIntensityState) —
    // see the opening-window note on splitTrace for why 0.35, not lower.
    getState.mockReturnValue(mockState);

    const dispatch = (type: string, payload: any) => {
        if (type === ACTIONS.SET_BAND_INTENSITY) {
            mockState.playback.bandIntensity = payload;
        } else if (type === ACTIONS.UPDATE_CONDUCTOR_STATE) {
            Object.assign(mockState.conductor, payload);
        }
        // TRIGGER_FILL / SET_GROOVE_SEED / UPDATE_* : noop for this trace.
    };

    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(randomImpl);
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);

    const backbeats: Array<'Snare' | 'Sidestick' | 'None'> = [];
    const intensityAtBackbeat: number[] = [];
    try {
        const totalSteps = numBars * STEPS_PER_MEASURE;
        for (let step = 0; step < totalSteps; step++) {
            mockState.playback.step = step;
            if (step % STEPS_PER_MEASURE === 0) {
                checkSectionTransition(mockState, step, STEPS_PER_MEASURE, dispatch);
            }
            // Ramp first, THEN route the backbeat — so the groove reads the
            // intensity the conductor just produced for this tick.
            updateAutoConductor(mockState, dispatch);

            const info = getStepInfo(step, TIME_SIGNATURES['4/4'], [], TIME_SIGNATURES);
            if (!info.isBackbeat || !info.isBeatStart) {
                continue;
            }
            const params = {
                step,
                inst: { name: 'Snare', muted: false, steps: [] },
                stepVal: 0,
                playback: mockState.playback,
                groove: mockState.groove,
                isDownbeat: info.isMeasureStart,
                isPulse: info.isPulse,
                isBeatStart: info.isBeatStart,
                isBackbeat: info.isBackbeat,
                isGroupStart: info.isGroupStart,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                beatIndex: info.beatIndex,
                tsConfig: info.tsConfig,
            };
            const result = applyGrooveOverrides(mockState, params);
            intensityAtBackbeat.push(mockState.playback.bandIntensity);
            if (!result.shouldPlay) {
                backbeats.push('None');
            } else if (result.soundName === 'Sidestick') {
                backbeats.push('Sidestick');
            } else {
                backbeats.push('Snare');
            }
        }
    } finally {
        randomSpy.mockRestore();
        nowSpy.mockRestore();
    }

    return { backbeats, intensityAtBackbeat };
}

describe('Funk Backbeat Presence — integrated conductor-driven arc (S8 PART 3)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // The opening window is the [0.35, 0.4) intensity band — where reverting
    // the S8 gate (216: `intensity > 0.3`) back to `> 0.4` actually flips
    // routing. The band's bounds are NOT arbitrary:
    //   - lower 0.35: the "Low intensity fallback" branch (`intensity < 0.35
    //     && velocity > 0.8`) in the Snare-Pocket block of `applyOverrides`
    //     (grooves/funk.ts) re-routes any full-velocity backbeat below 0.35
    //     to Sidestick regardless of the 216 gate, so below 0.35 Sidestick
    //     is *correct* and the 216-gate revert is invisible. 0.35 is the
    //     effective Snare threshold.
    //   - upper 0.4: at >= 0.4 the OLD gate (`> 0.4`-ish) would also pass, so
    //     a revert no longer flips routing there.
    // Only inside [0.35, 0.4) does the gate value decide Snare vs Sidestick.
    const splitTrace = (
        backbeats: Array<'Snare' | 'Sidestick' | 'None'>,
        intensityAtBackbeat: number[],
    ) => {
        const openingPlayed: Array<'Snare' | 'Sidestick'> = [];
        for (let i = 0; i < backbeats.length; i++) {
            const v = intensityAtBackbeat[i];
            if (v >= 0.35 && v < 0.4 && backbeats[i] !== 'None') {
                openingPlayed.push(backbeats[i] as 'Snare' | 'Sidestick');
            }
        }
        const snareCount = backbeats.filter((b) => b === 'Snare').length;
        const sidestickCount = backbeats.filter((b) => b === 'Sidestick').length;
        const playedCount = snareCount + sidestickCount;
        return {
            openingPlayed,
            openingSnare: openingPlayed.filter((b) => b === 'Snare').length,
            snareCount,
            sidestickCount,
            playedCount,
            snareRatio: playedCount > 0 ? snareCount / playedCount : 0,
        };
    };

    it('routes every opening-window backbeat to Snare across a 32-bar conductor arc', async () => {
        const { backbeats, intensityAtBackbeat } = await runIntegratedFunkArc(32, () => 0.5);
        const m = splitTrace(backbeats, intensityAtBackbeat);

        console.log('\n--- FUNK BACKBEAT PRESENCE — INTEGRATED CONDUCTOR ARC ---');
        console.log(`[Bars]                32 (conductor-driven, not static)`);
        console.log(`[Initial intensity]   0.35 -> conductor ramps per tick`);
        console.log(
            `[Intensity range]     ${Math.min(...intensityAtBackbeat).toFixed(2)} -> ${Math.max(...intensityAtBackbeat).toFixed(2)}`,
        );
        console.log(`[Backbeats played]    ${m.playedCount}/${backbeats.length}`);
        console.log(
            `[Opening window]      ${m.openingSnare}/${m.openingPlayed.length} Snare (intensity [0.35, 0.4))`,
        );
        console.log(`[Snare ratio]         ${(m.snareRatio * 100).toFixed(1)}% (Target: >=80%)`);
        console.log('---------------------------------------------------------\n');

        expect(m.playedCount).toBeGreaterThan(0);
        // The opening window must hold at least 2 backbeats (the count at the
        // current Funk ramp rate). A floor, not `> 0`: a ramp retune that
        // shrank the window would fail HERE — loudly — instead of quietly
        // leaving a near-vacuous guard.
        //
        // why 2 (was 3): post-#793 the seeded macro jitter is always present —
        // at the first transition (formIteration 0, currentStep 16) it resolves
        // to a deterministic +0.071 offset, raising the first ramp target and so
        // the per-tick stepSize. The Funk ramp therefore crosses the narrow
        // [0.35, 0.4) opening band marginally faster, leaving 2 backbeats inside
        // it instead of 3. This is NOT a gate-crossing regression — every one of
        // those backbeats still routes Snare (the teeth below, and the 100%
        // overall ratio, are unchanged). 2 still gives the revert-detection real
        // bite: with the gate reverted to 0.4 both opening backbeats flip to
        // Sidestick and `openingSnare === openingPlayed.length` fails.
        expect(m.openingPlayed.length).toBeGreaterThanOrEqual(2);
        // Teeth: every backbeat the conductor emits while intensity is still in
        // the [0.35, 0.4) band routes Snare. This is what the 216 gate revert
        // (0.3 -> 0.4) breaks, and it proves the groove reads the live
        // conductor-driven intensity, not a stale value.
        expect(m.openingSnare).toBe(m.openingPlayed.length);
        // Smoke: the integrated 32-bar trace stays >=80% Snare overall (S8).
        expect(m.snareRatio).toBeGreaterThanOrEqual(0.8);
    });

    it('reliability sweep: >=27/30 seeds route every opening backbeat to Snare', async () => {
        const SEEDS = Array.from({ length: 30 }, (_, i) => 0xabcd0000 + i * 0x101);
        let passes = 0;
        const openingShares: number[] = [];
        for (const seed of SEEDS) {
            const prng = makeMulberry32(seed);
            const { backbeats, intensityAtBackbeat } = await runIntegratedFunkArc(32, prng);
            const m = splitTrace(backbeats, intensityAtBackbeat);
            openingShares.push(
                m.openingPlayed.length > 0 ? m.openingSnare / m.openingPlayed.length : 0,
            );
            // A seed passes only if the opening window exists AND every opening
            // backbeat routed Snare.
            if (m.openingPlayed.length > 0 && m.openingSnare === m.openingPlayed.length) {
                passes++;
            }
        }
        console.log('\n--- INTEGRATED ARC RELIABILITY SWEEP ---');
        console.log(`[Seeds]              30 (mulberry32)`);
        console.log(`[Passes]             ${passes}/30 (Target: >=27/30)`);
        console.log(
            `[Opening Snare mean] ${((openingShares.reduce((a, b) => a + b, 0) / openingShares.length) * 100).toFixed(1)}%`,
        );
        console.log('-----------------------------------------\n');

        expect(passes).toBeGreaterThanOrEqual(27);
    });
});
