// @ts-nocheck
// cspell:words hookiness ngram
// Soloist hookiness critique (#1056) — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst), the DoD gate for the hook slice of the phrase-first design.
//
// What this guards: the early loops the listener hears first (the exposed "head") now
// contain a short, repeating, IDENTIFIABLE figure. The seeder pins the first few notes of
// each motif block's measure 0 (`hookRole`) to a CHORD-TONE arpeggio (root + guide tones),
// re-rooted on each block's local chord — so the interval SHAPE is fixed and only the root
// transposes with the harmony (a sequenced riff I→IV→V); the live engine exempts it from
// the density gate and from the strong-beat landing snap, so it survives intact. This is
// the fix for the "sparse / hard to identify the melody" early-loop complaint (#1055),
// which a density probe showed was NOT about note COUNT but about the ABSENCE of a hook.
//
// SCOPE: the "same figure I→IV→V" property holds when consecutive blocks share chord
// QUALITY (blues I/IV/V are all dom7 → one shape). On functional harmony (a jazz ii–V–I:
// min7/dom7/maj7) the fixed degree-shape maps through three different chord-tone sets → the
// contour differs per chord, so it is NOT one recurring hook there. This is a riff-blues
// head device; recurrence is asserted on blues only, by design (not over-claimed).
//
// Why it is NOT tautological: the seed's hookRole tag only LOCATES the intended cell. The
// metric measures the LIVE, EMITTED note stream — whether a recurring n-gram actually
// EMERGES in what the listener hears, after the full live pitch pipeline (development,
// landing snaps, the density gate). It is scored against a seeded-SHUFFLE null (same
// notes, adjacency destroyed): a real recurring figure beats the null several-fold;
// incidental repetition does not. A build where the hook pin was washed out by the scoring
// loop, or the gate/landing snap eroded the cell, collapses the ratio toward 1×.
//
// FRAME (the #1055 lesson): sample the first 24 bars — the unrolled "head" (Intro) span
// where the hook lives — with currentLoopCount = floor(step / arranger.totalSteps). NOT
// the seed's ~2112-step unrolled development span (`loopLengthSteps`): sampling by that
// measures mid-development material the listener reaches only many loops in.
//
// TWO CASES, TWO CONTRACTS:
//   • 12-Bar Blues — full RECURRENCE DoD. A 12-bar loop unrolls to a 24-bar Intro (6
//     four-bar hook blocks over I/IV/V), so the transposing riff recurs strongly (~3×+
//     the null). This is the #1055 complaint chart and the real guard.
//   • Pop (Ballad) — LIVENESS + PROTECTION + CROSS-SECTION (no generic-figure floor).
//     Its head is sparse (~2-note cells), so the 4-note n-gram can't certify recurrence
//     — that stays blues-only, by design (not over-claimed).
//
// #1058 CROSS-SECTION THEME RETURN (both cases): the Verse used to compose a FRESH
// motif (the head a listener learned was replaced wholesale — the weak-ballad-hook
// root cause). With motif inheritance the Verse's measure-0 hook cell IS the head's,
// so an Intro-emitted cell shape must reappear among the first Verse blocks. This is
// asserted as a set-intersection of per-block cell signatures (relative steps +
// within-cell intervals — octave- and, in a same-quality loop, root-invariant),
// windowed by the REAL unrolled section boundaries. Pre-inheritance: 0 matches ever.
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { unrollArrangement } from '../../public/engine/arranger-utils.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// Deterministic PRNG for the shuffle null (no Math.random — keep the critique seeded).
function mulberry32(seedInt) {
    let a = seedInt >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function buildState(presetName, genre, bpm) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.5);
    dispatch(ACTIONS.SET_BPM, bpm);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    const ts = preset.settings?.timeSignature || preset.sections[0]?.timeSignature || '4/4';
    dispatch(ACTIONS.SET_TIME_SIGNATURE, ts);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

// Clamp a melodic interval so an octave-fold outlier doesn't invent a unique token.
function clampInterval(semitones) {
    if (semitones > 12) {
        return 13;
    }
    if (semitones < -12) {
        return -13;
    }
    return semitones;
}

// Count the most frequent length-n n-gram of (interval,IOI) transition tokens — an
// (n+1)-note melodic+rhythmic figure — over a consecutive emitted-note stream.
function topNgramCount(tokens, n) {
    if (tokens.length < n) {
        return 0;
    }
    const counts = new Map();
    let top = 0;
    for (let i = 0; i + n <= tokens.length; i++) {
        const key = tokens.slice(i, i + n).join('|');
        const c = (counts.get(key) || 0) + 1;
        counts.set(key, c);
        if (c > top) {
            top = c;
        }
    }
    return top;
}

function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const NGRAM = 3; // a 4-note figure — the hook cell is up to 4 notes at measure 0
const NULL_TRIALS = 4;

