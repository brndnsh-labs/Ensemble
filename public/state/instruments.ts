import { deepSignal } from 'deepsignal';
import { resolveSoloistMode } from '../engine/soloist-mode-policy.js';
import type {
    Action,
    BassState,
    ChordState,
    HarmonyState,
    Mutable,
    SoloistPhraseContext,
    SoloistSessionSeed,
    SoloistState,
} from '../types.js';
import { ACTIONS } from '../types.js';

export type {
    BassState,
    ChordState,
    HarmonyState,
    SoloistPhraseContext,
    SoloistSessionSeed,
    SoloistState,
};

import { groove } from './groove.js';

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
    style: 'smart',
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.chords,
    octave: 65,
    density: 'standard',
    lastActiveChordIndex: null,
    scheduledChordIndex: null,
    buffer: new Map(),
    rhythmicMask: 0,
    instrument: 'Clean',
});

export const bass = deepSignal<BassState>({
    enabled: true,
    voice: 'synth',
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.bass,
    lastFreq: null,
    lastPlayedFreq: null,
    buffer: new Map(),
    octave: 38,
    style: 'smart',
    busySteps: 0,
    lastMidiPlayed: null,
    lastBassGain: null,
});

export const soloist = deepSignal<SoloistState>({
    // === Configuration (persisted) ===
    enabled: false,
    voice: 'synth',
    preset: 'trumpet',
    mode: 'monophonic',
    style: 'smart',
    octave: 72,
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.soloist,
    complexity: 0.5,
    phrasingIntensity: 0.5,
    hookRetentionProb: 0.5,
    doubleStopProb: 1.0,
    tradeMode: 'manual',
    motifTracking: false,
    // why: Epic 12 S3 — user-pinned Greats profile. `null` keeps the
    // historical 80%-section-boundary auto-rotation; non-null sticky-retains
    // the chosen profile across boundaries (see soloist.ts rotation site).
    pinnedProfile: null,

    // === Engine runtime ===
    session: {
        seed: null,
        hook: null,
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
                srdcState: 'statement',
                restatementEcho: null,
            },
        },
        memory: {
            recentNotes: [],
            hookBuffer: [],
            sharedHookBuffer: [],
            rhythmicMotif: [],
            sectionRecall: {},
            sectionRecallLoop: null,
            formArcRecall: {},
        },
        rhythm: {
            plan: [],
            entropy: 0,
            deviceBuffer: [],
            embellishmentBuffer: [],
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
    pocketOffset: 0,
});

/**
 * UPDATE_SB / SET_PARAM accept flat-keyed payloads (kept that way for worker-wire
 * compatibility, hydration, and external dispatchers like the conductor). The
 * physical state layout is now nested under `session` / `audio`, so this table
 * routes each flat key to its actual home. Adding a new soloist field means
 * adding one entry here.
 */
type SoloistFieldRoute =
    | { kind: 'config'; key: keyof SoloistState }
    | { kind: 'session'; key: string }
    | { kind: 'phrasing'; key: string }
    | { kind: 'currentPhrase'; key: string }
    | { kind: 'memory'; key: string }
    | { kind: 'rhythm'; key: string }
    | { kind: 'contour'; key: string }
    | { kind: 'audio'; key: string };

