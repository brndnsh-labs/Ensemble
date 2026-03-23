/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const { mockDispatch, mockUseEnsembleState } = vi.hoisted(() => ({
    mockDispatch: vi.fn(),
    mockUseEnsembleState: vi.fn(),
}));

vi.mock('../../../public/ui-bridge.js', () => ({
    useDispatch: () => mockDispatch,
    useEnsembleState: (selector) => mockUseEnsembleState(selector),
}));

vi.mock('../../../public/state.js', () => ({
    dispatch: mockDispatch,
    getState: () => ({
        arranger: {
            sections: [],
            lastInteractedSectionId: null,
        },
    }),
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: vi.fn(),
}));

vi.mock('../../../public/arranger-controller.js', () => ({
    addSection: vi.fn(),
    clearChordPresetHighlight: vi.fn(),
    refreshArrangerUI: vi.fn(),
    saveProgression: vi.fn(),
    validateAndAnalyze: vi.fn(),
}));

vi.mock('../../../public/history.js', () => ({
    pushHistory: vi.fn(),
    undo: vi.fn(),
}));

vi.mock('../../../public/components/Arranger.jsx', () => ({
    Arranger: () => <div id="mockArranger">Mock Arranger</div>,
}));

import { EditorModal } from '../../../public/components/EditorModal.jsx';

describe('EditorModal Component', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.restoreAllMocks();
    });

    const setupOpenState = (overrides = {}) => {
        mockUseEnsembleState.mockImplementation((selector) => {
            const state = {
                playback: {
                    modals: { editor: true },
                },
                soloist: {
                    leadSheetMelody: [],
                },
                arranger: {
                    key: 'C',
                    totalSteps: 16,
                },
                ...overrides,
            };
            return selector(state);
        });
    };

    it('should render the Arranger component when open', () => {
        setupOpenState();

        act(() => {
            render(<EditorModal />, container);
        });

        expect(container.textContent).toContain('Arrangement Editor');
        expect(container.querySelector('#mockArranger')).not.toBeNull();
    });

    it('should toggle the action menu when clicking the trigger button', async () => {
        setupOpenState();

        act(() => {
            render(<EditorModal />, container);
        });

        const triggerBtn = container.querySelector('#arrangerActionTrigger');

        await act(async () => {
            triggerBtn.click();
        });

        expect(container.querySelector('#arrangerActionMenu').classList.contains('open')).toBe(
            true,
        );
        expect(container.textContent).toContain('Import Tab');

        await act(async () => {
            triggerBtn.click();
        });

        expect(container.querySelector('#arrangerActionMenu').classList.contains('open')).toBe(
            false,
        );
    });

    it('should transition to import mode when clicking Import Tab in the menu', async () => {
        setupOpenState();

        act(() => {
            render(<EditorModal />, container);
        });

        // Open menu
        await act(async () => {
            container.querySelector('#arrangerActionTrigger').click();
        });

        const importBtn = container.querySelector('#importTabBtn');
        await act(async () => {
            importBtn.click();
        });

        expect(container.textContent).toContain('Import Tab');
        expect(container.querySelector('#tabPasteArea')).not.toBeNull();
    });

    it('should dispatch close action when clicking Done', () => {
        setupOpenState();

        act(() => {
            render(<EditorModal />, container);
        });

        const doneBtn = container.querySelector('#closeEditorBtn');
        act(() => {
            doneBtn.click();
        });

        expect(mockDispatch).toHaveBeenCalledWith('SET_MODAL_OPEN', {
            modal: 'editor',
            open: false,
        });
    });
});
