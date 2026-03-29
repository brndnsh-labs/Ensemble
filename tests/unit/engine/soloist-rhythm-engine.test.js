import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRhythmPlan } from '../../../public/engine/soloist-rhythm-engine.js';

function createSoloistState(mode) {
    return {
        mode,
        phraseContext: null,
        sessionSeed: null,
        rhythmicEntropy: 0,
        transitionState: 'playing',
    };
}

describe('Soloist rhythm engine phrasing modes', () => {
    const coordination = {
        sectionStart: 0,
        sectionEnd: 16,
        stepCoordination: {},
        bypassRhythm: false,
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('gives monophonic mode more breath than guitar in dense scalar passages', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.18);
        const monophonicPlan = generateRhythmPlan(
            0,
            16,
            'scalar',
            0.75,
            16,
            4,
            coordination,
            256,
            createSoloistState('monophonic'),
        );
        const guitarPlan = generateRhythmPlan(
            0,
            16,
            'scalar',
            0.75,
            16,
            4,
            coordination,
            256,
            createSoloistState('guitar'),
        );
        randomSpy.mockRestore();

        expect(monophonicPlan.length).toBeLessThan(guitarPlan.length);
    });

    it('lets strong-beat monophonic notes ring longer than weak-beat notes', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
        const plan = generateRhythmPlan(
            0,
            16,
            'funk',
            0.75,
            16,
            4,
            coordination,
            256,
            createSoloistState('monophonic'),
        );
        randomSpy.mockRestore();

        const strongBeatDurations = plan
            .filter((node) => node.isStrongBeat)
            .map((node) => node.durationSteps);
        const weakBeatDurations = plan
            .filter((node) => !node.isStrongBeat)
            .map((node) => node.durationSteps);

        expect(strongBeatDurations.some((duration) => duration >= 3)).toBe(true);
        expect(weakBeatDurations.every((duration) => duration <= 2)).toBe(true);
    });
});
