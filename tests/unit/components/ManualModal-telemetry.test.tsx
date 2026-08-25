/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTrack, mockDispatch } = vi.hoisted(() => ({
    mockTrack: vi.fn(),
    mockDispatch: vi.fn(),
}));

vi.mock('../../../public/data/manual-metadata.js', () => ({
    injectManualMetadata: (html: string) => html,
}));

vi.mock('../../../public/state.js', () => ({
    dispatch: mockDispatch,
}));

vi.mock('../../../public/telemetry.js', () => ({
    isStyleGallerySlug: (slug: string | null) => slug === 'jazz-blues-bb',
    track: mockTrack,
}));

vi.mock('../../../public/components/use-modal-a11y.js', () => ({
    useModalA11y: vi.fn(),
}));

import { ManualModal } from '../../../public/components/ManualModal.jsx';

describe('ManualModal telemetry', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        mockTrack.mockClear();
        mockDispatch.mockClear();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                text: vi
                    .fn()
                    .mockResolvedValue(
                        '[Known](index.html?prog=I&gallery=jazz-blues-bb)\n\n' +
                            '[Unknown](index.html?prog=I&gallery=user-content)',
                    ),
            }),
        );
    });

    afterEach(() => {
        render(null, container);
        container.remove();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('records only fixed, allow-listed Style Gallery slugs', async () => {
        act(() => {
            render(<ManualModal />, container);
        });
        await vi.waitFor(() => {
            expect(container.querySelectorAll('.manual-content a')).toHaveLength(2);
        });
        const links = container.querySelectorAll<HTMLAnchorElement>('.manual-content a');
        const knownClick = new MouseEvent('click', { bubbles: true, cancelable: true });
        const unknownClick = new MouseEvent('click', { bubbles: true, cancelable: true });
        knownClick.preventDefault();
        unknownClick.preventDefault();

        act(() => {
            links[0].dispatchEvent(knownClick);
            links[1].dispatchEvent(unknownClick);
        });

        expect(mockTrack).toHaveBeenCalledTimes(1);
        expect(mockTrack).toHaveBeenCalledWith('style_gallery_link', {
            slug: 'jazz-blues-bb',
        });
    });
});
