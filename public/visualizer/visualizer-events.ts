export type VisualizerTrackId = 'drums' | 'bass' | 'chords' | 'harmony' | 'soloist';

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
    /** Section-relative drum-pattern position used by the groove UI. */
    step: number;
    /** Absolute one-pass chart position used for section/meter resolution. */
    chartStep: number;
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
