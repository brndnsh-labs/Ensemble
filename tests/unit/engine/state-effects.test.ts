// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncBusReverbSend, syncBusVolume } from '../../../public/engine/engine.js';
import { handleEffects } from '../../../public/state/state-effects.js';
import { ACTIONS } from '../../../public/types.js';

// Mock all the imported functions
vi.mock('../../../public/engine/chords-engine.js', () => ({
    validateProgression: vi.fn(),
}));
vi.mock('../../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
    syncBusReverbSend: vi.fn(),
    syncBusVolume: vi.fn(),
}));

describe('State Effects Handler', () => {
    let stateMap;
    let dispatch;

    beforeEach(() => {
        vi.clearAllMocks();
        stateMap = {
            playback: { isPlaying: false, theme: 'dark' },
        };
        dispatch = vi.fn();
    });

    it('should re-send the bus reverb on SET_REVERB action (#688)', () => {
        const payload = { module: 'chords', value: 0.6 };
        handleEffects({ type: ACTIONS.SET_REVERB, payload: payload }, stateMap, { dispatch });
        expect(syncBusReverbSend).toHaveBeenCalledWith(stateMap, 'chords');
    });

    it('should NOT re-send the bus reverb on SET_REVERB with no module', () => {
        handleEffects({ type: ACTIONS.SET_REVERB, payload: { value: 0.6 } }, stateMap, {
            dispatch,
        });
        expect(syncBusReverbSend).not.toHaveBeenCalled();
    });

    it('should re-trim the bus gain on SET_VOLUME action (#1111)', () => {
        const payload = { module: 'chords', value: 0.6 };
        handleEffects({ type: ACTIONS.SET_VOLUME, payload: payload }, stateMap, { dispatch });
        expect(syncBusVolume).toHaveBeenCalledWith(stateMap, 'chords');
    });

    it('should NOT re-trim the bus gain on SET_VOLUME with no module', () => {
        handleEffects({ type: ACTIONS.SET_VOLUME, payload: { value: 0.6 } }, stateMap, {
            dispatch,
        });
        expect(syncBusVolume).not.toHaveBeenCalled();
    });
});
