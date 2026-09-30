import { deepSignal } from 'deepsignal/core';
import { resolveSoloistMode } from '../engine/soloist-mode-policy.js';
import type {
    Action,
    BassState,
    ChordState,
    HarmonyState,
    Mutable,
    SoloistState,
} from '../types.js';
import { ACTIONS } from '../types.js';

export type { BassState, ChordState, HarmonyState, SoloistState };

import { groove, isGrooveModule } from './groove.js';

export const MIXER_SETTINGS_VERSION = 2;

export const INSTRUMENT_REVERB_DEFAULTS = Object.freeze({
    chords: 0.3,
    bass: 0.05,
    soloist: 0.6,
    harmony: 0.4,
    groove: 0.2,
});

export const chords = deepSignal<ChordState>({
    enabled: true,
    voice: 'synth',
    autoSound: true,
    style: 'smart',
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.chords,
    scheduledChordIndex: null,
    buffer: new Map(),
    rhythmicMask: 0,
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
    busySteps: 0,
    lastMidiPlayed: null,
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

    // === Engine runtime ===
    session: {
        seed: null,
        sessionSteps: 0,
        phraseCount: 0,
        tension: 0,
        lastSmartStyle: 'scalar',
        phrasing: {
            state: 'rest',
            isResting: true,
            transitionState: null,
            restSteps: 0,
            activeSteps: 0,
            busySteps: 0,
            isWaitingForEntry: false,
            isYielding: false,
            lastAttackStep: -100,
            // why: S14 phrasing-budget timer — increments at each bar boundary
            // while active, resets to 0 on rest entry. Starts at 0 (resting).
            barsSinceRest: 0,
        },
        currentPhrase: {
            startStep: null,
            loopCount: null,
            sectionLabel: null,
            sectionOccurrence: 0,
            notesInPhrase: 0,
            context: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
                signature: null,
                responseSignature: null,
                responseMode: 'free',
                responseSource: 'free',
                sectionLabel: null,
                sectionOccurrence: 0,
                restatementEcho: null,
            },
        },
        memory: {
            recentNotes: [],
            sharedHookBuffer: [],
            sectionRecall: {},
            sectionRecallLoop: null,
            formArcRecall: {},
        },
        contour: {
            trend: 'Static',
            direction: 1,
            steps: 0,
        },
    },

    // === Main-thread synth / voice tracking ===
    audio: {
        activeVoices: [],
        buffer: new Map(),
        lastFreq: null,
        lastMidiPlayed: null,
        lastRenderedFreq: null,
        lastPlayedFreq: null,
        lastNoteEnd: 0,
    },
});

export const harmony = deepSignal<HarmonyState>({
    enabled: false,
    voice: 'synth',
    autoSound: true,
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.harmony,
    buffer: new Map(),
    octave: 60,
    style: 'smart',
    complexity: 0.5,
    motifBuffer: [],
    lastMidis: [],
    activeVoices: [],
    rhythmicMask: 0,
});

/**
 * SET_PARAM accepts a flat-keyed soloist payload (kept that way for worker-wire
 * compatibility and hydration; `ACTIONS.UPDATE_SB`, the old multi-key batch form,
 * was deleted in #1381 — nothing dispatched it). The physical state layout is
 * nested under `session` / `audio`, so this table routes each flat key to its
 * actual home. Adding a new soloist field means adding one entry here.
 */
type SoloistFieldRoute =
    | { kind: 'config'; key: keyof SoloistState }
    | { kind: 'session'; key: string }
    | { kind: 'phrasing'; key: string }
    | { kind: 'currentPhrase'; key: string }
    | { kind: 'memory'; key: string }
    | { kind: 'contour'; key: string }
    | { kind: 'audio'; key: string };

