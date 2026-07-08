// @ts-nocheck
// Soloist question→answer phrase pairing critique (#1009) — PRODUCTION-FAITHFUL on
// the live engine (getSoloistNotePhraseFirst), the DoD gate for the Q&A slice of the
// phrase-first design (docs/design/soloist-phrase-first.md §4.2).
//
// What this guards: within a 4-bar motif block the soloist now asks and answers — a
// 2-bar QUESTION that hangs on a soft-color, non-chord tone, a carved breath, then a
// 2-bar ANSWER that resolves onto a chord pillar. It is what makes the exposed early
// loops (0-1, before development kicks in) "say something" rather than wander.
//
// Why it is NOT tautological: the seed's qaRole tag only LOCATES each cadence (the
// structural plan). Every assertion measures the LIVE, EMITTED pitch/rest at that
// step against the chord — i.e. whether the seed pin actually SURVIVED the live pitch
// pipeline (the scoring loop, key-scale-snapping development, the density gate). An
// earlier build where the cadence pin was washed out by the scoring loop FAILED this
// exact harness; that is the regression it exists to catch.
//
// Metrics (chord frame — what the listener hears against the sounding chord),
// aggregated over an 8-seed sweep across loops 0-1:
//   • sounded   — the cadence is NOT gated to silence (the protection; the point of
//                 the story — a phrase can't "say something" if its cadence is eroded)
//   • nonChord  — the QUESTION lands a non-chord tone (it hangs, doesn't resolve)
//   • pillar    — the ANSWER lands a chord tone (it resolves home)
//   • breath    — the beat after the question cadence is a rest (the inhale)
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { chordTargetTones } from '../../public/engine/soloist-pitch-engine.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

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

// Drive the LIVE engine over loops 0-1, sampling the emitted pitch/rest at each
// seed-tagged Q&A cadence step. The tag locates the cadence; every assertion is about
// the LIVE OUTPUT (did the pin / gate-exemption / breath actually survive).
function measureOnce(presetName, genre, bpm, seedStr) {
    const state = buildState(presetName, genre, bpm);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.5, seedStr);
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const ts = TIME_SIGNATURES[state.arranger.timeSignature || '4/4'];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const stepsPerBeat = ts.stepsPerBeat;
    const total = state.arranger.totalSteps;
    const loopLen = seed.loopLengthSteps || total;
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
    const chordPcsOf = (chord) =>
        new Set((chord.intervals || [0, 4, 7]).map((iv) => (chord.rootMidi + iv) % 12));

    const qSteps = seed.notes.filter((n) => n.qaRole === 'question').map((n) => n.step);
    const aSteps = seed.notes.filter((n) => n.qaRole === 'answer').map((n) => n.step);

    // SEED-level breath carve — deterministic, and NOT masked by the live density gate
    // (which rests non-anchor notes on the sparse early loops regardless, so the live
    // breath rate can look healthy even if the carve broke). For each question cadence
    // seed note, the beat AFTER it must be free of any other sounding seed note.
    let seedQ = 0;
    let seedBreath = 0;
    for (const n of seed.notes) {
        if (n.qaRole !== 'question') {
            continue;
        }
        seedQ++;
        const clash = seed.notes.some(
            (m) => m !== n && m.step > n.step && m.step <= n.step + stepsPerBeat,
        );
        if (!clash) {
            seedBreath++;
        }
    }

    const acc = {
        q: 0,
        qSounded: 0,
        qNonChord: 0,
        qKeyUnstable: 0,
        qNotResolution: 0,
        breathN: 0,
        breath: 0,
        a: 0,
        aSounded: 0,
        aPillar: 0,
        seedQ,
        seedBreath,
    };
    // #1051 — key-frame metrics for the blues idiom. The test is always in C major
    // (buildState dispatches SET_KEY 'C', isMinor false), so the key's tonic triad is
    // {0,4,7}. Over a dominant a correct ♭7 hang IS a chord tone, so the chord-frame
    // `nonChordRate` is the wrong "hang" metric for blues — these two frame the ask:
    //   keyUnstable      — question pc ∉ key tonic triad {0,4,7} (it pulls somewhere)
    //   notResolution    — question pc ∉ the sounding chord's {root,3,5} (♭7 counts as
    //                      unresolved: a chord tone, but the ask, not the home)
    const KEY_TONIC_TRIAD = new Set([0, 4, 7]);
    const resolutionPcsOf = (chord) =>
        new Set([0, 4, 7].map((iv) => (((chord.rootMidi + iv) % 12) + 12) % 12));
    for (let loop = 0; loop < 2; loop++) {
        const base = loop * loopLen;
        for (const s of qSteps) {
            const abs = base + s;
            const chord = chordAt(abs);
            if (!chord) {
                continue;
            }
            acc.q++;
            const midi = midiOf(emit(abs));
            if (midi == null) {
                continue;
            }
            acc.qSounded++;
            const pc = ((midi % 12) + 12) % 12;
            if (!chordPcsOf(chord).has(pc)) {
                acc.qNonChord++;
            }
            if (!KEY_TONIC_TRIAD.has(pc)) {
                acc.qKeyUnstable++;
            }
            if (!resolutionPcsOf(chord).has(pc)) {
                acc.qNotResolution++;
            }
            // Breath: the beat AFTER the question cadence should be a rest.
            acc.breathN++;
            let broke = false;
            for (let k = 1; k <= stepsPerBeat; k++) {
                if (midiOf(emit(abs + k)) != null) {
                    broke = true;
                    break;
                }
            }
            if (!broke) {
                acc.breath++;
            }
        }
        for (const s of aSteps) {
            const abs = base + s;
            const chord = chordAt(abs);
            if (!chord) {
                continue;
            }
            acc.a++;
            const midi = midiOf(emit(abs));
            if (midi == null) {
                continue;
            }
            acc.aSounded++;
            const pc = ((midi % 12) + 12) % 12;
            // Grade the answer against the chord's QUALITY-derived pillars (root/3/5/(♭7)),
            // NOT the comp voicing: blues comps ROOTLESS, so a `chord.intervals` set omits
            // the root and would miscount a correct root-landing resolution as a miss.
            // This is the same functional-pillar reference the live answer re-snap uses.
            const pillarPcs = new Set(chordTargetTones(chord.rootMidi, chord.quality).pillars);
            if (pillarPcs.has(pc)) {
                acc.aPillar++;
            }
        }
    }
    return acc;
}

