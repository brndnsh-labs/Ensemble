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

describe('Soloist Expansion Critique', () => {
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
    });

    const simulatePerformance = (numBars, genreFeel) => {
        getState.mockReturnValue({
            playback: {
                bandIntensity: 0.8,
                bpm: 120,
                complexity: 0.5,
                intent: {},
                lyricalBias: 0.5,
                currentLoopCount: 3,
            },
            groove: { genreFeel, pocket: 0 },
            soloist: soloistState,
            harmony: { enabled: false },
            arranger: { timeSignature: '4/4' },
        });

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

    const genresToTest = [
        { name: 'Acoustic', smoothness: 12.0, minDensity: 1.0, maxDensity: 14.0 },
        { name: 'Bossa Nova', smoothness: 12.0, minDensity: 1.0, maxDensity: 14.0 },
        { name: 'Country', smoothness: 12.0, minDensity: 1.0, maxDensity: 14.0 },
        { name: 'Disco', smoothness: 12.0, minDensity: 1.5, maxDensity: 16.0 },
        { name: 'Funk', smoothness: 12.0, minDensity: 1.5, maxDensity: 16.0 },
        { name: 'Hip Hop', smoothness: 14.0, minDensity: 1.0, maxDensity: 14.0 },
        { name: 'Metal', smoothness: 14.0, minDensity: 2.0, maxDensity: 22.0 },
        { name: 'Minimal', smoothness: 12.0, minDensity: 0.5, maxDensity: 10.0 },
        { name: 'Neo-Soul', smoothness: 14.0, minDensity: 1.0, maxDensity: 14.0 },
        { name: 'Reggae', smoothness: 14.0, minDensity: 1.0, maxDensity: 14.0 },
        { name: 'Rock', smoothness: 14.0, minDensity: 1.0, maxDensity: 16.0 },
        { name: 'Shred', smoothness: 14.0, minDensity: 2.0, maxDensity: 24.0 },
        { name: 'Ska-Punk', smoothness: 14.0, minDensity: 1.0, maxDensity: 14.0 },
    ];

    it.each(genresToTest)('should pass an authenticity critique for $name', ({
        name,
        smoothness,
        minDensity,
        maxDensity,
    }) => {
        const numBars = 128;
        const notes = simulatePerformance(numBars, name);

        let sumIntervals = 0;
        let totalIntervals = 0;

        for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            if (i > 0 && n.step - notes[i - 1].step <= 4) {
                totalIntervals++;
                sumIntervals += Math.abs(n.midi - notes[i - 1].midi);
            }
        }

        const avgInterval = sumIntervals / (totalIntervals || 1);
        const notesPerBar = notes.length / numBars;

        console.log(`\n--- ${name.toUpperCase()} SOLOIST CRITIQUE REPORT ---`);
        console.log(
            `[Melodic Smoothness]    ${avgInterval.toFixed(2)} semitones (Target: <${smoothness})`,
        );
        console.log(
            `[Note Density]          ${notesPerBar.toFixed(2)} notes/bar (Target: ${minDensity}-${maxDensity})`,
        );
        console.log('------------------------------------\n');

        expect(avgInterval).toBeLessThan(smoothness);
        expect(notesPerBar).toBeGreaterThan(minDensity);
        expect(notesPerBar).toBeLessThan(maxDensity);
    });
});
