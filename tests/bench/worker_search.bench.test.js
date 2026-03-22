import { beforeEach, describe, it } from 'vitest';
import { getChordAtStep } from '../../public/engine/worker-utils.js';
import { getState } from '../../public/state.js';

const { arranger } = getState();

describe('Worker Search Performance', () => {
    // Create a large dataset
    const numSections = 1000;
    const stepsPerSection = 16;
    const totalSteps = numSections * stepsPerSection;

    beforeEach(() => {
        // Setup arranger state directly
        arranger.stepMap = [];
        arranger.sectionMap = [];
        arranger.totalSteps = totalSteps;

        let currentStep = 0;
        for (let i = 0; i < numSections; i++) {
            const sectionStart = currentStep;
            const sectionEnd = currentStep + stepsPerSection;

            arranger.sectionMap.push({
                start: sectionStart,
                end: sectionEnd,
                id: `s${i}`,
                label: `Section ${i}`,
            });

            // 4 chords per section (4 steps each)
            for (let j = 0; j < 4; j++) {
                const chordStart = currentStep;
                const chordEnd = currentStep + 4;
                arranger.stepMap.push({
                    start: chordStart,
                    end: chordEnd,
                    chord: { name: 'C', start: chordStart }, // minimal chord object
                });
                currentStep += 4;
            }
        }
    });

    it('measures linear scan performance', () => {
        const start = performance.now();

        // Simulate sequential playback
        for (let s = 0; s < totalSteps; s++) {
            getChordAtStep(s);
        }

        const end = performance.now();
        const duration = end - start;
        console.log(
            `Sequential scan of ${totalSteps} steps (Map size: ${arranger.stepMap.length}): ${duration.toFixed(2)}ms`,
        );

        // Also simulate some random access (though sequential is the main use case)
        const randomStart = performance.now();
        for (let k = 0; k < 1000; k++) {
            const randStep = Math.floor(Math.random() * totalSteps);
            getChordAtStep(randStep);
        }
        const randomEnd = performance.now();
        console.log(`Random access (1000 lookups): ${(randomEnd - randomStart).toFixed(2)}ms`);
    });
});
