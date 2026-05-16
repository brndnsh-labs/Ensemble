// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';

// Mock state and global config
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
            // Mirrors initial soloist phraseContext in public/state/instruments.ts
            // so getSoloistNote can write skeleton/role/etc. without crashing.
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
                signature: null,
                responseSignature: null,
                responseMode: 'free',
                responseSource: 'free',
                sectionLabel: null,
                sectionOccurrence: 0,
            },
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

vi.mock('../../public/config.js', () => {
    const STYLE_CONFIG = {
        scalar: {
            deviceProb: 0.1,
            cells: [0],
            allowedDevices: ['run'],
            registerSoar: 5,
            restBase: 0.0,
            restGrowth: 0,
            doubleStopProb: 0.1,
            maxNotesPerPhrase: 16,
        },
    };
    return {
        STYLE_CONFIG,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] },
        },
    };
});

// Mock utils and others
vi.mock('../../public/utils.js', () => ({
    getFrequency: (midi) => 440 * 2 ** ((midi - 69) / 12),
    applyBluesBends: vi.fn(),
    getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440)),
    calculateTimingOffset: vi.fn(() => 0),
}));

vi.mock('../../public/engine/theory-scales.js', () => ({
    getScaleForChord: () => [0, 2, 4, 5, 7, 9, 11], // C Major scale
}));

import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';

const { soloist } = getState();

describe('Soloist Performance Benchmark', () => {
    it('measures getSoloistNote loop performance', () => {
        const iterations = 50000; // High iteration count
        const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };

        // Ensure we hit the logic path by resetting busySteps
        soloist.busySteps = 0;
        soloist.deviceBuffer = [];
        soloist.isResting = false;
        soloist.currentPhraseSteps = 10;

        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            // Reset state that might cause early exits or skipping the heavy logic
            soloist.busySteps = 0;
            soloist.deviceBuffer = [];

            getSoloistNote(getState(), chordC, null, i, 440, 72, 'scalar', i % 16);
        }

        const end = performance.now();
        const duration = end - start;

        console.log(`getSoloistNote x ${iterations} took ${duration.toFixed(2)}ms`);
        // We just want to ensure it runs without error and gives us a number
        expect(duration).toBeGreaterThan(0);
    });
});
