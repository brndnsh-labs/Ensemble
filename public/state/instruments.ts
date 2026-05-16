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
    enabled: false,
    preset: 'trumpet',
    volume: 1.0,
    reverb: INSTRUMENT_REVERB_DEFAULTS.soloist,
    lastPlayedFreq: null,
    buffer: new Map(),
    lastNoteEnd: 0,
    octave: 72,
    style: 'smart',
    direction: 1,
    melodicTrend: 'Static',
    contourSteps: 0,
    isResting: true,
    restSteps: 0,
    activeSteps: 0,
    lastAttackStep: -100,
    phrasingState: 'rest',
    motifCache: null,
    rhythmicMotif: [],
    lickDictionary: [],
    recentNotes: [],
    phraseStartStep: null,
    phraseLoopCount: null,
    phraseSectionLabel: null,
    phraseSectionOccurrence: 0,
    sectionRecall: {},
    sectionRecallLoop: null,
    formArcRecall: {},
    phraseContext: {
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
    },
    busySteps: 0,
    transitionState: null,
    notesInPhrase: 0,
    lastSmartStyle: 'scalar',
    hookBuffer: [],
    sharedHookBuffer: [],
    tension: 0,
    mode: 'monophonic',
    doubleStopProb: 1.0,
    activeVoices: [],
    sessionSteps: 0,
    deviceBuffer: [],
    seed: '',
    lastMidiPlayed: null,
    lastFreq: null,
    lastRenderedFreq: null,
    complexity: 0.5,
    tradeMode: 'manual',
    isWaitingForEntry: false,
    isYielding: false,
    motifTracking: false,
    sessionSeed: null,
    phrasingIntensity: 0.5,
    phraseCount: 0,
    rhythmicEntropy: 0,
    hookRetentionProb: 0.5,
    rhythmPlan: [],
    embellishmentBuffer: [],
});

export const harmony = deepSignal<HarmonyState>({
    enabled: false,
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
            if (instrumentStateMap[modKey]) {
                instrumentStateMap[modKey][action.payload.param] = action.payload.value;
                return true;
            }
            break;
        }
        case ACTIONS.SET_MODAL_OPEN:
            return false;
        case ACTIONS.RESET_STATE:
            c.enabled = true;
            c.volume = 1.0;
            c.reverb = INSTRUMENT_REVERB_DEFAULTS.chords;
            c.instrument = 'Clean';
            c.octave = 65;
            c.density = 'standard';

            b.enabled = true;
            b.volume = 1.0;
            b.reverb = INSTRUMENT_REVERB_DEFAULTS.bass;
            b.octave = 38;
            b.style = 'smart';

            s.enabled = false;
            s.preset = 'trumpet';
            s.volume = 1.0;
            s.reverb = INSTRUMENT_REVERB_DEFAULTS.soloist;
            s.octave = 72;
            s.style = 'smart';
            s.mode = 'monophonic';
            s.complexity = 0.5;
            s.tradeMode = 'manual';
            s.isWaitingForEntry = false;
            s.isYielding = false;
            s.motifTracking = false;
            s.seed = '';
            s.sessionSeed = null;
            s.phrasingIntensity = 0.5;
            s.busySteps = 0;
            s.sessionSteps = 0;
            s.phraseCount = 0;
            s.isResting = true;
            s.restSteps = 0;
            s.activeSteps = 0;
            s.rhythmicEntropy = 0;
            s.rhythmPlan = [];
            s.deviceBuffer = [];
            s.embellishmentBuffer = [];
            s.hookBuffer = [];
            s.sharedHookBuffer = [];
            s.recentNotes = [];
            s.phraseStartStep = null;
            s.phraseLoopCount = null;
            s.phraseSectionLabel = null;
            s.phraseSectionOccurrence = 0;
            s.sectionRecall = {};
            s.sectionRecallLoop = null;
            s.formArcRecall = {};
            s.phraseContext.role = 'call';
            s.phraseContext.skeleton = [];
            s.phraseContext.lastInterval = null;
            s.phraseContext.profile = 'srv';
            s.phraseContext.signature = null;
            s.phraseContext.responseSignature = null;
            s.phraseContext.responseMode = 'free';
            s.phraseContext.responseSource = 'free';
            s.phraseContext.sectionLabel = null;
            s.phraseContext.sectionOccurrence = 0;

            h.enabled = false;
            h.volume = 1.0;
            h.reverb = INSTRUMENT_REVERB_DEFAULTS.harmony;
            h.octave = 60;
            h.style = 'smart';
            h.complexity = 0.5;
            return true;
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
        case ACTIONS.SET_SOLOIST_SEED:
            s.seed = action.payload;
            return true;
        case ACTIONS.SET_SOLOIST_PRESET:
            s.preset = action.payload;
            return true;
        case ACTIONS.RESET_SESSION:
            s.sessionSteps = 0;
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
            for (const key in action.payload) {
                if (Object.hasOwn(soloist, key)) {
                    (soloist as any)[key] = (action.payload as any)[key];
                }
            }
            return true;
    }
    return false;
}
