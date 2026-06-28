// @ts-nocheck
// #856 — production-shape proof that the phrase-first soloist (the LIVE engine)
// emits sparse double-stop PUNCTUATION in guitar mode. This is the test whose
// absence let the bug through: every other double-stop test exercised the legacy
// `getSoloistNote`, but production runs `getSoloistNotePhraseFirst`, which built
// single notes only. These assertions run the real engine, with a real seed, in
// guitar mode, across a full macro-form.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function buildState(genre: string, presetName: string, mode: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.62);
    dispatch(ACTIONS.SET_BPM, 120);
    const state = getState();
    // Drive the engine directly into the mode under test (no effects run in unit
    // context, so the genre→mode derivation doesn't fire here).
    state.soloist.mode = mode;
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

// Run one full macro-form, FLATTENING the double-stop arrays the engine returns.
function simulate(genre: string, presetName: string, mode: string) {
    const state = buildState(genre, presetName, mode);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.62, 'DS_SEED');
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing = { isResting: false };

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    let single = 0;
    const doubleStops: any[] = [];
    for (let abs = 0; abs < loopLen + 64; abs++) {
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
        if (!res) {
            continue;
        }
        if (Array.isArray(res)) {
            const harmony = res.find((n) => n.isDoubleStop);
            const lead = res.find((n) => !n.isDoubleStop);
            doubleStops.push({ harmony, lead, chord });
        } else {
            single++;
        }
    }
    return { single, doubleStops, total };
}

describe('Phrase-first double-stop punctuation (#856)', () => {
    it('emits sparse double-stops in GUITAR mode — and the harmony is consonant & below the lead', () => {
        const { single, doubleStops } = simulate('Rock', 'Pop (Standard)', 'guitar');

        // The headline: the LIVE engine actually produces double-stops in guitar
        // mode. (Before #856 phrase-first built single notes only → this was 0.)
        // Measured ~15 over a full macro-form; a floor of 5 guards them staying live.
        expect(doubleStops.length).toBeGreaterThanOrEqual(5);

        // Sparse PUNCTUATION, not a texture: double-stops are a small minority of
        // emitted notes (they only land on apex / anchor-strong-beat chord tones).
        // Measured ~4%; <0.20 guards a regression that turns them into a texture.
        const ratio = doubleStops.length / (single + doubleStops.length);
        expect(ratio).toBeLessThan(0.2);

        for (const { harmony, lead, chord } of doubleStops) {
            expect(harmony).toBeTruthy();
            expect(lead).toBeTruthy();
            // Harmony voice sits BELOW the lead (a 3rd/6th down).
            expect(harmony.midi).toBeLessThan(lead.midi);
            // The lead lands on a chord tone (the gate that keeps the stack clean).
            const pc = (((lead.midi - chord.rootMidi) % 12) + 12) % 12;
            const chordPcs = (chord.intervals ?? []).map((iv: number) => ((iv % 12) + 12) % 12);
            expect(chordPcs).toContain(pc);
        }
    });

    it('emits ZERO double-stops in MONOPHONIC mode (the gate)', () => {
        const { doubleStops } = simulate('Rock', 'Pop (Standard)', 'monophonic');
        expect(doubleStops.length).toBe(0);
    });
});
