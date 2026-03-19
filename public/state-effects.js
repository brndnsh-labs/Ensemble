import { applyTheme, setBpm } from './app-controller.js';
import { validateProgression } from './engine/chords-engine.js';
import { applyConductor } from './engine/conductor.js';
import { initAudio, restoreGains } from './engine/engine.js';
import { togglePlay } from './engine/scheduler-core.js';
import { generateSessionSeed } from './engine/soloist-seeder.js';
import { loadDrumPreset } from './instrument-controller.js';
import { initMIDI } from './midi-controller.js';
import { ACTIONS } from './types.js';

/**
 * Handle side effects for specific actions.
 * Extracted from state.js to break circular dependencies with the engine.
 * @param {string} action
 * @param {any} payload
 * @param {import('./types.js').EnsembleState} stateMap
 * @param {any} [context={}]
 */
export function handleEffects(action, payload, stateMap, context = {}) {
    const { dispatch } = context;
    switch (action) {
        case ACTIONS.TOGGLE_PLAY: {
            const { playback, arranger, soloist } = stateMap;
            if (playback.isPlaying) {
                // If user didn't provide a seed, generate one and save it so they can see/share it
                let currentSeed = soloist.seed;
                if (!currentSeed) {
                    currentSeed = Math.floor(Math.random() * 0xffffff)
                        .toString(16)
                        .padStart(6, '0')
                        .toUpperCase();
                    dispatch(ACTIONS.SET_SOLOIST_SEED, currentSeed);
                }

                const generated = generateSessionSeed(
                    arranger,
                    soloist.style || 'smart',
                    playback.bandIntensity,
                    currentSeed,
                );
                dispatch(ACTIONS.UPDATE_SB, { sessionSeed: generated });
            } else {
                dispatch(ACTIONS.UPDATE_SB, { sessionSeed: null });
            }
            togglePlay(stateMap, true, dispatch);
            break;
        }
        case ACTIONS.SET_SECTIONS:
        case ACTIONS.ADD_SECTION:
        case ACTIONS.REMOVE_SECTION:
        case ACTIONS.UPDATE_SECTION:
        case ACTIONS.SET_KEY:
        case ACTIONS.SET_TIME_SIGNATURE:
        case ACTIONS.SET_IS_MINOR: {
            validateProgression(stateMap, dispatch);
            // If arrangement changes during playback, we must regenerate the seed
            // to ensure MIDI notes land on valid chord/scale tones for the new structure.
            if (stateMap.playback.isPlaying) {
                const generated = generateSessionSeed(
                    stateMap.arranger,
                    stateMap.soloist.style || 'smart',
                    stateMap.playback.bandIntensity,
                    stateMap.soloist.seed,
                );
                dispatch(ACTIONS.UPDATE_SB, { sessionSeed: generated });
            }
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
        case ACTIONS.SHOW_TOAST: {
            // We re-dispatch with an ID so the reducer can store it and we can expire it
            // but the reducer already handles the first SHOW_TOAST.
            // Actually, we can just use the payload if it's already an object with an ID,
            // or if it's a string, we know the reducer will generate one.
            // Better: let the reducer handle the initial state, and here we just set the timer.
            // But we need the ID. Let's look at how SHOW_TOAST is called.

            // Optimization: If payload is a string, we need to know what ID the reducer gave it.
            // Or we can generate the ID here and pass it to the reducer.
            // Let's assume the reducer and effects are called in sequence.
            const toastId = stateMap.playback.toasts[stateMap.playback.toasts.length - 1]?.id;
            if (toastId) {
                setTimeout(() => {
                    dispatch('TOAST_EXPIRED', toastId);
                }, 2000);
            }
            break;
        }
        case ACTIONS.TRIGGER_FLASH: {
            setTimeout(() => {
                dispatch('FLASH_EXPIRED');
            }, 50);
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
