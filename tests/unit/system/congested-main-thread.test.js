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
    const mockGroove = { enabled: true, swing: 0, humanize: 0, instruments: [] };
    const mockBass = { enabled: true, buffer: new Map() };
    const mockSoloist = { enabled: true, buffer: new Map() };
    const mockHarmony = { enabled: false, buffer: new Map() };
    const mockChords = { enabled: true, buffer: new Map() };
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
        larsBpmOffset: 0,
        form: null,
        loopCount: 0,
        formIteration: 0,
    };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        bass: mockBass,
        soloist: mockSoloist,
        harmony: mockHarmony,
        chords: mockChords,
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
}));

// Mock conductor
vi.mock('../../../public/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
    updateLarsTempo: vi.fn(),
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

import { getState } from '../../../public/state.js';

const { playback } = getState();

import { scheduler } from '../../../public/engine/scheduler-core.js';

describe('Main Thread Congestion Resilience', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 0;
        playback.nextNoteTime = 0;
        playback.unswungNextNoteTime = 0;
        playback.step = 0;
        playback.scheduleAheadTime = 0.2;
    });

    it('should schedule multiple steps to catch up if the main thread was blocked', () => {
        // Simulate normal start
        scheduler(getState());
        const firstStep = playback.step;

        // Simulate a 500ms block of the main thread
        // currentTime advances, but scheduler wasn't called.
        playback.audio.currentTime += 0.5;

        // Call scheduler again
        scheduler(getState());

        // It should have scheduled many more steps to get ahead of currentTime + scheduleAheadTime
        expect(playback.step).toBeGreaterThan(firstStep);
        expect(playback.nextNoteTime).toBeGreaterThanOrEqual(
            playback.audio.currentTime + playback.scheduleAheadTime,
        );
    });

    it('should not enter an infinite loop if scheduleAheadTime is large', () => {
        playback.scheduleAheadTime = 1.0; // Large lookahead
        playback.audio.currentTime = 0;

        const start = Date.now();
        scheduler(getState());
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(100); // Should finish quickly
        expect(playback.nextNoteTime).toBeGreaterThanOrEqual(1.0);
    });
});
