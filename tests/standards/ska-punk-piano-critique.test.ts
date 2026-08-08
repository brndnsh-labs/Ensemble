/**
 * Ska-Punk Piano "skank" comp — characterization critique (issue #549).
 *
 * The Ska-Punk genre's piano comp lane (`accompaniment.ts`):
 *   • Pattern generator (`generateCompingPattern`, genre === 'Ska' branch,
 *     ~lines 837-851) places an upstroke on EVERY "&" — `getBeatStep(b,
 *     floor(spb/2))` for each beat b. In 4/4 (stepsPerBeat=4, 16-step bar)
 *     that is the four 8th-note offbeats: steps 2, 6, 10, 14.
 *   • Duration is clamped staccato (`durationSteps = Math.min(durationSteps,
 *     1.0)`, ~line 2794) whenever `genre === 'Ska' || chords.style ===
 *     'ska-upstroke'`. Earlier the Ska/Disco branch sets durationSteps =
 *     stepsPerBeat * 0.25 (~line 2756-2757), so the upstroke is short by
 *     construction; the clamp is the hard ceiling.
 *
 * Canonical genre key: the Ska-Punk *smart-genre* sets `genreFeel = 'Ska'`
 * (smart-genres.ts) — NOT the preset name 'Ska-Punk'. The accompaniment
 * branch keys on `genre === 'Ska'`, so the mock sets `groove.genreFeel =
 * 'Ska'`. (Confirmed against the "--- Style Override ---" block in
 * updateRhythmicIntent (accompaniment.ts) — `chords.style === 'ska-upstroke'`
 * sets `genre = 'Ska'` — and the many `genreFeel === 'Ska'` comments
 * across grooves/fills/conductor.)
 *
 * This is a CHARACTERIZATION test of existing behavior — no engine change.
 * It guards three musical claims that the listener hears in a ska piano:
 *   (a) onsets predominate on the offbeat "&" steps,
 *   (b) every emitted chord stab is staccato (durationSteps ≤ 1.0),
 *   (c) the comp gets busier at high band intensity than at low.
 *
 * --- Engine reality (measured over 256 bars per intensity, 4/4) ---
 * The emission path here is fully seeded (no Math.random reaches the gate),
 * so the distribution is deterministic — a rerun at the same config produced
 * byte-identical step histograms. Measured values:
 *
 *   LOW  (i=0.2, c=0.2): density 5.371/bar, offbeat-rate 74.5%, maxDur 1.0
 *   MED  (i=0.5, c=0.4): density 5.516/bar, offbeat-rate 72.5%, maxDur 1.0
 *   HIGH (i=0.85,c=0.7): density 5.699/bar, offbeat-rate 70.2%, maxDur 0.8
 *
 *   Per-step hit histogram (HIGH): step 0 → 239/256 (downbeat anchor, the
 *   `measureStep===0` force-hit at 80%), step 8 → 196/256 (group-start anchor
 *   at beat 3, the `isGroupStart` add scaled `0.4 + intensity*0.4`), and the
 *   four "&" steps 2,6,10,14 → 256/256 each (the deterministic skank). Every
 *   other step is 0. The on-beat hits are the two musical anchors (the "1"
 *   and the felt mid-bar pulse); everything else the piano plays is an
 *   offbeat upstroke — exactly the ska identity.
 *
 * The offbeat-rate is NOT 100% because the engine intentionally anchors the
 * downbeat and the mid-bar group start. The skank is still the dominant
 * gesture by ~3:1. Random baseline for "hit lands on one of 4 specific steps
 * out of 16" under a uniform hit distribution is 4/16 = 25%; the engine
 * delivers ~70%, a 45pt margin over random.
 */
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// The mocked module exposes getState as a vi.fn(); narrow the import so the
// .mockReturnValue calls below typecheck without a blanket @ts-nocheck.
const mockedGetState = getState as unknown as Mock;

