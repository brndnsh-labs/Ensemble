import {
    initAudio,
    killDrumNote,
    killSoloistNote,
    playDrumSound,
    playSoloNote,
} from './engine/engine.js';
import { stateMap } from './state.js';

export function triggerSoloNote(
    freq: number,
    time: number,
    duration: number,
    vol: number,
    bend = 0,
    style = 'scalar',
    isLegato = false,
    vibrato = false,
): void {
    initAudio(stateMap);
    playSoloNote(stateMap, freq, time, duration, vol, bend, style, isLegato, vibrato);
}

export function stopSoloist(): void {
    killSoloistNote(stateMap);
}

export function triggerDrumSound(name: string, time: number, velocity: number): void {
    initAudio(stateMap);
    playDrumSound(stateMap, name, time, velocity);
}

export function stopDrums(): void {
    killDrumNote(stateMap);
}
