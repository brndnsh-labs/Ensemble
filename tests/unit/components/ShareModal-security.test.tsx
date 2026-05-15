// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies using vi.hoisted to avoid reference errors
const { mockUseEnsembleState, mockDispatch, mockExportToMidi } = vi.hoisted(() => {
    return {
        mockUseEnsembleState: vi.fn(),
        mockDispatch: vi.fn(),
        mockExportToMidi: vi.fn(),
    };
});

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => mockUseEnsembleState(selector),
    useDispatch: () => mockDispatch,
}));

vi.mock('../../../public/state.js', () => ({
    getState: () => ({
        arranger: { lastChordPreset: 'My Song', key: 'C', progression: [] },
        playback: { bpm: 120, modals: { share: true } },
    }),
    dispatch: mockDispatch,
    ACTIONS: {
        SET_MODAL_OPEN: 'SET_MODAL_OPEN',
        NOTIFY: 'NOTIFY',
    },
}));

vi.mock('../../../public/midi-export.js', () => ({
    exportToMidi: mockExportToMidi,
}));

import { ShareModal } from '../../../public/components/ShareModal.jsx';

describe('ShareModal Security', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        mockUseEnsembleState.mockReturnValue(true); // isOpen = true
        mockExportToMidi.mockClear();
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.restoreAllMocks();
    });

    it('should have maxLength attribute on filename input', () => {
        act(() => {
            render(<ShareModal />, container);
        });

        const input = container.querySelector('#exportFilenameInput');
        expect(input).toBeTruthy();
        expect(input.getAttribute('maxLength')).toBe('64');
    });

    it('should sanitize filename before calling exportToMidi', async () => {
        act(() => {
            render(<ShareModal />, container);
        });

        const input = container.querySelector('#exportFilenameInput');
        const downloadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent.includes('Download .mid'),
        );

        // Simulate malicious input
        act(() => {
            input.value = 'My Song <script>alert(1)</script> / ../';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await act(async () => {
            downloadBtn.click();
        });

        // Expect strict sanitization - removed unsafe chars
        expect(mockExportToMidi).toHaveBeenCalled();
        const callArgs = mockExportToMidi.mock.calls[0][0];
        const filename = callArgs.filename;

        expect(filename).not.toContain('<script>');
        expect(filename).not.toContain('../');
        expect(filename).not.toContain('/');
        // Expected behavior: clean filename
        expect(filename).toMatch(/^[a-zA-Z0-9\s\-_()]+$/);
    });
});
