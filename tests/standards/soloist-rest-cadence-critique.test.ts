// @ts-nocheck
/**
 * Soloist rest-cadence critique (epic-1-compound-meter S14).
 *
 * The S14 audit found that `public/engine/soloist.ts` only decrements
 * `restSteps` from a manually-seeded value; once `restSteps` reaches 0 there
 * is no per-tick path that forces a rest after N bars of continuous play.
 * In production-shaped state with the All Blues preset, the soloist ran
 * 50-90 bars between rest flips. Human soloists breathe every 4-8 bars in
 * jazz; the engine didn't.
 *
 * The S6 test (`compound-soloist-phrasing-critique`) silently passed
 * because it injects `restSteps: 1, activeSteps: 0` into the mock so the
 * engine wakes up and re-rests on every single bar. That mocked harness
 * masks the bug — the production engine never gets into that cycle on its
 * own.
 *
 * This test drives a *production-shaped* mock — the engine starts at its
 * real defaults (`isResting: true, restSteps: 0, activeSteps: 0`) and the
 * test does NOT re-seed those fields between ticks. The S14 phrasing-budget
 * timer in `soloist.ts` should produce a breath every `phraseBarBudget`
 * bars regardless of whether the random `activeSteps` roll ever happens
 * to coincide with `isStrongResolution`.
 *
 * Acceptance per epic-1-compound-meter S14:
 *   - >= 1 rest entry per 8 bars at intensity 0.7 (over 64 bars).
 *   - >= 1 rest entry per 5 bars at intensity 0.5.
 *   - Mean active-streak length <= 8 bars.
 *
 * The test runs across 4/4 (canonical jazz) and 6/8 (the All Blues listening
 * reference) to confirm the budget is time-signature agnostic.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

/**
 * Production-shaped state. Crucially the phrasing FSM starts at the real
 * defaults (isResting=true, restSteps=0, activeSteps=0) — the engine wakes
 * itself up on the first pulse and then runs naturally. We do NOT inject
 * `restSteps: 1` to force rapid cycling like the S6 test does.
 */
function buildState({
    style = 'jazz',
    intensity = 0.7,
    currentLoopCount = 2,
    timeSignature = '4/4',
} = {}) {
    const ts = TIME_SIGNATURES[timeSignature];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const soloist = makeSoloistMock({
        enabled: true,
        style,
        mode: 'monophonic',
        octave: 64,
        sessionSteps: 0,
        // Production defaults — the engine will wake itself up.
        phrasingState: 'rest',
        isResting: true,
        restSteps: 0,
        activeSteps: 0,
        busySteps: 0,
        barsSinceRest: 0,
        phraseContext: {
            role: 'call',
            skeleton: [],
            lastInterval: null,
            profile: 'miles',
            signature: null,
            responseSignature: null,
            responseMode: 'free',
            responseSource: 'free',
            sectionLabel: null,
            sectionOccurrence: 0,
        },
    });

    return {
        playback: {
            bandIntensity: intensity,
            bpm: 110,
            complexity: 0.6,
            intent: {},
            lyricalBias: 0.1,
            currentLoopCount,
        },
        groove: { genreFeel: 'Jazz', pocket: 0 },
        soloist,
        harmony: { enabled: false },
        arranger: {
            timeSignature,
            sectionMap: [{ start: 0, end: stepsPerBar * 256, label: 'A' }],
            totalSteps: stepsPerBar * 256,
        },
        chords: { enabled: true },
    };
}

/**
 * Drive the soloist over `numBars` of `timeSignature` and return:
 *   - restEntries: list of bar indices where `isResting` flipped from false
 *     to true (the engine entered rest in that bar).
 *   - activeStreaks: list of consecutive-bar-counts where the soloist was
 *     active (any tick in the bar non-resting) between rest entries.
 *
 * The test progression is a 4-bar All Blues-style cycle: G7 - G7 - Gm7 - F7,
 * with G7 held over two bars to mirror the slow harmonic rhythm of All Blues.
 */
