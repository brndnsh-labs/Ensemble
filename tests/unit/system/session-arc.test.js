import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../../public/conductor.js';
import { getState } from '../../../public/state.js';

// Mock dependencies
vi.mock('../../../public/ui.js', () => ({
    triggerFlash: vi.fn(),
}));

vi.mock('../../../public/fills.js', () => ({
    generateProceduralFill: () => ({ 0: [] }),
}));

describe('Session Timer Intensity Arc', () => {
    let mockState;

    beforeEach(() => {
        // Reset state
        mockState = getState();
        mockState.playback.sessionTimer = 10; // 10 minute session
        mockState.playback.sessionStartTime = performance.now();
        mockState.playback.bandIntensity = 0.35;
        mockState.playback.autoIntensity = true;
        mockState.groove.enabled = true;
        mockState.arranger.totalSteps = 128;

        // Setup simple section map (extended to 128)
        mockState.arranger.stepMap = [
            { start: 0, end: 64, chord: { sectionId: 'A', sectionLabel: 'Verse' } },
            { start: 64, end: 128, chord: { sectionId: 'B', sectionLabel: 'Chorus' } },
        ];

        // Reset conductor state
        mockState.conductor.formIteration = 0;
        mockState.conductor.loopCount = 0;

        // Mock performance.now to control time
        vi.spyOn(performance, 'now');

        // Mock Math.random to return 0.5 (neutral) to avoid jitter in tests
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    const runTransitionCheck = (elapsedMinutes) => {
        // Set time
        const startTime = 100000;
        mockState.playback.sessionStartTime = startTime;
        performance.now.mockReturnValue(startTime + elapsedMinutes * 60 * 1000);

        // Simulate end of loop (step 112 going to 128/0)
        // checkSectionTransition expects currentStep.
        // Trigger at step 112 (start of last measure, stepsPerMeasure=16)
        checkSectionTransition(112, 16);

        return mockState.conductor.targetIntensity;
    };

    const phases = [
        { phase: 'Warmup (0-15%)', time: 1, min: 0.2, max: 0.55 },
        { phase: 'Development (15-40%)', time: 3, min: 0.4, max: 0.8 },
        { phase: 'Mid-Session (40-65%)', time: 5, min: 0.5, max: 0.9 },
        { phase: 'Climax (65-85%)', time: 7.5, min: 0.7, max: 1.0 },
        { phase: 'cool down at the end (85-100%)', time: 9.5, min: 0.2, max: 0.6 },
    ];

    phases.forEach(({ phase, time, min, max }) => {
        it(`should control intensity during ${phase}`, () => {
            const target = runTransitionCheck(time);
            expect(target).toBeGreaterThanOrEqual(min);
            expect(target).toBeLessThanOrEqual(max);
        });
    });

    it('should fall back to loop-based logic if session timer is 0', () => {
        mockState.playback.sessionTimer = 0;
        mockState.conductor.formIteration = 3; // Will increment to 4 -> High Intensity (0.6 - 1.0)

        const target = runTransitionCheck(1);
        expect(target).toBeGreaterThanOrEqual(0.6);
    });
});
