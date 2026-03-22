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
 * @property {boolean} [isPulse] - True if the step is on a primary pulse boundary.
 * @property {boolean} [isPulseStart] - True if the step is the start of a pulse.
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

/**
 * @typedef {Object} ActionPayloadSetParam
 * @property {string} module
 * @property {string} param
 * @property {any} value
 */

/**
 * @typedef {Object} ActionPayloadSetStyle
 * @property {string} module
 * @property {string} style
 */

/**
 * @typedef {Object} ActionPayloadSetVolume
 * @property {string} module
 * @property {number} value
 */

/**
 * @typedef {Object} ActionPayloadSetReverb
 * @property {string} module
 * @property {number} value
 */

/**
 * @typedef {Object} ActionPayloadSetOctave
 * @property {string} module
 * @property {number} value
 */

/**
 * @typedef {Object} ActionPayloadSetActiveTab
 * @property {string} module
 * @property {string} tab
 */

/**
 * @typedef {Object} ActionPayloadSetModalOpen
 * @property {keyof ModalsState} modal
 * @property {boolean} open
 */

/**
 * @typedef {Object} ActionPayloadImportMusicXML
 * @property {boolean} hasChords
 * @property {Array<import('./state/arranger.js').Section>} [sections]
 * @property {string} [xmlKey]
 * @property {Array<any>} [leadSheetMelody]
 */

/**
 * @typedef {Object} ActionPayloadLoadTemplate
 * @property {Array<import('./state/arranger.js').Section>} sections
 * @property {boolean} [isMinor]
 */

/**
 * @typedef {Object} ActionPayloadSetGenreFeel
 * @property {string} [genreName]
 * @property {string} [feel]
 * @property {number} [swing]
 * @property {string} [sub]
 * @property {string} [chord]
 * @property {string} [bass]
 * @property {string} [soloist]
 * @property {string} [harmony]
 */

/**
 * @typedef {Object} ActionPayloadUpdateConductorDecision
 * @property {number} [velocity]
 * @property {number} [lyricalBias]
 * @property {Partial<PlaybackIntent>} [intent]
 * @property {string} [density]
 * @property {number} [hookProb]
 * @property {string} [feel]
 * @property {string} [genreName]
 * @property {number} [swing]
 * @property {string} [sub]
 */

/**
 * @typedef {Object} ActionPayloadTriggerFill
 * @property {Record<number, any>} steps
 * @property {number} startStep
 * @property {number} length
 * @property {boolean} [crash]
 */

/**
 * @typedef {Object} ActionPayloadSetGrooveSteps
 * @property {string} instrument
 * @property {Array<number>} steps
 */

/**
 * @typedef {Object} ActionPayloadSetGrooveSeed
 * @property {string} sectionId
 * @property {number|string} seed
 */

/**
 * @typedef {Object} ActionPayloadShowToast
 * @property {string} [id]
 * @property {string} [message]
 */

/**
 * @typedef {Object} ActionPayloadSetPocketConfig
 * @property {number} [globalDrive]
 * @property {number} [tightness]
 * @property {number} [bassGravity]
 * @property {number} [chordGravity]
 * @property {number} [soloistGravity]
 */

/**
 * @typedef {Object} ActionPayloadSetMidiConfig
 * @property {boolean} [enabled]
 * @property {Array<{id: string, name: string}>} [outputs]
 * @property {string|null} [selectedOutputId]
 * @property {number} [chordsChannel]
 * @property {number} [bassChannel]
 * @property {number} [soloistChannel]
 * @property {number} [harmonyChannel]
 * @property {number} [drumsChannel]
 * @property {number} [latency]
 * @property {boolean} [muteLocal]
 * @property {number} [chordsOctave]
 * @property {number} [bassOctave]
 * @property {number} [soloistOctave]
 * @property {number} [harmonyOctave]
 * @property {number} [drumsOctave]
 * @property {number} [velocitySensitivity]
 */

/**
 * @typedef {Object} ActionPayloadUpdateConductorState
 * @property {number} [targetIntensity]
 * @property {number} [stepSize]
 * @property {number} [larsBpmOffset]
 * @property {Object|null} [form]
 * @property {number} [loopCount]
 * @property {number} [formIteration]
 */

/**
 * @typedef {Partial<import('./state/instruments.js').HarmonyState>} ActionPayloadUpdateHB
 */

/**
 * @typedef {Partial<import('./state/instruments.js').SoloistState>} ActionPayloadUpdateSB
 */

/**
 * @typedef {Partial<import('./state/groove.js').GrooveState>} ActionPayloadUpdateGB
 */

