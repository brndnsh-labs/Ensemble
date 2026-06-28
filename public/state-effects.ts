import { applyThemeToDom, setBpm } from './app-controller.js';
import { TIME_SIGNATURES } from './config.js';
import { autoVoiceForGenre } from './data/genre-sound-map.js';
import { SMART_GENRES } from './data/smart-genres.js';
import { validateProgression } from './engine/chords-engine.js';
import {
    generateDrumFills,
    generateDrumOrchestration,
    generateSoloistAccents,
} from './engine/drum-seeder.js';
import { initAudio, restoreGains, syncBusReverbSend } from './engine/engine.js';
import { isPackInstalled, packIdFromVoice } from './engine/instrument-registry.js';
import { ensurePackLoaded } from './engine/pack-runtime.js';
import { togglePlay } from './engine/scheduler-core.js';
import { resolveSoloistStyle, STYLE_CONFIG } from './engine/soloist-config.js';
import { deriveSoloistMode } from './engine/soloist-mode-policy.js';
import { deriveSoloistHook, generateSessionSeed } from './engine/soloist-seeder.js';
import { loadDrumPreset } from './instrument-controller.js';
import { initMIDI } from './midi-controller.js';
import type { EnsembleState, InstrumentModule, InstrumentVoice } from './types.js';
import { ACTIONS } from './types.js';
import { clearToastActions } from './ui.js';

interface HandleEffectsContext {
    dispatch: (action: string, payload?: any) => void;
    viz?: any;
    oldBpm?: number;
}

/** Lanes that follow the genre when in Auto mode (#675). */
const AUTO_FOLLOW_MODULES: InstrumentModule[] = ['chords', 'bass', 'soloist', 'harmony', 'groove'];

/**
 * Resolve every Auto-mode lane's voice to what `genre` maps to right now, and
 * dispatch the changes (#675/#683). Pinned lanes (`autoSound:false`) are left
 * alone; an uninstalled mapping resolves to synth (`autoVoiceForGenre` gates on
 * the registry's installed-set — auto-follow never auto-downloads). No-op writes
 * are skipped so non-mapped lanes don't churn dispatch.
 *
 * Two callers, one rule so they can't drift: the genre-change effect
 * (`SET_GENRE_FEEL`) and the pack-install path (`PacksSettings`), so installing a
 * pack upgrades the *current* genre's Auto lanes immediately rather than waiting
 * for the next genre change ("install → instantly better").
 */
export function resolveAutoVoices(
    stateMap: EnsembleState,
    genre: string | undefined,
    dispatch: HandleEffectsContext['dispatch'],
): void {
    for (const module of AUTO_FOLLOW_MODULES) {
        const inst = stateMap[module] as { autoSound?: boolean; voice: InstrumentVoice };
        if (!inst?.autoSound) {
            continue;
        }
        const next = autoVoiceForGenre(genre, module, isPackInstalled);
        if (next !== inst.voice) {
            // The SET_INSTRUMENT_VOICE effect lazily loads the pack + re-sends reverb.
            dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice: next, auto: true });
        }
    }
    // #856 — after the soloist's voice is resolved, re-derive its phrasing mode
    // (guitar pack → guitar). Runs even when the voice didn't change, so a
    // synth-lead genre swap (Metal → Neo-Soul) still flips the genre fallback.
    syncSoloistMode(stateMap, genre, dispatch);
}

/**
 * Derive + apply the soloist's phrasing mode from its current lead voice and the
 * active genre, when Auto (#856). No-op when the user has pinned the mode
 * (`autoMode === false`) or when the derived mode already matches.
 */
function syncSoloistMode(
    stateMap: EnsembleState,
    genre: string | undefined,
    dispatch: HandleEffectsContext['dispatch'],
): void {
    const sol = stateMap.soloist as { autoMode?: boolean; voice: InstrumentVoice; mode: string };
    if (!sol?.autoMode) {
        return;
    }
    const genreMode = genre ? SMART_GENRES[genre]?.soloistMode : undefined;
    const next = deriveSoloistMode(sol.voice, genreMode);
    if (next !== sol.mode) {
        dispatch(ACTIONS.SET_SOLOIST_MODE, next);
    }
}

/**
 * #856 — derive the soloist phrasing mode once at startup. Genre/voice are
 * hydrated directly (no `SET_GENRE_FEEL` fires on boot), so without this a
 * loaded session keeps its persisted/default `mode` until the next genre change
 * — leaving guitar genres stuck monophonic on load. Call after the worker + the
 * state subscriber are live so the dispatched mode crosses to the worker.
 */
