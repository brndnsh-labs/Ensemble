/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Worker
const mockPostMessage = vi.fn();
global.Worker = class MockWorker {
    constructor() {
        this.postMessage = mockPostMessage;
        this.onmessage = null;
    }
};

// Mock URL
global.URL.createObjectURL = vi.fn(() => 'blob:mock');
global.URL.revokeObjectURL = vi.fn();

import { initWorker, setExportProgressHandler, startExport } from '../../public/worker-client.js';
import { WORKER_RESP, WORKER_MSG } from '../../public/worker-types.js';

describe('Worker Client', () => {
    let worker;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset singleton if possible?
        // initWorker checks if timerWorker exists.
        // In unit tests, modules are cached.
        // We might need to reset the module or rely on internals.
        // Since `timerWorker` is not exported, we can't easily reset it.
        // However, we can just call initWorker and use the existing one if it persists,
        // but `getTimerWorker()` exposes it.

        // Actually, since `initWorker` is idempotent, we can call it.
        initWorker(() => {}, () => {});
        // Access the internal worker instance via the getter
        const { getTimerWorker } =  await import('../../public/worker-client.js');
        worker = getTimerWorker();
    });

    it('should handle EXPORT_PROGRESS messages', () => {
        const progressSpy = vi.fn();
        setExportProgressHandler(progressSpy);

        // Simulate worker sending progress
        const progressEvent = {
            data: {
                type: WORKER_RESP.EXPORT_PROGRESS,
                progress: 0.5
            }
        };
        worker.onmessage(progressEvent);

        expect(progressSpy).toHaveBeenCalledWith(0.5);
    });

    it('should handle EXPORT_COMPLETE messages and call progress with 1.0', () => {
        const progressSpy = vi.fn();
        setExportProgressHandler(progressSpy);

        // Simulate worker sending complete
        const completeEvent = {
            data: {
                type: WORKER_RESP.EXPORT_COMPLETE,
                blob: new Blob(['test'], { type: 'audio/midi' }),
                filename: 'test.mid'
            }
        };
        worker.onmessage(completeEvent);

        expect(progressSpy).toHaveBeenCalledWith(1.0);
        expect(global.URL.createObjectURL).toHaveBeenCalled();
    });
});