/**
 * @typedef {Object} ActionPayloadMap
 * @property {ActionPayloadImportMusicXML} IMPORT_MUSICXML
 * @property {undefined} CLEAR_LEAD_SHEET
 * @property {undefined} GENERATE_SEED
 * @property {ActionPayloadSetParam} SET_PARAM
 * @property {number} SET_BAND_INTENSITY
 * @property {number} SET_COMPLEXITY
 * @property {boolean} SET_AUTO_INTENSITY
 * @property {ActionPayloadUpdateConductorDecision} UPDATE_CONDUCTOR_DECISION
 * @property {ActionPayloadUpdateConductorState} UPDATE_CONDUCTOR_STATE
 * @property {undefined} TRIGGER_EMERGENCY_LOOKAHEAD
 * @property {undefined} RESET_SESSION
 * @property {number} SET_SESSION_STEPS
 * @property {ActionPayloadShowToast | string} SHOW_TOAST
 * @property {number} [TRIGGER_FLASH]
 * @property {boolean} SET_UPDATE_AVAILABLE
 * @property {ActionPayloadSetModalOpen} SET_MODAL_OPEN
 * @property {boolean} SET_VIZ_ENABLED
 * @property {boolean} [TOGGLE_MAXIMIZED_CHORDS]
 * @property {undefined} TOGGLE_PLAY
 * @property {number | string} SET_BPM
 * @property {ActionPayloadSetStyle} SET_STYLE
 * @property {string} SET_DENSITY
 * @property {ActionPayloadSetVolume} SET_VOLUME
 * @property {ActionPayloadSetReverb} SET_REVERB
 * @property {ActionPayloadSetOctave} SET_OCTAVE
 * @property {string} SET_SOLOIST_MODE
 * @property {string} SET_SOLOIST_SEED
 * @property {ActionPayloadSetActiveTab} SET_ACTIVE_TAB
 * @property {string} SET_SOLOIST_PRESET
 * @property {ActionPayloadUpdateSB} UPDATE_SB
 * @property {number} SET_SWING
 * @property {string} SET_SWING_SUB
 * @property {number} SET_HUMANIZE
 * @property {boolean} SET_FOLLOW_PLAYBACK
 * @property {boolean} SET_LARS_MODE
 * @property {number} SET_LARS_INTENSITY
 * @property {boolean} SET_CREATIVITY
 * @property {ActionPayloadSetGenreFeel} SET_GENRE_FEEL
 * @property {number | null} SET_GENRE_COUNTDOWN
 * @property {ActionPayloadSetPocketConfig} SET_POCKET_CONFIG
 * @property {ActionPayloadSetGrooveSteps} SET_GROOVE_STEPS
 * @property {number | string} SET_ACTIVE_MEASURE
 * @property {ActionPayloadSetGrooveSeed} SET_GROOVE_SEED
 * @property {undefined} STEP_TOGGLE
 * @property {ActionPayloadTriggerFill} TRIGGER_FILL
 * @property {ActionPayloadUpdateHB} UPDATE_HB
 * @property {ActionPayloadUpdateGB} UPDATE_GB
 * @property {Array<import('./state/arranger.js').Section>} SET_ARRANGEMENT
 * @property {Array<import('./state/arranger.js').Section>} SET_SECTIONS
 * @property {import('./state/arranger.js').Section} ADD_SECTION
 * @property {string} REMOVE_SECTION
 * @property {import('./state/arranger.js').Section} UPDATE_SECTION
 * @property {string} SET_KEY
 * @property {string} SET_TIME_SIGNATURE
 * @property {boolean} SET_IS_MINOR
 * @property {ActionPayloadLoadTemplate} LOAD_TEMPLATE
 * @property {boolean} SET_METRONOME
 * @property {boolean} SET_PRESET_SETTINGS_MODE
 * @property {boolean} SET_PIANO_ROOTS
 * @property {string} SET_NOTATION
 * @property {number} SET_SESSION_TIMER
 * @property {boolean} SET_SONG_MODE
 * @property {boolean} SET_STOP_AT_END
 * @property {boolean} SET_ENDING_PENDING
 * @property {undefined} RESET_STATE
 * @property {ActionPayloadSetMidiConfig} SET_MIDI_CONFIG
 * @property {undefined} RESTORE_GAINS
 * @property {undefined} INIT_AUDIO
 * @property {undefined} [HYDRATE]
 * @property {string} [TOAST_EXPIRED]
 * @property {undefined} [FLASH_EXPIRED]
 * @property {undefined} [KEY_CHANGE]
 * @property {undefined} [TIME_SIG_CHANGE]
 * @property {undefined} [GROUPING_CHANGE]
 * @property {undefined} [REL_KEY_TOGGLE]
 * @property {undefined} [TRANSPOSE]
 * @property {undefined} [VIS_RESET]
 * @property {any} [VIS_UPDATE]
 * @property {undefined} [PROG_VALIDATED]
 * @property {undefined} [DRUM_PRESET_LOADED]
 * @property {undefined} [DRUM_MEASURE_CLONED]
 * @property {undefined} [MOBILE_TAB_SWITCH]
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
