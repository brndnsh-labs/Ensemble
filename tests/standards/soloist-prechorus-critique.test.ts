// @ts-nocheck
// #1206 — the pre-chorus is its own section category in the soloist seeder.
//
// Two spellings failed in OPPOSITE directions before this landed:
//
//   'Pre'        (what the wizard actually emits) fell through to the generic
//                `replace(/[^a-z]/g,'')` tail as category 'pre', which
//                `isDepartureCategory` does not list — so it was treated as a
//                STATEMENT: no register lift, and its final note was snapped
//                onto a stable chord tone. A pre-chorus's whole job is to end
//                suspended, hanging into the chorus downbeat; the engine
//                resolved the one cadence that must not resolve.
//
//   'Pre-Chorus' (hand-typed) hit `normalized.includes('chorus')` FIRST, so it
//                was filed under the same `sectionMotifs` entry as the real
//                chorus and took `seedChorusLift`. The soloist played the
//                chorus line during the pre-chorus, then again in the chorus.
//
// Everything here is asserted through the seed the production entrypoint
// actually emits — `getSectionCategory`/`isDepartureCategory` are module-private
// and deliberately stay that way, so these are behavioral assertions over
// `generateSessionSeed`, not a unit test of the classifier.
import { describe, expect, it } from 'vitest';
import { unrollArrangement } from '../../public/engine/arranger-utils.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { binarySearchMap } from '../../public/utils.js';

/**
 * The form must be at least 64 bars, and that is load-bearing rather than
 * incidental: `unrollArrangement` (which the seeder calls at its entry, and
 * whose `sectionMap` it seeds against) SYNTHESIZES a macro-form for anything
 * shorter than `targetBars / 2`, and the synthesizer only ever emits
 * Intro/Verse/Chorus/Solo/Outro. On a short chart a 'Pre' section is therefore
 * discarded before the classifier ever sees it, and this whole bug is
 * unreachable — a 12-bar fixture measures nothing and reports green.
 *
 * A real wizard song clears the bar easily (3 minutes at 120bpm in 4/4 is ~90
 * bars), so 6 repetitions of a 12-bar Verse/Pre/Chorus block (= 72 bars) is
 * both over the threshold and a realistic pop form. It also yields six
 * instances of each section per seed, which is what makes the ratios below
 * worth measuring.
 */
const FORM_REPEATS = 6;
const PROGRESSION = 'I | IV | V | I';

function buildState(preLabel: string, genre = 'Rock', style = 'smart') {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style, mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.5);
    dispatch(ACTIONS.SET_BPM, 120);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    const state = getState();
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    // Every section carries the SAME progression on purpose. The soloist aims at
    // chord tones, so the harmony a section sits on moves its mean register on
    // its own — with different changes per section that confound is larger than
    // the 1-semitone register-base difference under test here, and it swamped
    // (and inverted) the result during development. Holding harmony fixed makes
    // the section LABEL the only independent variable, which is exactly the
    // claim being measured. It costs realism the assertions don't need.
    const sections = [];
    for (let r = 0; r < FORM_REPEATS; r++) {
        sections.push({ label: 'Verse', value: PROGRESSION, id: `sec-verse-${r}` });
        sections.push({ label: preLabel, value: PROGRESSION, id: `sec-pre-${r}` });
        sections.push({ label: 'Chorus', value: PROGRESSION, id: `sec-chorus-${r}` });
    }
    state.arranger.sections = sections;
    validateProgression(state);
    return state;
}

function seedFor(preLabel: string, seedString: string, genre = 'Rock', style = 'smart') {
    const state = buildState(preLabel, genre, style);
    const seed = generateSessionSeed(state, state.arranger, style, 0.5, seedString);
    // The same call the seeder makes internally, so the spans here are exactly
    // the ones it classified. Above the 64-bar threshold this is a pass-through
    // of the real sections, which is the point — see FORM_REPEATS.
    const unrolled = unrollArrangement(state.arranger, 128);
    expect(unrolled.totalSteps).toBe(unrolled.originalSteps);
    return { seed, unrolled, state };
}

/** Every sounded seed note falling inside any instance of `label`. */
function notesIn(seed, unrolled, label: string) {
    const spans = unrolled.sectionMap.filter((s) => s.label === label);
    return seed.notes.filter(
        (n) => !n.isRest && spans.some((s) => n.step >= s.start && n.step < s.end),
    );
}

function meanMidi(notes) {
    return notes.reduce((sum, n) => sum + n.midi, 0) / notes.length;
}

/**
 * The first sounded note of each instance of `label` — i.e. where the line
 * ENTERS the section.
 *
 * This is the register instrument that actually resolves the thing under test.
 * `registerBase` only seeds `lastMidi`; the contour then walks away from it and
 * is bounded by the profile's floor/ceiling, so across a whole section the mean
 * converges back toward the profile centre and a 1-semitone base difference
 * washes out entirely (measured: pooled means 70.61 vs 70.59 for a base gap of
 * a full semitone). The entry note is still sitting on the base, so it reports
 * the gap the code sets.
 */
