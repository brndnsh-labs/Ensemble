import { afterEach, describe, expect, it, vi } from 'vitest';
import { SMART_GENRES } from '../../../public/data/smart-genres.js';
import {
    __resetPackCacheForTest,
    markPackInstalled,
} from '../../../public/engine/instrument-registry.js';
import {
    deriveSoloistMode,
    isGuitarSoloistVoice,
} from '../../../public/engine/soloist-mode-policy.js';
import { resolveAutoVoices } from '../../../public/state-effects.js';
import { ACTIONS, type EnsembleState } from '../../../public/types.js';

// #683 — installing a pack must upgrade the *current* genre's Auto lanes right
// away (the install path calls resolveAutoVoices against groove.lastSmartGenre),
// not wait for the next genre change. These lock the resolve loop's contract:
// Auto + now-installed mapping → flip; pinned → untouched; uninstalled → synth.

/** Minimal state with per-lane {autoSound, voice} — only what the loop reads. */
function makeState(
    lanes: Partial<Record<'chords' | 'harmony' | 'bass', { autoSound: boolean; voice: string }>>,
    soloist: { autoSound?: boolean; voice?: string; autoMode?: boolean; mode?: string } = {},
    genre = '',
): EnsembleState {
    return {
        chords: { autoSound: false, voice: 'synth', ...lanes.chords },
        harmony: { autoSound: false, voice: 'synth', ...lanes.harmony },
        bass: { autoSound: false, voice: 'synth', ...lanes.bass },
        soloist: {
            autoSound: false,
            voice: 'synth',
            autoMode: false,
            mode: 'monophonic',
            ...soloist,
        },
        groove: { autoSound: false, voice: 'synth', lastSmartGenre: genre },
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

// #856 — phrasing mode follows the lead voice. The pure mapping:
describe('deriveSoloistMode (#856)', () => {
    it('a guitar pack always plays guitar', () => {
        expect(isGuitarSoloistVoice('pack:electric-guitar-clean')).toBe(true);
        expect(isGuitarSoloistVoice('pack:nylon-guitar')).toBe(true);
        expect(isGuitarSoloistVoice('pack:electric-guitar-driven')).toBe(true);
        // genre fallback is ignored once the voice is a guitar.
        expect(deriveSoloistMode('pack:electric-guitar-clean', undefined)).toBe('guitar');
        expect(deriveSoloistMode('pack:nylon-guitar', 'monophonic')).toBe('guitar');
    });

    it('a non-guitar voice falls back to the genre mode, else monophonic', () => {
        expect(isGuitarSoloistVoice('pack:sax-alto')).toBe(false);
        // Sax lead (Jazz/Blues) → monophonic; a sax does not play double-stops.
        expect(deriveSoloistMode('pack:sax-alto', undefined)).toBe('monophonic');
        // Neo-Soul: synth lead but the genre declares guitar (quartal color).
        expect(deriveSoloistMode('synth', 'guitar')).toBe('guitar');
        expect(deriveSoloistMode('synth', undefined)).toBe('monophonic');
    });

    it('pins the guitar-idiom genre flag set (#856 — Bossa deliberately excluded)', () => {
        for (const g of ['Country', 'Rock', 'Acoustic', 'Funk', 'Neo-Soul']) {
            expect(SMART_GENRES[g]?.soloistMode).toBe('guitar');
        }
        // Sax-lead and single-note-melody genres carry no guitar flag.
        for (const g of ['Jazz', 'Blues', 'Bossa', 'Disco', 'Metal']) {
            expect(SMART_GENRES[g]?.soloistMode).toBeUndefined();
        }
    });
});

// #856 — the wiring: resolveAutoVoices re-derives the soloist mode after the
// voice resolves, honoring the Auto/pin flag.
describe('resolveAutoVoices → soloist mode derivation (#856)', () => {
    it('engages guitar mode for a guitar-pack lead when Auto (Country)', () => {
        markPackInstalled('electric-guitar-clean', true);
        const dispatch = vi.fn();
        // Already on the genre's guitar pack, so the voice loop is a no-op; only
        // the mode derivation should fire.
        const state = makeState(
            {},
            {
                autoSound: true,
                voice: 'pack:electric-guitar-clean',
                autoMode: true,
                mode: 'monophonic',
            },
            'Country',
        );

        resolveAutoVoices(state, 'Country', dispatch);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_SOLOIST_MODE, 'guitar');
    });

    it('reverts to monophonic for a sax lead when Auto (Blues)', () => {
        markPackInstalled('sax-alto', true);
        const dispatch = vi.fn();
        const state = makeState(
            {},
            { autoSound: true, voice: 'pack:sax-alto', autoMode: true, mode: 'guitar' },
            'Blues',
        );

        resolveAutoVoices(state, 'Blues', dispatch);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_SOLOIST_MODE, 'monophonic');
    });

    it('engages guitar mode for a guitar-idiom genre on the SYNTH lead — no pack installed (#856 boot/no-pack case)', () => {
        // The exact reported scenario: Country, no electric-guitar pack installed,
        // so the soloist resolves to synth. The genre flag must still engage
        // guitar mode (double-stops shouldn't require a pack download).
        const dispatch = vi.fn();
        const state = makeState(
            {},
            { autoSound: true, voice: 'synth', autoMode: true, mode: 'monophonic' },
            'Country',
        );

        resolveAutoVoices(state, 'Country', dispatch);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_SOLOIST_MODE, 'guitar');
    });

    it('keeps Jazz/Blues monophonic on the synth lead (no genre flag — sax idiom)', () => {
        const dispatch = vi.fn();
        const state = makeState(
            {},
            { autoSound: true, voice: 'synth', autoMode: true, mode: 'guitar' },
            'Blues',
        );

        resolveAutoVoices(state, 'Blues', dispatch);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_SOLOIST_MODE, 'monophonic');
    });

    it('keeps Neo-Soul guitar on its synth lead via the genre fallback', () => {
        const dispatch = vi.fn();
        const state = makeState(
            {},
            { autoSound: true, voice: 'synth', autoMode: true, mode: 'monophonic' },
            'Neo-Soul',
        );

        resolveAutoVoices(state, 'Neo-Soul', dispatch);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_SOLOIST_MODE, 'guitar');
    });

    it('respects a pinned mode (autoMode:false) — no derivation dispatch', () => {
        markPackInstalled('electric-guitar-clean', true);
        const dispatch = vi.fn();
        const state = makeState(
            {},
            {
                autoSound: true,
                voice: 'pack:electric-guitar-clean',
                autoMode: false,
                mode: 'monophonic',
            },
            'Country',
        );

        resolveAutoVoices(state, 'Country', dispatch);

        expect(dispatch).not.toHaveBeenCalledWith(ACTIONS.SET_SOLOIST_MODE, expect.anything());
    });

    it('does not re-dispatch when the derived mode already matches', () => {
        markPackInstalled('electric-guitar-clean', true);
        const dispatch = vi.fn();
        const state = makeState(
            {},
            {
                autoSound: true,
                voice: 'pack:electric-guitar-clean',
                autoMode: true,
                mode: 'guitar',
            },
            'Country',
        );

        resolveAutoVoices(state, 'Country', dispatch);

        expect(dispatch).not.toHaveBeenCalledWith(ACTIONS.SET_SOLOIST_MODE, expect.anything());
    });
});
