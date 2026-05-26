// @ts-nocheck
// tests/standards/final-bar-cadence.test.ts
//
// Critique test for `epic-form-arrangement` S4 — Final-bar resolution cascade.
//
// When song-mode playback is ENDING (`playback.isEndingPending`) and the
// current tick is inside the FINAL measure of the form, the band should land
// together on the form's final downbeat:
//
//   - Drums: Crash on the Open lane, reinforced Kick, punctuation Snare; HiHat
//     suppressed so the cymbal swell rings out.
//   - Bass:  Sustained tonic on beat 1 (root of the final chord), held; no
//     pattern notes on subsequent sub-beats.
//   - Chords: Root-position cadence voicing (root + 3rd + 5th, optional 7th)
//     on beat 1; silence on subsequent sub-beats so the voicing rings out.
//
// Currently only the soloist senses the form's end via SRDC's `conclusion`
// phase (`soloist.ts:1257`). This makes the rest of the band end together.
//
// Test strategy: rather than going through the full `generateNotesForStep`
// pipeline (which would require mocking every engine), this test exercises
// each engine in isolation given a coordination object with `isFinalMeasure=
// true`. This is the same pattern used by `bass-imperfect-symmetry-critique`,
// `drums-imperfect-symmetry-critique`, and `accompaniment-imperfect-symmetry-
// critique` — the producer-order invariant is guarded separately by
// `tests/unit/engine/producer-order.test.ts`.
//
// One extra test (`isFinalMeasure publication`) exercises `generateNotesForStep`
// end-to-end to verify the chord-data preamble publishes the flag at exactly
// the steps the audit doc specifies, AND no earlier.
//
// 30-run reliability documented at the end of this file header.
// Measured 2026-05-17: 30/30 passes.
//
// Source: docs/audit/form-arranger.md P1 #6;
//         docs/audit/epic-form-arrangement.md S4.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// --- Fixtures ----------------------------------------------------------------

const TS_CONFIG = TIME_SIGNATURES['4/4'];
const STEPS_PER_BEAT = TS_CONFIG.stepsPerBeat; // 4
const STEPS_PER_BAR = TS_CONFIG.beats * STEPS_PER_BEAT; // 16
const FORM_BARS = 4;
const FORM_STEPS = FORM_BARS * STEPS_PER_BAR; // 64

// C major (MIDI 48 root in bass register; 60 root in chord register). The
// final chord of the form — bass holds this tonic, chords build the cadence
// voicing from this root.
const CHORD_C_BASS = {
    rootMidi: 48,
    quality: 'maj7',
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [130.81, 164.81, 196.0, 246.94],
    sectionId: 'sec-outro',
};

const CHORD_C_CHORDS = {
    rootMidi: 60,
    quality: 'maj7',
    is7th: true,
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [261.63, 329.63, 392.0, 493.88],
    sectionId: 'sec-outro',
};

function makeCoordination(opts: { isFinalMeasure?: boolean } = {}) {
    return {
        sectionStart: 0,
        sectionEnd: FORM_STEPS,
        sectionOccurrence: 1,
        isFinalMeasure: opts.isFinalMeasure === true,
        kickHit: false,
        snareHit: false,
        soloistBusy: false,
        soloistMidi: 0,
        bassHit: false,
        bassMidi: 0,
    };
}

function makeBassMockState(overrides = {}) {
    return {
        // why: intensity 0.6 sits above all the lower-gate thresholds (Sidestick
        // 0.4, Imperfect Symmetry 0.4) so the engine is in its primary lane.
        playback: { bandIntensity: 0.6, bpm: 120, complexity: 0.4, intent: {} },
        groove: { genreFeel: 'Rock', pocket: 0, instruments: [], measures: 1 },
        soloist: makeSoloistMock({ busySteps: 0, tension: 0, enabled: false }),
        arranger: {
            timeSignature: '4/4',
            totalSteps: FORM_STEPS,
            stepMap: [],
            sectionMap: [],
        },
        bass: { lastFreq: null, busySteps: 0, lastMidiPlayed: null },
        ...overrides,
    };
}

// --- Bass engine isolation ---------------------------------------------------

