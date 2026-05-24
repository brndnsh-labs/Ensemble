// @ts-nocheck
// tests/standards/bass-imperfect-symmetry-critique.test.ts
//
// Critique test for `epic-form-arrangement` S2 — Imperfect Symmetry for bass
// on repeated sections.
//
// When a section repeats (occurrence ≥ 2), the bass should apply a
// deterministic per-phrase octave displacement on EXACTLY ONE beat per 4-bar
// phrase, seeded by `(sectionId, occurrence, phraseIndex)`. The pitch class
// stays the same (only ±12 shift); the contour freshens so Verse 2 sounds
// audibly different from Verse 1 without changing the chord function.
//
// Audible character: although only ONE step is directly shifted per phrase,
// the shift cascades through `prevMidi`'s Hand-Position and Stepwise bonuses in
// `clampAndNormalize`, so the rest of the phrase migrates into the new
// register. Measured ~44% step-level divergence. This is the intended musical
// gesture — a real bassist commits to the new register for the phrase rather
// than snapping back. The window assertion below (10% floor, 70% ceiling) is
// calibrated around that 44% center so the test catches both regressions
// (gesture removed → near-zero divergence) and runaways (gate misfires →
// 100% divergence).
//
// Assertions:
//   1. Divergence ∈ [10%, 70%] — captures the intended cascade without letting
//      a "shift every note" regression pass.
//   2. 100% pitch-class agreement — every divergent note is ±12 (octave
//      displacement, not pitch substitution).
//   3. Determinism — regenerating occurrence=2 a second time yields IDENTICAL
//      notes (no Math.random leak).
//   4. occurrence=1 path is untouched (Statement) — bass at occurrence=1 with
//      and without coordination context should be identical (the new logic
//      only fires when occurrence ≥ 2).
//   5. V2/V3/V4 each diverge from each other — guards against the parity
//      collapse where V4 ≡ V2 in direction (reviewer P1-3).
//
// 30-run reliability: pass count documented in the test header at the end.
// Measured 2026-05-17: 30/30 passes.
//
// Source: docs/audit/form-arranger.md P1 #7;
//         docs/audit/epic-form-arrangement.md S2.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// 4-bar phrase of C major (MIDI 48) — bass anchor in middle of register so
// both ±12 directions have headroom (note ≈ 36-48, +12 → 48-60, -12 → 24-36).
const CHORD_C = {
    rootMidi: 48,
    quality: 'maj7',
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [130.81, 164.81, 196.0, 246.94],
    sectionId: 'sec-verse-A',
};

const TS_CONFIG = TIME_SIGNATURES['4/4'];
const STEPS_PER_BEAT = TS_CONFIG.stepsPerBeat; // 4
const STEPS_PER_BAR = TS_CONFIG.beats * STEPS_PER_BEAT; // 16
const PHRASE_BARS = 4;
// Cover 2 full 4-bar phrases (8 bars = 128 steps) so the section-id divergence
// test has 2 phraseIndex values to sample — minimizes false-zero divergence
// from a chance hash-collision on a single target beat.
const PHRASE_STEPS = PHRASE_BARS * 2 * STEPS_PER_BAR; // 128

function makeMockState(overrides = {}) {
    return {
        // why: intensity 0.5 sits ABOVE the imperfect-symmetry floor (0.25) and
        // ABOVE the rock-style "switch to quarter notes" gate (intensity < 0.35),
        // yet BELOW the rock 5ths/octave embellishment gate (intensity > 0.65)
        // which uses raw Math.random(). This keeps the path through getBassNote
        // deterministic, isolating the imperfect-symmetry signal.
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.4, intent: {} },
        groove: { genreFeel: 'Rock', pocket: 0, instruments: [], measures: 1 },
        soloist: makeSoloistMock({ busySteps: 0, tension: 0, enabled: false }),
        arranger: {
            timeSignature: '4/4',
            totalSteps: PHRASE_STEPS,
            stepMap: [],
            sectionMap: [],
        },
        bass: { lastFreq: null, busySteps: 0, lastMidiPlayed: null },
        ...overrides,
    };
}

