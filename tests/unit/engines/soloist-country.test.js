/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.6, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
        soloist: {
            busySteps: 0,
            tension: 0,
            mode: 'guitar',
            sessionSteps: 1000,
            pitchHistory: [],
            motifBuffer: [],
            deviceBuffer: [],
        },
        groove: { genreFeel: 'Country' },
        arranger: { timeSignature: '4/4', totalSteps: 64 },
        chords: {},
        bass: {},
        harmony: {},
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        getState: () => mockState,
    };
});

import { getSoloistNote } from '../../../public/soloist.js';
import { getState } from '../../../public/state.js';
import { getScaleForChord } from '../../../public/theory-scales.js';

const { soloist, groove } = getState();

describe('Country Soloist Overhaul', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7], quality: 'major', beats: 4 };
    const chordAm = { rootMidi: 57, intervals: [0, 3, 7], quality: 'minor', beats: 4 };

    beforeEach(() => {
        soloist.isResting = false;
        soloist.currentPhraseSteps = 1;
        soloist.srdcState = 'Statement';
        soloist.notesInPhrase = 0;
        soloist.busySteps = 0;
        soloist.deviceBuffer = [];
        soloist.pitchHistory = [];
        groove.genreFeel = 'Country';
    });

    describe('Harmonic Accuracy', () => {
        it('should use pure Major Pentatonic for Major chords in Country style', () => {
            const scale = getScaleForChord(chordC, null, 'country');
            // Expected: [0, 2, 4, 7, 9] (Major Pentatonic)
            expect(scale).toEqual([0, 2, 4, 7, 9]);
        });

        it('should use Major Pentatonic + b3 if tension is high', () => {
            soloist.tension = 0.8;
            const scale = getScaleForChord(chordC, null, 'country');
            expect(scale).toEqual([0, 2, 3, 4, 7, 9]);
        });

        it('should use Minor Pentatonic for Minor chords in Country style', () => {
            const scale = getScaleForChord(chordAm, null, 'country');
            // Expected: [0, 3, 5, 7, 10] (Minor Pentatonic)
            expect(scale).toEqual([0, 3, 5, 7, 10]);
        });
    });

    describe('Country Devices', () => {
        it('should trigger countryBend device', () => {
            let triggered = false;
            for (let i = 0; i < 1000; i++) {
                soloist.deviceBuffer = [];
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 0;
                soloist.notesInPhrase = 0;
                soloist.lastAttackStep = -100;
                soloist.pitchHistory = [];

                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0, false, {
                    bypassRhythm: true,
                });

                // countryBend returns an array with bendStartInterval -1 on the first note
                if (Array.isArray(res) && res.some((n) => n.bendStartInterval === -1)) {
                    triggered = true;
                    break;
                }
            }
            expect(triggered).toBe(true);
        });

        it('should trigger chickenPick device', () => {
            getState().playback.currentLoopCount = 3;
            let triggered = false;
            for (let i = 0; i < 1000; i++) {
                soloist.deviceBuffer = [];
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 0;
                soloist.notesInPhrase = 0;
                soloist.lastAttackStep = -100;
                soloist.pitchHistory = [];

                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0, false, {
                    bypassRhythm: true,
                });

                // chickenPick returns a double stop with duration 1 and velocity >= 1.2
                if (
                    Array.isArray(res) &&
                    res.every((n) => n.durationSteps === 1) &&
                    res[0].velocity >= 1.2
                ) {
                    triggered = true;
                    break;
                }
            }
            expect(triggered).toBe(true);
        });

        it('should trigger banjoRoll device', () => {
            let triggered = false;
            for (let i = 0; i < 1000; i++) {
                soloist.deviceBuffer = [];
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 0;
                soloist.notesInPhrase = 0;
                soloist.lastAttackStep = -100;
                soloist.pitchHistory = [];

                getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0);
                if (soloist.deviceBuffer.length === 3) {
                    // 4 note roll, 1 returned, 3 in buffer
                    triggered = true;
                    break;
                }
            }
            expect(triggered).toBe(true);
        });

        it('should trigger graceSlide device', () => {
            let triggered = false;
            for (let i = 0; i < 1000; i++) {
                soloist.deviceBuffer = [];
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 0;
                soloist.notesInPhrase = 0;
                soloist.lastAttackStep = -100;
                soloist.pitchHistory = [];

                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0, false, {
                    bypassRhythm: true,
                });
                if (res && !Array.isArray(res) && res.bendStartInterval === 1) {
                    triggered = true;
                    break;
                }
            }
            expect(triggered).toBe(true);
        });
    });

    describe('Style Configuration', () => {
        it('should favor sixths in double stops for country style', () => {
            let sixths = 0;
            let totalDS = 0;
            for (let i = 0; i < 1000; i++) {
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 0;
                soloist.notesInPhrase = 0;
                soloist.lastAttackStep = -100;
                soloist.pitchHistory = [];

                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0, false, {
                    bypassRhythm: true,
                });
                if (Array.isArray(res)) {
                    totalDS++;
                    const top = res[0].midi;
                    const bottom = res[1].midi;
                    const diff = Math.abs(top - bottom);
                    if (diff === 8 || diff === 9) {
                        sixths++;
                    }
                }
            }
            expect(sixths / totalDS).toBeGreaterThan(0.5);
        });

        it('should have high double stop probability', () => {
            getState().playback.currentLoopCount = 3;
            let doubleStops = 0;
            let total = 0;
            for (let i = 0; i < 2000; i++) {
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 1;
                soloist.pitchHistory = [];

                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0);
                if (res) {
                    total++;
                    if (Array.isArray(res)) {
                        doubleStops++;
                    }
                }
            }
            // country doubleStopProb is 0.5.
            expect(doubleStops / total).toBeGreaterThan(0.25);
        });

        it('should favor pentatonic color tones (2, 9) in country style', () => {
            let colorTones = 0;
            let total = 0;
            for (let i = 0; i < 1000; i++) {
                soloist.busySteps = 0;
                soloist.isResting = false;
                soloist.currentPhraseSteps = 0;
                soloist.notesInPhrase = 0;
                soloist.lastAttackStep = -100;
                soloist.pitchHistory = [];

                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'country', 0, false, {
                    bypassRhythm: true,
                });
                if (res) {
                    const note = Array.isArray(res) ? res[res.length - 1] : res;
                    const interval = (note.midi - chordC.rootMidi + 120) % 12;
                    if (interval === 2 || interval === 9) {
                        colorTones++;
                    }
                    total++;
                }
            }
            // 2 and 9 are 2/5 of pentatonic. With bonus, should be well represented.
            expect(colorTones / total).toBeGreaterThan(0.3);
        });
    });
});
