import { deepSignal } from 'deepsignal';
import type { Action, GlobalContext } from '../types.js';
import { ACTIONS } from '../types.js';

export type { GlobalContext };

export const playback = deepSignal<GlobalContext>({
    audio: null,
    masterGain: null,
    saturator: null,
    reverbNode: null,
    reverbPreFilter: null,
    chordsGain: null,
    chordsReverb: null,
    chordsEQ: null,
    chordsPanner: null,
    drumsReverb: null,
    drumsGain: null,
    drumsEQ: null,
    bassReverb: null,
    bassGain: null,
    bassSidechain: null,
    bassEQ: null,
    soloistReverb: null,
    soloistGain: null,
    soloistEQ: null,
    harmoniesGain: null,
    harmoniesReverb: null,
    harmoniesEQ: null,
    harmoniesPanner: null,
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
    masterLimiter: null,
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
    switch (action.type) {
        case ACTIONS.RESET_STATE:
            playback.bpm = 100;
            playback.theme = 'auto';
            playback.bandIntensity = 0.35;
            playback.complexity = 0.3;
            playback.autoIntensity = true;
            playback.metronome = false;
            playback.countIn = true;
            playback.visualFlash = false;
            playback.haptic = false;
            playback.sessionTimer = 5;
            playback.applyPresetSettings = false;
            playback.conductorVelocity = 1.0;
            playback.updateAvailable = false;
            return true;
        case ACTIONS.SET_UPDATE_AVAILABLE:
            playback.updateAvailable = !!action.payload;
            return true;
        case ACTIONS.TOGGLE_PLAY:
            playback.isPlaying = !playback.isPlaying;
            if (playback.isPlaying) {
                playback.sessionStartTime = performance.now();
                playback.currentLoopCount = 0;
            }
            if (playback.autoIntensity) {
                playback.bandIntensity = 0.35;
            }
            return true;
        case ACTIONS.SET_BPM:
            playback.bpm = Math.max(40, Math.min(240, parseInt(String(action.payload), 10)));
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
            playback.bandIntensity = Math.max(0, Math.min(1, action.payload));
            return true;
        case ACTIONS.SET_COMPLEXITY:
            playback.complexity = Math.max(0, Math.min(1, action.payload));
            return true;
        case ACTIONS.SET_AUTO_INTENSITY:
            playback.autoIntensity = !!action.payload;
            return true;
        case ACTIONS.SET_METRONOME:
            playback.metronome = action.payload;
            return true;
        case ACTIONS.SET_PRESET_SETTINGS_MODE:
            playback.applyPresetSettings = action.payload;
            return true;
        case ACTIONS.SET_SONG_MODE:
            playback.songMode = !!action.payload;
            return true;
        case ACTIONS.SET_SESSION_TIMER:
            playback.sessionTimer = action.payload;
            return true;
        case ACTIONS.SET_STOP_AT_END:
            playback.stopAtEnd = action.payload;
            return true;
        case ACTIONS.SET_ENDING_PENDING:
            playback.isEndingPending = action.payload;
            return true;
        case ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD:
            if (playback.scheduleAheadTime < 0.4) {
                playback.scheduleAheadTime = playback.scheduleAheadTime * 2.0;
                console.warn(
                    `[Performance] Emergency Lookahead Triggered: ${playback.scheduleAheadTime}s`,
                );
                setTimeout(() => {
                    playback.scheduleAheadTime = 0.2;
                    console.log('[Performance] Lookahead reset to normal.');
                }, 10000);
            }
            return true;
        case ACTIONS.UPDATE_CONDUCTOR_DECISION:
            if (action.payload.velocity) {
                playback.conductorVelocity = action.payload.velocity;
            }
            if (action.payload.lyricalBias !== undefined) {
                playback.lyricalBias = action.payload.lyricalBias;
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
            const p = action.payload;
            const id =
                (typeof p === 'object' ? p.id : undefined) ||
                Math.random().toString(36).substr(2, 9);
            const message = String((typeof p === 'object' ? p.message : undefined) || p);
            playback.toasts = [...playback.toasts, { id, message }];
            return true;
        }
        case 'TOAST_EXPIRED':
            playback.toasts = playback.toasts.filter((t: any) => t.id !== action.payload);
            return true;
        case ACTIONS.TRIGGER_FLASH:
            playback.flashIntensity = action.payload || 0.25;
            return true;
        case 'FLASH_EXPIRED':
            playback.flashIntensity = 0;
            return true;
    }
    return false;
}