function sectionEntryMidis(seed, unrolled, label: string): number[] {
    const entries: number[] = [];
    for (const span of unrolled.sectionMap.filter((s) => s.label === label)) {
        const first = seed.notes
            .filter((n) => !n.isRest && n.step >= span.start && n.step < span.end)
            .sort((a, b) => a.step - b.step)[0];
        if (first) {
            entries.push(first.midi);
        }
    }
    return entries;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const normalizeInterval = (i: number) => ((i % 12) + 12) % 12;

/**
 * Mirrors the seeder's private `isStableCadenceInterval`: does the note sit on a
 * tone of the sounding chord? A statement section is pulled onto one at its
 * section ending; a departure is left alone.
 */
function endsStable(seed, unrolled, _state, label: string): boolean[] {
    // `stepMap` holds one entry per CHORD (with start/end step bounds), NOT one
    // per step — indexing it by step number silently resolves `undefined` for
    // every note past the first few bars, which reads as "no chord here" and
    // quietly drops them from the sample. Use the same binary search the seeder
    // itself uses.
    const stepMap = unrolled.stepMap;
    const verdicts: boolean[] = [];
    for (const span of unrolled.sectionMap.filter((s) => s.label === label)) {
        const inSpan = seed.notes
            .filter((n) => !n.isRest && n.step >= span.start && n.step < span.end)
            .sort((a, b) => a.step - b.step);
        const last = inSpan[inSpan.length - 1];
        if (!last) {
            continue;
        }
        const chord = binarySearchMap(stepMap, Math.max(0, last.step))?.chord;
        if (!chord) {
            continue;
        }
        const intervals = chord.intervals || [0, 4, 7];
        const interval = normalizeInterval(last.midi - chord.rootMidi);
        verdicts.push(intervals.some((ci) => normalizeInterval(ci) === interval));
    }
    return verdicts;
}

const SEEDS = 16;
const seedStrings = Array.from({ length: SEEDS }, (_, i) => `PRECHORUS_${i}`);

describe('#1206 — pre-chorus is its own seeder category', () => {
    // The spelling-parity acceptance, and the strongest available statement of
    // it: both labels must resolve to the SAME category, so with an identical
    // PRNG seed string the two seeds are note-for-note identical. If either
    // spelling took a different classification branch, the register base and/or
    // the motif draw would diverge and this would fail immediately.
    it("'Pre' and 'Pre-Chorus' produce identical seeds", () => {
        for (const s of seedStrings.slice(0, 6)) {
            const bare = seedFor('Pre', s).seed;
            const hyphenated = seedFor('Pre-Chorus', s).seed;
            expect(hyphenated.notes.map((n) => `${n.step}:${n.midi}`)).toEqual(
                bare.notes.map((n) => `${n.step}:${n.midi}`),
            );
        }
    });

    // (d) the register lift. Asserted against the VERSE only, deliberately.
    //
    // A "pre-chorus sits below the chorus" assertion was tried here and removed:
    // it is not true of this engine, and asserting it would have been asserting
    // a wish. `registerBase` is only the section's ENTRY point; the departure
    // contour machinery (contrast density, stationary probability) then lifts
    // the pre-chorus well past it — measured section entries under the default
    // profile are pre-chorus 72.90 vs chorus 70.26, with whole-section means
    // effectively tied at 70.61 / 70.59.
    //
    // A register-base clamp holding the pre-chorus under the chorus was written
    // and then removed for the same reason: it moves the base by up to 2
    // semitones in the 10 profiles where `seedDepartureLift > seedChorusLift - 1`,
    // but that difference is not observable in the emitted notes by ANY metric
    // tried (section entry, section mean) — so every test written for it passed
    // with the clamp reverted. See #1222; correcting the
    // pre-chorus/chorus register relationship needs a lever with audible effect
    // and an ear, not a base tweak the contour washes out.
    it.each(['Pre', 'Pre-Chorus'])("lifts '%s' above the verse", (label) => {
        // Pooled across every seed rather than a per-seed win-rate. The register
        // BASE difference the fix controls is only 1-4 semitones, while contour
        // and flair swing individual notes much further, so "did this seed's
        // pre-chorus mean beat this seed's verse mean" is close to a coin flip
        // even when the base is definitely applied. Pooling ~16 seeds' worth of
        // notes measures the base, which is the thing under test.
        const pool = { Verse: [], pre: [], Chorus: [] };
        const entry = { Verse: [], pre: [], Chorus: [] };
        for (const s of seedStrings) {
            const { seed, unrolled } = seedFor(label, s);
            pool.Verse.push(...notesIn(seed, unrolled, 'Verse'));
            pool.pre.push(...notesIn(seed, unrolled, label));
            pool.Chorus.push(...notesIn(seed, unrolled, 'Chorus'));
            entry.Verse.push(...sectionEntryMidis(seed, unrolled, 'Verse'));
            entry.pre.push(...sectionEntryMidis(seed, unrolled, label));
            entry.Chorus.push(...sectionEntryMidis(seed, unrolled, 'Chorus'));
        }
        // Sanity: the sweep must actually be reaching all three sections, or the
        // ordering below is vacuous. A 'Pre' span that the unroller discarded
        // would show up here as an empty pool, not as a false pass.
        expect(pool.Verse.length).toBeGreaterThan(100);
        expect(pool.pre.length).toBeGreaterThan(100);
        expect(pool.Chorus.length).toBeGreaterThan(100);
        expect(entry.pre.length).toBe(SEEDS * FORM_REPEATS);

        const verseMean = mean(entry.Verse);
        const preMean = mean(entry.pre);
        const chorusMean = mean(entry.Chorus);
        console.log(
            `[#1206 Critique Report] section-entry register ('${label}') — ` +
                `verse ${verseMean.toFixed(2)}, pre-chorus ${preMean.toFixed(2)}, ` +
                `chorus ${chorusMean.toFixed(2)}  |  whole-section means: ` +
                `${meanMidi(pool.Verse).toFixed(2)} / ${meanMidi(pool.pre).toFixed(2)} / ` +
                `${meanMidi(pool.Chorus).toFixed(2)}`,
        );

        // The departure lift is applied at all. This was flatly absent for the
        // bare 'Pre' spelling, which took the statement path: with the fix
        // reverted the pre-chorus and verse entries are the SAME register.
        // A full semitone of headroom below the measured ~5.4 gap.
        expect(preMean - verseMean).toBeGreaterThan(1);
        // Logged, not asserted — see the note above this test.
        expect(chorusMean).toBeGreaterThan(0);
    });

    // (b) the pre-chorus does not share the chorus's `sectionMotifs` entry.
    //
    // Asserted on RHYTHM, which is what a shared motif entry would make
    // identical: a motif is a 2-measure rhythmic/melodic template stored per
    // category, so when 'Pre-Chorus' was filed as a chorus the two sections were
    // realizing the same template — the soloist played the chorus line during
    // the pre-chorus and then again in the chorus. The fixture gives both
    // sections the same chords and the same length precisely so that a rhythmic
    // difference cannot come from anywhere else.
    it('gives the pre-chorus its own motif rather than the chorus template', () => {
        let distinct = 0;
        for (const s of seedStrings) {
            const { seed, unrolled } = seedFor('Pre-Chorus', s);
            const rhythmOf = (label: string) => {
                const span = unrolled.sectionMap.find((x) => x.label === label);
                return seed.notes
                    .filter((n) => !n.isRest && n.step >= span.start && n.step < span.end)
                    .map((n) => n.step - span.start)
                    .sort((a, b) => a - b)
                    .join(',');
            };
            if (rhythmOf('Pre-Chorus') !== rhythmOf('Chorus')) {
                distinct++;
            }
        }
        console.log(
            `[#1206 Critique Report] pre-chorus rhythm distinct from chorus in ` +
                `${distinct}/${SEEDS} seeds`,
        );
        // Every seed, not a majority: these are two different motif entries now,
        // so an exact rhythmic collision would take a real coincidence.
        expect(distinct).toBe(SEEDS);
    });

    // (c) the suspended ending. A statement section is pulled onto a stable
    // chord tone at its section ending (`shouldTightenStatementEnding`); a
    // departure is exempt. Asserted RELATIVE to the verse in the same seeds
    // rather than against an absolute rate — a pre-chorus will still land on a
    // chord tone sometimes by ordinary contour, and an absolute floor would
    // just be pinning today's number.
    it('leaves the pre-chorus ending unresolved more often than the verse ending', () => {
        let preStable = 0;
        let preTotal = 0;
        let verseStable = 0;
        let verseTotal = 0;
        for (const s of seedStrings) {
            const { seed, unrolled, state } = seedFor('Pre', s);
            for (const v of endsStable(seed, unrolled, state, 'Pre')) {
                preTotal++;
                if (v) {
                    preStable++;
                }
            }
            for (const v of endsStable(seed, unrolled, state, 'Verse')) {
                verseTotal++;
                if (v) {
                    verseStable++;
                }
            }
        }
        expect(preTotal).toBeGreaterThan(0);
        expect(verseTotal).toBeGreaterThan(0);
        const preRate = preStable / preTotal;
        const verseRate = verseStable / verseTotal;
        console.log(
            `[#1206 Critique Report] section-ending stable-tone rate — ` +
                `verse ${(verseRate * 100).toFixed(1)}% (n=${verseTotal}), ` +
                `pre-chorus ${(preRate * 100).toFixed(1)}% (n=${preTotal})`,
        );
        expect(preRate).toBeLessThan(verseRate);
    });
});
