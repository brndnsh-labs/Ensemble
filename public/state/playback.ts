import { deepSignal } from 'deepsignal/core';
import type { Action, GlobalContext, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';
import { writeDeclaredParam } from './set-param.js';

export type { GlobalContext };

/** The band's energy before anyone sets it, and the level a chart on auto energy resets to. */
export const DEFAULT_BAND_INTENSITY = 0.35;

export const playback = deepSignal<GlobalContext>({
    audio: null,
    audioGraph: null,
    isPlaying: false,
    bpm: 100,
    startStep: 0,
    bandIntensity: DEFAULT_BAND_INTENSITY,
    autoIntensity: true,
    metronome: false,
    masterVolume: 0.4,
    countIn: true,
});

export function playbackReducer(action: Action): boolean {
    const p = playback as Mutable<typeof playback>;
    switch (action.type) {
        case ACTIONS.SET_BPM:
            p.bpm = Math.max(40, Math.min(240, parseInt(String(action.payload), 10)));
            return true;
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'playback') {
                return writeDeclaredParam(
                    playback,
                    'playback',
                    action.payload.param,
                    action.payload.value,
                );
            }
            break;
        case ACTIONS.SET_BAND_INTENSITY:
            // synth-audit Epic 2 S7 — fail-fast NaN guard. A non-finite
            // payload would clamp to NaN (`Math.max(0, Math.min(1, NaN))`),
            // poisoning every consumer's velocity/cutoff math downstream.
            // Catch + log, keep the previous value rather than swallow it.
            if (!Number.isFinite(action.payload)) {
                console.warn(
                    `SET_BAND_INTENSITY: non-finite payload (${action.payload}) — ignored`,
                );
                return false;
            }
            p.bandIntensity = Math.max(0, Math.min(1, action.payload));
            return true;
        case ACTIONS.SET_AUTO_INTENSITY:
            p.autoIntensity = !!action.payload;
            return true;
        case ACTIONS.SET_METRONOME:
            p.metronome = action.payload;
            return true;
        case ACTIONS.SET_START_STEP:
            // Section-practice (#1016): seed the step the next play starts from.
            p.startStep = Number.isFinite(action.payload) ? Math.max(0, action.payload) : 0;
            return true;
    }
    return false;
}
