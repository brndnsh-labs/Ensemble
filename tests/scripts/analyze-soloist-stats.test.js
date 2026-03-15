import { vi } from 'vitest';
import { SMART_GENRES } from '../../public/data/smart-genres.js';
import { getSoloistNote } from '../../public/soloist.js';

// --- MOCKS ---
const { mockState } = vi.hoisted(() => ({
    mockState: {
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
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
        arranger: { timeSignature: '4/4' },
        chords: {},
        bass: {},
        harmony: { enabled: false, rhythmicMask: 0 },
    },
}));

// Minimal Mocking to make soloist.js run
vi.mock('../../public/state.js', () => ({
    getState: () => mockState,
    stateMap: mockState,
}));
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

        const loopResults = testGenres.map((genre) => {
            mockState.groove.genreFeel = genre;
            mockState.playback.bandIntensity = 0.8;
            mockState.playback.complexity = 0.8;
            mockState.playback.currentLoopCount = 0; // Start at loop 0

            // Reset soloist state
            mockState.soloist = {
                enabled: true,
                isResting: true,
                pitchHistory: [],
                deviceBuffer: [],
                motifBuffer: [],
                sessionSteps: 0,
            };

            let headNotes = 0;
            let soloNotes = 0;

            for (let s = 0; s < totalMeasures * 16; s++) {
                const stepInMeasure = s % 16;
                const measure = Math.floor(s / 16);

                // Manually simulate loop transition
                if (measure >= measuresPerLoop) {
                    mockState.playback.currentLoopCount = 1;
                }

                const res = getSoloistNote(
                    { rootMidi: 60, intervals: [0, 4, 7] },
                    { rootMidi: 60, intervals: [0, 4, 7] },
                    s,
                    440,
                    60,
                    'smart',
                    stepInMeasure,
                    false,
                );

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
                'Delta (%)': `${(((soloNotes - headNotes) / headNotes) * 100).toFixed(0)}%`,
            };
        });

        console.log('\n================ HEAD vs SOLO DENSITY (16 bars each) ================');
        console.table(loopResults);
        console.log('=====================================================================\n');
    });

    it('Analyzes Jazz Phrase Distribution (Run-on detection)', () => {
        mockState.groove.genreFeel = 'Jazz';
        mockState.playback.bandIntensity = 0.8;
        mockState.playback.complexity = 0.8;
        mockState.playback.currentLoopCount = 2; // Full solo mode

        mockState.soloist = {
            enabled: true,
            isResting: true,
            pitchHistory: [],
            deviceBuffer: [],
            motifBuffer: [],
            sessionSteps: 0,
        };

        const phraseLengths = [];
        const restGaps = [];
        let currentPhraseNotes = 0;
        let currentRestSteps = 0;
        let wasResting = true;

        const totalMeasures = 128;
        for (let s = 0; s < totalMeasures * 16; s++) {
            const res = getSoloistNote(
                { rootMidi: 60, intervals: [0, 4, 7] },
                null,
                s,
                440,
                60,
                'smart',
                s % 16,
                false,
            );

            const isRestingNow = mockState.soloist.isResting;

            if (isRestingNow) {
                currentRestSteps++;
                if (!wasResting && currentPhraseNotes > 0) {
                    phraseLengths.push(currentPhraseNotes);
                    currentPhraseNotes = 0;
                }
            } else {
                if (wasResting) {
                    if (currentRestSteps > 0) {
                        restGaps.push(currentRestSteps);
                    }
                    currentRestSteps = 0;
                }
                if (res) {
                    const notes = Array.isArray(res) ? res : [res];
                    currentPhraseNotes += notes.length;
                }
            }
            wasResting = isRestingNow;
        }

        console.log('\n================ JAZZ PHRASE DISTRIBUTION (128 Bars) ================');
        console.log(
            `Avg Phrase Length: ${(phraseLengths.reduce((a, b) => a + b, 0) / phraseLengths.length).toFixed(1)} notes`,
        );
        console.log(`Max Phrase Length: ${Math.max(...phraseLengths)} notes`);
        console.log(
            `Avg Rest Gap: ${(restGaps.reduce((a, b) => a + b, 0) / restGaps.length).toFixed(1)} steps`,
        );
        console.log(`Max Rest Gap: ${Math.max(...restGaps)} steps`);

        const runOnPhrases = phraseLengths.filter((len) => len > 32).length;
        const shortBreaths = restGaps.filter((gap) => gap < 4).length;
        const longGaps = restGaps.filter((gap) => gap > 16).length;

        console.log(`Run-on Phrases (>32 notes): ${runOnPhrases}`);
        console.log(`Micro-breaths (<1 beat): ${shortBreaths}`);
        console.log(`Long Gaps (>1 measure): ${longGaps}`);
        console.log('=====================================================================\n');
    });

    it('Performs Expert Melodic Analysis for core genres', () => {
        const testGenres = ['Jazz', 'Funk', 'Blues', 'Ska-Punk', 'Neo-Soul'];
        const totalMeasures = 128;

        const results = testGenres.map((genre) => {
            mockState.groove.genreFeel = genre;
            mockState.playback.bandIntensity = 0.8;
            mockState.playback.complexity = 0.8;
            mockState.playback.currentLoopCount = 2;
            mockState.soloist = {
                enabled: true,
                isResting: true,
                pitchHistory: [],
                deviceBuffer: [],
                motifBuffer: [],
                sessionSteps: 0,
                evolutionEnabled: false, // Disable replaying motifs for this test
            };

            let lastMidi = 60;
            let lastFreq = 261.63; // C4
            const intervals = [];
            const phraseEndMidis = [];
            let totalStepsPlayed = 0;
            let repeatedNotes = 0;
            let forcedRepeats = 0;
            const pitchSet = new Set();

            for (let s = 0; s < totalMeasures * 16; s++) {
                const wasResting = mockState.soloist.isResting;
                const res = getSoloistNote(
                    { rootMidi: 60, intervals: [0, 4, 7] },
                    null,
                    s,
                    lastFreq,
                    60,
                    'smart',
                    s % 16,
                    false,
                );

                if (res) {
                    const note = Array.isArray(res) ? res[res.length - 1] : res;
                    const diff = note.midi - lastMidi;
                    if (diff === 0) {
                        repeatedNotes++;
                        forcedRepeats++;
                    }
                    if (Math.abs(diff) > 0) {
                        intervals.push(Math.abs(diff));
                    }
                    pitchSet.add(note.midi);
                    lastMidi = note.midi;
                    lastFreq = 440 * 2 ** ((lastMidi - 69) / 12);
                    totalStepsPlayed++;
                }

                // Phrase end detection
                if (!wasResting && mockState.soloist.isResting) {
                    phraseEndMidis.push(lastMidi);
                }
            }

            const avgInterval =
                intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
            const sortedPitches = Array.from(pitchSet).sort((a, b) => a - b);
            const range =
                sortedPitches.length > 0
                    ? sortedPitches[sortedPitches.length - 1] - sortedPitches[0]
                    : 0;
            const largeLeaps = intervals.filter((i) => i > 12).length;
            const repeatedPct = (repeatedNotes / totalStepsPlayed) * 100;
            const fallbackPct = (forcedRepeats / totalStepsPlayed) * 100;

            // Resolution analysis (Scale degree of phrase ends)
            const endingDegrees = phraseEndMidis.map((m) => (m - 60 + 120) % 12);
            const _rootEnds = endingDegrees.filter((d) => d === 0).length;

            return {
                Genre: genre,
                'Avg Interval': avgInterval.toFixed(1),
                'Pitch Range': `${range} st`,
                'Repeated %': `${repeatedPct.toFixed(0)}%`,
                'Fallback %': `${fallbackPct.toFixed(0)}%`,
                'Octave Jumps': `${((largeLeaps / intervals.length) * 100).toFixed(0)}%`,
            };
        });

        console.log('\n================ EXPERT MELODIC ANALYSIS (128 Bars) ================');
        console.table(results);
        console.log('=====================================================================\n');
    });

    it('Generates Statistical Analysis for all Smart Genres', () => {
        const genres = Object.keys(SMART_GENRES);

        console.log('\n--- HIGH INTENSITY ANALYSIS (0.8) ---');
        console.table(genres.map((genre) => runGenreSimulation(genre, 200, 0.8)));

        console.log('\n--- LOW INTENSITY ANALYSIS (0.3) ---');
        console.table(genres.map((genre) => runGenreSimulation(genre, 200, 0.3)));

        // Detailed measure-by-measure for a few interesting genres
        console.log(
            '\nSample Measure-by-Measure Density (Donna Lee - Ab Major, 128 bars, 0.8 Intensity):',
        );
        ['Jazz', 'Ska-Punk'].forEach((genre) => {
            const sequence = [];
            // Donna Lee in Ab: | Ab | F7 | Bb7 | Bb7 | Bbm7 | Eb7 | Ab | (Bbm7 Eb7) |
            const progression = [
                { rootMidi: 68, intervals: [0, 4, 7, 11] }, // Abmaj7
                { rootMidi: 65, intervals: [0, 4, 7, 10] }, // F7
                { rootMidi: 70, intervals: [0, 4, 7, 10] }, // Bb7
                { rootMidi: 70, intervals: [0, 4, 7, 10] }, // Bb7
                { rootMidi: 70, intervals: [0, 3, 7, 10] }, // Bbm7
                { rootMidi: 63, intervals: [0, 4, 7, 10] }, // Eb7
                { rootMidi: 68, intervals: [0, 4, 7, 11] }, // Abmaj7
                { rootMidi: 63, intervals: [0, 4, 7, 10] }, // Eb7 (Turnaround)
            ];

            // Re-run to capture the sequence
            mockState.groove.genreFeel = genre;
            mockState.playback.bandIntensity = 0.8;
            mockState.playback.complexity = 0.8;
            mockState.soloist = {
                enabled: true,
                isResting: true,
                pitchHistory: [],
                deviceBuffer: [],
                motifBuffer: [],
                sessionSteps: 0,
            };

            let count = 0;
            const measuresToRun = 128;
            for (let s = 0; s < measuresToRun * 16; s++) {
                const measure = Math.floor(s / 16);
                const chord = progression[measure % progression.length];
                mockState.playback.currentLoopCount = Math.floor(measure / progression.length);

                const stepInMeasure = s % 16;
                const res = getSoloistNote(chord, chord, s, 440, 60, 'smart', stepInMeasure, false);
                if (res) {
                    count += Array.isArray(res) ? res.length : 1;
                }
                if (stepInMeasure === 15) {
                    sequence.push(count);
                    count = 0;
                }
            }

            // Find max rest streak in this run
            let maxStreak = 0;
            let currentStreak = 0;
            sequence.forEach((n) => {
                if (n === 0) {
                    currentStreak++;
                    maxStreak = Math.max(maxStreak, currentStreak);
                } else {
                    currentStreak = 0;
                }
            });

            console.log(`\n${genre.toUpperCase()} (Max Rest: ${maxStreak}m)`);
            // Print in chunks of 32 for readability
            for (let i = 0; i < sequence.length; i += 32) {
                console.log(
                    `  Bars ${String(i + 1).padStart(3)}-${String(i + 32).padStart(3)}: ${sequence.slice(i, i + 32).join(', ')}`,
                );
            }
        });
        console.log(
            '===============================================================================\n',
        );
    });
});