describe('Final-bar cadence — Bass (epic-form-arrangement S4)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('plays sustained tonic on beat 1 of the final bar (held)', () => {
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        // Step at the downbeat of the final bar: step = FORM_STEPS - STEPS_PER_BAR = 48.
        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const stepInfo = getStepInfo(finalDownbeat, TS_CONFIG, [], TIME_SIGNATURES);
        const coordination = makeCoordination({ isFinalMeasure: true });

        // why: even if a style's per-step gate would have skipped the downbeat,
        // isBassActive force-activates when isFinalMeasure && isMeasureStart.
        const active = isBassActive(getState(), 'rock', finalDownbeat, 0, stepInfo, coordination);
        expect(active).toBe(true);

        const note = getBassNote(
            getState(),
            CHORD_C_BASS,
            CHORD_C_BASS,
            finalDownbeat / STEPS_PER_BEAT,
            null,
            48,
            'rock',
            0,
            finalDownbeat,
            0,
            { sectionStart: 0, sectionEnd: FORM_STEPS, stepCoordination: coordination },
            stepInfo,
        );

        // why: bass must play the tonic of the final chord — pitch class
        // equal to `chord.rootMidi % 12` (= 0 for this C-rooted fixture, but
        // the assertion is parameterized on the chord, not the literal 0,
        // so a regression that ignored rootMidi and emitted a fixed C would
        // be caught by the D-rooted variant below).
        expect(note).not.toBeNull();
        expect(note?.midi).toBeDefined();
        const expectedRootPc = ((CHORD_C_BASS.rootMidi % 12) + 12) % 12;
        expect((((note.midi as number) % 12) + 12) % 12).toBe(expectedRootPc);

        // why: duration must be the full measure (16 steps in 4/4). The
        // bass cadence constructs the note dict directly, bypassing
        // result()'s per-style maxSafeDuration clamp — so a regression that
        // routed the cadence through result() and got clamped to ~3.8
        // would be caught. Threshold STEPS_PER_BAR - 1 leaves a margin for
        // any future minor adjustments while still requiring a true sustain.
        // eslint-disable-next-line no-console
        console.log(
            `[final-bar-cadence] bass downbeat: midi=${note.midi}, durationSteps=${note.durationSteps}`,
        );
        expect(note.durationSteps).toBeGreaterThanOrEqual(STEPS_PER_BAR - 1);
    });

    it('holds the tonic of a non-C final chord (root-driven, not fixture-driven)', () => {
        // why: regression guard for "engine ignores chord.rootMidi and emits
        // a hard-coded pitch class." If the cadence were hard-wired to C, this
        // D-rooted fixture would still report pc=0 and we'd never know.
        const CHORD_D_BASS = {
            rootMidi: 50, // D
            quality: 'm7',
            beats: 4,
            intervals: [0, 3, 7, 10],
            freqs: [146.83, 174.61, 220.0, 261.63],
            sectionId: 'sec-outro',
        };
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const stepInfo = getStepInfo(finalDownbeat, TS_CONFIG, [], TIME_SIGNATURES);
        const coordination = makeCoordination({ isFinalMeasure: true });

        const note = getBassNote(
            getState(),
            CHORD_D_BASS,
            CHORD_D_BASS,
            finalDownbeat / STEPS_PER_BEAT,
            null,
            50,
            'rock',
            0,
            finalDownbeat,
            0,
            { sectionStart: 0, sectionEnd: FORM_STEPS, stepCoordination: coordination },
            stepInfo,
        );

        expect(note).not.toBeNull();
        const expectedPc = ((CHORD_D_BASS.rootMidi % 12) + 12) % 12; // 2 (D)
        expect((((note.midi as number) % 12) + 12) % 12).toBe(expectedPc);
    });

    it('returns null on subsequent steps of the final bar (no pattern continues)', () => {
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        // Check several non-downbeat steps in the final bar.
        const subBeatSteps = [
            finalDownbeat + 2, // 16th
            finalDownbeat + 4, // beat 2
            finalDownbeat + 8, // beat 3
            finalDownbeat + 12, // beat 4
            finalDownbeat + 14, // and-of-4
        ];

        for (const step of subBeatSteps) {
            const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
            const coordination = makeCoordination({ isFinalMeasure: true });
            const note = getBassNote(
                getState(),
                CHORD_C_BASS,
                CHORD_C_BASS,
                step / STEPS_PER_BEAT,
                null,
                48,
                'rock',
                0,
                step,
                step % STEPS_PER_BAR,
                { sectionStart: 0, sectionEnd: FORM_STEPS, stepCoordination: coordination },
                stepInfo,
            );
            // why: bass must NOT continue its pattern on sub-beats — the
            // tonic from beat 1 sustains; offbeat root hits would undercut it.
            expect(note).toBeNull();
        }
    });

    it('does NOT fire the cadence when isFinalMeasure is false (baseline preserved)', () => {
        // why: negative control — the cadence must fire ONLY when isFinalMeasure
        // is true. A regression that fires unconditionally would corrupt every
        // bar. Verify the bass at step 0 (first downbeat of the form) plays
        // its normal rock pattern, not the sustained tonic.
        const mockState = makeBassMockState();
        getState.mockReturnValue(mockState);

        const stepInfo = getStepInfo(0, TS_CONFIG, [], TIME_SIGNATURES);
        const coordination = makeCoordination({ isFinalMeasure: false });

        const note = getBassNote(
            getState(),
            CHORD_C_BASS,
            CHORD_C_BASS,
            0,
            null,
            48,
            'rock',
            0,
            0,
            0,
            { sectionStart: 0, sectionEnd: FORM_STEPS, stepCoordination: coordination },
            stepInfo,
        );

        // why: at step 0 (first downbeat of the form, isFinalMeasure=false)
        // the rock pattern's downbeat hit must fire normally. Asserting
        // non-null first rules out the regression "engine returns null
        // when isFinalMeasure is missing"; then the duration ceiling
        // confirms the per-style picking duration, not the sustained
        // 16-step cadence. Rock's normal duration is stepsPerBeat * 0.45 ≈ 1.8.
        expect(note).not.toBeNull();
        // Strict ceiling — comfortably distinguishes from the cadence's
        // 16-step sustain. Rock at intensity 0.6 yields ~1.8 steps.
        expect(note?.durationSteps).toBeLessThan(2.5);
    });
});

