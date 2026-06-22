import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    __resetPackCacheForTest,
    markPackInstalled,
} from '../../../public/engine/instrument-registry.js';
import { resolveAutoVoices } from '../../../public/state-effects.js';
import { ACTIONS, type EnsembleState } from '../../../public/types.js';

// #683 — installing a pack must upgrade the *current* genre's Auto lanes right
// away (the install path calls resolveAutoVoices against groove.lastSmartGenre),
// not wait for the next genre change. These lock the resolve loop's contract:
// Auto + now-installed mapping → flip; pinned → untouched; uninstalled → synth.

/** Minimal state with per-lane {autoSound, voice} — only what the loop reads. */
function makeState(
    lanes: Partial<Record<'chords' | 'harmony' | 'bass', { autoSound: boolean; voice: string }>>,
): EnsembleState {
    return {
        chords: { autoSound: false, voice: 'synth', ...lanes.chords },
        harmony: { autoSound: false, voice: 'synth', ...lanes.harmony },
        bass: { autoSound: false, voice: 'synth', ...lanes.bass },
        soloist: { autoSound: false, voice: 'synth' },
        groove: { autoSound: false, voice: 'synth' },
    } as unknown as EnsembleState;
}

afterEach(() => {
    __resetPackCacheForTest();
});

describe('resolveAutoVoices (#683 install → instantly better)', () => {
    it('flips an Auto lane to the mapped pack once that pack is installed', () => {
        // Jazz → grand on the chords lane; install it, then resolve for Jazz.
        markPackInstalled('grand', true);
        const dispatch = vi.fn();
        const state = makeState({ chords: { autoSound: true, voice: 'synth' } });

        resolveAutoVoices(state, 'Jazz', dispatch);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
            module: 'chords',
            voice: 'pack:grand',
            auto: true,
        });
    });

    it('leaves a pinned (autoSound:false) lane untouched even when the pack is installed', () => {
        markPackInstalled('grand', true);
        const dispatch = vi.fn();
        const state = makeState({ chords: { autoSound: false, voice: 'synth' } });

        resolveAutoVoices(state, 'Jazz', dispatch);

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('keeps an Auto lane on synth when the mapped pack is NOT installed', () => {
        // No install → uninstalled mapping resolves to synth (no auto-download).
        const dispatch = vi.fn();
        const state = makeState({ chords: { autoSound: true, voice: 'synth' } });

        resolveAutoVoices(state, 'Jazz', dispatch);

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('does not re-dispatch when the Auto lane is already on the mapped voice', () => {
        // Idempotent: a no-op resolve (already pack:grand) skips the dispatch so a
        // repeated install gesture / installAll loop doesn't churn state.
        markPackInstalled('grand', true);
        const dispatch = vi.fn();
        const state = makeState({ chords: { autoSound: true, voice: 'pack:grand' } });

        resolveAutoVoices(state, 'Jazz', dispatch);

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('resolves chords and harmony together for one genre (coherent pairing)', () => {
        // Funk → clavinet (chords) + horns (harmony); both Auto, both installed.
        markPackInstalled('clavinet', true);
        markPackInstalled('horns-section', true);
        const dispatch = vi.fn();
        const state = makeState({
            chords: { autoSound: true, voice: 'synth' },
            harmony: { autoSound: true, voice: 'synth' },
        });

        resolveAutoVoices(state, 'Funk', dispatch);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
            module: 'chords',
            voice: 'pack:clavinet',
            auto: true,
        });
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
            module: 'harmony',
            voice: 'pack:horns-section',
            auto: true,
        });
    });
});
