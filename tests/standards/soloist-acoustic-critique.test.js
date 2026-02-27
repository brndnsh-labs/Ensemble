import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';
import { getState } from '../../public/state.js';

// Mock state.js
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

// Mock config.js
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

describe('Soloist Acoustic Critique', () => {
    let soloistState;

    beforeEach(() => {
        vi.restoreAllMocks();

        soloistState = {
            enabled: true,
            style: 'smart',
            mode: 'monophonic',
            octave: 64,
            sessionSteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            srdcState: 'Statement',
            qaState: 'Question',
            isResting: true,
            motifBuffer: [],
            thematicSeed: [],
            thematicSeedRoot: 0,
            isReplayingMotif: false,
            isReplayingSeed: false,
            busySteps: 0,
            pitchHistory: [],
            lastInterval: 0,
            stagnationCount: 0,
            deviceBuffer: [],
            lastFreq: 0,
            currentCell: null,
        };

        getState.mockReturnValue({
            playback: {
                bandIntensity: 0.6,
                bpm: 100,
                complexity: 0.5,
                intent: {},
                lyricalBias: 0.5,
            },
            groove: { genreFeel: 'Acoustic', pocket: 0 },
            soloist: soloistState,
            harmony: { enabled: false },
            arranger: { timeSignature: '4/4' },
        });
    });

    const simulatePerformance = (numBars) => {
        const history = [];
        const Cmaj7 = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], beats: 4 };
        const Fmaj7 = { rootMidi: 65, quality: 'maj7', intervals: [0, 4, 7, 11], beats: 4 };
        const G7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
        const Am7 = { rootMidi: 69, quality: 'm7', intervals: [0, 3, 7, 10], beats: 4 };

        const progression = [Cmaj7, Fmaj7, G7, Am7];

        let lastFreq = 0;
        for (let bar = 0; bar < numBars; bar++) {
            const chord = progression[bar % 4];
            for (let step = 0; step < 16; step++) {
                const note = getSoloistNote(
                    chord,
                    chord,
                    bar * 16 + step,
                    lastFreq,
                    64,
                    'smart',
                    step,
                    false,
                );
                if (note) {
                    const primary = Array.isArray(note) ? note[0] : note;
                    lastFreq = primary.frequency || 0;
                    history.push({
                        step: bar * 16 + step,
                        bar,
                        stepInBar: step,
                        midi: primary.midi,
                        velocity: primary.velocity,
                        chordRoot: chord.rootMidi,
                    });
                }
                soloistState.sessionSteps++;
            }
        }
        return history;
    };

    it('should pass an authenticity critique for a 128-bar Acoustic soloist performance', () => {
        const numBars = 128;
        const notes = simulatePerformance(numBars);

        let sumIntervals = 0;
        let totalIntervals = 0;

        for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            // Melodic smoothness (within phrase)
            if (i > 0 && n.step - notes[i - 1].step <= 4) {
                totalIntervals++;
                sumIntervals += Math.abs(n.midi - notes[i - 1].midi);
            }
        }

        const avgInterval = sumIntervals / (totalIntervals || 1);
        const notesPerBar = notes.length / numBars;

        console.log('\n--- ACOUSTIC SOLOIST CRITIQUE REPORT ---');
        console.log(`[Melodic Smoothness]    ${avgInterval.toFixed(2)} semitones (Target: <7.0)`);
        console.log(`[Note Density]          ${notesPerBar.toFixed(2)} notes/bar (Target: 2.0-10.0)`);
        console.log('------------------------------------\n');

        expect(avgInterval).toBeLessThan(7.0);
        expect(notesPerBar).toBeGreaterThan(2.0);
        expect(notesPerBar).toBeLessThan(10.0);
    });
});
