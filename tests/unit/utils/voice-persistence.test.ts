import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

vi.mock('../../../public/state.js', () => ({
    getState: vi.fn(),
    storage: { save: vi.fn() },
}));

import { hydrateVoice } from '../../../public/engine/instrument-registry.js';
import { saveCurrentState } from '../../../public/persistence.js';
import { getState, storage } from '../../../public/state.js';

// The Sounds source picker writes the chosen voice (synth | pack:<id>) and calls
// saveCurrentState(). This locks the round-trip so a future persistence refactor
// can't silently drop the selection — the bug would be invisible to typecheck.
function mockStateWithVoices(voices: Record<string, string>) {
    (getState as any).mockReturnValue({
        arranger: { sections: [] },
        playback: {},
        chords: { voice: voices.chords, instruments: [] },
        bass: { voice: voices.bass },
        soloist: makeSoloistMock({ voice: voices.soloist }),
        harmony: { voice: voices.harmony },
        groove: { voice: voices.groove, instruments: [] },
        vizState: {},
        midi: {},
    });
}

describe('instrument voice persistence — Sounds source selection survives reload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('saveCurrentState writes each instrument voice (synth or pack) verbatim', () => {
        mockStateWithVoices({
            chords: 'pack:grand',
            bass: 'synth',
            soloist: 'synth',
            harmony: 'synth',
            groove: 'synth',
        });

        saveCurrentState();

        const [key, data] = (storage.save as any).mock.calls.at(-1);
        expect(key).toBe('currentState');
        expect(data.chords.voice).toBe('pack:grand');
        expect(data.bass.voice).toBe('synth');
        expect(data.soloist.voice).toBe('synth');
        expect(data.harmony.voice).toBe('synth');
        expect(data.groove.voice).toBe('synth');
    });

    it('a persisted pack selection hydrates back to that pack; synth stays synth', () => {
        // The restore side: hydrateVoice is what state-hydration runs per slice.
        expect(hydrateVoice('pack:grand')).toBe('pack:grand');
        expect(hydrateVoice('synth')).toBe('synth');
        // A removed/garbage pack value falls back to synth (graceful).
        expect(hydrateVoice('pack:')).toBe('synth');
    });
});
