import { deepSignal } from 'deepsignal';
import type { Action } from '../types.js';
import { ACTIONS } from '../types.js';
import type { GlobalContext } from './playback.js';

export interface Instrument {
    /** Instrument name (e.g., 'Kick'). */
    name: string;
    /** Display emoji/symbol. */
    symbol: string;
    /** Sequencer steps (0=off, 1=on, 2=accent). */
    steps: number[];
    /** Whether the instrument is muted. */
    muted: boolean;
}

export interface PocketState {
    /** -1.0 (behind) to 1.0 (ahead) */
    globalDrive: number;
    /** 0.0 (loose/jittery) to 1.0 (grid-locked) */
    tightness: number;
    /** 0.0 to 1.0 (how much bass follows Kick) */
    bassGravity: number;
    /** 0.0 to 1.0 (how much chords follow Bass) */
    chordGravity: number;
    /** 0.0 to 1.0 (how much soloist follows Snare/Hats) */
    soloistGravity: number;
}

export interface GrooveState {
    /** Whether the drum engine is active. */
    enabled: boolean;
    /** List of drum instruments. */
    instruments: Instrument[];
    /** Volume level. */
    volume: number;
    /** Reverb level. */
    reverb: number;
    /** Number of measures in the loop (1-8). */
    measures: number;
    /** Currently visible measure for editing. */
    currentMeasure: number;
    /** Whether to scroll grid during playback. */
    followPlayback: boolean;
    /** Humanization percentage (0-100). */
    humanize: number;
    /** Swing percentage (0-100). */
    swing: number;
    /** Swing subdivision ('8th' or '16th'). */
    swingSub: string;
    /** Name of the last loaded drum preset. */
    lastDrumPreset: string;
    /** Thematic seed for deterministic generation. */
    seed: string;
    /** Cache for decoded drum samples. */
    audioBuffers: any;
    /** Active genre for procedural nuances ('Rock', 'Jazz', 'Funk'). */
    genreFeel: string;
    /** Whether a drum fill is currently being played. */
    fillActive: boolean;
    /** Transient storage for the generated fill pattern. */
    fillSteps: object;
    /** Last gain node for the hi-hat. */
    lastHatGain: GainNode | null;
    /** Last gain node for the ride cymbal. */
    lastRideGain: GainNode | null;
    /** Last gain node for the crash cymbal. */
    lastCrashGain: GainNode | null;
    /** Step index where the current fill began. */
    fillStartStep: number;
    /** Length of the current fill in steps. */
    fillLength: number;
    /** 16-bit mask of the current snare pattern. */
    snareMask: number;
    /** Whether a crash cymbal is queued for the next downbeat. */
    pendingCrash: boolean;
    /** Whether generative fills/variations are enabled. */
    creativity: boolean;
    /** Random seeds for each song section. */
    sectionSeedMap: object;
    /** Unified rhythmic pocket configuration. */
    pocket: PocketState;
    /** Last selected smart genre. */
    lastSmartGenre: string;
    /** Genre queued for the next measure. */
    pendingGenreFeel: { genreName?: string; feel?: string } | null;
    /** Beats until genre switch. */
    genreSwitchCountdown: number | null;
    /** Pre-calculated section orchestration map. */
    orchestrationMap: any[] | null;
    /** Pre-calculated song-wide fill map. */
    fillMap: Record<number, any> | null;
    /** Pre-calculated soloist accent catching map. */
    accentMap: Record<number, any> | null;
    /** Absolute playback step when the current seed maps were generated. */
    seedTimelineStartStep: number;
    /** Pre-calculated pattern variations for the current preset. */
    variations: any[] | null;
    /** Map of scheduled drum events. */
    buffer: Map<number, any>;
}

