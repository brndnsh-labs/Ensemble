// @ts-nocheck
// Jazz soloist idiom critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863). Real dispatch-built state, a real seed, an absolute advancing
// step with currentLoopCount per loop (mirrors scheduler-core), scanned across a
// full macro-form over 'Autumn Leaves' — a major-key jazz standard built from
// ii-V-I cells (all but the III7+ secondary dominant are diatonic to C major),
// the natural home of the smooth bebop/standards line.
//
// What this guards: the jazz lead stays in key (C-major diatonic) and keeps a
// smooth, singable contour. DROPPED from the legacy version:
//   - the bebopScale / generateMelodicDevice / pickByRank device-subsystem tests
//     — those bebop enclosures and the device picker are produced ONLY by the
//     retired legacy engine; phrase-first emits NO `.device` field. (dark;
//     re-added by #869/#870)
//   - the head-bypass / themed-improv JITTER scale-clamp test — that codepath and
//     its legacy seed shape (soloistState.session.seed.notes + jitterRange/
//     jitterProb) are legacy-engine machinery phrase-first does not have.
//   - the relative-to-chord "chromatism ratio" claim — see the drop note below.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resolveSoloistStyle } from '../../public/engine/soloist-config.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function buildState(presetName: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Jazz' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.7);
    dispatch(ACTIONS.SET_BPM, 140);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(presetName = 'Autumn Leaves') {
    const state = buildState(presetName);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.7, 'JAZZ_CRITIQUE');
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
    const scanned = loopLen * 3 + 64;
    for (let abs = 0; abs < scanned; abs++) {
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
                notes.push({ midi: n.midi, chordRoot: chord.rootMidi, abs });
            }
        }
    }
    return { notes, scanned };
}

describe('Soloist Jazz Critique (phrase-first)', () => {
    it('keeps the jazz lead in key with a smooth, singable contour', () => {
        const { notes } = simulate('Autumn Leaves');
        // Non-silence sanity (live phrase-first delivers 1453 over this macro-form).
        expect(notes.length).toBeGreaterThan(200);

        // C-major diatonic = {0,2,4,5,7,9,11} as ABSOLUTE pitch classes — NOT the
        // engine's per-chord scale lookup, so the adherence claim is not a
        // tautology. Autumn Leaves is a C-major standard; only the III7+ secondary
        // dominant (E7+ → G#) pulls a chromatic tone, so the engine CAN leave C
        // major and 100% is not forced.
        const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
        let diatonic = 0;
        let sumInt = 0;
        let nInt = 0;
        for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            const pc = ((n.midi % 12) + 12) % 12;
            if (C_MAJOR.has(pc)) {
                diatonic++;
            }
            // Melodic step size within a phrase (consecutive attacks ≤4 steps apart).
            if (i > 0 && n.abs - notes[i - 1].abs <= 4) {
                nInt++;
                sumInt += Math.abs(n.midi - notes[i - 1].midi);
            }
        }
        const diatonicShare = diatonic / notes.length;
        const avgInterval = sumInt / (nInt || 1);

        // In-key adherence: baseline 7/12 = 58.3% chromatic. Live phrase-first
        // delivers 95.9% over this macro-form; >0.90 sits ~32pp above baseline with
        // ~6pp live headroom, guarding against a regression that lets the line drift
        // out of key. (Deterministic — seeded scrambleHash; stable across runs.)
        expect(diatonicShare).toBeGreaterThan(0.9);

        // Melodic smoothness: a singable bebop/standards line moves mostly by step
        // and small skips. A uniform-random pitch over the soloist register
        // (~60–90) would average ~10 semitones per move; live phrase-first measures
        // 2.42. <4.0 sits well below the random-walk baseline with ~1.6 headroom,
        // catching a regression toward an angular/leaping contour.
        expect(avgInterval).toBeLessThan(4.0);

        // DROPPED (rule 4): the legacy "chromatism ratio > 0.25" claim. Measured
        // relative-to-chord-root against Ionian, live phrase-first reads 43.1% —
        // essentially the 5/12 = 41.7% uniform baseline, so it guards nothing. It is
        // also mis-measured: ii-V-I m7/dom7 chords want Dorian/Mixolydian, whose b3/
        // b7 chord-SCALE tones the Ionian template falsely flags as "chromatic". The
        // honest signal is the absolute in-key adherence above. Phrase-first is
        // theme-based and stays on the chord scale rather than reaching for bebop
        // approach-note chromaticism; restoring that bebop density is a candidate for
        // the idiom ports tracked in #870.
        //
        // DROPPED (rule 4): the legacy "note density > 6.0/bar" claim. Phrase-first
        // is sparser (3.75 attacks/bar) — it rests between thematic statements rather
        // than running continuous bebop eighths, so the legacy >6.0 floor is a false
        // claim on this engine (tracked for the #870 idiom ports).
    });

    it('resolves the Jazz genre (smart mode) to the bird profile (J-F3 resolution guard)', () => {
        expect(resolveSoloistStyle('smart', 'Jazz')).toBe('bird');
        expect(resolveSoloistStyle(undefined, 'Jazz')).toBe('bird');
        expect(resolveSoloistStyle('jazz', 'Jazz')).toBe('jazz');
    });
});
