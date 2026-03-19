import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDrumPreset, togglePower } from '../../public/instrument-controller.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
    subscribe: vi.fn(),
    stateMap: {}, // Add stateMap to the mock
    playback: { bpm: 120 },
    arranger: {},
    groove: {},
    chords: {},
    soloist: {},
    harmony: {},
    midi: {},
    vizState: {},
}));

// Mock engine.js which exports the kill functions
vi.mock('../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
    killBassNote: vi.fn(),
    killBassBus: vi.fn(),
    killSoloistNote: vi.fn(),
    killSoloistBus: vi.fn(),
    killAllPianoNotes: vi.fn(),
    killChordBus: vi.fn(),
    killHarmonyNote: vi.fn(),
    killHarmonyBus: vi.fn(),
    killDrumNote: vi.fn(),
    killDrumBus: vi.fn(),
}));

vi.mock('../../public/engine/synth-drums.js', () => ({
    loadDrumKit: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
    debounceSaveState: vi.fn(),
}));

vi.mock('../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
}));

describe('Instrument Controller', () => {
    let state;

    beforeEach(() => {
        vi.clearAllMocks();
        state = {
            playback: { isPlaying: false, bandIntensity: 0.5, step: 0 },
            groove: { enabled: true, drumKit: 'standard', buffer: { clear: vi.fn() } },
            chords: { enabled: true, buffer: { clear: vi.fn() } },
            bass: { enabled: true, buffer: { clear: vi.fn(), lastPlayedFreq: null } },
            soloist: { enabled: false, buffer: { clear: vi.fn(), lastPlayedFreq: null } },
            harmony: { enabled: true, buffer: { clear: vi.fn() } },
            vizState: { enabled: true },
        };
        getState.mockReturnValue(state);
    });

    describe('togglePower', () => {
        it('should toggle power for a module', () => {
            togglePower('bass');
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_PARAM, {
                module: 'bass',
                param: 'enabled',
                value: false,
            });
        });

        it('should handle special soloist logic when turning on', () => {
            state.soloist.enabled = false;
            togglePower('soloist');

            // Should dispatch SET_PARAM for enabled=true
            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'soloist',
                    param: 'enabled',
                    value: true,
                }),
            );

            // Should dispatch soloist phrasing resets
            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'soloist',
                    param: 'isWaitingForEntry',
                    value: true,
                }),
            );
        });

        it('should handle special soloist logic when turning off', () => {
            state.soloist.enabled = true;
            togglePower('soloist');

            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'soloist',
                    param: 'enabled',
                    value: false,
                }),
            );

            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'soloist',
                    param: 'isYielding',
                    value: false,
                }),
            );
        });

        it('should handle chord/harmony alias names', () => {
            togglePower('chords');
            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'chords',
                }),
            );

            togglePower('harmonies');
            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'harmony',
                }),
            );
        });

        it('should return early for invalid type', () => {
            togglePower('invalid');
            expect(dispatch).not.toHaveBeenCalled();
        });
    });
});
