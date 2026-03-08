import { describe, expect, it } from 'vitest';
import { generateRhythmPlan } from '../../public/engine/soloist-rhythm-engine.js';

describe('Soloist Strategic Sustain Strategy', () => {
    const intensity = 0.5;
    const stepsPerMeasure = 16;
    const stepsPerBeat = 4;

    it('should produce longer durations for blues style than funk', () => {
        const soloistState = { sessionSteps: 0 };

        const planBlues = generateRhythmPlan(
            0,
            128,
            'blues',
            intensity,
            stepsPerMeasure,
            stepsPerBeat,
            { sectionEnd: 128 },
            0,
            soloistState,
            null,
        );
        const planFunk = generateRhythmPlan(
            0,
            128,
            'funk',
            intensity,
            stepsPerMeasure,
            stepsPerBeat,
            { sectionEnd: 128 },
            0,
            soloistState,
            null,
        );

        const avgDurationBlues =
            planBlues.reduce((sum, n) => sum + n.durationSteps, 0) / planBlues.length;
        const avgDurationFunk =
            planFunk.reduce((sum, n) => sum + n.durationSteps, 0) / planFunk.length;

        expect(avgDurationBlues).toBeGreaterThan(avgDurationFunk);
    });

    it('should suppress subsequent notes when a sustain is triggered', () => {
        const soloistState = { sessionSteps: 0 };
        const plan = generateRhythmPlan(
            0,
            64,
            'blues',
            1.0,
            stepsPerMeasure,
            stepsPerBeat,
            { sectionEnd: 64 },
            0,
            soloistState,
            null,
        );

        for (let i = 0; i < plan.length - 1; i++) {
            const current = plan[i];
            const next = plan[i + 1];
            if (current.isSustained) {
                expect(next.stepTarget).toBeGreaterThanOrEqual(current.stepTarget + 3);
            }
        }
    });
});
