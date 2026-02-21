import { ACTIONS } from '../types.js';

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
    activeTab: 'smart'
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
    lastBassGain: null
};

/**
 * @typedef {Object} SoloistState
 * @property {boolean} enabled - Whether the soloist is active.
 * @property {number} volume - Mix volume (0.0 - 1.0).
 * @property {string} preset - The synth sound profile ('classic', 'neo', 'vowel').
 * @property {string} mode - The soloist mode ('monophonic', 'guitar', 'piano').
 */
export const soloist = {
    enabled: false,
    preset: 'neo',
    volume: 0.5,
    reverb: 0.6,
    lastFreq: null,
    lastPlayedFreq: null,
    buffer: new Map(),
    lastNoteEnd: 0,
    octave: 64,
    style: 'smart',
    direction: 1,
    melodicTrend: 'Static',
    contourSteps: 0,
    currentPhraseSteps: 0,
    notesInPhrase: 0,
    qaState: 'Question',
    srdcState: 'Conclusion',
    isResting: false,
    currentCell: [1, 0, 1, 0],
    busySteps: 0,
    motifBuffer: [],
    hookBuffer: [],
    isReplayingMotif: false,
    motifReplayIndex: 0,
    hookRetentionProb: 0.4,
    sharedHookBuffer: [], // Shared hooks for band interaction
    tension: 0,
    mode: 'monophonic',
    doubleStopProb: 1.0,
    activeVoices: [],
    sessionSteps: 0,
    deviceBuffer: [],
    activeTab: 'smart',
    pitchHistory: [],
    stagnationCount: 0,
    lastInterval: 0,
    complexity: 0.5,
    tradeMode: 'manual',
    isWaitingForEntry: false,
    isYielding: false
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
    activeTab: 'smart'
};

const instrumentStateMap = {
    cb: chords, chords,
    bb: bass, bass,
    sb: soloist, soloist,
    hb: harmony, harmony
};

export function instrumentReducer(action, payload) {
    switch (action) {
        case ACTIONS.RESET_STATE:
            Object.assign(chords, {
                enabled: true, volume: 0.5, reverb: 0.3, instrument: 'Clean', octave: 65, density: 'standard', pianoRoots: false, activeTab: 'smart'
            });
            Object.assign(bass, {
                enabled: true, volume: 0.45, reverb: 0.05, octave: 38, style: 'smart', activeTab: 'smart'
            });
            Object.assign(soloist, {
                enabled: false, preset: 'neo', volume: 0.5, reverb: 0.6, octave: 72, style: 'smart', activeTab: 'smart', mode: 'monophonic', complexity: 0.5, tradeMode: 'manual', isWaitingForEntry: false, isYielding: false
            });
            Object.assign(harmony, {
                enabled: false, volume: 0.4, reverb: 0.4, octave: 60, style: 'smart', complexity: 0.5, activeTab: 'smart'
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
            if (payload.chord) Object.assign(chords, { style: payload.chord, activeTab: 'smart' });
            if (payload.bass) Object.assign(bass, { style: payload.bass, activeTab: 'smart' });
            if (payload.soloist) Object.assign(soloist, { style: payload.soloist, activeTab: 'smart' });
            if (payload.harmony) Object.assign(harmony, { style: payload.harmony, activeTab: 'smart' });
            return true;
        case ACTIONS.UPDATE_CONDUCTOR_DECISION:
            if (payload.density) Object.assign(chords, { density: payload.density });
            if (payload.hookProb) Object.assign(soloist, { hookRetentionProb: payload.hookProb });
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
    }
    return false;
}
