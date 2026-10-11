import { deepSignal } from 'deepsignal/core';
import { resolveSoloistMode } from '../engine/soloist-mode-policy.js';
import type { Action, BassState, ChordState, Mutable, SoloistState } from '../types.js';
import { ACTIONS } from '../types.js';

export type { BassState, ChordState, SoloistState };

import { groove, isGrooveModule } from './groove.js';

export const MIXER_SETTINGS_VERSION = 2;

export const INSTRUMENT_REVERB_DEFAULTS = Object.freeze({
    chords: 0.3,
    bass: 0.05,
    soloist: 0.6,
    groove: 0.2,
});

export const chords = deepSignal<ChordState>({
    enabled: true,
    voice: 'synth',
    autoSound: true,
    style: 'smart',
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.chords,
    buffer: new Map(),
});

export const bass = deepSignal<BassState>({
    enabled: true,
    voice: 'synth',
    autoSound: true,
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.bass,
    lastFreq: null,
    lastPlayedFreq: null,
    buffer: new Map(),
    style: 'smart',
    lastBassGain: null,
});

export const soloist = deepSignal<SoloistState>({
    // === Configuration ===
    enabled: false,
    voice: 'synth',
    autoSound: true,
    mode: 'monophonic',
    // #856 — Auto: phrasing mode follows the lead voice (guitar pack → guitar).
    autoMode: true,
    style: 'smart',
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.soloist,
    // Trading with the player on the band engine (`BandSettings.trade`): off, or the partner.
    tradeWith: 'off',
    tradeBars: 4,
    // How many traded choruses before the head returns; 0 keeps trading forever.
    tradeChoruses: 2,

    // === Main-thread synth / voice tracking ===
    audio: {
        activeVoices: [],
        buffer: new Map(),
        lastFreq: null,
        lastRenderedFreq: null,
        lastPlayedFreq: null,
    },
});

/**
 * Soloist payload keys that were removed after the field behind them went away:
 * `motifTracking` / `pinnedProfile` in #866 (the legacy engine's retirement, epic
 * #10), and `complexity` in #1070 (dead since #1167 rewired the slider to
 * `phrasingIntensity` — zero writers, zero readers, absent from
 * `buildSoloistSyncPayload`), and the old engine's settings `preset`, `octave`,
 * `phrasingIntensity`, `tradeMode` and `tradeSilenced` in #1424. A stray payload
 * carrying one is dropped rather than letting the generic `SET_PARAM` write
 * resurrect it as a stray top-level field. Keep entries here.
 */
const DEPRECATED_SOLOIST_KEYS = new Set([
    'motifTracking',
    'pinnedProfile',
    'complexity',
    'preset',
    'octave',
    'phrasingIntensity',
    'tradeMode',
    'tradeSilenced',
]);

const instrumentStateMap: Record<string, any> = {
    cb: chords,
    chords,
    bb: bass,
    bass,
    sb: soloist,
    soloist,
    gb: groove,
    groove,
};

export function instrumentReducer(action: Action): boolean {
    const c = chords as Mutable<typeof chords>;
    const b = bass as Mutable<typeof bass>;
    const s = soloist as Mutable<typeof soloist>;
    switch (action.type) {
        case ACTIONS.SET_PARAM: {
            const modKey = action.payload.module;
            // A retired soloist setting is dropped, not written as a stray top-level field.
            if (
                (modKey === 'soloist' || modKey === 'sb') &&
                DEPRECATED_SOLOIST_KEYS.has(action.payload.param)
            ) {
                return true;
            }
            // grooveReducer owns the groove lane for this action (#1182).
            if (isGrooveModule(modKey)) {
                return false;
            }
            if (instrumentStateMap[modKey]) {
                instrumentStateMap[modKey][action.payload.param] = action.payload.value;
                return true;
            }
            break;
        }
        case ACTIONS.SET_VOLUME:
            // grooveReducer owns the groove lane for this action (#1182).
            if (isGrooveModule(action.payload.module)) {
                return false;
            }
            if (instrumentStateMap[action.payload.module]) {
                instrumentStateMap[action.payload.module].volume = action.payload.value;
            }
            return true;
        case ACTIONS.SET_REVERB:
            // grooveReducer owns the groove lane for this action (#1182).
            if (isGrooveModule(action.payload.module)) {
                return false;
            }
            if (instrumentStateMap[action.payload.module]) {
                instrumentStateMap[action.payload.module].reverb = action.payload.value;
            }
            return true;
        case ACTIONS.SET_SOLOIST_MODE:
            s.mode = resolveSoloistMode(action.payload);
            return true;
        case ACTIONS.SET_INSTRUMENT_VOICE: {
            // synth-audit Epic 0 S1 — A/B voice switch. instrumentStateMap
            // covers groove too, so this one case handles all five modules.
            const target = instrumentStateMap[action.payload.module];
            if (target) {
                target.voice = action.payload.voice;
                // #675 — a manual pick pins (auto:false); selecting Auto sets
                // auto:true + the genre's voice. Omitting `auto` (a bare voice
                // set, e.g. pack-eviction reset) leaves the mode untouched.
                if (action.payload.auto !== undefined) {
                    target.autoSound = action.payload.auto;
                }
                return true;
            }
            break;
        }
        case ACTIONS.SET_GENRE_FEEL:
            if (action.payload.chord) {
                c.style = action.payload.chord;
            }
            if (action.payload.bass) {
                b.style = action.payload.bass;
            }
            if (action.payload.soloist) {
                s.style = action.payload.soloist;
            }
            return true;
    }
    return false;
}
