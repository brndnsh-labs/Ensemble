import { deepSignal } from 'deepsignal';
import type { ModalsState, PlaybackIntent } from '../types.js';
import { ACTIONS } from '../types.js';

export interface GlobalContext {
    /** The Web Audio API context. */
    audio: AudioContext | null;
    /** The master volume gain node. */
    masterGain: GainNode | null;
    /** The master soft-clipper/saturator. */
    saturator: WaveShaperNode | null;
    /** The master safety limiter. */
    masterLimiter: DynamicsCompressorNode | null;
    /** The global reverb node. */
    reverbNode: ConvolverNode | null;
    /** HPF for reverb cleaning. */
    reverbPreFilter: BiquadFilterNode | null;
    /** The gain node for chords. */
    chordsGain: GainNode | null;
    /** Reverb send for chords. */
    chordsReverb: GainNode | null;
    /** EQ for chords (HP/Notch). */
    chordsEQ: BiquadFilterNode | null;
    /** Stereo panner for chords. */
    chordsPanner: StereoPannerNode | null;
    /** The gain node for drums. */
    drumsGain: GainNode | null;
    /** HP/air EQ for drums bus. */
    drumsEQ: BiquadFilterNode | null;
    /** Reverb send for drums. */
    drumsReverb: GainNode | null;
    /** The gain node for bass. */
    bassGain: GainNode | null;
    /** Reverb send for bass. */
    bassReverb: GainNode | null;
    /** Sidechain ducking gain node for bass. */
    bassSidechain: GainNode | null;
    /** EQ for bass (HPF/Notch). */
    bassEQ: BiquadFilterNode | null;
    /** The gain node for soloist. */
    soloistGain: GainNode | null;
    /** Reverb send for soloist. */
    soloistReverb: GainNode | null;
    /** EQ for soloist (LPF/Shelf). */
    soloistEQ: BiquadFilterNode | null;
    /** The gain node for harmonies. */
    harmoniesGain: GainNode | null;
    /** Reverb send for harmonies. */
    harmoniesReverb: GainNode | null;
    /** EQ for harmonies (HPF). */
    harmoniesEQ: BiquadFilterNode | null;
    /** Stereo panner for harmonies. */
    harmoniesPanner: StereoPannerNode | null;
    /** Whether the sequencer is currently playing. */
    isPlaying: boolean;
    /** Beats per minute (40-240). */
    bpm: number;
    /** The scheduler time for the next note (swung). */
    nextNoteTime: number;
    /** The scheduler time for the next note (straight/quantized). */
    unswungNextNoteTime: number;
    /** Lookahead time for scheduling (in seconds). */
    scheduleAheadTime: number;
    /** The global step counter. */
    step: number;
    /** Queue of normalized visual events waiting to be rendered. */
    drawQueue: any[];
    /** Whether the metronome count-in is active. */
    isCountingIn: boolean;
    /** Current beat of the count-in (0-3). */
    countInBeat: number;
    /** Whether the visualizer loop is active. */
    isDrawing: boolean;
    /** The current UI theme ('auto', 'light', 'dark'). */
    theme: string;
    /** The screen wake lock object. */
    wakeLock: WakeLockSentinel | null;
    /** Global band intensity/energy level (0.0 - 1.0). */
    bandIntensity: number;
    /** Global complexity level (0.0 - 1.0). */
    complexity: number;
    /** Whether the intensity automatically drifts over time. */
    autoIntensity: boolean;
    /** Whether muted instruments strictly reserve their sonic space. */
    practiceMode: boolean;
    /** Whether the metronome is active. */
    metronome: boolean;
    /** Whether to apply BPM/Style from presets. */
    applyPresetSettings: boolean;
    /** Whether the global sustain pedal is "pressed". */
    sustainActive: boolean;
    /** Whether "Song Mode" (intelligent evolution and endings) is active. */
    songMode: boolean;
    /** Session timer in minutes (0 = infinite). */
    sessionTimer: number;
    /** Whether debug logging for the soloist is active. */
    debugSoloist: boolean;
    /** The performance.now() timestamp when playback started. */
    sessionStartTime: number;
    /** Whether to stop at the end of the current progression/loop. */
    stopAtEnd: boolean;
    /** Whether the resolution sequence is about to trigger. */
    isEndingPending: boolean;
    /** Current rhythmic intent (syncopation, anticipation, etc). */
    intent: PlaybackIntent;
    /** Cache of currently animating drum UI elements. */
    lastActiveDrumElements: HTMLElement[] | null;
    /** Currently sustaining piano notes. */
    heldNotes: Set<any>;
    /** The last step index processed by the UI loop. */
    lastPlayingStep: number;
    /** Whether to log messages from the audio worker. */
    workerLogging: boolean;
    /** ID of the timeout for audio context suspension. */
    suspendTimeout: number | null | any;
    /** The current musical key being tracked by playback. */
    currentKey: string | null;
    /** Dynamic velocity modifier (0.0-1.0) applied by Conductor. */
    conductorVelocity: number;
    /** Bias towards lyrical phrasing in soloist (0.0-1.0). */
    lyricalBias: number;
    /** Master output volume. */
    masterVolume: number;
    /** Whether the metronome count-in is enabled. */
    countIn: boolean;
    /** Whether visual flashing is enabled. */
    visualFlash: boolean;
    /** Whether haptic feedback is enabled. */
    haptic: boolean;
    /** List of active toast notifications. */
    toasts: Array<{ id: string; message: string }>;
    /** Current intensity of the screen flash effect. */
    flashIntensity: number;
    /** Whether a PWA update is pending. */
    updateAvailable: boolean;
    /** Whether the resolution ending sequence has been triggered. */
    resolutionTriggered: boolean;
    /** Whether the scheduler is currently active. */
    isScheduling: boolean;
    /** Visibility state for various UI modals. */
    modals: ModalsState;
    /** Number of loops before stopping (0 = infinite). */
    loopLimit: number;
    /** Current loop iteration counter. */
    currentLoopCount: number;
}

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