// Drive the LIVE engine over the 24-bar head (plus the first Verse blocks for the
// #1058 cross-section check), collect the emitted note stream, and score the
// recurring-figure strength vs a seeded-shuffle null.
function measureOnce(presetName, genre, bpm, seedStr, shuffleSeed) {
    const state = buildState(presetName, genre, bpm);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.5, seedStr);
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const ts = TIME_SIGNATURES[state.arranger.timeSignature || '4/4'];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const total = state.arranger.totalSteps;
    const sampleSteps = 24 * stepsPerBar; // the unrolled Intro "head" span
    // #1058 — real section boundaries of the unrolled macro-form (same call the seeder
    // makes), so the cross-section cell check compares actual Intro vs Verse spans
    // rather than assuming where the boundary falls for a given preset.
    const unrolled = unrollArrangement(state.arranger, 128);
    const intro = unrolled.sectionMap.find((s) => s.label === 'Intro');
    const verse = unrolled.sectionMap.find((s) => s.label === 'Verse');
    const blockSteps = 4 * stepsPerBar;
    const verseSampleEnd = verse ? Math.min(verse.start + 6 * blockSteps, verse.end) : 0;
    const emitEnd = Math.max(sampleSteps, verseSampleEnd);
    const stepMap = state.arranger.stepMap;
    const chordAt = (s) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e) => w >= e.start && w < e.end)?.chord || null;
    };
    const emit = (abs) => {
        state.playback.currentLoopCount = Math.floor(abs / total);
        return getSoloistNotePhraseFirst(
            state,
            chordAt(abs),
            chordAt(abs + 1),
            abs,
            null,
            state.soloist.octave,
            'smart',
            abs % stepsPerBar,
            {},
            { isDownbeat: abs % stepsPerBar === 0, isMeasureStart: abs % stepsPerBar === 0 },
        );
    };
    const midiOf = (res) => {
        if (!res) {
            return null;
        }
        return Array.isArray(res) ? (res[0]?.midi ?? null) : (res.midi ?? null);
    };

    const hookSteps = new Set(
        seed.notes.filter((n) => n.hookRole && n.step >= 0 && n.step < emitEnd).map((n) => n.step),
    );

    const emitted = []; // { step, midi }
    let hookSeen = 0;
    let hookSounded = 0;
    for (let abs = 0; abs < emitEnd; abs++) {
        const midi = midiOf(emit(abs));
        if (midi != null) {
            emitted.push({ step: abs, midi });
        }
        // Liveness/protection counters stay windowed to the 24-bar head — the
        // original #1056 contract, kept comparable across builds.
        if (hookSteps.has(abs) && abs < sampleSteps) {
            hookSeen++;
            if (midi != null) {
                hookSounded++;
            }
        }
    }

    // (interval, IOI) transition tokens over consecutive emitted notes in the 24-bar
    // head window. Interval-based, so the metric is transposition-invariant — it
    // tolerates the hook's chord re-rooting and any depth-development transposition,
    // matching what the ear recognizes.
    const headEmitted = emitted.filter((e) => e.step < sampleSteps);
    const tokens = [];
    for (let i = 0; i + 1 < headEmitted.length; i++) {
        const interval = clampInterval(headEmitted[i + 1].midi - headEmitted[i].midi);
        const ioi = Math.min(16, headEmitted[i + 1].step - headEmitted[i].step);
        tokens.push(`${interval}:${ioi}`);
    }

    const liveTop = topNgramCount(tokens, NGRAM);
    const rng = mulberry32(shuffleSeed);
    let nullSum = 0;
    for (let t = 0; t < NULL_TRIALS; t++) {
        nullSum += topNgramCount(shuffled(tokens, rng), NGRAM);
    }

    // #1058 — cross-section hook-cell identity: does some ≥2-note cell shape emitted
    // in the Intro also appear among the first Verse blocks? With motif inheritance
    // the Verse's measure-0 cell IS the head's, so the sets intersect; with fresh
    // per-role composition they essentially never do.
    const introSigs = intro
        ? cellSigsIn(emitted, hookSteps, stepsPerBar, intro.start, intro.end)
        : new Set();
    const verseSigs = verse
        ? cellSigsIn(emitted, hookSteps, stepsPerBar, verse.start, verseSampleEnd)
        : new Set();
    const crossComparable = introSigs.size > 0 && verseSigs.size > 0;
    const crossMatch = crossComparable && [...introSigs].some((s) => verseSigs.has(s));

    return {
        hookSeen,
        hookSounded,
        liveTop,
        nullTop: nullSum / NULL_TRIALS,
        crossComparable: crossComparable ? 1 : 0,
        crossMatch: crossMatch ? 1 : 0,
    };
}

