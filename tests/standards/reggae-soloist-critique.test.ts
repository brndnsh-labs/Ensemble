// @ts-nocheck
// Reggae soloist idiom critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863). Real dispatch-built state, a real seed, an absolute advancing
// step with currentLoopCount per loop (mirrors scheduler-core), scanned across a
// full macro-form over a minor (Andalusian i-bVII-bVI-V, 'skank') progression —
// the natural home of the one-drop reggae lead.
//
// What this guards: the reggae lead stays SPARSE and firmly on the minor-key
// palette. The legacy OFFBEAT-FLOAT / DOWNBEAT-NOT-LOCKED rhythm claims were
// DROPPED — they were the retired engine's #570 attackProb offbeat pump.
// Phrase-first does its own phrase-driven rhythm placement and lands
// downbeat-oriented here (probe: 67.8% on beats 1/2/3/4 vs 31.7% on the 8th
// offbeats), so the "floats on the offbeats" idiom is FALSE for this engine —
// asserting it would be a vacuous/false guard. Reinstating an offbeat-weighted
// reggae feel is a candidate for the idiom ports tracked in #870. Device
// gestures (bend "cry", guitarDouble) are produced only by the retired engine
// and are tracked for porting in #869/#870. Double-stop rate is guarded by
// phrase-first-double-stop-critique.
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
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Reggae' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'guitar' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.6);
    dispatch(ACTIONS.SET_BPM, 76);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = true;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(presetName = 'Andalusian') {
    const state = buildState(presetName);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.6, 'REGGAE_CRITIQUE');
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
    let totalChordSteps = 0;
    let emittedSteps = 0;
    for (let abs = 0; abs < loopLen * 3 + 64; abs++) {
        state.playback.currentLoopCount = Math.floor(abs / total);
        const chord = chordAt(abs);
        if (chord) {
            totalChordSteps++;
        }
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
        emittedSteps++;
        for (const n of Array.isArray(res) ? res : [res]) {
            if (typeof n.midi === 'number') {
                notes.push({ midi: n.midi, chordRoot: chord.rootMidi });
            }
        }
    }
    return { notes, totalChordSteps, emittedSteps };
}

describe('Soloist Reggae Critique (phrase-first)', () => {
    it('floats a sparse lead firmly on the minor-key palette', () => {
        const { notes, totalChordSteps, emittedSteps } = simulate('Andalusian');
        expect(notes.length).toBeGreaterThan(200);

        // SPARSE — the reggae lead leaves the pocket open for the one-drop bass +
        // skank. restRatio = fraction of grid steps with no note emitted.
        const restRatio = 1 - emittedSteps / totalChordSteps;

        // Palette relative to the KEY tonic (key = C → pitch-class 0). Hard-coded
        // target sets (NOT the engine's own scale lookup), so adherence is not a
        // tautology. Natural-minor {0,2,3,5,7,8,10}; minor-pentatonic core
        // {0,3,5,7,10}.
        const NAT_MINOR = new Set([0, 2, 3, 5, 7, 8, 10]);
        const MIN_PENT = new Set([0, 3, 5, 7, 10]);
        let natMinor = 0;
        let minPent = 0;
        for (const n of notes) {
            const rel = ((n.midi % 12) + 12) % 12;
            if (NAT_MINOR.has(rel)) {
                natMinor++;
            }
            if (MIN_PENT.has(rel)) {
                minPent++;
            }
        }
        const natMinorShare = natMinor / notes.length;
        const minPentShare = minPent / notes.length;

        // REGISTER sanity.
        const midis = notes.map((n) => n.midi);
        const minMidi = Math.min(...midis);
        const maxMidi = Math.max(...midis);

        // Fully seeded generation (scrambleHash over step/section/loop) → every
        // metric below is deterministic across runs. Thresholds carry fixed
        // headroom, not a flake band.

        // (1) SPARSE — a busy 16th-note line rests ~0%. Live phrase-first delivers
        // 78.5% rest over this macro-form; >0.70 guards against the lead filling
        // the pocket (8.5pp headroom).
        expect(restRatio).toBeGreaterThan(0.7);

        // (2) MINOR-KEY PALETTE — the discriminating claim. Uniform-over-chromatic
        // baseline for natural minor is 7/12 = 58.3%. Live phrase-first delivers
        // 96.3%, ~38pp above baseline; >0.90 asserts the line stays firmly in the
        // minor key (~6pp headroom).
        expect(natMinorShare).toBeGreaterThan(0.9);

        // (3) MINOR-PENTATONIC CORE — baseline 5/12 = 41.7%. Live = 68.3%, ~27pp
        // above baseline; >0.60 asserts a real pentatonic-core bias (~8pp headroom),
        // not a uniform spread across the scale.
        expect(minPentShare).toBeGreaterThan(0.6);

        // (4) REGISTER inside a sane lead band. Live min/max = 50/87. The soloist
        // slot ceiling is 90 (tick-logic enforceRegisterSlotting); >=44 / <=90
        // guards the raw engine output from blowing out of a melodic register.
        // (The slot floor of 52 is applied downstream by enforceRegisterSlotting,
        // not by this engine, so the raw floor sits a couple semitones lower.)
        expect(minMidi).toBeGreaterThanOrEqual(44);
        expect(maxMidi).toBeLessThanOrEqual(90);
    });

    // why: dead-key regression guard — the #570 bug was that Reggae in smart mode
    // resolved to 'minimal', leaving the tailored 'reggae' profile fully orphaned.
    // This pins the activated routing so it can't silently regress. Does not touch
    // the engine — kept verbatim. (The full cross-genre table lives in
    // soloist-routing-guard.test.ts.)
    it('resolves Reggae genre/style to the activated reggae profile (#570)', () => {
        expect(resolveSoloistStyle('smart', 'Reggae')).toBe('reggae');
        expect(resolveSoloistStyle(undefined, 'Reggae')).toBe('reggae');
        expect(resolveSoloistStyle('reggae', 'Reggae')).toBe('reggae');
        // #628: the `minimal` phantom profile is retired; an explicit 'minimal'
        // style now gracefully degrades to the genre's own 'reggae' profile.
        expect(resolveSoloistStyle('minimal', 'Reggae')).toBe('reggae');
    });
});
