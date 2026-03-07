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
    leadSheetMelody: [],
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

export function setChordsParam(param, value) {
    switch (param) {
        case 'enabled':
            chords.enabled = value;
            break;
        case 'volume':
            chords.volume = value;
            break;
        case 'reverb':
            chords.reverb = value;
            break;
        case 'instrument':
            chords.instrument = value;
            break;
        case 'filterCutoff':
            chords.filterCutoff = value;
            break;
        case 'attack':
            chords.attack = value;
            break;
        case 'release':
            chords.release = value;
            break;
        case 'sustain':
            chords.sustain = value;
            break;
        case 'shape':
            chords.shape = value;
            break;
        case 'delay':
            chords.delay = value;
            break;
        case 'compingStyle':
            chords.compingStyle = value;
            break;
        case 'inversionStrategy':
            chords.inversionStrategy = value;
            break;
        case 'humanizeVoiceLeading':
            chords.humanizeVoiceLeading = value;
            break;
        case 'drive':
            chords.drive = value;
            break;
        case 'tremoloRate':
            chords.tremoloRate = value;
            break;
        case 'tremoloDepth':
            chords.tremoloDepth = value;
            break;
        case 'chorusRate':
            chords.chorusRate = value;
            break;
        case 'chorusDepth':
            chords.chorusDepth = value;
            break;
        case 'octaveShift':
            chords.octaveShift = value;
            break;
        default:
            console.warn(`[State] Unknown chords param: ${param}`);
            break;
    }
}

export function setBassParam(param, value) {
    switch (param) {
        case 'enabled':
            bass.enabled = value;
            break;
        case 'volume':
            bass.volume = value;
            break;
        case 'reverb':
            bass.reverb = value;
            break;
        case 'instrument':
            bass.instrument = value;
            break;
        case 'pattern':
            bass.pattern = value;
            break;
        case 'octave':
            bass.octave = value;
            break;
        case 'glide':
            bass.glide = value;
            break;
        case 'drive':
            bass.drive = value;
            break;
        case 'release':
            bass.release = value;
            break;
        case 'pocketOffset':
            bass.pocketOffset = value;
            break;
        default:
            console.warn(`[State] Unknown bass param: ${param}`);
            break;
    }
}

export function setSoloistParam(param, value) {
    switch (param) {
        case 'enabled':
            soloist.enabled = value;
            break;
        case 'volume':
            soloist.volume = value;
            break;
        case 'reverb':
            soloist.reverb = value;
            break;
        case 'instrument':
            soloist.instrument = value;
            break;
        case 'drive':
            soloist.drive = value;
            break;
        case 'delay':
            soloist.delay = value;
            break;
        case 'chorus':
            soloist.chorus = value;
            break;
        case 'density':
            soloist.density = value;
            break;
        case 'syncopation':
            soloist.syncopation = value;
            break;
        case 'motifRange':
            soloist.motifRange = value;
            break;
        case 'isResting':
            soloist.isResting = value;
            break;
        case 'currentPhraseSteps':
            soloist.currentPhraseSteps = value;
            break;
        case 'lastNoteMidi':
            soloist.lastNoteMidi = value;
            break;
        case 'isWaitingForEntry':
            soloist.isWaitingForEntry = value;
            break;
        case 'isYielding':
            soloist.isYielding = value;
            break;
        default:
            console.warn(`[State] Unknown soloist param: ${param}`);
            break;
    }
}

export function setHarmonyParam(param, value) {
    switch (param) {
        case 'enabled':
            harmony.enabled = value;
            break;
        case 'volume':
            harmony.volume = value;
            break;
        case 'reverb':
            harmony.reverb = value;
            break;
        case 'instrument':
            harmony.instrument = value;
            break;
        case 'style':
            harmony.style = value;
            break;
        case 'voices':
            harmony.voices = value;
            break;
        case 'density':
            harmony.density = value;
            break;
        case 'attack':
            harmony.attack = value;
            break;
        case 'release':
            harmony.release = value;
            break;
        case 'filterCutoff':
            harmony.filterCutoff = value;
            break;
        case 'glide':
            harmony.glide = value;
            break;
        case 'pocketOffset':
            harmony.pocketOffset = value;
            break;
        default:
            console.warn(`[State] Unknown harmony param: ${param}`);
            break;
    }
}

export function instrumentReducer(action, payload) {
    switch (action) {
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
