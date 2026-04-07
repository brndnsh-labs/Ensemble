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

    it('turns response signatures into paraphrase plans with timing metadata', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        const soloistState = createSoloistState('monophonic');
        soloistState.sessionSeed = { notes: [{ step: 0, midi: 60 }], loopLengthSteps: 16 };
        soloistState.phraseContext = {
            role: 'response',
            responseMode: 'paraphrase',
            responseSource: 'recent',
            responseSignature: {
                notes: [
                    {
                        stepOffset: 0,
                        durationSteps: 2,
                        velocity: 0.8,
                        pitchClass: 0,
                        direction: 1,
                        tripletPlacement: 't1',
                        timingOffset: 0.02,
                    },
                    {
                        stepOffset: 4,
                        durationSteps: 1,
                        velocity: 0.7,
                        pitchClass: 4,
                        direction: -1,
                    },
                ],
            },
        };

        const plan = generateRhythmPlan(
            32,
            16,
            'jazz',
            0.6,
            16,
            4,
            coordination,
            256,
            soloistState,
        );
        randomSpy.mockRestore();

        expect(plan).toHaveLength(2);
        expect(plan.map((node) => node.stepTarget)).toEqual([32, 36]);
        expect(plan[0].tripletPlacement).toBe('t1');
        expect(plan[0].timingOffset).toBeCloseTo(0.02, 6);
        expect(plan[0].responsePitchClass).toBe(0);
        expect(plan[0].responseEntryTarget).toBe(true);
        expect(plan[0].responseSource).toBe('recent');
        expect(plan[1].responsePitchClass).toBe(4);
        expect(plan[1].responseCadenceTarget).toBe(true);
    });

    it('lets section-recall responses leave more interior space for neo phrases', () => {
        const randomSpy = vi
            .spyOn(Math, 'random')
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0.2)
            .mockReturnValueOnce(0.9);
        const soloistState = createSoloistState('monophonic');
        soloistState.sessionSeed = { notes: [{ step: 0, midi: 60 }], loopLengthSteps: 16 };
        soloistState.phraseContext = {
            role: 'response',
            responseMode: 'paraphrase',
            responseSource: 'section',
            responseSignature: {
                notes: [
                    { stepOffset: 0, durationSteps: 2, velocity: 0.8, pitchClass: 0, direction: 1 },
                    { stepOffset: 2, durationSteps: 1, velocity: 0.7, pitchClass: 2, direction: 1 },
                    { stepOffset: 4, durationSteps: 1, velocity: 0.7, pitchClass: 4, direction: 1 },
                    {
                        stepOffset: 8,
                        durationSteps: 2,
                        velocity: 0.8,
                        pitchClass: 7,
                        direction: -1,
                    },
                ],
            },
        };

        const plan = generateRhythmPlan(
            32,
            16,
            'neo',
            0.55,
            16,
            4,
            coordination,
            256,
            soloistState,
        );
        randomSpy.mockRestore();

        expect(plan.map((node) => node.stepTarget)).toEqual([32, 36, 40]);
        expect(plan.every((node) => node.responseSource === 'section')).toBe(true);
    });

    it('treats form recall as a softer spaced response than same-loop section recall', () => {
        const buildState = (responseSource) => {
            const soloistState = createSoloistState('monophonic');
            soloistState.sessionSeed = { notes: [{ step: 0, midi: 60 }], loopLengthSteps: 16 };
            soloistState.phraseContext = {
                role: 'response',
                responseMode: 'paraphrase',
                responseSource,
                responseSignature: {
                    notes: [
                        {
                            stepOffset: 0,
                            durationSteps: 2,
                            velocity: 0.8,
                            pitchClass: 0,
                            direction: 1,
                        },
                        {
                            stepOffset: 2,
                            durationSteps: 1,
                            velocity: 0.7,
                            pitchClass: 2,
                            direction: 1,
                        },
                        {
                            stepOffset: 4,
                            durationSteps: 1,
                            velocity: 0.7,
                            pitchClass: 4,
                            direction: 1,
                        },
                        {
                            stepOffset: 8,
                            durationSteps: 2,
                            velocity: 0.8,
                            pitchClass: 7,
                            direction: -1,
                        },
                    ],
                },
            };
            return soloistState;
        };

        const sectionRandomSpy = vi
            .spyOn(Math, 'random')
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0.3)
            .mockReturnValueOnce(0.3)
            .mockReturnValueOnce(0.9);
        const sectionPlan = generateRhythmPlan(
            32,
            16,
            'neo',
            0.55,
            16,
            4,
            coordination,
            256,
            buildState('section'),
        );
        sectionRandomSpy.mockRestore();

        const formRandomSpy = vi
            .spyOn(Math, 'random')
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0.3)
            .mockReturnValueOnce(0.3)
            .mockReturnValueOnce(0.9);
        const formPlan = generateRhythmPlan(
            32,
            16,
            'neo',
            0.55,
            16,
            4,
            coordination,
            256,
            buildState('form'),
        );
        formRandomSpy.mockRestore();

        expect(formPlan.length).toBeGreaterThan(sectionPlan.length);
        expect(formPlan.every((node) => node.responseSource === 'form')).toBe(true);
    });
});
