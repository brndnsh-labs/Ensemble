// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
// #1313 — integration guard for the bass toggle. Chord voicings are baked at parse
// time and depend on whether a bass line is sounding, so `togglePower('bass')` must
// re-voice the live progression. Deliberately runs the REAL `validateProgression`
// against the REAL state tree: the sibling unit test mocks it, and a mock could not
// see that `togglePower`'s local lane map (also named `stateMap`) was being passed
// in place of the state tree — which threw on every bass toggle, in v1 and v2.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { togglePower } from '../../../public/controllers/instrument-controller.js';
import { validateProgression } from '../../../public/engine/chords-engine.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

vi.mock('../../../public/engine/engine.js', () => ({
    killAllPianoNotes: vi.fn(),
    killBassBus: vi.fn(),
    killBassNote: vi.fn(),
    killChordBus: vi.fn(),
    killDrumBus: vi.fn(),
    killDrumNote: vi.fn(),
    killHarmonyBus: vi.fn(),
    killHarmonyNote: vi.fn(),
    killSoloistBus: vi.fn(),
    killSoloistNote: vi.fn(),
    restoreGains: vi.fn(),
}));

const rootSounds = (chord) =>
    chord.freqs
        .map((f) => Math.round(69 + 12 * Math.log2(f / 440)))
        .some((midi) => (((midi - chord.rootMidi) % 12) + 12) % 12 === 0);

describe('bass toggle re-voices the comp (#1313)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dispatch(ACTIONS.RESET_STATE);
        const state = getState();
        state.groove.genreFeel = 'Jazz';
        state.playback.bandIntensity = 0.35;
        state.bass.enabled = true;
        state.arranger.key = 'C';
        state.arranger.sections = [{ id: 'a', label: 'A', value: 'Am7 | Dm7', repeat: 1 }];
        validateProgression(state);
    });

    it('muting the bass roots the written 7ths; un-muting returns the rootless shells', () => {
        const { arranger, bass } = getState();
        expect(arranger.progression.map(rootSounds)).toEqual([false, false]);

        expect(() => togglePower('bass')).not.toThrow();
        expect(bass.enabled).toBe(false);
        expect(getState().arranger.progression.map(rootSounds)).toEqual([true, true]);

        togglePower('bass');
        expect(bass.enabled).toBe(true);
        expect(getState().arranger.progression.map(rootSounds)).toEqual([false, false]);
    });
});