// --- Accompaniment engine isolation -----------------------------------------

function makeChordsMockState(overrides: any = {}) {
    return {
        playback: {
            bandIntensity: 0.55,
            bpm: 120,
            complexity: 0.4,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
        },
        arranger: {
            timeSignature: '4/4',
            totalSteps: FORM_STEPS,
            progression: [CHORD_C_CHORDS],
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: false, lastFreq: null },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        groove: { genreFeel: 'Jazz', pocket: 0, instruments: [] },
        harmony: { enabled: false, buffer: new Map(), rhythmicMask: 0 },
        ...overrides,
    };
}

function makeStepInfoForBeat(measureStep: number) {
    return {
        isMeasureStart: measureStep === 0,
        isBeatStart: measureStep % STEPS_PER_BEAT === 0,
        isGroupStart: measureStep === 0,
        isBackbeat: measureStep === 4 || measureStep === 12,
        isPulse: measureStep % 4 === 0,
        isPulseStart: measureStep === 0,
        isOffbeat: measureStep % 4 !== 0,
        isEOfBeat: false,
        isAOfBeat: false,
        beatIndex: Math.floor(measureStep / STEPS_PER_BEAT),
        mStep: measureStep,
        tsConfig: { beats: 4, stepsPerBeat: 4 },
    };
}

