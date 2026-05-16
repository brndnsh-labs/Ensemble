/**
 * Centralized Action Types for the Ensemble State Manager.
 */

import type { ArrangerState, Section } from './state/arranger.js';
import type { ConductorState } from './state/conductor.js';
import type { GrooveState } from './state/groove.js';
import type { BassState, ChordState, HarmonyState, SoloistState } from './state/instruments.js';
import type { MidiState } from './state/midi.js';
import type { GlobalContext } from './state/playback.js';
import type { VisualizerState } from './state/visualizer.js';

/**
 * One component of a chord display string (root + suffix, with optional slash bass).
 */
export interface ChordNamePart {
    root: string;
    suffix: string;
    bass?: string;
}

/**
 * Pre-formatted chord names in all three notation styles. Built by chords-engine.
 */
export interface FormattedChordNames {
    name: ChordNamePart;
    nns: ChordNamePart;
    roman: ChordNamePart;
}

/**
 * Canonical parsed-chord type produced by `chords-engine.validateProgression()` and
 * consumed by every musical engine. Section-context fields (sectionId, sectionLabel,
 * localIndex, keyIsMinor, repeatIndex) are tagged on by validateProgression after
 * parsing — they're absent on a freshly parsed chord and present once it's been
 * placed in the arrangement.
 */
export interface Chord {
    // --- Display ---
    romanName: string;
    absName: string;
    nnsName: string;
    display: FormattedChordNames;

    // --- Pitch content (audio-critical) ---
    rootMidi: number;
    bassMidi: number | null;
    freqs: number[];
    intervals: number[];

    // --- Quality / harmony ---
    quality: string;
    is7th: boolean;
    isMinor: boolean;

    // --- Temporal / structural ---
    beats: number;
    timeSignature: string;

    // --- Tonal context ---
    key: string;

    // --- Parser metadata (used by the chart editor) ---
    charStart: number;
    charEnd: number;

    // --- Section context (added by validateProgression) ---
    sectionId?: string;
    sectionLabel?: string;
    keyIsMinor?: boolean;
    localIndex?: number;
    repeatIndex?: number;
}

export interface PlaybackIntent {
    /** 0-1 */
    syncopation: number;
    /** 0-1 */
    anticipation: number;
    /** Dilla feel; 0-1 */
    layBack: number;
    /** 0-1 */
    density: number;
}

export interface ModalsState {
    settings: boolean;
    editor: boolean;
    share: boolean;
    generateSong: boolean;
    manual: boolean;
}

export interface EnsembleState {
    arranger: ArrangerState;
    playback: GlobalContext;
    groove: GrooveState;
    bass: BassState;
    soloist: SoloistState;
    harmony: HarmonyState;
    chords: ChordState;
    conductor: ConductorState;
    vizState: VisualizerState;
    midi: MidiState;
}

export interface StepInfo {
    isMeasureStart: boolean;
    isBeatStart: boolean;
    /** Semantic backbeat (e.g., beats 2 & 4). */
    isBackbeat: boolean;
    /** Rhythmic group boundary (e.g., beats 1 & 3). */
    isGroupStart: boolean;
    /** 8th-note offbeat. */
    isOffbeat: boolean;
    /** "e" of a 16th-note beat. */
    isEOfBeat: boolean;
    /** "a" of a 16th-note beat. */
    isAOfBeat: boolean;
    isCompound?: boolean;
    isPulse?: boolean;
    isPulseStart?: boolean;
    /** Alias for isMeasureStart. */
    isDownbeat?: boolean;
    isTurnaround?: boolean;
    beatIndex: number;
    groupIndex: number;
    stepInGroup: number;
    mStep: number;
    stepInBeat?: number;
    tsConfig?: any;
    tsName?: string;
}

export interface ActionPayloadSetParam {
    module: string;
    param: string;
    value: unknown;
}

export interface ActionPayloadSetStyle {
    module: string;
    style: string;
}

export interface ActionPayloadSetVolume {
    module: string;
    value: number;
}

export interface ActionPayloadSetReverb {
    module: string;
    value: number;
}

export interface ActionPayloadSetModalOpen {
    modal: keyof ModalsState;
    open: boolean;
}

export interface ActionPayloadLoadTemplate {
    sections: Section[];
    isMinor?: boolean;
}

export interface ActionPayloadSetGenreFeel {
    genreName?: string;
    feel?: string;
    swing?: number;
    sub?: string;
    chord?: string;
    bass?: string;
    soloist?: string;
    harmony?: string;
}

export interface ActionPayloadUpdateConductorDecision {
    velocity?: number;
    lyricalBias?: number;
    intent?: Partial<PlaybackIntent>;
    density?: string;
    hookProb?: number;
    feel?: string;
    genreName?: string;
    swing?: number;
    sub?: string;
}

