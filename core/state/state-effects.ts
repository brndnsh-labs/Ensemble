import { autoVoiceForGenre } from '../data/genre-sound-map.js';
import { SMART_GENRES } from '../data/smart-genres.js';
import { syncBusReverbSend, syncBusVolume, syncMasterVolume } from '../engine/engine.js';
import { isPackInstalled, packIdFromVoice } from '../engine/instrument-registry.js';
import { ensurePackLoaded } from '../engine/pack-runtime.js';
import { deriveSoloistMode } from '../engine/soloist-mode-policy.js';
import type {
    Action,
    Dispatch,
    EnsembleState,
    InstrumentModule,
    InstrumentVoice,
} from '../types.js';
import { ACTIONS } from '../types.js';

interface HandleEffectsContext {
    dispatch: Dispatch;
}

/** Lanes that follow the genre when in Auto mode (#675). */
const AUTO_FOLLOW_MODULES: InstrumentModule[] = ['chords', 'bass', 'soloist', 'groove'];

/**
 * Resolve every Auto-mode lane's voice to what `genre` maps to right now, and
 * dispatch the changes (#675/#683). Pinned lanes (`autoSound:false`) are left
 * alone; an uninstalled mapping resolves to synth (`autoVoiceForGenre` gates on
 * the registry's installed-set; this resolution never downloads — the v2 band fetches the
 * style's packs behind it on Play, #1997, and calls this again when they land). No-op writes
 * are skipped so non-mapped lanes don't churn dispatch.
 *
 * Two callers in `web/lib/runtime.ts`, one rule so they can't drift: a genre
 * change (`setGenre`, right after its `SET_GENRE_FEEL` dispatch) and a pack install, so
 * installing a pack upgrades the *current* genre's Auto lanes immediately rather than
 * waiting for the next genre change ("install → instantly better"). It is deliberately
 * not a `handleEffects` case: `setGenre` decides when it runs.
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
        const next = autoVoiceForGenre(
            genre,
            module,
            isPackInstalled,
            module === 'chords' ? stateMap.chords.style : undefined,
        );
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
 * #856 — derive the soloist phrasing mode when a chart is opened. Its genre and voice
 * are installed directly (no `SET_GENRE_FEEL` fires), so without this the chart keeps
 * the previous `mode` until the next genre change — leaving guitar genres stuck
 * monophonic on open.
 */
export function deriveSoloistModeOnBoot(
    stateMap: EnsembleState,
    dispatch: HandleEffectsContext['dispatch'],
): void {
    syncSoloistMode(stateMap, stateMap.groove.lastSmartGenre, dispatch);
}

export function handleEffects(
    action: Action,
    stateMap: EnsembleState,
    context: HandleEffectsContext,
): void {
    const { dispatch } = context;
    switch (action.type) {
        case ACTIONS.SET_INSTRUMENT_VOICE: {
            const payload = action.payload;
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
            if (action.payload?.module) {
                syncBusReverbSend(stateMap, action.payload.module);
            }
            break;
        }
        case ACTIONS.SET_VOLUME: {
            // #1111 — the per-instrument volume slider writes state.<module>.volume,
            // but (unlike SET_REVERB above) had no live-ramp effect at all: the bus
            // gain node was otherwise only re-trimmed at initAudio/restoreGains (a
            // mute toggle, transport start). Re-trim now, mirroring SET_REVERB.
            if (action.payload?.module) {
                syncBusVolume(stateMap, action.payload.module);
            }
            break;
        }
        case ACTIONS.SET_PARAM: {
            // #1128 — master volume writes via SET_PARAM (playback.masterVolume),
            // not a dedicated action; ramp the master bus here instead of in
            // v1's Settings.tsx so any non-slider writer (preset apply, restore) also
            // gets the live ramp — mirrors SET_VOLUME above for the per-bus case.
            if (action.payload?.module === 'playback' && action.payload?.param === 'masterVolume') {
                syncMasterVolume(stateMap);
            }
            break;
        }
    }
}
