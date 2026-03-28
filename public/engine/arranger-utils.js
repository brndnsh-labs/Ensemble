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
    /** @type {Array<any>} */
    const unrolledSectionMap = [];
    let currentStep = 0;

    for (let i = 0; i < iterations; i++) {
        const iterationStart = currentStep;
        const progress = (i * originalBars) / targetBars;

        // Determine the "Musical Role" based on overall song progress (0.0 - 1.0)
        let roleLabel = 'Verse';
        if (i === iterations - 1 || progress >= 0.9) {
            roleLabel = 'Outro';
        } else if (progress < 0.1) {
            roleLabel = 'Intro';
        } else if (progress < 0.4) {
            roleLabel = 'Verse';
        } else if (progress < 0.6) {
            roleLabel = 'Chorus';
        } else {
            roleLabel = 'Solo';
        }

        const sourceLabels = Array.from(
            new Set(
                (arranger.stepMap || []).map((entry) => {
                    const chord =
                        /** @type {{ sectionLabel?: string, sectionId?: string } | undefined} */ (
                            entry?.chord
                        );
                    return chord?.sectionLabel || chord?.sectionId || roleLabel;
                }),
            ),
        );

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

        // Add or extend virtual section map
        if (
            unrolledSectionMap.length > 0 &&
            unrolledSectionMap[unrolledSectionMap.length - 1].label === roleLabel
        ) {
            unrolledSectionMap[unrolledSectionMap.length - 1].end = currentStep;
            unrolledSectionMap[unrolledSectionMap.length - 1].sourceLabels = Array.from(
                new Set([
                    ...(unrolledSectionMap[unrolledSectionMap.length - 1].sourceLabels || []),
                    ...sourceLabels,
                ]),
            );
        } else {
            unrolledSectionMap.push({
                id: `v-loop-${i}`,
                start: iterationStart,
                end: currentStep,
                label: roleLabel,
                sourceLabels,
            });
        }
    }

    return {
        stepMap: unrolledStepMap,
        sectionMap: unrolledSectionMap,
        totalSteps: currentStep,
        originalSteps: originalTotalSteps,
    };
}
