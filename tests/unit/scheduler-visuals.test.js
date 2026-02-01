/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPlayback, mockVizState, mockChords } = vi.hoisted(() => ({
    mockPlayback: {
        drawQueue: [],
        bpm: 120,
        visualFlash: false,
        viz: null
    },
    mockVizState: {
        enabled: false
    },
    mockChords: {
        buffer: new Map()
    }
}));

vi.mock('../../public/state.js', () => {
    const mockStateMap = {
        playback: mockPlayback,
        vizState: mockVizState,
        chords: mockChords,
        bass: { buffer: new Map() },
        soloist: { buffer: new Map() },
        harmony: { buffer: new Map() },
        groove: { buffer: new Map(), instruments: [] },
        arranger: { stepMap: [], totalSteps: 16 },
        midi: { enabled: false },
        dispatch: vi.fn(),
    };
    return {
        ...mockStateMap,
        getState: () => mockStateMap,
    };
});

vi.mock('../../public/utils.js', () => ({
    getMidi: () => 60,
    midiToNote: () => ({ name: 'C', octave: 4 }),
    getStepsPerMeasure: () => 16,
    getStepInfo: () => ({ isBeatStart: true }),
}));

vi.mock('../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    triggerFlash: vi.fn(),
    playNote: vi.fn(),
    playDrumSound: vi.fn(),
    playBassNote: vi.fn(),
    playSoloNote: vi.fn(),
    playHarmonyNote: vi.fn(),
    killHarmonyNote: vi.fn(),
    updateSustain: vi.fn(),
    restoreGains: vi.fn(),
    killAllNotes: vi.fn(),
}));

vi.mock('../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    requestResolution: vi.fn(),
}));

vi.mock('../../public/conductor.js', () => ({
    conductorState: {},
    updateAutoConductor: vi.fn(),
    updateLarsTempo: vi.fn(),
    checkSectionTransition: vi.fn(),
}));

vi.mock('../../public/engine/groove-engine.js', () => ({
    applyGrooveOverrides: () => ({ shouldPlay: false }),
    calculatePocketOffset: () => 0,
}));

vi.mock('../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
}));

vi.mock('../../public/animation-loop.js', () => ({
    draw: vi.fn(),
}));

vi.mock('../../public/midi-controller.js', () => ({
    sendMIDINote: vi.fn(),
    sendMIDIDrum: vi.fn(),
    sendMIDICC: vi.fn(),
    sendMIDITransport: vi.fn(),
    normalizeMidiVelocity: () => 1.0,
    panic: vi.fn(),
}));

vi.mock('../../public/platform.js', () => ({
    initPlatform: vi.fn(),
    unlockAudio: vi.fn(),
    lockAudio: vi.fn(),
    activateWakeLock: vi.fn(),
    deactivateWakeLock: vi.fn(),
}));

vi.mock('../../public/ui.js', () => ({
    triggerFlash: vi.fn(),
}));

import { scheduleChordVisuals } from '../../public/engine/scheduler-core.js';
import { getState } from '../../public/state.js';
const { playback, vizState } = getState();

describe('Scheduler Visuals', () => {
    beforeEach(() => {
        playback.drawQueue.length = 0;
        playback.visualFlash = false;
        vizState.enabled = false;
        playback.viz = null;
    });

    it('should push chord_vis event to drawQueue even when visualizer is disabled', () => {
        const chordData = {
            stepInChord: 0,
            chordIndex: 1,
            chord: {
                freqs: [440, 550, 660],
                rootMidi: 60,
                intervals: [0, 4, 7],
                beats: 4
            }
        };
        const time = 10.0;

        vizState.enabled = false;
        playback.viz = null;

        scheduleChordVisuals(chordData, time);

        expect(playback.drawQueue.length).toBe(1);
        expect(playback.drawQueue[0]).toMatchObject({
            type: 'chord_vis',
            time: time,
            index: 1
        });
    });

    it('should not push chord_vis event if stepInChord is not 0', () => {
        const chordData = {
            stepInChord: 1,
            chordIndex: 1,
            chord: { freqs: [] }
        };

        scheduleChordVisuals(chordData, 10.0);

        expect(playback.drawQueue.length).toBe(0);
    });
});
