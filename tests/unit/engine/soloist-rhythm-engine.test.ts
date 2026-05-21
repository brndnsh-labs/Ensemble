// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRhythmPlan } from '../../../public/engine/soloist-rhythm-engine.js';
import { makeSoloistMock } from '../../utils/mock-soloist.js';

function createSoloistState(mode) {
    return makeSoloistMock({
        mode,
        phraseContext: null,
        sessionSeed: null,
        rhythmicEntropy: 0,
        transitionState: 'playing',
    });
}

/**
 * Build a fixed-output RNG to inject into `generateRhythmPlan`'s `random`
 * parameter (Epic 12 S1 — the rhythm engine no longer reads `Math.random`
 * directly; tests inject their own deterministic stream).
 */
function constantRandom(value) {
    return () => value;
}

/** Build a sequence RNG: returns each value once, then repeats the last. */
function sequenceRandom(values) {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
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
            null,
            0,
            constantRandom(0.18),
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
            null,
            0,
            constantRandom(0.18),
        );

        expect(monophonicPlan.length).toBeLessThan(guitarPlan.length);
    });

    it('lets strong-beat monophonic notes ring longer than weak-beat notes', () => {
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
            null,
            0,
            constantRandom(0.1),
        );

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
        const soloistState = createSoloistState('monophonic');
        soloistState.session.seed = { notes: [{ step: 0, midi: 60 }], loopLengthSteps: 16 };
        soloistState.session.currentPhrase.context = {
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
            null,
            0,
            constantRandom(0),
        );

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
        const soloistState = createSoloistState('monophonic');
        soloistState.session.seed = { notes: [{ step: 0, midi: 60 }], loopLengthSteps: 16 };
        soloistState.session.currentPhrase.context = {
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
            null,
            0,
            // First draw is the response-transform roulette; the next draws are
            // the per-note skip gates. 0/0.2/0.9 keeps the transform 'exact' and
            // drops the third interior note (0.9 > skipProb) so the plan thins.
            sequenceRandom([0, 0.2, 0.9]),
        );

        expect(plan.map((node) => node.stepTarget)).toEqual([32, 36, 40]);
        expect(plan.every((node) => node.responseSource === 'section')).toBe(true);
    });

    it('treats form recall as a softer spaced response than same-loop section recall', () => {
        const buildState = (responseSource) => {
            const soloistState = createSoloistState('monophonic');
            soloistState.session.seed = { notes: [{ step: 0, midi: 60 }], loopLengthSteps: 16 };
            soloistState.session.currentPhrase.context = {
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

        // Same injected RNG sequence for both runs so the only difference is
        // responseSource — section recall skips interior notes more
        // aggressively than form recall (spaceBias × 1 vs × 0.78).
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
            null,
            0,
            sequenceRandom([0, 0.3, 0.3, 0.9]),
        );

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
            null,
            0,
            sequenceRandom([0, 0.3, 0.3, 0.9]),
        );

        expect(formPlan.length).toBeGreaterThan(sectionPlan.length);
        expect(formPlan.every((node) => node.responseSource === 'form')).toBe(true);
    });
});