export const groove = deepSignal<GrooveState>({
    enabled: true,
    instruments: [
        { name: 'Kick', symbol: '🥁', steps: new Array(128).fill(0), muted: false },
        { name: 'Snare', symbol: '👏', steps: new Array(128).fill(0), muted: false },
        { name: 'HiHat', symbol: '🎩', steps: new Array(128).fill(0), muted: false },
        { name: 'Open', symbol: '📀', steps: new Array(128).fill(0), muted: false },
        { name: 'Clave', symbol: '🥢', steps: new Array(128).fill(0), muted: false },
        { name: 'Conga', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Bongo', symbol: '🥁', steps: new Array(128).fill(0), muted: false },
        { name: 'Perc', symbol: '🪇', steps: new Array(128).fill(0), muted: false },
        { name: 'Shaker', symbol: '🧂', steps: new Array(128).fill(0), muted: false },
        { name: 'Guiro', symbol: '🥖', steps: new Array(128).fill(0), muted: false },
        { name: 'High Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Mid Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Low Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
    ],
    volume: 1.0,
    reverb: 0.2,
    measures: 1,
    currentMeasure: 0,
    followPlayback: true,
    humanize: 20,
    swing: 0,
    swingSub: '8th',
    lastDrumPreset: 'Basic Rock',
    seed: '',
    audioBuffers: {},
    genreFeel: 'Rock',
    lastSmartGenre: 'Rock',
    pendingGenreFeel: null,
    genreSwitchCountdown: null,
    orchestrationMap: null,
    fillMap: null,
    accentMap: null,
    seedTimelineStartStep: 0,
    fillActive: false,
    fillSteps: {},
    buffer: new Map(),
    lastHatGain: null,
    lastRideGain: null,
    lastCrashGain: null,
    fillStartStep: 0,
    fillLength: 0,
    snareMask: 0,
    pendingCrash: false,
    creativity: false,
    sectionSeedMap: {},
    variations: null,
    pocket: {
        globalDrive: 0, // -1.0 (behind) to 1.0 (ahead)
        tightness: 0.5, // 0.0 (loose/jittery) to 1.0 (grid-locked)
        bassGravity: 0.8, // 0.0 to 1.0 (how much bass follows Kick)
        chordGravity: 0.6, // 0.0 to 1.0 (how much chords follow Bass)
        soloistGravity: 0.4, // 0.0 to 1.0 (how much soloist follows Snare/Hats)
    },
});

export function grooveReducer(action: Action, playback: GlobalContext): boolean {
    switch (action.type) {
        case ACTIONS.UPDATE_GB:
            for (const key in action.payload) {
                if (Object.hasOwn(groove, key)) {
                    (groove as any)[key] = (action.payload as any)[key];
                }
            }
            return true;
        case ACTIONS.SET_PARAM:
            if (
                action.payload.module === 'groove' ||
                action.payload.module === 'drum' ||
                action.payload.module === 'drums'
            ) {
                (groove as any)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
        case ACTIONS.RESET_STATE:
            groove.enabled = true;
            groove.volume = 1.0;
            groove.reverb = 0.2;
            groove.swing = 0;
            groove.swingSub = '8th';
            groove.genreFeel = 'Rock';
            groove.lastSmartGenre = 'Rock';
            groove.measures = 1;
            groove.currentMeasure = 0;
            groove.orchestrationMap = null;
            groove.fillMap = null;
            groove.accentMap = null;
            groove.seedTimelineStartStep = 0;
            groove.lastHatGain = null;
            groove.lastRideGain = null;
            groove.lastCrashGain = null;

            groove.pocket.globalDrive = 0;
            groove.pocket.tightness = 0.5;
            groove.pocket.bassGravity = 0.8;
            groove.pocket.chordGravity = 0.6;
            groove.pocket.soloistGravity = 0.4;

            groove.instruments.forEach((inst) => {
                inst.steps.fill(0);
                inst.muted = false;
            });
            return true;
        case ACTIONS.SET_ACTIVE_MEASURE:
            groove.currentMeasure = parseInt(String(action.payload), 10);
            return true;
        case ACTIONS.SET_SWING:
            groove.swing = action.payload;
            return true;
        case ACTIONS.SET_SWING_SUB:
            groove.swingSub = action.payload;
            return true;
        case ACTIONS.SET_HUMANIZE:
            groove.humanize = action.payload;
            return true;
        case ACTIONS.SET_VOLUME:
            if (
                action.payload.module === 'groove' ||
                action.payload.module === 'drum' ||
                action.payload.module === 'drums'
            ) {
                groove.volume = action.payload.value;
                return true;
            }
            return false;
        case ACTIONS.SET_REVERB:
            if (
                action.payload.module === 'groove' ||
                action.payload.module === 'drum' ||
                action.payload.module === 'drums'
            ) {
                groove.reverb = action.payload.value;
                return true;
            }
            return false;
        case ACTIONS.SET_GROOVE_SEED:
            if (!groove.sectionSeedMap) {
                groove.sectionSeedMap = {};
            }
            (groove.sectionSeedMap as any)[action.payload.sectionId] = action.payload.seed;
            return true;
        case ACTIONS.SET_GENRE_COUNTDOWN:
            if (groove.genreSwitchCountdown !== action.payload) {
                groove.genreSwitchCountdown = action.payload;
                return true;
            }
            return false;
        case ACTIONS.SET_GENRE_FEEL:
            if (playback.isPlaying) {
                groove.pendingGenreFeel = action.payload;
                groove.lastSmartGenre = action.payload.genreName || groove.lastSmartGenre;
            } else {
                groove.genreFeel = action.payload.feel ?? groove.genreFeel;
                groove.pendingGenreFeel = null;
                groove.lastSmartGenre = action.payload.genreName || groove.lastSmartGenre;
                // DeepSignal handles nested reactivity, but we still map to ensure fresh references
                // for any legacy components that might rely on shallow comparison.
                groove.instruments = groove.instruments.map((inst) => ({
                    ...inst,
                    steps: [...inst.steps],
                }));

                if (action.payload.swing !== undefined) {
                    groove.swing = action.payload.swing;
                }
                if (action.payload.sub !== undefined) {
                    groove.swingSub = action.payload.sub;
                }
            }
            return true;
        case ACTIONS.TRIGGER_FILL:
            groove.fillSteps = action.payload.steps;
            groove.fillActive = true;
            groove.fillStartStep = action.payload.startStep;
            groove.fillLength = action.payload.length;
            groove.pendingCrash = !!action.payload.crash;
            return true;
    }
    return false;
}
