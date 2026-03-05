import { vi } from 'vitest';
import { SMART_GENRES } from '../../public/presets.js';
import { getSoloistNote } from '../../public/soloist.js';

// --- MOCKS ---
const mockState = {
    soloist: {
        enabled: true,
        busySteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        qaState: 'Question',
        isResting: true, // Start resting
        pitchHistory: [],
        deviceBuffer: [],
        motifBuffer: [],
        sessionSteps: 0,
    },
    groove: { genreFeel: 'Jazz' },
    playback: { bandIntensity: 0.7, bpm: 120, complexity: 0.7, intent: { soloistMod: 0 } },
    arranger: { timeSignature: '4/4' },
    chords: {},
    bass: {},
    harmony: { enabled: false, rhythmicMask: 0 },
};

// Minimal Mocking to make soloist.js run
vi.mock('../../public/state.js', () => ({ getState: () => mockState }));
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4, grouping: [4] } },
    STYLE_CONFIG: {},
}));
vi.mock('../../public/utils.js', () => ({
    getFrequency: () => 440,
    getMidi: () => 60,
    calculateTimingOffset: vi.fn(() => 0),
}));
vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11],
}));

import { describe, it } from 'vitest';

describe('Soloist Smart Genre Statistics', () => {
    function runGenreSimulation(genreName, measures = 200, intensity = 0.8) {
        // Reset State
        mockState.soloist = {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: true,
            pitchHistory: [],
            deviceBuffer: [],
            motifBuffer: [],
            sessionSteps: 0,
        };
        mockState.groove.genreFeel = genreName;
        mockState.playback.bandIntensity = intensity;
        mockState.playback.complexity = intensity;

        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const totalSteps = measures * 16;

        let totalAttacks = 0;
        let restSteps = 0;
        let offBeatAttacks = 0;
        let syncopatedAttacks = 0;
        const phrases = [];
        let currentPhraseLength = 0;
        let previousWasResting = true;

        const notesPerMeasureList = [];
        let notesInCurrentMeasure = 0;

        for (let s = 0; s < totalSteps; s++) {
            const stepInMeasure = s % 16;

            const res = getSoloistNote(chord, chord, s, 440, 60, 'smart', stepInMeasure, false);

            if (res) {
                const notes = Array.isArray(res) ? res : [res];
                totalAttacks += notes.length;
                currentPhraseLength += notes.length;
                notesInCurrentMeasure += notes.length;

                // Track rhythmic placement based on the step it fired
                if (s % 4 !== 0) {
                    offBeatAttacks++; // Not on downbeat
                }
                if (s % 2 !== 0) {
                    syncopatedAttacks++; // On 16th note offbeat
                }
            }

            if (mockState.soloist.isResting) {
                restSteps++;
                if (!previousWasResting && currentPhraseLength > 0) {
                    phrases.push(currentPhraseLength);
                    currentPhraseLength = 0;
                }
            }

            // Measure boundary
            if (stepInMeasure === 15) {
                notesPerMeasureList.push(notesInCurrentMeasure);
                notesInCurrentMeasure = 0;
            }

            previousWasResting = mockState.soloist.isResting;
        }

        // Metrics from measure list
        let maxRestStreak = 0;
        let currentRestStreak = 0;
        const emptyMeasures = notesPerMeasureList.filter((n, _i) => {
            if (n === 0) {
                currentRestStreak++;
                maxRestStreak = Math.max(maxRestStreak, currentRestStreak);
                return true;
            } else {
                currentRestStreak = 0;
                return false;
            }
        }).length;

        const maxNotesInMeasure = Math.max(...notesPerMeasureList);
        const mean = totalAttacks / measures;
        const variance =
            notesPerMeasureList.reduce((acc, val) => acc + (val - mean) ** 2, 0) / measures;
        const stdDev = Math.sqrt(variance);

        const notesPerMeasure = totalAttacks / measures;
        const avgNotesPerPhrase =
            phrases.length > 0 ? phrases.reduce((a, b) => a + b, 0) / phrases.length : 0;
        const restProbability = (restSteps / totalSteps) * 100;
        const _offBeatPercent = totalAttacks > 0 ? (offBeatAttacks / totalAttacks) * 100 : 0;
        const _syncopatedPercent = totalAttacks > 0 ? (syncopatedAttacks / totalAttacks) * 100 : 0;

        return {
            Genre: genreName,
            'Notes/M': notesPerMeasure.toFixed(1),
            'Max/M': maxNotesInMeasure,
            'Empty%': `${((emptyMeasures / measures) * 100).toFixed(0)}%`,
            'Max Rest (M)': maxRestStreak,
            StdDev: stdDev.toFixed(2),
            'Avg Notes/Phrase': avgNotesPerPhrase.toFixed(1),
            'Rest Prob': `${restProbability.toFixed(0)}%`,
        };
    }

    it('Compares Head Loop vs Solo Loop density for Jazz and Ska-Punk', () => {
        const testGenres = ['Jazz', 'Ska-Punk'];
        const measuresPerLoop = 32;
        const totalMeasures = measuresPerLoop * 2;

        const loopResults = testGenres.map(genre => {
            mockState.groove.genreFeel = genre;
            mockState.playback.bandIntensity = 0.8;
            mockState.playback.complexity = 0.8;
            mockState.playback.currentLoopCount = 0; // Start at loop 0

            // Reset soloist state
            mockState.soloist = { enabled: true, isResting: true, pitchHistory: [], deviceBuffer: [], motifBuffer: [], sessionSteps: 0 };

            let headNotes = 0;
            let soloNotes = 0;

            for (let s = 0; s < totalMeasures * 16; s++) {
                const stepInMeasure = s % 16;
                const measure = Math.floor(s / 16);
                
                // Manually simulate loop transition
                if (measure >= measuresPerLoop) {
                    mockState.playback.currentLoopCount = 1;
                }

                const res = getSoloistNote({rootMidi:60, intervals:[0,4,7]}, {rootMidi:60, intervals:[0,4,7]}, s, 440, 60, 'smart', stepInMeasure, false);
                
                if (res) {
                    const count = Array.isArray(res) ? res.length : 1;
                    if (mockState.playback.currentLoopCount === 0) {
                        headNotes += count;
                    } else {
                        soloNotes += count;
                    }
                }
            }

            return {
                Genre: genre,
                'Head Density (N/M)': (headNotes / measuresPerLoop).toFixed(1),
                'Solo Density (N/M)': (soloNotes / measuresPerLoop).toFixed(1),
                'Delta (%)': (((soloNotes - headNotes) / headNotes) * 100).toFixed(0) + '%'
            };
        });

        console.log('\n================ HEAD vs SOLO DENSITY (16 bars each) ================');
        console.table(loopResults);
        console.log('=====================================================================\n');
    });

    it('Generates Statistical Analysis for all Smart Genres', () => {
        const genres = Object.keys(SMART_GENRES);

        console.log('\n--- HIGH INTENSITY ANALYSIS (0.8) ---');
        console.table(genres.map((genre) => runGenreSimulation(genre, 200, 0.8)));

        console.log('\n--- LOW INTENSITY ANALYSIS (0.3) ---');
        console.table(genres.map((genre) => runGenreSimulation(genre, 200, 0.3)));

        // Detailed measure-by-measure for a few interesting genres
        console.log('\nSample Measure-by-Measure Density (First 32 bars, 0.8 Intensity):');
        ['Jazz', 'Blues', 'Ska-Punk'].forEach((genre) => {
            const _mockMeasures = [];
            // Re-run briefly to capture the sequence
            mockState.groove.genreFeel = genre;
            mockState.playback.bandIntensity = 0.8;
            mockState.soloist = {
                enabled: true,
                isResting: true,
                pitchHistory: [],
                deviceBuffer: [],
                motifBuffer: [],
                sessionSteps: 0,
            };
            let count = 0;
            const sequence = [];
            for (let s = 0; s < 32 * 16; s++) {
                const res = getSoloistNote(
                    { rootMidi: 60, intervals: [0, 4, 7] },
                    { rootMidi: 60, intervals: [0, 4, 7] },
                    s,
                    440,
                    60,
                    'smart',
                    s % 16,
                    false,
                );
                if (res) {
                    count += Array.isArray(res) ? res.length : 1;
                }
                if (s % 16 === 15) {
                    sequence.push(count);
                    count = 0;
                }
            }
            console.log(`${genre.padEnd(10)}: ${sequence.join(', ')}`);
        });
        console.log(
            '===============================================================================\n',
        );
    });
});
