/**
 * @typedef {'drums' | 'bass' | 'chords' | 'harmony' | 'soloist'} VisualizerTrackId
 */

/**
 * @typedef {Object} VisualizerTrackMeta
 * @property {VisualizerTrackId} id
 * @property {string} label
 * @property {string} cssVar
 * @property {string} fallback
 * @property {string} legendClass
 * @property {number} midiMin
 * @property {number} midiMax
 */

/**
 * @typedef {Object} VisualizerLegendSwatch
 * @property {string} id
 * @property {string} label
 * @property {string} cssVar
 * @property {string} fallback
 * @property {string} legendClass
 */

/**
 * @typedef {Object} VisualizerNoteEvent
 * @property {'note'} type
 * @property {VisualizerTrackId} track
 * @property {number} time
 * @property {number} midi
 * @property {number} [duration]
 * @property {number} [velocity]
 * @property {string} [noteName]
 * @property {number} [octave]
 * @property {string} [noteType]
 * @property {number[]} [chordNotes]
 * @property {Array<any>} [ccEvents]
 */

/**
 * @typedef {Object} VisualizerChordEvent
 * @property {'chord'} type
 * @property {number} time
 * @property {number} index
 * @property {number[]} chordNotes
 * @property {number} rootMidi
 * @property {number[]} intervals
 * @property {number} duration
 * @property {string} [label]
 * @property {string|null} [sectionId]
 */

/**
 * @typedef {Object} VisualizerStepEvent
 * @property {'step'} type
 * @property {number} time
 * @property {number} step
 */

/**
 * @typedef {Object} VisualizerFillEvent
 * @property {'fill'} type
 * @property {number} time
 * @property {boolean} active
 */

/**
 * @typedef {VisualizerNoteEvent | VisualizerChordEvent | VisualizerStepEvent | VisualizerFillEvent} VisualizerQueuedEvent
 */

export const VISUALIZER_TRACK_ORDER = /** @type {const} */ ([
    'drums',
    'bass',
    'chords',
    'harmony',
    'soloist',
]);

/** @type {Record<VisualizerTrackId, VisualizerTrackMeta>} */
export const VISUALIZER_TRACKS = Object.freeze({
    drums: Object.freeze({
        id: 'drums',
        label: 'Drums',
        cssVar: '--yellow',
        fallback: '#b58900',
        legendClass: 'swatch-drums',
        midiMin: 35,
        midiMax: 59,
    }),
    bass: Object.freeze({
        id: 'bass',
        label: 'Bass',
        cssVar: '--success-color',
        fallback: '#859900',
        legendClass: 'swatch-bass',
        midiMin: 23,
        midiMax: 55,
    }),
    chords: Object.freeze({
        id: 'chords',
        label: 'Chords',
        cssVar: '--accent-color',
        fallback: '#268bd2',
        legendClass: 'swatch-chords',
        midiMin: 48,
        midiMax: 84,
    }),
    harmony: Object.freeze({
        id: 'harmony',
        label: 'Harmony',
        cssVar: '--harmony-color',
        fallback: '#6c71c4',
        legendClass: 'swatch-harmony',
        midiMin: 52,
        midiMax: 90,
    }),
    soloist: Object.freeze({
        id: 'soloist',
        label: 'Soloist',
        cssVar: '--soloist-color',
        fallback: '#d33682',
        legendClass: 'swatch-soloist',
        midiMin: 60,
        midiMax: 96,
    }),
});

/** @type {readonly VisualizerLegendSwatch[]} */
export const VISUALIZER_CHORD_SWATCHES = Object.freeze([
    Object.freeze({
        id: 'root',
        label: 'Root',
        cssVar: '--accent-color',
        fallback: '#268bd2',
        legendClass: 'swatch-root',
    }),
    Object.freeze({
        id: 'guide',
        label: 'Guide',
        cssVar: '--green',
        fallback: '#859900',
        legendClass: 'swatch-third',
    }),
    Object.freeze({
        id: 'fifth',
        label: 'Fifth',
        cssVar: '--orange',
        fallback: '#cb4b16',
        legendClass: 'swatch-fifth',
    }),
    Object.freeze({
        id: 'color',
        label: 'Color',
        cssVar: '--magenta',
        fallback: '#d33682',
        legendClass: 'swatch-seventh',
    }),
]);

/** @type {Set<string>} */
const VISUALIZER_TRACK_IDS = new Set(VISUALIZER_TRACK_ORDER);

/**
 * @param {unknown} track
 * @returns {VisualizerTrackId|null}
 */
export function resolveVisualizerTrack(track) {
    if (!VISUALIZER_TRACK_IDS.has(/** @type {string} */ (track))) {
        return null;
    }
    return /** @type {VisualizerTrackId} */ (track);
}

/**
 * @param {number} time
 * @param {string} eventType
 */
function assertValidTime(time, eventType) {
    if (typeof time !== 'number' || Number.isNaN(time)) {
        throw new TypeError(`Visualizer ${eventType} event requires a numeric time.`);
    }
}

/**
 * @param {VisualizerTrackId | string} track
 * @returns {VisualizerTrackId}
 */
