import { deepSignal } from 'deepsignal';
import { KEY_ORDER } from '../config.js';
import { ACTIONS } from '../types.js';
import { arranger } from './arranger.js';

/**
 * @typedef {Object} ChordState
 * @property {boolean} enabled - Whether the accompanist is active.
 * @property {string} style - The comping style ('smart', 'pad', etc).
 * @property {number} volume - Output gain multiplier.
 * @property {number} reverb - Reverb send amount.
 * @property {number} octave - Base MIDI octave for voicing.
 * @property {string} density - Voicing density ('thin', 'standard', 'rich').
 * @property {boolean} pianoRoots - Whether the piano should play roots even if bass is enabled.
 * @property {number|null} lastActiveChordIndex - Index of the currently playing chord (UI).
 * @property {number|null} scheduledChordIndex - Index of the last scheduled chord (Internal).
 * @property {Map<number, any>} buffer - Scheduled notes buffer.
 * @property {number} rhythmicMask - 16-bit mask of the current comping pattern.
 * @property {string} activeTab - Currently active UI tab ('classic' or 'smart').
 * @property {string} [instrument] - Optional instrument name.
 */
/** @type {import('deepsignal').DeepSignal<ChordState>} */
export const chords = deepSignal({
    enabled: true,
    style: 'smart',
    volume: 0.5,
    reverb: 0.3,
    octave: 65,
    density: 'standard',
    pianoRoots: false,
    lastActiveChordIndex: null,
    scheduledChordIndex: null,
    buffer: new Map(),
    rhythmicMask: 0,
    activeTab: 'smart',
    instrument: 'Clean',
});

/**
 * @typedef {Object} BassState
 * @property {boolean} enabled - Whether the bass engine is active.
 * @property {number} volume - Volume level.
 * @property {number} reverb - Reverb level.
 * @property {number|null} lastFreq - Frequency of the last played note.
 * @property {number|null} lastPlayedFreq - Frequency of the note currently ringing.
 * @property {Map<number, any>} buffer - Map of scheduled notes from the worker.
 * @property {number} octave - Base MIDI octave.
 * @property {string} style - Playing style ID (e.g., 'walking', 'funk').
 * @property {number} busySteps - Counter for "busy" playing periods.
 * @property {string} activeTab - Currently active UI tab.
 * @property {GainNode|null} lastBassGain - Last gain node for dynamic continuity.
 */
/** @type {import('deepsignal').DeepSignal<BassState>} */
export const bass = deepSignal({
    enabled: true,
    volume: 0.45,
    reverb: 0.05,
    lastFreq: null,
    lastPlayedFreq: null,
    buffer: new Map(),
    octave: 38,
    style: 'smart',
    busySteps: 0,
    activeTab: 'smart',
    lastBassGain: null,
});

/**
 * @typedef {Object} SoloistState
 * @property {boolean} enabled - Whether the soloist is active.
 * @property {number} volume - Mix volume (0.0 - 1.0).
 * @property {number} reverb - Reverb level.
 * @property {string} preset - The synth sound profile ('classic', 'neo', 'vowel').
 * @property {string} mode - The soloist mode ('monophonic', 'guitar', 'piano').
 * @property {number} phrasingIntensity - Slider for how dynamic/articulated the phrasing is.
 * @property {number} hookRetentionProb - Probability of retaining a hook motif.
 * @property {Array<any>} leadSheetMelody - Imported melody array.
 * @property {Array<any>} rhythmPlan - Planned rhythmic phrase.
 * @property {Array<any>} deviceBuffer - Buffer for melodic embellishments.
 * @property {Array<any>} embellishmentBuffer - Buffer for melodic embellishments.
 * @property {Array<any>} hookBuffer - Short term hook memory.
 * @property {Array<any>} sharedHookBuffer - Hooks shared from other instruments.
 * @property {number} sessionSteps - Total steps played in current session.
 * @property {string} tradeMode - Mode for trading fours ('manual', 'auto').
 * @property {boolean} isWaitingForEntry - Whether waiting to start a phrase.
 * @property {boolean} isYielding - Whether yielding space to other instruments.
 * @property {boolean} motifTracking - Whether tracking motifs is enabled.
 * @property {number} phraseCount - Total phrases played.
 * @property {number} notesInPhrase - Number of notes played in the current phrase.
 * @property {number} rhythmicEntropy - Entropy level of the current rhythm.
 * @property {number|null} lastFreq - Last frequency played.
 * @property {number|null} lastPlayedFreq - Last frequency sent to visualizer.
 * @property {number|null} lastRenderedFreq - Last frequency sent to visualizer.
 * @property {number} tension - Current melodic tension level.
 * @property {number} activeSteps - Steps the soloist has been active.
 * @property {number} restSteps - Steps the soloist has been resting.
 * @property {boolean} isResting - Whether currently resting.
 * @property {number} contourSteps - Steps matching current melodic trend.
 * @property {string} melodicTrend - Current contour direction ('Up', 'Down', 'Static').
 * @property {number} direction - Melodic direction multiplier.
 * @property {number} complexity - Local complexity level.
 * @property {number} lastAttackStep - Step of the last note attack.
 * @property {string} phrasingState - Current state in the phrasing lifecycle.
 * @property {any} motifCache - Cached motif data.
 * @property {Array<any>} rhythmicMotif - Current rhythmic motif.
 * @property {Array<any>} lickDictionary - Dictionary of loaded licks.
 * @property {Array<any>} recentNotes - Recently played notes.
 * @property {number|null} phraseStartStep - Step when the current phrase started.
 * @property {any} phraseContext - Context data for the current phrase.
 * @property {number} doubleStopProb - Probability of playing double stops.
 * @property {Array<any>} activeVoices - Active polyphonic voices.
 * @property {number|null} lastMidiPlayed - Last MIDI note value played.
 * @property {string} [style] - Optional playing style.
 * @property {string} [activeTab] - Optional active UI tab.
 * @property {Map<number, any>} buffer - Map of scheduled notes from the worker.
 * @property {number} octave - Base MIDI octave.
 * @property {number} lastNoteEnd - Last note end time.
 * @property {number} busySteps - Optional busy steps counter.
 * @property {string|null} transitionState - Phrasing transition state.
 * @property {number} notesInPhrase - Current phrase note counter.
 * @property {string} lastSmartStyle - Last active smart style.
 */
