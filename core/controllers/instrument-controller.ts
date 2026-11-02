import {
    killAllPianoNotes,
    killBassBus,
    killBassNote,
    killChordBus,
    killDrumBus,
    killDrumNote,
    killSoloistBus,
    killSoloistNote,
    restoreGains,
} from '../engine/engine.js';
import { dispatch, getState, stateMap } from '../state.js';
import { ACTIONS, type InstrumentModule } from '../types.js';

export function flushBuffers(): void {
    // Kill current sounds and buses
    killAllPianoNotes(stateMap);
    killSoloistNote(stateMap);
    killBassNote(stateMap);
    killDrumNote(stateMap);

    killChordBus(stateMap);
    killBassBus(stateMap);
    killSoloistBus(stateMap);
    killDrumBus(stateMap);

    restoreGains(stateMap);
}

/** Silence one lane (never the drums: muting a part must not hiccup the time). */
export function flushBuffer(lane: Exclude<InstrumentModule, 'groove'>): void {
    if (lane === 'bass') {
        killBassNote(stateMap);
        killBassBus(stateMap);
    } else if (lane === 'soloist') {
        killSoloistNote(stateMap);
        killSoloistBus(stateMap);
    } else {
        killAllPianoNotes(stateMap);
        killChordBus(stateMap);
    }
    restoreGains(stateMap);
}

export function togglePower(module: InstrumentModule): void {
    const newState = !getState()[module].enabled;

    dispatch(ACTIONS.SET_PARAM, { module, param: 'enabled', value: newState });

    // Silence only the lane that was toggled: a player muting the bass mid-groove must not
    // hear the time hiccup, and the parsed progression carries no voicing that depends on
    // which lanes sound (the band voices the comp, #1650).
    if (module === 'bass' || module === 'chords' || module === 'soloist') {
        flushBuffer(module);
    } else {
        restoreGains(getState());
    }

    if (newState) {
        restoreGains(getState());
    }
}
