import { deepSignal } from 'deepsignal/core';
import { resolveSoloistMode } from '../engine/soloist-mode-policy.js';
import type {
    Action,
    BassState,
    ChordState,
    InstrumentModule,
    Mutable,
    SoloistState,
} from '../types.js';
import { ACTIONS } from '../types.js';

export type { BassState, ChordState, SoloistState };

import { groove, isGrooveModule } from './groove.js';
import { writeDeclaredParam } from './set-param.js';

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
});

export const bass = deepSignal<BassState>({
    enabled: true,
    voice: 'synth',
    autoSound: true,
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.bass,
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
        lastRenderedFreq: null,
    },
});

/** The four lanes by canonical slice name — the only module names the lane actions accept. */
const instrumentStateMap: Record<InstrumentModule, any> = {
    chords,
    bass,
    soloist,
    groove,
};

export function instrumentReducer(action: Action): boolean {
    const c = chords as Mutable<typeof chords>;
    const b = bass as Mutable<typeof bass>;
    const s = soloist as Mutable<typeof soloist>;
    switch (action.type) {
        case ACTIONS.SET_PARAM: {
            const { module: modKey, param, value } = action.payload;
            // grooveReducer owns the groove lane for this action (#1182); the playback and
            // arranger reducers own theirs.
            if (modKey === 'chords' || modKey === 'bass' || modKey === 'soloist') {
                return writeDeclaredParam(instrumentStateMap[modKey], modKey, param, value);
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
            return true;
    }
    return false;
}
