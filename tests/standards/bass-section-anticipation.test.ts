// @ts-nocheck
// tests/standards/bass-section-anticipation.test.ts
//
// Critique test for `coordination-contract/S3` — wire `upcomingSectionFirstChord`
// into the bass engine so it plays a chromatic approach note (±1 semitone from the
// upcoming root) at step `sectionEnd - stepsPerBeat/2`.
//
// Setup: section of 32 steps (2 measures of 4/4, stepsPerBeat=4). Current chord
// root is C (MIDI 48). Upcoming section chord root is G (MIDI 55) — a tritone away
// so a chromatic approach is clearly distinct from normal walking.
//
// Primary assertion: at step 30 (= sectionEnd 32 - stepsPerBeat/2 2 = 30), the
// bass note is within 1 semitone of the upcoming G root in bass register.
//
// Reliability target: ≥28/30 trials (allows 2/30 for style-gate skips or seed
// edge-cases where the engine declines to play the approach step).
//
// Negative control: when upcomingSectionFirstChord is null, bass at step 30 should
// NOT preferentially cluster within 1 semitone of any particular note — the
// per-trial "hit" rate should stay near the baseline 2/12 ≈ 17% or lower.
//
// Source: docs/audit/form-arranger.md P0 #2;
//         docs/audit/epic-coordination-contract.md S3.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// C major (MIDI 48) — current section chord
const CHORD_C = {
    rootMidi: 48,
    quality: 'maj7',
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [130.81, 164.81, 196.0, 246.94], // approximate; bass engine uses rootMidi
};

// G major (MIDI 55) — upcoming section chord, a tritone from C so approach is distinctive
const CHORD_G_UPCOMING = {
    rootMidi: 55,
    quality: 'maj7',
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [196.0, 246.94, 293.66, 370.0],
};

const TS_CONFIG = TIME_SIGNATURES['4/4'];
const STEPS_PER_BEAT = 4;
const SECTION_END = 32; // 2 measures of 4/4
const ANTICIPATION_STEP = SECTION_END - Math.floor(STEPS_PER_BEAT / 2); // = 30

function makeCoordinationWithUpcoming(upcomingChord: any) {
    return {
        upcomingSectionFirstChord: upcomingChord,
        // why: tick-logic.ts writes sectionStart/sectionEnd onto coordination so
        // isBassActive can read sectionEnd directly. Mirror that here so the gate
        // in isBassActive sees the boundary it needs to force-activate.
        sectionStart: 0,
        sectionEnd: SECTION_END,
        kickHit: false,
        snareHit: false,
        soloistBusy: false,
        soloistMidi: 0,
        bassHit: false,
        bassMidi: 0,
    };
}

function makeMockState(overrides = {}) {
    return {
        playback: { bandIntensity: 0.7, bpm: 120, complexity: 0.6, intent: {} },
        groove: { genreFeel: 'Jazz', pocket: 0, instruments: [], measures: 2 },
        soloist: makeSoloistMock({ busySteps: 0, tension: 0 }),
        arranger: { timeSignature: '4/4', totalSteps: SECTION_END },
        ...overrides,
    };
}

