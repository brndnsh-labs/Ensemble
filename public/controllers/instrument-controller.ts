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

/** Silence the named lanes (the drums are never among them: muting a part must not hiccup the time). */
function flushBuffer(...lanes: Exclude<InstrumentModule, 'groove'>[]): void {
    if (lanes.includes('bass')) {
        killBassNote(stateMap);
        killBassBus(stateMap);
    }
    if (lanes.includes('soloist')) {
        killSoloistNote(stateMap);
        killSoloistBus(stateMap);
    }
    if (lanes.includes('chords')) {
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
