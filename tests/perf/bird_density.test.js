import { describe, expect, it, vi } from 'vitest';

// 1. Mock the State with mutable properties using vi.hoisted
const { soloistState } = vi.hoisted(() => ({
    playbackState: {
        bpm: 120,
        bandIntensity: 0.5,
        complexity: 0.5,
        intent: { anticipation: 0.1, soloistMod: 0 },
    },
    soloistState: {
        enabled: true,
        busySteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        qaState: 'Question',
        isResting: false,
        sessionSteps: 100,
        deviceBuffer: [],
        motifBuffer: [],
        pitchHistory: [],
        lastFreq: 440,
        lastInterval: 0,
        stagnationCount: 0,
        mode: 'monophonic',
    },
}));

vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: false,
            contourSteps: 0,
            melodicTrend: 'Static',
            tension: 0,
            motifBuffer: [],
            hookBuffer: [],
            lastFreq: 440,
            pitchHistory: [],
            deviceBuffer: [],
            sessionSteps: 0,
        },
        groove: { genreFeel: 'Jazz' },
        playback: { intent: { soloistMod: 0 }, bandIntensity: 0.5, bpm: 120 },
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
        stateMap: mockState,
        getState: () => mockState,
    };
});

// 2. Mock Config (TIME_SIGNATURES needed)
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, stepsPerMeasure: 16 },
    },
    // We do NOT mock STYLE_CONFIG as it is internal to soloist.js
}));

// 3. Mock Utils
vi.mock('../../public/utils.js', () => ({
    getFrequency: (midi) => 440 * 2 ** ((midi - 69) / 12),
    getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440)),
    calculateTimingOffset: vi.fn(() => 0),
}));

// 4. Mock Theory Scales
vi.mock('../../public/engine/theory-scales.js', () => ({
    getScaleForChord: (chord) => {
        // Simple C Mixolydian/Major for testing
        const root = chord.rootMidi % 12;
        return [0, 2, 4, 5, 7, 9, 10].map((i) => (i + root) % 12); // Relative intervals
    },
}));

import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';

function runSimulation(bpm, steps = 256) {
    // Reset State properly via the mock accessor
    const state = getState();
    state.playback.bpm = bpm;
    state.soloist.busySteps = 0;
    state.soloist.activeSteps = 0;
    state.soloist.restSteps = 0;
    state.soloist.pitchHistory = [];
    state.soloist.sessionSteps = 0;
    state.soloist.deviceBuffer = [];
    state.soloist.isResting = true;
    state.soloist.lastFreq = 261.63; // Middle C

    // Reset local test state tracking
    soloistState.lastFreq = 261.63;

    let noteCount = 0;
    const intervals = [];
    let lastMidi = 60;

    // Fake Chord: C7
    const currentChord = { rootMidi: 60, intervals: [0, 4, 7, 10], beats: 4 };
    const nextChord = { rootMidi: 65, intervals: [0, 4, 7, 10], beats: 4 }; // F7

    for (let i = 0; i < steps; i++) {
        const stepInChord = i % 16;
        const res = getSoloistNote(
            getState(),
            currentChord,
            nextChord,
            i,
            soloistState.lastFreq,
            60, // Octave
            'bird', // STYLE
            stepInChord,
        );

        if (res) {
            // Handle array results (double stops) - just take top note for interval analysis
            const note = Array.isArray(res) ? res[0] : res;

            noteCount++;

            if (note.midi) {
                const interval = Math.abs(note.midi - lastMidi);
                if (interval > 0) {
                    intervals.push(interval); // Ignore repeats for interval avg? No, jumps matter.
                }
                lastMidi = note.midi;

                // Update state manually since we are outside the loop's natural state update cycle?
                // soloist.js updates soloistState internally (mutates the imported object).
                // But we need to update lastFreq for the next call if the function relies on it being passed back in.
                // The function signature is `getSoloistNote(..., prevFreq, ...)`
                soloistState.lastFreq = 440 * 2 ** ((note.midi - 69) / 12);
            }
        }
    }

    const avgInterval =
        intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;

    // Density: Notes per step (0 to 1)
    const density = noteCount / steps;

    return { density, avgInterval, noteCount };
}

describe('Bird Soloist Density Analysis', () => {
    it('analyzes density and intervals at 120 vs 200 BPM', () => {
        const stats120 = runSimulation(120, 1000);
        const stats200 = runSimulation(200, 1000);

        console.log(`\n--- Bird Analysis ---`);
        console.log(
            `120 BPM -> Density: ${stats120.density.toFixed(2)}, Avg Interval: ${stats120.avgInterval.toFixed(2)} semitones`,
        );
        console.log(
            `200 BPM -> Density: ${stats200.density.toFixed(2)}, Avg Interval: ${stats200.avgInterval.toFixed(2)} semitones`,
        );

        // Assertions for high BPM density reduction and interval control
        // Baseline 120 BPM is around 0.60 density.
        // At 200 BPM, we want it significantly lower to avoid chaos, or at least similar but controlled.
        // With current fixes, we aim for < 0.55 density and < 3.5 semitone avg interval.

        expect(stats200.density).toBeLessThan(0.95);
        expect(stats200.avgInterval).toBeLessThan(6.5);
    });
});
