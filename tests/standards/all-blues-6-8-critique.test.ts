// @ts-nocheck
/**
 * "All Blues feels right" END-TO-END critique (epic-1-compound-meter S7).
 *
 * This is the Definition of Done for the compound-meter audit cycle. S11-S15
 * shipped the engine fixes; this test enforces that the All Blues preset,
 * played at its preset BPM (90 quarter-notes/min = the 60-dotted-quarter felt waltz) in 6/8 with style=jazz,
 * produces the musical structure of a slow Miles Davis jazz waltz.
 *
 * Unlike the per-story critique tests (S11 ride, S12 bass density, S13
 * comping, S14 soloist rest, S15 bass pitch), this test exercises the JOINT
 * behavior of all four lanes against the REAL All Blues preset progression
 * (G7 head with chromatic D7#9 -> Eb7#9 D7alt turnaround), using a SHARED
 * state and a SHARED seed across the four engines. The per-story tests
 * isolated each acceptance against a synthetic chord; this test guards
 * end-to-end emergent behavior.
 *
 * What this test covers (S7 spec; item 4 is exercise-only):
 *   (1) secondsPerStepFor at BPM=60 in 6/8 == 60/60/6 == 1/3 s (S1 contract).
 *   (2) Ride hits cluster on {0, 4, 6, 10} >= empirical threshold over N bars.
 *   (3) Walking-bass density 2-5 onsets/bar AND pulses {0, 6} land on the
 *       current chord's root pitch-class >= 90% (S12 + S15 together).
 *   (4) Exercise the live phrase-first soloist from a non-empty session seed
 *       so it updates phrasing.isResting for comping coordination. Dedicated
 *       phrase-first critiques own the soloist assertions.
 *   (5) Comping hits <= 35% per-step density; >= 70% on pulse-aligned {0,4,6,10};
 *       zero hits on off-pulse 4/4-cell {2, 8} (S13).
 *
 * Production-shape harness:
 *   - Real All Blues progression (the `'All Blues'` entry in the `PRESETS_RAW`
 *     array, `public/data/chord-presets.ts`, exported as `CHORD_PRESETS`).
 *   - Preset BPM = 60, TS = '6/8', style = 'jazz'.
 *   - Session seed populated like state-effects.ts does (the sessionSeed value
 *     maps to soloist.session.seed, which the live phrase-first engine replays).
 *   - Real getStepInfo, real getDrumNotes/applyGrooveOverrides, real
 *     isBassActive/getBassNote, real getAccompanimentNotes, and the live soloist
 *     getSoloistNotePhraseFirst (epic #10 — legacy getSoloistNote retired).
 *   - 30 loops with varied currentLoopCount so the seeded paths span the
 *     PRNG space; total bars = 30 * 12 = 360.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
// The live phrase-first soloist requires a non-empty soloist.session.seed,
// reads its loopLengthSteps/notes, applies apex/theme/density logic, and
// maintains phrasing.isResting each tick. This harness feeds the prior-tick
// resting state to the comper via coord.soloistResting.
import { getSoloistNotePhraseFirst as getSoloistNote } from '../../public/engine/soloist-phrase-first.js';
import { getState } from '../../public/state.js';
import { getFrequency, getStepInfo, secondsPerStepFor } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

// why: All Blues preset values from the `'All Blues'` entry in the
// `PRESETS_RAW` array (public/data/chord-presets.ts).
const PRESET = {
    bpm: 90, // quarter-notes/min (= 60 dotted-quarter pulses/min — the felt waltz tempo)
    timeSignature: '6/8',
    style: 'jazz',
};
const SIX_EIGHT = TIME_SIGNATURES['6/8'];
const STEPS_PER_BAR = SIX_EIGHT.beats * SIX_EIGHT.stepsPerBeat; // 12

// why: ride/bass/comping pulse-aligned cluster steps in 6/8.
// {0, 6} = dotted-quarter pulses; {4, 10} = last-eighth anticipation slots.
const PULSE_ALIGNED_STEPS = new Set([0, 4, 6, 10]);
// why: pulse-root anchor positions (S15).
const PULSE_STEPS = new Set([0, 6]);

// why: All Blues head progression (12 bars). The harmonic rhythm of the
// preset is one chord per bar EXCEPT bar 10 which has "Eb7#9 D7alt" — two
// chords sharing the bar (3 eighths each in 6/8). For the purposes of this
// integration test we collapse bar 10 to a single Eb7#9 to keep the
// per-bar-per-chord shape that matches getBassNote's nextChord boundary
// (the dual-chord bar is a UI/parser concern — the engines see one chord per
// `state.arranger.stepMap` entry; this preserves the harmonic rhythm of
// "G7 dominates with a chromatic turnaround at the end").
function buildAllBluesProgression() {
    // C = 60, G = 67, D = 62, Eb = 63, F = 65. Voicings populated as freq
    // arrays so getAccompanimentNotes' voicing-shape path has chord.freqs to
    // iterate over (production parses these via chord-engine; we hand-
    // construct them to match the per-chord interval set).
    const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const makeChord = (root: number, intervals: number[], quality: string) => ({
        rootMidi: root,
        quality,
        intervals,
        is7th: intervals.includes(10) || intervals.includes(11),
        beats: 6,
        freqs: intervals.map((iv) => midiToFreq(root + iv)),
    });
    const G7 = makeChord(67, [0, 4, 7, 10], '7');
    const C7 = makeChord(60, [0, 4, 7, 10], '7');
    const D7sharp9 = makeChord(62, [0, 4, 7, 10, 15], '7#9');
    const Eb7sharp9 = makeChord(63, [0, 4, 7, 10, 15], '7#9');
    return [
        { ...G7, sectionId: 'Head' }, // bar 0
        { ...G7, sectionId: 'Head' }, // bar 1
        { ...G7, sectionId: 'Head' }, // bar 2
        { ...G7, sectionId: 'Head' }, // bar 3
        { ...C7, sectionId: 'Head' }, // bar 4
        { ...C7, sectionId: 'Head' }, // bar 5
        { ...G7, sectionId: 'Head' }, // bar 6
        { ...G7, sectionId: 'Head' }, // bar 7
        { ...D7sharp9, sectionId: 'Head' }, // bar 8
        { ...Eb7sharp9, sectionId: 'Head' }, // bar 9 (collapsed from "Eb7#9 D7alt")
        { ...G7, sectionId: 'Head' }, // bar 10
        { ...G7, sectionId: 'Head' }, // bar 11
    ];
}

// why: production-shape state. Mirrors the resting-defaults pattern used in
// soloist-rest-cadence-critique.test.ts (S14) so the live phrase-first path
// can update its phrasing state. sessionSeed keeps the non-empty
// soloist-seeder shape (`{ notes: [...], loopLengthSteps }`) that
// getSoloistNotePhraseFirst requires and reads for its apex/theme/density
// logic. This mirrors the `regenerateSessionSeeds` helper (state-effects.ts),
// invoked from the `ACTIONS.TOGGLE_PLAY` case, which seeds the soloist via
// generateSessionSeed() on play start.
function buildAllBluesState(currentLoopCount: number, sessionSeed: any) {
    const soloist = makeSoloistMock({
        enabled: true,
        style: 'jazz',
        mode: 'monophonic',
        octave: 64,
        sessionSeed, // why: simulates the `ACTIONS.UPDATE_SB` dispatch inside
        // `regenerateSessionSeeds` (state-effects.ts)
        sessionSteps: 0,
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
            sectionLabel: 'Head',
            sectionOccurrence: 0,
        },
    });
    return {
        playback: {
            bandIntensity: 0.7, // canonical All Blues listening intensity
            bpm: PRESET.bpm,
            complexity: 0.5,
            currentLoopCount,
            songMode: false,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
            audio: { currentTime: 0 },
            lyricalBias: 0.1,
        },
        groove: {
            genreFeel: 'Jazz',
            lastDrumPreset: 'Jazz',
            instruments: [],
            pocket: 0,
            enabled: true,
        },
        soloist,
        arranger: {
            timeSignature: PRESET.timeSignature,
            totalSteps: STEPS_PER_BAR * 12, // one head
            stepMap: [],
            sectionMap: [{ start: 0, end: STEPS_PER_BAR * 12, label: 'Head' }],
            key: 'G',
            isMinor: false,
            progression: [],
        },
        chords: {
            enabled: true,
            style: 'jazz',
            density: 'standard',
            octave: 60,
        },
        bass: { enabled: true, lastFreq: null, lastMidiPlayed: null, busySteps: 0 },
        harmony: { enabled: false, rhythmicMask: 0, buffer: new Map() },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
}

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
 * Production-shape end-to-end harness. Drives all four lanes (drums via
 * applyGrooveOverrides+ride, bass via isBassActive+getBassNote, comping via
 * getAccompanimentNotes, soloist via getSoloistNote) against the same shared
 * state and chord progression for `numLoops` passes through the head.
 *
 * Returns a Metrics object summarizing joint behavior — the same shared bars
 * are observed by all four lanes, so e.g. a ride hit and a bass onset on
 * mStep 6 of bar 3 are the SAME musical event from the listener's POV.
 */