/** @type {import('deepsignal').DeepSignal<SoloistState>} */
export const soloist = deepSignal({
    enabled: false,
    preset: 'trumpet',
    volume: 0.5,
    reverb: 0.6,
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
    rhythmicMotif: [], // Template for current phrase
    lickDictionary: [],
    recentNotes: [],
    phraseStartStep: null,
    phraseContext: {
        role: 'call',
        skeleton: [],
        lastInterval: null,
        profile: 'srv', // 'srv', 'monk', 'armstrong', 'miles'
    },
    busySteps: 0,
    transitionState: null,
    notesInPhrase: 0,
    lastSmartStyle: 'scalar',
    hookBuffer: [],
    sharedHookBuffer: [], // Shared hooks for band interaction
    tension: 0,
    mode: 'monophonic',
    doubleStopProb: 1.0,
    activeVoices: [],
    sessionSteps: 0,
    deviceBuffer: [],
    activeTab: 'smart',
    lastMidiPlayed: null,
    lastFreq: null,
    lastRenderedFreq: null,
    complexity: 0.5,
    tradeMode: 'manual',
    isWaitingForEntry: false,
    isYielding: false,
    motifTracking: false,
    leadSheetMelody: [],
    phrasingIntensity: 0.5,
    phraseCount: 0,
    rhythmicEntropy: 0,
    hookRetentionProb: 0.5,
    rhythmPlan: [],
    embellishmentBuffer: [],
});

/**
 * @typedef {Object} HarmonyState
 * @property {boolean} enabled - Whether the harmony engine is active.
 * @property {number} volume - Volume level.
 * @property {number} reverb - Reverb level.
 * @property {Map<number, any>} buffer - Map of scheduled notes from the worker.
 * @property {number} octave - Base MIDI octave.
 * @property {string} style - Playing style ID (e.g., 'horns', 'strings').
 * @property {number} complexity - Local complexity override (0.0 - 1.0).
 * @property {Array<any>} motifBuffer - Short-term memory for current section hooks.
 * @property {number} rhythmicMask - 16-bit mask of the current rhythmic motif (16th notes).
 * @property {string} activeTab - Currently active UI tab.
 * @property {Array<number>} lastMidis - Array of recently played MIDI notes.
 * @property {Array<any>} activeVoices - Currently playing polyphonic voices.
 * @property {number} pocketOffset - Current micro-timing offset.
 */
/** @type {import('deepsignal').DeepSignal<HarmonyState>} */
export const harmony = deepSignal({
    enabled: false,
    volume: 0.4,
    reverb: 0.4,
    buffer: new Map(),
    octave: 60,
    style: 'smart',
    complexity: 0.5,
    motifBuffer: [],
    lastMidis: [],
    activeVoices: [],
    rhythmicMask: 0,
    activeTab: 'smart',
    pocketOffset: 0,
});

/**
 * @type {Record<string, any>}
 */
const instrumentStateMap = {
    cb: chords,
    chords,
    bb: bass,
    bass,
    sb: soloist,
    soloist,
    hb: harmony,
    harmony,
};

/**
 * @param {string} action
 * @param {any} payload
 */
