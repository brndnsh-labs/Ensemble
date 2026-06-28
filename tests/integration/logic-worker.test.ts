// @ts-nocheck
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WORKER_MSG, WORKER_RESP } from '../../public/worker-types.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

// Setup mocks before importing the worker
const mockPostMessage = vi.fn();
vi.stubGlobal('postMessage', mockPostMessage);
vi.stubGlobal('self', { onmessage: null });

// Use dynamic import to ensure globals are stubbed before worker execution
let getState;

describe('Logic Worker Integration', () => {
    beforeAll(async () => {
        vi.clearAllMocks();
        await import('../../public/logic-worker.js');
        const stateModule = await import('../../public/state.js');
        getState = stateModule.getState;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        // Clear any existing timers
        self.onmessage({ data: { type: WORKER_MSG.STOP } });
        // Reset worker internal state via FLUSH
        self.onmessage({
            data: {
                type: WORKER_MSG.FLUSH,
                data: {
                    step: 0,
                    syncData: {
                        arranger: {
                            totalSteps: 16,
                            stepMap: [
                                {
                                    start: 0,
                                    end: 16,
                                    chord: {
                                        absName: 'C',
                                        rootMidi: 60,
                                        quality: 'major',
                                        intervals: [0, 4, 7],
                                        freqs: [261.63, 329.63, 392.0],
                                    },
                                },
                            ],
                            measureMap: [],
                            sectionMap: [],
                        },
                        playback: { bandIntensity: 0.5, bpm: 120 },
                        soloist: makeSoloistMock({ enabled: false }),
                        bass: { enabled: false },
                        chords: { enabled: false },
                        harmony: { enabled: false },
                        groove: { enabled: true, instruments: [] },
                    },
                },
            },
        });
    });

    it('should handle SYNC_STATE and update non-protected state keys', () => {
        const state = getState();
        const testIntensity = 0.88;

        // Ensure it's currently different
        state.playback.bandIntensity = 0.5;

        self.onmessage({
            data: {
                type: WORKER_MSG.SYNC_STATE,
                data: {
                    playback: { bandIntensity: testIntensity },
                },
            },
        });

        expect(state.playback.bandIntensity).toBe(testIntensity);
    });

    it('should handle SYNC_STATE and PROTECT generative state keys', () => {
        const state = getState();
        const originalResting = true;
        state.soloist.session.phrasing.isResting = originalResting;

        self.onmessage({
            data: {
                type: WORKER_MSG.SYNC_STATE,
                data: {
                    soloist: makeSoloistMock({ isResting: false }),
                },
            },
        });

        // Should STILL be originalResting because isResting is in WORKER_MANAGED_KEYS
        expect(state.soloist.session.phrasing.isResting).toBe(originalResting);
    });

    it('should handle FLUSH and reset buffer heads', () => {
        const testStep = 0;
        mockPostMessage.mockClear();

        self.onmessage({
            data: {
                type: WORKER_MSG.FLUSH,
                data: {
                    step: testStep,
                    syncData: {
                        soloist: makeSoloistMock({ enabled: true, style: 'rock' }),
                        bass: { enabled: true, style: 'rock' },
                        chords: { enabled: true },
                        playback: { bandIntensity: 1.0 },
                        arranger: {
                            totalSteps: 16,
                            stepMap: [
                                {
                                    start: 0,
                                    end: 16,
                                    chord: {
                                        absName: 'C',
                                        rootMidi: 60,
                                        quality: 'major',
                                        intervals: [0, 4, 7],
                                        freqs: [261.63, 329.63, 392.0],
                                    },
                                },
                            ],
                            measureMap: [],
                            sectionMap: [],
                        },
                        groove: { enabled: true, instruments: [] },
                    },
                },
            },
        });

        // FLUSH itself triggers a fillBuffers call
        const notesCall = mockPostMessage.mock.calls.find((c) => c[0].type === WORKER_RESP.NOTES);
        if (!notesCall) {
            console.log(
                'PostMessage calls during FLUSH:',
                mockPostMessage.mock.calls.map((c) => JSON.stringify(c[0])),
            );
        }

        expect(mockPostMessage).toHaveBeenCalled();
        const call = notesCall ? notesCall[0] : null;
        expect(call).not.toBeNull();
        expect(call.type).toBe(WORKER_RESP.NOTES);
        expect(call.notes.length).toBeGreaterThan(0);
        expect(call.notes[0].step).toBeGreaterThanOrEqual(testStep);
    });

    it('should generate notes when requested via REQUEST_BUFFER', () => {
        const state = getState();
        // Setup a minimal progression
        state.arranger.totalSteps = 16;
        state.arranger.stepMap = [
            {
                start: 0,
                end: 16,
                chord: { absName: 'C', rootMidi: 60, quality: 'major', intervals: [0, 4, 7] },
            },
        ];
        state.soloist.enabled = true;
        state.soloist.style = 'rock';
        state.playback.bandIntensity = 1.0; // High intensity to ensure notes are generated
        // Phrase-first (the live soloist engine) performs a seeded theme; without
        // a seed it rests (epic #10, #861 — replaced the legacy no-seed fallback).
        // Production syncs the seed to the worker on play; mirror that with a
        // minimal theme so the buffer actually fills.
        state.soloist.session.seed = {
            loopLengthSteps: 16,
            notes: [
                { step: 0, midi: 67, durationSteps: 2, velocity: 0.8 },
                { step: 4, midi: 64, durationSteps: 2, velocity: 0.8 },
                { step: 8, midi: 67, durationSteps: 2, velocity: 0.8 },
                { step: 12, midi: 71, durationSteps: 2, velocity: 0.8 },
            ],
        };
        state.soloist.session.phrasing.isResting = false;

        mockPostMessage.mockClear();
        self.onmessage({
            data: {
                type: WORKER_MSG.REQUEST_BUFFER,
                data: { step: 0, requestTimestamp: 999 },
            },
        });

        expect(mockPostMessage).toHaveBeenCalled();
        const response = mockPostMessage.mock.calls.find((c) => c[0].type === WORKER_RESP.NOTES)[0];
        expect(response.notes).toBeInstanceOf(Array);
        expect(response.notes.length).toBeGreaterThan(0);

        // Verify note structure
        const note = response.notes[0];
        expect(note).toHaveProperty('module');
        expect(note).toHaveProperty('midi');
        expect(note).toHaveProperty('velocity');
    });

    it('should handle START and STOP messages', async () => {
        vi.useFakeTimers();
        mockPostMessage.mockClear();

        self.onmessage({ data: { type: WORKER_MSG.START } });

        // Move time forward by 25ms (the interval in logic-worker.js)
        vi.advanceTimersByTime(25);
        expect(mockPostMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: WORKER_RESP.TICK }),
        );

        self.onmessage({ data: { type: WORKER_MSG.STOP } });
        mockPostMessage.mockClear();
        vi.advanceTimersByTime(25);
        expect(mockPostMessage).not.toHaveBeenCalled();
    });
});
