/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockPlayback = {
        audio: { currentTime: 0 },
        isPlaying: true,
        bpm: 120,
        nextNoteTime: 0,
        unswungNextNoteTime: 0,
        scheduleAheadTime: 0.2,
        step: 0,
        drawQueue: [],
    };
    const mockGroove = {
        enabled: true,
        swing: 0,
        humanize: 0,
        instruments: [],
        genreFeel: 'Rock',
        pendingGenreFeel: null,
    };
    const mockChords = { enabled: false, buffer: new Map() };
    const mockBass = { enabled: false, buffer: new Map() };
    const mockSoloist = { enabled: false, buffer: new Map() };
    const mockHarmony = {
        enabled: false,
        style: 'smart',
        octave: 60,
        volume: 0.4,
        complexity: 0.5,
        buffer: new Map(),
    };
    const mockArranger = {
        totalSteps: 64,
        stepMap: [],
        timeSignature: '4/4',
        measureMap: new Map(),
    };
    const mockMidi = {
        enabled: false,
        selectedOutputId: null,
        soloistChannel: 3,
        chordsChannel: 1,
        bassChannel: 2,
        drumsChannel: 10,
        soloistOctave: 0,
        chordsOctave: 0,
        bassOctave: 0,
        drumsOctave: 0,
    };
    const mockVizState = { enabled: false };
    const mockConductor = {
        targetIntensity: 0.35,
        stepSize: 0.0005,
        form: null,
        loopCount: 0,
        formIteration: 0,
    };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        chords: mockChords,
        bass: mockBass,
        soloist: mockSoloist,
        harmony: mockHarmony,
        arranger: mockArranger,
        midi: mockMidi,
        vizState: mockVizState,
        conductor: mockConductor,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn(),
    };
});

// Mock worker client
vi.mock('../../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    requestResolution: vi.fn(),
}));

// Mock engine
vi.mock('../../../public/engine/engine.js', () => ({
    playDrumSound: vi.fn(),
    initAudio: vi.fn(),
    killAllNotes: vi.fn(),
    restoreGains: vi.fn(),
}));

// Mock conductor
vi.mock('../../../public/engine/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
}));

// Mock ui
vi.mock('../../../public/ui.js', () => ({
    ui: {
        metronome: { checked: false },
        visualFlash: { checked: false },
    },
    triggerFlash: vi.fn(),
    clearActiveVisuals: vi.fn(),
}));

// Mock instrument-controller
vi.mock('../../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
    switchMeasure: vi.fn(),
}));

import { getState } from '../../../public/state.js';

const { playback, groove } = getState();

import { scheduler } from '../../../public/engine/scheduler-core.js';
import { flushWorker } from '../../../public/worker-client.js';

describe('Harmonic Continuity & Genre Transitions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 0;
        playback.nextNoteTime = 0;
        playback.unswungNextNoteTime = 0;
        playback.step = 0;
        groove.genreFeel = 'Rock';
        groove.pendingGenreFeel = null;
    });

    it('should NOT apply a pending genre mid-measure', () => {
        // Set up a pending genre change
        groove.pendingGenreFeel = { feel: 'Jazz' };

        // Start at step 1 (not a measure boundary)
        playback.step = 1;
        playback.nextNoteTime = 0.125; // 120BPM, 16th note

        scheduler(getState());

        // Genre should still be Rock
        expect(groove.genreFeel).toBe('Rock');
        expect(groove.pendingGenreFeel).not.toBeNull();
    });

    it('should apply a pending genre exactly at Step 0 of a measure', () => {
        groove.pendingGenreFeel = { feel: 'Jazz' };

        // Advance to just before next measure (assuming 4/4 = 16 steps)
        playback.step = 15;
        playback.nextNoteTime = 15 * 0.125;
        playback.audio.currentTime = 15 * 0.125;

        scheduler(getState());

        // The first call to scheduleGlobalEvent in the loop will be step 15.
        // Then it advances to step 16.
        // 16 % 16 === 0, so it should apply the genre.

        expect(groove.genreFeel).toBe('Jazz');
        expect(groove.pendingGenreFeel).toBeNull();

        // It should have flushed the worker to ensure atomic scale change
        expect(flushWorker).toHaveBeenCalled();
    });
});