const SOLOIST_FIELD_ROUTES: Record<string, SoloistFieldRoute> = {
    // --- Config (flat at the top, persisted) ---
    enabled: { kind: 'config', key: 'enabled' },
    preset: { kind: 'config', key: 'preset' },
    mode: { kind: 'config', key: 'mode' },
    style: { kind: 'config', key: 'style' },
    octave: { kind: 'config', key: 'octave' },
    volume: { kind: 'config', key: 'volume' },
    reverb: { kind: 'config', key: 'reverb' },
    complexity: { kind: 'config', key: 'complexity' },
    phrasingIntensity: { kind: 'config', key: 'phrasingIntensity' },
    hookRetentionProb: { kind: 'config', key: 'hookRetentionProb' },
    doubleStopProb: { kind: 'config', key: 'doubleStopProb' },
    tradeMode: { kind: 'config', key: 'tradeMode' },
    motifTracking: { kind: 'config', key: 'motifTracking' },
    pinnedProfile: { kind: 'config', key: 'pinnedProfile' },

    // --- Session (top-level) ---
    sessionSeed: { kind: 'session', key: 'seed' },
    soloistHook: { kind: 'session', key: 'hook' },
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
    hookBuffer: { kind: 'memory', key: 'hookBuffer' },
    sharedHookBuffer: { kind: 'memory', key: 'sharedHookBuffer' },
    rhythmicMotif: { kind: 'memory', key: 'rhythmicMotif' },
    sectionRecall: { kind: 'memory', key: 'sectionRecall' },
    sectionRecallLoop: { kind: 'memory', key: 'sectionRecallLoop' },
    formArcRecall: { kind: 'memory', key: 'formArcRecall' },

    // --- Rhythm ---
    rhythmPlan: { kind: 'rhythm', key: 'plan' },
    rhythmicEntropy: { kind: 'rhythm', key: 'entropy' },
    deviceBuffer: { kind: 'rhythm', key: 'deviceBuffer' },
    embellishmentBuffer: { kind: 'rhythm', key: 'embellishmentBuffer' },

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
 * Apply a flat-keyed soloist payload to the nested state shape. Unknown keys
 * are written to the top level (preserves the legacy `instrumentStateMap[mod][param] = v`
 * behavior that some tests and scripts rely on for ad-hoc fields).
 */
function applySoloistPayload(target: typeof soloist, payload: Record<string, unknown>): void {
    const t = target as Mutable<typeof target>;
    for (const flatKey of Object.keys(payload)) {
        const route = SOLOIST_FIELD_ROUTES[flatKey];
        if (!route) {
            (t as any)[flatKey] = payload[flatKey];
            continue;
        }
        const value = payload[flatKey];
        switch (route.kind) {
            case 'config':
                (t as any)[route.key] = value;
                break;
            case 'session':
                (t.session as any)[route.key] = value;
                break;
            case 'phrasing':
                (t.session.phrasing as any)[route.key] = value;
                break;
            case 'currentPhrase':
                (t.session.currentPhrase as any)[route.key] = value;
                break;
            case 'memory':
                (t.session.memory as any)[route.key] = value;
                break;
            case 'rhythm':
                (t.session.rhythm as any)[route.key] = value;
                break;
            case 'contour':
                (t.session.contour as any)[route.key] = value;
                break;
            case 'audio':
                (t.audio as any)[route.key] = value;
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
            if (instrumentStateMap[modKey]) {
                instrumentStateMap[modKey][action.payload.param] = action.payload.value;
                return true;
            }
            break;
        }
        case ACTIONS.SET_MODAL_OPEN:
            return false;
        case ACTIONS.RESET_STATE: {
            c.enabled = true;
            c.volume = 1.0;
            c.reverb = INSTRUMENT_REVERB_DEFAULTS.chords;
            c.instrument = 'Clean';
            c.octave = 65;
            c.density = 'standard';
            c.voice = 'synth';

            b.enabled = true;
            b.volume = 1.0;
            b.reverb = INSTRUMENT_REVERB_DEFAULTS.bass;
            b.octave = 38;
            b.style = 'smart';
            b.voice = 'synth';

            s.enabled = false;
            s.voice = 'synth';
            s.preset = 'trumpet';
            s.volume = 1.0;
            s.reverb = INSTRUMENT_REVERB_DEFAULTS.soloist;
            s.octave = 72;
            s.style = 'smart';
            s.mode = 'monophonic';
            s.complexity = 0.5;
            s.tradeMode = 'manual';
            s.motifTracking = false;
            s.phrasingIntensity = 0.5;
            // why: Epic 12 S3 — keep historical auto-rotation as the post-
            // reset default; a user re-pins via UPDATE_SB after reset.
            s.pinnedProfile = null;
            // Reset engine runtime to a fresh session.
            const session = s.session as Mutable<typeof s.session>;
            const phr = session.phrasing as Mutable<typeof session.phrasing>;
            const cp = session.currentPhrase as Mutable<typeof session.currentPhrase>;
            const cpCtx = cp.context as Mutable<typeof cp.context>;
            const mem = session.memory as Mutable<typeof session.memory>;
            const rhy = session.rhythm as Mutable<typeof session.rhythm>;
            const con = session.contour as Mutable<typeof session.contour>;
            session.seed = null;
            session.hook = null;
            session.sessionSteps = 0;
            session.phraseCount = 0;
            session.tension = 0;
            session.lastSmartStyle = 'scalar';
            phr.state = 'rest';
            phr.isResting = true;
            phr.transitionState = null;
            phr.restSteps = 0;
            phr.activeSteps = 0;
            phr.busySteps = 0;
            phr.isWaitingForEntry = false;
            phr.isYielding = false;
            phr.lastAttackStep = -100;
            cp.startStep = null;
            cp.loopCount = null;
            cp.sectionLabel = null;
            cp.sectionOccurrence = 0;
            cp.notesInPhrase = 0;
            cpCtx.role = 'call';
            cpCtx.skeleton = [];
            cpCtx.lastInterval = null;
            cpCtx.profile = 'srv';
            cpCtx.signature = null;
            cpCtx.responseSignature = null;
            cpCtx.responseMode = 'free';
            cpCtx.responseSource = 'free';
            cpCtx.sectionLabel = null;
            cpCtx.sectionOccurrence = 0;
            cpCtx.srdcState = 'statement';
            cpCtx.restatementEcho = null;
            mem.recentNotes = [];
            mem.hookBuffer = [];
            mem.sharedHookBuffer = [];
            mem.rhythmicMotif = [];
            mem.sectionRecall = {};
            mem.sectionRecallLoop = null;
            mem.formArcRecall = {};
            rhy.plan = [];
            rhy.entropy = 0;
            rhy.deviceBuffer = [];
            rhy.embellishmentBuffer = [];
            con.trend = 'Static';
            con.direction = 1;
            con.steps = 0;
            // why: the `audio` runtime carries cross-call voice-leading state —
            // `lastMidiPlayed` feeds the pitch engine's interval decision at
            // soloist-pitch-engine.ts (`const lastMidi = audio.lastMidiPlayed`).
            // Every other session.* field was rebuilt above but `audio` was
            // skipped, so a transport reset left the soloist voice-leading off
            // the previous session's final pitch (and leaked it across seeded
            // determinism-test runs). activeVoices/buffer are main-thread synth
            // tracking — left to the synth's own lifecycle, not reset here.
            const aud = s.audio as Mutable<typeof s.audio>;
            aud.lastFreq = null;
            aud.lastMidiPlayed = null;
            aud.lastRenderedFreq = null;
            aud.lastPlayedFreq = null;
            aud.lastNoteEnd = 0;

            h.enabled = false;
            h.volume = 1.0;
            h.reverb = INSTRUMENT_REVERB_DEFAULTS.harmony;
            h.octave = 60;
            h.style = 'smart';
            h.complexity = 0.5;
            h.voice = 'synth';
            return true;
        }
        case ACTIONS.SET_STYLE:
            if (instrumentStateMap[action.payload.module]) {
                instrumentStateMap[action.payload.module].style = action.payload.style;
            }
            return true;
        case ACTIONS.SET_DENSITY:
            c.density = action.payload;
            return true;
        case ACTIONS.SET_VOLUME:
            if (instrumentStateMap[action.payload.module]) {
                instrumentStateMap[action.payload.module].volume = action.payload.value;
            }
            return true;
        case ACTIONS.SET_REVERB:
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
                return true;
            }
            break;
        }
        case ACTIONS.RESET_SESSION:
            (s.session as Mutable<typeof s.session>).sessionSteps = 0;
            return true;
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
        case ACTIONS.UPDATE_CONDUCTOR_DECISION:
            if (action.payload.density) {
                c.density = action.payload.density;
            }
            if (action.payload.hookProb) {
                s.hookRetentionProb = action.payload.hookProb;
            }
            return true;
        case ACTIONS.UPDATE_HB:
            for (const key in action.payload) {
                if (Object.hasOwn(harmony, key)) {
                    (harmony as any)[key] = (action.payload as any)[key];
                }
            }
            return true;
        case ACTIONS.UPDATE_SB:
            applySoloistPayload(soloist, action.payload as Record<string, unknown>);
            return true;
    }
    return false;
}