function makeCoordination(sectionOccurrence: number) {
    return {
        sectionStart: 0,
        sectionEnd: PHRASE_STEPS,
        sectionOccurrence,
        kickHit: false,
        snareHit: false,
        soloistBusy: false,
        soloistMidi: 0,
        bassHit: false,
        bassMidi: 0,
    };
}

/**
 * Generate every note over a 4-bar phrase of C major in `rock` style. Rock
 * fires on every 8th note at bandIntensity ≥ 0.4 (unconditional from
 * bass-styles.ts:checkBassActiveStyle), so we get a dense, deterministic
 * series of notes to compare across occurrences.
 *
 * `style='rock'` is chosen because:
 *   - it fires unconditionally on 8th notes (no Math.random gates in the
 *     primary path) — gives a clean baseline to measure divergence against;
 *   - the imperfect-symmetry wrap is style-agnostic (lives inside `result()`
 *     so it applies regardless), so rock is a valid representative.
 */
function generatePhrase(sectionOccurrence: number) {
    const mockState = makeMockState();
    getState.mockReturnValue(mockState);

    const notes: { step: number; midi: number }[] = [];
    let prevFreq: number | null = null;

    for (let step = 0; step < PHRASE_STEPS; step++) {
        const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
        const coordination = makeCoordination(sectionOccurrence);
        const stepInChord = step % (CHORD_C.beats * STEPS_PER_BEAT);

        const active = isBassActive(getState(), 'rock', step, stepInChord, stepInfo, coordination);
        if (!active) {
            continue;
        }

        const note = getBassNote(
            getState(),
            CHORD_C,
            CHORD_C, // same chord for the whole phrase to isolate the imperfect-symmetry signal
            step / STEPS_PER_BEAT,
            prevFreq,
            48,
            'rock',
            0,
            step,
            stepInChord,
            { sectionStart: 0, sectionEnd: PHRASE_STEPS, stepCoordination: coordination },
            stepInfo,
        );

        if (note?.midi) {
            notes.push({ step, midi: note.midi });
            prevFreq = note.freq;
        }
    }
    return notes;
}

