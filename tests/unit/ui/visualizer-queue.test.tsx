/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { partitionDrawQueue } from '../../../public/components/Visualizer.jsx';
import type {
    VisualizerChordEvent,
    VisualizerQueuedEvent,
} from '../../../public/visualizer/visualizer-events.js';

describe('partitionDrawQueue', () => {
    it('preserves the queued chord event shape during render preparation', () => {
        const chord: VisualizerChordEvent = {
            type: 'chord',
            time: 10,
            index: 2,
            chordNotes: [60, 64, 67],
            rootMidi: 60,
            intervals: [0, 4, 7],
            duration: 2,
            label: 'C',
            sectionId: 'verse',
        };
        const queue: VisualizerQueuedEvent[] = [chord];
        const before = structuredClone(chord);

        const { readyEvents, remainingEvents } = partitionDrawQueue(queue, 10);

        expect(readyEvents).toEqual([before]);
        expect(remainingEvents).toEqual([]);
        expect(chord).toEqual(before);
    });

    it('drops stale backlog and returns only due events for the current frame', () => {
        const queue = [
            { type: 'step', time: 5, step: 4 },
            { type: 'step', time: 8, step: 8 },
            { type: 'note', track: 'bass', time: 9, midi: 36 },
            { type: 'note', track: 'soloist', time: 11, midi: 72 },
        ];

        const { readyEvents, remainingEvents } = partitionDrawQueue(queue, 10.0);

        expect(readyEvents).toEqual([
            { type: 'step', time: 8, step: 8 },
            { type: 'note', track: 'bass', time: 9, midi: 36 },
        ]);
        expect(remainingEvents).toEqual([{ type: 'note', track: 'soloist', time: 11, midi: 72 }]);
    });

    it('bounds oversized backlogs to the retained tail before processing due events', () => {
        const queue = Array.from({ length: 505 }, (_, index) => ({
            type: 'step',
            time: Number((100 + index * 0.005).toFixed(3)),
            step: index,
        }));

        const { readyEvents, remainingEvents } = partitionDrawQueue(queue, 101.62);

        expect(readyEvents).toHaveLength(20);
        expect(readyEvents[0].time).toBeCloseTo(101.525);
        expect(readyEvents.at(-1)?.time).toBeCloseTo(101.62);
        expect(remainingEvents).toHaveLength(180);
        expect(remainingEvents[0].time).toBeCloseTo(101.625);
    });

    it('returns the original queue reference when nothing is ready or stale', () => {
        const queue = [
            { type: 'note', track: 'soloist', time: 12.0, midi: 74 },
            { type: 'note', track: 'harmony', time: 12.5, midi: 67 },
        ];

        const { readyEvents, remainingEvents } = partitionDrawQueue(queue, 10.0);

        expect(readyEvents).toEqual([]);
        expect(remainingEvents).toBe(queue);
    });
});
