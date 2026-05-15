import { deepSignal } from 'deepsignal';
import { resolveSoloistMode } from '../engine/soloist-mode-policy.js';
import { ACTIONS } from '../types.js';
import { groove } from './groove.js';

export const MIXER_SETTINGS_VERSION = 2;

export const INSTRUMENT_REVERB_DEFAULTS = Object.freeze({
    chords: 0.3,
    bass: 0.05,
    soloist: 0.6,
    harmony: 0.4,
    groove: 0.2,
});

export interface ChordState {
    /** Whether the accompanist is active. */
    enabled: boolean;
    /** The comping style ('smart', 'pad', etc). */
    style: string;
    /** Output gain multiplier. */
    volume: number;
    /** Reverb send amount. */
    reverb: number;
    /** Base MIDI octave for voicing. */
    octave: number;
    /** Voicing density ('thin', 'standard', 'rich'). */
    density: string;
    /** Index of the currently playing chord (UI). */
    lastActiveChordIndex: number | null;
    /** Index of the last scheduled chord (Internal). */
    scheduledChordIndex: number | null;
    /** Scheduled notes buffer. */
    buffer: Map<number, any>;
    /** 16-bit mask of the current comping pattern. */
    rhythmicMask: number;
    /** Optional instrument name. */
    instrument?: string;
}

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

export interface BassState {
    /** Whether the bass engine is active. */
    enabled: boolean;
    /** Volume level. */
    volume: number;
    /** Reverb level. */
    reverb: number;
    /** Frequency of the last played note. */
    lastFreq: number | null;
    /** Frequency of the note currently ringing. */
    lastPlayedFreq: number | null;
    /** Map of scheduled notes from the worker. */
    buffer: Map<number, any>;
    /** Base MIDI octave. */
    octave: number;
    /** Playing style ID (e.g., 'walking', 'funk'). */
    style: string;
    /** Counter for "busy" playing periods. */
    busySteps: number;
    /** Last MIDI note value played. */
    lastMidiPlayed: number | null;
    /** Last gain node for dynamic continuity. */
    lastBassGain: GainNode | null;
}

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

export interface SoloistSessionSeed {
    notes: any[];
    loopLengthSteps: number;
}

export interface SoloistPhraseContext {
    role: string;
    skeleton: any[];
    lastInterval: any;
    profile: string;
    signature: any;
    responseSignature: any;
    responseMode: 'free' | 'paraphrase' | 'development';
    responseSource: 'free' | 'form' | 'seed' | 'section' | 'recent';
    sectionLabel: string | null;
    sectionOccurrence: number;
}

export interface SoloistState {
    /** Whether the soloist is active. */
    enabled: boolean;
    /** Mix volume (0.0 - 1.0). */
    volume: number;
    /** Reverb level. */
    reverb: number;
    /** The synth sound profile ('neo', 'vowel', 'trumpet', 'saxophone'). */
    preset: string;
    /** The soloist mode ('monophonic' or 'guitar'; legacy piano normalizes to monophonic). */
    mode: string;
    /** Thematic seed for deterministic generation. */
    seed: string;
    /** Slider for how dynamic/articulated the phrasing is. */
    phrasingIntensity: number;
    /** Probability of retaining a hook motif. */
    hookRetentionProb: number;
    /** Seed melody for the current session. */
    sessionSeed: SoloistSessionSeed | null;
    /** Planned rhythmic phrase. */
    rhythmPlan: any[];
    /** Buffer for melodic embellishments. */
    deviceBuffer: any[];
    /** Buffer for melodic embellishments. */
    embellishmentBuffer: any[];
    /** Short term hook memory. */
    hookBuffer: any[];
    /** Hooks shared from other instruments. */
    sharedHookBuffer: any[];
    /** Total steps played in current session. */
    sessionSteps: number;
    /** Mode for trading fours ('manual', 'auto'). */
    tradeMode: string;
    /** Whether waiting to start a phrase. */
    isWaitingForEntry: boolean;
    /** Whether yielding space to other instruments. */
    isYielding: boolean;
    /** Whether tracking motifs is enabled. */
    motifTracking: boolean;
    /** Total phrases played. */
    phraseCount: number;
    /** Number of notes played in the current phrase. */
    notesInPhrase: number;
    /** Entropy level of the current rhythm. */
    rhythmicEntropy: number;
    /** Last frequency played. */
    lastFreq: number | null;
    /** Last frequency sent to visualizer. */
    lastPlayedFreq: number | null;
    /** Last frequency sent to visualizer. */
    lastRenderedFreq: number | null;
    /** Current melodic tension level. */
    tension: number;
    /** Steps the soloist has been active. */
    activeSteps: number;
    /** Steps the soloist has been resting. */
    restSteps: number;
    /** Whether currently resting. */
    isResting: boolean;
    /** Steps matching current melodic trend. */
    contourSteps: number;
    /** Current contour direction ('Up', 'Down', 'Static'). */
    melodicTrend: string;
    /** Melodic direction multiplier. */
    direction: number;
    /** Local complexity level. */
    complexity: number;
    /** Step of the last note attack. */
    lastAttackStep: number;
    /** Current state in the phrasing lifecycle. */
    phrasingState: string;
    /** Cached motif data. */
    motifCache: any;
    /** Current rhythmic motif. */
    rhythmicMotif: any[];
    /** Dictionary of loaded licks. */
    lickDictionary: any[];
    /** Recently played notes. */
    recentNotes: any[];
    /** Step when the current phrase started. */
    phraseStartStep: number | null;
    /** Loop index captured for the active phrase. */
    phraseLoopCount: number | null;
    /** Section label captured for the active phrase. */
    phraseSectionLabel: string | null;
    /** Section occurrence captured for the active phrase. */
    phraseSectionOccurrence: number;
    /** Per-loop section signatures keyed by section label. */
    sectionRecall: Record<string, any>;
    /** Loop number currently represented in sectionRecall. */
    sectionRecallLoop: number | null;
    /** Cross-loop section signatures keyed by section label. */
    formArcRecall: Record<string, any>;
    /** Context data for the current phrase. */
    phraseContext: SoloistPhraseContext;
    /** Probability of playing double stops. */
    doubleStopProb: number;
    /** Active polyphonic voices. */
    activeVoices: any[];
    /** Last MIDI note value played. */
    lastMidiPlayed: number | null;
    /** Optional playing style. */
    style?: string;
    /** Map of scheduled notes from the worker. */
    buffer: Map<number, any>;
    /** Base MIDI octave. */
    octave: number;
    /** Last note end time. */
    lastNoteEnd: number;
    /** Optional busy steps counter. */
    busySteps: number;
    /** Phrasing transition state. */
    transitionState: string | null;
    /** Last active smart style. */
    lastSmartStyle: string;
}

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

