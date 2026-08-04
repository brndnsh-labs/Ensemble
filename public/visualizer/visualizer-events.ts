export type VisualizerTrackId = 'drums' | 'bass' | 'chords' | 'harmony' | 'soloist';

export interface VisualizerTrackMeta {
    id: VisualizerTrackId;
    label: string;
    cssVar: string;
    fallback: string;
    legendClass: string;
    midiMin: number;
    midiMax: number;
}

export interface VisualizerLegendSwatch {
    id: string;
    label: string;
    cssVar: string;
    fallback: string;
    legendClass: string;
}

export interface VisualizerNoteEvent {
    type: 'note';
    track: VisualizerTrackId;
    time: number;
    midi: number;
    duration?: number;
    velocity?: number;
    /**
     * Audit-only (#1351): the exact final scalar handed to the voice — post-conductor,
     * post-humanization. `velocity` stays the UI-facing value; verification tooling
     * (`mix:verify`) reads this one. The visualizer never renders it.
     */
    renderVelocity?: number;
    /**
     * Audit-only (#1351): post-articulation linear attenuation (`muteGain`), default 1.
     * Lets the verifier tell an intended-quiet attack from a failed one.
     */
    levelScale?: number;
    noteName?: string;
    octave?: number;
    noteType?: string;
    chordNotes?: number[];
    ccEvents?: any[];
}

export interface VisualizerChordEvent {
    type: 'chord';
    time: number;
    index: number;
    chordNotes: number[];
    rootMidi: number;
    intervals: number[];
    duration: number;
    label?: string;
    sectionId?: string | null;
}

export interface VisualizerStepEvent {
    type: 'step';
    time: number;
    step: number;
}

export interface VisualizerFillEvent {
    type: 'fill';
    time: number;
    active: boolean;
}

export type VisualizerQueuedEvent =
    | VisualizerNoteEvent
    | VisualizerChordEvent
    | VisualizerStepEvent
    | VisualizerFillEvent;

export const VISUALIZER_TRACK_ORDER = ['drums', 'bass', 'chords', 'harmony', 'soloist'] as const;

export const VISUALIZER_TRACKS: Record<VisualizerTrackId, VisualizerTrackMeta> = Object.freeze({
    drums: Object.freeze({
        id: 'drums',
        label: 'Drums',
        cssVar: '--groove-color',
        fallback: '#b8a98a',
        legendClass: 'swatch-drums',
        midiMin: 35,
        midiMax: 59,
    }),
    bass: Object.freeze({
        id: 'bass',
        label: 'Bass',
        cssVar: '--success-color',
        fallback: '#9ab33a',
        legendClass: 'swatch-bass',
        midiMin: 23,
        midiMax: 55,
    }),
    chords: Object.freeze({
        id: 'chords',
        label: 'Chords',
        // Chords keep their blue identity — the brass accent is the app's, not
        // the chords lane's, so this must NOT track --accent-color.
        cssVar: '--chords-color',
        fallback: '#4a9fd4',
        legendClass: 'swatch-chords',
        midiMin: 48,
        midiMax: 84,
    }),
    harmony: Object.freeze({
        id: 'harmony',
        label: 'Harmony',
        cssVar: '--harmony-color',
        fallback: '#8b86d6',
        legendClass: 'swatch-harmony',
        midiMin: 52,
        midiMax: 90,
    }),
    soloist: Object.freeze({
        id: 'soloist',
        label: 'Soloist',
        cssVar: '--soloist-color',
        fallback: '#e0568f',
        legendClass: 'swatch-soloist',
        midiMin: 60,
        midiMax: 96,
    }),
});

export const VISUALIZER_CHORD_SWATCHES: readonly VisualizerLegendSwatch[] = Object.freeze([
    Object.freeze({
        id: 'root',
        label: 'Root',
        cssVar: '--chords-color',
        fallback: '#4a9fd4',
        legendClass: 'swatch-root',
    }),
    Object.freeze({
        id: 'guide',
        label: 'Guide',
        cssVar: '--green',
        fallback: '#9ab33a',
        legendClass: 'swatch-third',
    }),
    Object.freeze({
        id: 'fifth',
        label: 'Fifth',
        cssVar: '--orange',
        fallback: '#e07a3c',
        legendClass: 'swatch-fifth',
    }),
    Object.freeze({
        id: 'color',
        label: 'Color',
        cssVar: '--magenta',
        fallback: '#e0568f',
        legendClass: 'swatch-seventh',
    }),
]);

