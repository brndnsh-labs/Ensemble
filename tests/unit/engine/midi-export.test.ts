/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStartExport } = vi.hoisted(() => {
    return {
        mockStartExport: vi.fn(),
    };
});

vi.mock('../../../public/worker-client.js', () => ({
    startExport: mockStartExport,
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: vi.fn(),
}));

import { exportToMidi } from '../../../public/export/midi-export.js';

describe('MIDI Export Logic', () => {
    beforeEach(() => {
        mockStartExport.mockClear();
        mockStartExport.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should sanitize filename passed to startExport', async () => {
        const dirtyFilename = 'My Song/../<script>';
        await exportToMidi({ filename: dirtyFilename });

        expect(mockStartExport).toHaveBeenCalled();
        const options = mockStartExport.mock.calls[0][0];

        expect(options.filename).not.toContain('<script>');
        expect(options.filename).not.toContain('/');
        // Assuming strict alphanumeric + safe chars
        expect(options.filename).toMatch(/^[a-zA-Z0-9\s\-_()]+$/);
    });

    it('should truncate extremely long filenames', async () => {
        const longFilename = 'a'.repeat(100);
        await exportToMidi({ filename: longFilename });

        expect(mockStartExport).toHaveBeenCalled();
        const options = mockStartExport.mock.calls[0][0];

        expect(options.filename.length).toBeLessThanOrEqual(64);
    });

    it('keeps the caller pending until the worker export settles', async () => {
        let finishExport: ((value?: unknown) => void) | undefined;
        mockStartExport.mockReturnValue(
            new Promise((resolve) => {
                finishExport = resolve;
            }),
        );

        let settled = false;
        const exportPromise = exportToMidi({ filename: 'pending' }).then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);

        finishExport!();
        await exportPromise;
        expect(settled).toBe(true);
    });
});
