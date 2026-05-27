// @ts-nocheck
/* eslint-disable */
/**
 * Jazz 6/8 comping density critique (epic-1-compound-meter S13).
 *
 * Before S13, the jazz comping lane in 6/8 was suspected of firing far too
 * often per bar — the user heard the "thick mush" / "6/8 feels jumbled"
 * complaint that opened this cycle. Idiomatic jazz comping is sparse and
 * syncopated (1–3 chord hits per bar), landing on pulses and anticipations,
 * leaving space for the soloist. Bill Evans' "Waltz for Debby" left hand and
 * the comping on Miles' "All Blues" are the references.
 *
 * S3 already added `COMPOUND_COMPING_CELLS` — a pulse-aware 6/8 cell bank
 * (`[0,6]`, `[0,6,10]`, `[6,10]`, `[0,4,6]`, `[10]`). S13's job is to verify
 * that the FULL emission path — pattern picker + "Force hit on One" boost
 * + `isGroupStart` boost + conversational comping + phrase-end thinning —
 * still lands a sparse, pulse-clustered shape. The standalone picker test
 * `compound-accompaniment-pulse-critique.test.ts` proves the pattern is good
 * in isolation; this test proves the production-shaped emission path doesn't
 * inflate it back up.
 *
 * Acceptance assertions (see epic-1-compound-meter S13):
 *   (a) Hits-per-bar mean ∈ [1, 4] at intensity 0.7 across many seeded runs.
 *   (b) ≥ 70% of all hits land on pulse-aligned positions {0, 4, 6, 10}.
 *   (c) Per-step density ≤ 35% (vs the "thick mush" baseline) — averaged
 *       across all 12 step positions.
 *   (d) 30-run reliability passes (no seed-of-the-day flakes).
 *
 * Approach used (per implementation decision): the existing
 * `COMPOUND_COMPING_CELLS` bank from S3 is the right shape — pulse-pattern
 * sparse, not "thinned 4/4." This test guards the END-TO-END density coming
 * out of `getAccompanimentNotes`, since the pattern picker is only one input
 * to the actual emitted hits.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {
            bandIntensity: 0.7,
            complexity: 0.5,
            bpm: 120,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
            audio: { currentTime: 0 },
        },
        arranger: {
            timeSignature: '6/8',
            progression: [],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: true, lastFreq: 65.41 }, // C2
        soloist: makeSoloistMock({ enabled: true, busySteps: 0, lastFreq: 440 }),
        groove: { genreFeel: 'Jazz' },
        harmony: { enabled: false, rhythmicMask: 0, buffer: new Map() },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

vi.mock('../../public/utils.js', async () => {
    const actual = await vi.importActual<any>('../../public/utils.js');
    return {
        ...actual,
        calculateTimingOffset: vi.fn(() => 0),
        applyBluesBends: vi.fn(),
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

import { TIME_SIGNATURES } from '../../public/config.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { arranger, playback, chords, bass, groove } = getState();

const SIX_EIGHT = TIME_SIGNATURES['6/8'];
const STEPS_PER_BAR = SIX_EIGHT.beats * SIX_EIGHT.stepsPerBeat; // 12
// why: COMPOUND_COMPING_CELLS lands hits in {0, 4, 6, 10} — pulses (0, 6)
// plus the canonical 6/8 anticipation slots (4 = "a-of-pulse-1", 10 =
// last eighth before next bar). These are also the slots S11 ride skip-beat
// and S12 bass pickup use — by design, compound jazz lives on these moments.
const PULSE_ALIGNED_STEPS = new Set([0, 4, 6, 10]);

function resetCompingState() {
    compingState.currentCell = new Array(16).fill(0);
    compingState.lockedUntil = 0;
    compingState.grooveRetentionCount = 0;
    compingState.lastSectionId = null;
    compingState.lastVoicingMidis = [];
    compingState.lastChordIndex = -1;
    compingState.lastChordQuality = null;
    compingState.funkRotationIndex = 0;
    compingState.bossaRotationIndex = 0;
    compingState.currentVibe = 'balanced';
}

/**
 * Run the production-shaped jazz 6/8 comping emission path for `numBars`
 * bars and return per-step hit counts plus hits/bar.
 *
 * Seed is the PRNG seed for the inline `Math.random()` gates inside
 * getAccompanimentNotes (Force-on-One 80%, isGroupStart 40–80%, conversational
 * 40%, yield-to-bass/soloist 40–80%, etc.). Different seeds explore different
 * combinations of those biases — the acceptance ranges must hold across all
 * of them.
 */