export interface ActionPayloadTriggerFill {
    steps: Record<number, unknown>;
    startStep: number;
    length: number;
    crash?: boolean;
}

export interface ActionPayloadSetGrooveSeed {
    sectionId: string;
    seed: number | string;
}

export interface ActionPayloadShowToast {
    id?: string;
    message?: string;
    type?: string;
}

export interface ActionPayloadSetMidiConfig {
    enabled?: boolean;
    outputs?: Array<{ id: string; name: string }>;
    selectedOutputId?: string | null;
    chordsChannel?: number;
    bassChannel?: number;
    soloistChannel?: number;
    harmonyChannel?: number;
    drumsChannel?: number;
    latency?: number;
    muteLocal?: boolean;
    chordsOctave?: number;
    bassOctave?: number;
    soloistOctave?: number;
    harmonyOctave?: number;
    drumsOctave?: number;
    velocitySensitivity?: number;
}

export interface ActionPayloadUpdateConductorState {
    targetIntensity?: number;
    stepSize?: number;
    form?: object | null;
    loopCount?: number;
    formIteration?: number;
}

export type ActionPayloadUpdateHB = Partial<HarmonyState>;
export type ActionPayloadUpdateSB = Partial<SoloistState>;
export type ActionPayloadUpdateGB = Partial<GrooveState>;

export interface ActionPayloadMap {
    SET_PARAM: ActionPayloadSetParam;
    SET_BAND_INTENSITY: number;
    SET_COMPLEXITY: number;
    SET_AUTO_INTENSITY: boolean;
    UPDATE_CONDUCTOR_DECISION: ActionPayloadUpdateConductorDecision;
    UPDATE_CONDUCTOR_STATE: ActionPayloadUpdateConductorState;
    TRIGGER_EMERGENCY_LOOKAHEAD: undefined;
    RESET_SESSION: undefined;
    SHOW_TOAST: ActionPayloadShowToast | string;
    TRIGGER_FLASH?: number;
    SET_UPDATE_AVAILABLE: boolean;
    SET_MODAL_OPEN: ActionPayloadSetModalOpen;
    TOGGLE_PLAY: undefined;
    SET_BPM: number | string;
    SET_STYLE: ActionPayloadSetStyle;
    SET_DENSITY: string;
    SET_VOLUME: ActionPayloadSetVolume;
    SET_REVERB: ActionPayloadSetReverb;
    SET_SOLOIST_MODE: string;
    SET_SOLOIST_SEED: string;
    SET_SOLOIST_PRESET: string;
    UPDATE_SB: ActionPayloadUpdateSB;
    SET_SWING: number;
    SET_SWING_SUB: string;
    SET_HUMANIZE: number;
    SET_GENRE_FEEL: ActionPayloadSetGenreFeel;
    SET_GENRE_COUNTDOWN: number | null;
    SET_ACTIVE_MEASURE: number | string;
    SET_GROOVE_SEED: ActionPayloadSetGrooveSeed;
    TRIGGER_FILL: ActionPayloadTriggerFill;
    UPDATE_HB: ActionPayloadUpdateHB;
    UPDATE_GB: ActionPayloadUpdateGB;
    SET_ARRANGEMENT: Section[];
    SET_SECTIONS: Section[];
    ADD_SECTION: Section;
    REMOVE_SECTION: string;
    UPDATE_SECTION: Section;
    SET_KEY: string;
    SET_TIME_SIGNATURE: string;
    SET_IS_MINOR: boolean;
    LOAD_TEMPLATE: ActionPayloadLoadTemplate;
    SET_METRONOME: boolean;
    SET_PRESET_SETTINGS_MODE: boolean;
    SET_NOTATION: string;
    SET_SESSION_TIMER: number;
    SET_SONG_MODE: boolean;
    SET_STOP_AT_END: boolean;
    SET_ENDING_PENDING: boolean;
    RESET_STATE: undefined;
    SET_MIDI_CONFIG: ActionPayloadSetMidiConfig;
    RESTORE_GAINS: undefined;
    INIT_AUDIO: undefined;
    HYDRATE?: undefined;
    TOAST_EXPIRED?: undefined;
    FLASH_EXPIRED?: undefined;
    KEY_CHANGE?: undefined;
    TIME_SIG_CHANGE?: undefined;
    GROUPING_CHANGE?: undefined;
    REL_KEY_TOGGLE?: undefined;
    TRANSPOSE?: undefined;
    VIS_RESET?: undefined;
    VIS_UPDATE?: unknown;
    PROG_VALIDATED?: undefined;
    DRUM_PRESET_LOADED?: undefined;
}

/**
 * Discriminated union over all known actions. Each reducer's switch on
 * `action.type` narrows `action.payload` to the matching payload type.
 * Loose `dispatch(action: string, payload?: any)` calls still flow through
 * the same shape — unmapped strings fall to each reducer's default arm.
 */
