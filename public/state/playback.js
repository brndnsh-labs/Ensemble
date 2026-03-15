import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} GlobalContext
 * @property {AudioContext|null} audio - The Web Audio API context.
 * @property {GainNode|null} masterGain - The master volume gain node.
 * @property {WaveShaperNode|null} saturator - The master soft-clipper/saturator.
 * @property {DynamicsCompressorNode|null} masterLimiter - The master safety limiter.
 * @property {ConvolverNode|null} reverbNode - The global reverb node.
 * @property {GainNode|null} chordsGain - The gain node for chords.
 * @property {GainNode|null} chordsReverb - Reverb send for chords.
 * @property {BiquadFilterNode|null} chordsEQ - EQ for chords (HP/Notch).
 * @property {GainNode|null} drumsReverb - Reverb send for drums.
 * @property {GainNode|null} bassReverb - Reverb send for bass.
 * @property {GainNode|null} soloistReverb - Reverb send for soloist.
 * @property {GainNode|null} harmoniesReverb - Reverb send for harmonies.
 * @property {boolean} isPlaying - Whether the sequencer is currently playing.
 * @property {number} bpm - Beats per minute (40-240).
 * @property {number} nextNoteTime - The scheduler time for the next note (swung).
 * @property {number} unswungNextNoteTime - The scheduler time for the next note (straight/quantized).
 * @property {number} scheduleAheadTime - Lookahead time for scheduling (in seconds).
 * @property {number} step - The global step counter.
 * @property {Array<Object>} drawQueue - Queue of visual events to be rendered.
 * @property {boolean} isCountingIn - Whether the metronome count-in is active.
 * @property {number} countInBeat - Current beat of the count-in (0-3).
 * @property {boolean} isDrawing - Whether the visualizer loop is active.
 * @property {string} theme - The current UI theme ('auto', 'light', 'dark').
 * @property {WakeLockSentinel|null} wakeLock - The screen wake lock object.
 * @property {number} bandIntensity - Global band intensity/energy level (0.0 - 1.0).
 * @property {number} complexity - Global complexity level (0.0 - 1.0).
 * @property {boolean} autoIntensity - Whether the intensity automatically drifts over time.
 * @property {boolean} metronome - Whether the metronome is active.
 * @property {boolean} applyPresetSettings - Whether to apply BPM/Style from presets.
 * @property {boolean} sustainActive - Whether the global sustain pedal is "pressed".
 * @property {boolean} songMode - Whether "Song Mode" (intelligent evolution and endings) is active.
 * @property {number} sessionTimer - Session timer in minutes (0 = infinite).
 * @property {boolean} debugSoloist - Whether debug logging for the soloist is active.
 * @property {number} sessionStartTime - The performance.now() timestamp when playback started.
 * @property {boolean} stopAtEnd - Whether to stop at the end of the current progression/loop.
 * @property {boolean} isEndingPending - Whether the resolution sequence is about to trigger.
 * @property {Object} intent - Current rhythmic intent (syncopation, anticipation, etc).
 * @property {Array<HTMLElement>|null} lastActiveDrumElements - Cache of currently animating drum UI elements.
 * @property {number} lastPlayingStep - The last step index processed by the UI loop.
 * @property {boolean} workerLogging - Whether to log messages from the audio worker.
 * @property {Object|null} viz - Reference to the Visualizer instance.
 * @property {number|null} suspendTimeout - ID of the timeout for audio context suspension.
 * @property {number} conductorVelocity - Dynamic velocity modifier (0.0-1.0) applied by Conductor.
 */
export const playback = {
    audio: null,
    masterGain: null,
    saturator: null,
    reverbNode: null,
    chordsGain: null,
    chordsReverb: null,
    chordsEQ: null,
    drumsReverb: null,
    drumsGain: null,
    bassReverb: null,
    bassGain: null,
    bassEQ: null,
    soloistReverb: null,
    soloistGain: null,
    harmoniesReverb: null,
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
        syncopation: 0.2,
        anticipation: 0.1,
        layBack: 0.0,
        density: 0.5,
    },
    lastActiveDrumElements: null,
    lastPlayingStep: 0,
    workerLogging: false,
    viz: null,
    suspendTimeout: null,
    conductorVelocity: 1.0,
    lyricalBias: 0.5,
    masterLimiter: null,
    masterVolume: 0.4,
    countIn: true,
    visualFlash: false,
    haptic: false,
    toasts: [],
    flashIntensity: 0,
    updateAvailable: false,
    resolutionTriggered: false,
    isScheduling: false,
    stateVersion: 0,
    modals: {
        settings: false,
        editor: false,
        share: false,
        analyzer: false,
        generateSong: false,
        performance: false,
        manual: false,
        drumPad: false,
    },
};

