/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Unified mock for state and context
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
        bpm: 200,
        conductorVelocity: 1.0,
        bandIntensity: 0.5,
        isDrawing: true,
        masterGain: {},
    };
    const mockGroove = {
        enabled: true,
        genreFeel: 'Rock',
        humanize: 0,
        instruments: [],
        measures: 1,
        fillActive: false,
        followPlayback: false,
    };
    const mockArranger = {
        timeSignature: '4/4',
        stepMap: [
            {
                start: 0,
                end: 100000,
                chord: { freqs: [261.63], rootMidi: 60, intervals: [0], beats: 4 },
            },
        ],
        totalSteps: 16,
        measureMap: [],
    };
    const mockBass = { enabled: true, buffer: new Map(), octave: 38 };
    const mockSoloist = { enabled: true, buffer: new Map(), octave: 72 };
    const mockChords = { enabled: true, buffer: new Map(), octave: 60 };
    const mockHarmony = { enabled: true, buffer: new Map(), octave: 60 };
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

vi.mock('../../../public/engine/engine.js', () => ({
    getVisualTime: () => 0,
    playDrumSound: vi.fn(),
    playNote: vi.fn(),
    playBassNote: vi.fn(),
    playSoloNote: vi.fn(),
}));

vi.mock('../../../public/ui.js', () => ({
    triggerFlash: vi.fn(),
}));

vi.mock('../../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    startWorker: vi.fn(),
    stopWorker: vi.fn(),
}));

vi.mock('../../../public/engine/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
    updateLarsTempo: vi.fn(),
}));

import { scheduler } from '../../../public/engine/scheduler-core.js';
import { getState } from '../../../public/state.js';

const { playback, chords, bass, soloist } = getState();

import * as engine from '../../../public/engine/engine.js';

describe('Long-Session Stress & Endurance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 0;
        playback.nextNoteTime = 0;
        playback.step = 0;
        playback.drawQueue = [];
        playback.isPlaying = true;
        bass.buffer.clear();
        soloist.buffer.clear();
        chords.buffer.clear();

        global.requestAnimationFrame = vi.fn();
    });

    it('should maintain a stable memory footprint over 1000 simulated measures', () => {
        const stepsToSimulate = 16 * 1000;
        const secondsPerStep = 0.25 * (60 / playback.bpm);

        vi.spyOn(engine, 'getVisualTime').mockImplementation(
            () => playback.audio.currentTime - 0.05,
        );

        for (let i = 0; i < stepsToSimulate; i++) {
            playback.audio.currentTime += secondsPerStep;

            bass.buffer.set(playback.step, { freq: 100, durationSteps: 1 });
            soloist.buffer.set(playback.step, [{ freq: 400, durationSteps: 1 }]);
            chords.buffer.set(playback.step, [{ freq: 300, durationSteps: 1 }]);

            scheduler(getState());

            if (i % 100 === 0) {
                // The draw logic shifted to the React component, so we just check buffer cleanup
                expect(bass.buffer.size).toBeLessThan(10);
                expect(soloist.buffer.size).toBeLessThan(10);
                expect(chords.buffer.size).toBeLessThan(10);
            }
        }

        expect(playback.step).toBeGreaterThanOrEqual(stepsToSimulate);
    });
});
