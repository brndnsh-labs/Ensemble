/**
 * Centralized Action Types for the Ensemble State Manager.
 */

/**
 * @typedef {Object} EnsembleState
 * @property {Object} arranger - Chord progression and arrangement state.
 * @property {Array} arranger.progression - Array of chord entries.
 * @property {number} arranger.totalSteps - Total steps in the arrangement.
 * @property {Array} arranger.stepMap - Flat map of chord entries per step range.
 * @property {Array} arranger.sectionMap - Map of sections (Intro, Verse, etc.).
 * @property {string} arranger.key - Global key root.
 * @property {boolean} arranger.isMinor - True if the global key is minor.
 *
 * @property {Object} playback - Real-time transport and intensity state.
 * @property {boolean} playback.isPlaying - Current transport status.
 * @property {number} playback.bpm - Current tempo.
 * @property {number} playback.bandIntensity - Global 0.0-1.0 intensity value.
 * @property {number} playback.step - The current playback step (updated by scheduler).
 *
 * @property {Object} groove - Rhythmic engine state.
 * @property {string} groove.genreFeel - Selected musical style (e.g., 'Jazz', 'Funk').
 * @property {number} groove.swing - Swing percentage (0-100).
 * @property {Array} groove.instruments - List of drum instruments and their patterns.
 *
 * @property {Object} bass - Bass engine state.
 * @property {string} bass.style - Selected bass technique (e.g., 'Walking', 'Slap').
 * @property {number} bass.octave - Center MIDI octave.
 *
 * @property {Object} soloist - Melodic soloist state.
 * @property {string} soloist.style - Melodic style (e.g., 'Bird', 'Bebop').
 * @property {number} soloist.busySteps - Local phrasing counter for rests.
 *
 * @property {Object} harmony - Background harmony state.
 * @property {string} harmony.style - Harmony style (e.g., 'Stabs', 'Pads').
 */

/**
 * @typedef {Object} ChordContext
 * @property {Object} chord - The current chord object.
 * @property {number} stepInChord - Step index relative to the start of the current chord.
 * @property {number} chordIndex - Index of the chord in the stepMap.
 * @property {number} sectionStart - Global start step of the current section.
 * @property {number} sectionEnd - Global end step of the current section.
 */

/**
 * @typedef {Object} StepInfo
 * @property {boolean} isMeasureStart - True if the step is on the first beat of a measure.
 * @property {boolean} isBeatStart - True if the step is on a beat boundary.
 * @property {boolean} isBackbeat - True if the step is on a semantic backbeat (e.g., 2 & 4).
 * @property {number} beatIndex - 0-indexed beat number within the measure.
 * @property {number} mStep - 0-indexed step within the current measure.
 */

export const ACTIONS = {
    IMPORT_MUSICXML: 'IMPORT_MUSICXML',
    CLEAR_LEAD_SHEET: 'CLEAR_LEAD_SHEET',
    // --- Global / Conductor ---
    SET_PARAM: 'SET_PARAM',
    SET_BAND_INTENSITY: 'SET_BAND_INTENSITY',
    SET_COMPLEXITY: 'SET_COMPLEXITY',
    SET_AUTO_INTENSITY: 'SET_AUTO_INTENSITY',
    UPDATE_CONDUCTOR_DECISION: 'UPDATE_CONDUCTOR_DECISION',
    TRIGGER_EMERGENCY_LOOKAHEAD: 'TRIGGER_EMERGENCY_LOOKAHEAD',
    RESET_SESSION: 'RESET_SESSION',
    SET_SESSION_STEPS: 'SET_SESSION_STEPS',
    SHOW_TOAST: 'SHOW_TOAST',
    TRIGGER_FLASH: 'TRIGGER_FLASH',
    SET_UPDATE_AVAILABLE: 'SET_UPDATE_AVAILABLE',
    SET_MODAL_OPEN: 'SET_MODAL_OPEN',
    SET_VIZ_ENABLED: 'SET_VIZ_ENABLED',
    TOGGLE_PLAY: 'TOGGLE_PLAY',
    SET_BPM: 'SET_BPM',

    // --- Instrument Settings ---
    SET_STYLE: 'SET_STYLE',
    SET_DENSITY: 'SET_DENSITY',
    SET_VOLUME: 'SET_VOLUME',
    SET_REVERB: 'SET_REVERB',
    SET_OCTAVE: 'SET_OCTAVE',
    SET_SOLOIST_MODE: 'SET_SOLOIST_MODE',
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
};
