/**
 * Centralized Action Types for the Ensemble State Manager.
 */

/**
 * @typedef {Object} PlaybackIntent
 * @property {number} syncopation - Level of rhythmic syncopation (0-1).
 * @property {number} anticipation - Probability of rhythmic anticipation (0-1).
 * @property {number} layBack - Level of rhythmic lag (Dilla feel) (0-1).
 * @property {number} density - Overall rhythmic density (0-1).
 */

/**
 * @typedef {Object} ModalsState
 * @property {boolean} settings - Settings modal visibility.
 * @property {boolean} editor - Song editor modal visibility.
 * @property {boolean} share - Share modal visibility.
 * @property {boolean} analyzer - Audio analyzer modal visibility.
 * @property {boolean} generateSong - Song generator modal visibility.
 * @property {boolean} performance - Performance mode modal visibility.
 * @property {boolean} manual - User manual modal visibility.
 * @property {boolean} drumPad - Drum pad modal visibility.
 */

/**
 * @typedef {Object} EnsembleState
 * @property {import('./state/arranger.js').ArrangerState} arranger - Chord progression and arrangement state.
 * @property {import('./state/playback.js').GlobalContext} playback - Real-time transport and intensity state.
 * @property {import('./state/groove.js').GrooveState} groove - Rhythmic engine state.
 * @property {import('./state/instruments.js').BassState} bass - Bass engine state.
 * @property {import('./state/instruments.js').SoloistState} soloist - Melodic soloist state.
 * @property {import('./state/instruments.js').HarmonyState} harmony - Background harmony state.
 * @property {import('./state/instruments.js').ChordState} chords - Accompaniment chords state.
 * @property {import('./state/conductor.js').ConductorState} conductor - Macro-arc and intensity drift state.
 * @property {import('./state/visualizer.js').VisualizerState} vizState - Visualizer rendering state.
 * @property {import('./state/midi.js').MidiState} midi - WebMIDI routing and local muting state.
 */

/**
 * @typedef {Object} ChordContext
 * @property {Object} chord - The current chord object.
 * @property {number} stepInChord - Step index relative to the start of the current chord.
 * @property {number} chordIndex - Index of the chord in the stepMap.
 * @property {number} [sectionStart] - Global start step of the current section.
 * @property {number} [sectionEnd] - Global end step of the current section.
 */

/**
 * @typedef {Object} StepInfo
 * @property {boolean} isMeasureStart - True if the step is on the first beat of a measure.
 * @property {boolean} isBeatStart - True if the step is on a beat boundary.
 * @property {boolean} isBackbeat - True if the step is on a semantic backbeat (e.g., 2 & 4).
 * @property {boolean} isGroupStart - True if the step is on a rhythmic group boundary (e.g., 1 & 3).
 * @property {boolean} isOffbeat - True if the step is on an 8th-note offbeat.
 * @property {boolean} isEOfBeat - True if the step is on the "e" of a 16th-note beat.
 * @property {boolean} isAOfBeat - True if the step is on the "a" of a 16th-note beat.
 * @property {boolean} [isCompound] - True if the time signature is compound (e.g., 6/8).
 * @property {boolean} [isDownbeat] - Alias for isMeasureStart.
 * @property {boolean} [isTurnaround] - True if this is the final bar of a section.
 * @property {number} beatIndex - 0-indexed beat number within the measure.
 * @property {number} groupIndex - 0-indexed group index within the measure.
 * @property {number} stepInGroup - 0-indexed step within the current rhythmic group.
 * @property {number} mStep - 0-indexed step within the current measure.
 * @property {number} [stepInBeat] - 0-indexed step within the current beat.
 * @property {any} [tsConfig] - Time signature configuration object.
 * @property {string} [tsName] - Name of the time signature (e.g., "4/4").
 */

export const ACTIONS = {
    IMPORT_MUSICXML: 'IMPORT_MUSICXML',
    CLEAR_LEAD_SHEET: 'CLEAR_LEAD_SHEET',
    GENERATE_SEED: 'GENERATE_SEED',
    // --- Global / Conductor ---
    SET_PARAM: 'SET_PARAM',
    SET_BAND_INTENSITY: 'SET_BAND_INTENSITY',
    SET_COMPLEXITY: 'SET_COMPLEXITY',
    SET_AUTO_INTENSITY: 'SET_AUTO_INTENSITY',
    UPDATE_CONDUCTOR_DECISION: 'UPDATE_CONDUCTOR_DECISION',
    UPDATE_CONDUCTOR_STATE: 'UPDATE_CONDUCTOR_STATE',
    TRIGGER_EMERGENCY_LOOKAHEAD: 'TRIGGER_EMERGENCY_LOOKAHEAD',
    RESET_SESSION: 'RESET_SESSION',
    SET_SESSION_STEPS: 'SET_SESSION_STEPS',
    SHOW_TOAST: 'SHOW_TOAST',
    TRIGGER_FLASH: 'TRIGGER_FLASH',
    SET_UPDATE_AVAILABLE: 'SET_UPDATE_AVAILABLE',
    SET_MODAL_OPEN: 'SET_MODAL_OPEN',
    SET_VIZ_ENABLED: 'SET_VIZ_ENABLED',
    TOGGLE_MAXIMIZED_CHORDS: 'TOGGLE_MAXIMIZED_CHORDS',
    TOGGLE_PLAY: 'TOGGLE_PLAY',
    SET_BPM: 'SET_BPM',

    // --- Instrument Settings ---
    SET_STYLE: 'SET_STYLE',
    SET_DENSITY: 'SET_DENSITY',
    SET_VOLUME: 'SET_VOLUME',
    SET_REVERB: 'SET_REVERB',
    SET_OCTAVE: 'SET_OCTAVE',
    SET_SOLOIST_MODE: 'SET_SOLOIST_MODE',
    SET_SOLOIST_SEED: 'SET_SOLOIST_SEED',
    SET_ACTIVE_TAB: 'SET_ACTIVE_TAB',
    SET_SOLOIST_PRESET: 'SET_SOLOIST_PRESET',
    UPDATE_SB: 'UPDATE_SB',

    // --- Groove / Drums ---
    SET_SWING: 'SET_SWING',
    SET_SWING_SUB: 'SET_SWING_SUB',
    SET_HUMANIZE: 'SET_HUMANIZE',
    SET_FOLLOW_PLAYBACK: 'SET_FOLLOW_PLAYBACK',
    SET_LARS_MODE: 'SET_LARS_MODE',
    SET_LARS_INTENSITY: 'SET_LARS_INTENSITY',
    SET_CREATIVITY: 'SET_CREATIVITY',
    SET_GENRE_FEEL: 'SET_GENRE_FEEL',
    SET_GENRE_COUNTDOWN: 'SET_GENRE_COUNTDOWN',
    SET_POCKET_CONFIG: 'SET_POCKET_CONFIG',
    SET_GROOVE_STEPS: 'SET_GROOVE_STEPS',
    SET_ACTIVE_MEASURE: 'SET_ACTIVE_MEASURE',
    SET_GROOVE_SEED: 'SET_GROOVE_SEED',
    STEP_TOGGLE: 'STEP_TOGGLE',
    TRIGGER_FILL: 'TRIGGER_FILL',
    UPDATE_HB: 'UPDATE_HB',

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
    SET_PIANO_ROOTS: 'SET_PIANO_ROOTS',
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
};
