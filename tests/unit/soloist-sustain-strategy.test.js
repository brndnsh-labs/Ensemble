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
        // Force a mock style with 100% sustain probability and high max sustain
        // Since we can't easily mock STYLE_CONFIG in the module, we'll use 'blues'
        // which has high sustainProb.

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

        // Check if any notes are within the sustain window of a previous note
        for (let i = 0; i < plan.length - 1; i++) {
            const current = plan[i];
            const next = plan[i + 1];
            if (current.isSustained) {
                expect(next.stepTarget).toBeGreaterThanOrEqual(current.stepTarget + 3);
            }
        }
    });

    it('should boost sustain probability at section boundaries', () => {
        const soloistState = { sessionSteps: 0, transitionState: 'lead_in' };

        // Given the 40% boost in final measure, we should see sustains even in scalar style
        // We'll run it a few times to be sure
        let sustains = 0;
        for (let i = 0; i < 20; i++) {
            const p = generateRhythmPlan(
                12,
                4,
                'scalar',
                0.5,
                stepsPerMeasure,
                stepsPerBeat,
                { sectionEnd: 16 },
                0,
                soloistState,
                null,
            );
            if (p.some((n) => n.isSustained)) {
                sustains++;
            }
        }
        expect(sustains).toBeGreaterThan(0);
    });
});