// The four 8th-note "&" steps in a 16-step (4/4) bar. Hard-coded from the
// engine's literal `getBeatStep(b, floor(stepsPerBeat/2))` = b*4 + 2 for
// b in {0,1,2,3} — NOT recomputed from any engine predicate (avoids the
// tautology smell).
const SKANK_OFFBEAT_STEPS = [2, 6, 10, 14];
// Uniform-random baseline: a hit landing on one of 4 specific steps out of
// the 16 in a bar is 4/16 = 25% if onsets were uniformly distributed.
const RANDOM_OFFBEAT_BASELINE = 4 / 16;
const STEPS_PER_BAR = 16;

// Partial Chord fixture — getAccompanimentNotes only reads the harmonic
// fields below, so a structural cast keeps the test focused without
// fabricating the dozen display/name fields the full Chord type carries.
const chordC = {
    rootMidi: 60,
    quality: 'major',
    intervals: [0, 4, 7],
    freqs: [261.63, 329.63, 392.0],
    sectionId: 'A',
} as unknown as Parameters<typeof getAccompanimentNotes>[1];

describe('Ska-Punk Piano Skank Critique (#549)', () => {
    // Partial state mock — only the slices the comp engine reads are present;
    // typed `any` deliberately (mirrors the critique-suite convention) so the
    // narrow per-slice shapes don't have to satisfy the full EnsembleState.
    let mockState: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: {
                bandIntensity: 0.5,
                complexity: 0.4,
                step: 0,
                currentLoopCount: 0,
                intent: {},
            },
            // Ska-Punk's canonical genreFeel is 'Ska' (smart-genres.ts), which
            // the accompaniment branch keys on directly.
            groove: { genreFeel: 'Ska', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 100000, progression: [] },
        };
        mockedGetState.mockReturnValue(mockState);
    });

    // Drive the comp lane over `bars` measures and tally where onsets land
    // plus the staccato ceiling actually emitted.
    function runComp(intensity: number, complexity: number, bars: number) {
        mockState.playback.bandIntensity = intensity;
        mockState.playback.complexity = complexity;
        mockState.arranger.progression = [chordC];
        const ts = TIME_SIGNATURES['4/4'];

        const stepHits = new Array(STEPS_PER_BAR).fill(0);
        let totalHits = 0;
        let maxDuration = 0;
        let durationViolations = 0;

        for (let m = 0; m < bars; m++) {
            for (let s = 0; s < STEPS_PER_BAR; s++) {
                const i = m * STEPS_PER_BAR + s;
                mockState.playback.step = i;
                // why: build the real StepInfo via getStepInfo so the engine's
                // isGroupStart / isBeatStart lanes fire on the production
                // values (smell (e) guard — a hand-rolled stepInfo would
                // silence the group-start anchor and skew the on-beat count).
                const info = getStepInfo(i, ts, [], TIME_SIGNATURES);
                const notes = getAccompanimentNotes(getState(), chordC, i, s, s, info, {});
                // A real stab is a non-muted note with a pitch; the no-hit
                // path returns either [] or a muted { midi: 0 } sentinel.
                if (notes.length > 0 && notes[0].midi > 0) {
                    stepHits[s]++;
                    totalHits++;
                    for (const n of notes) {
                        if (n.durationSteps > maxDuration) {
                            maxDuration = n.durationSteps;
                        }
                        if (n.durationSteps > 1.0) {
                            durationViolations++;
                        }
                    }
                }
            }
        }

        let offbeatHits = 0;
        for (const s of SKANK_OFFBEAT_STEPS) {
            offbeatHits += stepHits[s];
        }
        const offbeatRate = offbeatHits / (totalHits || 1);
        const density = totalHits / bars;
        // Each of the 4 skank "&" steps should fire on (nearly) every bar.
        const skankCoverage =
            SKANK_OFFBEAT_STEPS.reduce((sum, s) => sum + stepHits[s], 0) /
            (bars * SKANK_OFFBEAT_STEPS.length);

        return {
            stepHits,
            totalHits,
            offbeatRate,
            density,
            maxDuration,
            durationViolations,
            skankCoverage,
            bars,
        };
    }

    it('(a) onsets predominate on the offbeat "&" steps; (b) every stab is staccato', () => {
        const bars = 256;
        const r = runComp(0.5, 0.4, bars);

        console.log(
            '\n--- SKA-PUNK PIANO CRITIQUE REPORT (medium intensity) ---\n' +
                `[Offbeat Onset Rate]   ${(r.offbeatRate * 100).toFixed(1)}% of stabs land on ` +
                `the "&" steps {2,6,10,14}  (random baseline 25%; Target: >0.60)\n` +
                `[Skank Coverage]       ${(r.skankCoverage * 100).toFixed(1)}% of the 4 expected ` +
                `skank slots/bar fired  (Target: >0.95)\n` +
                `[Max Duration]         ${r.maxDuration} steps  (Target: <=1.0)\n` +
                `[Duration Violations]  ${r.durationViolations} stabs longer than 1.0 step  ` +
                `(Target: 0)\n` +
                `[Rhythmic Density]     ${r.density.toFixed(3)} hits/bar\n` +
                `[Step Histogram]       [${r.stepHits.join(',')}]\n` +
                '----------------------------------------------------------\n',
        );

        // (a) Offbeat predominance. Measured 72.5% at this config (70.2% at the
        //     HIGH-intensity floor — see header). Random baseline is 25%.
        //     Threshold 0.60: sits 45pt above random and ~10pt below the
        //     measured floor across all intensities. The skank lane is fully
        //     deterministic, so there is no run-to-run jitter to absorb — the
        //     10pt margin guards only against a future engine change that adds
        //     more on-beat anchors.
        expect(r.offbeatRate).toBeGreaterThan(0.6);
        expect(r.offbeatRate).toBeGreaterThan(RANDOM_OFFBEAT_BASELINE);

        // Each "&" slot fires on essentially every bar (measured 256/256 =
        // 100% — the skank is deterministic). Threshold 0.95 leaves headroom
        // for any future bar-skip/thinning mechanic while still failing loudly
        // if the upstroke lane goes missing.
        expect(r.skankCoverage).toBeGreaterThan(0.95);

        // (b) Staccato clamp. The Ska duration clamp caps every stab at 1.0
        //     step. Measured maxDuration = 1.0 here. Assert the literal
        //     contract: zero stabs exceed 1.0, and the observed ceiling is
        //     within it.
        expect(r.durationViolations).toBe(0);
        expect(r.maxDuration).toBeLessThanOrEqual(1.0);
    });

    it('(c) comp density rises at high band intensity vs low', () => {
        const bars = 256;
        const low = runComp(0.2, 0.2, bars);
        const high = runComp(0.85, 0.7, bars);

        const delta = high.density - low.density;

        console.log(
            '\n--- SKA-PUNK PIANO INTENSITY RESPONSE ---\n' +
                `[Low  i=0.2 ]  density ${low.density.toFixed(3)} hits/bar  ` +
                `offbeat ${(low.offbeatRate * 100).toFixed(1)}%\n` +
                `[High i=0.85]  density ${high.density.toFixed(3)} hits/bar  ` +
                `offbeat ${(high.offbeatRate * 100).toFixed(1)}%\n` +
                `[Density Rise] +${delta.toFixed(3)} hits/bar  (Target: >0.10)\n` +
                '------------------------------------------\n',
        );

        // (c) Density rises with intensity. The four deterministic skanks are
        //     intensity-independent; the rise comes from the downbeat-anchor
        //     (step 0: 223→239) and group-start-anchor (step 8: 128→196)
        //     gates, which scale with bandIntensity. Measured: 5.371 (low) →
        //     5.699 (high) = +0.328/bar. Both endpoints are deterministic
        //     (seeded gates, no Math.random — rerun reproduced identical
        //     histograms), so the +0.328 gap has no jitter to absorb.
        //     Threshold +0.10 sits ~0.23 below the measured gap; the margin
        //     guards against an engine change that flattens the intensity
        //     response rather than against run-to-run noise.
        expect(high.density).toBeGreaterThan(low.density);
        expect(delta).toBeGreaterThan(0.1);

        // Both intensity extremes keep the ska identity: offbeats still
        // predominate (measured 74.5% low, 70.2% high). Guards against a
        // future "high intensity floods the downbeat" regression.
        expect(low.offbeatRate).toBeGreaterThan(0.6);
        expect(high.offbeatRate).toBeGreaterThan(0.6);
    });
});
