// @ts-nocheck
/**
 * Soloist SRDC Restatement — MOTIF ECHO (Epic 11 S4)
 *
 * The SRDC arc (Statement / Restatement / Departure / Conclusion) was
 * audibly only 3 phases: Restatement was nudged by a noise-floor ×1.15
 * chord-tone multiplier that every competing bias drowned out, so a
 * Restatement sounded identical to a Statement (soloist.md P1 #5).
 *
 * S4 refolds Restatement into structural motif-echo: when a phrase
 * derives to `restatement` and the immediately-prior phrase was a
 * `statement`, the soloist captures that Statement's signature and the
 * rhythm engine replays it — same attack grid, same duration shape,
 * same contour directions — with "looser landings" (the pitch picker no
 * longer pulls chord tones harder for Restatement; baseline 1.0).
 * Musically: the player echoing the idea to confirm it.
 *
 * This test guards the distinction the existing SRDC critique test
 * (soloist-musicality.test.ts) cannot — it only measures
 * Conclusion-vs-Departure chord-tone resolution. Here we measure that a
 * Restatement phrase ECHOES its Statement's rhythm AND melodic contour,
 * against a Departure baseline that does NOT.
 *
 * Two metrics:
 *
 *   1. Rhythm similarity — Jaccard overlap of the two phrases' attack
 *      step-offset sets. The echo (buildRestatementEchoPlan) replays the
 *      Statement's attack grid with zero Math.random, so this is
 *      deterministic by construction: Restatement-vs-Statement is
 *      asserted at an exact 1.0, while Departure-vs-Statement shares
 *      only incidental downbeats.
 *
 *   2. Contour similarity — exercised through the REAL pitch picker.
 *      Each Statement node is run through `selectPitchAndDevices` to
 *      produce an actual MIDI line; a signature is built from that line's
 *      real interval directions; the Restatement echo plan is then run
 *      through the SAME picker. We compare the melodic-direction signs of
 *      the two GENERATED MIDI lines. Because the picker has a
 *      weighted-random pick, this is measured as a statistical range over
 *      a multi-seed loop — Restatement-vs-Statement contour match must be
 *      measurably high (the `isRestatementEcho` final-stage multiplier in
 *      soloist-pitch-engine.ts biases the picker toward the Statement's
 *      interval directions), and the Departure baseline must trail it by
 *      a wide margin (its picker run gets no contour bias at all).
 *
 * Source: soloist.md P1 #5; FOLLOWUPS §A (SRDC Restatement);
 * docs/audit/epic-deferred-followups.md S4.
 */
import { describe, expect, it } from 'vitest';
import { selectPitchAndDevices } from '../../public/engine/soloist-pitch-engine.js';
import { generateRhythmPlan } from '../../public/engine/soloist-rhythm-engine.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STEPS_PER_MEASURE = 16;
const STEPS_PER_BEAT = 4;
const ACTIVE_STEPS = 64; // 4 bars

function makeCoordination(activeSteps: number) {
    return {
        sectionStart: 0,
        sectionEnd: activeSteps + 64, // far beyond the phrase so isFinalMeasure stays false
        stepCoordination: {},
        bypassRhythm: false,
    };
}

/**
 * Soloist mock for a normal (non-echo) phrase. `srdcState` is whatever
 * the caller passes; `restatementEcho` is null so the echo branch is
 * skipped and the main attack-prob path runs.
 */
function makeNormalSoloist(srdcState: string) {
    return makeSoloistMock({
        mode: 'monophonic',
        style: 'scalar',
        sessionSeed: null,
        rhythmicEntropy: 0,
        transitionState: 'playing',
        isResting: false,
        phraseContext: {
            role: 'call',
            skeleton: [],
            lastInterval: null,
            profile: 'srv',
            signature: null,
            responseSignature: null,
            responseMode: 'free',
            responseSource: 'free',
            sectionLabel: null,
            sectionOccurrence: 0,
            srdcState,
            restatementEcho: null,
        },
    });
}

/**
 * Soloist mock armed for a Restatement echo: `srdcState: 'restatement'`
 * and `restatementEcho` carrying the Statement's signature.
 */