export interface HarmonyState {
    /** Whether the harmony engine is active. */
    enabled: boolean;
    /** Volume level. */
    volume: number;
    /** Reverb level. */
    reverb: number;
    /** Map of scheduled notes from the worker. */
    buffer: Map<number, any>;
    /** Base MIDI octave. */
    octave: number;
    /** Playing style ID (e.g., 'horns', 'strings'). */
    style: string;
    /** Local complexity override (0.0 - 1.0). */
    complexity: number;
    /** Short-term memory for current section hooks. */
    motifBuffer: any[];
    /** 16-bit mask of the current rhythmic motif (16th notes). */
    rhythmicMask: number;
    /** Array of recently played MIDI notes. */
    lastMidis: number[];
    /** Currently playing polyphonic voices. */
    activeVoices: any[];
    /** Current micro-timing offset. */
    pocketOffset: number;
}

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

export function instrumentReducer(action: string, payload: any): boolean {
    switch (action) {
        case ACTIONS.SET_PARAM: {
            const modKey = payload.module === 'harmonies' ? 'harmony' : payload.module;
            if (instrumentStateMap[modKey]) {
                instrumentStateMap[modKey][payload.param] = payload.value;
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
            if (instrumentStateMap[payload.module]) {
                instrumentStateMap[payload.module].style = payload.style;
            }
            return true;
        case ACTIONS.SET_DENSITY:
            chords.density = payload;
            return true;
        case ACTIONS.SET_VOLUME:
            if (instrumentStateMap[payload.module]) {
                instrumentStateMap[payload.module].volume = payload.value;
            }
            return true;
        case ACTIONS.SET_REVERB:
            if (instrumentStateMap[payload.module]) {
                instrumentStateMap[payload.module].reverb = payload.value;
            }
            return true;
        case ACTIONS.SET_SOLOIST_MODE:
            soloist.mode = resolveSoloistMode(payload);
            return true;
        case ACTIONS.SET_SOLOIST_SEED:
            soloist.seed = payload;
            return true;
        case ACTIONS.SET_SOLOIST_PRESET:
            soloist.preset = payload;
            return true;
        case ACTIONS.RESET_SESSION:
            soloist.sessionSteps = 0;
            return true;
        case ACTIONS.SET_GENRE_FEEL:
            if (payload.chord) {
                chords.style = payload.chord;
            }
            if (payload.bass) {
                bass.style = payload.bass;
            }
            if (payload.soloist) {
                soloist.style = payload.soloist;
            }
            if (payload.harmony) {
                harmony.style = payload.harmony;
            }
            return true;
        case ACTIONS.UPDATE_CONDUCTOR_DECISION:
            if (payload.density) {
                chords.density = payload.density;
            }
            if (payload.hookProb) {
                soloist.hookRetentionProb = payload.hookProb;
            }
            return true;
        case ACTIONS.UPDATE_HB:
            for (const key in payload) {
                if (Object.hasOwn(harmony, key)) {
                    (harmony as any)[key] = payload[key];
                }
            }
            return true;
        case ACTIONS.UPDATE_SB:
            for (const key in payload) {
                if (Object.hasOwn(soloist, key)) {
                    (soloist as any)[key] = payload[key];
                }
            }
            return true;
    }
    return false;
}