export function playbackReducer(action: string, payload?: any): boolean {
    switch (action) {
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
                (playback.modals as any)[payload.modal] = !!payload.open;
                return true;
            }
            return false;
        case ACTIONS.SET_PARAM:
            if (payload.module === 'playback') {
                (playback as any)[payload.param] = payload.value;
                return true;
            }
            break;
        case ACTIONS.SET_BAND_INTENSITY:
            playback.bandIntensity = Math.max(0, Math.min(1, payload));
            return true;
        case ACTIONS.SET_COMPLEXITY:
            playback.complexity = Math.max(0, Math.min(1, payload));
            return true;
        case ACTIONS.SET_AUTO_INTENSITY:
            playback.autoIntensity = !!payload;
            return true;
        case ACTIONS.SET_METRONOME:
            playback.metronome = payload;
            return true;
        case ACTIONS.SET_PRESET_SETTINGS_MODE:
            playback.applyPresetSettings = payload;
            return true;
        case ACTIONS.SET_SONG_MODE:
            playback.songMode = !!payload;
            return true;
        case ACTIONS.SET_SESSION_TIMER:
            playback.sessionTimer = payload;
            return true;
        case ACTIONS.SET_STOP_AT_END:
            playback.stopAtEnd = payload;
            return true;
        case ACTIONS.SET_ENDING_PENDING:
            playback.isEndingPending = payload;
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
            if (payload.velocity) {
                playback.conductorVelocity = payload.velocity;
            }
            if (payload.lyricalBias !== undefined) {
                playback.lyricalBias = payload.lyricalBias;
            }
            if (payload.intent) {
                if (payload.intent.syncopation !== undefined) {
                    playback.intent.syncopation = payload.intent.syncopation;
                }
                if (payload.intent.anticipation !== undefined) {
                    playback.intent.anticipation = payload.intent.anticipation;
                }
                if (payload.intent.layBack !== undefined) {
                    playback.intent.layBack = payload.intent.layBack;
                }
                if (payload.intent.density !== undefined) {
                    playback.intent.density = payload.intent.density;
                }
            }
            break;
        case ACTIONS.SHOW_TOAST: {
            const id = payload.id || Math.random().toString(36).substr(2, 9);
            const message = payload.message || payload;
            playback.toasts = [...playback.toasts, { id, message }];
            return true;
        }
        case 'TOAST_EXPIRED':
            playback.toasts = playback.toasts.filter((t: any) => t.id !== payload);
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
