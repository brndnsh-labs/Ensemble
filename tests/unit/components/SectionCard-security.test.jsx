/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

// Mock dependencies
const mockUseEnsembleState = vi.fn();

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => mockUseEnsembleState(selector)
}));

vi.mock('../../../public/state.js', () => {
    const mockState = {
        arranger: {
            isMinor: false,
            key: 'C',
            lastInteractedSectionId: null
        }
    };
    return {
        getState: () => mockState,
        dispatch: vi.fn(),
        ACTIONS: {}
    };
});

vi.mock('../../../public/arranger-controller.js', () => ({
    onSectionUpdate: vi.fn(),
    onSectionDelete: vi.fn(),
    onSectionDuplicate: vi.fn()
}));

vi.mock('../../../public/components/SymbolMenu.jsx', () => ({
    SymbolMenu: () => <div data-testid="symbol-menu">Menu</div>
}));

import { SectionCard } from '../../../public/components/SectionCard.jsx';

describe('SectionCard Security', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.restoreAllMocks();
    });

    it('should have maxLength attribute on label input', () => {
        const section = {
            id: 'test-1',
            label: 'Verse 1',
            value: 'C G Am F',
            repeat: 1,
            seamless: false
        };

        mockUseEnsembleState.mockReturnValue({
            isMinor: false,
            arrangerKey: 'C'
        });

        act(() => {
            render(<SectionCard section={section} index={0} totalSections={1} />, container);
        });

        const labelInput = container.querySelector('.section-label-input');
        expect(labelInput).toBeTruthy();
        expect(labelInput.getAttribute('maxLength')).toBe('100');
    });

    it('should have maxLength attribute on progression textarea', () => {
        const section = {
            id: 'test-1',
            label: 'Verse 1',
            value: 'C G Am F',
            repeat: 1,
            seamless: false
        };

        mockUseEnsembleState.mockReturnValue({
            isMinor: false,
            arrangerKey: 'C'
        });

        act(() => {
            render(<SectionCard section={section} index={0} totalSections={1} />, container);
        });

        const textarea = container.querySelector('.section-prog-input');
        expect(textarea).toBeTruthy();
        expect(textarea.getAttribute('maxLength')).toBe('1000');
    });
});