describe('Final-bar cadence — Chords/Accompaniment (epic-form-arrangement S4)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('plays a root-position cadence voicing on beat 1 of the final bar', () => {
        const state = makeChordsMockState();
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const stepInfo = makeStepInfoForBeat(0);
        const coordination = makeCoordination({ isFinalMeasure: true });

        const notes = getAccompanimentNotes(
            state,
            CHORD_C_CHORDS,
            finalDownbeat,
            0,
            0,
            stepInfo,
            coordination,
        );

        const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
        // eslint-disable-next-line no-console
        console.log(
            `[final-bar-cadence] cadence voicing midis: ${musical
                .map((n: any) => n.midi)
                .sort((a: number, b: number) => a - b)
                .join(',')}`,
        );

        // why: a root-position cadence voicing must have its lowest note on
        // the chord's root — `chord.rootMidi % 12`, not a hard-coded 0
        // (otherwise a regression that ignored rootMidi and emitted a
        // fixed C would pass on this C-rooted fixture).
        expect(musical.length).toBeGreaterThanOrEqual(3);
        const sorted = musical.map((n: any) => n.midi).sort((a: number, b: number) => a - b);
        const lowestPc = ((sorted[0] % 12) + 12) % 12;
        const expectedRootPc = ((CHORD_C_CHORDS.rootMidi % 12) + 12) % 12;
        expect(lowestPc).toBe(expectedRootPc);

        // why: pitch-class set must be exactly the chord's first-octave
        // intervals (intervals ≤ 11). For Cmaj7 [0,4,7,11], allowed pcs
        // are {0, 4, 7, 11}. The cadence builder is chart-driven — no
        // invented intervals, no genre-whitelist 7th override.
        const pcSet = new Set<number>(sorted.map((m: number) => ((m % 12) + 12) % 12));
        const expectedPcs = new Set<number>(
            CHORD_C_CHORDS.intervals
                .filter((iv: number) => iv <= 11)
                .map((iv: number) => (((CHORD_C_CHORDS.rootMidi + iv) % 12) + 12) % 12),
        );
        for (const pc of pcSet) {
            expect(expectedPcs.has(pc as number)).toBe(true);
        }

        // why: cadence voicing rings — duration must be substantially longer
        // than a typical comp hit (typically 1-4 steps).
        const dur = musical[0].durationSteps;
        expect(dur).toBeGreaterThan(8);
    });

    it('preserves power-chord identity on the final bar (no invented 3rd)', () => {
        // why: regression guard for P0-1 — the cadence builder must NOT
        // invent intervals via `?? 4`. A metal outro pummeling power-chord
        // P5s must land on [root, 5th] (with octave doubling), NOT a major
        // triad with a fabricated third.
        const CHORD_C5 = {
            rootMidi: 60,
            quality: '5',
            beats: 4,
            intervals: [0, 7],
            freqs: [261.63, 392.0],
            sectionId: 'sec-outro',
        };
        const state = makeChordsMockState({
            groove: { genreFeel: 'Rock', pocket: 0, instruments: [] },
        });
        getState.mockReturnValue(state);

        const stepInfo = makeStepInfoForBeat(0);
        const coordination = makeCoordination({ isFinalMeasure: true });
        const notes = getAccompanimentNotes(state, CHORD_C5, 48, 0, 0, stepInfo, coordination);

        const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
        const pcSet = new Set<number>(musical.map((n: any) => ((n.midi % 12) + 12) % 12));
        // Allowed: 0 (root) and 7 (5th). Forbidden: 4 (major 3rd) and 3 (minor 3rd).
        expect(pcSet.has(0)).toBe(true);
        expect(pcSet.has(7)).toBe(true);
        expect(pcSet.has(4)).toBe(false);
        expect(pcSet.has(3)).toBe(false);
    });

    it('preserves diminished identity on the final bar (b5 not rewritten to P5)', () => {
        // why: regression guard for P0-2 — `find(7) ?? 7` would invent a
        // perfect 5th for a dim chord, silently rewriting it to a minor
        // triad. Jazz turnarounds like iim7b5–V7b9–i must land on the
        // actual `i` (or the dim chord) the chart specifies.
        const CHORD_C_DIM = {
            rootMidi: 60,
            quality: 'dim',
            beats: 4,
            intervals: [0, 3, 6],
            freqs: [261.63, 311.13, 369.99],
            sectionId: 'sec-outro',
        };
        const state = makeChordsMockState();
        getState.mockReturnValue(state);

        const stepInfo = makeStepInfoForBeat(0);
        const coordination = makeCoordination({ isFinalMeasure: true });
        const notes = getAccompanimentNotes(state, CHORD_C_DIM, 48, 0, 0, stepInfo, coordination);

        const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
        const pcSet = new Set<number>(musical.map((n: any) => ((n.midi % 12) + 12) % 12));
        // Required: 0 (root), 3 (b3), 6 (b5). Forbidden: 7 (P5 — would
        // turn dim into a minor triad).
        expect(pcSet.has(0)).toBe(true);
        expect(pcSet.has(3)).toBe(true);
        expect(pcSet.has(6)).toBe(true);
        expect(pcSet.has(7)).toBe(false);
    });

    it('preserves sus4 identity on the final bar (suspension not resolved to 3rd)', () => {
        // why: regression guard — sus4 chord `[0, 5, 7]` should land as
        // sus4 on the cadence, not be silently "resolved" to a major triad
        // by an invented 3rd. The chart says Csus4 — we voice Csus4.
        const CHORD_C_SUS4 = {
            rootMidi: 60,
            quality: 'sus4',
            beats: 4,
            intervals: [0, 5, 7],
            freqs: [261.63, 349.23, 392.0],
            sectionId: 'sec-outro',
        };
        const state = makeChordsMockState();
        getState.mockReturnValue(state);

        const stepInfo = makeStepInfoForBeat(0);
        const coordination = makeCoordination({ isFinalMeasure: true });
        const notes = getAccompanimentNotes(state, CHORD_C_SUS4, 48, 0, 0, stepInfo, coordination);

        const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
        const pcSet = new Set<number>(musical.map((n: any) => ((n.midi % 12) + 12) % 12));
        // Required: 0 (root), 5 (sus4), 7 (5th). Forbidden: 3 (m3) and 4 (M3)
        // — either would resolve the suspension against chart intent.
        expect(pcSet.has(0)).toBe(true);
        expect(pcSet.has(5)).toBe(true);
        expect(pcSet.has(7)).toBe(true);
        expect(pcSet.has(3)).toBe(false);
        expect(pcSet.has(4)).toBe(false);
    });

    it('includes the 7th on a Bossa maj7 chart (chart-driven, not genre-whitelisted)', () => {
        // why: regression guard for P0-3 — the previous genre whitelist
        // ['Jazz','Blues','Neo-Soul'] would have dropped the 7th for Bossa,
        // producing a bare triad on a maj7 chart. The chart-driven rule
        // honors whatever `chord.intervals` specifies regardless of genre.
        const state = makeChordsMockState({
            groove: { genreFeel: 'Bossa Nova', pocket: 0, instruments: [] },
        });
        getState.mockReturnValue(state);

        const stepInfo = makeStepInfoForBeat(0);
        const coordination = makeCoordination({ isFinalMeasure: true });
        const notes = getAccompanimentNotes(
            state,
            CHORD_C_CHORDS,
            48,
            0,
            0,
            stepInfo,
            coordination,
        );

        const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
        const pcSet = new Set<number>(musical.map((n: any) => ((n.midi % 12) + 12) % 12));
        // Cmaj7 → must include 11 (maj7). Bossa's maj7-driven identity
        // would be erased if we dropped to a bare triad here.
        expect(pcSet.has(0)).toBe(true);
        expect(pcSet.has(11)).toBe(true);
    });

    it('voice-leads the cadence cluster toward the previous voicing (Epic 12 S7)', () => {
        // why: Epic 2 S4 originally built the cadence in root position from
        // scratch, ignoring the prior bar's voicing — producing a visible
        // hand-jump at the resolution on slow ballads with stepwise
        // progressions. Epic 12 S7 routes the cadence through
        // `recenterVoicing(_, compingState.lastVoicingMidis, 52, 84)` so the
        // whole-octave shift is biased toward the previous voicing's center
        // while staying within the chord slot.
        //
        // Fixture choice: a SIMPLE TRIAD (intervals [0,4,7], no 7th) is used
        // for math readability — both root-at-60 and root-at-72 clusters are
        // obviously valid in [52, 84]. A 4-note maj7 cadence also has two
        // valid shifts in this window ([60-71] and [72-83]) and would also
        // exercise voice-leading, but the report numbers are tidier on a
        // triad. Follow-up worth tracking: an explicit maj7-high-prior test
        // would guard the most common jazz tonic cadence quality directly.
        //
        // Test strategy: drive `getAccompanimentNotes` twice with the same
        // chord + coordination but two different `compingState.lastVoicingMidis`
        // priors (high vs low). The cadence cluster mean should track the
        // prior.
        const TRIAD_C = {
            rootMidi: 60,
            quality: 'maj',
            beats: 4,
            intervals: [0, 4, 7],
            freqs: [261.63, 329.63, 392.0],
            sectionId: 'sec-outro',
        };
        const state = makeChordsMockState();
        getState.mockReturnValue(state);
        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const stepInfo = makeStepInfoForBeat(0);
        const coordination = makeCoordination({ isFinalMeasure: true });

        const meanOf = (notes: any[]): number => {
            const midis = notes.filter((n) => !n.muted && n.midi > 0).map((n) => n.midi);
            return midis.reduce((a, b) => a + b, 0) / midis.length;
        };
        const spanOf = (notes: any[]): { min: number; max: number } => {
            const midis = notes.filter((n) => !n.muted && n.midi > 0).map((n) => n.midi);
            return { min: Math.min(...midis), max: Math.max(...midis) };
        };

        // Case A: prior voicing sat high in the slot.
        compingState.lastVoicingMidis = [76, 79, 83];
        const notesHigh = getAccompanimentNotes(
            state,
            TRIAD_C,
            finalDownbeat,
            0,
            0,
            stepInfo,
            coordination,
        );
        const meanHigh = meanOf(notesHigh);
        const spanHigh = spanOf(notesHigh);

        // Case B: prior voicing sat low in the slot.
        compingState.lastVoicingMidis = [52, 55, 59];
        const notesLow = getAccompanimentNotes(
            state,
            TRIAD_C,
            finalDownbeat,
            0,
            0,
            stepInfo,
            coordination,
        );
        const meanLow = meanOf(notesLow);
        const spanLow = spanOf(notesLow);

        // eslint-disable-next-line no-console
        console.log(
            `[final-bar-cadence] voice-leading: high-prior mean=${meanHigh.toFixed(1)} ` +
                `[${spanHigh.min}-${spanHigh.max}], low-prior mean=${meanLow.toFixed(1)} ` +
                `[${spanLow.min}-${spanLow.max}]`,
        );

        // Voice-leading bias: the high-prior cadence sits higher than the
        // low-prior cadence. If this assertion fails, recenterVoicing is not
        // being routed `compingState.lastVoicingMidis` (regression to the
        // pre-S7 manual octave-fit which ignored the prior).
        expect(meanHigh).toBeGreaterThan(meanLow);

        // Slot invariant: both clusters stay within the chord/harmony register
        // slot [52, 84].
        expect(spanHigh.min).toBeGreaterThanOrEqual(52);
        expect(spanHigh.max).toBeLessThanOrEqual(84);
        expect(spanLow.min).toBeGreaterThanOrEqual(52);
        expect(spanLow.max).toBeLessThanOrEqual(84);

        // Empty-prior fallback: fresh playback (no prior voicing) must still
        // produce a grounded resolution — the score function falls back to
        // centering on the cluster itself, which puts the lowest valid shift
        // first. Explicit guard against a regression that re-targets recenter
        // to a high default. (Reviewer P2 — empty-prior grounding coverage.)
        compingState.lastVoicingMidis = [];
        const notesFresh = getAccompanimentNotes(
            state,
            TRIAD_C,
            finalDownbeat,
            0,
            0,
            stepInfo,
            coordination,
        );
        const meanFresh = meanOf(notesFresh);
        expect(meanFresh).toBeLessThan(70);

        // Reset for downstream tests (compingState is module-level).
        compingState.lastVoicingMidis = [];
    });

    it('returns empty on sub-beats of the final bar (voicing rings out)', () => {
        const state = makeChordsMockState();
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        // Sub-beat (not measure-start).
        const subBeatStep = finalDownbeat + 4;
        const stepInfo = makeStepInfoForBeat(4);
        const coordination = makeCoordination({ isFinalMeasure: true });

        const notes = getAccompanimentNotes(
            state,
            CHORD_C_CHORDS,
            subBeatStep,
            4,
            4,
            stepInfo,
            coordination,
        );

        // why: comper must yield silence on sub-beats so the cadence rings out.
        const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
        expect(musical.length).toBe(0);
    });
});

