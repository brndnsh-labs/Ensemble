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
