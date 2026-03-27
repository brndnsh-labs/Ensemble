/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { partitionDrawQueue } from '../../../public/components/Visualizer.jsx';

describe('partitionDrawQueue', () => {
    it('drops stale backlog and returns only due events for the current frame', () => {
        const queue = [
            { type: 'drum_vis', time: 5 },
            { type: 'drum_vis', time: 8 },
            { type: 'bass_vis', time: 9 },
            { type: 'soloist_vis', time: 11 },
        ];

        const { readyEvents, remainingEvents } = partitionDrawQueue(queue, 10.0);

        expect(readyEvents).toEqual([
            { type: 'drum_vis', time: 8 },
            { type: 'bass_vis', time: 9 },
        ]);
        expect(remainingEvents).toEqual([{ type: 'soloist_vis', time: 11 }]);
    });

    it('bounds oversized backlogs to the retained tail before processing due events', () => {
        const queue = Array.from({ length: 505 }, (_, index) => ({
            type: 'drum_vis',
            time: Number((100 + index * 0.005).toFixed(3)),
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
            { type: 'soloist_vis', time: 12.0 },
            { type: 'harmony_vis', time: 12.5 },
        ];

        const { readyEvents, remainingEvents } = partitionDrawQueue(queue, 10.0);

        expect(readyEvents).toEqual([]);
        expect(remainingEvents).toBe(queue);
    });
});
