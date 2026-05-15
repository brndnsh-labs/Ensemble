import { deepSignal } from 'deepsignal';
import { ACTIONS } from '../types.js';

export interface MidiOutput {
    id: string;
    name: string;
}

export interface MidiState {
    /** Whether Web MIDI output is active. */
    enabled: boolean;
    /** List of available MIDI output ports. */
    outputs: MidiOutput[];
    /** The ID of the currently selected MIDI output. */
    selectedOutputId: string | null;
    /** MIDI channel for Chords (1-16). */
    chordsChannel: number;
    /** MIDI channel for Bass (1-16). */
    bassChannel: number;
    /** MIDI channel for Soloist (1-16). */
    soloistChannel: number;
    /** MIDI channel for Harmonies (1-16). */
    harmonyChannel: number;
    /** MIDI channel for Drums (1-16). */
    drumsChannel: number;
    /** Global MIDI latency offset in ms. */
    latency: number;
    /** Whether to mute internal audio when MIDI is active. */
    muteLocal: boolean;
    /** Octave offset for chords. */
    chordsOctave: number;
    /** Octave offset for bass. */
    bassOctave: number;
    /** Octave offset for soloist. */
    soloistOctave: number;
    /** Octave offset for harmonies. */
    harmonyOctave: number;
    /** Octave offset for drums. */
    drumsOctave: number;
    /** Velocity scaling factor. */
    velocitySensitivity: number;
}

export const midi = deepSignal<MidiState>({
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
});

export function midiReducer(action: string, payload: any): boolean {
    switch (action) {
        case ACTIONS.SET_PARAM:
            if (payload.module === 'midi') {
                (midi as any)[payload.param] = payload.value;
                return true;
            }
            break;
        case ACTIONS.SET_MIDI_CONFIG:
            for (const key in payload) {
                if (Object.hasOwn(midi, key)) {
                    (midi as any)[key] = payload[key];
                }
            }
            return true;
    }
    return false;
}