function sweep(presetName, genre, bpm) {
    const agg = {
        q: 0,
        qSounded: 0,
        qNonChord: 0,
        qKeyUnstable: 0,
        qNotResolution: 0,
        breathN: 0,
        breath: 0,
        a: 0,
        aSounded: 0,
        aPillar: 0,
        seedQ: 0,
        seedBreath: 0,
    };
    for (let i = 0; i < 8; i++) {
        const r = measureOnce(presetName, genre, bpm, `QA_${presetName}_${i}`);
        for (const k of Object.keys(agg)) {
            agg[k] += r[k];
        }
    }
    return {
        qCount: agg.q,
        aCount: agg.a,
        qSoundedRate: agg.q > 0 ? agg.qSounded / agg.q : 0,
        aSoundedRate: agg.a > 0 ? agg.aSounded / agg.a : 0,
        nonChordRate: agg.qSounded > 0 ? agg.qNonChord / agg.qSounded : 0,
        keyUnstableRate: agg.qSounded > 0 ? agg.qKeyUnstable / agg.qSounded : 0,
        notResolutionRate: agg.qSounded > 0 ? agg.qNotResolution / agg.qSounded : 0,
        pillarRate: agg.aSounded > 0 ? agg.aPillar / agg.aSounded : 0,
        breathRate: agg.breathN > 0 ? agg.breath / agg.breathN : 0,
        seedBreathRate: agg.seedQ > 0 ? agg.seedBreath / agg.seedQ : 0,
    };
}

// Two idioms, two "hang" metrics.
//   • diatonic (Slice 1) — ballad presets where chord-color and key-instability align;
//     the hang is measured in the CHORD frame (`nonChordRate`).
//   • blues (Slice 2, #1051) — dom7-heavy presets where a correct ♭7 hang IS a chord
//     tone, so the chord frame can't tell an ask from a resolution. Measured in the KEY
//     frame (`keyUnstableRate`) plus a not-on-the-chord's-home check (`notResolutionRate`).
// 'Jazz Blues' (ii–V, style jazz) is the deferred bebop slice; 'Minor Blues' hangs over
// i7 (the untouched diatonic branch) — both excluded here.
const CASES = [
    { preset: 'Pop (Ballad)', genre: 'Rock', bpm: 72, idiom: 'diatonic' },
    { preset: 'Canon', genre: 'Acoustic', bpm: 76, idiom: 'diatonic' },
    { preset: 'Pop (Standard)', genre: 'Rock', bpm: 84, idiom: 'diatonic' },
    { preset: '12-Bar Blues', genre: 'Blues', bpm: 100, idiom: 'blues' },
    { preset: '8-Bar Blues', genre: 'Blues', bpm: 110, idiom: 'blues' },
];

