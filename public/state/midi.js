import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} MidiState
 * @property {boolean} enabled - Whether Web MIDI output is active.
 * @property {Array<{id: string, name: string}>} outputs - List of available MIDI output ports.
 * @property {string|null} selectedOutputId - The ID of the currently selected MIDI output.
 * @property {number} chordsChannel - MIDI channel for Chords (1-16).
 * @property {number} bassChannel - MIDI channel for Bass (1-16).
 * @property {number} soloistChannel - MIDI channel for Soloist (1-16).
 * @property {number} harmonyChannel - MIDI channel for Harmonies (1-16).
 * @property {number} drumsChannel - MIDI channel for Drums (1-16).
 * @property {number} latency - Global MIDI latency offset in ms.
 * @property {boolean} muteLocal - Whether to mute internal audio when MIDI is active.
 * @property {number} chordsOctave - Octave offset for chords.
 * @property {number} bassOctave - Octave offset for bass.
 * @property {number} soloistOctave - Octave offset for soloist.
 * @property {number} harmonyOctave - Octave offset for harmonies.
 * @property {number} drumsOctave - Octave offset for drums.
 * @property {number} velocitySensitivity - Velocity scaling factor.
 */
export const midi = {
    enabled: false,
    outputs: [],
    selectedOutputId: null,
    chordsChannel: 1,
    bassChannel: 2,
    soloistChannel: 3,
    harmonyChannel: 4,
    drumsChannel: 10,
    latency: 0,
    muteLocal: true,
    chordsOctave: 0,
    bassOctave: 0,
    soloistOctave: 0,
    harmonyOctave: 0,
    drumsOctave: 0,
    velocitySensitivity: 1.0,
};

export function setMidiParam(param, value) {
    switch (param) {
        case 'enabled':
            midi.enabled = value;
            break;
        case 'inputs':
            midi.inputs = value;
            break;
        case 'outputs':
            midi.outputs = value;
            break;
        case 'selectedOutputId':
            midi.selectedOutputId = value;
            break;
        case 'learningState':
            midi.learningState = value;
            break;
        case 'learnedMappings':
            midi.learnedMappings = value;
            break;
        case 'ccValues':
            midi.ccValues = value;
            break;
        case 'syncOut':
            midi.syncOut = value;
            break;
        case 'channels':
            midi.channels = value;
            break;
        case 'access':
            midi.access = value;
            break;
        case 'noteToEngineMap':
            midi.noteToEngineMap = value;
            break;
        default:
            console.warn(`[State] Unknown midi param: ${param}`);
            break;
    }
}

export function midiReducer(action, payload) {
    switch (action) {
        case ACTIONS.SET_MIDI_CONFIG:
            Object.assign(midi, payload);
            return true;
    }
    return false;
}