// #1058 — hook-CELL signatures on the emitted stream, per 4-measure motif block. The
// hook lives in measure 0 of each block; signature = (relative steps)+(within-cell
// intervals) — the shape the ear recognizes, octave-invariant (a section register
// drop/lift moves the whole pinned cell) and, within a same-quality loop, chord-root-
// invariant. Single-note cells are not signatures (a lone recurring step index is not
// a figure) — skipped.
function cellSigsIn(emitted, hookSteps, stepsPerBar, fromStep, toStep) {
    const blockSteps = 4 * stepsPerBar;
    const sigs = new Set();
    for (let bs = fromStep; bs < toStep; bs += blockSteps) {
        const cell = emitted.filter(
            (e) => e.step >= bs && e.step < bs + stepsPerBar && hookSteps.has(e.step),
        );
        if (cell.length < 2) {
            continue;
        }
        sigs.add(
            `[${cell.map((e) => e.step - bs).join(',')}]` +
                `(${cell
                    .slice(1)
                    .map((e, i) => clampInterval(e.midi - cell[i].midi))
                    .join(',')})`,
        );
    }
    return sigs;
}

function sweep(presetName, genre, bpm) {
    let hookSeen = 0;
    let hookSounded = 0;
    let liveSum = 0;
    let nullSum = 0;
    let crossComparable = 0;
    let crossMatches = 0;
    const seeds = 8;
    for (let i = 0; i < seeds; i++) {
        const r = measureOnce(presetName, genre, bpm, `HOOK_${presetName}_${i}`, 1000 + i);
        hookSeen += r.hookSeen;
        hookSounded += r.hookSounded;
        liveSum += r.liveTop;
        nullSum += r.nullTop;
        crossComparable += r.crossComparable;
        crossMatches += r.crossMatch;
    }
    return {
        seeds,
        hookSeen,
        hookSoundedRate: hookSeen > 0 ? hookSounded / hookSeen : 0,
        liveTopMean: liveSum / seeds,
        nullTopMean: nullSum / seeds,
        ratio: nullSum > 0 ? liveSum / nullSum : 0,
        crossComparable,
        crossMatches,
    };
}

const CASES = [
    { preset: '12-Bar Blues', genre: 'Blues', bpm: 100, recurrence: true },
    { preset: 'Pop (Ballad)', genre: 'Rock', bpm: 72, recurrence: false },
];

describe('Soloist hookiness critique (#1056)', () => {
    for (const { preset, genre, bpm, recurrence } of CASES) {
        it(`${preset}: the head carries an identifiable, protected hook`, () => {
            const r = sweep(preset, genre, bpm);
            console.log(
                `\n[Critique Report — ${preset}] ` +
                    `hookNotes=${r.hookSeen} sounded ${(100 * r.hookSoundedRate).toFixed(1)}% | ` +
                    `top${NGRAM + 1}note-figure live ${r.liveTopMean.toFixed(2)} ` +
                    `null ${r.nullTopMean.toFixed(2)} | ratio ${r.ratio.toFixed(2)}× | ` +
                    `Intro↔Verse cell match ${r.crossMatches}/${r.crossComparable} ` +
                    `(of ${r.seeds} seeds)`,
            );

            // LIVENESS — hook notes exist in the head (the seeder placed the cell; guards
            // the hookRole plumbing end-to-end).
            expect(r.hookSeen).toBeGreaterThan(20);

            // PROTECTION — the hook is never gated to silence (a figure can't be a hook if
            // the density gate erodes it on the sparse early loops). Live 100%.
            expect(r.hookSoundedRate).toBeGreaterThan(0.98);

            // #1058 CROSS-SECTION THEME RETURN — the Verse INHERITS the head motif
            // (measure-0 hook cell verbatim), so some ≥2-note cell shape emitted in the
            // Intro must reappear among the first Verse blocks. Pre-inheritance builds
            // measure 0/8 and 0/4 here (fresh per-role motifs never coincide); with
            // inheritance every comparable seed matches (8/8, 4/4). Sparse ballad heads
            // don't always emit a ≥2-note cell in both sections, hence the comparable
            // floor rather than all-8.
            expect(r.crossComparable).toBeGreaterThanOrEqual(3);
            expect(r.crossMatches / r.crossComparable).toBeGreaterThanOrEqual(0.75);

            if (recurrence) {
                // RECURRENCE (vs null) — the PRIMARY guard. The recurring figure is REAL,
                // not incidental: it beats a seeded-shuffle of the same notes several-fold
                // (live ~3.15×). A washed-out pin / gate- or landing-eroded cell collapses
                // toward the null (ratio → 1). Floor 2.0: a hard wall above the ~1.0
                // regression floor, comfortably under the live value.
                expect(r.ratio).toBeGreaterThan(2);
                // ABSOLUTE — the top 4-note figure recurs several times across the head's
                // ~6 hook blocks. Live ~3.25; floor 2.5.
                expect(r.liveTopMean).toBeGreaterThan(2.5);
            }
        });
    }
});
