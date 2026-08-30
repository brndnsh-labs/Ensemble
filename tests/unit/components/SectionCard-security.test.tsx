// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockUseEnsembleState = vi.fn();
const mockDispatch = vi.fn();

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => mockUseEnsembleState(selector),
    useDispatch: () => mockDispatch,
    useMediaQuery: () => false,
}));

vi.mock('../../../public/state.js', () => {
    const mockState = {
        arranger: {
            isMinor: false,
            key: 'C',
            lastInteractedSectionId: null,
        },
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: vi.fn(),
        ACTIONS: {},
    };
});

vi.mock('../../../public/controllers/arranger-controller.js', () => ({
    onSectionUpdate: vi.fn(),
    onSectionDelete: vi.fn(),
    onSectionDuplicate: vi.fn(),
    saveProgression: vi.fn(),
    addSection: vi.fn(),
    refreshArrangerUI: vi.fn(),
    clearChordPresetHighlight: vi.fn(),
    validateAndAnalyze: vi.fn(),
}));

vi.mock('../../../public/components/SymbolMenu.jsx', () => ({
    SymbolMenu: () => <div data-testid="symbol-menu">Menu</div>,
}));

import { SectionCard } from '../../../public/components/SectionCard.jsx';
import { onSectionUpdate } from '../../../public/controllers/arranger-controller.js';

describe('SectionCard Security', () => {
    let container;

    beforeEach(() => {
        onSectionUpdate.mockClear();
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
            seamless: false,
        };

        mockUseEnsembleState.mockReturnValue({
            isMinor: false,
            arrangerKey: 'C',
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
            seamless: false,
        };

        mockUseEnsembleState.mockReturnValue({
            isMinor: false,
            arrangerKey: 'C',
        });

        act(() => {
            render(<SectionCard section={section} index={0} totalSections={1} />, container);
        });

        const textarea = container.querySelector('.section-prog-input');
        expect(textarea).toBeTruthy();
        expect(textarea.getAttribute('maxLength')).toBe('1000');
    });

    it('keeps the pointer drag handle out of the accessibility tree', () => {
        const section = {
            id: 'test-1',
            label: 'Verse 1',
            value: 'C G Am F',
            repeat: 1,
            seamless: false,
        };
        mockUseEnsembleState.mockReturnValue({ isMinor: false, arrangerKey: 'C' });

        act(() => {
            render(<SectionCard section={section} index={0} totalSections={2} />, container);
        });

        const handle = container.querySelector('.section-drag-handle');
        expect(handle).not.toBeNull();
        expect(handle.getAttribute('aria-hidden')).toBe('true');
        expect(handle.hasAttribute('role')).toBe(false);
        expect(handle.hasAttribute('tabindex')).toBe(false);

        const moveDown = container.querySelector('button[aria-label="Move Section Down"]');
        expect(moveDown).not.toBeNull();
        expect(moveDown.disabled).toBe(false);
        act(() => {
            moveDown.click();
        });
        expect(onSectionUpdate).toHaveBeenCalledWith('test-1', 'move', 1);
    });
});
