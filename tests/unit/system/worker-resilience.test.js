/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Global Mocks for Worker
let lastWorkerInstance = null;
global.Worker = class MockWorker {
    constructor(url) {
        this.url = url;
        this.postMessage = vi.fn();
        this.terminate = vi.fn();
        lastWorkerInstance = this;
    }
};

const { initWorker, getTimerWorker, syncWorker } = await import('../../../public/worker-client.js');

describe('Worker Resilience & Error Handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Force reset the module's internal state if possible,
        // but here we just ensure lastWorkerInstance is tracked.
        initWorker();
    });

    it('should log an error when the worker sends an error message', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const worker = getTimerWorker();
        worker.onmessage({ data: { type: 'error', data: 'Internal Synth Crash' } });

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('[Worker Error]'),
            'Internal Synth Crash',
        );
        consoleSpy.mockRestore();
    });

    it('should gracefully handle malformed messages from the worker', () => {
        const onNotes = vi.fn();
        initWorker(null, onNotes);

        const worker = getTimerWorker();

        // Missing 'type'
        expect(() => {
            worker.onmessage({ data: { unknown: 'payload' } });
        }).not.toThrow();

        // Type 'notes' but missing 'notes' array
        worker.onmessage({ data: { type: 'notes' } });
        expect(onNotes).toHaveBeenCalledWith(undefined, undefined, undefined, undefined);
    });

    it('should handle multiple rapid sync calls without worker congestion', () => {
        // Flood syncWorker
        for (let i = 0; i < 50; i++) {
            syncWorker('SET_BAND_INTENSITY');
        }

        // Each call should result in a postMessage
        expect(lastWorkerInstance.postMessage).toHaveBeenCalledTimes(50);
    });
});
