// @ts-nocheck
// Jazz soloist idiom critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863). Real dispatch-built state, a real seed, an absolute advancing
// step with currentLoopCount per loop (mirrors scheduler-core), scanned across a
// full macro-form over a diatonic ii-V-I jazz standard (Autumn Leaves) — the
// natural home of the bebop/diatonic-extension palette.
//
// What this guards: the jazz lead stays inside the parent diatonic palette of a
// single-key ii-V-I tune (the bebop "stay in the key, color with extensions"
// idiom). DROPPED from the legacy file:
//   - call/response role inspection (soloist.session.currentPhrase.context.role)
//     and the bird/evans/coltrane/miles PROFILE-ROTATION pool — those are legacy-
//     engine session internals; phrase-first has no per-section profile re-roll.
//   - all .device assertions (bebopScale, enclosures) — phrase-first notes carry
//     NO .device field; those gestures are produced only by the retired engine and
//     are tracked for porting in #869/#870 (dark; re-added by #869/#870).
//   - the Bill-Evans extension/cadence + EVANS_INTERVALS_BY_QUALITY per-quality
//     tests — they pinned soloist.session.currentPhrase.context.profile='evans',
//     a legacy-only knob phrase-first ignores, so the measurements were dark.
// The surviving live signal is the genre PALETTE claim, re-derived below.
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
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.85);
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
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.85, 'JAZZ_CRITIQUE');
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
    for (let abs = 0; abs < loopLen * 3 + 64; abs++) {
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
                notes.push({ midi: n.midi, chordRoot: chord.rootMidi });
            }
        }
    }
    return notes;
}

describe('Jazz Soloist Critique (phrase-first)', () => {
    it('keeps the jazz lead inside the parent diatonic palette over a ii-V-I standard', () => {
        const notes = simulate('Autumn Leaves');
        expect(notes.length).toBeGreaterThan(50);

        // Key of C major. Autumn Leaves is a textbook single-parent-key ii-V-I tune
        // (every chord is diatonic to the major scale bar the III7+ leading-tone
        // color), so a bebop line should sit overwhelmingly inside the C-major
        // scale {0,2,4,5,7,9,11} with only modest chromatic approach. Hard-coded
        // target set (NOT the engine's own scale lookup) → not a tautology.
        const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
        // Chord-relative upper extensions: 9th(2), 11th(5), 13th/6th(9) above the
        // sounding chord root — the "color tone reach" that defines the jazz idiom.
        const EXTENSIONS = new Set([2, 5, 9]);

        let inKey = 0;
        let extensions = 0;
        for (const n of notes) {
            if (C_MAJOR.has(n.midi % 12)) {
                inKey++;
            }
            const rel = (n.midi - n.chordRoot + 120) % 12;
            if (EXTENSIONS.has(rel)) {
                extensions++;
            }
        }
        const inKeyShare = inKey / notes.length;
        const extensionShare = extensions / notes.length;

        // baselines: C_MAJOR = 7/12 = 0.583 chromatic; EXTENSIONS = 3/12 = 0.25.
        console.log('\n--- JAZZ SOLOIST CRITIQUE (phrase-first) ---');
        console.log(`notes=${notes.length}`);
        console.log(`[In-key (C major) share] ${(inKeyShare * 100).toFixed(1)}% (baseline 58.3%)`);
        console.log(
            `[Extension reach share]  ${(extensionShare * 100).toFixed(1)}% (baseline 25%)`,
        );
        console.log('--------------------------------------------\n');

        // Palette adherence: the jazz lead stays inside the parent C-major scale,
        // spilling chromatic only modestly. Live phrase-first delivers 95.7% over the
        // Autumn Leaves macro-form; >0.90 sits ~37pp above the 58.3% diatonic
        // baseline with ~5.7pp headroom, guarding against a regression that lets the
        // line wander out of key. (Deterministic — seeded scrambleHash; stable across runs.)
        expect(inKeyShare).toBeGreaterThan(0.9);

        // DROPPED — the legacy file asserted an upper-EXTENSION bias (the Bill-Evans
        // "target 9ths/11ths/13ths" claim). Phrase-first does NOT bias toward
        // chord-relative extensions: it is theme-based and draws on the full chord
        // scale, so the extension reach (20.2%) sits BELOW the uniform-over-chromatic
        // baseline (3/12 = 25%). Asserting any extension floor would be vacuous (at or
        // below baseline) or outright false on this engine, so it is intentionally
        // logged-only. Restoring the extension-reach feel is a candidate for the idiom
        // ports tracked in #870.
        void extensionShare;
    });

    // Style-resolution guard — does not touch the engine, kept verbatim in spirit
    // from the legacy profile-pool test (#573). Jazz routes to the `bird` profile
    // (SMART_GENRES.Jazz.soloist), which STYLE_CONFIG exposes directly.
    it('resolves Jazz genre/style to the canonical bird soloist profile', () => {
        expect(resolveSoloistStyle('smart', 'Jazz')).toBe('bird');
        expect(resolveSoloistStyle(undefined, 'Jazz')).toBe('bird');
        expect(resolveSoloistStyle('bird', 'Jazz')).toBe('bird');
        expect(resolveSoloistStyle('coltrane', 'Jazz')).toBe('bird');
    });
});
