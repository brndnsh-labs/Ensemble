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
import { clearToastActions } from './ui.js';

interface HandleEffectsContext {
    dispatch: (action: string, payload?: any) => void;
    viz?: any;
    oldBpm?: number;
}

/**
 * Re-seed the soloist (and, optionally, the drum orchestration / fills /
 * accents bag) from the current state. Shared by the play-start path and the
 * during-playback "arrangement changed" path so both routes use the same
 * recipe — bandIntensity, song seed, genre feel, and the dispatch shape.
 */
function regenerateSessionSeeds(
    stateMap: EnsembleState,
    songSeed: string,
    seedTimelineStartStep: number,
    dispatch: HandleEffectsContext['dispatch'],
): void {
    const { arranger, soloist, groove, playback } = stateMap;
    const soloGenerated = generateSessionSeed(
        stateMap,
        arranger,
        soloist.style || 'smart',
        playback.bandIntensity,
        songSeed,
    );
    dispatch(ACTIONS.UPDATE_SB, { sessionSeed: soloGenerated });

    if (groove.enabled) {
        const genreFeel = groove.genreFeel || 'Rock';
        const drumOrchGenerated = generateDrumOrchestration(
            stateMap,
            arranger,
            genreFeel,
            playback.bandIntensity,
            songSeed,
        );
        const drumFillsGenerated = generateDrumFills(
            stateMap,
            arranger,
            genreFeel,
            playback.bandIntensity,
            songSeed,
            // why (drum audit 2026-05-29): pass the soloist seed so the fill generator
            // can lay out when the solo is busy through a turnaround bar (defer-to-
            // soloist) — but ONLY when the soloist is enabled. With no audible solo there
            // is no line to step on, so the drummer should fill at the full base rate.
            // soloGenerated carries { notes, loopLengthSteps }.
            soloist.enabled ? soloGenerated : undefined,
        );
        const drumAccentsGenerated = generateSoloistAccents(
            stateMap,
            arranger,
            soloGenerated,
            genreFeel,
            playback.bandIntensity,
            songSeed,
        );
        dispatch(ACTIONS.UPDATE_GB, {
            orchestrationMap: drumOrchGenerated,
            fillMap: drumFillsGenerated,
            accentMap: drumAccentsGenerated,
            seedTimelineStartStep,
        });
    }
}

export function handleEffects(
    action: string,
    payload: any,
    stateMap: EnsembleState,
    context: HandleEffectsContext,
): void {
    const { dispatch } = context;
    switch (action) {
        case ACTIONS.TOGGLE_PLAY: {
            const { playback, arranger } = stateMap;
            if (playback.isPlaying) {
                // Auto-lock the chart whenever playback starts. The chart is a
                // music stand — you don't rewrite while the band is playing.
                // Unlock pauses; lock-on-play is the symmetric rule.
                if (!playback.chartLocked) {
                    dispatch(ACTIONS.SET_CHART_LOCKED, true);
                }
                let currentSongSeed = arranger.seed;
                if (!currentSongSeed) {
                    currentSongSeed = Math.floor(Math.random() * 0xffffff)
                        .toString(16)
                        .padStart(6, '0')
                        .toUpperCase();
                    dispatch(ACTIONS.SET_SONG_SEED, currentSongSeed);
                }

                regenerateSessionSeeds(stateMap, currentSongSeed, playback.step || 0, dispatch);
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
                regenerateSessionSeeds(
                    stateMap,
                    stateMap.arranger.seed,
                    stateMap.playback.step || 0,
                    dispatch,
                );
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
            const lastToast = stateMap.playback.toasts[stateMap.playback.toasts.length - 1];
            if (lastToast?.id) {
                // Actionable toasts linger so the user has time to click; plain
                // toasts dismiss in 2s as before.
                const expireMs = lastToast.actions?.length ? 8000 : 2000;
                setTimeout(() => {
                    dispatch(ACTIONS.TOAST_EXPIRED, lastToast.id);
                }, expireMs);
            }
            break;
        }
        case ACTIONS.TOAST_EXPIRED: {
            // Free any registered action callbacks for the dismissed toast.
            if (typeof payload === 'string') {
                clearToastActions(payload);
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