function collectRestCadence(numBars: number, opts: any = {}) {
    const timeSignature = opts.timeSignature || '4/4';
    const ts = TIME_SIGNATURES[timeSignature];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const state = buildState({ ...opts, timeSignature });
    getState.mockReturnValue(state);
    const phr = state.soloist.session.phrasing;

    // why: All Blues-style harmonic rhythm — G7 held two bars so the
    // soloist can't lean on chord changes to force phrase boundaries.
    // This is the listening context that motivated S14.
    const G7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], beats: ts.beats };
    const Gm7 = { rootMidi: 67, quality: 'm7', intervals: [0, 3, 7, 10], beats: ts.beats };
    const F7 = { rootMidi: 65, quality: '7', intervals: [0, 4, 7, 10], beats: ts.beats };
    const progression = [G7, G7, Gm7, F7];

    const coordination = {
        sectionStart: 0,
        sectionEnd: stepsPerBar * numBars,
        step: 0,
    };

    const restEntryBars: number[] = [];
    const activeStreaks: number[] = [];
    let currentStreak = 0;
    let barWasActive = false;
    let wasResting = phr.isResting === true;

    for (let bar = 0; bar < numBars; bar++) {
        const chord = progression[bar % progression.length];
        let anyActiveThisBar = false;
        for (let step = 0; step < stepsPerBar; step++) {
            const absStep = bar * stepsPerBar + step;
            const stepInfo = getStepInfo(absStep, ts, [], TIME_SIGNATURES);
            getSoloistNote(
                state,
                chord,
                chord,
                absStep,
                state.soloist.audio.lastFreq || 0,
                64,
                'miles',
                step,
                { ...coordination, step: absStep },
                stepInfo,
            );
            const isRestingNow = phr.isResting === true;
            if (!isRestingNow) {
                anyActiveThisBar = true;
            }
            // Track rest entry: was active, now resting.
            if (!wasResting && isRestingNow) {
                restEntryBars.push(bar);
                if (currentStreak > 0) {
                    activeStreaks.push(currentStreak);
                    currentStreak = 0;
                }
            }
            wasResting = isRestingNow;
            state.soloist.session.sessionSteps++;
        }
        if (anyActiveThisBar) {
            currentStreak++;
        } else if (barWasActive) {
            // pure-rest bar after an active streak — flush
            if (currentStreak > 0) {
                activeStreaks.push(currentStreak);
                currentStreak = 0;
            }
        }
        barWasActive = anyActiveThisBar;
    }
    // Flush the trailing streak (if the run ended active).
    if (currentStreak > 0) {
        activeStreaks.push(currentStreak);
    }

    return { restEntryBars, activeStreaks };
}

