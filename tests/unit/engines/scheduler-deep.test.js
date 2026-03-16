import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    scheduleChordVisuals,
    scheduleGlobalEvent,
    togglePlay,
} from '../../../public/engine/scheduler-core.js';
import { ACTIONS } from '../../../public/types.js';

// Mock high-level dependencies
vi.mock('../../../public/worker-client.js', () => ({
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    requestBuffer: vi.fn(),
    requestResolution: vi.fn(),
}));

vi.mock('../../../public/platform.js', () => ({
    lockAudio: vi.fn(),
    unlockAudio: vi.fn(),
    deactivateWakeLock: vi.fn(),
    activateWakeLock: vi.fn(),
    initPlatform: vi.fn(),
}));

vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    killAllNotes: vi.fn(),
    restoreGains: vi.fn(),
    playNote: vi.fn(),
    playSoloNote: vi.fn(),
    playBassNote: vi.fn(),
    playDrumSound: vi.fn(),
    updateSustain: vi.fn(),
    killHarmonyNote: vi.fn(),
}));

vi.mock('../../../public/midi-controller.js', () => ({
    panic: vi.fn(),
    sendMIDITransport: vi.fn(),
    sendMIDINote: vi.fn(),
    sendMIDICC: vi.fn(),
    sendMIDIDrum: vi.fn(),
    normalizeMidiVelocity: vi.fn((v) => Math.floor(v * 127)),
}));

vi.mock('../../../public/conductor.js', () => ({
    conductorState: { target: 0.35 },
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
    updateLarsTempo: vi.fn(),
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    flushBuffers: vi.fn(),
    loadDrumPreset: vi.fn(),
}));

describe('Scheduler Core Deep Dive', () => {
    let state;
    let dispatch;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // Stub browser globals
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn((cb) => setTimeout(cb, 16)),
        );
        vi.stubGlobal('performance', { now: vi.fn(() => 1000) });

        const mockGain = {
            connect: vi.fn(),
            gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        };

        const mockOsc = {
            connect: vi.fn(),
            frequency: { setValueAtTime: vi.fn() },
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
        };

        state = {
            playback: {
                isPlaying: false,
                autoIntensity: true,
                drawQueue: [],
                audio: {
                    currentTime: 10.0,
                    state: 'running',
                    suspend: vi.fn().mockResolvedValue(),
                    resume: vi.fn().mockResolvedValue(),
                    createOscillator: vi.fn(() => mockOsc),
                    createGain: vi.fn(() => mockGain),
                },
                masterGain: {},
                viz: { clear: vi.fn(), setBeatReference: vi.fn() },
                metronome: true,
                countIn: false,
                bpm: 120,
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: 32,
                measureMap: [],
                stepMap: [
                    {
                        start: 0,
                        end: 16,
                        chord: { sectionId: 's1', freqs: [440, 554, 659], beats: 4 },
                    },
                    {
                        start: 16,
                        end: 32,
                        chord: { sectionId: 's2', freqs: [440, 554, 659], beats: 4 },
                    },
                ],
            },
            chords: {
                buffer: new Map(),
                scheduledChordIndex: 0,
            },
            groove: {
                instruments: [{ name: 'Snare', steps: Array(16).fill(0) }],
                measures: 1,
                humanize: 0,
                genreFeel: 'Rock',
            },
            soloist: { buffer: new Map(), tension: 0.5 },
            bass: { buffer: new Map() },
            harmony: { buffer: new Map() },
            midi: { enabled: true, selectedOutputId: 'out-1' },
            vizState: { enabled: true },
        };
        dispatch = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('togglePlay Suspend Logic', () => {
        it('should suspend audio context after timeout when stopping', () => {
            state.playback.isPlaying = true;
            togglePlay(state, null, false, dispatch);

            expect(state.playback.isPlaying).toBe(false);
            expect(state.playback.suspendTimeout).toBeDefined();

            vi.advanceTimersByTime(3000);
            expect(state.playback.audio.suspend).toHaveBeenCalled();
        });

        it('should clear existing suspend timeout when starting', () => {
            state.playback.suspendTimeout = setTimeout(() => {}, 1000);
            const spy = vi.spyOn(global, 'clearTimeout');

            togglePlay(state, null, false, dispatch);
            expect(spy).toHaveBeenCalled();
        });
    });

    describe('scheduleChordVisuals', () => {
        it('should push visual events and trigger flash', () => {
            const chordData = {
                stepInChord: 0,
                chordIndex: 2,
                chord: { freqs: [440, 554, 659], beats: 2, rootMidi: 60, intervals: [0, 4, 7] },
            };
            state.playback.visualFlash = true;

            // We need to mock the imported triggerFlash or just check drawQueue
            scheduleChordVisuals(state, chordData, 10.0);

            expect(state.playback.drawQueue).toHaveLength(1);
            expect(state.playback.drawQueue[0]).toMatchObject({
                type: 'chord_vis',
                index: 2,
                rootMidi: 60,
            });
        });
    });

    describe('Global Events & Metronome', () => {
        it('should trigger metronome sounds on beats', () => {
            // Step 0 is a beat start and measure start
            scheduleGlobalEvent(state, 0, 10.0, dispatch);

            expect(state.playback.audio.createOscillator).toHaveBeenCalled();
            const osc = state.playback.audio.createOscillator.mock.results[0].value;
            expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(1000, 10.0); // measure start freq
        });

        it('should handle snare mask calculation and sync', async () => {
            const snare = state.groove.instruments[0];
            snare.steps[0] = 1; // Snare on first step

            const { syncWorker } = await import('../../../public/worker-client.js');

            scheduleGlobalEvent(state, 0, 10.0, dispatch);

            expect(state.groove.snareMask).toBe(1);
            expect(syncWorker).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    param: 'snareMask',
                    value: 1,
                }),
            );
        });
    });
});
