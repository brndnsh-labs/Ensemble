import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition, conductorState } from '../../../public/conductor.js';
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
        conductorState.formIteration = 0;
        conductorState.loopCount = 0;

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

        return conductorState.target;
    };

    it('should keep intensity low during Warmup (0-15%)', () => {
        // 1 minute in (10%)
        const target = runTransitionCheck(1);
        expect(target).toBeGreaterThanOrEqual(0.2);
        expect(target).toBeLessThanOrEqual(0.55); // Ceiling 0.45 + variance
    });

    it('should build intensity during Development (15-40%)', () => {
        // 3 minutes in (30%)
        const target = runTransitionCheck(3);
        expect(target).toBeGreaterThanOrEqual(0.4);
        expect(target).toBeLessThanOrEqual(0.8); // Ceiling 0.7 + variance
    });

    it('should stay in the pocket during Mid-Session (40-65%)', () => {
        // 5 minutes in (50%)
        const target = runTransitionCheck(5);
        expect(target).toBeGreaterThanOrEqual(0.5);
        expect(target).toBeLessThanOrEqual(0.9); // Ceiling 0.8 + variance
    });

    it('should reach peak intensity during Climax (65-85%)', () => {
        // 7.5 minutes in (75%)
        const target = runTransitionCheck(7.5);
        expect(target).toBeGreaterThanOrEqual(0.7);
        // Ceiling 1.0 + variance could go over 1.0 but clamped to 1.0
        expect(target).toBeLessThanOrEqual(1.0);
    });

    it('should cool down at the end (85-100%)', () => {
        // 9.5 minutes in (95%)
        const target = runTransitionCheck(9.5);
        expect(target).toBeGreaterThanOrEqual(0.2);
        expect(target).toBeLessThanOrEqual(0.6); // Ceiling 0.5 + variance
    });

    it('should fall back to loop-based logic if session timer is 0', () => {
        mockState.playback.sessionTimer = 0;
        conductorState.formIteration = 3; // Will increment to 4 -> High Intensity (0.6 - 1.0)

        const target = runTransitionCheck(1);
        expect(target).toBeGreaterThanOrEqual(0.6);
    });
});
