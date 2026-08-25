// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies using vi.hoisted to avoid reference errors
const { mockUseEnsembleState, mockDispatch, mockExportToMidi, mockGenerateShareUrl, mockTrack } =
    vi.hoisted(() => {
        return {
            mockUseEnsembleState: vi.fn(),
            mockDispatch: vi.fn(),
            mockExportToMidi: vi.fn(),
            mockGenerateShareUrl: vi.fn(() => 'https://ensemble.brndn.zip/?s=safe'),
            mockTrack: vi.fn(),
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

vi.mock('../../../public/export/midi-export.js', () => ({
    exportToMidi: mockExportToMidi,
}));

vi.mock('../../../public/export/sharing.js', () => ({
    generateShareUrl: mockGenerateShareUrl,
}));

vi.mock('../../../public/telemetry.js', () => ({
    track: mockTrack,
}));

import { ShareModal } from '../../../public/components/ShareModal.jsx';

describe('ShareModal Security', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        mockUseEnsembleState.mockReturnValue(true); // isOpen = true
        mockExportToMidi.mockClear();
        mockGenerateShareUrl.mockClear();
        mockTrack.mockClear();
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: undefined,
        });
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

    it('records native shares only after the share sheet succeeds', async () => {
        const nativeShare = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: nativeShare,
        });
        act(() => {
            render(<ShareModal />, container);
        });
        const shareButton = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent.trim() === 'Share',
        );

        await act(async () => {
            shareButton.click();
            await Promise.resolve();
        });

        expect(nativeShare).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'https://ensemble.brndn.zip/?s=safe' }),
        );
        expect(mockTrack).toHaveBeenCalledWith('share_sent', { audition: false });
    });

    it('does not record a cancelled native share', async () => {
        const nativeShare = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: nativeShare,
        });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        act(() => {
            render(<ShareModal />, container);
        });
        const shareButton = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent.trim() === 'Share',
        );

        await act(async () => {
            shareButton.click();
            await Promise.resolve();
        });

        expect(mockTrack).not.toHaveBeenCalledWith('share_sent', expect.anything());
    });
});
