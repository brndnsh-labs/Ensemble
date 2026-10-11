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
import { ACTIONS } from '../types.js';

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

function flushBuffer(...types: string[]): void {
    const has = (lane: string) => types.includes(lane) || types.includes('all');
    if (has('bass')) {
        killBassNote(stateMap);
        killBassBus(stateMap);
    }
    if (has('soloist')) {
        killSoloistNote(stateMap);
        killSoloistBus(stateMap);
    }
    if (has('chord')) {
        killAllPianoNotes(stateMap);
        killChordBus(stateMap);
    }
    if (has('groove')) {
        killDrumNote(stateMap);
        killDrumBus(stateMap);
    }
    restoreGains(stateMap);
}

export function togglePower(type: string): void {
    const { groove, chords, bass, soloist } = getState();
    const normalizedType = type === 'chords' ? 'chord' : type;

    const stateMap = {
        chord: chords,
        bass: bass,
        soloist: soloist,
        groove: groove,
    };

    const state = (stateMap as any)[normalizedType];
    if (!state) {
        return;
    }

    const newState = !state.enabled;
    const moduleName = normalizedType === 'chord' ? 'chords' : normalizedType;

    dispatch(ACTIONS.SET_PARAM, { module: moduleName, param: 'enabled', value: newState });

    // #1313 — chord voicings are baked at parse time and depend on whether a bass
    // line is sounding (rootless shells + a higher floor with it, rooted voicings
    // without). Muting the bass is "I'm playing that part", so the comp has to be
    // re-voiced NOW or it keeps the rootless shapes with nothing stating the root.
    // Mutate -> validate -> flush. Flush every lane that reads the re-voiced progression
    // (the chords, not just the bass buffer) — but NOT the drums or the
    // soloist: a player muting the bass mid-groove must not hear the time hiccup.
    const bassToggled = normalizedType === 'bass';
    if (bassToggled) {
        // getState(), NOT `stateMap`: this function's local `stateMap` is the lane
        // lookup above and shadows the imported state tree.
        validateProgression(getState(), dispatch);
    }

    if (bassToggled) {
        flushBuffer('bass', 'chord');
    } else if (['chord', 'soloist'].includes(normalizedType)) {
        flushBuffer(normalizedType);
    } else {
        restoreGains(getState());
    }

    if (newState) {
        restoreGains(getState());
    }
}
