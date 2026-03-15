import { initAudio, restoreGains } from './engine/engine.js';
import { ACTIONS } from './types.js';

/**
 * Handle side effects for specific actions.
 * Extracted from state.js to break circular dependencies with the engine.
 */
export async function handleEffects(action, payload, stateMap, context = {}) {
    switch (action) {
        case ACTIONS.TOGGLE_PLAY: {
            const { togglePlay } = await import('./engine/scheduler-core.js');
            togglePlay(payload?.viz, true);
            break;
        }
        case ACTIONS.SET_BPM: {
            const { setBpm } = await import('./app-controller.js');
            setBpm(payload, payload?.viz, true, context.oldBpm);
            break;
        }
        case ACTIONS.SET_GENRE_FEEL: {
            const { playback } = stateMap;
            if (payload.drum && !playback.isPlaying) {
                const { loadDrumPreset } = await import('./instrument-controller.js');
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
    }
}
