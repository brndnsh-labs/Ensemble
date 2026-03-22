import { TIME_SIGNATURES } from '../config.js';

/**
 * Arrangement Unroller Utility
 * Transforms short loops into a virtual "Macro Form" for seeders.
 */

/**
 * @typedef {Object} UnrolledArrangement
 * @property {Array<any>} stepMap
 * @property {Array<any>} sectionMap
 * @property {number} totalSteps
 * @property {number} originalSteps
 */

/**
 * Unrolls a short arrangement into a virtual multi-loop form.
 * @param {import('../state/arranger.js').ArrangerState} arranger
 * @param {number} [targetBars=64]
 * @returns {UnrolledArrangement}
 */
export function unrollArrangement(arranger, targetBars = 64) {
    const originalTotalSteps = arranger.totalSteps || 0;
    const ts =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const originalBars = originalTotalSteps / stepsPerBar;

    // 1. If it's already a "long" song, don't unroll
    if (originalBars >= targetBars / 2 || originalTotalSteps === 0) {
        return {
            stepMap: arranger.stepMap || [],
            sectionMap: arranger.sectionMap || [],
            totalSteps: originalTotalSteps,
            originalSteps: originalTotalSteps,
        };
    }

    // 2. Calculate iterations needed
    const iterations = Math.ceil(targetBars / originalBars);
    /** @type {Array<any>} */
    const unrolledStepMap = [];
    const unrolledSectionMap = [];
    let currentStep = 0;

    for (let i = 0; i < iterations; i++) {
        const iterationStart = currentStep;

        // Determine the "Musical Role" for this iteration
        let roleLabel = 'Verse';
        if (i === 0) {
            roleLabel = 'Intro';
        } else if (i === iterations - 1) {
            roleLabel = 'Outro';
        } else if (i === Math.floor(iterations / 2)) {
            roleLabel = 'Chorus';
        } else if (i > Math.floor(iterations / 2)) {
            roleLabel = 'Solo';
        }

        // Clone Step Map
        arranger.stepMap.forEach((entry) => {
            const steps = entry.end - entry.start;
            unrolledStepMap.push({
                start: currentStep,
                end: currentStep + steps,
                chord: {
                    ...entry.chord,
                    sectionLabel: roleLabel, // Override label for seeder awareness
                },
            });
            currentStep += steps;
        });

        // Add to virtual section map
        unrolledSectionMap.push({
            id: `v-loop-${i}`,
            start: iterationStart,
            end: currentStep,
            label: roleLabel,
        });
    }

    return {
        stepMap: unrolledStepMap,
        sectionMap: unrolledSectionMap,
        totalSteps: currentStep,
        originalSteps: originalTotalSteps,
    };
}
