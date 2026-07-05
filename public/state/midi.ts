import { deepSignal } from 'deepsignal';
import type { Action, MidiOutput, MidiState } from '../types.js';
import { ACTIONS } from '../types.js';

export type { MidiOutput, MidiState };

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

export function midiReducer(action: Action): boolean {
    switch (action.type) {
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'midi') {
                (midi as Record<string, unknown>)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
        case ACTIONS.SET_MIDI_CONFIG:
            for (const key in action.payload) {
                if (Object.hasOwn(midi, key)) {
                    (midi as Record<string, unknown>)[key] =
                        action.payload[key as keyof typeof action.payload];
                }
            }
            return true;
    }
    return false;
}
