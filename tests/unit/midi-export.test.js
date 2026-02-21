/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStartExport, mockSyncWorker } = vi.hoisted(() => {
    return {
        mockStartExport: vi.fn(),
        mockSyncWorker: vi.fn(),
    };
});

vi.mock('../../public/worker-client.js', () => ({
    startExport: mockStartExport,
    syncWorker: mockSyncWorker,
}));

vi.mock('../../public/ui.js', () => ({
    showToast: vi.fn(),
}));

import { exportToMidi } from '../../public/midi-export.js';

describe('MIDI Export Logic', () => {
    beforeEach(() => {
        mockStartExport.mockClear();
        mockSyncWorker.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should sanitize filename passed to startExport', () => {
        const dirtyFilename = 'My Song/../<script>';
        exportToMidi({ filename: dirtyFilename });

        expect(mockStartExport).toHaveBeenCalled();
        const options = mockStartExport.mock.calls[0][0];

        expect(options.filename).not.toContain('<script>');
        expect(options.filename).not.toContain('/');
        // Assuming strict alphanumeric + safe chars
        expect(options.filename).toMatch(/^[a-zA-Z0-9\s\-_()]+$/);
    });

    it('should truncate extremely long filenames', () => {
        const longFilename = 'a'.repeat(100);
        exportToMidi({ filename: longFilename });

        expect(mockStartExport).toHaveBeenCalled();
        const options = mockStartExport.mock.calls[0][0];

        expect(options.filename.length).toBeLessThanOrEqual(64);
    });
});
