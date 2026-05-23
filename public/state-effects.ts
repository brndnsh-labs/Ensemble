import { applyTheme, setBpm } from './app-controller.js';
import { validateProgression } from './engine/chords-engine.js';
import {
    generateDrumFills,
    generateDrumOrchestration,
    generateSoloistAccents,
} from './engine/drum-seeder.js';
import { initAudio, restoreGains } from './engine/engine.js';
import { togglePlay } from './engine/scheduler-core.js';
import { generateSessionSeed } from './engine/soloist-seeder.js';
import { loadDrumPreset } from './instrument-controller.js';
import { initMIDI } from './midi-controller.js';
import type { EnsembleState } from './types.js';
import { ACTIONS } from './types.js';

export function handleEffects(
    action: string,
    payload: any,
    stateMap: EnsembleState,
    context: any = {},
): void {
    const { dispatch } = context;
    switch (action) {
        case ACTIONS.TOGGLE_PLAY: {
            const { playback, arranger, soloist, groove } = stateMap;
            if (playback.isPlaying) {
                // --- Soloist Seeder ---
                let currentSongSeed = arranger.seed;
                if (!currentSongSeed) {
                    currentSongSeed = Math.floor(Math.random() * 0xffffff)
                        .toString(16)
                        .padStart(6, '0')
                        .toUpperCase();
                    dispatch(ACTIONS.SET_SONG_SEED, currentSongSeed);
                }

                const soloGenerated = generateSessionSeed(
                    stateMap,
                    arranger,
                    soloist.style || 'smart',
                    playback.bandIntensity,
                    currentSongSeed,
                );
                dispatch(ACTIONS.UPDATE_SB, { sessionSeed: soloGenerated });

                // --- Drum Seeder ---
                if (groove.enabled) {
                    const currentDrumSeed = currentSongSeed;
                    const drumOrchGenerated = generateDrumOrchestration(
                        stateMap,
                        arranger,
                        groove.genreFeel || 'Rock',
                        playback.bandIntensity,
                        currentDrumSeed,
                    );
                    const drumFillsGenerated = generateDrumFills(
                        stateMap,
                        arranger,
                        groove.genreFeel || 'Rock',
                        playback.bandIntensity,
                        currentDrumSeed,
                    );
                    const drumAccentsGenerated = generateSoloistAccents(
                        stateMap,
                        arranger,
                        soloGenerated,
                        groove.genreFeel || 'Rock',
                        playback.bandIntensity,
                        currentDrumSeed,
                    );
                    dispatch(ACTIONS.UPDATE_GB, {
                        orchestrationMap: drumOrchGenerated,
                        fillMap: drumFillsGenerated,
                        accentMap: drumAccentsGenerated,
                        seedTimelineStartStep: playback.step || 0,
                    });
                }
            } else {
                dispatch(ACTIONS.UPDATE_SB, { sessionSeed: null });
                dispatch(ACTIONS.UPDATE_GB, {
                    orchestrationMap: null,
                    fillMap: null,
                    accentMap: null,
                    seedTimelineStartStep: 0,
                });
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
            // If arrangement changes during playback, we must regenerate seeds
            if (stateMap.playback.isPlaying) {
                const soloGenerated = generateSessionSeed(
                    stateMap,
                    stateMap.arranger,
                    stateMap.soloist.style || 'smart',
                    stateMap.playback.bandIntensity,
                    stateMap.arranger.seed,
                );
                dispatch(ACTIONS.UPDATE_SB, { sessionSeed: soloGenerated });

                if (stateMap.groove.enabled) {
                    const drumOrchGenerated = generateDrumOrchestration(
                        stateMap,
                        stateMap.arranger,
                        stateMap.groove.genreFeel || 'Rock',
                        stateMap.playback.bandIntensity,
                        stateMap.arranger.seed,
                    );
                    const drumFillsGenerated = generateDrumFills(
                        stateMap,
                        stateMap.arranger,
                        stateMap.groove.genreFeel || 'Rock',
                        stateMap.playback.bandIntensity,
                        stateMap.arranger.seed,
                    );
                    const drumAccentsGenerated = generateSoloistAccents(
                        stateMap,
                        stateMap.arranger,
                        soloGenerated,
                        stateMap.groove.genreFeel || 'Rock',
                        stateMap.playback.bandIntensity,
                        stateMap.arranger.seed,
                    );
                    dispatch(ACTIONS.UPDATE_GB, {
                        orchestrationMap: drumOrchGenerated,
                        fillMap: drumFillsGenerated,
                        accentMap: drumAccentsGenerated,
                        seedTimelineStartStep: stateMap.playback.step || 0,
                    });
                }
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
            const toastId = stateMap.playback.toasts[stateMap.playback.toasts.length - 1]?.id;
            if (toastId) {
                setTimeout(() => {
                    dispatch(ACTIONS.TOAST_EXPIRED, toastId);
                }, 2000);
            }
            break;
        }
        case ACTIONS.TRIGGER_FLASH: {
            setTimeout(() => {
                dispatch(ACTIONS.FLASH_EXPIRED);
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