// --- Drum engine isolation ---------------------------------------------------

function makeDrumsMockState() {
    return {
        playback: {
            bandIntensity: 0.6,
            bpm: 120,
            songMode: true,
            currentLoopCount: 0,
            complexity: 0.5,
            intent: {},
        },
        groove: {
            genreFeel: 'Funk',
            creativity: true,
            lastDrumPreset: 'Funk',
            instruments: [],
            accentMap: null,
            fillMap: null,
            sectionSeedMap: { 'sec-outro': 0.42 },
            seedTimelineStartStep: 0,
            orchestrationMap: null,
        },
        soloist: { enabled: false, session: { phrasing: { busySteps: 0 } } },
        arranger: {
            timeSignature: '4/4',
            sectionMap: [{ id: 'sec-outro', start: 0, end: FORM_STEPS, label: 'Outro' }],
            stepMap: [{ start: 0, end: FORM_STEPS, chord: { sectionId: 'sec-outro' } }],
            totalSteps: FORM_STEPS,
        },
    };
}

function buildDrumParams(
    step: number,
    instName: string,
    stepVal: number,
    mockState: any,
    isFinalMeasure: boolean,
) {
    const info = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
    return {
        step,
        inst: { name: instName, muted: false, steps: [] },
        stepVal,
        playback: mockState.playback,
        groove: mockState.groove,
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
        isCompound: false,
        stepInGroup: 0,
        groupIndex: 0,
        sectionId: 'sec-outro',
        sectionOccurrence: 1,
        isFinalMeasure,
    };
}

