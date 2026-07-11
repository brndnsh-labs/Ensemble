// @ts-nocheck
// Acoustic soloist idiom critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863). Real dispatch-built state, a real seed, an absolute advancing
// step with currentLoopCount per loop (mirrors scheduler-core), scanned across a
// full macro-form over an I-IV-vi-V major-key pop/ballad progression — the
// bread-and-butter singer-songwriter acoustic home.
//
// What this guards: the acoustic lead is diatonic singer-songwriter material
// (low chromaticism over major chords), sits in a centered/low register, and
// breathes (sparse, short audible phrases). Device assertions (the legacy
// slide/run allowlist) were DROPPED — phrase-first notes have NO .device field;
// those gestures are produced only by the retired legacy engine and are tracked
// for porting in #869/#870. Double-stop RATE is guarded by
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
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Acoustic' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'guitar' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.6);
    dispatch(ACTIONS.SET_BPM, 92);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(presetName = 'Pop (Standard)', intensity = 0.6) {
    const state = buildState(presetName);
    const seed = generateSessionSeed(
        state,
        state.arranger,
        'smart',
        intensity,
        'ACOUSTIC_CRITIQUE',
    );
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
    const attackSteps: number[] = [];
    let scannedSteps = 0;
    for (let abs = 0; abs < loopLen * 3 + 64; abs++) {
        state.playback.currentLoopCount = Math.floor(abs / total);
        const chord = chordAt(abs);
        if (!chord) {
            continue;
        }
        scannedSteps++;
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
        if (!res) {
            continue;
        }
        let emitted = false;
        for (const n of Array.isArray(res) ? res : [res]) {
            if (typeof n.midi === 'number') {
                emitted = true;
                notes.push({
                    step: abs,
                    midi: n.midi,
                    chordRoot: chord.rootMidi,
                    quality: chord.quality,
                });
            }
        }
        if (emitted) {
            attackSteps.push(abs);
        }
    }
    return { notes, attackSteps, scannedSteps };
}

// Segment attack steps into audible phrases: a silent gap of >= one beat (4
// steps at 4/4 16ths) between successive attacks is a phrase boundary — the
// LISTENER's notion of a phrase, a contiguous run of notes bounded by a breath.
function phraseLengths(steps: number[], gapSteps: number): number[] {
    const lengths: number[] = [];
    let run = 0;
    let prevStep = Number.NEGATIVE_INFINITY;
    for (const s of steps) {
        if (run > 0 && s - prevStep >= gapSteps) {
            lengths.push(run);
            run = 0;
        }
        run++;
        prevStep = s;
    }
    if (run > 0) {
        lengths.push(run);
    }
    return lengths;
}

