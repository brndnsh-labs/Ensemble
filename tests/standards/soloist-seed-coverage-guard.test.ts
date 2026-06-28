// @ts-nocheck
// Guard for epic #10 (retire the legacy soloist engine), story #861.
//
// Phrase-first's no-seed branch used to delegate to the legacy `getSoloistNote`
// engine ("never silent-by-bug"). #861 replaced that delegation with a native
// REST — safe ONLY if a missing seed truly means "no music to play against".
//
// `generateSessionSeed` returns an empty `notes` array exactly when the chart is
// degenerate (no stepMap / no sectionMap / totalSteps === 0 — soloist-seeder).
// This test proves the safety net we removed was never load-bearing: over a
// normal chart, EVERY canonical genre seeds a non-empty theme, so phrase-first's
// rest path is unreachable in real playback. The negative control confirms the
// rest path triggers only on an empty chart.
//
// If this ever fails (a genre yields an empty seed over a real progression), the
// soloist would go silent in production — promote it to a P0, do NOT loosen the
// threshold.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { GENRE_NAMES } from '../../public/data/smart-genres.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// A normal, multi-section chart (same preset the phrase-first critique uses).
function buildState(genre: string, presetName = 'Pop (Standard)') {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.62);
    dispatch(ACTIONS.SET_BPM, 120);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

describe('soloist seed coverage (phrase-first no-seed rest is unreachable in real play)', () => {
    // Production passes soloist.style='smart'; the seeder resolves it per genre
    // via groove.genreFeel — so this is the production-shaped call.
    it.each(GENRE_NAMES)('genre %s seeds a non-empty theme over a real chart', (genre) => {
        const state = buildState(genre);
        const seed = generateSessionSeed(state, state.arranger, 'smart', 0.62, 'SEED_GUARD');
        expect(Array.isArray(seed?.notes)).toBe(true);
        // A real chart MUST yield a theme — otherwise phrase-first rests (silent).
        expect(seed.notes.length).toBeGreaterThan(0);
    });

    it('covers all 13 canonical genres (canon drift guard)', () => {
        // If the canon grows/shrinks, this number — and the genre matrix — moved;
        // see tests/standards/genre-canon-guard.test.ts.
        expect(GENRE_NAMES.length).toBe(13);
    });

    it('negative control: a chart with no sections yields an empty seed (the only case that rests)', () => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
        dispatch(ACTIONS.SET_KEY, 'C');
        dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Rock' });
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
        const state = getState();
        state.arranger.sections = [];
        state.arranger.stepMap = [];
        state.arranger.totalSteps = 0;
        const seed = generateSessionSeed(state, state.arranger, 'smart', 0.62, 'SEED_GUARD');
        expect(seed.notes.length).toBe(0);
    });
});
