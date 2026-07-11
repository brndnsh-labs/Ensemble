// @ts-nocheck
// cspell:words assertable
// #1058 — motif inheritance across role sections on UNROLLED macro-forms.
//
// `unrollArrangement` merges adjacent same-role iterations, so on a single-section
// looped chart every role category occurs once and the seeder used to compose a FRESH
// motif per role — the head the listener learned in the Intro was replaced wholesale a
// few loops in (the #1056 weak-ballad-hook root cause). The seeder now inherits the
// head motif into theme-roles (Verse: 1 dev-op, Solo: 2, Outro: verbatim) with measure 0
// — the #1056 hook cell — held VERBATIM, while Chorus stays freshly composed (the
// contrast/departure B section).
//
// What is assertable on the seed: the hook cell. Hook notes are exempt from the
// stochastic flair pass, and same-index blocks of different sections sit at the SAME
// position in the cloned 4-bar loop (same downbeat chord), so an inherited measure-0
// degree shape must realize to the same relative rhythm and the same within-cell
// interval shape (octave offset may differ with the section's register base). Assertions
// are statistical across seeds because a dev-op on the tail can occasionally move the
// Q&A question cadence between measure 0 and measure 1, which reshapes the hook set for
// that block (a designed interaction, not a bug).
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../../public/data/chord-presets.js';
import { unrollArrangement } from '../../../public/engine/arranger-utils.js';
import { validateProgression } from '../../../public/engine/chords-engine.js';
import { generateSessionSeed } from '../../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

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

const STEPS_PER_MEASURE = 16; // 4/4 at 4 steps per beat (both presets used here)
const PHRASE_STEPS = 4 * STEPS_PER_MEASURE; // the seeder's 4-measure motif block

// The hook-cell "shape" at a given motif block: relative steps within the block's
// measure 0 plus the within-cell interval sequence. Octave-insensitive by construction
// (intervals only), so a section register drop/lift does not change the shape.
function hookShapeAt(seed, blockStartStep) {
    const cell = seed.notes
        .filter(
            (n) =>
                n.hookRole &&
                n.step >= blockStartStep &&
                n.step < blockStartStep + STEPS_PER_MEASURE,
        )
        .sort((a, b) => a.step - b.step);
    if (cell.length === 0) {
        return null;
    }
    const steps = cell.map((n) => n.step - blockStartStep).join(',');
    const intervals = cell
        .slice(1)
        .map((n, i) => n.midi - cell[i].midi)
        .join(',');
    return `[${steps}]@(${intervals})`;
}

// Start step of block `blockIndex` (0-based) inside the section labelled `label`.
function blockStart(unrolled, label, blockIndex) {
    const section = unrolled.sectionMap.find((s) => s.label === label);
    if (!section) {
        return null;
    }
    return section.start + blockIndex * PHRASE_STEPS;
}

const SEEDS = 12;

function sweep(presetName, genre, bpm) {
    const results = [];
    for (let i = 0; i < SEEDS; i++) {
        const state = buildState(presetName, genre, bpm);
        const seed = generateSessionSeed(state, state.arranger, 'smart', 0.5, `INHERIT_${i}`);
        const unrolled = unrollArrangement(state.arranger, 128);
        // Interior blocks (index 1) avoid section-start pickups and the >=8-measure
        // sectional turnaround (always the LAST block); the Outro is a single 4-bar
        // block, safe because pickups are never hook-tagged and it is too short for a
        // turnaround.
        results.push({
            intro: hookShapeAt(seed, blockStart(unrolled, 'Intro', 1)),
            verse: hookShapeAt(seed, blockStart(unrolled, 'Verse', 1)),
            solo: hookShapeAt(seed, blockStart(unrolled, 'Solo', 1)),
            chorus: hookShapeAt(seed, blockStart(unrolled, 'Chorus', 1)),
            outro: hookShapeAt(seed, blockStart(unrolled, 'Outro', 0)),
        });
    }
    return results;
}