describe('Final-bar cadence — Drums (epic-form-arrangement S4)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('fires Crash on the Open lane on the final downbeat', () => {
        const state = makeDrumsMockState();
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        // The Open lane gets the Crash routing per the section-boundary pattern.
        const params = buildDrumParams(finalDownbeat, 'Open', 0, state, true);

        // why: pin Math.random so the entropy phase doesn't add noise.
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const result = applyGrooveOverrides(state, params);

        // eslint-disable-next-line no-console
        console.log(
            `[final-bar-cadence] drum Open lane at final downbeat: shouldPlay=${result.shouldPlay}, soundName=${result.soundName}, velocity=${result.velocity}`,
        );

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Crash');
        // velocity ≥ 1.0 — strong arrival.
        expect(result.velocity).toBeGreaterThanOrEqual(1.0);
    });

    it('reinforces Kick on the final downbeat', () => {
        const state = makeDrumsMockState();
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Kick', 0, state, true);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const result = applyGrooveOverrides(state, params);

        expect(result.shouldPlay).toBe(true);
        // Reinforced velocity ≥ 1.0 (we set 1.3 pre-humanize, then ±4% jitter).
        expect(result.velocity).toBeGreaterThanOrEqual(1.0);
    });

    it('suppresses HiHat on the final bar in sparse-hat genres (e.g. Jazz)', () => {
        // why (Epic 12 S6 B6): final-bar HiHat suppression is now per-genre.
        // Sparse-hat genres (Jazz, Bossa, Acoustic, Country, Blues, Reggae,
        // Neo-Soul, Latin, Minimal, Hip Hop) keep the universal suppression so
        // the Open Crash swell rings cleanly through the bar.
        const state = makeDrumsMockState();
        state.groove.genreFeel = 'Jazz';
        state.groove.lastDrumPreset = 'Jazz';
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        // Downbeat HiHat: must be suppressed (the Open Crash carries the bar).
        const dbParams = buildDrumParams(finalDownbeat, 'HiHat', 1, state, true);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        let result = applyGrooveOverrides(state, dbParams);
        expect(result.shouldPlay).toBe(false);

        // Sub-beat HiHat: also suppressed — the closed-hat ticking past beat 1
        // would chop the Crash's tail.
        const subParams = buildDrumParams(finalDownbeat + 4, 'HiHat', 1, state, true);
        result = applyGrooveOverrides(state, subParams);
        expect(result.shouldPlay).toBe(false);
    });

    it('keeps the HiHat ticker through the final bar in hat-dense genres (e.g. Funk)', () => {
        // why (Epic 12 S6 B6): in 8th-note-hat genres (HAT_SPINE_GENRES — Disco,
        // Funk, Rock, Metal, Shred, Ska-Punk) the hat IS the spine. Silencing
        // it on the final bar would read as an abrupt drop-out rather than a
        // swell-breathing decision. The final-bar gate must NOT force-suppress
        // the HiHat in these genres — whatever the strategy decided plays.
        const state = makeDrumsMockState(); // default genre is Funk
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        // Downbeat HiHat in Funk: the gate must not unconditionally suppress.
        // (Whether the strategy actually fires is a separate decision; the
        // assertion here is that the final-bar override no longer flips it to
        // false outright.) We assert this by confirming the strategy's own
        // shouldPlay value survives — if the gate had suppressed it, we'd see
        // false here regardless of what the strategy decided.
        const dbParams = buildDrumParams(finalDownbeat, 'HiHat', 1, state, true);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const dbResult = applyGrooveOverrides(state, dbParams);

        // Compare against a non-final-bar identical step: if the only delta
        // between the two results is the final-bar gate firing, then the gate
        // is correctly NOT suppressing the hat in Funk. (Both should have the
        // same shouldPlay value.)
        const dbParamsNonFinal = buildDrumParams(finalDownbeat, 'HiHat', 1, state, false);
        const dbResultNonFinal = applyGrooveOverrides(state, dbParamsNonFinal);

        expect(dbResult.shouldPlay).toBe(dbResultNonFinal.shouldPlay);
    });

    it('Crash does NOT fire on a non-final downbeat (baseline preserved)', () => {
        // why: negative control — the Open Crash gesture must fire ONLY on the
        // final bar. Regular section downbeats use the existing section-
        // boundary routing.
        const state = makeDrumsMockState();
        getState.mockReturnValue(state);

        // Bar 1 downbeat (not the final bar) — no Crash from the S4 path.
        const params = buildDrumParams(0, 'Open', 0, state, false);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const result = applyGrooveOverrides(state, params);

        // Either silent or NOT routed to Crash (the section-boundary block
        // could still route a section-start crash, but only via justFinishedTurnaround,
        // which requires a prev section — not the case at step 0).
        if (result.shouldPlay) {
            expect(result.soundName).not.toBe('Crash');
        }
    });
});

