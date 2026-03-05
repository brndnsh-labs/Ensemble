import { describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';

// --- MOCKS ---
const mockState = {
    soloist: {
        enabled: true,
        busySteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        qaState: 'Question',
        srdcState: 'Statement',
        isResting: true, // Start resting
        pitchHistory: [],
        deviceBuffer: [],
        motifBuffer: [],
        sessionSteps: 0,
        isPhraseActive: false,
    },
    groove: { genreFeel: 'Blues' },
    playback: {
        bandIntensity: 0.7,
        bpm: 106,
        complexity: 0.7,
        intent: { soloistMod: 0 },
        sessionTimer: 3, // 3 minute session as per user description
        sessionStartTime: Date.now(),
    },
    arranger: {
        timeSignature: '4/4',
        totalSteps: 192,
        sectionMap: [{ start: 0, end: 192, syllables: [] }], // 12 bars of 16 steps = 192 steps (Jazz Blues)
    },
    chords: {},
    bass: {},
    harmony: { enabled: false, rhythmicMask: 0 },
};

// Minimal Mocking to make soloist.js run
vi.mock('../../public/state.js', () => ({ getState: () => mockState }));
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4, grouping: [4] } },
}));
vi.mock('../../public/soloist-config.js', () => {
    const BLUES_CONFIG = {
        restBase: 0.15,
        restGrowth: 0.15,
        maxNotesPerPhrase: 24,
        minNotesPerPhrase: 2,
        doubleStopProb: 0.35,
        anticipationProb: 0.3,
        deviceProb: 0.4,
        motifProb: 0.5,
        hookProb: 0.3,
    };

    const BLUES_EMPHASIS = [
        1.0, 0.2, 0.6, 0.9, 0.8, 0.2, 0.6, 0.9, 1.0, 0.2, 0.6, 0.9, 0.8, 0.2, 0.6, 0.9,
    ];

    return {
        STYLE_CONFIG: {
            blues: BLUES_CONFIG,
            bird: { restBase: 0.05, restGrowth: 0.01, maxNotesPerPhrase: 48, minNotesPerPhrase: 4 },
            scalar: {
                restBase: 0.1,
                restGrowth: 0.07,
                maxNotesPerPhrase: 24,
                minNotesPerPhrase: 2,
            },
        },
        STYLE_EMPHASIS: {
            blues: BLUES_EMPHASIS,
            bird: [0.7, 0.5, 0.8, 1.0, 0.7, 0.5, 0.8, 1.0, 0.7, 0.5, 0.8, 1.0, 0.7, 0.5, 0.8, 1.0],
            scalar: [
                1.0, 0.3, 0.5, 0.3, 0.8, 0.3, 0.5, 0.3, 1.0, 0.3, 0.5, 0.3, 0.8, 0.3, 0.5, 0.3,
            ],
        },
        GENRE_STYLE_MAPPING: { Blues: 'blues', Jazz: 'bird' },
    };
});
vi.mock('../../public/utils.js', () => ({
    getFrequency: (midi) => 440 * 2 ** ((midi - 69) / 12),
    getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440)),
    calculateTimingOffset: vi.fn(() => 0),
}));
vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 3, 4, 5, 7, 9, 10, 11],
}));

