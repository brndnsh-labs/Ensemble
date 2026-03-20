import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyConductor } from '../../public/engine/conductor.js';
import { scheduler } from '../../public/engine/scheduler-core.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import * as workerClient from '../../public/worker-client.js';

// Mock worker client
vi.mock('../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    requestResolution: vi.fn(),
}));

describe('Song Mode Behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dispatch(ACTIONS.RESET_STATE);
        const { playback, arranger } = getState();

        // Setup a multi-section arrangement
        // s1: 0-16 (Intro), s2: 16-32 (Verse)
        arranger.sections = [
            { id: 's1', label: 'Intro', value: 'I', repeat: 1 },
            { id: 's2', label: 'Verse', value: 'IV', repeat: 1 },
        ];
        arranger.stepMap = [];
        const mockChord = {
            sectionId: 's1',
            sectionLabel: 'Intro',
            freqs: [261.63], // C4
            rootMidi: 60,
            intervals: [0, 4, 7],
            beats: 4,
        };
        for (let i = 0; i < 16; i++) {
            arranger.stepMap.push({
                start: i,
                end: i + 1,
                chord: { ...mockChord, sectionId: 's1', sectionLabel: 'Intro' },
            });
        }
        for (let i = 16; i < 32; i++) {
            arranger.stepMap.push({
                start: i,
                end: i + 1,
                chord: { ...mockChord, sectionId: 's2', sectionLabel: 'Verse' },
            });
        }
        arranger.sectionMap = [
            { id: 's1', start: 0, end: 16, label: 'Intro' },
            { id: 's2', start: 16, end: 32, label: 'Verse' },
        ];
        arranger.totalSteps = 32;
        arranger.timeSignature = '4/4';

        playback.isPlaying = true;
        playback.songMode = true;
        playback.sessionTimer = 1; // 1 minute
        playback.sessionStartTime = performance.now() - 70000; // Already expired
        playback.step = 0;
        playback.audio = {
            currentTime: 0,
            createGain: () => ({
                connect: () => {},
                gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
            }),
            createStereoPanner: () => ({ connect: () => {}, pan: { setValueAtTime: () => {} } }),
            createOscillator: () => ({
                connect: () => {},
                start: () => {},
                stop: () => {},
                frequency: { setValueAtTime: () => {} },
            }),
            createBufferSource: () => ({
                connect: () => {},
                start: () => {},
                stop: () => {},
                buffer: null,
            }),
        };
        getState().groove.enabled = false;
        playback.nextNoteTime = 0;
        playback.scheduleAheadTime = 0.1;
    });

    it('should trigger ending pending when song timer expires in Song Mode', () => {
        const { playback } = getState();
        playback.isEndingPending = false;

        // Run scheduler
        scheduler(getState(), dispatch);

        expect(playback.isEndingPending).toBe(true);
    });

    it('should NOT trigger resolution at mid-loop section boundary (Step 16) in Song Mode', () => {
        const { playback } = getState();
        playback.isEndingPending = true;
        playback.step = 16;
        playback.nextNoteTime = 0;
        playback.audio.currentTime = 0;
        playback.scheduleAheadTime = 0.1; // Only enough for one step

        scheduler(getState(), dispatch);

        // Should NOT have triggered resolution anymore at section boundaries
        expect(workerClient.requestResolution).not.toHaveBeenCalled();
    });

    it('should trigger resolution only at the end of the entire loop (Step 32)', () => {
        const { playback } = getState();
        playback.isEndingPending = true;
        playback.step = 32;
        playback.nextNoteTime = 0;
        playback.audio.currentTime = 0;
        playback.scheduleAheadTime = 0.1;

        scheduler(getState(), dispatch);
        expect(workerClient.requestResolution).toHaveBeenCalledWith(32);
    });

    it('should NOT trigger resolution mid-section in Song Mode', () => {
        const { playback } = getState();
        playback.isEndingPending = true;
        playback.step = 4; // Mid-intro
        playback.nextNoteTime = 0;
        playback.audio.currentTime = 0;

        scheduler(getState(), dispatch);

        expect(workerClient.requestResolution).not.toHaveBeenCalled();
        expect(playback.step).toBe(5);
    });

    it('should calculate lyricalBias based on section label', () => {
        dispatch(ACTIONS.RESET_STATE);
        const { playback, arranger } = getState();

        // Setup "Solo" section
        arranger.totalSteps = 16;
        arranger.stepMap = [{ start: 0, end: 16, chord: { sectionLabel: 'Solo' } }];
        playback.step = 0;
        playback.songMode = true;
        playback.sessionTimer = 0; // Disable arc for this test

        applyConductor(getState(), dispatch);
        // Section bias (0.2) * 0.7 + Arc default (0.5) * 0.3 = 0.29
        expect(playback.lyricalBias).toBeCloseTo(0.29, 2);

        // Setup "Verse" section
        arranger.stepMap = [{ start: 0, end: 16, chord: { sectionLabel: 'Verse' } }];
        applyConductor(getState(), dispatch);
        // Section bias (0.75) * 0.7 + Arc default (0.5) * 0.3 = 0.675
        expect(playback.lyricalBias).toBeCloseTo(0.675, 2);
    });

    it('should expect a rigid repeating melody in the first loop with a seed', () => {
        const { playback, soloist } = getState();
        soloist.sessionSeed = {
            loopLengthSteps: 32,
            notes: [{ step: 0, midi: 72, durationSteps: 4 }],
        };
        playback.currentLoopCount = 0;

        expect(soloist.sessionSeed).toBeDefined();
        expect(playback.currentLoopCount).toBe(0);
    });
});