function makeRestatementSoloist(statementSignature: any) {
    return makeSoloistMock({
        mode: 'monophonic',
        style: 'scalar',
        sessionSeed: null,
        rhythmicEntropy: 0,
        transitionState: 'playing',
        isResting: false,
        phraseContext: {
            role: 'call',
            skeleton: [],
            lastInterval: null,
            profile: 'srv',
            signature: null,
            responseSignature: null,
            responseMode: 'free',
            responseSource: 'free',
            sectionLabel: null,
            sectionOccurrence: 0,
            srdcState: 'restatement',
            restatementEcho: statementSignature,
        },
    });
}

/**
 * mulberry32 — small deterministic PRNG, re-seeded per phrase so a given
 * seed always produces the same Statement / Departure phrase.
 */
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

/** Generate one non-echo phrase plan at `seed`, with `srdcState`. */
function generateNormalPlan(seed: number, srdcState: string): any[] {
    // Epic 12 S1: inject the per-seed PRNG via `generateRhythmPlan`'s `random`
    // parameter rather than swapping the global `Math.random` — the engine no
    // longer reads `Math.random` directly.
    const prng = makeMulberry32(seed);
    return generateRhythmPlan(
        0,
        ACTIVE_STEPS,
        'scalar',
        0.6,
        STEPS_PER_MEASURE,
        STEPS_PER_BEAT,
        makeCoordination(ACTIVE_STEPS),
        256,
        makeNormalSoloist(srdcState),
        null,
        0,
        prng,
    );
}

/**
 * Build a minimal MotifSignature from a rhythm plan for the RHYTHM test.
 * Only the step-offset / duration fields matter here — the rhythm test
 * measures attack-grid overlap, not contour — so `direction` / `pitchClass`
 * are left at neutral defaults. (The contour test builds its signature
 * from a real picked MIDI line via `signatureFromMidiLine` instead.)
 */
function planToRhythmSignature(plan: any[]): any {
    const notes = plan.map((node, index) => ({
        stepOffset: node.stepTarget,
        durationSteps: node.durationSteps,
        pitchClass: 0,
        midi: 64,
        velocity: node.velocity,
        isStrongBeat: node.isStrongBeat,
        tripletPlacement: null,
        timingOffset: 0,
        direction: 0,
        isAnchor: index === 0 || index === plan.length - 1,
    }));
    return {
        sourceKind: 'performed',
        sourceLoop: 0,
        spanSteps: notes.length ? notes[notes.length - 1].stepOffset + 1 : 0,
        entryPitchClass: 0,
        cadencePitchClass: 0,
        anchorPitchClasses: [],
        tripletCarry: false,
        notes,
    };
}

/** Generate the Restatement echo plan from a Statement signature. */
function generateEchoPlan(statementSignature: any): any[] {
    return generateRhythmPlan(
        0,
        ACTIVE_STEPS,
        'scalar',
        0.6,
        STEPS_PER_MEASURE,
        STEPS_PER_BEAT,
        makeCoordination(ACTIVE_STEPS),
        256,
        makeRestatementSoloist(statementSignature),
        null,
        0,
    );
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Jaccard overlap of two attack-step-offset sets. */
function rhythmSimilarity(a: any[], b: any[]): number {
    const setA = new Set(a.map((n) => n.stepTarget));
    const setB = new Set(b.map((n) => n.stepTarget));
    if (setA.size === 0 && setB.size === 0) {
        return 1;
    }
    let intersection = 0;
    for (const s of setA) {
        if (setB.has(s)) {
            intersection++;
        }
    }
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

/**
 * Contour similarity of two GENERATED MIDI lines. Compares the sign of
 * each successive interval (the melodic direction) position-by-position
 * over the shorter of the two lines, and reports the fraction that
 * match. A line that re-traces another's shape scores near 1.0; two
 * independent lines score near the chance baseline.
 */
function contourSimilarity(midiLineA: number[], midiLineB: number[]): number {
    const n = Math.min(midiLineA.length, midiLineB.length);
    if (n < 2) {
        return 0;
    }
    let matches = 0;
    let compared = 0;
    for (let i = 1; i < n; i++) {
        const dirA = Math.sign(midiLineA[i] - midiLineA[i - 1]);
        const dirB = Math.sign(midiLineB[i] - midiLineB[i - 1]);
        compared++;
        if (dirA === dirB) {
            matches++;
        }
    }
    return compared === 0 ? 0 : matches / compared;
}

// ---------------------------------------------------------------------------
// Real pitch-picker driver
// ---------------------------------------------------------------------------

// A flat ii–V–I bar of chords the picker walks; one chord per measure so the
// contour bias is exercised against a moving (but predictable) harmony.
const Dm7 = { rootMidi: 62, quality: 'm7', intervals: [0, 3, 7, 10], beats: 4 };
const G7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
const Cmaj7 = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], beats: 4 };
const PROGRESSION = [Dm7, G7, Cmaj7, Cmaj7];

