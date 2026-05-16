import { deepSignal } from 'deepsignal';
import { resolveSoloistMode } from '../engine/soloist-mode-policy.js';
import type {
    Action,
    BassState,
    ChordState,
    HarmonyState,
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
            chords.enabled = true;
            chords.volume = 1.0;
            chords.reverb = INSTRUMENT_REVERB_DEFAULTS.chords;
            chords.instrument = 'Clean';
            chords.octave = 65;
            chords.density = 'standard';

            bass.enabled = true;
            bass.volume = 1.0;
            bass.reverb = INSTRUMENT_REVERB_DEFAULTS.bass;
            bass.octave = 38;
            bass.style = 'smart';

            soloist.enabled = false;
            soloist.preset = 'trumpet';
            soloist.volume = 1.0;
            soloist.reverb = INSTRUMENT_REVERB_DEFAULTS.soloist;
            soloist.octave = 72;
            soloist.style = 'smart';
            soloist.mode = 'monophonic';
            soloist.complexity = 0.5;
            soloist.tradeMode = 'manual';
            soloist.isWaitingForEntry = false;
            soloist.isYielding = false;
            soloist.motifTracking = false;
            soloist.seed = '';
            soloist.sessionSeed = null;
            soloist.phrasingIntensity = 0.5;
            soloist.busySteps = 0;
            soloist.sessionSteps = 0;
            soloist.phraseCount = 0;
            soloist.isResting = true;
            soloist.restSteps = 0;
            soloist.activeSteps = 0;
            soloist.rhythmicEntropy = 0;
            soloist.rhythmPlan = [];
            soloist.deviceBuffer = [];
            soloist.embellishmentBuffer = [];
            soloist.hookBuffer = [];
            soloist.sharedHookBuffer = [];
            soloist.recentNotes = [];
            soloist.phraseStartStep = null;
            soloist.phraseLoopCount = null;
            soloist.phraseSectionLabel = null;
            soloist.phraseSectionOccurrence = 0;
            soloist.sectionRecall = {};
            soloist.sectionRecallLoop = null;
            soloist.formArcRecall = {};
            soloist.phraseContext.role = 'call';
            soloist.phraseContext.skeleton = [];
            soloist.phraseContext.lastInterval = null;
            soloist.phraseContext.profile = 'srv';
            soloist.phraseContext.signature = null;
            soloist.phraseContext.responseSignature = null;
            soloist.phraseContext.responseMode = 'free';
            soloist.phraseContext.responseSource = 'free';
            soloist.phraseContext.sectionLabel = null;
            soloist.phraseContext.sectionOccurrence = 0;

            harmony.enabled = false;
            harmony.volume = 1.0;
            harmony.reverb = INSTRUMENT_REVERB_DEFAULTS.harmony;
            harmony.octave = 60;
            harmony.style = 'smart';
            harmony.complexity = 0.5;
            return true;
        case ACTIONS.SET_STYLE:
            if (instrumentStateMap[action.payload.module]) {
                instrumentStateMap[action.payload.module].style = action.payload.style;
            }
            return true;
        case ACTIONS.SET_DENSITY:
            chords.density = action.payload;
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
            soloist.mode = resolveSoloistMode(action.payload);
            return true;
        case ACTIONS.SET_SOLOIST_SEED:
            soloist.seed = action.payload;
            return true;
        case ACTIONS.SET_SOLOIST_PRESET:
            soloist.preset = action.payload;
            return true;
        case ACTIONS.RESET_SESSION:
            soloist.sessionSteps = 0;
            return true;
        case ACTIONS.SET_GENRE_FEEL:
            if (action.payload.chord) {
                chords.style = action.payload.chord;
            }
            if (action.payload.bass) {
                bass.style = action.payload.bass;
            }
            if (action.payload.soloist) {
                soloist.style = action.payload.soloist;
            }
            if (action.payload.harmony) {
                harmony.style = action.payload.harmony;
            }
            return true;
        case ACTIONS.UPDATE_CONDUCTOR_DECISION:
            if (action.payload.density) {
                chords.density = action.payload.density;
            }
            if (action.payload.hookProb) {
                soloist.hookRetentionProb = action.payload.hookProb;
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