// --- isFinalMeasure publication (end-to-end via tick-logic) ----------------

function makeTickState(opts: { isEndingPending?: boolean; songMode?: boolean } = {}) {
    const chord = CHORD_C_CHORDS;
    return {
        arranger: {
            totalSteps: FORM_STEPS,
            timeSignature: '4/4',
            measureMap: Array.from({ length: FORM_BARS }, (_, i) => ({
                start: i * STEPS_PER_BAR,
                end: (i + 1) * STEPS_PER_BAR,
            })),
            sectionMap: [{ id: 'sec-outro', start: 0, end: FORM_STEPS, label: 'Outro' }],
            stepMap: [
                { start: 0, end: FORM_STEPS, chord, sectionStart: 0, sectionEnd: FORM_STEPS },
            ],
            progression: [chord],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: false, style: 'smart', volume: 0.5 },
        bass: {
            enabled: false,
            style: 'smart',
            volume: 0.5,
            lastFreq: null,
            octave: 0,
        },
        soloist: makeSoloistMock({
            enabled: false,
            style: 'smart',
            busySteps: 0,
            notesInPhrase: 0,
        }),
        harmony: {
            enabled: false,
            style: 'smart',
            complexity: 0.5,
            lastMidis: [],
        },
        groove: {
            enabled: false,
            measures: 1,
            instruments: [],
            creativity: false,
            fillActive: false,
            sectionSeedMap: {},
        },
        playback: {
            bpm: 120,
            bandIntensity: 0.6,
            songMode: opts.songMode !== false,
            isEndingPending: opts.isEndingPending === true,
            intent: {},
        },
    } as any;
}