const VISUALIZER_TRACK_IDS = new Set<string>(VISUALIZER_TRACK_ORDER);

export function resolveVisualizerTrack(track: unknown): VisualizerTrackId | null {
    if (!VISUALIZER_TRACK_IDS.has(track as string)) {
        return null;
    }
    return track as VisualizerTrackId;
}

function assertValidTime(time: number, eventType: string): void {
    if (typeof time !== 'number' || Number.isNaN(time)) {
        throw new TypeError(`Visualizer ${eventType} event requires a numeric time.`);
    }
}

function assertValidTrack(track: VisualizerTrackId | string): VisualizerTrackId {
    if (!VISUALIZER_TRACK_IDS.has(track)) {
        throw new TypeError(`Unknown visualizer track "${track}".`);
    }
    return track as VisualizerTrackId;
}

function queueVisualizerEvent<T extends VisualizerQueuedEvent>(
    playback: { drawQueue: VisualizerQueuedEvent[] },
    event: T,
): T {
    if (!playback || !Array.isArray(playback.drawQueue)) {
        throw new TypeError('Visualizer event queue requires playback.drawQueue to be an array.');
    }
    playback.drawQueue.push(event);
    return event;
}

export function createVisualizerNoteEvent(payload: {
    track: VisualizerTrackId | string;
    time: number;
    midi: number;
    duration?: number;
    velocity?: number;
    renderVelocity?: number;
    levelScale?: number;
    noteName?: string;
    octave?: number;
    noteType?: string;
    chordNotes?: number[];
    ccEvents?: any[];
}): VisualizerNoteEvent {
    const track = assertValidTrack(payload.track);
    assertValidTime(payload.time, 'note');
    if (typeof payload.midi !== 'number' || Number.isNaN(payload.midi)) {
        throw new TypeError('Visualizer note events require a numeric midi value.');
    }

    const event: VisualizerNoteEvent = {
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
    if (typeof payload.renderVelocity === 'number') {
        event.renderVelocity = payload.renderVelocity;
    }
    if (typeof payload.levelScale === 'number') {
        event.levelScale = payload.levelScale;
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

export function queueVisualizerNoteEvent(
    playback: { drawQueue: VisualizerQueuedEvent[] },
    payload: Parameters<typeof createVisualizerNoteEvent>[0],
): VisualizerNoteEvent {
    return queueVisualizerEvent(playback, createVisualizerNoteEvent(payload));
}

export function createVisualizerChordEvent(payload: {
    time: number;
    index: number;
    chordNotes: number[];
    rootMidi: number;
    intervals: number[];
    duration: number;
    label?: string;
    sectionId?: string | null;
}): VisualizerChordEvent {
    assertValidTime(payload.time, 'chord');

    const event: VisualizerChordEvent = {
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

export function queueVisualizerChordEvent(
    playback: { drawQueue: VisualizerQueuedEvent[] },
    payload: Parameters<typeof createVisualizerChordEvent>[0],
): VisualizerChordEvent {
    return queueVisualizerEvent(playback, createVisualizerChordEvent(payload));
}

function createVisualizerStepEvent(time: number, step: number): VisualizerStepEvent {
    assertValidTime(time, 'step');
    return { type: 'step', time, step };
}

export function queueVisualizerStepEvent(
    playback: { drawQueue: VisualizerQueuedEvent[] },
    time: number,
    step: number,
): VisualizerStepEvent {
    return queueVisualizerEvent(playback, createVisualizerStepEvent(time, step));
}

function createVisualizerFillEvent(time: number, active: boolean): VisualizerFillEvent {
    assertValidTime(time, 'fill');
    return { type: 'fill', time, active };
}

export function queueVisualizerFillEvent(
    playback: { drawQueue: VisualizerQueuedEvent[] },
    time: number,
    active: boolean,
): VisualizerFillEvent {
    return queueVisualizerEvent(playback, createVisualizerFillEvent(time, active));
}