describe('Soloist Acoustic Critique (phrase-first)', () => {
    it('keeps the acoustic lead diatonic, low/centered, and breathing over a major-key progression', () => {
        const { notes, attackSteps, scannedSteps } = simulate('Pop (Standard)', 0.6);
        expect(notes.length).toBeGreaterThan(50);

        // (1) REST / SPACE RATIO — fraction of scanned steps with NO attack.
        const restRatio = 1 - attackSteps.length / scannedSteps;

        // (2) SHORT, BREATHING PHRASES (one-beat breath = boundary).
        const phrases = phraseLengths(attackSteps, 4);
        const maxPhrase = Math.max(...phrases);
        const avgPhrase = phrases.reduce((a, b) => a + b, 0) / phrases.length;
        const phrasesOver12 = phrases.filter((l) => l > 12).length;

        // (3) LOW CHROMATICISM over major chords. Hard-coded diatonic-major
        // collection (NOT the engine's own scale lookup — that would be a
        // tautology).
        const DIATONIC_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
        let majNotes = 0;
        let chromaticOnMaj = 0;
        for (const n of notes) {
            if (n.quality === 'major') {
                majNotes++;
                const rel = (n.midi - n.chordRoot + 120) % 12;
                if (!DIATONIC_MAJOR.has(rel)) {
                    chromaticOnMaj++;
                }
            }
        }
        const chromaticShare = chromaticOnMaj / majNotes;
        // Uniform-chromatic out-of-scale baseline: 5 of 12 PCs lie outside the
        // diatonic-major collection → 5/12 = 0.4167.
        const CHROMATIC_BASELINE = (12 - DIATONIC_MAJOR.size) / 12;

        // (4) CENTERED / LOW REGISTER.
        const midis = notes.map((n) => n.midi);
        const minMidi = Math.min(...midis);
        const maxMidi = Math.max(...midis);
        const avgMidi = midis.reduce((a, b) => a + b, 0) / midis.length;

        console.log('\n--- ACOUSTIC SOLOIST CRITIQUE (phrase-first) ---');
        console.log(`notes=${notes.length}, majNotes=${majNotes}, scanned=${scannedSteps}`);
        console.log(`[Rest / Space Ratio]   ${(restRatio * 100).toFixed(1)}%`);
        console.log(
            `[Phrase len (1-beat)]  max ${maxPhrase}, avg ${avgPhrase.toFixed(2)}, >12: ${phrasesOver12}`,
        );
        console.log(
            `[Chromatic Share /maj] ${(chromaticShare * 100).toFixed(2)}% (baseline ${(CHROMATIC_BASELINE * 100).toFixed(1)}%)`,
        );
        console.log(`[Register min/avg/max] ${minMidi} / ${avgMidi.toFixed(1)} / ${maxMidi}`);
        console.log('------------------------------------------------\n');

        // Deterministic — seeded scrambleHash; stable across runs. Thresholds
        // carry fixed headroom, not a flake band.

        // (1) HIGH REST RATIO. The acoustic line breathes — live phrase-first
        // delivers 77.9% rest steps over a 3-loop macro-form at intensity 0.6. A
        // busy/dense soloist would run <50% rest, so >0.65 sits ~13pp below the
        // engine's output and well clear of a busy line. This is the "space over
        // flash" claim.
        expect(restRatio).toBeGreaterThan(0.65);

        // (2) SHORT, BREATHING PHRASES. Live audible-phrase max is 9 notes, avg
        // ~1.65. The named claim is "~<=12 notes per phrase"; the engine never
        // produces a phrase longer than 9, so <=12 holds with 3-note headroom and
        // ZERO phrases exceed 12.
        expect(maxPhrase).toBeLessThanOrEqual(12);
        expect(phrasesOver12).toBe(0);

        // (3) LOW CHROMATICISM. Acoustic is diatonic singer-songwriter material;
        // live out-of-scale share over major chords is 6.54%. Uniform-chromatic
        // out-of-scale baseline is 0.4167, so the engine sits ~35pp BELOW random —
        // the opposite direction from baseline, which is the point. <0.10 guards a
        // regression that lets the line wander chromatic (~3.5pp headroom over the
        // live 6.54%), and the explicit < baseline assertion prevents a
        // sub-baseline pass.
        expect(chromaticShare).toBeLessThan(0.1);
        expect(chromaticShare).toBeLessThan(CHROMATIC_BASELINE);

        // (4) CENTERED / LOW REGISTER. Live line runs avg ~69.7 / max 88.
        // This harness drives the raw engine (no tick-logic), so it sees notes
        // BEFORE register slotting; in prod `enforceRegisterSlotting` octave-lifts
        // any soloist note below MIDI 52 into the 60-90 lane. The engine may emit a
        // rare sub-52 outlier at deep development (post-#1058 inherited restatements:
        // observed 1 of ~1300 emissions, at loop 14) — prod clamps it, so the gate
        // here is that such dips stay NEGLIGIBLE (≤0.5%), not absent. A real
        // register regression (the line living in the bass lane) blows well past
        // that. maxMidi <= 90 keeps it under the slot ceiling (never climbing into a
        // screaming-lead register; 2pt headroom over 88). avg < 74 keeps the line
        // centered-LOW (below the 71-midpoint-ish center, ~4pt headroom over 69.7)
        // — the warm acoustic-guitar register, not a bright soaring lead.
        const sub52Rate = midis.filter((m) => m < 52).length / midis.length;
        expect(sub52Rate).toBeLessThanOrEqual(0.005);
        expect(maxMidi).toBeLessThanOrEqual(90);
        expect(avgMidi).toBeLessThan(74);
    });

    // why: style-resolution guard (the reggae dead-profile / Rock->shred class of
    // bug). Pins routing so a future change can't silently make this critique test
    // the wrong thing. Does not touch the engine — kept verbatim (#592/#628).
    it('resolves Acoustic genre/style to the documented soloist profiles', () => {
        // Smart mode + Acoustic feel -> 'acoustic' (the SMART_GENRES routing — the
        // profile a user actually hears for the Acoustic genre, post-#592).
        expect(resolveSoloistStyle('smart', 'Acoustic')).toBe('acoustic');
        expect(resolveSoloistStyle(undefined, 'Acoustic')).toBe('acoustic');
        // An explicit 'acoustic' UI style is honored verbatim.
        expect(resolveSoloistStyle('acoustic', 'Acoustic')).toBe('acoustic');
        expect(resolveSoloistStyle('acoustic', undefined)).toBe('acoustic');
        // #628: the `minimal` phantom profile is retired; an explicit 'minimal'
        // style now gracefully degrades to the genre's own 'acoustic' profile.
        expect(resolveSoloistStyle('minimal', 'Acoustic')).toBe('acoustic');
    });
});