describe('Bass Imperfect Symmetry (epic-form-arrangement S2)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('Verse 1 and Verse 2 produce different lines (divergence ∈ [10%, 70%])', () => {
        const pass1 = generatePhrase(1);
        const pass2 = generatePhrase(2);

        // Step-aligned comparison: line up notes by step number, count those
        // that differ. Each pass should have the same step coverage because
        // the gate logic (isBassActive) is identical — only the post-process
        // shift differs.
        const stepsBoth = new Set(pass1.map((n) => n.step));
        for (const n of pass2) {
            stepsBoth.add(n.step);
        }
        const p1Map = new Map(pass1.map((n) => [n.step, n.midi]));
        const p2Map = new Map(pass2.map((n) => [n.step, n.midi]));

        let diverged = 0;
        let total = 0;
        for (const s of stepsBoth) {
            const a = p1Map.get(s);
            const b = p2Map.get(s);
            if (a !== undefined && b !== undefined) {
                total++;
                if (a !== b) {
                    diverged++;
                }
            }
        }

        const divergenceRate = total > 0 ? diverged / total : 0;
        // eslint-disable-next-line no-console
        console.log(
            `[imperfect-symmetry] phrase divergence: ${diverged}/${total} notes ` +
                `(${(divergenceRate * 100).toFixed(1)}%); target ≥ 10%`,
        );

        // why: the intended gesture is a single seeded ±12 shift that cascades
        // through prevMidi bias into a register migration for the rest of the
        // phrase. Measured center ≈ 44%. Floor 10% catches "gesture removed";
        // ceiling 70% catches "every-step shifted" regressions (gate misfires,
        // helper applied unconditionally, etc.).
        expect(divergenceRate).toBeGreaterThanOrEqual(0.1);
        expect(divergenceRate).toBeLessThanOrEqual(0.7);
    });

    it('divergent notes are octave-displaced (same pitch class)', () => {
        const pass1 = generatePhrase(1);
        const pass2 = generatePhrase(2);

        const p1Map = new Map(pass1.map((n) => [n.step, n.midi]));
        const p2Map = new Map(pass2.map((n) => [n.step, n.midi]));

        const divergencesByPc: { step: number; a: number; b: number }[] = [];
        for (const [step, a] of p1Map.entries()) {
            const b = p2Map.get(step);
            if (b !== undefined && b !== a) {
                divergencesByPc.push({ step, a, b });
            }
        }

        // Every divergence must preserve pitch class (a ≡ b mod 12).
        const pcMatching = divergencesByPc.filter(
            ({ a, b }) => ((a % 12) + 12) % 12 === ((b % 12) + 12) % 12,
        );
        // eslint-disable-next-line no-console
        console.log(
            `[imperfect-symmetry] pitch-class preservation: ${pcMatching.length}/${divergencesByPc.length} divergences match pc`,
        );

        // why: the imperfect-symmetry wrap ONLY does ±12 (or no-op). 100%
        // pc-agreement is the contract; any failure means the engine is
        // substituting pitches, not just octave-shifting.
        expect(pcMatching.length).toBe(divergencesByPc.length);
    });

    it('occurrence=2 is fully deterministic (same notes on re-generation)', () => {
        const passA = generatePhrase(2);
        const passB = generatePhrase(2);

        // Compare full note arrays — they must match exactly.
        expect(passA.length).toBe(passB.length);
        for (let i = 0; i < passA.length; i++) {
            expect(passA[i].step).toBe(passB[i].step);
            expect(passA[i].midi).toBe(passB[i].midi);
        }
    });

    it('occurrence=1 is the Statement: untouched by imperfect-symmetry', () => {
        // why: occurrence=1 must produce the original line. Any shift here
        // would mean the gate is mis-firing on first passes.
        const passOcc1 = generatePhrase(1);

        // Compare against a phrase generated with NO sectionOccurrence field
        // (default 1 from coordination context).
        const mockState = makeMockState();
        getState.mockReturnValue(mockState);

        const baseline: { step: number; midi: number }[] = [];
        let prevFreq: number | null = null;
        for (let step = 0; step < PHRASE_STEPS; step++) {
            const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
            // Coordination with NO sectionOccurrence field — engine should
            // fall back to default 1.
            const coordination = {
                sectionStart: 0,
                sectionEnd: PHRASE_STEPS,
                kickHit: false,
                snareHit: false,
                soloistBusy: false,
                soloistMidi: 0,
                bassHit: false,
                bassMidi: 0,
            };
            const stepInChord = step % (CHORD_C.beats * STEPS_PER_BEAT);
            const active = isBassActive(
                getState(),
                'rock',
                step,
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
                CHORD_C,
                step / STEPS_PER_BEAT,
                prevFreq,
                48,
                'rock',
                0,
                step,
                stepInChord,
                { sectionStart: 0, sectionEnd: PHRASE_STEPS, stepCoordination: coordination },
                stepInfo,
            );
            if (note?.midi) {
                baseline.push({ step, midi: note.midi });
                prevFreq = note.freq;
            }
        }

        // occ=1 must equal baseline (no field).
        expect(passOcc1.length).toBe(baseline.length);
        for (let i = 0; i < passOcc1.length; i++) {
            expect(passOcc1[i].midi).toBe(baseline[i].midi);
        }
    });

    it('occurrences 2, 3, 4 each diverge pairwise (no parity collapse)', () => {
        // why: earlier draft picked direction by `occurrence % 2` parity, which
        // collapses to two values — V4 would direction-equal V2. Reviewer
        // P1-3. The fix uses a hash-seeded direction; this test guards the
        // regression by asserting each pair (V2,V3), (V3,V4), (V2,V4) diverges
        // by at least one step.
        const pass2 = generatePhrase(2);
        const pass3 = generatePhrase(3);
        const pass4 = generatePhrase(4);

        const diffCount = (
            a: { step: number; midi: number }[],
            b: { step: number; midi: number }[],
        ) => {
            const aMap = new Map(a.map((n) => [n.step, n.midi]));
            const bMap = new Map(b.map((n) => [n.step, n.midi]));
            let diffs = 0;
            for (const [s, av] of aMap.entries()) {
                const bv = bMap.get(s);
                if (bv !== undefined && bv !== av) {
                    diffs++;
                }
            }
            return diffs;
        };

        const d23 = diffCount(pass2, pass3);
        const d34 = diffCount(pass3, pass4);
        const d24 = diffCount(pass2, pass4);

        // eslint-disable-next-line no-console
        console.log(
            `[imperfect-symmetry] occurrence pairwise divergence: ` +
                `V2↔V3=${d23}, V3↔V4=${d34}, V2↔V4=${d24}`,
        );

        // Each pair must differ. d24 > 0 is the parity-collapse guard.
        expect(d23).toBeGreaterThan(0);
        expect(d34).toBeGreaterThan(0);
        expect(d24).toBeGreaterThan(0);
    });

    it('different sectionIds at same occurrence give different shift patterns', () => {
        // why: the seed includes sectionIdHash, so Chorus-2 and Verse-2 should
        // not have identical displacement patterns. Otherwise every repeated
        // section would shift the same beat.
        const mockState = makeMockState();
        getState.mockReturnValue(mockState);

        const generateWithSection = (sectionId: string) => {
            const notes: { step: number; midi: number }[] = [];
            let prevFreq: number | null = null;
            const chord = { ...CHORD_C, sectionId };
            for (let step = 0; step < PHRASE_STEPS; step++) {
                const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
                const coordination = makeCoordination(2);
                const stepInChord = step % (chord.beats * STEPS_PER_BEAT);
                const active = isBassActive(
                    getState(),
                    'rock',
                    step,
                    stepInChord,
                    stepInfo,
                    coordination,
                );
                if (!active) {
                    continue;
                }
                const note = getBassNote(
                    getState(),
                    chord,
                    chord,
                    step / STEPS_PER_BEAT,
                    prevFreq,
                    48,
                    'rock',
                    0,
                    step,
                    stepInChord,
                    { sectionStart: 0, sectionEnd: PHRASE_STEPS, stepCoordination: coordination },
                    stepInfo,
                );
                if (note?.midi) {
                    notes.push({ step, midi: note.midi });
                    prevFreq = note.freq;
                }
            }
            return notes;
        };

        const verseLine = generateWithSection('sec-verse-A');
        const chorusLine = generateWithSection('sec-chorus-B');

        // Expect at least some divergence between the two sections' patterns.
        // why: sectionIdHash is djb2; two different short strings reliably
        // produce different hashes, which then steer different targetBeats.
        const stepsBoth = new Set(verseLine.map((n) => n.step));
        for (const n of chorusLine) {
            stepsBoth.add(n.step);
        }
        const vMap = new Map(verseLine.map((n) => [n.step, n.midi]));
        const cMap = new Map(chorusLine.map((n) => [n.step, n.midi]));
        let diverged = 0;
        for (const s of stepsBoth) {
            const a = vMap.get(s);
            const b = cMap.get(s);
            if (a !== undefined && b !== undefined && a !== b) {
                diverged++;
            }
        }

        // eslint-disable-next-line no-console
        console.log(
            `[imperfect-symmetry] section-id divergence (verse vs chorus, both occ=2): ` +
                `${diverged} notes differ`,
        );

        // why: at least ONE divergent step means the sectionId hash actually
        // changes the target beat. We don't require many — just non-zero.
        expect(diverged).toBeGreaterThan(0);
    });
});