/**
 * Soloist mock for the PITCH picker. `srdcState` drives the picker's
 * `isRestatementEcho` / `srdcChordToneMult` branches; `restatementEcho`
 * is irrelevant to the picker (only the rhythm engine reads it) but is
 * kept consistent for clarity. `lastMidiPlayed` is threaded by the
 * caller between attacks so the picker sees a real running line.
 */
function makePickerSoloist(srdcState: string) {
    return makeSoloistMock({
        mode: 'monophonic',
        style: 'scalar',
        octave: 64,
        sessionSeed: null,
        rhythmicEntropy: 0,
        transitionState: 'playing',
        isResting: false,
        lastMidiPlayed: 64,
        phraseContext: {
            role: 'call',
            skeleton: [],
            lastInterval: null,
            // profile null: no Greats pentatonic bias competing with the
            // contour multiplier (feedback_test_isolation_competing_biases).
            profile: null,
            signature: null,
            responseSignature: null,
            responseMode: 'free',
            responseSource: 'free',
            sectionLabel: null,
            sectionOccurrence: 0,
            srdcState,
        },
    });
}

/**
 * Run a rhythm plan through the real pitch picker and return the
 * generated MIDI line. `srdcState` selects the picker phase; the picker's
 * `isRestatementEcho` branch fires only when the plan's nodes carry
 * `responseSource: 'recent'` AND srdcState is 'restatement' — i.e. only
 * for the echo plan. `lastMidiPlayed` is threaded forward so the picker
 * evaluates each interval against a real running line.
 */
function runPickerOverPlan(plan: any[], srdcState: string): number[] {
    const soloist = makePickerSoloist(srdcState);
    // `selectPitchAndDevices` reads `state.{groove,soloist,arranger}` through
    // `getScaleForChord`. Minimal shape: a scalar/major key context, no genre
    // pentatonic remap, the same soloist mock so tension reads are consistent.
    const pickerState: any = {
        groove: { genreFeel: 'Jazz', pocket: 0 },
        soloist,
        arranger: { key: 'C', isMinor: false, timeSignature: '4/4' },
    };
    const line: number[] = [];
    let lastMidi = 64;
    for (let i = 0; i < plan.length; i++) {
        const node = plan[i];
        const measure = Math.floor(node.stepTarget / STEPS_PER_MEASURE);
        const chord = PROGRESSION[measure % PROGRESSION.length];
        soloist.audio.lastMidiPlayed = lastMidi;
        const result = selectPitchAndDevices(
            pickerState,
            node.stepTarget,
            node,
            chord,
            null,
            'scalar',
            0.6,
            node.stepTarget % STEPS_PER_MEASURE,
            { sectionStart: 0, sectionEnd: ACTIVE_STEPS + 64, stepCoordination: {} },
            { currentLoopCount: 0 },
            soloist,
            { pocket: 0 },
            {},
            STEPS_PER_MEASURE,
            STEPS_PER_BEAT,
            null,
        );
        const midi = Array.isArray(result) ? result[0]?.midi : result?.midi;
        if (Number.isFinite(midi) && midi > 0) {
            line.push(midi);
            lastMidi = midi;
        }
    }
    return line;
}

/**
 * Build a MotifSignature from a GENERATED MIDI line + its rhythm plan.
 * `direction` is the real interval sign between successive picked notes,
 * `pitchClass` the real pitch class — so the echo carries the Statement's
 * actual melodic shape (not a synthetic walk) into the picker.
 */
