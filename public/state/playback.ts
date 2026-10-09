import { deepSignal } from 'deepsignal/core';
import type { Action, GlobalContext, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';

export type { GlobalContext };

/** The band's energy before anyone sets it, and the level a chart on auto energy resets to. */
export const DEFAULT_BAND_INTENSITY = 0.35;

export const playback = deepSignal<GlobalContext>({
    audio: null,
    audioGraph: null,
    isPlaying: false,
    bpm: 100,
    nextNoteTime: 0.0,
    unswungNextNoteTime: 0.0,
    scheduleAheadTime: 0.2,
    step: 0,
    currentSectionId: null,
    startStep: 0,
    drawQueue: [],
    isDrawing: false,
    wakeLock: null,
    bandIntensity: DEFAULT_BAND_INTENSITY,
    autoIntensity: true,
    metronome: false,
    applyPresetSettings: false,
    sustainActive: false,
    songMode: true,
    sessionTimer: 5,
    debugSoloist: false,
    loopLimit: 0,
    currentLoopCount: 0,
    sessionStartTime: 0,
    isEndingPending: false,
    intent: {
        anticipation: 0.2,
        layBack: 0,
    },
    lastActiveDrumElements: null,
    heldNotes: new Set(),
    lastPlayingStep: -1,
    workerLogging: false,
    suspendTimeout: null,
    currentKey: null,
    masterVolume: 0.4,
    countIn: true,
    visualFlash: false,
    qualityColors: true, // color chord symbols by harmonic quality on the chart
    toasts: [],
    flashIntensity: 0,
    resolutionTriggered: false,
    isScheduling: false,
    chartLocked: true,
});

export function playbackReducer(action: Action): boolean {
    const p = playback as Mutable<typeof playback>;
    switch (action.type) {
        case ACTIONS.SET_BPM:
            p.bpm = Math.max(40, Math.min(240, parseInt(String(action.payload), 10)));
            return true;
        case ACTIONS.SET_CHART_LOCKED:
            p.chartLocked = !!action.payload;
            return true;
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'playback') {
                (playback as Record<string, unknown>)[action.payload.param] = action.payload.value;
                return true;
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
        case ACTIONS.SHOW_TOAST: {
            const toast = action.payload;
            const isObj = typeof toast === 'object' && toast !== null;
            const id = (isObj ? toast.id : undefined) || Math.random().toString(36).substr(2, 9);
            const message = String((isObj ? toast.message : undefined) || toast);
            const actions = isObj && Array.isArray(toast.actions) ? toast.actions : undefined;
            const entry: { id: string; message: string; actions?: string[] } = { id, message };
            if (actions && actions.length > 0) {
                entry.actions = actions;
            }
            p.toasts = [...p.toasts, entry];
            return true;
        }
        case ACTIONS.TOAST_EXPIRED:
            p.toasts = p.toasts.filter((t) => t.id !== action.payload);
            return true;
        case ACTIONS.TRIGGER_FLASH:
            p.flashIntensity = action.payload || 0.25;
            return true;
        case ACTIONS.FLASH_EXPIRED:
            p.flashIntensity = 0;
            return true;
    }
    return false;
}