function assertValidTrack(track) {
    if (!VISUALIZER_TRACK_IDS.has(track)) {
        throw new TypeError(`Unknown visualizer track "${track}".`);
    }
    return /** @type {VisualizerTrackId} */ (track);
}

/**
 * @template {VisualizerQueuedEvent} T
 * @param {{ drawQueue: VisualizerQueuedEvent[] }} playback
 * @param {T} event
 * @returns {T}
 */
export function queueVisualizerEvent(playback, event) {
    if (!playback || !Array.isArray(playback.drawQueue)) {
        throw new TypeError('Visualizer event queue requires playback.drawQueue to be an array.');
    }
    playback.drawQueue.push(event);
    return event;
}

/**
 * @param {{
 *   track: VisualizerTrackId | string,
 *   time: number,
 *   midi: number,
 *   duration?: number,
 *   velocity?: number,
 *   noteName?: string,
 *   octave?: number,
 *   noteType?: string,
 *   chordNotes?: number[],
 *   ccEvents?: Array<any>
 * }} payload
 * @returns {VisualizerNoteEvent}
 */
export function createVisualizerNoteEvent(payload) {
    const track = assertValidTrack(payload.track);
    assertValidTime(payload.time, 'note');
    if (typeof payload.midi !== 'number' || Number.isNaN(payload.midi)) {
        throw new TypeError('Visualizer note events require a numeric midi value.');
    }

    /** @type {VisualizerNoteEvent} */
    const event = {
        type: 'note',
        track,
        time: payload.time,
        midi: payload.midi,
    };

    if (typeof payload.duration === 'number') {
        event.duration = payload.duration;
    }
    if (typeof payload.velocity === 'number') {
        event.velocity = payload.velocity;
    }
    if (payload.noteName) {
        event.noteName = payload.noteName;
    }
    if (typeof payload.octave === 'number') {
        event.octave = payload.octave;
    }
    if (payload.noteType) {
        event.noteType = payload.noteType;
    }
    if (Array.isArray(payload.chordNotes) && payload.chordNotes.length > 0) {
        event.chordNotes = payload.chordNotes;
    }
    if (Array.isArray(payload.ccEvents) && payload.ccEvents.length > 0) {
        event.ccEvents = payload.ccEvents;
    }

    return event;
}

/**
 * @param {{ drawQueue: VisualizerQueuedEvent[] }} playback
 * @param {Parameters<typeof createVisualizerNoteEvent>[0]} payload
 * @returns {VisualizerNoteEvent}
 */
export function queueVisualizerNoteEvent(playback, payload) {
    return queueVisualizerEvent(playback, createVisualizerNoteEvent(payload));
}

/**
 * @param {{
 *   time: number,
 *   index: number,
 *   chordNotes: number[],
 *   rootMidi: number,
 *   intervals: number[],
 *   duration: number,
 *   label?: string,
 *   sectionId?: string | null
 * }} payload
 * @returns {VisualizerChordEvent}
 */
export function createVisualizerChordEvent(payload) {
    assertValidTime(payload.time, 'chord');

    /** @type {VisualizerChordEvent} */
    const event = {
        type: 'chord',
        time: payload.time,
        index: payload.index,
        chordNotes: payload.chordNotes,
        rootMidi: payload.rootMidi,
        intervals: payload.intervals,
        duration: payload.duration,
    };

    if (payload.label) {
        event.label = payload.label;
    }
    if (payload.sectionId !== undefined) {
        event.sectionId = payload.sectionId;
    }

    return event;
}

/**
 * @param {{ drawQueue: VisualizerQueuedEvent[] }} playback
 * @param {Parameters<typeof createVisualizerChordEvent>[0]} payload
 * @returns {VisualizerChordEvent}
 */
export function queueVisualizerChordEvent(playback, payload) {
    return queueVisualizerEvent(playback, createVisualizerChordEvent(payload));
}

/**
 * @param {number} time
 * @param {number} step
 * @returns {VisualizerStepEvent}
 */
export function createVisualizerStepEvent(time, step) {
    assertValidTime(time, 'step');
    return {
        type: 'step',
        time,
        step,
    };
}

/**
 * @param {{ drawQueue: VisualizerQueuedEvent[] }} playback
 * @param {number} time
 * @param {number} step
 * @returns {VisualizerStepEvent}
 */
export function queueVisualizerStepEvent(playback, time, step) {
    return queueVisualizerEvent(playback, createVisualizerStepEvent(time, step));
}

/**
 * @param {number} time
 * @param {boolean} active
 * @returns {VisualizerFillEvent}
 */
export function createVisualizerFillEvent(time, active) {
    assertValidTime(time, 'fill');
    return {
        type: 'fill',
        time,
        active,
    };
}

/**
 * @param {{ drawQueue: VisualizerQueuedEvent[] }} playback
 * @param {number} time
 * @param {boolean} active
 * @returns {VisualizerFillEvent}
 */
export function queueVisualizerFillEvent(playback, time, active) {
    return queueVisualizerEvent(playback, createVisualizerFillEvent(time, active));
}