const SOLOIST_FIELD_ROUTES: Record<string, SoloistFieldRoute> = {
    // --- Config (flat at the top) ---
    enabled: { kind: 'config', key: 'enabled' },
    mode: { kind: 'config', key: 'mode' },
    style: { kind: 'config', key: 'style' },
    volume: { kind: 'config', key: 'volume' },
    reverb: { kind: 'config', key: 'reverb' },
    tradeWith: { kind: 'config', key: 'tradeWith' },
    tradeBars: { kind: 'config', key: 'tradeBars' },
    tradeChoruses: { kind: 'config', key: 'tradeChoruses' },

    // --- Session (top-level) ---
    sessionSeed: { kind: 'session', key: 'seed' },
    sessionSteps: { kind: 'session', key: 'sessionSteps' },
    phraseCount: { kind: 'session', key: 'phraseCount' },
    tension: { kind: 'session', key: 'tension' },
    lastSmartStyle: { kind: 'session', key: 'lastSmartStyle' },

    // --- Phrasing FSM ---
    phrasingState: { kind: 'phrasing', key: 'state' },
    isResting: { kind: 'phrasing', key: 'isResting' },
    transitionState: { kind: 'phrasing', key: 'transitionState' },
    restSteps: { kind: 'phrasing', key: 'restSteps' },
    activeSteps: { kind: 'phrasing', key: 'activeSteps' },
    busySteps: { kind: 'phrasing', key: 'busySteps' },
    isWaitingForEntry: { kind: 'phrasing', key: 'isWaitingForEntry' },
    isYielding: { kind: 'phrasing', key: 'isYielding' },
    lastAttackStep: { kind: 'phrasing', key: 'lastAttackStep' },
    barsSinceRest: { kind: 'phrasing', key: 'barsSinceRest' },

    // --- Current phrase ---
    phraseStartStep: { kind: 'currentPhrase', key: 'startStep' },
    phraseLoopCount: { kind: 'currentPhrase', key: 'loopCount' },
    phraseSectionLabel: { kind: 'currentPhrase', key: 'sectionLabel' },
    phraseSectionOccurrence: { kind: 'currentPhrase', key: 'sectionOccurrence' },
    notesInPhrase: { kind: 'currentPhrase', key: 'notesInPhrase' },
    phraseContext: { kind: 'currentPhrase', key: 'context' },

    // --- Memory ---
    recentNotes: { kind: 'memory', key: 'recentNotes' },
    sharedHookBuffer: { kind: 'memory', key: 'sharedHookBuffer' },
    sectionRecall: { kind: 'memory', key: 'sectionRecall' },
    sectionRecallLoop: { kind: 'memory', key: 'sectionRecallLoop' },
    formArcRecall: { kind: 'memory', key: 'formArcRecall' },

    // --- Contour ---
    melodicTrend: { kind: 'contour', key: 'trend' },
    direction: { kind: 'contour', key: 'direction' },
    contourSteps: { kind: 'contour', key: 'steps' },

    // --- Audio (main-thread synth) ---
    activeVoices: { kind: 'audio', key: 'activeVoices' },
    buffer: { kind: 'audio', key: 'buffer' },
    lastFreq: { kind: 'audio', key: 'lastFreq' },
    lastMidiPlayed: { kind: 'audio', key: 'lastMidiPlayed' },
    lastRenderedFreq: { kind: 'audio', key: 'lastRenderedFreq' },
    lastPlayedFreq: { kind: 'audio', key: 'lastPlayedFreq' },
    lastNoteEnd: { kind: 'audio', key: 'lastNoteEnd' },
};

/**
 * Soloist payload keys that were removed after the field behind them went away:
 * `motifTracking` / `pinnedProfile` in #866 (the legacy engine's retirement, epic
 * #10), and `complexity` in #1070 (dead since #1167 rewired the slider to
 * `phrasingIntensity` — zero writers, zero readers, absent from
 * `buildSoloistSyncPayload`), and the old engine's settings `preset`, `octave`,
 * `phrasingIntensity`, `tradeMode` and `tradeSilenced` in #1424. A stray payload
 * carrying one is dropped rather than letting the unknown-key fall-through
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

/**
 * Apply a flat-keyed soloist payload to the nested state shape. Unknown keys
 * are written to the top level (preserves the legacy `instrumentStateMap[mod][param] = v`
 * behavior that some tests and scripts rely on for ad-hoc fields), except
 * deprecated keys (see `DEPRECATED_SOLOIST_KEYS`), which are silently dropped.
 */
function applySoloistPayload(target: typeof soloist, payload: Record<string, unknown>): void {
    const t = target as Mutable<typeof target>;
    for (const flatKey of Object.keys(payload)) {
        if (DEPRECATED_SOLOIST_KEYS.has(flatKey)) {
            continue;
        }
        const route = SOLOIST_FIELD_ROUTES[flatKey];
        if (!route) {
            (t as Record<string, unknown>)[flatKey] = payload[flatKey];
            continue;
        }
        const value = payload[flatKey];
        switch (route.kind) {
            case 'config':
                (t as Record<string, unknown>)[route.key] = value;
                break;
            case 'session':
                (t.session as Record<string, unknown>)[route.key] = value;
                break;
            case 'phrasing':
                (t.session.phrasing as Record<string, unknown>)[route.key] = value;
                break;
            case 'currentPhrase':
                (t.session.currentPhrase as Record<string, unknown>)[route.key] = value;
                break;
            case 'memory':
                (t.session.memory as Record<string, unknown>)[route.key] = value;
                break;
            case 'contour':
                (t.session.contour as Record<string, unknown>)[route.key] = value;
                break;
            case 'audio':
                (t.audio as Record<string, unknown>)[route.key] = value;
                break;
        }
    }
}

const instrumentStateMap: Record<string, any> = {
    cb: chords,
    chords,
    bb: bass,
    bass,
    sb: soloist,
    soloist,
    hb: harmony,
    harmony,
    gb: groove,
    groove,
};

export function instrumentReducer(action: Action): boolean {
    const c = chords as Mutable<typeof chords>;
    const b = bass as Mutable<typeof bass>;
    const s = soloist as Mutable<typeof soloist>;
    const h = harmony as Mutable<typeof harmony>;
    switch (action.type) {
        case ACTIONS.SET_PARAM: {
            const modKey =
                action.payload.module === 'harmonies' ? 'harmony' : action.payload.module;
            // Soloist params are flat at the wire but nested in state — route them.
            if (modKey === 'soloist' || modKey === 'sb') {
                applySoloistPayload(soloist, { [action.payload.param]: action.payload.value });
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
            if (action.payload.harmony) {
                h.style = action.payload.harmony;
            }
            return true;
    }
    return false;
}