describe('Bass section-transition anticipation (S3)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        getState.mockReturnValue(makeMockState());
    });

    // Returns true if the bass note at the given step is within 1 semitone of
    // the target root pitch class in any octave.
    function isApproachNoteToRoot(midi: number, targetRootMidi: number): boolean {
        const targetPc = ((targetRootMidi % 12) + 12) % 12;
        const notePc = ((midi % 12) + 12) % 12;
        const semitoneDistance = Math.min(
            Math.abs(notePc - targetPc),
            12 - Math.abs(notePc - targetPc),
        );
        return semitoneDistance <= 1;
    }

    it('plays a chromatic approach note at anticipation step ≥28/30 trials', () => {
        const TRIALS = 30;
        let passing = 0;
        const results: boolean[] = [];

        for (let trial = 0; trial < TRIALS; trial++) {
            // Reset mock state each trial to avoid bleed-over from lastFreq.
            const mockState = makeMockState();
            getState.mockReturnValue(mockState);

            const stepInfo = getStepInfo(ANTICIPATION_STEP, TS_CONFIG, [], TIME_SIGNATURES);

            // Build a coordination context with upcomingSectionFirstChord = G.
            const coordination = makeCoordinationWithUpcoming(CHORD_G_UPCOMING);

            const context = {
                sectionStart: 0,
                sectionEnd: SECTION_END,
                stepCoordination: coordination,
            };

            // Check if bass is active at the anticipation step (style=jazz).
            const stepInChord = ANTICIPATION_STEP % (CHORD_C.beats * STEPS_PER_BEAT);
            const active = isBassActive(
                getState(),
                'jazz',
                ANTICIPATION_STEP,
                stepInChord,
                stepInfo,
                coordination,
            );

            if (!active) {
                // Bass is silent on this step — count as a non-approach.
                results.push(false);
                continue;
            }

            const note = getBassNote(
                getState(),
                CHORD_C,
                CHORD_G_UPCOMING,
                ANTICIPATION_STEP / STEPS_PER_BEAT,
                null,
                48,
                'jazz',
                0,
                ANTICIPATION_STEP,
                stepInChord,
                context,
                stepInfo,
            );

            if (!note?.midi) {
                results.push(false);
                continue;
            }

            const hit = isApproachNoteToRoot(note.midi, CHORD_G_UPCOMING.rootMidi);
            results.push(hit);
            if (hit) {
                passing++;
            }
        }

        const hitRate = (passing / TRIALS) * 100;
        // eslint-disable-next-line no-console
        console.log(
            `[bass-anticipation] anticipation step ${ANTICIPATION_STEP} (sectionEnd ${SECTION_END}): ` +
                `${passing}/${TRIALS} trials within ±1 semitone of upcoming G root (${hitRate.toFixed(1)}%)`,
        );

        // why ≥28/30: allows 2/30 for cases where the engine is silent on the step
        // or the style gate naturally declines (e.g. isBassActive returns false).
        // The gate fires deterministically when active — 28/30 is the measured floor.
        expect(passing).toBeGreaterThanOrEqual(TRIALS - 2);
    });

    it('negative control: without upcomingSectionFirstChord, no preferential approach clustering', () => {
        // When coordination has NO upcoming chord, the bass should not cluster
        // within 1 semitone of G at step 30 any more than random scale walking.
        // We compare the "hit" rate (approach to G) with and without the field.
        const TRIALS = 30;
        let hitCount = 0;

        for (let trial = 0; trial < TRIALS; trial++) {
            const mockState = makeMockState();
            getState.mockReturnValue(mockState);

            const stepInfo = getStepInfo(ANTICIPATION_STEP, TS_CONFIG, [], TIME_SIGNATURES);

            // No upcoming chord in coordination.
            const coordination = makeCoordinationWithUpcoming(null);

            const context = {
                sectionStart: 0,
                sectionEnd: SECTION_END,
                stepCoordination: coordination,
            };

            const stepInChord = ANTICIPATION_STEP % (CHORD_C.beats * STEPS_PER_BEAT);
            const active = isBassActive(
                getState(),
                'jazz',
                ANTICIPATION_STEP,
                stepInChord,
                stepInfo,
                coordination,
            );

            if (!active) {
                continue;
            }

            const note = getBassNote(
                getState(),
                CHORD_C,
                null, // no next chord either
                ANTICIPATION_STEP / STEPS_PER_BEAT,
                null,
                48,
                'jazz',
                0,
                ANTICIPATION_STEP,
                stepInChord,
                context,
                stepInfo,
            );

            if (note?.midi && isApproachNoteToRoot(note.midi, CHORD_G_UPCOMING.rootMidi)) {
                hitCount++;
            }
        }

        // why ≤20/30: without the anticipation gate, the probability of randomly
        // landing within 1 semitone of G from a C-scale walk is ~2/7 (2 out of 7
        // diatonic notes). Over 30 trials this is ~8-9 hits. We allow up to 20/30
        // as a generous upper bound to avoid false-failing from stochastic variance,
        // while still confirming there's no systematic bias toward G.
        const hitRate = (hitCount / TRIALS) * 100;
        // eslint-disable-next-line no-console
        console.log(
            `[bass-anticipation] negative control: ${hitCount}/${TRIALS} random G-approach hits (${hitRate.toFixed(1)}%)`,
        );

        expect(hitCount).toBeLessThanOrEqual(20);
    });

    it('does not fire outside the anticipation window (step 16 should not be forced)', () => {
        // why: step 16 is the downbeat of the last measure — well clear of beat 4
        // where walking bass naturally pulls toward the upcoming root via its
        // existing nextChord-aware logic. By measuring at the downbeat, we isolate
        // the new section-anticipation gate from the walking engine's pre-existing
        // approach behavior. (Earlier draft used step 28 which sits in walking
        // bass's natural approach window — the test then measured natural walking
        // behavior, not gate isolation, and was empirically flaky at the ≤20/30
        // ceiling. See music-theory review P0 finding.)
        const TRIALS = 30;
        let forcedApproachCount = 0;
        const NON_ANTICIPATION_STEP = 16;

        for (let trial = 0; trial < TRIALS; trial++) {
            const mockState = makeMockState();
            getState.mockReturnValue(mockState);

            const stepInfo = getStepInfo(NON_ANTICIPATION_STEP, TS_CONFIG, [], TIME_SIGNATURES);
            const coordination = makeCoordinationWithUpcoming(CHORD_G_UPCOMING);

            const context = {
                sectionStart: 0,
                sectionEnd: SECTION_END,
                stepCoordination: coordination,
            };

            const stepInChord = NON_ANTICIPATION_STEP % (CHORD_C.beats * STEPS_PER_BEAT);
            const active = isBassActive(
                getState(),
                'jazz',
                NON_ANTICIPATION_STEP,
                stepInChord,
                stepInfo,
                coordination,
            );

            if (!active) {
                continue;
            }

            const note = getBassNote(
                getState(),
                CHORD_C,
                CHORD_G_UPCOMING,
                NON_ANTICIPATION_STEP / STEPS_PER_BEAT,
                null,
                48,
                'jazz',
                0,
                NON_ANTICIPATION_STEP,
                stepInChord,
                context,
                stepInfo,
            );

            if (note?.midi && isApproachNoteToRoot(note.midi, CHORD_G_UPCOMING.rootMidi)) {
                forcedApproachCount++;
            }
        }

        // why ≤15/30: the downbeat of the last measure has no natural pull toward
        // the upcoming section root in C-major walking. The gate fires only at
        // step 30, so step 16 should see roughly the baseline 2/7 ≈ 17% rate of
        // landing within ±1 semitone of G by chance. ≤15/30 = 50%, a generous
        // ceiling that catches systematic bias without flaking on variance.
        const hitRate = (forcedApproachCount / TRIALS) * 100;
        // eslint-disable-next-line no-console
        console.log(
            `[bass-anticipation] non-gate step ${NON_ANTICIPATION_STEP}: ` +
                `${forcedApproachCount}/${TRIALS} G-approach hits (${hitRate.toFixed(1)}%)`,
        );

        expect(forcedApproachCount).toBeLessThanOrEqual(15);
    });
});

