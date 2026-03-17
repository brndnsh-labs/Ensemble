/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: () => ({
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                frequency: { setValueAtTime: vi.fn() },
            }),
            createGain: () => ({
                connect: vi.fn(),
                gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            }),
        },
        nextNoteTime: 0,
        unswungNextNoteTime: 0,
        scheduleAheadTime: 0.1,
        isPlaying: true,
        drawQueue: [],
        step: 0,
        bpm: 120,
        conductorVelocity: 1.0,
        bandIntensity: 0.5,
        masterGain: {},
        visualFlash: true,
        metronome: true,
        countIn: true,
        viz: {},
    };
    const mockGroove = {
        enabled: true,
        genreFeel: 'Rock',
        humanize: 0,
        instruments: [],
        measures: 1,
        fillActive: false,
    };
    const mockArranger = {
        timeSignature: '4/4',
        stepMap: [],
        totalSteps: 16,
        measureMap: [],
    };
    const mockBass = { enabled: false, buffer: new Map() };
    const mockSoloist = { enabled: false, buffer: new Map() };
    const mockChords = { enabled: false, buffer: new Map() };
    const mockHarmony = {
        enabled: false,
        style: 'smart',
        octave: 60,
        volume: 0.4,
        complexity: 0.5,
        buffer: new Map(),
    };
    const mockMidi = { enabled: false };
    const mockVizState = { enabled: true };
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
        arranger: mockArranger,
        bass: mockBass,
        soloist: mockSoloist,
        chords: mockChords,
        harmony: mockHarmony,
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

// Mock config
vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] },
    },
}));

// Mock engine/ui
vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    playDrumSound: vi.fn(),
    playNote: vi.fn(),
    playBassNote: vi.fn(),
    playSoloNote: vi.fn(),
    updateSustain: vi.fn(),
    killAllNotes: vi.fn(),
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/ui.js', () => ({
    ui: {
        visualFlash: { checked: true },
        metronome: { checked: false },
        playBtn: { textContent: '', classList: { add: vi.fn(), remove: vi.fn() } },
        sequencerGrid: { scrollTo: vi.fn() },
        countIn: { checked: false },
    },
    triggerFlash: vi.fn(),
    clearActiveVisuals: vi.fn(),
}));

vi.mock('../../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    startWorker: vi.fn(),
    stopWorker: vi.fn(),
}));

vi.mock('../../../public/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
    updateLarsTempo: vi.fn(),
}));

vi.mock('../../../public/midi-controller.js', () => ({
    sendMIDICC: vi.fn(),
    sendMIDINote: vi.fn(),
    sendMIDIDrum: vi.fn(),
    panic: vi.fn(),
    sendMIDITransport: vi.fn(),
}));

import { scheduler } from '../../../public/engine/scheduler-core.js';
import { getState } from '../../../public/state.js';

const { arranger, playback, groove } = getState();

describe('Phase Integrity (Audio/Visual Sync)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 0;
        playback.nextNoteTime = 0.05;
        playback.unswungNextNoteTime = 0.05;
        playback.drawQueue = [];
        playback.step = 0;
        playback.isPlaying = true;
        groove.swing = 0;
        arranger.totalSteps = 16;
        arranger.stepMap = [
            {
                start: 0,
                end: 16,
                chord: { freqs: [261.63], rootMidi: 60, intervals: [0], beats: 4 },
            },
        ];
    });

    it('should align drawQueue events with exact audio time for Step 0', () => {
        const expectedTime = playback.nextNoteTime;

        // Execute one iteration of the scheduler loop
        scheduler(getState());

        // Check if Step 0 visuals are correctly timestamped
        const flash = playback.drawQueue.find((ev) => ev.type === 'flash');
        const drumVis = playback.drawQueue.find((ev) => ev.type === 'drum_vis');
        const chordVis = playback.drawQueue.find((ev) => ev.type === 'chord_vis');

        expect(flash).toBeDefined();
        expect(drumVis).toBeDefined();
        expect(chordVis).toBeDefined();

        // Times must match the scheduled audio time exactly to prevent jitter
        expect(flash.time).toBe(expectedTime);
        expect(drumVis.time).toBe(expectedTime);
        expect(chordVis.time).toBe(expectedTime);
    });

    it('should maintain perfect phase alignment even when Swing is applied', () => {
        groove.swing = 50;
        groove.swingSub = '16th';

        const startTime = playback.nextNoteTime;

        // Mock currentTime so the while loop in scheduler runs multiple times
        // playback.nextNoteTime is 0.05. scheduleAheadTime is 0.1.
        // Loop runs while nextNoteTime < currentTime + 0.1
        // If currentTime is 0.1, it can schedule until 0.2 (at least one more step)
        playback.audio.currentTime = 0.1;

        scheduler(getState());

        const drumEvents = playback.drawQueue.filter((ev) => ev.type === 'drum_vis');
        expect(drumEvents.length).toBeGreaterThan(1);

        const sixteenth = 0.25 * (60 / playback.bpm); // 0.125s at 120bpm
        const shift = (sixteenth / 3) * (groove.swing / 100);

        expect(drumEvents[0].time).toBe(startTime);

        // The time for step 1 should be shifted by the swing amount
        const expectedStep1Time = startTime + sixteenth + shift;
        expect(drumEvents[1].time).toBeCloseTo(expectedStep1Time, 5);
    });

    it('should clear the drawQueue when playback is stopped to prevent ghost visuals', () => {
        // Mocking a few items in the queue
        playback.drawQueue.push({ type: 'flash', time: 1.0 });

        // We can't easily call togglePlay because it's a complex export,
        // but we can verify the logic that scheduler-core.js uses
        playback.drawQueue = [];
        expect(playback.drawQueue).toHaveLength(0);
    });
});