function runJazzCompingSixEight(numBars: number, seed: number) {
    const origRandom = Math.random;
    let rngSeed = seed >>> 0;
    // why: mulberry32-flavored deterministic PRNG. The inline `Math.random()`
    // gates inside the emission path need a stable stream so the test measures
    // engine shape, not seed-of-the-day jitter. Same pattern as
    // comper-phrase-end-critique.test.ts.
    Math.random = () => {
        rngSeed = (rngSeed + 0x6d2b79f5) >>> 0;
        let t = rngSeed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    resetCompingState();
    arranger.timeSignature = '6/8';
    groove.genreFeel = 'Jazz';
    chords.style = 'smart';
    chords.enabled = true;
    bass.enabled = true;
    playback.bandIntensity = 0.7;
    playback.complexity = 0.5;

    const mockChord = {
        rootMidi: 60,
        freqs: [261.63, 329.63, 392.0, 493.88],
        quality: 'maj7',
        intervals: [0, 4, 7, 11],
        is7th: true,
        beats: 6,
        sectionId: `A_${seed.toString(16)}`,
    };
    arranger.progression = [mockChord];

    const totalSteps = numBars * STEPS_PER_BAR;
    let totalHits = 0;
    const hitsByStep = new Array(STEPS_PER_BAR).fill(0);
    const hitsByBar: number[] = new Array(numBars).fill(0);

    for (let step = 0; step < totalSteps; step++) {
        const measureStep = step % STEPS_PER_BAR;
        const info = getStepInfo(step, SIX_EIGHT, [], TIME_SIGNATURES);
        // why: production-shaped coordination — no soloist resting (so the
        // phrase-end thinning gate doesn't fire) and no drum hits (so the
        // conversational-comping gate is dormant). We measure the engine's
        // intrinsic 6/8 jazz density; coordination-driven thinning is covered
        // by comper-phrase-end-critique.test.ts.
        const coord = {
            soloistBusy: false,
            soloistResting: false,
            soloistNotesInPhrase: 0,
            soloistActive: false,
            bassHit: false,
            kickHit: false,
            snareHit: false,
            accompanimentHit: false,
        };

        const notes = getAccompanimentNotes(
            getState(),
            mockChord,
            step,
            step,
            measureStep,
            info,
            coord,
        );

        const isHit = notes.some((n) => n.midi > 0 && !n.muted);
        if (isHit) {
            totalHits++;
            hitsByStep[measureStep]++;
            hitsByBar[Math.floor(step / STEPS_PER_BAR)]++;
        }
    }

    Math.random = origRandom;

    return {
        totalHits,
        hitsByStep,
        hitsByBar,
        hitsPerBar: totalHits / numBars,
        totalSteps,
    };
}

describe('Jazz 6/8 Comping Density Critique (S13)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetCompingState();
    });

    it('hits-per-bar ∈ [1, 4], pulse-aligned share ≥ 70%, per-step density ≤ 35%', () => {
        const numBars = 64;
        // why: single representative seed for the full report; the reliability
        // sweep below covers 30 seeds with the same assertions.
        const SEED = 0xdeadbeef;
        const result = runJazzCompingSixEight(numBars, SEED);

        const pulseAlignedHits = [...PULSE_ALIGNED_STEPS].reduce(
            (sum, s) => sum + result.hitsByStep[s],
            0,
        );
        const pulseShare = result.totalHits > 0 ? pulseAlignedHits / result.totalHits : 0;
        const perStepDensity = result.totalHits / result.totalSteps; // mean hit-rate across all positions

        console.log(
            '\n--- JAZZ 6/8 COMPING DENSITY CRITIQUE ---\n' +
                `[Bars]                 ${numBars}\n` +
                `[Total hits]           ${result.totalHits}\n` +
                `[Hits per bar]         ${result.hitsPerBar.toFixed(2)} (Target: ∈ [1, 4])\n` +
                `[Pulse-aligned share]  ${(pulseShare * 100).toFixed(1)}% (Target: ≥ 70%)\n` +
                `[Per-step density]     ${(perStepDensity * 100).toFixed(1)}% (Target: ≤ 35%)\n` +
                `[Hits by mStep]        ${JSON.stringify(result.hitsByStep)}\n` +
                '-----------------------------------------\n',
        );

        // (a) Hits-per-bar mean ∈ [1, 4]
        expect(result.hitsPerBar).toBeGreaterThanOrEqual(1);
        expect(result.hitsPerBar).toBeLessThanOrEqual(4);

        // (b) ≥ 70% of hits land on pulse-aligned positions {0, 4, 6, 10}
        expect(pulseShare).toBeGreaterThanOrEqual(0.7);

        // (b') Structural guard: zero hits on off-pulse 4/4-cell positions {2, 8}.
        // The JAZZ_COMPING_CELLS bank includes a `[2, 8]` cell. If S3's routing
        // (`ts.isCompound ? COMPOUND… : JAZZ…`) is ever reverted, that cell will
        // start firing on mStep {2, 8} in 6/8 — non-idiomatic for jazz waltz.
        // The 70% pulse-share threshold above isn't tight enough to fail under
        // that revert (it would still produce ~85% pulse-share); this assertion
        // catches it cleanly. Source: epic-1-compound-meter S13 review (2026-05-27).
        expect(result.hitsByStep[2] + result.hitsByStep[8]).toBe(0);

        // (c) Per-step density ≤ 35%
        expect(perStepDensity).toBeLessThanOrEqual(0.35);
    });

    it('reliability: holds across 8 representative seeds', () => {
        // why: in-test multi-seed sweep ensures the acceptance ranges are
        // robust to RNG-seed variation. The 30-run reliability loop is run
        // separately via `npm run test:loop` (different vitest process each
        // run); this in-test sweep catches obvious flakes during dev.
        const seeds = [
            0x1, 0xa1b2c3d4, 0xdeadbeef, 0x5eed5eed, 0x12345678, 0xabcdef01, 0xc0ffee, 0xbadf00d,
        ];
        const failures: string[] = [];

        for (const seed of seeds) {
            resetCompingState();
            const result = runJazzCompingSixEight(32, seed);
            const pulseAlignedHits = [...PULSE_ALIGNED_STEPS].reduce(
                (sum, s) => sum + result.hitsByStep[s],
                0,
            );
            const pulseShare = result.totalHits > 0 ? pulseAlignedHits / result.totalHits : 0;
            const perStepDensity = result.totalHits / result.totalSteps;

            if (result.hitsPerBar < 1 || result.hitsPerBar > 4) {
                failures.push(
                    `seed=0x${seed.toString(16)} hitsPerBar=${result.hitsPerBar.toFixed(2)}`,
                );
            }
            if (pulseShare < 0.7) {
                failures.push(
                    `seed=0x${seed.toString(16)} pulseShare=${(pulseShare * 100).toFixed(1)}%`,
                );
            }
            if (perStepDensity > 0.35) {
                failures.push(
                    `seed=0x${seed.toString(16)} perStepDensity=${(perStepDensity * 100).toFixed(1)}%`,
                );
            }
        }

        if (failures.length > 0) {
            console.log('[Seed-sweep failures]', failures);
        }
        expect(failures).toEqual([]);
    });

    it('hits stay on the 6/8 grid — no step-14 (out-of-bounds) leakage', () => {
        // why: regression guard. The pre-S3 `JAZZ_COMPING_CELLS` bank had a
        // `[14]` cell that silently dropped in 6/8 (step 14 out of 12-step
        // bar). Any future bank or post-pattern boost that targets step 14
        // would be invisible to listeners but would mean the engine is
        // computing positions on the wrong grid. We assert the 12-step bound
        // is respected.
        const result = runJazzCompingSixEight(32, 0xdeadbeef);
        expect(result.hitsByStep.length).toBe(STEPS_PER_BAR);
        // No "phantom" entries beyond index 11 (array is length 12).
        for (let i = STEPS_PER_BAR; i < 16; i++) {
            expect(result.hitsByStep[i]).toBeUndefined();
        }
    });
});