function signatureFromMidiLine(plan: any[], midiLine: number[]): any {
    let prevMidi: number | null = null;
    const notes = midiLine.map((midi, index) => {
        const node = plan[index];
        const direction = prevMidi === null ? 0 : Math.sign(midi - prevMidi);
        prevMidi = midi;
        return {
            stepOffset: node.stepTarget,
            durationSteps: node.durationSteps,
            pitchClass: ((midi % 12) + 12) % 12,
            midi,
            velocity: node.velocity,
            isStrongBeat: node.isStrongBeat,
            tripletPlacement: null,
            timingOffset: 0,
            direction,
            isAnchor: index === 0 || index === midiLine.length - 1,
        };
    });
    return {
        sourceKind: 'performed',
        sourceLoop: 0,
        spanSteps: notes.length ? notes[notes.length - 1].stepOffset + 1 : 0,
        entryPitchClass: notes.length ? notes[0].pitchClass : 0,
        cadencePitchClass: notes.length ? notes[notes.length - 1].pitchClass : 0,
        anchorPitchClasses: [],
        tripletCarry: false,
        notes,
    };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Soloist SRDC Restatement — motif echo (Epic 11 S4)', () => {
    const seeds = [0xc0ffee, 0xdeadbe, 0x12345, 0xabcdef, 0x111111, 0xfeedf, 0x10101, 0x55aa55];

    it('Restatement echoes its Statement rhythm; Statement vs Departure does not', () => {
        let echoSimSum = 0;
        let baselineSimSum = 0;
        let minEchoSim = 1;
        let maxBaselineSim = 0;

        for (const seed of seeds) {
            const statementPlan = generateNormalPlan(seed, 'statement');
            const departurePlan = generateNormalPlan(seed + 1, 'departure');
            const statementSignature = planToRhythmSignature(statementPlan);
            const echoPlan = generateEchoPlan(statementSignature);

            // The echo replays the Statement's attack grid verbatim — this
            // is deterministic by construction (buildRestatementEchoPlan
            // does zero Math.random), so the attack-step SET is identical.
            const echoSim = rhythmSimilarity(echoPlan, statementPlan);
            // Baseline: an independent Departure phrase vs the Statement.
            const baselineSim = rhythmSimilarity(departurePlan, statementPlan);

            echoSimSum += echoSim;
            baselineSimSum += baselineSim;
            minEchoSim = Math.min(minEchoSim, echoSim);
            maxBaselineSim = Math.max(maxBaselineSim, baselineSim);
        }

        const meanEcho = echoSimSum / seeds.length;
        const meanBaseline = baselineSimSum / seeds.length;

        console.log('\n--- SOLOIST SRDC RESTATEMENT — RHYTHM ECHO ---');
        console.log(`[Seeds]                       ${seeds.length}`);
        console.log(
            `[Restatement vs Statement]    mean ${(meanEcho * 100).toFixed(1)}%  min ${(minEchoSim * 100).toFixed(1)}%  (echo — expect ~100%)`,
        );
        console.log(
            `[Departure   vs Statement]    mean ${(meanBaseline * 100).toFixed(1)}%  max ${(maxBaselineSim * 100).toFixed(1)}%  (baseline — independent phrase)`,
        );
        console.log(
            `[Gap]                         +${((meanEcho - meanBaseline) * 100).toFixed(1)}pt`,
        );
        console.log('----------------------------------------------------\n');

        // The echo is deterministic — attack-step sets match exactly. A
        // strict 1.0 is correct here (no statistical range): the rhythm
        // engine replays buildRestatementEchoPlan with no Math.random.
        expect(minEchoSim).toBe(1);
        // The Departure baseline shares only incidental positions. Across
        // 8 seeds it sits well under 0.6 — a Restatement echo is a
        // categorically tighter rhythmic match than two independent
        // phrases. Threshold 0.7 gives generous headroom over the worst
        // observed baseline while still being far below the 1.0 echo.
        expect(maxBaselineSim).toBeLessThan(0.7);
        // The echo must clear the baseline by a wide, musically-meaningful
        // margin — the whole point of S4 is that Restatement is audibly
        // distinct from "another Statement-like phrase".
        expect(meanEcho - meanBaseline).toBeGreaterThan(0.3);
    });

    it('Restatement re-traces the Statement contour through the real picker; Departure does not', () => {
        // This exercises the actual pitch path: every phrase is run through
        // `selectPitchAndDevices`. The Restatement echo plan carries
        // `responseSource: 'recent'`, which arms the picker's
        // `isRestatementEcho` final-stage contour multiplier; the Departure
        // baseline runs the same picker with no contour bias.
        //
        // The picker has a weighted-random pick, so we sweep many seeds and
        // assert statistical ranges — NOT `=== 1` (that strict form is valid
        // only for the deterministic rhythm half above).
        let echoContourSum = 0;
        let baselineContourSum = 0;
        let minEchoContour = 1;
        let maxBaselineContour = 0;

        for (const seed of seeds) {
            // Pin Math.random for this seed so the Statement / Departure
            // rhythm grids AND the picker's weighted pick are reproducible.
            const original = Math.random;
            Math.random = makeMulberry32(seed);
            try {
                // Statement: real rhythm grid → real picked MIDI line.
                const statementPlan = generateNormalPlan(seed, 'statement');
                const statementLine = runPickerOverPlan(statementPlan, 'statement');
                // Build the echo source from the Statement's GENERATED line.
                const statementSignature = signatureFromMidiLine(statementPlan, statementLine);
                const echoPlan = generateEchoPlan(statementSignature);
                // Restatement: echo plan → picker (isRestatementEcho fires).
                const restatementLine = runPickerOverPlan(echoPlan, 'restatement');
                // Departure baseline: independent rhythm grid → picker, no
                // contour bias. Compared against the same Statement line.
                const departurePlan = generateNormalPlan(seed + 1, 'departure');
                const departureLine = runPickerOverPlan(departurePlan, 'departure');

                const echoContour = contourSimilarity(restatementLine, statementLine);
                const baselineContour = contourSimilarity(departureLine, statementLine);

                echoContourSum += echoContour;
                baselineContourSum += baselineContour;
                minEchoContour = Math.min(minEchoContour, echoContour);
                maxBaselineContour = Math.max(maxBaselineContour, baselineContour);
            } finally {
                Math.random = original;
            }
        }

        const meanEchoContour = echoContourSum / seeds.length;
        const meanBaselineContour = baselineContourSum / seeds.length;

        console.log('\n--- SOLOIST SRDC RESTATEMENT — CONTOUR ECHO (picker) ---');
        console.log(`[Seeds]                       ${seeds.length}`);
        console.log(
            `[Restatement contour match]   mean ${(meanEchoContour * 100).toFixed(1)}%  min ${(minEchoContour * 100).toFixed(1)}%`,
        );
        console.log(
            `[Departure   contour match]   mean ${(meanBaselineContour * 100).toFixed(1)}%  max ${(maxBaselineContour * 100).toFixed(1)}%`,
        );
        console.log(
            `[Gap]                         +${((meanEchoContour - meanBaselineContour) * 100).toFixed(1)}pt`,
        );
        console.log('--------------------------------------------------------\n');

        // The Restatement contour must measurably re-trace the Statement.
        // The `isRestatementEcho` multiplier (×3.4 direction-match vs ×0.45
        // direction-fight) is a firm but soft bias — "looser landings" — so
        // the match lands well above the ~50% chance baseline for a 3-way
        // sign but not at a hard 100% lock (chord-tone/strong-beat anchors
        // still win individual landings). Measured mean is a deterministic
        // 64.7% (Math.random is mulberry32-pinned per seed, so the metric is
        // reproducible, not a band); 0.62 leaves ~2.7pt headroom.
        expect(meanEchoContour).toBeGreaterThan(0.62);
        // The Departure baseline is two independent picker lines — its
        // direction-sign agreement sits near chance (measured 30.2%) and
        // clearly below the echo. The echo must clear the baseline by a wide
        // margin: contour echo is the second half of the S4 claim. Measured
        // gap is +34.5pt; 0.15 leaves ~19pt headroom.
        expect(meanEchoContour - meanBaselineContour).toBeGreaterThan(0.15);
    });

    it('a Restatement with no captured Statement falls through to a fresh phrase', () => {
        // Defensive: if restatementEcho is null (no prior Statement, or it
        // was too short), the engine must NOT echo — it generates normally.
        const soloist = makeRestatementSoloist(null);
        const plan = generateNormalPlanWith(soloist);
        // A normal scalar phrase over 4 bars always emits several attacks.
        expect(plan.length).toBeGreaterThan(3);
    });
});

/** Run generateRhythmPlan against an arbitrary soloist mock (deterministic seed). */
function generateNormalPlanWith(soloist: any): any[] {
    // Epic 12 S1: inject the PRNG via `generateRhythmPlan`'s `random` parameter.
    const prng = makeMulberry32(0xc0ffee);
    return generateRhythmPlan(
        0,
        ACTIVE_STEPS,
        'scalar',
        0.6,
        STEPS_PER_MEASURE,
        STEPS_PER_BEAT,
        makeCoordination(ACTIVE_STEPS),
        256,
        soloist,
        null,
        0,
        prng,
    );
}
