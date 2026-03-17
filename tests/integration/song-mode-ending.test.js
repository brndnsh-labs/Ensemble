import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduler } from '../../public/engine/scheduler-core.js';
import { dispatch, getState } from '../../public/state.js';
import { requestResolution } from '../../public/worker-client.js';

// Mock State
vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {
            step: 0,
            isPlaying: true,
            songMode: true,
            sessionTimer: 3,
            sessionStartTime: 0,
            isEndingPending: false,
            scheduleAheadTime: 0.1,
            audio: {
                currentTime: 0,
                createOscillator: () => ({
                    connect: () => {},
                    start: () => {},
                    stop: () => {},
                    frequency: { setValueAtTime: () => {} },
                }),
                createGain: () => ({
                    connect: () => {},
                    gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
                }),
            },
            nextNoteTime: 0,
            unswungNextNoteTime: 0,
            bpm: 120,
            modals: {},
            viz: { setBeatReference: () => {}, clear: () => {} },
            drawQueue: [],
            resolutionTriggered: false,
            isScheduling: false,
        },
        arranger: {
            totalSteps: 64, // 4 measures of 16 steps
            sectionMap: [
                { id: 's1', start: 0, end: 16, label: 'Intro' },
                { id: 's2', start: 16, end: 32, label: 'Verse' },
                { id: 's3', start: 32, end: 48, label: 'Chorus' },
                { id: 's4', start: 48, end: 64, label: 'Outro' },
            ],
            stepMap: new Array(64).fill(0).map((_, i) => ({
                start: i,
                end: i + 1,
                chord: {
                    sectionId: i < 16 ? 's1' : i < 32 ? 's2' : i < 48 ? 's3' : 's4',
                    freqs: [440, 550, 660],
                    rootMidi: 60,
                    intervals: [0, 4, 7],
                    beats: 4,
                },
            })),
            timeSignature: '4/4',
        },
        groove: {
            enabled: true,
            measures: 1,
            humanize: 0,
            swing: 0,
            instruments: [],
            buffer: new Map(),
        },
        soloist: { enabled: false, buffer: new Map() },
        chords: { enabled: false, buffer: new Map() },
        bass: { enabled: false, buffer: new Map() },
        harmony: { enabled: false, buffer: new Map() },
        midi: { enabled: false },
        vizState: { enabled: false },
        conductor: {
            targetIntensity: 0.35,
            stepSize: 0.0005,
            larsBpmOffset: 0,
            form: null,
            loopCount: 0,
            formIteration: 0,
        },
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_ENDING_PENDING') {
                mockState.playback.isEndingPending = payload;
            }
            if (action === 'TOGGLE_PLAY') {
                mockState.playback.isPlaying = !mockState.playback.isPlaying;
            }
        }),
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: mockState.dispatch,
        ACTIONS: { SET_ENDING_PENDING: 'SET_ENDING_PENDING', TOGGLE_PLAY: 'TOGGLE_PLAY' },
    };
});

// Mock dependencies
vi.mock('../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    requestResolution: vi.fn(),
}));
vi.mock('../../public/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    updateLarsTempo: vi.fn(),
    checkSectionTransition: vi.fn(),
}));
vi.mock('../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    restoreGains: vi.fn(),
    killAllNotes: vi.fn(),
}));
vi.mock('../../public/platform.js', () => ({
    initPlatform: vi.fn(),
    unlockAudio: vi.fn(),
    lockAudio: vi.fn(),
    activateWakeLock: vi.fn(),
    deactivateWakeLock: vi.fn(),
}));

describe('Song Mode Ending Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        state.playback.step = 0;
        state.playback.isPlaying = true;
        state.playback.isEndingPending = false;
        state.playback.isScheduling = false;
        state.playback.resolutionTriggered = false;
        state.playback.nextNoteTime = 0;
        state.playback.unswungNextNoteTime = 0;
        state.playback.sessionStartTime = performance.now() - 200000;
    });

    it('should set isEndingPending when timer expires', () => {
        scheduler(getState(), dispatch);
        expect(getState().playback.isEndingPending).toBe(true);
    });

    it('should NOT trigger resolution in the middle of a loop even if ending is pending', () => {
        const state = getState();
        state.playback.isEndingPending = true;
        state.playback.step = 16; // End of first section (Intro)

        scheduler(getState(), dispatch);

        // Current implementation WOULD set shouldStop = true at step 16 because it's a section boundary
        // We want this to be false.
        expect(requestResolution).not.toHaveBeenCalled();
    });

    it('should trigger resolution only at the end of the entire loop', () => {
        const state = getState();
        state.playback.isEndingPending = true;
        state.playback.step = 64; // End of the loop

        scheduler(getState(), dispatch);

        expect(requestResolution).toHaveBeenCalled();
    });
});