// ============================================================================
// Epic 3 S12 — Penultimate-bar approach window (three-tier rock push ramp)
// ============================================================================
//
// S12 widened ONLY the structural counter `barsUntilSectionChange` in tick-logic
// to the penultimate bar (`remainingSteps <= stepsPerMeasure * 2`), so it can now
// hold `1` one bar before a section change (previously: 0 in the final bar, -1
// otherwise). The rock anticipation push (bass-styles.ts) reads that counter and
// applies a THREE-tier gate multiplier:
//   barsUntilSectionChange === 0 → 1.0×  (boundary: full signpost probability)
//   barsUntilSectionChange === 1 → 0.5×  (penultimate: approach window — a build)
//   otherwise (-1 / undefined)   → 0.15× (residual: rare, spontaneous)
//
// We measure the push RATE directly by sweeping explicit song seeds at a
// beat-4 push point, holding the
// counter at each tier. Push fires when the beat-4 note lands on the upcoming G
// root (pc 6/7/8) instead of the current C root (pc 0). The ordering
// final > penultimate > residual proves the ramp.
//
// Structural-counter values (1 on penultimate, 0 on final, -1 outside the 2-bar
// window) and the decouple guard (upcomingSectionFirstChord stays null on the
// penultimate bar) are proven end-to-end in drop-breakdown-mechanic.test.ts via
// generateNotesForStep; here we isolate the bass ramp itself.

const PUSH_BEAT4_STEP = 12; // stepInMeasure 12 = beat-4 start in 4/4 (intBeat 3)

