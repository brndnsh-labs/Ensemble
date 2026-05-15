// @ts-nocheck
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORKER_RESP } from '../../../public/worker-types.js';

// Mock the Worker
class MockWorker {
    constructor(path) {
        this.path = path;
        this.onmessage = null;
    }
    postMessage() {}
    terminate() {}
}

global.Worker = MockWorker;

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock dependencies
vi.mock('../../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
    storage: { get: vi.fn(), save: vi.fn() },
}));

// We need to import the module under test AFTER mocking
import { getTimerWorker, initWorker } from '../../../public/worker-client.js';

describe('Security: Worker Boundary', () => {
    let worker;
    let createElementSpy;
    let clickSpy;

    beforeEach(() => {
        // Reset DOM mocks
        clickSpy = vi.fn();
        createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName === 'a') {
                return {
                    href: '',
                    download: '',
                    click: clickSpy,
                };
            }
            return {};
        });

        // Initialize the worker
        initWorker(
            () => {},
            () => {},
        );
        worker = getTimerWorker();
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('should sanitize filename from worker before download (Path Traversal Prevention)', () => {
        const maliciousFilename = '../../etc/passwd.exe';

        // Simulate message from worker
        const event = {
            data: {
                type: WORKER_RESP.EXPORT_COMPLETE,
                blob: new Blob(['test'], { type: 'audio/midi' }),
                filename: maliciousFilename,
            },
        };

        // Trigger the handler
        worker.onmessage(event);

        expect(createElementSpy).toHaveBeenCalledWith('a');
        expect(clickSpy).toHaveBeenCalled();

        const anchor = createElementSpy.mock.results[0].value;

        // Verify sanitization
        expect(anchor.download).not.toBe(maliciousFilename);
        expect(anchor.download).toMatch(/^[a-zA-Z0-9\s\-_()]+\.mid$/);
    });

    it('should handle legitimate filenames correctly', () => {
        const validFilename = 'my-song.mid';

        const event = {
            data: {
                type: WORKER_RESP.EXPORT_COMPLETE,
                blob: new Blob(['test'], { type: 'audio/midi' }),
                filename: validFilename,
            },
        };

        worker.onmessage(event);

        const anchor = createElementSpy.mock.results[0].value;
        expect(anchor.download).toBe(validFilename);
    });
});
