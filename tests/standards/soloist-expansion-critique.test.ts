// @ts-nocheck
// Soloist expansion critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863). Real dispatch-built state, a real per-genre seed, an absolute
// advancing step with currentLoopCount per loop (mirrors scheduler-core), scanned
// across a full macro-form for every canonical genre.
//
// What this guards: cross-genre melodic SMOOTHNESS (the live phrase-first line
// moves by mostly small steps, not wild leaps) and NOTE DENSITY (the line breathes
// — it isn't a constant 16th stream nor near-silent). Both are LIVE phrase-first
// behaviors. The legacy sweep also listed the phantom routing keys Minimal/Shred
// (not canonical genres — CLAUDE.md) and omitted Jazz/Blues; this version sweeps
// the exact 13-genre canon instead. Density bands are seeded-deterministic.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function buildState(genreFeel: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.8);
    dispatch(ACTIONS.SET_BPM, 120);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === 'Pop (Standard)');
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(genreFeel: string) {
    const state = buildState(genreFeel);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.8, `EXPANSION_${genreFeel}`);
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    const notes: any[] = [];
    const span = loopLen * 3 + 64;
    for (let abs = 0; abs < span; abs++) {
        state.playback.currentLoopCount = Math.floor(abs / total);
        const chord = chordAt(abs);
        const res = getSoloistNotePhraseFirst(
            state,
            chord,
            chordAt(abs + 1),
            abs,
            null,
            state.soloist.octave,
            'smart',
            abs % 16,
            {},
            { isDownbeat: abs % 16 === 0, isMeasureStart: abs % 16 === 0 },
        );
        if (!res || !chord) {
            continue;
        }
        for (const n of Array.isArray(res) ? res : [res]) {
            if (typeof n.midi === 'number') {
                notes.push({ step: abs, midi: n.midi, chordRoot: chord.rootMidi });
            }
        }
    }
    // notes/bar = notes per 16-step bar over the scanned span.
    const bars = span / 16;
    return { notes, bars };
}

// The 13-genre canon (CLAUDE.md). Phantom routing keys Minimal/Shred dropped.
const GENRES = [
    'Rock',
    'Jazz',
    'Funk',
    'Disco',
    'Hip Hop',
    'Blues',
    'Neo-Soul',
    'Reggae',
    'Acoustic',
    'Bossa',
    'Country',
    'Metal',
    'Ska-Punk',
];

describe('Soloist Expansion Critique (phrase-first)', () => {
    it.each(GENRES)('keeps a smooth, breathing line for %s', (genre) => {
        const { notes, bars } = simulate(genre);

        let sumIntervals = 0;
        let totalIntervals = 0;
        for (let i = 1; i < notes.length; i++) {
            // only count consecutive notes that are close in time (a melodic move,
            // not a leap across a long rest)
            if (notes[i].step - notes[i - 1].step <= 4) {
                totalIntervals++;
                sumIntervals += Math.abs(notes[i].midi - notes[i - 1].midi);
            }
        }
        const avgInterval = sumIntervals / (totalIntervals || 1);
        const notesPerBar = notes.length / bars;
        expect(notes.length).toBeGreaterThan(50);

        // NULL BASELINE for smoothness: the SAME bag of emitted pitches in a
        // seeded-random order. A melody that just hits random scale tones reorders to
        // a large mean leap; a coherent stepwise line is far smaller. This is a true
        // null model (not a hard-coded constant), immune to register-size guesses.
        // Measured: the shuffled baseline lands 6.66–8.07 semitones across genres.
        let s = 12345;
        const rng = () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
        const pitches = notes.map((n) => n.midi);
        for (let i = pitches.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [pitches[i], pitches[j]] = [pitches[j], pitches[i]];
        }
        let randomSum = 0;
        for (let i = 1; i < pitches.length; i++) {
            randomSum += Math.abs(pitches[i] - pitches[i - 1]);
        }
        const randomBaseline = randomSum / (pitches.length - 1);

        // SMOOTHNESS: the live line moves by mostly small steps. Observed avg interval
        // 2.19–3.21 semitones; the random-order null is 6.66–8.07. Every genre is
        // <0.44× its null, so requiring <0.6× the null guards real stepwise motion
        // (a regression toward a wide-jumping or atonal line would push the ratio up)
        // with honest headroom and zero register-size assumption. (Deterministic — seeded.)
        expect(avgInterval).toBeLessThan(randomBaseline * 0.6);

        // DENSITY: the line breathes. A fully-saturated 16th-note stream is 16
        // notes/bar; near-silence is <1. Observed 2.93–4.33 across genres → the
        // soloist rests roughly 75% of steps. The band below guards both failure
        // modes with headroom (floor 2.0 vs observed min 2.93; ceiling 8.0 = half of
        // the 16/bar saturation, vs observed max 4.33).
        expect(notesPerBar).toBeGreaterThan(2.0);
        expect(notesPerBar).toBeLessThan(8.0);
    });
});
