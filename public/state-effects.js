import { applyTheme, setBpm } from './app-controller.js';
import { initAudio, restoreGains } from './engine/engine.js';
import { togglePlay } from './engine/scheduler-core.js';
import { loadDrumPreset } from './instrument-controller.js';
import { initMIDI } from './midi-controller.js';
import { ACTIONS } from './types.js';

/**
 * Handle side effects for specific actions.
 * Extracted from state.js to break circular dependencies with the engine.
 */
export function handleEffects(action, payload, stateMap, context = {}) {
    const { dispatch } = context;
    switch (action) {
        case ACTIONS.TOGGLE_PLAY: {
            togglePlay(stateMap, payload?.viz, true, dispatch);
            break;
        }
        case ACTIONS.SET_BPM: {
            setBpm(payload, payload?.viz, true, context.oldBpm);
            break;
        }
        case ACTIONS.SET_GENRE_FEEL: {
            const { playback } = stateMap;
            if (payload.drum && !playback.isPlaying) {
                loadDrumPreset(payload.drum);
            }
            break;
        }
        case ACTIONS.RESTORE_GAINS: {
            restoreGains(stateMap);
            break;
        }
        case ACTIONS.INIT_AUDIO: {
            initAudio(stateMap);
            break;
        }
        case 'HYDRATE': {
            applyTheme(stateMap.playback.theme);
            if (stateMap.midi.enabled) {
                initMIDI();
            }
            break;
        }
    }
}
