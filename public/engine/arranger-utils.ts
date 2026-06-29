import { TIME_SIGNATURES } from '../config.js';
import type { ArrangerState } from '../state/arranger.js';

/**
 * Arrangement Unroller Utility
 * Transforms short loops into a virtual "Macro Form" for seeders.
 */

/**
 * Section context derived from `arranger.sectionMap` at a given step.
 *
 * `occurrence` counts how many same-label sections appear at or before the
 * current section in the map (Verse 1 → occurrence=1, Verse 2 → occurrence=2,
 * etc.). `isRestatement` is the shorthand `occurrence > 1` used by the
 * soloist's SRDC logic and by bass/drums/accompaniment for the
 * Imperfect-Symmetry repeat-pass biases.
 *
 * Single source of truth for both the soloist (which seeds SRDC + sectional
 * recall from this) and tick-logic's coordination-context preamble (which
 * publishes `sectionOccurrence` for the rest of the engine pipeline). Kept in
 * arranger-utils because the computation is a pure function of the arranger
 * slice — there is no coupling to any specific producer.
 */
export interface SectionContext {
    label: string;
    occurrence: number;
    totalOccurrences: number;
    isRestatement: boolean;
    isLastSection: boolean;
    sectionStart: number;
    sectionEnd: number;
}

/**
 * Modulo helper that handles negative steps and non-positive loop lengths
 * defensively. File-local since epic #10 retired the legacy soloist engine (its
 * last external importer); still used by `getSectionContext` below.
 */
function normalizeLoopStep(step: number, loopLength: number): number {
    if (!Number.isFinite(loopLength) || loopLength <= 0) {
        return step;
    }
    return ((step % loopLength) + loopLength) % loopLength;
}

export function getSectionContext(arranger: any, step: number): SectionContext {
    const sectionMap = arranger?.sectionMap;
    if (!Array.isArray(sectionMap) || sectionMap.length === 0) {
        return {
            label: 'Main',
            occurrence: 1,
            totalOccurrences: 1,
            isRestatement: false,
            isLastSection: true,
            sectionStart: 0,
            sectionEnd: 0,
        };
    }

    const totalFormSteps =
        Number.isFinite(arranger?.totalSteps) && arranger.totalSteps > 0
            ? arranger.totalSteps
            : sectionMap[sectionMap.length - 1]?.end || 1;
    const stepInForm = normalizeLoopStep(step, totalFormSteps);
    const currentSection =
        sectionMap.find(
            (section: { start?: number; end?: number }) =>
                stepInForm >= (section.start || 0) && stepInForm < (section.end || 0),
        ) || sectionMap[0];
    const label = currentSection?.label || 'Main';
    let occurrence = 0;
    let totalOccurrences = 0;

    for (const section of sectionMap) {
        if ((section?.label || 'Main') !== label) {
            continue;
        }
        totalOccurrences++;
        if (section === currentSection) {
            occurrence = totalOccurrences;
        }
    }

    return {
        label,
        occurrence: occurrence || 1,
        totalOccurrences: totalOccurrences || 1,
        isRestatement: (occurrence || 1) > 1,
        isLastSection: currentSection === sectionMap[sectionMap.length - 1],
        sectionStart: currentSection?.start ?? 0,
        sectionEnd: currentSection?.end ?? 0,
    };
}

export interface UnrolledArrangement {
    stepMap: any[];
    sectionMap: any[];
    totalSteps: number;
    originalSteps: number;
}

export function unrollArrangement(arranger: ArrangerState, targetBars = 64): UnrolledArrangement {
    const originalTotalSteps = arranger.totalSteps || 0;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
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
    const unrolledStepMap: any[] = [];
    const unrolledSectionMap: any[] = [];
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
                    const chord = entry?.chord as
                        | { sectionLabel?: string; sectionId?: string }
                        | undefined;
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
