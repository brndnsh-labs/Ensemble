import { deepSignal } from 'deepsignal';
import type { Action, GlobalContext, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';

export type { GlobalContext };

export const playback = deepSignal<GlobalContext>({
    audio: null,
    audioGraph: null,
    isPlaying: false,
    bpm: 100,
    nextNoteTime: 0.0,
    unswungNextNoteTime: 0.0,
    scheduleAheadTime: 0.2,
    step: 0,
    drawQueue: [],
    isCountingIn: false,
    countInBeat: 0,
    isDrawing: false,
    theme: 'auto',
    wakeLock: null,
    bandIntensity: 0.35,
    complexity: 0.3,
    autoIntensity: true,
    practiceMode: true,
    metronome: false,
    applyPresetSettings: false,
    sustainActive: false,
    songMode: true,
    sessionTimer: 5,
    debugSoloist: false,
    loopLimit: 0,
    currentLoopCount: 0,
    sessionStartTime: 0,
    stopAtEnd: false,
    isEndingPending: false,
    intent: {
        syncopation: 0.5,
        anticipation: 0.2,
        layBack: 0,
        density: 0.5,
    },
    lastActiveDrumElements: null,
    heldNotes: new Set(),
    lastPlayingStep: -1,
    workerLogging: false,
    suspendTimeout: null,
    currentKey: null,
    conductorVelocity: 1.0,
    lyricalBias: 0.5,
    masterVolume: 0.4,
    countIn: true,
    visualFlash: false,
    haptic: false,
    toasts: [] as any[],
    flashIntensity: 0,
    updateAvailable: false,
    resolutionTriggered: false,
    isScheduling: false,
    modals: {
        settings: false,
        editor: false,
        share: false,
        generateSong: false,
        manual: false,
    },
});

export function playbackReducer(action: Action): boolean {
    const p = playback as Mutable<typeof playback>;
    switch (action.type) {
        case ACTIONS.RESET_STATE:
            p.bpm = 100;
            p.theme = 'auto';
            p.bandIntensity = 0.35;
            p.complexity = 0.3;
            p.autoIntensity = true;
            p.metronome = false;
            p.countIn = true;
            p.visualFlash = false;
            p.haptic = false;
            p.sessionTimer = 5;
            p.applyPresetSettings = false;
            p.conductorVelocity = 1.0;
            p.updateAvailable = false;
            return true;
        case ACTIONS.SET_UPDATE_AVAILABLE:
            p.updateAvailable = !!action.payload;
            return true;
        case ACTIONS.TOGGLE_PLAY:
            p.isPlaying = !p.isPlaying;
            if (p.isPlaying) {
                p.sessionStartTime = performance.now();
                p.currentLoopCount = 0;
            }
            if (p.autoIntensity) {
                p.bandIntensity = 0.35;
            }
            return true;
        case ACTIONS.SET_BPM:
            p.bpm = Math.max(40, Math.min(240, parseInt(String(action.payload), 10)));
            return true;
        case ACTIONS.SET_MODAL_OPEN:
            if (Object.hasOwn(playback.modals, action.payload.modal)) {
                (playback.modals as any)[action.payload.modal] = !!action.payload.open;
                return true;
            }
            return false;
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'playback') {
                (playback as any)[action.payload.param] = action.payload.value;
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
        case ACTIONS.SET_COMPLEXITY:
            p.complexity = Math.max(0, Math.min(1, action.payload));
            return true;
        case ACTIONS.SET_AUTO_INTENSITY:
            p.autoIntensity = !!action.payload;
            return true;
        case ACTIONS.SET_METRONOME:
            p.metronome = action.payload;
            return true;
        case ACTIONS.SET_PRESET_SETTINGS_MODE:
            p.applyPresetSettings = action.payload;
            return true;
        case ACTIONS.SET_SONG_MODE:
            p.songMode = !!action.payload;
            return true;
        case ACTIONS.SET_SESSION_TIMER:
            p.sessionTimer = action.payload;
            return true;
        case ACTIONS.SET_STOP_AT_END:
            p.stopAtEnd = action.payload;
            return true;
        case ACTIONS.SET_ENDING_PENDING:
            p.isEndingPending = action.payload;
            return true;
        case ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD:
            if (p.scheduleAheadTime < 0.4) {
                p.scheduleAheadTime = p.scheduleAheadTime * 2.0;
                console.warn(
                    `[Performance] Emergency Lookahead Triggered: ${p.scheduleAheadTime}s`,
                );
                setTimeout(() => {
                    p.scheduleAheadTime = 0.2;
                    console.log('[Performance] Lookahead reset to normal.');
                }, 10000);
            }
            return true;
        case ACTIONS.UPDATE_CONDUCTOR_DECISION:
            if (action.payload.velocity) {
                p.conductorVelocity = action.payload.velocity;
            }
            if (action.payload.lyricalBias !== undefined) {
                p.lyricalBias = action.payload.lyricalBias;
            }
            if (action.payload.intent) {
                if (action.payload.intent.syncopation !== undefined) {
                    playback.intent.syncopation = action.payload.intent.syncopation;
                }
                if (action.payload.intent.anticipation !== undefined) {
                    playback.intent.anticipation = action.payload.intent.anticipation;
                }
                if (action.payload.intent.layBack !== undefined) {
                    playback.intent.layBack = action.payload.intent.layBack;
                }
                if (action.payload.intent.density !== undefined) {
                    playback.intent.density = action.payload.intent.density;
                }
            }
            break;
        case ACTIONS.SHOW_TOAST: {
            const toast = action.payload;
            const id =
                (typeof toast === 'object' ? toast.id : undefined) ||
                Math.random().toString(36).substr(2, 9);
            const message = String(
                (typeof toast === 'object' ? toast.message : undefined) || toast,
            );
            p.toasts = [...p.toasts, { id, message }];
            return true;
        }
        case 'TOAST_EXPIRED':
            p.toasts = p.toasts.filter((t: any) => t.id !== action.payload);
            return true;
        case ACTIONS.TRIGGER_FLASH:
            p.flashIntensity = action.payload || 0.25;
            return true;
        case 'FLASH_EXPIRED':
            p.flashIntensity = 0;
            return true;
    }
    return false;
}