export function playbackReducer(action, payload) {
    switch (action) {
        case ACTIONS.RESET_STATE:
            Object.assign(playback, {
                bpm: 100,
                theme: 'auto',
                bandIntensity: 0.35,
                complexity: 0.3,
                autoIntensity: true,
                metronome: false,
                countIn: true,
                visualFlash: false,
                haptic: false,
                sessionTimer: 5,
                applyPresetSettings: false,
                conductorVelocity: 1.0,
                updateAvailable: false,
            });
            return true;
        case ACTIONS.SET_UPDATE_AVAILABLE:
            playback.updateAvailable = !!payload;
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
            playback.bpm = Math.max(40, Math.min(240, parseInt(payload, 10)));
            return true;
        case ACTIONS.SET_MODAL_OPEN:
            if (Object.hasOwn(playback.modals, payload.modal)) {
                playback.modals[payload.modal] = !!payload.open;
                return true;
            }
            return false;
        case ACTIONS.SET_PARAM:
            if (payload.module === 'playback') {
                playback[payload.param] = payload.value;
                return true;
            }
            break;
        case ACTIONS.SET_BAND_INTENSITY:
            Object.assign(playback, { bandIntensity: Math.max(0, Math.min(1, payload)) });
            return true;
        case ACTIONS.SET_COMPLEXITY:
            Object.assign(playback, { complexity: Math.max(0, Math.min(1, payload)) });
            return true;
        case ACTIONS.SET_AUTO_INTENSITY:
            Object.assign(playback, { autoIntensity: !!payload });
            return true;
        case ACTIONS.SET_METRONOME:
            Object.assign(playback, { metronome: payload });
            return true;
        case ACTIONS.SET_PRESET_SETTINGS_MODE:
            Object.assign(playback, { applyPresetSettings: payload });
            return true;
        case ACTIONS.SET_SONG_MODE:
            Object.assign(playback, { songMode: !!payload });
            return true;
        case ACTIONS.SET_SESSION_TIMER:
            Object.assign(playback, { sessionTimer: payload });
            return true;
        case ACTIONS.SET_STOP_AT_END:
            Object.assign(playback, { stopAtEnd: payload });
            return true;
        case ACTIONS.SET_ENDING_PENDING:
            Object.assign(playback, { isEndingPending: payload });
            return true;
        case ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD:
            if (playback.scheduleAheadTime < 0.4) {
                Object.assign(playback, { scheduleAheadTime: playback.scheduleAheadTime * 2.0 });
                console.warn(
                    `[Performance] Emergency Lookahead Triggered: ${playback.scheduleAheadTime}s`,
                );
                setTimeout(() => {
                    Object.assign(playback, { scheduleAheadTime: 0.2 });
                    console.log('[Performance] Lookahead reset to normal.');
                }, 10000);
            }
            return true;
        case ACTIONS.UPDATE_CONDUCTOR_DECISION:
            if (payload.velocity) {
                playback.conductorVelocity = payload.velocity;
            }
            if (payload.lyricalBias !== undefined) {
                playback.lyricalBias = payload.lyricalBias;
            }
            if (payload.intent) {
                Object.assign(playback.intent, payload.intent);
            }
            break;
        case ACTIONS.SHOW_TOAST: {
            const id = payload.id || Math.random().toString(36).substr(2, 9);
            playback.toasts = [...playback.toasts, { id, message: payload.message || payload }];
            return true;
        }
        case 'TOAST_EXPIRED':
            playback.toasts = playback.toasts.filter((t) => t.id !== payload);
            return true;
        case ACTIONS.TRIGGER_FLASH:
            playback.flashIntensity = payload || 0.25;
            return true;
        case 'FLASH_EXPIRED':
            playback.flashIntensity = 0;
            return true;
    }
    return false;
}
export function setPlaybackParam(param, value) {
    switch (param) {
        case 'audio':
            playback.audio = value;
            break;
        case 'masterGain':
            playback.masterGain = value;
            break;
        case 'saturator':
            playback.saturator = value;
            break;
        case 'reverbNode':
            playback.reverbNode = value;
            break;
        case 'chordsGain':
            playback.chordsGain = value;
            break;
        case 'chordsReverb':
            playback.chordsReverb = value;
            break;
        case 'chordsEQ':
            playback.chordsEQ = value;
            break;
        case 'drumsReverb':
            playback.drumsReverb = value;
            break;
        case 'drumsGain':
            playback.drumsGain = value;
            break;
        case 'bassReverb':
            playback.bassReverb = value;
            break;
        case 'bassGain':
            playback.bassGain = value;
            break;
        case 'bassEQ':
            playback.bassEQ = value;
            break;
        case 'soloistReverb':
            playback.soloistReverb = value;
            break;
        case 'soloistGain':
            playback.soloistGain = value;
            break;
        case 'harmoniesReverb':
            playback.harmoniesReverb = value;
            break;
        case 'isPlaying':
            playback.isPlaying = value;
            break;
        case 'bpm':
            playback.bpm = value;
            break;
        case 'nextNoteTime':
            playback.nextNoteTime = value;
            break;
        case 'unswungNextNoteTime':
            playback.unswungNextNoteTime = value;
            break;
        case 'scheduleAheadTime':
            playback.scheduleAheadTime = value;
            break;
        case 'step':
            playback.step = value;
            break;
        case 'drawQueue':
            playback.drawQueue = value;
            break;
        case 'isCountingIn':
            playback.isCountingIn = value;
            break;
        case 'countInBeat':
            playback.countInBeat = value;
            break;
        case 'isDrawing':
            playback.isDrawing = value;
            break;
        case 'theme':
            playback.theme = value;
            break;
        case 'wakeLock':
            playback.wakeLock = value;
            break;
        case 'bandIntensity':
            playback.bandIntensity = value;
            break;
        case 'complexity':
            playback.complexity = value;
            break;
        case 'autoIntensity':
            playback.autoIntensity = value;
            break;
        case 'metronome':
            playback.metronome = value;
            break;
        case 'applyPresetSettings':
            playback.applyPresetSettings = value;
            break;
        case 'sustainActive':
            playback.sustainActive = value;
            break;
        case 'songMode':
            playback.songMode = value;
            break;
        case 'sessionTimer':
            playback.sessionTimer = value;
            break;
        case 'debugSoloist':
            playback.debugSoloist = value;
            break;
        case 'loopLimit':
            playback.loopLimit = value;
            break;
        case 'currentLoopCount':
            playback.currentLoopCount = value;
            break;
        case 'sessionStartTime':
            playback.sessionStartTime = value;
            break;
        case 'stopAtEnd':
            playback.stopAtEnd = value;
            break;
        case 'isEndingPending':
            playback.isEndingPending = value;
            break;
        case 'intent':
            playback.intent = value;
            break;
        case 'lastActiveDrumElements':
            playback.lastActiveDrumElements = value;
            break;
        case 'lastPlayingStep':
            playback.lastPlayingStep = value;
            break;
        case 'workerLogging':
            playback.workerLogging = value;
            break;
        case 'viz':
            playback.viz = value;
            break;
        case 'suspendTimeout':
            playback.suspendTimeout = value;
            break;
        case 'conductorVelocity':
            playback.conductorVelocity = value;
            break;
        case 'lyricalBias':
            playback.lyricalBias = value;
            break;
        case 'masterLimiter':
            playback.masterLimiter = value;
            break;
        case 'masterVolume':
            playback.masterVolume = value;
            break;
        case 'countIn':
            playback.countIn = value;
            break;
        case 'visualFlash':
            playback.visualFlash = value;
            break;
        case 'haptic':
            playback.haptic = value;
            break;
        case 'toasts':
            playback.toasts = value;
            break;
        case 'flashIntensity':
            playback.flashIntensity = value;
            break;
        case 'updateAvailable':
            playback.updateAvailable = value;
            break;
        case 'resolutionTriggered':
            playback.resolutionTriggered = value;
            break;
        case 'isScheduling':
            playback.isScheduling = value;
            break;
        case 'stateVersion':
            playback.stateVersion = value;
            break;
        case 'modals':
            playback.modals = value;
            break;
        case 'soloistEQ':
            playback.soloistEQ = value;
            break;
        case 'harmoniesGain':
            playback.harmoniesGain = value;
            break;
        case 'harmoniesEQ':
            playback.harmoniesEQ = value;
            break;
        default:
            console.warn(`[State] Unknown playback param: ${param}`);
            break;
    }
}
