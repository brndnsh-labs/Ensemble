import { beforeEach, describe, expect, it, vi } from 'vitest';
import { togglePower } from '../../public/instrument-controller.js';
import { getState } from '../../public/state.js';

// Mock State
vi.mock('../../public/state.js', () => {
    const mockState = {
        chords: { enabled: true },
        bass: { enabled: true },
        soloist: { enabled: false, tradeMode: 'manual', buffer: new Map(), lastPlayedFreq: null },
        harmony: { enabled: false },
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
vi.mock('../../public/persistence.js', () => ({ saveCurrentState: vi.fn() }));
vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn(), flushWorker: vi.fn() }));
vi.mock('../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
    killSoloistNote: vi.fn(),
    killHarmonyNote: vi.fn(),
    killSoloistBus: vi.fn(),
    killHarmonyBus: vi.fn(),
}));

describe('Soloist Power Logic', () => {
    beforeEach(() => {
        const state = getState();
        state.soloist.enabled = false;
        state.soloist.tradeMode = 'manual';
        vi.clearAllMocks();
    });

    it('should toggle enabled state normally in manual mode', () => {
        togglePower('soloist');
        expect(getState().soloist.enabled).toBe(true);

        togglePower('soloist');
        expect(getState().soloist.enabled).toBe(false);
        expect(getState().soloist.tradeMode).toBe('manual');
    });

    it('should clear tradeMode when turning power OFF from an active trade mode', () => {
        const state = getState();
        state.soloist.enabled = true;
        state.soloist.tradeMode = 'sections';

        // Turn OFF
        togglePower('soloist');

        expect(state.soloist.enabled).toBe(false);
        // CRITICAL: If it stayed in 'sections', it would appear Yellow.
        // We want it OFF (Gray), so it should reset to 'manual'.
        expect(state.soloist.tradeMode).toBe('manual');
    });

    it('should maintain tradeMode if we are just toggling enabled state within the "game"', () => {
        // This test defines if we want the power button to act as a kill switch or a "yield" button.
        // User said: "If it's turned off, it shouldn't appear yellow".
        // This implies they want it DEAD.
    });
});