describe('Final-bar cadence — isFinalMeasure publication (epic-form-arrangement S4)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('is true ONLY inside the final bar when songMode + isEndingPending are set', () => {
        // why: this is the contract from the audit doc:
        //   isFinalMeasure ⇔ songMode && isEndingPending &&
        //                    stepInForm + stepsPerMeasure >= arranger.totalSteps
        // We exercise the chord-data preamble end-to-end via generateNotesForStep
        // and read the resulting `coordination` block.
        const state = makeTickState({ isEndingPending: true, songMode: true });
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        const finalBarStart = FORM_STEPS - STEPS_PER_BAR; // 48
        const stepResults: { step: number; isFinalMeasure: boolean }[] = [];

        // Probe every 4th step across the form so we see the boundary
        // transition. Final bar spans steps 48..63 inclusive.
        for (let s = 0; s < FORM_STEPS; s += 4) {
            const r = generateNotesForStep(state, s, cursors, {
                includeSoloist: false,
                includeBass: false,
                includeChords: false,
                includeHarmony: false,
                includeDrums: false,
            });
            stepResults.push({
                step: s,
                isFinalMeasure: r.coordination.isFinalMeasure === true,
            });
        }

        // eslint-disable-next-line no-console
        console.log(
            `[final-bar-cadence] isFinalMeasure across form: ${stepResults
                .filter((r) => r.isFinalMeasure)
                .map((r) => r.step)
                .join(',')}`,
        );

        for (const r of stepResults) {
            if (r.step >= finalBarStart) {
                expect(r.isFinalMeasure).toBe(true);
            } else {
                expect(r.isFinalMeasure).toBe(false);
            }
        }
    });

    it('is false when isEndingPending is NOT set (looping song-mode keeps cadence dormant)', () => {
        // why: a normal looping playback re-enters the final bar on every loop
        // but must NOT fire the cadence — only the FINAL pass (after the user
        // hits stop or session-timer expires) sets isEndingPending.
        const state = makeTickState({ isEndingPending: false, songMode: true });
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        const finalBarStart = FORM_STEPS - STEPS_PER_BAR;
        // Check several steps inside the final bar — all must report false.
        for (const step of [finalBarStart, finalBarStart + 4, finalBarStart + 12, FORM_STEPS - 1]) {
            const r = generateNotesForStep(state, step, cursors, {
                includeSoloist: false,
                includeBass: false,
                includeChords: false,
                includeHarmony: false,
                includeDrums: false,
            });
            expect(r.coordination.isFinalMeasure).toBe(false);
        }
    });

    it('is false when songMode is off (live mode never cadences)', () => {
        // why: the gesture is structural — only meaningful for song-mode
        // playback. Live mode (open-ended jam) should never fire it.
        const state = makeTickState({ isEndingPending: true, songMode: false });
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        const finalBarStart = FORM_STEPS - STEPS_PER_BAR;
        for (const step of [finalBarStart, finalBarStart + 8, FORM_STEPS - 1]) {
            const r = generateNotesForStep(state, step, cursors, {
                includeSoloist: false,
                includeBass: false,
                includeChords: false,
                includeHarmony: false,
                includeDrums: false,
            });
            expect(r.coordination.isFinalMeasure).toBe(false);
        }
    });
});

// Reliability: measured 2026-05-17, 30/30 passes (run via
// `for i in $(seq 1 30); do npx vitest run tests/standards/final-bar-cadence.test.ts; done`).