function matchRate(results, role) {
    let comparable = 0;
    let matches = 0;
    for (const r of results) {
        if (r.intro && r[role]) {
            comparable++;
            if (r.intro === r[role]) {
                matches++;
            }
        }
    }
    return { comparable, rate: comparable > 0 ? matches / comparable : 0 };
}

describe('Soloist motif inheritance across role sections (#1058)', () => {
    const results = sweep('Pop (Ballad)', 'Rock', 72);

    it('theme-roles inherit the head: the hook cell recurs across Intro → Verse/Solo/Outro', () => {
        const verse = matchRate(results, 'verse');
        const solo = matchRate(results, 'solo');
        const outro = matchRate(results, 'outro');
        console.log(
            `\n[Critique Report — motif inheritance] hook-shape match vs Intro: ` +
                `verse ${(100 * verse.rate).toFixed(0)}% (${verse.comparable}) | ` +
                `solo ${(100 * solo.rate).toFixed(0)}% (${solo.comparable}) | ` +
                `outro ${(100 * outro.rate).toFixed(0)}% (${outro.comparable})`,
        );
        // Every seed must yield comparable cells (hook present in both blocks) for the
        // theme-roles — liveness of the inheritance plumbing itself.
        expect(verse.comparable).toBeGreaterThanOrEqual(SEEDS - 2);
        expect(solo.comparable).toBeGreaterThanOrEqual(SEEDS - 2);
        expect(outro.comparable).toBeGreaterThanOrEqual(SEEDS - 2);
        // The inherited measure-0 cell realizes to the same shape at the same loop
        // position. Not 100%: a tail dev-op can move the Q&A cadence across the
        // measure-0/1 boundary and reshape the hook set for that block (designed
        // interaction). Calibrated empirically; a regression to fresh-composition
        // collapses these toward ~0%.
        expect(verse.rate).toBeGreaterThan(0.7);
        expect(solo.rate).toBeGreaterThan(0.7);
        expect(outro.rate).toBeGreaterThan(0.7);
    });

    it('the Chorus stays freshly composed (the contrast B section)', () => {
        const chorus = matchRate(results, 'chorus');
        console.log(
            `[Critique Report — motif inheritance] chorus hook-shape match vs Intro: ` +
                `${(100 * chorus.rate).toFixed(0)}% (${chorus.comparable})`,
        );
        // A fresh motif's measure 0 should almost never coincide with the head's.
        expect(chorus.rate).toBeLessThan(0.3);
    });

    it('jazz collapses verse+solo to one category and still holds the hook through the Solo', () => {
        // Jazz styles file verse AND solo under the single 'jazz' category, so the
        // Solo takes the `iteration > 0` restatement path rather than the inheritance
        // branch — which, on unrolled forms, must carry the SAME measure-0 guard
        // (review P2 on #1058: without it the legacy whole-motif op could mutate the
        // hook cell and break the head-in / blow / head-out through-line).
        const jazz = sweep('Pop (Ballad)', 'Jazz', 120);
        const verse = matchRate(jazz, 'verse');
        const solo = matchRate(jazz, 'solo');
        const outro = matchRate(jazz, 'outro');
        console.log(
            `[Critique Report — motif inheritance/jazz] hook-shape match vs Intro: ` +
                `verse ${(100 * verse.rate).toFixed(0)}% (${verse.comparable}) | ` +
                `solo ${(100 * solo.rate).toFixed(0)}% (${solo.comparable}) | ` +
                `outro ${(100 * outro.rate).toFixed(0)}% (${outro.comparable})`,
        );
        expect(verse.comparable).toBeGreaterThanOrEqual(SEEDS - 2);
        expect(solo.comparable).toBeGreaterThanOrEqual(SEEDS - 2);
        expect(verse.rate).toBeGreaterThan(0.7);
        expect(solo.rate).toBeGreaterThan(0.7);
        expect(outro.rate).toBeGreaterThan(0.7);
    });
});
