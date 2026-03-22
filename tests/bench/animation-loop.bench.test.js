import { describe, it } from 'vitest';
import { getStepsPerMeasure } from '../../public/utils.js';

describe('Animation Loop Drum Vis Performance', () => {
    const ITERATIONS = 5000;
    const QUEUE_SIZE = 500; // Simulating a backed-up queue or high activity
    const drawQueue = [];
    const timeSignature = '4/4';

    // Populate a large queue with drum_vis events
    for (let i = 0; i < QUEUE_SIZE; i++) {
        drawQueue.push({ type: 'drum_vis', step: i * 2, time: i });
    }

    it('Baseline: Calculate spm inside loop', () => {
        const start = performance.now();

        for (let k = 0; k < ITERATIONS; k++) {
            // Simulate processing the queue
            for (let i = 0; i < QUEUE_SIZE; i++) {
                const ev = drawQueue[i];
                if (ev.type === 'drum_vis') {
                    // The logic to be optimized:
                    const spm = getStepsPerMeasure(timeSignature);
                    const stepMeasure = Math.floor(ev.step / spm);

                    // Minimal side effect to prevent dead code elimination (though unlikely with V8 in this context)
                    if (stepMeasure < -1) {
                        console.log(stepMeasure);
                    }
                }
            }
        }

        const end = performance.now();
        console.log(`Baseline Duration (Inside Loop): ${(end - start).toFixed(4)}ms`);
    });

    it('Optimized: Calculate spm outside loop', () => {
        const start = performance.now();

        for (let k = 0; k < ITERATIONS; k++) {
            // Hoisted calculation
            const spm = getStepsPerMeasure(timeSignature);

            for (let i = 0; i < QUEUE_SIZE; i++) {
                const ev = drawQueue[i];
                if (ev.type === 'drum_vis') {
                    // Using hoisted value
                    const stepMeasure = Math.floor(ev.step / spm);

                    if (stepMeasure < -1) {
                        console.log(stepMeasure);
                    }
                }
            }
        }

        const end = performance.now();
        console.log(`Optimized Duration (Outside Loop): ${(end - start).toFixed(4)}ms`);
    });
});
