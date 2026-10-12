import { validateProgression } from '../engine/chords-engine.js';
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

    // #1313 — chord voicings are baked at parse time and depend on whether a bass
    // line is sounding (rootless shells + a higher floor with it, rooted voicings
    // without). Muting the bass is "I'm playing that part", so the comp has to be
    // re-voiced NOW or it keeps the rootless shapes with nothing stating the root.
    // Mutate -> validate -> flush. Flush every lane that reads the re-voiced progression
    // (the chords, not just the bass) — but NOT the drums or the
    // soloist: a player muting the bass mid-groove must not hear the time hiccup.
    if (module === 'bass') {
        validateProgression(getState(), dispatch);
        flushBuffer('bass', 'chords');
    } else if (module === 'chords' || module === 'soloist') {
        flushBuffer(module);
    } else {
        restoreGains(getState());
    }

    if (newState) {
        restoreGains(getState());
    }
}
