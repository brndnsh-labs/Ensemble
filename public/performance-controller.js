import {
    initAudio,
    killDrumNote,
    killSoloistNote,
    playDrumSound,
    playSoloNote,
} from './engine/engine.js';
import { stateMap } from './state.js';

/**
 * PerformanceController
 *
 * Bridges the UI layer with manual engine triggers.
 * Ensures the 'stateMap' is always correctly injected into engine calls.
 */

export function triggerSoloNote(
    freq,
    time,
    duration,
    vol,
    bend = 0,
    style = 'scalar',
    isLegato = false,
    vibrato = false,
) {
    // Ensure audio is initialized on interaction
    initAudio(stateMap);
    playSoloNote(stateMap, freq, time, duration, vol, bend, style, isLegato, vibrato);
}

export function stopSoloist() {
    killSoloistNote(stateMap);
}

export function triggerDrumSound(name, time, velocity) {
    initAudio(stateMap);
    playDrumSound(stateMap, name, time, velocity);
}

export function stopDrums() {
    killDrumNote(stateMap);
}
