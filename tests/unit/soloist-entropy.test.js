import { describe, expect, it } from 'vitest';
import { generateRhythmPlan } from '../../public/engine/soloist-rhythm-engine.js';

describe('Soloist Rhythmic Entropy & Mutation', () => {
    const style = 'rock';
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
            { sectionEnd: 64 },
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
            { sectionEnd: 64 },
            64,
            soloistState,
            null,
        );

        expect(planHigh.length).toBeGreaterThan(planLow.length);
    });

    it('should drift toward syncopation during Syncopation Drift cycles', () => {
        const soloistState = {
            sessionSteps: 0,
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
            { sectionEnd: 64 },
            0,
            soloistState,
            null,
        );

        soloistState.sessionSteps = 128;
        const planDrift = generateRhythmPlan(
            128,
            64,
            style,
            intensity,
            stepsPerMeasure,
            stepsPerBeat,
            { sectionEnd: 256 },
            128,
            soloistState,
            null,
        );

        expect(getSyncopationRatio(planDrift)).toBeGreaterThanOrEqual(
            getSyncopationRatio(planNormal),
        );
    });
});
