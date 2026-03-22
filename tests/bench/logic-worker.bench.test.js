import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WORKER_MSG, WORKER_RESP } from '../../public/worker-types.js';

// Setup mocks before importing the worker
const mockPostMessage = vi.fn();
vi.stubGlobal('postMessage', mockPostMessage);
vi.stubGlobal('self', { onmessage: null });

let getState;

describe('Logic Worker Performance', () => {
    beforeAll(async () => {
        vi.clearAllMocks();
        await import('../../public/logic-worker.js');
        const stateModule = await import('../../public/state.js');
        getState = stateModule.getState;
    });

    const runBenchmark = (name, _steps, setupState) => {
        const state = getState();
        setupState(state);

        const iterations = 50;
        let totalDuration = 0;

        for (let i = 0; i < iterations; i++) {
            // Always FLUSH before request to reset buffer heads and ensure we actually process the steps
            self.onmessage({
                data: {
                    type: WORKER_MSG.FLUSH,
                    data: { step: i * 4 },
                },
            });

            const start = performance.now();
            self.onmessage({
                data: {
                    type: WORKER_MSG.REQUEST_BUFFER,
                    data: { step: i * 4, requestTimestamp: Date.now() },
                },
            });
            totalDuration += performance.now() - start;

            // Ensure no errors occurred
            const errorCall = mockPostMessage.mock.calls.find(
                (c) => c[0].type === WORKER_RESP.ERROR,
            );
            if (errorCall) {
                throw new Error(`Worker Error in ${name}: ${errorCall[0].data}`);
            }

            // Ensure notes were generated (except for baseline)
            if (name !== 'Baseline (Empty)') {
                const notesCall = mockPostMessage.mock.calls.find(
                    (c) => c[0].type === WORKER_RESP.NOTES,
                );
                if (!notesCall || notesCall[0].notes.length === 0) {
                    throw new Error(
                        `No notes generated in ${name} at step ${i * 4}. Total calls: ${mockPostMessage.mock.calls.length}`,
                    );
                }
            }
            mockPostMessage.mockClear();
        }

        const avg = totalDuration / iterations;
        console.log(
            `[Benchmark] ${name}: ${avg.toFixed(2)}ms per 64-step lookahead (Total: ${totalDuration.toFixed(2)}ms for ${iterations} calls)`,
        );

        // Assert that we are within the 25ms interval budget with plenty of room
        expect(avg).toBeLessThan(10);
    };

    it('benchmarks Baseline (Empty Progression)', () => {
        runBenchmark('Baseline (Empty)', 16, (state) => {
            state.arranger.totalSteps = 0;
            state.arranger.stepMap = [];
        });
    });

    it('benchmarks Normal Load (32-step Rock, Med Intensity)', () => {
        runBenchmark('Normal Load (Rock)', 32, (state) => {
            state.arranger.totalSteps = 32;
            state.arranger.stepMap = [
                {
                    start: 0,
                    end: 32,
                    chord: {
                        absName: 'C',
                        rootMidi: 60,
                        quality: 'major',
                        intervals: [0, 4, 7],
                        freqs: [261.63, 329.63, 392.0],
                    },
                },
            ];
            state.soloist.enabled = true;
            state.soloist.style = 'rock';
            state.bass.enabled = true;
            state.chords.enabled = true;
            state.harmony.enabled = true;
            state.playback.bandIntensity = 0.5;
        });
    });

    it('benchmarks High Load (64-step Jazz "Bird", High Intensity)', () => {
        runBenchmark('High Load (Jazz Bird)', 64, (state) => {
            state.arranger.totalSteps = 64;
            state.arranger.stepMap = [
                {
                    start: 0,
                    end: 64,
                    chord: {
                        absName: 'Cmaj7',
                        rootMidi: 60,
                        quality: 'maj7',
                        intervals: [0, 4, 7, 11],
                        freqs: [261.63, 329.63, 392.0, 493.88],
                    },
                },
            ];
            state.soloist.enabled = true;
            state.soloist.style = 'bird';
            state.bass.enabled = true;
            state.chords.enabled = true;
            state.harmony.enabled = true;
            state.playback.bandIntensity = 0.9;
            state.groove.genreFeel = 'Jazz';
        });
    });

    it('benchmarks Extreme Load (128-step Metal, Max Intensity)', () => {
        runBenchmark('Extreme Load (Metal)', 128, (state) => {
            state.arranger.totalSteps = 128;
            state.arranger.stepMap = [
                {
                    start: 0,
                    end: 128,
                    chord: {
                        absName: 'E5',
                        rootMidi: 40,
                        quality: '5',
                        intervals: [0, 7],
                        freqs: [82.41, 123.47],
                    },
                },
            ];
            state.soloist.enabled = true;
            state.soloist.style = 'metal';
            state.bass.enabled = true;
            state.chords.enabled = true;
            state.harmony.enabled = true;
            state.playback.bandIntensity = 1.0;
            state.groove.genreFeel = 'Metal';
        });
    });
});