describe('Soloist Q&A phrasing critique (#1009, #1051)', () => {
    for (const { preset, genre, bpm, idiom } of CASES) {
        it(`${preset}: the lead asks (hangs) and answers (resolves), audible on loops 0-1`, () => {
            const r = sweep(preset, genre, bpm);
            const hangReport =
                idiom === 'blues'
                    ? `keyUnstable ${(100 * r.keyUnstableRate).toFixed(1)}% notResolution ${(100 * r.notResolutionRate).toFixed(1)}%`
                    : `nonChord ${(100 * r.nonChordRate).toFixed(1)}%`;
            console.log(
                `\n[Critique Report — ${preset} (${idiom})] Q=${r.qCount} A=${r.aCount} | ` +
                    `Q sounded ${(100 * r.qSoundedRate).toFixed(1)}% ${hangReport} | ` +
                    `A sounded ${(100 * r.aSoundedRate).toFixed(1)}% pillar ${(100 * r.pillarRate).toFixed(1)}% | ` +
                    `breath live ${(100 * r.breathRate).toFixed(1)}% seed ${(100 * r.seedBreathRate).toFixed(1)}%`,
            );

            // Enough cadences to be statistically meaningful (harness liveness). Both
            // idioms host ~350-440 questions over the 8-seed × 2-loop sweep (blues charts
            // do NOT host fewer — their macro-form unrolls just as many 4-bar blocks), so a
            // single 200 floor leaves ample headroom while still catching a gross
            // cadence-count regression.
            expect(r.qCount).toBeGreaterThan(200);
            expect(r.aCount).toBeGreaterThan(200);

            // PROTECTION — the cadences are never gated to silence, so the phrase
            // speaks even on the sparse early loops (the story's core). Live=100%.
            expect(r.qSoundedRate).toBeGreaterThan(0.98);
            expect(r.aSoundedRate).toBeGreaterThan(0.98);

            if (idiom === 'blues') {
                // THE HANG (blues, two-frame). The PRIMARY guard is keyUnstable: the
                // question pulls away from the key tonic triad {C,E,G}. A PINNED question
                // never lands there (verified: over I7/IV7/V7 no two-frame candidate is a
                // key tonic tone), so live 92-98%; floor 0.85. A washed-out pin regresses to
                // the scoring loop's guide-tone pull (3rd/♭7/root), landing ~half on key-
                // stable tones → keyUnstable collapses toward ~55%. That's the guard.
                expect(r.keyUnstableRate).toBeGreaterThan(0.85);
                // SECONDARY: notResolution — the question is not sitting on the sounding
                // chord's {root,3,5} home (♭7 counts as unresolved: the ask, not the rest).
                // Floors LOWER (live 75-78%; floor 0.65) than keyUnstable BY DESIGN: the
                // #1009 apex dovetail deliberately aims the biggest question at the money
                // note's neighbor (e.g. F→G approach), which over IV7 lands on the chord
                // root — key-unstable (a real ask) yet on a chord tone. A washed pin still
                // drops this toward ~55% (chord-tone / guide-tone landings), so it remains a
                // regression guard, just a looser one than the key-frame metric.
                expect(r.notResolutionRate).toBeGreaterThan(0.65);
            } else {
                // THE HANG (diatonic). The question lands a non-chord tone (unresolved
                // tension against the sounding chord). Live 91-97%; floor 0.80 (>10pp
                // headroom). A washed-out pin drops this toward the ~25-45% incidental
                // rate — the regression guard.
                expect(r.nonChordRate).toBeGreaterThan(0.8);
            }

            // THE RESOLUTION — the answer lands a chord tone (comes home). Live 85-100%;
            // floor 0.75 (10pp under the lowest case).
            expect(r.pillarRate).toBeGreaterThan(0.75);

            // THE BREATH — the beat after the question is a carved rest (the inhale).
            // Live 85-95%; floor 0.70. Because the early-loop density gate rests notes
            // anyway, the SEED-level carve is asserted separately (below) as the real
            // guard — the live rate alone could be faked by incidental sparsity.
            expect(r.breathRate).toBeGreaterThan(0.7);

            // THE CARVE (deterministic) — at the SEED, the beat after each question
            // cadence is free of any other sounding note. This is what a broken carve
            // would actually fail; early-loop sparsity cannot mask it. Seed ~97-100%.
            expect(r.seedBreathRate).toBeGreaterThan(0.9);
        });
    }
});
