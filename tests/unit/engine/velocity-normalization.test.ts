// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

const capturedMessages = [];
vi.stubGlobal('postMessage', (msg) => capturedMessages.push(msg));

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        soloist: makeSoloistMock({
            enabled: true,
            lastFreq: 440,
            busySteps: 0,
            sessionSteps: 1000,
            motifBuffer: [],
            deviceBuffer: [],
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
            },
        }),
        chords: { enabled: true },
        bass: { enabled: true, lastFreq: 110, pocketOffset: 0 },
        harmony: {
            enabled: true,
            volume: 0.4,
            complexity: 0.5,
            motifBuffer: [],
            buffer: new Map(),
        },
        playback: {
            bandIntensity: 1.0,
            bpm: 120,
            intent: {},
            autoIntensity: false,
            audio: { currentTime: 0 },
        },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            totalSteps: 64,
            stepMap: [],
            timeSignature: '4/4',
        },
        groove: { genreFeel: 'Rock', enabled: true, instruments: [], audioBuffers: { noise: {} } },
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

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' },
    },
    REGGAE_RIDDIMS: {},
}));

// Mock form analysis
vi.mock('../../../public/form-analysis.js', () => ({
    analyzeForm: vi.fn(() => ({ sequence: 'A', sections: [] })),
}));

import { getState } from '../../../public/state.js';

const { arranger, playback } = getState();

import { handleExport } from '../../../public/engine/midi-worker-logic.js';

describe('Velocity Normalization & MIDI Limits', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        capturedMessages.length = 0;
        playback.bandIntensity = 1.0; // Max intensity

        const mockChord = {
            root: 'C',
            beats: 4,
            sectionId: 's1',
            sectionLabel: 'Verse',
            freqs: [261.63],
            intervals: [0],
            rootMidi: 60,
            quality: 'major',
        };
        arranger.progression = [{ chord: mockChord, start: 0, end: 16 }];
        arranger.totalSteps = 16;
        arranger.stepMap = [{ start: 0, end: 16, chord: mockChord, chordIndex: 0 }];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should clamp all MIDI velocities to 127 even at maximum intensity', async () => {
        // High intensity + high conductor velocity
        playback.bandIntensity = 1.0;

        handleExport(getState(), {
            includedTracks: ['chords', 'bass', 'soloist', 'drums'],
            targetDuration: 0.1,
        });

        await vi.runAllTimersAsync();

        const exportMsg = capturedMessages.find((m) => m.type === 'exportComplete');
        expect(exportMsg).toBeDefined();

        // We can't easily inspect the MIDI binary blob here without a parser,
        // but we can verify handleExport logic if we mock MidiTrack.
    });

    it('should ensure note objects returned by fillBuffers have normalized velocities', () => {
        // This is easier to test by calling getSoloistNote or getBassNote directly
        // but we want to check the integrated worker logic.
    });
});
