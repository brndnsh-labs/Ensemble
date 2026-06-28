// @ts-nocheck
// Register-slotting guard for the LIVE soloist engine (getSoloistNotePhraseFirst).
//
// Replaces the legacy soloist-ceiling + soloist-range unit tests (epic #10, #864),
// which drove the retired getSoloistNote with an intensity-driven "registerSoar"
// that phrase-first doesn't have. Phrase-first bounds its line structurally
// (reachCeil = min(themeApexMidi + 9, 90)) and tick-logic enforceRegisterSlotting
// clamps the floor — so the invariants still hold, but must be asserted against
// the engine that actually plays.
//
// Production-faithful: real dispatch-built state, a real seed, an absolute
// advancing step with currentLoopCount incremented per loop (mirrors
// scheduler-core), scanned across a full macro-form at MAX intensity so the
// highest reaches are exercised.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../../public/data/chord-presets.js';
import { validateProgression } from '../../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

function scanMidis(genre: string, presetName = 'Pop (Standard)') {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 1.0); // max — exercise the highest reaches
    dispatch(ACTIONS.SET_BPM, 120);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);

    const seed = generateSessionSeed(state, state.arranger, 'smart', 1.0, 'REGISTER_GUARD');
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    const midis: number[] = [];
    // Scan several full loops into the exploratory phase (loop 2+ ornaments hardest).
    for (let abs = 0; abs < loopLen * 3 + 64; abs++) {
        state.playback.currentLoopCount = Math.floor(abs / total);
        const res = getSoloistNotePhraseFirst(
            state,
            chordAt(abs),
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
        for (const n of Array.isArray(res) ? res : [res]) {
            if (typeof n.midi === 'number') {
                midis.push(n.midi);
            }
        }
    }
    return midis;
}

describe('Soloist register constraints (phrase-first)', () => {
    // A loud, high-reaching genre is the worst case for the ceiling.
    it('NEVER exceeds MIDI 96 (C7), even at max intensity across the exploratory loops', () => {
        const midis = scanMidis('Metal', 'Metal Core');
        expect(midis.length).toBeGreaterThan(0);
        const maxMidi = Math.max(...midis);
        expect(maxMidi).toBeLessThanOrEqual(96);
    });

    it('keeps the line in a singable register — the overwhelming majority stays above G3 (MIDI 55)', () => {
        const midis = scanMidis('Rock');
        expect(midis.length).toBeGreaterThan(0);
        const belowFloor = midis.filter((m) => m < 55).length;
        // Rare dips are allowed (a deliberate low resolution); the line as a whole
        // must sit in the soloist register, not the bass register.
        expect(belowFloor / midis.length).toBeLessThan(0.1);
    });
});