describe('soloist rest-cadence: engine produces breaths without mock cycling (S14)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // 1. At moderate intensity (0.7 — All Blues reference), the soloist must
    //    breathe at least once per 8 bars on average.
    // -----------------------------------------------------------------------
    for (const timeSignature of ['4/4', '6/8']) {
        it(`${timeSignature} jazz at intensity 0.7: >= 1 rest entry per 8 bars`, () => {
            const numBars = 64;
            const { restEntryBars, activeStreaks } = collectRestCadence(numBars, {
                intensity: 0.7,
                timeSignature,
            });

            const minRestEntries = Math.floor(numBars / 8); // 8
            const meanActiveStreak =
                activeStreaks.length > 0
                    ? activeStreaks.reduce((a, b) => a + b, 0) / activeStreaks.length
                    : numBars;
            const maxActiveStreak = activeStreaks.length > 0 ? Math.max(...activeStreaks) : numBars;

            console.log(`\n--- SOLOIST REST CADENCE (${timeSignature}, intensity 0.7) ---`);
            console.log(
                `Rest entries over ${numBars} bars: ${restEntryBars.length} (target >= ${minRestEntries})`,
            );
            console.log(`Rest entry bars: [${restEntryBars.join(', ')}]`);
            console.log(`Active streaks (bars): [${activeStreaks.join(', ')}]`);
            console.log(`Mean active-streak: ${meanActiveStreak.toFixed(2)} bars`);
            console.log(`Max active-streak: ${maxActiveStreak} bars`);

            expect(restEntryBars.length).toBeGreaterThanOrEqual(minRestEntries);
            expect(meanActiveStreak).toBeLessThanOrEqual(8);
        });
    }

    // -----------------------------------------------------------------------
    // 2. At low intensity (0.5 — lyrical, ballad-tempo), the soloist breathes
    //    MORE often — at least once per 5 bars.
    // -----------------------------------------------------------------------
    for (const timeSignature of ['4/4', '6/8']) {
        it(`${timeSignature} jazz at intensity 0.5: >= 1 rest entry per 5 bars`, () => {
            const numBars = 64;
            const { restEntryBars, activeStreaks } = collectRestCadence(numBars, {
                intensity: 0.5,
                timeSignature,
            });

            const minRestEntries = Math.floor(numBars / 5); // 12
            const meanActiveStreak =
                activeStreaks.length > 0
                    ? activeStreaks.reduce((a, b) => a + b, 0) / activeStreaks.length
                    : numBars;
            const maxActiveStreak = activeStreaks.length > 0 ? Math.max(...activeStreaks) : numBars;

            console.log(`\n--- SOLOIST REST CADENCE (${timeSignature}, intensity 0.5) ---`);
            console.log(
                `Rest entries over ${numBars} bars: ${restEntryBars.length} (target >= ${minRestEntries})`,
            );
            console.log(`Rest entry bars: [${restEntryBars.join(', ')}]`);
            console.log(`Active streaks (bars): [${activeStreaks.join(', ')}]`);
            console.log(`Mean active-streak: ${meanActiveStreak.toFixed(2)} bars`);
            console.log(`Max active-streak: ${maxActiveStreak} bars`);

            expect(restEntryBars.length).toBeGreaterThanOrEqual(minRestEntries);
            expect(meanActiveStreak).toBeLessThanOrEqual(6);
        });
    }

    // -----------------------------------------------------------------------
    // 3. Pre-S14 regression guard: without the phrasing budget, the All Blues
    //    listening reference (4/4 jazz at intensity 0.7 over 64 bars) had
    //    runs of 50-90 bars without any rest entry. This test would fail
    //    catastrophically pre-S14. We assert the engine NEVER goes 16 bars
    //    without a breath at moderate intensity.
    // -----------------------------------------------------------------------
    it('4/4 jazz intensity 0.7: max active-streak < 16 bars (anti-regression)', () => {
        const numBars = 128;
        const { activeStreaks } = collectRestCadence(numBars, {
            intensity: 0.7,
            timeSignature: '4/4',
        });
        const maxActiveStreak = activeStreaks.length > 0 ? Math.max(...activeStreaks) : numBars;
        console.log(`\n--- SOLOIST ANTI-REGRESSION (4/4, intensity 0.7, ${numBars} bars) ---`);
        console.log(`Max active-streak: ${maxActiveStreak} bars (must be < 16)`);
        console.log(`Active streaks: [${activeStreaks.join(', ')}]`);
        // why: the phrasing budget at intensity 0.7 is round(4 + 0.2*8) = 6
        // bars. The forced rest fires on the next pulse boundary after the
        // budget is exceeded, so the worst case is budget + 1 bar = 7. We
        // pad to 16 to allow for the first bar where the engine wakes up
        // late and natural-resolution timing slack. A pre-S14 regression
        // (no budget timer) would produce 50-90 bar streaks.
        expect(maxActiveStreak).toBeLessThan(16);
    });
});