describe('Soloist Phrasing Analysis', () => {
    function runSimulation(measures = 128, intensity = 0.7) {
        // Reset State
        mockState.soloist = {
            enabled: true,
            busySteps: 0,
            activeSteps: 0,
            restSteps: 0,
            notesInPhrase: 0,
            isResting: true,
            pitchHistory: [],
            deviceBuffer: [],
            motifBuffer: [],
            sessionSteps: 64, // Bypass warmup
        };
        mockState.playback.bandIntensity = intensity;
        mockState.playback.complexity = intensity;
        mockState.playback.sessionStartTime = Date.now();

        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const totalSteps = measures * 16;
        const stepsPerLoop = 192; // 12 bars of 16 steps

        const results = {
            totalSteps,
            stepsPlaying: 0,
            stepsResting: 0,
            totalNotes: 0,
            phrases: [],
            emptyPhrases: 0,
        };

        let currentPhrase = {
            startStep: -1,
            notes: 0,
            steps: 0,
        };

        for (let s = 0; s < totalSteps; s++) {
            const stepInMeasure = s % 16;
            mockState.playback.currentLoopCount = Math.floor(s / stepsPerLoop);
            mockState.soloist.sessionSteps = s;

            // Handle busySteps decrement manually as worker would
            if (mockState.soloist.busySteps > 0) {
                mockState.soloist.busySteps--;
                results.stepsPlaying++;
                currentPhrase.steps++;
                continue;
            }

            const wasResting = mockState.soloist.isResting;
            // Force wakeup at start
            const coordination = s === 0 ? { bypassRhythm: true } : {};
            const res = getSoloistNote(
                chord,
                chord,
                s,
                440,
                60,
                'smart',
                stepInMeasure,
                false,
                coordination,
            );
            const isResting = mockState.soloist.isResting;

            if (!isResting) {
                results.stepsPlaying++;
                if (wasResting) {
                    currentPhrase = { startStep: s, notes: 0, steps: 0 };
                }

                if (res) {
                    const notes = Array.isArray(res) ? res : [res];
                    results.totalNotes += notes.length;
                    currentPhrase.notes += notes.length;

                    // Soloist.js sets busySteps based on duration
                    const primary = notes[notes.length - 1];
                    if (primary.durationSteps > 1) {
                        mockState.soloist.busySteps = primary.durationSteps - 1;
                    }
                }
                currentPhrase.steps++;
            } else {
                results.stepsResting++;
                if (!wasResting && currentPhrase.startStep !== -1) {
                    results.phrases.push(currentPhrase);
                    if (currentPhrase.notes === 0) {
                        results.emptyPhrases++;
                    }
                    currentPhrase = { startStep: -1, notes: 0, steps: 0 };
                }
            }
        }

        return results;
    }

    it('Measures phrasing statistics for Blues @ 106 BPM', () => {
        const stats = runSimulation(128, 0.4);

        const playingRatio = (stats.stepsPlaying / stats.totalSteps) * 100;
        const avgNotesPerPhrase =
            stats.phrases.length > 0 ? stats.totalNotes / stats.phrases.length : 0;
        const emptyPhraseRatio =
            stats.phrases.length > 0 ? (stats.emptyPhrases / stats.phrases.length) * 100 : 0;

        console.log(
            '\n================ SOLOIST PHRASING ANALYSIS (Blues @ 106 BPM) ================',
        );
        console.log(`Total Measures: 128`);
        console.log(`Playing Ratio: ${playingRatio.toFixed(1)}%`);
        console.log(`Total Phrases: ${stats.phrases.length}`);
        console.log(
            `Empty Phrases (0 notes): ${stats.emptyPhrases} (${emptyPhraseRatio.toFixed(1)}%)`,
        );
        console.log(`Avg Notes per Phrase: ${avgNotesPerPhrase.toFixed(1)}`);
        console.log(
            `Avg Phrase Duration: ${(stats.stepsPlaying / stats.phrases.length).toFixed(1)} steps`,
        );
        console.log(
            '============================================================================\n',
        );

        expect(playingRatio).toBeGreaterThan(15);
        expect(avgNotesPerPhrase).toBeGreaterThan(1.5);
    });

    it('Analyzes intensity impact on phrasing for Blues', () => {
        const levels = [0.3, 0.5, 0.8];
        const results = levels.map((level) => {
            const stats = runSimulation(64, level);
            return {
                Intensity: level,
                'Play%': `${((stats.stepsPlaying / stats.totalSteps) * 100).toFixed(1)}%`,
                Phrases: stats.phrases.length,
                'Empty%': `${((stats.emptyPhrases / stats.phrases.length) * 100).toFixed(1)}%`,
                'Notes/Phrase': (stats.totalNotes / stats.phrases.length).toFixed(1),
            };
        });

        console.log('\n================ INTENSITY IMPACT ANALYSIS (Blues) ================');
        console.table(results);
        console.log('===================================================================\n');
    });

    it('Traces internal probability drift for Blues', () => {
        mockState.playback.debugSoloist = true;
        mockState.playback.bandIntensity = 0.7;
        console.log('\n================ BLUES PHRASING TRACE (Steps 0-64) ================');
        runSimulation(4, 0.7); // 4 measures = 64 steps
        console.log('===================================================================\n');
        mockState.playback.debugSoloist = false;
    });
});
