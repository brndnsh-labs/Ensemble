// @ts-nocheck
// Ending-cadence tonic critique (#830) — PRODUCTION-FAITHFUL on the live resolution
// engine (generateResolutionNotes). Drives the REAL path: dispatch-built state →
// load a chord preset → validateProgression (so the engine reads the same parsed
// `arranger.progression` — absolute rootMidi + canonical quality — it will read in
// production) → generateResolutionNotes → assert WHERE the band lands.
//
// WHAT THIS LOCKS: a song ends by resolving to the tune's TRUE tonal center, inferred
// from the progression's cadence (inferResolutionTonic in resolution.ts), NOT the
// notated key's degree-0. The classic failure this fixes is the relative-minor chart:
// Autumn Leaves is notated in the relative MAJOR (isMinor:false) but its `viiø7 |
// III7+ | vi7` tail is a ii°–V–i in the relative MINOR, so it must land on vi/minor —
// the old engine forced a bright major I ("ends awkwardly"). Contrast: 12-bar blues
// ends on a V7 turnaround yet must still resolve home to I.
//
// The landing pitch-class + mode are DETERMINISTIC — the only Math.random in
// generateResolutionNotes is a timing stagger, never a pitch — so these are pinned
// with HARD EQUALITY against HAND-DERIVED expected values (not by re-running the
// engine's own inference, which would be a tautology). This is the rare case where a
// rigid assertion is correct: it asserts a music-theory invariant, not a distribution.
//
// Two witnesses per preset. Each is asserted against the hand-derived expected PC —
// so the soloist witness independently guards the soloist threading (a regression to
// the notated key would make soloPC≠expectedPC). (They share the resolved keyIndex
// internally, so their agreement alone isn't an independent cross-check — the guard
// is each one matching the hand-derived target.):
//   • bass landing PC  — the final cadence step's bass root (module:'bass', last time).
//   • soloist landing PC — the held+vibrato'd final note (module:'soloist', vibrato set).
// Mode is read from the soloist's 3-2-1 pickup interval on ritardando genres:
// pickup[0] = landing + (isMinor ? ♭3 : 3) — 3 semitones ⇒ minor, 4 ⇒ major.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { generateResolutionNotes } from '../../public/engine/resolution.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// Resolve one preset's ending. `genreFeel` picks the cadence PROFILE (ritardando
// genres emit the soloist pickups that witness mode); it does NOT affect tonic
// inference, which is genre-independent.
function resolveLanding(presetName: string, key: string, isMinor: boolean, genreFeel: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, key);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    if (!preset) {
        throw new Error(`preset not found: ${presetName}`);
    }
    state.arranger.key = key;
    state.arranger.isMinor = isMinor;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);

    const notes = generateResolutionNotes(
        state,
        0,
        state.arranger,
        { chords: true, bass: true, soloist: true, groove: false, harmony: false },
        120,
        { genreFeel },
        { octave: 72 },
    );

    const bass = notes.filter((n: any) => n.module === 'bass' && typeof n.midi === 'number');
    const solo = notes.filter((n: any) => n.module === 'soloist' && typeof n.midi === 'number');
    // Bass landing = the final cadence step (max timingOffset).
    const bassLanding = bass.reduce((a: any, b: any) => (b.timingOffset > a.timingOffset ? b : a));
    // Soloist landing = the unique held note carrying vibrato (pickups are dur-2, non-
    // last steps carry vibrato:null); pickups = the dur-2 lead-in notes, earliest first.
    const soloLanding = solo.find((n: any) => n.vibrato);
    const pickups = solo
        .filter((n: any) => n.durationSteps === 2)
        .sort((a: any, b: any) => a.timingOffset - b.timingOffset);
    const pickupInterval = pickups.length ? pickups[0].midi - soloLanding.midi : null;

    return {
        bassPC: ((bassLanding.midi % 12) + 12) % 12,
        soloPC: ((soloLanding.midi % 12) + 12) % 12,
        pickupInterval, // 3 ⇒ minor, 4 ⇒ major, null ⇒ button genre (no pickups)
    };
}

// [preset, key, isMinor, genreFeel, expectedPC, expectedMode] — hand-derived; see the
// header table in the #830 plan. expectedMode: 'minor' | 'major' | null (no pickups).
const CASES: Array<[string, string, boolean, string, number, string | null]> = [
    // THE regression: relative-minor chart lands on vi/minor, not the relative-major I.
    ['Autumn Leaves', 'C', false, 'Jazz', 9, 'minor'], // → A minor (vi)
    // V7 turnaround still resolves home to I (the reported-correct contrast).
    ['12-Bar Blues', 'C', false, 'Blues', 0, 'major'], // → C major (I)
    // Tonic-ROOTED dom7 lands on its own root, NOT a fifth below (the All-Blues trap).
    ['All Blues', 'G', false, 'Blues', 7, 'major'], // → G major (I), not C
    // Guard 1: a plain I a P5 above IV must NOT read as a cadence → plagal IV keeps I.
    ['Plagal Flow', 'C', false, 'Acoustic', 0, 'major'], // → C, not F
    ['Pop (Standard)', 'C', false, 'Acoustic', 0, 'major'], // → C, not F (deceptive vi→IV loop)
    // Borrowed iv ending doesn't hijack the tonic.
    ['Alternative Loop', 'C', false, 'Acoustic', 0, 'major'], // → C, not F(iv)
    // Mode preserved: a minor tune stays minor (guard (a) tonic + fallback).
    ['Metal Core', 'C', true, 'Acoustic', 0, 'minor'], // → C minor (i)
    ['Andalusian', 'C', true, 'Acoustic', 0, 'minor'], // → C minor (i), Phrygian half-cadence
];

describe('Ending-cadence tonic critique (#830)', () => {
    it.each(CASES)(
        '%s (key %s) lands on the true tonal center',
        (name, key, isMin, genre, expectedPC, expectedMode) => {
            const r = resolveLanding(name, key, isMin, genre);
            // Bass and soloist must land on the SAME hand-derived tonic PC — the resolved
            // target threads through both voices (not just chords/bass).
            expect(r.bassPC, `${name} bass landing PC`).toBe(expectedPC);
            expect(r.soloPC, `${name} soloist landing PC`).toBe(expectedPC);
            // Mode witness via the soloist pickup interval (ritardando genres only).
            if (expectedMode === 'minor') {
                expect(r.pickupInterval, `${name} pickup (♭3 ⇒ minor)`).toBe(3);
            } else if (expectedMode === 'major') {
                expect(r.pickupInterval, `${name} pickup (3 ⇒ major)`).toBe(4);
            }
        },
    );

    // DETERMINISM: the pitch path has no RNG, so a repeat run is byte-identical.
    it('is deterministic across runs (landing PC + mode)', () => {
        const once = CASES.map(([n, k, m, g]) => resolveLanding(n, k, m, g));
        const twice = CASES.map(([n, k, m, g]) => resolveLanding(n, k, m, g));
        expect(twice.map((r) => `${r.bassPC}|${r.soloPC}|${r.pickupInterval}`)).toEqual(
            once.map((r) => `${r.bassPC}|${r.soloPC}|${r.pickupInterval}`),
        );
    });
});