export type Action = {
    [K in keyof ActionPayloadMap]-?: { type: K; payload: ActionPayloadMap[K] };
}[keyof ActionPayloadMap];

export const ACTIONS = {
    // --- Global / Conductor ---
    SET_PARAM: 'SET_PARAM',
    SET_BAND_INTENSITY: 'SET_BAND_INTENSITY',
    SET_COMPLEXITY: 'SET_COMPLEXITY',
    SET_AUTO_INTENSITY: 'SET_AUTO_INTENSITY',
    UPDATE_CONDUCTOR_DECISION: 'UPDATE_CONDUCTOR_DECISION',
    UPDATE_CONDUCTOR_STATE: 'UPDATE_CONDUCTOR_STATE',
    TRIGGER_EMERGENCY_LOOKAHEAD: 'TRIGGER_EMERGENCY_LOOKAHEAD',
    RESET_SESSION: 'RESET_SESSION',
    SHOW_TOAST: 'SHOW_TOAST',
    TRIGGER_FLASH: 'TRIGGER_FLASH',
    SET_UPDATE_AVAILABLE: 'SET_UPDATE_AVAILABLE',
    SET_MODAL_OPEN: 'SET_MODAL_OPEN',
    TOGGLE_PLAY: 'TOGGLE_PLAY',
    SET_BPM: 'SET_BPM',

    // --- Instrument Settings ---
    SET_STYLE: 'SET_STYLE',
    SET_DENSITY: 'SET_DENSITY',
    SET_VOLUME: 'SET_VOLUME',
    SET_REVERB: 'SET_REVERB',
    SET_SOLOIST_MODE: 'SET_SOLOIST_MODE',
    SET_SOLOIST_SEED: 'SET_SOLOIST_SEED',
    SET_SOLOIST_PRESET: 'SET_SOLOIST_PRESET',
    UPDATE_SB: 'UPDATE_SB',

    // --- Groove / Drums ---
    SET_SWING: 'SET_SWING',
    SET_SWING_SUB: 'SET_SWING_SUB',
    SET_HUMANIZE: 'SET_HUMANIZE',
    SET_GENRE_FEEL: 'SET_GENRE_FEEL',
    SET_GENRE_COUNTDOWN: 'SET_GENRE_COUNTDOWN',
    SET_ACTIVE_MEASURE: 'SET_ACTIVE_MEASURE',
    SET_GROOVE_SEED: 'SET_GROOVE_SEED',
    TRIGGER_FILL: 'TRIGGER_FILL',
    UPDATE_HB: 'UPDATE_HB',
    UPDATE_GB: 'UPDATE_GB',

    // --- Options / Arranger ---
    SET_ARRANGEMENT: 'SET_ARRANGEMENT',
    SET_SECTIONS: 'SET_SECTIONS',
    ADD_SECTION: 'ADD_SECTION',
    REMOVE_SECTION: 'REMOVE_SECTION',
    UPDATE_SECTION: 'UPDATE_SECTION',
    SET_KEY: 'SET_KEY',
    SET_TIME_SIGNATURE: 'SET_TIME_SIGNATURE',
    SET_IS_MINOR: 'SET_IS_MINOR',
    LOAD_TEMPLATE: 'LOAD_TEMPLATE',
    SET_METRONOME: 'SET_METRONOME',
    SET_PRESET_SETTINGS_MODE: 'SET_PRESET_SETTINGS_MODE',
    SET_NOTATION: 'SET_NOTATION',
    SET_SESSION_TIMER: 'SET_SESSION_TIMER',
    SET_SONG_MODE: 'SET_SONG_MODE',
    SET_STOP_AT_END: 'SET_STOP_AT_END',
    SET_ENDING_PENDING: 'SET_ENDING_PENDING',
    RESET_STATE: 'RESET_STATE',

    // --- MIDI ---
    SET_MIDI_CONFIG: 'SET_MIDI_CONFIG',
    RESTORE_GAINS: 'RESTORE_GAINS',
    INIT_AUDIO: 'INIT_AUDIO',

    // --- Signal-only / Lifecycle (payload-less notifications) ---
    HYDRATE: 'HYDRATE',
    TOAST_EXPIRED: 'TOAST_EXPIRED',
    FLASH_EXPIRED: 'FLASH_EXPIRED',
    KEY_CHANGE: 'KEY_CHANGE',
    TIME_SIG_CHANGE: 'TIME_SIG_CHANGE',
    GROUPING_CHANGE: 'GROUPING_CHANGE',
    REL_KEY_TOGGLE: 'REL_KEY_TOGGLE',
    TRANSPOSE: 'TRANSPOSE',
    VIS_RESET: 'VIS_RESET',
    VIS_UPDATE: 'VIS_UPDATE',
    PROG_VALIDATED: 'PROG_VALIDATED',
    DRUM_PRESET_LOADED: 'DRUM_PRESET_LOADED',
} as const;
