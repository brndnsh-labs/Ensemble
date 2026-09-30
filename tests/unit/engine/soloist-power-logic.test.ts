// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { togglePower } from '../../../public/controllers/instrument-controller.js';
import { getState } from '../../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock State
vi.mock('../../../public/state.js', () => {
    const mockState = {
        chords: { enabled: true },
        bass: { enabled: true },
        soloist: makeSoloistMock({
            enabled: false,
            buffer: new Map(),
            lastPlayedFreq: null,
        }),
        groove: { enabled: true },
        vizState: { enabled: true },
        playback: { step: 0 },
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_PARAM') {
                mockState[payload.module][payload.param] = payload.value;
            }
        }),
    };
});

// Mock dependencies
vi.mock('../../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
    killSoloistNote: vi.fn(),
    killSoloistBus: vi.fn(),
}));

describe('Soloist Power Logic', () => {
    beforeEach(() => {
        const state = getState();
        state.soloist.enabled = false;
        vi.clearAllMocks();
    });

    it('toggles the soloist on and off', () => {
        togglePower('soloist');
        expect(getState().soloist.enabled).toBe(true);

        togglePower('soloist');
        expect(getState().soloist.enabled).toBe(false);
    });
});
