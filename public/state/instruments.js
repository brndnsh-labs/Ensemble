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
 * @property {Map<number, Object>} buffer - Scheduled notes buffer.
 * @property {number} rhythmicMask - 16-bit mask of the current comping pattern.
 * @property {string} activeTab - Currently active UI tab ('classic' or 'smart').
 */
export const chords = {
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
};

/**
 * @typedef {Object} BassState
 * @property {boolean} enabled - Whether the bass engine is active.
 * @property {number} volume - Volume level.
 * @property {number} reverb - Reverb level.
 * @property {number|null} lastFreq - Frequency of the last played note.
 * @property {number|null} lastPlayedFreq - Frequency of the note currently ringing.
 * @property {Map<number, Object>} buffer - Map of scheduled notes from the worker.
 * @property {number} octave - Base MIDI octave.
 * @property {string} style - Playing style ID (e.g., 'walking', 'funk').
 * @property {number} busySteps - Counter for "busy" playing periods.
 * @property {string} activeTab - Currently active UI tab.
 * @property {number|null} lastBassGain - Last velocity/gain value for dynamic continuity.
 */
export const bass = {
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
};

/**
 * @typedef {Object} SoloistState
 * @property {boolean} enabled - Whether the soloist is active.
 * @property {number} volume - Mix volume (0.0 - 1.0).
 * @property {string} preset - The synth sound profile ('classic', 'neo', 'vowel').
 * @property {string} mode - The soloist mode ('monophonic', 'guitar', 'piano').
 * @property {number} phrasingIntensity - Slider for how dynamic/articulated the phrasing is.
 * @property {number} hookRetentionProb - Probability of retaining a hook motif.
 * @property {Array<Object>} leadSheetMelody - Imported melody array.
 * @property {Array<Object>} rhythmPlan - Planned rhythmic phrase.
 * @property {Array<Object>} deviceBuffer - Buffer for melodic embellishments.
 * @property {Array<Object>} embellishmentBuffer - Buffer for melodic embellishments.
 * @property {Array<Object>} hookBuffer - Short term hook memory.
 * @property {Array<Object>} sharedHookBuffer - Hooks shared from other instruments.
 * @property {number} sessionSteps - Total steps played in current session.
 * @property {string} tradeMode - Mode for trading fours ('manual', 'auto').
 * @property {boolean} isWaitingForEntry - Whether waiting to start a phrase.
 * @property {boolean} isYielding - Whether yielding space to other instruments.
 * @property {boolean} motifTracking - Whether tracking motifs is enabled.
 * @property {number} phraseCount - Total phrases played.
 * @property {number} rhythmicEntropy - Entropy level of the current rhythm.
 * @property {number} lastFreq - Last frequency played.
 * @property {number} lastRenderedFreq - Last frequency sent to visualizer.
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
 * @property {Object} motifCache - Cached motif data.
 * @property {Array<Object>} rhythmicMotif - Current rhythmic motif.
 * @property {Array<Object>} lickDictionary - Dictionary of loaded licks.
 * @property {Array<Object>} recentNotes - Recently played notes.
 * @property {number} phraseStartStep - Step when the current phrase started.
 * @property {Object} phraseContext - Context data for the current phrase.
 * @property {number} doubleStopProb - Probability of playing double stops.
 * @property {Array<Object>} activeVoices - Active polyphonic voices.
 * @property {number} lastMidiPlayed - Last MIDI note value played.
 */
export const soloist = {
    enabled: false,
    preset: 'trumpet',
    volume: 0.5,
    reverb: 0.6,
    lastPlayedFreq: null,
    buffer: new Map(),
    lastNoteEnd: 0,
    octave: 64,
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
};

/**
 * @typedef {Object} HarmonyState
 * @property {boolean} enabled - Whether the harmony engine is active.
 * @property {number} volume - Volume level.
 * @property {number} reverb - Reverb level.
 * @property {Map<number, Object>} buffer - Map of scheduled notes from the worker.
 * @property {number} octave - Base MIDI octave.
 * @property {string} style - Playing style ID (e.g., 'horns', 'strings').
 * @property {number} complexity - Local complexity override (0.0 - 1.0).
 * @property {Array<Object>} motifBuffer - Short-term memory for current section hooks.
 * @property {number} rhythmicMask - 16-bit mask of the current rhythmic motif (16th notes).
 * @property {string} activeTab - Currently active UI tab.
 * @property {Array<number>} lastMidis - Array of recently played MIDI notes.
 * @property {number} pocketOffset - Current micro-timing offset.
 */