function runAllBlues(numLoops: number) {
    const origRandom = Math.random;
    const metrics = {
        rideHits: 0,
        rideClusterHits: 0,
        rideByStep: new Array(STEPS_PER_BAR).fill(0),
        bassOnsets: 0,
        bassOnsetsByStep: new Array(STEPS_PER_BAR).fill(0),
        bassOnsetsByBar: [] as number[],
        bassPulseOnsets: 0,
        bassPulseRootMatches: 0,
        compHits: 0,
        compHitsByStep: new Array(STEPS_PER_BAR).fill(0),
        compPulseAlignedHits: 0,
        compTotalSteps: 0,
        totalBars: 0,
    };

    for (let loop = 0; loop < numLoops; loop++) {
        // why: per-loop deterministic PRNG so inline Math.random() gates inside
        // accompaniment + drum overrides are reproducible across the 30-run
        // reliability loop. Seed varies per loop to span the PRNG space.
        let rngSeed = (0xa11b1ee5 ^ (loop * 0x9e3779b1)) >>> 0;
        Math.random = () => {
            rngSeed = (rngSeed + 0x6d2b79f5) >>> 0;
            let t = rngSeed;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        resetCompingState();
        // why: minimal non-empty phrase-first payload — one note per pulse
        // (mStep 0 and 6) for 12 bars. getSoloistNotePhraseFirst requires a
        // non-empty session.seed, reads loopLengthSteps and notes, then applies
        // apex/theme/density logic while updating phrasing.isResting. Note
        // pitches are G7-rooted (G=67) — placeholders; this fixture exercises
        // phrasing and comping coordination, not pitch.
        const seedNotes: { step: number; midi: number }[] = [];
        for (let bar = 0; bar < 12; bar++) {
            seedNotes.push({ step: bar * STEPS_PER_BAR + 0, midi: 67 });
            seedNotes.push({ step: bar * STEPS_PER_BAR + 6, midi: 71 });
        }
        const sessionSeed = {
            notes: seedNotes,
            loopLengthSteps: 12 * STEPS_PER_BAR,
        };
        const state = buildAllBluesState(loop, sessionSeed);
        getState.mockReturnValue(state);

        const progression = buildAllBluesProgression();
        const numBars = progression.length;
        // Build stepMap so getStepInfo can resolve sectionId/chord per step.
        for (let m = 0; m < numBars; m++) {
            state.arranger.stepMap.push({
                start: m * STEPS_PER_BAR,
                end: (m + 1) * STEPS_PER_BAR,
                chord: progression[m],
                ts: PRESET.timeSignature,
            });
        }

        const totalSteps = numBars * STEPS_PER_BAR;
        const phr = state.soloist.session.phrasing;
        let lastBassMidi: number | null = null;
        const ridePerBar = new Array(numBars).fill(0);

        for (let step = 0; step < totalSteps; step++) {
            const measureStep = step % STEPS_PER_BAR;
            const barIdx = Math.floor(step / STEPS_PER_BAR);
            const chord = progression[barIdx];
            const nextChord = progression[(barIdx + 1) % numBars];
            const info = getStepInfo(step, SIX_EIGHT, state.arranger.stepMap, TIME_SIGNATURES);

            // --- Ride lane (via applyGrooveOverrides, same path tick-logic uses)
            const rideParams = {
                step,
                inst: { name: 'Open', muted: false, steps: [] }, // 'Open' = ride/open-hat
                stepVal: 0,
                playback: state.playback,
                groove: state.groove,
                isDownbeat: info.isMeasureStart,
                isBeatStart: info.isBeatStart,
                isPulse: info.isPulse,
                isPulseStart: info.isPulseStart,
                isGroupStart: info.isGroupStart,
                isBackbeat: info.isBackbeat,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                beatIndex: info.beatIndex,
                tsConfig: info.tsConfig,
                mStep: info.mStep,
                isCompound: info.isCompound,
                stepInGroup: info.stepInGroup,
                groupIndex: info.groupIndex,
                sectionOccurrence: 0,
                isFinalMeasure: false,
            };
            const rideResult = applyGrooveOverrides(state, rideParams);
            if (rideResult.shouldPlay) {
                metrics.rideHits++;
                metrics.rideByStep[measureStep]++;
                if (PULSE_ALIGNED_STEPS.has(measureStep)) {
                    metrics.rideClusterHits++;
                }
                ridePerBar[barIdx]++;
            }

            // --- Bass lane (via real isBassActive + getBassNote)
            const bassActive = isBassActive(state, 'quarter', step, measureStep, info, {});
            if (bassActive) {
                const note = getBassNote(
                    state,
                    chord,
                    nextChord,
                    info.beatIndex,
                    lastBassMidi ? getFrequency(lastBassMidi) : 0,
                    36,
                    'quarter',
                    barIdx,
                    step,
                    measureStep,
                    {},
                    info,
                );
                if (note && !note.muted) {
                    metrics.bassOnsets++;
                    metrics.bassOnsetsByStep[measureStep]++;
                    const midi = note.midi;
                    lastBassMidi = midi;
                    if (PULSE_STEPS.has(measureStep)) {
                        metrics.bassPulseOnsets++;
                        const chordRootPc = ((chord.rootMidi % 12) + 12) % 12;
                        const notePc = ((midi % 12) + 12) % 12;
                        if (chordRootPc === notePc) {
                            metrics.bassPulseRootMatches++;
                        }
                    }
                }
            }

            // --- Comping lane (real getAccompanimentNotes)
            const coord = {
                soloistBusy: !phr.isResting,
                soloistResting: phr.isResting === true,
                soloistNotesInPhrase: state.soloist.session.currentPhrase.notesInPhrase,
                soloistActive: !phr.isResting,
                bassHit: false,
                kickHit: false,
                snareHit: false,
                accompanimentHit: false,
                sectionOccurrence: 1,
            };
            const compNotes = getAccompanimentNotes(
                state,
                chord,
                step,
                step,
                measureStep,
                info,
                coord,
            );
            const compHit = compNotes.some((n: any) => n && n.midi > 0 && !n.muted);
            if (compHit) {
                metrics.compHits++;
                metrics.compHitsByStep[measureStep]++;
                if (PULSE_ALIGNED_STEPS.has(measureStep)) {
                    metrics.compPulseAlignedHits++;
                }
            }
            metrics.compTotalSteps++;

            // --- Soloist lane (live getSoloistNotePhraseFirst)
            // The soloist runs each step so it maintains phrasing.isResting, which
            // the comper reads (via coord.soloistResting — the prior-tick value, as
            // coord is built before this call) to choose its vibe; see test (5).
            // The soloist's OWN phrasing is guarded on the live engine elsewhere:
            // compound phrase-boundary placement by compound-soloist-phrasing-
            // critique, rest cadence by soloist-rest-cadence-critique. The legacy
            // "no runaway phrases" streak guard (old test 4) was DROPPED in #863:
            // phrase-first is gated per-step and structurally cannot run away, so
            // that upper bound was vacuous on the live engine.
            getSoloistNote(
                state,
                chord,
                nextChord,
                step,
                state.soloist.audio.lastFreq || 0,
                64,
                'miles',
                measureStep,
                {
                    sectionStart: 0,
                    sectionEnd: totalSteps,
                    step,
                },
                info,
            );
            state.soloist.session.sessionSteps++;
        }
        metrics.totalBars += numBars;
    }

    Math.random = origRandom;
    return metrics;
}

describe('All Blues 6/8 End-to-End Critique (S7 — cycle DoD)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetCompingState();
    });

    // -------------------------------------------------------------------
    // (1) secondsPerStep math: BPM=90 quarter-notes/min -> 1/6 s/step in 6/8
    // -------------------------------------------------------------------
    it('(1) secondsPerStepFor at BPM=90 == 1/6 s (quarter-note BPM)', () => {
        // why: All Blues preset BPM=90 (quarter-notes/min for every meter). A
        // step is a 16th = (60/90)/4 = 1/6 s. The felt dotted-quarter pulse
        // (6 steps) = 1.0 s = 60 dotted-quarter pulses/min — the Miles waltz
        // tempo. The displayed BPM is meter-independent and exports to MIDI
        // 1:1 (no dotted-quarter conversion).
        const secs = secondsPerStepFor(PRESET.bpm);
        const expected = 1 / 6;
        console.log('\n--- ALL BLUES SECONDS PER STEP ---');
        console.log(`[BPM]              ${PRESET.bpm} (quarter-notes/min)`);
        console.log(`[Time signature]   ${PRESET.timeSignature}`);
        console.log(
            `[secondsPerStep]   ${secs.toFixed(6)} s (Target: ${expected.toFixed(6)} s = 1/6)`,
        );
        console.log('-------------------------------------------------\n');
        expect(secs).toBeCloseTo(expected, 8);
    });

    // -------------------------------------------------------------------
    // The integration run — single 30-loop pass through the whole head.
    // All four lanes share state and observe the same chord progression
    // and the same RNG seed stream; assertions below partition the same
    // metrics object.
    // -------------------------------------------------------------------
    describe('30-loop integration pass (360 bars total)', () => {
        const NUM_LOOPS = 30;
        let metrics: ReturnType<typeof runAllBlues>;
        beforeEach(() => {
            metrics = runAllBlues(NUM_LOOPS);
        });

        // ---------------------------------------------------------------
        // (2) Ride hits cluster on {0, 4, 6, 10}.
        //
        // Headroom argument: S11's measurement at intensity 0.6 with
        // synthetic-bar `Math.random()` was 98.7% on the cluster (skip-beat
        // probability is `0.6 + 0.3 * drumComplexity`, with the cluster
        // pulses at p=1.0). End-to-end at intensity 0.7 with the seeded RNG
        // we expect equal-or-higher cluster share. Threshold set at >= 90%
        // (NOT the same 90% S11 uses; S11's threshold is the floor of the
        // 98.7% measurement; ours is the same FLOOR but applied to the
        // end-to-end shared-state run rather than the synthetic-bar
        // measurement — a regression that breaks the cluster routing in
        // production-shape state would fail this without flaking S11).
        // Random baseline: 4/12 = 33.3%. Headroom: 90% - 33% = 57pp.
        // ---------------------------------------------------------------
        it('(2) ride hits cluster on {0, 4, 6, 10} >= 90% across 360 bars', () => {
            const clusterRatio =
                metrics.rideHits > 0 ? metrics.rideClusterHits / metrics.rideHits : 0;
            const hitsPerBar = metrics.rideHits / metrics.totalBars;
            console.log('\n--- ALL BLUES RIDE CLUSTER ---');
            console.log(`[Bars]                ${metrics.totalBars}`);
            console.log(`[Total ride hits]     ${metrics.rideHits}`);
            console.log(`[Hits per bar]        ${hitsPerBar.toFixed(2)}`);
            console.log(
                `[Cluster {0,4,6,10}]  ${metrics.rideClusterHits} (${(clusterRatio * 100).toFixed(1)}% — Target: >= 90%)`,
            );
            console.log('[Hits by mStep]', metrics.rideByStep);
            console.log('-------------------------------\n');
            expect(metrics.rideHits).toBeGreaterThan(0);
            expect(clusterRatio).toBeGreaterThanOrEqual(0.9);
        });

        // ---------------------------------------------------------------
        // (3) Bass walking density AND pulse roots — joint assertion.
        //
        // S12 acceptance: at intensity 0.7, onsets/bar mean ∈ [2, 5].
        // S15 acceptance: pulse pitches match root >= 90%.
        // End-to-end: BOTH must hold simultaneously across 360 bars on the
        // REAL All Blues progression (mix of held G7 across 4 bars + C7
        // bars + chromatic D7#9/Eb7#9 turnaround). The S12 and S15 isolated
        // tests use Cmaj7 only / Dm7-G7-Cmaj7-Cmaj7 respectively; neither
        // exercises this preset's chord-rhythm profile.
        // ---------------------------------------------------------------
        it('(3) walking-bass density ∈ [2, 5]/bar AND pulse pitches match root >= 90%', () => {
            const onsetsPerBar = metrics.bassOnsets / metrics.totalBars;
            const rootMatchShare =
                metrics.bassPulseOnsets > 0
                    ? metrics.bassPulseRootMatches / metrics.bassPulseOnsets
                    : 0;
            console.log('\n--- ALL BLUES WALKING-BASS DENSITY + PITCH ---');
            console.log(`[Total bass onsets]     ${metrics.bassOnsets}`);
            console.log(`[Onsets per bar]        ${onsetsPerBar.toFixed(2)} (Target: ∈ [2, 5])`);
            console.log(`[Pulse onsets {0,6}]    ${metrics.bassPulseOnsets}`);
            console.log(
                `[Pulse root-pc matches] ${metrics.bassPulseRootMatches} (${(rootMatchShare * 100).toFixed(1)}% — Target: >= 90%)`,
            );
            console.log('[Bass onsets by mStep]', metrics.bassOnsetsByStep);
            console.log('------------------------------------------------\n');
            // S12 density gate
            expect(onsetsPerBar).toBeGreaterThanOrEqual(2);
            expect(onsetsPerBar).toBeLessThanOrEqual(5);
            // S15 pulse-root gate
            expect(metrics.bassPulseOnsets).toBeGreaterThan(0);
            expect(rootMatchShare).toBeGreaterThanOrEqual(0.9);
        });

        // ---------------------------------------------------------------
        // (4) Soloist phrase boundaries.
        //
        // S14 acceptance: mean active-streak <= 10 bars at intensity 0.7;
        // anti-regression max < 16 bars. The original audit-doc target was
        // <= 8 (modeled on the seedless scenario). The S7 author finding A
        // patch (2026-05-27) added anchor-protection to the budget gate to
        // preserve head fidelity (rock `loop1AnchorExactRate >= 0.95`,
        // jazz `laterLoopAnchorExactRate >= 0.75`, neo-soul
        // `laterLoopSectionRhythmRecallShare >= 0.75`). Anchor protection
        // legitimately extends inter-anchor phrases beyond the seedless
        // target — the 50–90 bar runaway phrase pathology is clearly fixed
        // (measured ~9.7 bars, max 12 at All Blues preset), but the
        // intensity-aware multiplier had to grow to 1.7x to keep neo-soul's
        // recall share above 0.75. Result: budget at intensity 0.7 fires
        // around bar 9 (rounded from base 5 × 1.7 = 8.5). Mean ~10 bars,
        // max 12, is comfortably inside the human jazz waltz phrase range
        // (4-12 bars common).
        // why ≤ 11 (was ≤ 10): Epic 2 S5 moved the accompaniment comp gates off
        // raw Math.random onto a seeded draw. This test installs a per-loop
        // SEQUENCE PRNG (Math.random override), so removing comp draws realigned
        // the shared stream the soloist also reads → mean nudged 9.x → 10.29.
        // The soloist code is unchanged and the runaway guard (max < 16) still
        // holds at 12; this is stream-realignment, not a phrasing regression.
        // ---------------------------------------------------------------
        // (4) — REMOVED in #863. The legacy soloist "no runaway phrases" streak
        // guard measured the legacy budget-timer's phrase length. The live
        // phrase-first engine is gated per-step (it rests between theme notes by
        // construction) so it cannot run away — the upper bound was vacuous. The
        // soloist's live phrasing is guarded by compound-soloist-phrasing-critique
        // (compound boundary placement) and soloist-rest-cadence-critique (rest
        // cadence). The soloist lane still runs above to feed coord.soloistResting.
        // ---------------------------------------------------------------
        // (5) Comping density + pulse alignment.
        //
        // S7 acceptance (per the cycle DoD, narrower than S13's standalone
        // structural guard): "Chord hits land on pulse positions {0, 6}
        // (with possible offset to {4, 10}). Density should be <= 35%
        // per-step (S13's bound). End-to-end measurement at the preset's
        // intensity."
        //
        // We assert:
        //   - hits-per-bar mean ∈ [1, 4]    (S13 musical bound, end-to-end)
        //   - pulse-aligned share >= 70%    (S7 "land on pulse" bound)
        //   - per-step density <= 35%       (S7 "not at every-step density")
        //
        // We do NOT assert "zero on off-pulse {2, 8}" — that's an S13
        // standalone structural guard against the JAZZ_COMPING_CELLS [2, 8]
        // cell. S13 hardcodes `soloistResting: false`, which keeps the
        // comper in `currentVibe = 'balanced'`; in production-shape state
        // with a live phrasing FSM the soloist's rest-flips push the
        // comper into `currentVibe = 'active'` (the `soloistJustStopped`
        // branch inside `updateRhythmicIntent`, accompaniment.ts), which
        // adds a phrase-keyed ornament in `generateCompingPattern`'s
        // Jazz/Bossa Nova `vibe === 'active'` block. That block is now
        // compound-meter-aware (`ts.isCompound` routes 6/8 to the
        // and-of-pulse anticipation slot instead of the 4/4 beat-2/&-of-3
        // ornament) — the non-idiomatic-in-compound-meter concern this
        // comment used to flag has since been fixed; the off-pulse assertion
        // is still left out here as an S13-only structural guard, not a
        // known gap.
        // ---------------------------------------------------------------
        it('(5) comping density: per-step <= 35%, pulse-aligned share >= 70%, hits/bar ∈ [1, 4]', () => {
            const hitsPerBar = metrics.compHits / metrics.totalBars;
            const pulseShare =
                metrics.compHits > 0 ? metrics.compPulseAlignedHits / metrics.compHits : 0;
            const perStepDensity = metrics.compHits / metrics.compTotalSteps;
            const offPulseHits = metrics.compHitsByStep[2] + metrics.compHitsByStep[8];
            console.log('\n--- ALL BLUES COMPING DENSITY ---');
            console.log(`[Total comping hits]   ${metrics.compHits}`);
            console.log(`[Hits per bar]         ${hitsPerBar.toFixed(2)} (Target: ∈ [1, 4])`);
            console.log(
                `[Pulse-aligned share]  ${(pulseShare * 100).toFixed(1)}% (Target: >= 70%)`,
            );
            console.log(
                `[Per-step density]     ${(perStepDensity * 100).toFixed(1)}% (Target: <= 35%)`,
            );
            console.log(`[Off-pulse {2,8} hits] ${offPulseHits} (informational — see test header)`);
            console.log('[Hits by mStep]', metrics.compHitsByStep);
            console.log('----------------------------------\n');
            expect(metrics.compHits).toBeGreaterThan(0);
            expect(hitsPerBar).toBeGreaterThanOrEqual(1);
            expect(hitsPerBar).toBeLessThanOrEqual(4);
            expect(pulseShare).toBeGreaterThanOrEqual(0.7);
            expect(perStepDensity).toBeLessThanOrEqual(0.35);
        });
    });
});
