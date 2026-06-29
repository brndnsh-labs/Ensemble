// @ts-nocheck
// Metal soloist idiom critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863). Real dispatch-built state, a real seed, an absolute advancing
// step with currentLoopCount per loop (mirrors scheduler-core), scanned across a
// full macro-form over the minor-key 'Metal Core' progression (im | bVI | bVII |
// im) — the natural home of a metal lead. The seeder draws its theme from
// getScaleForChord(state, chord, null, 'metal'), so the metal scale choice
// reaches the live phrase-first line.
//
// What this guards: the metal lead stays on the C-minor / metal palette and
// avoids the major 3rd (the cardinal-sin note over a minor tonic). Measured
// KEY-relative (the line lives in one minor tonality), not chord-relative.
//
// DROPPED (dark on phrase-first; re-added by #869/#870):
//   • The legacy test's phrygian-DOMINANT-over-dominant discriminators
//     (b6-share / b2-share relative to each dominant chord root). The legacy
//     engine ran a per-chord getScaleForChord lookup that returned PHRYGIAN_
//     DOMINANT over every dominant chord, so b2/b6 read the chosen scale. Phrase-
//     first is theme/key-driven: over a major-key all-dom7 cycle the b6 share
//     sits exactly at the 0.5 random baseline (probe: 50.0%, b6=62/maj6=62) and
//     over this minor preset the chord-relative b2 never appears at all (probe:
//     b2=0/maj2=141). Asserting either would be a FALSE claim on this engine, so
//     both are dropped. Restoring the per-chord phrygian-dominant pull is a
//     candidate for the idiom ports tracked in #869/#870.
//   • The 'run' scalar-burst device share — the .device field is produced only by
//     the retired legacy engine; phrase-first notes carry no .device.
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
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Metal' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'guitar' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.85);
    dispatch(ACTIONS.SET_BPM, 160);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = true;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(presetName = 'Metal Core') {
    const state = buildState(presetName);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.85, 'METAL_CRITIQUE');
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    // C minor tonic = pitch class 0 (key 'C'). Measure KEY-relative.
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
                notes.push({ midi: n.midi, keyRoot: 0 });
            }
        }
    }
    return notes;
}

describe('Soloist Metal Critique (phrase-first)', () => {
    it('keeps the metal lead on the C-minor palette and avoids the major 3rd', () => {
        const notes = simulate('Metal Core');
        expect(notes.length).toBeGreaterThan(50);

        // KEY-relative target sets (C minor). NAT_MIN is the aeolian collection;
        // METAL_PAL adds the harmonic-minor maj7 (11) and the blue/tritone b5 (6).
        // Hard-coded (NOT the engine's own scale lookup), so adherence is not a
        // tautology — a bug routing metal to a MAJOR scale would crater natShare
        // and spike maj3Share.
        const NAT_MIN = new Set([0, 2, 3, 5, 7, 8, 10]);
        const METAL_PAL = new Set([0, 2, 3, 5, 6, 7, 8, 10, 11]);

        let kNat = 0;
        let kPal = 0;
        let kMaj3 = 0;
        for (const n of notes) {
            const keyRel = (n.midi - n.keyRoot + 120) % 12;
            if (NAT_MIN.has(keyRel)) {
                kNat++;
            }
            if (METAL_PAL.has(keyRel)) {
                kPal++;
            }
            // Major 3rd (4) over a minor tonic — the note metal avoids.
            if (keyRel === 4) {
                kMaj3++;
            }
        }
        const natShare = kNat / notes.length;
        const palShare = kPal / notes.length;
        const maj3Share = kMaj3 / notes.length;

        // baselines: NAT_MIN = 7/12 = 0.583 chromatic; METAL_PAL = 9/12 = 0.75;
        // a uniform line plays the major 3rd 1/12 = 8.3% of the time.
        console.log('\n--- METAL SOLOIST CRITIQUE (phrase-first) ---');
        console.log(`notes=${notes.length}`);
        console.log(`[Natural-minor share] ${(natShare * 100).toFixed(1)}% (baseline 58.3%)`);
        console.log(`[Metal-palette share] ${(palShare * 100).toFixed(1)}% (baseline 75%)`);
        console.log(`[Major-3rd share]     ${(maj3Share * 100).toFixed(1)}% (uniform 8.3%)`);
        console.log('---------------------------------------------\n');

        // (a) PALETTE ADHERENCE. The metal lead lives in C natural minor. Live
        // phrase-first delivers 99.5% over the Metal Core macro-form; >0.93 sits
        // ~35pp above the 0.583 chromatic baseline with ~6pp headroom, guarding
        // against a regression that lets the line wander out of the key.
        // (Deterministic — seeded scrambleHash; stable across runs.)
        expect(natShare).toBeGreaterThan(0.93);

        // (b) WIDER METAL PALETTE (aeolian + harmonic-minor maj7 + b5 tritone).
        // Live 99.5%; >0.95 is ~20pp above the 0.75 baseline. Non-vacuous floor
        // confirming the rare color tones stay inside the metal collection.
        expect(palShare).toBeGreaterThan(0.95);

        // (c) MAJOR-3RD AVOIDANCE — the cardinal-sin note over a minor tonic. A
        // uniform line would hit it 8.3% of the time; the metal lead drives it to
        // 0.0% (probe). <0.02 guards that the metal genre never drifts onto a
        // major-3rd-bearing scale (the #550 class of mis-route). This is an
        // anti-claim: low is the idiom, not a vacuous pass.
        expect(maj3Share).toBeLessThan(0.02);
    });

    // why: style-resolution guard (the reggae dead-profile / Rock→shred class of
    // bug — see the project memory "Genre→profile resolution-guard"). #550's root
    // cause was a profile reached only by an alias path. This pins every route to
    // the metal profile so a future re-route can't silently make this critique
    // exercise the wrong scale. Does not touch the engine — kept verbatim.
    it('resolves Metal genre + aliases to the canonical metal soloist profile', () => {
        // Metal genre (smart) → 'metal' (SMART_GENRES.Metal.soloist).
        expect(resolveSoloistStyle('smart', 'Metal')).toBe('metal');
        expect(resolveSoloistStyle('metal', 'Metal')).toBe('metal');
        // #628: the `shred` phantom profile is retired (Shred was never a live
        // genre). Its former routes now gracefully degrade — the legacy 'evh'
        // alias re-points to 'rock', and the unknown 'Shred' feel maps to the
        // neutral 'scalar' fallback rather than a dedicated phantom profile.
        expect(resolveSoloistStyle('evh', undefined)).toBe('rock');
        expect(resolveSoloistStyle('smart', 'Shred')).toBe('scalar');
        // NEGATIVE guard: the Rock genre deliberately keeps its own bluesy 'rock'
        // profile (#592) — it must NOT drift onto metal/phrygian dominant.
        expect(resolveSoloistStyle('smart', 'Rock')).toBe('rock');
    });
});