function makeRockState() {
    return {
        playback: { bandIntensity: 0.7, bpm: 120, complexity: 0.6, intent: {} },
        groove: { genreFeel: 'Rock', pocket: 0, instruments: [], measures: 2 },
        soloist: makeSoloistMock({ busySteps: 0, tension: 0 }),
        arranger: { timeSignature: '4/4', totalSteps: SECTION_END },
    };
}

// Use the same seed population for each tier so only the structural gate changes.
function measurePushRate(barsUntilSectionChange: number | undefined, grid = 400): number {
    const state = makeRockState();
    getState.mockReturnValue(state);
    const stepInfo = getStepInfo(PUSH_BEAT4_STEP, TS_CONFIG, [], TIME_SIGNATURES);
    const gRootPc = ((CHORD_G_UPCOMING.rootMidi % 12) + 12) % 12; // 7
    let fires = 0;

    for (let i = 0; i < grid; i++) {
        state.arranger.seed = `ROCK_PUSH_${i}`;

        const note = getBassNote(
            state,
            CHORD_C,
            CHORD_G_UPCOMING,
            PUSH_BEAT4_STEP / STEPS_PER_BEAT,
            null,
            48,
            'rock',
            0,
            PUSH_BEAT4_STEP,
            PUSH_BEAT4_STEP % (CHORD_C.beats * STEPS_PER_BEAT),
            { stepCoordination: { barsUntilSectionChange } },
            stepInfo,
        );

        if (!note?.midi) {
            continue;
        }
        const pc = ((note.midi % 12) + 12) % 12;
        // A push pulls toward the G root (pc 7) or its chromatic neighbors (6/8).
        // The non-push fallback plays the C root (pc 0). Distance to G ≤ 1 = push.
        const dist = Math.min(Math.abs(pc - gRootPc), 12 - Math.abs(pc - gRootPc));
        if (dist <= 1) {
            fires++;
        }
    }
    return fires / grid;
}

describe('Bass section-anticipation S12 — three-tier approach-window ramp', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        getState.mockReturnValue(makeRockState());
    });

    it('push rate ramps: final-bar (1.0×) > penultimate (0.5×) > residual (0.15×)', () => {
        const finalRate = measurePushRate(0); // barsUntilSectionChange === 0
        const penultRate = measurePushRate(1); // barsUntilSectionChange === 1
        const residualRate = measurePushRate(-1); // outside the window

        // eslint-disable-next-line no-console
        console.log(
            `[bass-anticipation S12] push rates — final(0): ${(finalRate * 100).toFixed(1)}% ` +
                `penultimate(1): ${(penultRate * 100).toFixed(1)}% ` +
                `residual(-1): ${(residualRate * 100).toFixed(1)}%`,
        );

        // Strict ordering — the ramp's whole point. Fixed seed population, so
        // this is reproducible: with intensity 0.7 the base pushProb is
        // 0.1 + 0.7*0.15 = 0.205, scaled by the tier mult → ~0.205 / ~0.1025 / ~0.031.
        expect(finalRate).toBeGreaterThan(penultRate);
        expect(penultRate).toBeGreaterThan(residualRate);
        expect(residualRate).toBeGreaterThan(0); // 0.15× residual is non-zero by design

        // The penultimate tier is the geometric/arithmetic middle: ~0.5× the final
        // rate. Allow generous tolerance for sampling + the chromatic
        // sub-branch. (final * 0.5 = the 0.5× tier target.)
        expect(penultRate).toBeGreaterThan(finalRate * 0.35);
        expect(penultRate).toBeLessThan(finalRate * 0.65);
    });

    it('undefined barsUntilSectionChange behaves like the -1 residual tier', () => {
        // why: test mocks / no-coordination call sites pass undefined; the ramp
        // must treat it identically to the -1 sentinel (0.15× residual), never
        // the 1.0× boundary tier.
        const undefinedRate = measurePushRate(undefined);

        const residualRate = measurePushRate(-1);
        // eslint-disable-next-line no-console
        console.log(
            `[bass-anticipation S12] undefined push rate ${(undefinedRate * 100).toFixed(1)}% ` +
                `vs -1 residual ${(residualRate * 100).toFixed(1)}%`,
        );
        expect(undefinedRate).toBeCloseTo(residualRate, 2);
    });
});
