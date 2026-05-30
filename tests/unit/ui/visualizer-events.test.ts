import { describe, expect, it } from 'vitest';
import {
    createVisualizerNoteEvent,
    queueVisualizerChordEvent,
    queueVisualizerFillEvent,
    queueVisualizerNoteEvent,
    queueVisualizerStepEvent,
    VISUALIZER_TRACK_ORDER,
    VISUALIZER_TRACKS,
} from '../../../public/visualizer-events.js';

describe('visualizer event contract', () => {
    it('uses the Studio-aligned track order and color tokens', () => {
        expect(VISUALIZER_TRACK_ORDER).toEqual(['drums', 'bass', 'chords', 'harmony', 'soloist']);
        // Each lane binds to its own instrument-color token. Notably chords use
        // --chords-color (not --accent-color): the app accent is brass, but the
        // chords lane keeps its blue identity. Drums use --groove-color (taupe).
        expect(VISUALIZER_TRACKS.drums.cssVar).toBe('--groove-color');
        expect(VISUALIZER_TRACKS.chords.cssVar).toBe('--chords-color');
        expect(VISUALIZER_TRACKS.soloist.cssVar).toBe('--soloist-color');
        expect(VISUALIZER_TRACKS.bass.midiMin).toBe(23);
        expect(VISUALIZER_TRACKS.soloist.midiMax).toBe(96);
    });

    it('creates normalized note events', () => {
        expect(
            createVisualizerNoteEvent({
                track: 'chords',
                time: 12.5,
                midi: 64,
                duration: 0.5,
                noteName: 'E',
                octave: 4,
            }),
        ).toEqual({
            type: 'note',
            track: 'chords',
            time: 12.5,
            midi: 64,
            duration: 0.5,
            noteName: 'E',
            octave: 4,
        });
    });

    it('queues normalized timeline events onto playback.drawQueue', () => {
        const playback = { drawQueue: [] };

        queueVisualizerNoteEvent(playback, {
            track: 'bass',
            time: 1,
            midi: 36,
            duration: 0.4,
            noteName: 'C',
            octave: 2,
        });
        queueVisualizerChordEvent(playback, {
            time: 1.2,
            index: 3,
            chordNotes: [60, 64, 67],
            rootMidi: 60,
            intervals: [0, 4, 7],
            duration: 2,
            label: 'Cmaj7',
        });
        queueVisualizerStepEvent(playback, 1.25, 12);
        queueVisualizerFillEvent(playback, 1.5, true);

        expect(playback.drawQueue).toEqual([
            {
                type: 'note',
                track: 'bass',
                time: 1,
                midi: 36,
                duration: 0.4,
                noteName: 'C',
                octave: 2,
            },
            {
                type: 'chord',
                time: 1.2,
                index: 3,
                chordNotes: [60, 64, 67],
                rootMidi: 60,
                intervals: [0, 4, 7],
                duration: 2,
                label: 'Cmaj7',
            },
            {
                type: 'step',
                time: 1.25,
                step: 12,
            },
            {
                type: 'fill',
                time: 1.5,
                active: true,
            },
        ]);
    });

    it('throws for unknown tracks so contract drift fails loudly', () => {
        expect(() =>
            createVisualizerNoteEvent({
                track: 'piano',
                time: 1,
                midi: 60,
            }),
        ).toThrow(/Unknown visualizer track/);
    });
});
