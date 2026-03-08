import { beforeEach, describe, expect, it } from 'vitest';
import { generateRhythmPlan } from '../../public/engine/soloist-rhythm-engine.js';
import { getSoloistNote } from '../../public/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Soloist V2 Integrity - Entropy, Sustain, and Rotation', () => {
    const style = 'rock';
    const intensity = 0.5;
    const stepsPerMeasure = 16;
    const stepsPerBeat = 4;

    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Rock', enabled: true });
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    });

    describe('Rhythmic Entropy & Mutation', () => {
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

    describe('Strategic Sustain Strategy', () => {
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

    describe('Influence Rotation & Profiles', () => {
        it('should rotate influence at the start of a section', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7] };
            const { soloist } = getState();

            const influencesSeen = new Set();

            for (let section = 0; section < 50; section++) {
                const sectionStart = section * 64;
                const sectionEnd = (section + 1) * 64;

                getSoloistNote(
                    chord,
                    null,
                    sectionStart,
                    440,
                    0,
                    'smart',
                    0,
                    false,
                    { sectionStart, sectionEnd, bypassRhythm: true },
                    { mStep: 0, isMeasureStart: true, isBeatStart: true },
                );

                if (soloist.phraseContext.profile) {
                    influencesSeen.add(soloist.phraseContext.profile);
                }
            }

            expect(influencesSeen.size).toBeGreaterThan(1);
        });

        it('should maintain the same influence within a section across multiple phrases', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7] };
            const { soloist } = getState();
            const sectionStart = 0;
            const sectionEnd = 128;

            getSoloistNote(
                chord,
                null,
                0,
                440,
                0,
                'smart',
                0,
                false,
                { sectionStart, sectionEnd, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );
            const initialProfile = soloist.phraseContext.profile;

            for (let i = 16; i < 64; i += 16) {
                soloist.isResting = true;
                soloist.restSteps = 0;

                getSoloistNote(
                    chord,
                    null,
                    i,
                    440,
                    0,
                    'smart',
                    0,
                    false,
                    { sectionStart, sectionEnd, bypassRhythm: true },
                    { mStep: 0, isMeasureStart: true, isBeatStart: true },
                );

                expect(soloist.phraseContext.profile).toBe(initialProfile);
            }
        });

        it('should produce higher density for EVH bursts than Gilmour lyrical phrases', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionStart: 0, sectionEnd: 1024 };
            const { soloist, playback } = getState();
            playback.bandIntensity = 0.8;

            // Test Gilmour
            soloist.phraseContext.profile = 'gilmour';
            soloist.isResting = false;
            soloist.activeSteps = 0;
            soloist.sessionSteps = 128;

            let gilmourNotes = 0;
            for (let i = 0; i < 512; i++) {
                if (
                    getSoloistNote(chord, null, i, 440, 0, 'rock', i % 16, false, {
                        sectionEnd: 1024,
                    })
                ) {
                    gilmourNotes++;
                }
            }

            // Test EVH
            soloist.phraseContext.profile = 'evh';
            soloist.isResting = false;
            soloist.activeSteps = 0;
            soloist.sessionSteps = 128;
            soloist.rhythmPlan = [];

            let evhNotes = 0;
            for (let i = 0; i < 512; i++) {
                if (
                    getSoloistNote(chord, null, i, 440, 0, 'rock', i % 16, false, {
                        sectionEnd: 1024,
                    })
                ) {
                    evhNotes++;
                }
            }

            expect(evhNotes).toBeGreaterThan(gilmourNotes);
        });
    });

    describe('Pickup & Loop Logic', () => {
        it('should produce notes during negative count-in steps', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7] };
            let notesFound = 0;
            for (let i = -16; i < 0; i++) {
                const note = getSoloistNote(chord, chord, i, 440, 0, 'rock', 0, false, {
                    sectionStart: 0,
                    sectionEnd: 64,
                    bypassRhythm: false,
                });
                if (note) {
                    notesFound++;
                }
            }
            expect(notesFound).toBeGreaterThan(0);
        });

        it('should rotate influence when looping back to the start', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7] };
            const { soloist, arranger } = getState();
            arranger.totalSteps = 64;

            getSoloistNote(
                chord,
                null,
                0,
                440,
                0,
                'smart',
                0,
                false,
                { sectionStart: 0, sectionEnd: 64, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );
            const firstInfluence = soloist.phraseContext.profile;

            let rotated = false;
            for (let i = 0; i < 20; i++) {
                getSoloistNote(
                    chord,
                    null,
                    64,
                    440,
                    0,
                    'smart',
                    0,
                    false,
                    { sectionStart: 0, sectionEnd: 64, bypassRhythm: true },
                    { mStep: 0, isMeasureStart: true, isBeatStart: true },
                );
                if (soloist.phraseContext.profile !== firstInfluence) {
                    rotated = true;
                    break;
                }
            }
            expect(rotated).toBe(true);
        });
    });
});
