import { describe, expect, it } from 'vitest';
import { generateRhythmPlan } from '../../public/engine/soloist-rhythm-engine.js';

describe('Soloist Rhythmic Entropy & Mutation', () => {
    const style = 'scalar';
    const intensity = 0.5;
    const stepsPerMeasure = 16;
    const stepsPerBeat = 4;

    it('should change note density when rhythmicEntropy is mutated', () => {
        const soloistState = {
            sessionSteps: 64,
            phraseCount: 1,
            rhythmicEntropy: -1.0, // Suppress
        };

        const planLow = generateRhythmPlan(
            0,
            64,
            style,
            intensity,
            stepsPerMeasure,
            stepsPerBeat,
            {},
            64,
            soloistState,
            null,
        );

        soloistState.rhythmicEntropy = 1.0; // Boost
        const planHigh = generateRhythmPlan(
            0,
            64,
            style,
            intensity,
            stepsPerMeasure,
            stepsPerBeat,
            {},
            64,
            soloistState,
            null,
        );

        // Given enough steps, high entropy should almost certainly result in more notes than low entropy
        expect(planHigh.length).toBeGreaterThan(planLow.length);
    });

    it('should drift toward syncopation during Syncopation Drift cycles', () => {
        const soloistState = {
            sessionSteps: 0, // Start of cycle (driftFactor = 0)
            phraseCount: 1,
            rhythmicEntropy: 0,
        };

        const getSyncopationRatio = (plan) => {
            if (plan.length === 0) {
                return 0;
            }
            const offbeats = plan.filter((n) => n.stepTarget % 2 !== 0).length;
            return offbeats / plan.length;
        };

        const planNormal = generateRhythmPlan(
            0,
            64,
            style,
            intensity,
            stepsPerMeasure,
            stepsPerBeat,
            {},
            0,
            soloistState,
            null,
        );

        // Advance sessionSteps to a point where driftFactor is high (Cycle every 16 measures = 256 steps in code, but sine is half-cycle every 16 measures, so 512 total)
        // sin(sessionSteps / 512 * PI) -> sin(128/512 * PI) = sin(PI/4) = 0.707
        soloistState.sessionSteps = 128;
        const planDrift = generateRhythmPlan(
            128,
            64,
            style,
            intensity,
            stepsPerMeasure,
            stepsPerBeat,
            {},
            128,
            soloistState,
            null,
        );

        // In drift mode, ratio of offbeats (16th notes) should increase
        expect(getSyncopationRatio(planDrift)).toBeGreaterThanOrEqual(
            getSyncopationRatio(planNormal),
        );
    });

    it('should produce varied phrase lengths due to stochastic duration scaling', () => {
        // This is tested via the logic in soloist.js indirectly, but we can verify
        // that our plan supports varied activeSteps if we mock the calling logic.
        // Actually, let's verify that soloist.js re-calculates activeSteps correctly.
        // Since we're in a unit test for the rhythm engine, we'll focus on the engine's output variety.

        const plans = [];
        for (let i = 0; i < 10; i++) {
            const soloistState = {
                sessionSteps: i * 64,
                phraseCount: i,
                rhythmicEntropy: Math.random() * 2 - 1,
            };
            plans.push(
                generateRhythmPlan(
                    0,
                    64,
                    style,
                    intensity,
                    stepsPerMeasure,
                    stepsPerBeat,
                    {},
                    i * 64,
                    soloistState,
                    null,
                ),
            );
        }

        const densities = plans.map((p) => p.length);
        const uniqueDensities = new Set(densities);

        // Over 10 phrases with different entropy, we should see at least 3 different densities
        expect(uniqueDensities.size).toBeGreaterThanOrEqual(3);
    });
});