export function deriveSoloistModeOnBoot(
    stateMap: EnsembleState,
    dispatch: HandleEffectsContext['dispatch'],
): void {
    syncSoloistMode(stateMap, stateMap.groove.lastSmartGenre, dispatch);
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

    // #555 — hook lane: for hook-driven profiles (Hip Hop), carve a short verbatim
    // hook out of the head so the worker can loop it. Gated on the resolved
    // profile's `hookLoop`, so non-hook genres dispatch a null hook (and the
    // replay short-circuit in getSoloistNote stays a no-op for them).
    const resolvedStyle = resolveSoloistStyle(soloist.style || 'smart', groove.genreFeel);
    const profile = STYLE_CONFIG[resolvedStyle];
    let soloistHook = null;
    if (profile?.hookLoop) {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        soloistHook = deriveSoloistHook(soloGenerated, profile.hookBars ?? 2, stepsPerMeasure);
    }
    dispatch(ACTIONS.UPDATE_SB, { sessionSeed: soloGenerated, soloistHook });

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
        case ACTIONS.SET_INSTRUMENT_VOICE: {
            // Epic 6 — selecting a `pack:<id>` voice lazily loads that pack's
            // samples (decode needs the live AudioContext from initAudio).
            const audio = stateMap.playback.audio;
            const packId = packIdFromVoice(payload?.voice);
            if (audio && packId) {
                void ensurePackLoaded(audio, packId);
            }
            // #686 — a pack sits in its own room: re-trim this lane's bus reverb
            // send for the new voice now (synth → ×1), so switching sound doesn't
            // wait for the next initAudio. Runs for synth too, to reset the send.
            if (audio && payload?.module) {
                syncBusReverbSend(stateMap, payload.module);
            }
            // #856 — a manual soloist voice pick (auto !== true) re-derives the
            // phrasing mode (pick a guitar pack → guitar). Auto-resolution's own
            // dispatch (auto:true) is handled by resolveAutoVoices' end-call.
            if (payload?.module === 'soloist' && payload.auto !== true) {
                syncSoloistMode(stateMap, stateMap.groove.lastSmartGenre, dispatch);
            }
            break;
        }
        case ACTIONS.SET_REVERB: {
            // #688 — the per-instrument reverb slider writes state.<module>.reverb,
            // but the bus reverb-send GainNode is otherwise only re-trimmed at
            // initAudio / voice change (SET_INSTRUMENT_VOICE, #686). Re-send now so
            // moving the slider alone is live (= slider × reverbSendForPack(voice)).
            // The helper no-ops before the audio graph exists.
            if (payload?.module) {
                syncBusReverbSend(stateMap, payload.module);
            }
            break;
        }
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
                // Randomize-each-playback: re-roll on every start so each take is
                // fresh. Otherwise the seed is locked — only roll when none is set.
                if (arranger.randomizeSeed || !currentSongSeed) {
                    currentSongSeed = Math.floor(Math.random() * 0xffffff)
                        .toString(16)
                        .padStart(6, '0')
                        .toUpperCase();
                    dispatch(ACTIONS.SET_SONG_SEED, currentSongSeed);
                }

                regenerateSessionSeeds(stateMap, currentSongSeed, playback.step || 0, dispatch);
            } else {
                dispatch(ACTIONS.UPDATE_SB, { sessionSeed: null, soloistHook: null });
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
            // #675 — auto-follow: Auto-mode lanes track the genre's mapped sound.
            // (#856 — resolveAutoVoices also re-derives the soloist phrasing mode.)
            resolveAutoVoices(stateMap, payload.genreName, dispatch);
            break;
        }
        case ACTIONS.SET_SOLOIST_AUTO_MODE: {
            // #856 — re-enabling Auto immediately re-derives the phrasing mode
            // from the current lead voice + genre (a pin is a no-op in the helper).
            syncSoloistMode(stateMap, stateMap.groove.lastSmartGenre, dispatch);
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
            // initAudio now loads any already-selected pack voice itself (#666),
            // on every audio-up path — so a persisted pack is ready whether audio
            // came up here or via the play path's direct initAudio() call.
            initAudio(stateMap);
            break;
        }
        case 'HYDRATE': {
            applyThemeToDom(stateMap.playback.palette, stateMap.playback.mode);
            if (stateMap.midi.enabled) {
                initMIDI();
            }
            break;
        }
    }
}