export const harmony = {
    enabled: false,
    volume: 0.4,
    reverb: 0.4,
    buffer: new Map(),
    octave: 60,
    style: 'smart',
    complexity: 0.5,
    motifBuffer: [],
    lastMidis: [],
    rhythmicMask: 0,
    activeTab: 'smart',
};

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
                transposedMelody = payload.leadSheetMelody.map((n) => ({
                    ...n,
                    midi: n.midi + interval,
                }));
            }

            Object.assign(soloist, {
                leadSheetMelody: transposedMelody,
                style: 'lead_sheet',
                enabled: true,
            });
            break;
        }
        case ACTIONS.CLEAR_LEAD_SHEET:
            Object.assign(soloist, {
                leadSheetMelody: [],
                style: soloist.lastSmartStyle || 'smart',
            });
            break;
        case ACTIONS.RESET_STATE:
            Object.assign(chords, {
                enabled: true,
                volume: 0.5,
                reverb: 0.3,
                instrument: 'Clean',
                octave: 65,
                density: 'standard',
                pianoRoots: false,
                activeTab: 'smart',
            });
            Object.assign(bass, {
                enabled: true,
                volume: 0.45,
                reverb: 0.05,
                octave: 38,
                style: 'smart',
                activeTab: 'smart',
            });
            Object.assign(soloist, {
                enabled: false,
                preset: 'trumpet',
                volume: 0.5,
                reverb: 0.6,
                octave: 72,
                style: 'smart',
                activeTab: 'smart',
                mode: 'monophonic',
                complexity: 0.5,
                tradeMode: 'manual',
                isWaitingForEntry: false,
                isYielding: false,
                motifTracking: false,
                phrasingIntensity: 0.5,
                busySteps: 0,
                sessionSteps: 0,
                phraseCount: 0,
                isResting: true,
                restSteps: 0,
                activeSteps: 0,
                rhythmicEntropy: 0,
                rhythmPlan: [],
                deviceBuffer: [],
                embellishmentBuffer: [],
                hookBuffer: [],
                sharedHookBuffer: [],
                phraseContext: {
                    role: 'call',
                    skeleton: [],
                    lastInterval: null,
                    profile: 'srv',
                },
            });
            Object.assign(harmony, {
                enabled: false,
                volume: 0.4,
                reverb: 0.4,
                octave: 60,
                style: 'smart',
                complexity: 0.5,
                activeTab: 'smart',
            });
            return true;
        case ACTIONS.SET_STYLE:
            if (instrumentStateMap[payload.module]) {
                Object.assign(instrumentStateMap[payload.module], { style: payload.style });
            }
            return true;
        case ACTIONS.SET_DENSITY:
            Object.assign(chords, { density: payload });
            return true;
        case ACTIONS.SET_VOLUME:
            if (instrumentStateMap[payload.module]) {
                Object.assign(instrumentStateMap[payload.module], { volume: payload.value });
            }
            return true;
        case ACTIONS.SET_REVERB:
            if (instrumentStateMap[payload.module]) {
                Object.assign(instrumentStateMap[payload.module], { reverb: payload.value });
            }
            return true;
        case ACTIONS.SET_OCTAVE:
            if (instrumentStateMap[payload.module]) {
                Object.assign(instrumentStateMap[payload.module], { octave: payload.value });
            }
            return true;
        case ACTIONS.SET_PIANO_ROOTS:
            Object.assign(chords, { pianoRoots: payload });
            return true;
        case ACTIONS.SET_SOLOIST_MODE:
            Object.assign(soloist, { mode: payload });
            return true;
        case ACTIONS.SET_SOLOIST_PRESET:
            Object.assign(soloist, { preset: payload });
            return true;
        case ACTIONS.RESET_SESSION:
            Object.assign(soloist, { sessionSteps: 0 });
            return true;
        case ACTIONS.SET_SESSION_STEPS:
            Object.assign(soloist, { sessionSteps: payload });
            return true;
        case ACTIONS.SET_GENRE_FEEL:
            // When a smart genre is selected, update all instrument styles and switch to smart mode
            if (payload.chord) {
                Object.assign(chords, { style: payload.chord, activeTab: 'smart' });
            }
            if (payload.bass) {
                Object.assign(bass, { style: payload.bass, activeTab: 'smart' });
            }
            if (payload.soloist) {
                Object.assign(soloist, { style: payload.soloist, activeTab: 'smart' });
            }
            if (payload.harmony) {
                Object.assign(harmony, { style: payload.harmony, activeTab: 'smart' });
            }
            return true;
        case ACTIONS.UPDATE_CONDUCTOR_DECISION:
            if (payload.density) {
                Object.assign(chords, { density: payload.density });
            }
            if (payload.hookProb) {
                Object.assign(soloist, { hookRetentionProb: payload.hookProb });
            }
            return true;
        case ACTIONS.SET_ACTIVE_TAB:
            if (payload.module === 'groove') {
                // We'll handle this in state.js or groove.js instead to avoid circularity
                return false;
            } else if (instrumentStateMap[payload.module]) {
                Object.assign(instrumentStateMap[payload.module], { activeTab: payload.tab });
            }
            return true;
        case ACTIONS.UPDATE_HB:
            Object.assign(harmony, payload);
            return true;
        case ACTIONS.UPDATE_SB:
            Object.assign(soloist, payload);
            return true;
    }
    return false;
}