export function instrumentReducer(action, payload) {
    switch (action) {
        case ACTIONS.SET_PARAM: {
            // Unify "harmonies" vs "harmony"
            const modKey = payload.module === 'harmonies' ? 'harmony' : payload.module;
            if (instrumentStateMap[modKey]) {
                instrumentStateMap[modKey][payload.param] = payload.value;
                return true;
            }
            break;
        }
        case ACTIONS.SET_MODAL_OPEN:
            if (payload.modal === 'performance' && payload.open) {
                soloist.buffer.clear();
                return true;
            }
            return false;
        case ACTIONS.IMPORT_MUSICXML: {
            const currentKey = arranger.key;
            const xmlKey = payload.xmlKey || 'C';

            let transposedMelody = payload.leadSheetMelody;
            const currentIdx = KEY_ORDER.indexOf(currentKey);
            const xmlIdx = KEY_ORDER.indexOf(xmlKey);

            if (currentIdx !== -1 && xmlIdx !== -1 && currentIdx !== xmlIdx) {
                const interval = currentIdx - xmlIdx;
                transposedMelody = payload.leadSheetMelody.map((/** @type {any} */ n) => ({
                    ...n,
                    midi: n.midi + interval,
                }));
            }

            soloist.leadSheetMelody = transposedMelody;
            soloist.style = 'lead_sheet';
            soloist.enabled = true;
            break;
        }
        case ACTIONS.CLEAR_LEAD_SHEET:
            soloist.leadSheetMelody = [];
            soloist.style = soloist.lastSmartStyle || 'smart';
            break;
        case ACTIONS.RESET_STATE:
            chords.enabled = true;
            chords.volume = 0.5;
            chords.reverb = 0.3;
            chords.instrument = 'Clean';
            chords.octave = 65;
            chords.density = 'standard';
            chords.pianoRoots = false;
            chords.activeTab = 'smart';

            bass.enabled = true;
            bass.volume = 0.45;
            bass.reverb = 0.05;
            bass.octave = 38;
            bass.style = 'smart';
            bass.activeTab = 'smart';

            soloist.enabled = false;
            soloist.preset = 'trumpet';
            soloist.volume = 0.5;
            soloist.reverb = 0.6;
            soloist.octave = 72;
            soloist.style = 'smart';
            soloist.activeTab = 'smart';
            soloist.mode = 'monophonic';
            soloist.complexity = 0.5;
            soloist.tradeMode = 'manual';
            soloist.isWaitingForEntry = false;
            soloist.isYielding = false;
            soloist.motifTracking = false;
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
            soloist.phraseContext.role = 'call';
            soloist.phraseContext.skeleton = [];
            soloist.phraseContext.lastInterval = null;
            soloist.phraseContext.profile = 'srv';

            harmony.enabled = false;
            harmony.volume = 0.4;
            harmony.reverb = 0.4;
            harmony.octave = 60;
            harmony.style = 'smart';
            harmony.complexity = 0.5;
            harmony.activeTab = 'smart';
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
        case ACTIONS.SET_OCTAVE:
            if (instrumentStateMap[payload.module]) {
                instrumentStateMap[payload.module].octave = payload.value;
            }
            return true;
        case ACTIONS.SET_PIANO_ROOTS:
            chords.pianoRoots = payload;
            return true;
        case ACTIONS.SET_SOLOIST_MODE:
            soloist.mode = payload;
            return true;
        case ACTIONS.SET_SOLOIST_PRESET:
            soloist.preset = payload;
            return true;
        case ACTIONS.RESET_SESSION:
            soloist.sessionSteps = 0;
            return true;
        case ACTIONS.SET_SESSION_STEPS:
            soloist.sessionSteps = payload;
            return true;
        case ACTIONS.SET_GENRE_FEEL:
            // When a smart genre is selected, update all instrument styles and switch to smart mode
            if (payload.chord) {
                chords.style = payload.chord;
                chords.activeTab = 'smart';
            }
            if (payload.bass) {
                bass.style = payload.bass;
                bass.activeTab = 'smart';
            }
            if (payload.soloist) {
                soloist.style = payload.soloist;
                soloist.activeTab = 'smart';
            }
            if (payload.harmony) {
                harmony.style = payload.harmony;
                harmony.activeTab = 'smart';
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
        case ACTIONS.SET_ACTIVE_TAB:
            if (payload.module === 'groove') {
                // We'll handle this in state.js or groove.js instead to avoid circularity
                return false;
            } else if (instrumentStateMap[payload.module]) {
                instrumentStateMap[payload.module].activeTab = payload.tab;
            }
            return true;
        case ACTIONS.UPDATE_HB:
            for (const key in payload) {
                if (Object.hasOwn(harmony, key)) {
                    /** @type {any} */ (harmony)[key] = payload[key];
                }
            }
            return true;
        case ACTIONS.UPDATE_SB:
            for (const key in payload) {
                if (Object.hasOwn(soloist, key)) {
                    /** @type {any} */ (soloist)[key] = payload[key];
                }
            }
            return true;
    }
    return false;
}
