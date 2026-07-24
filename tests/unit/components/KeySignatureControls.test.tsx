// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ui-bridge
const mockUseDispatch = vi.fn();
const mockDispatch = vi.fn();
const mockUseEnsembleState = vi.fn();

vi.mock('../../../public/ui-bridge.js', () => ({
    useDispatch: () => {
        mockUseDispatch();
        return mockDispatch;
    },
    useEnsembleState: (selector) => mockUseEnsembleState(selector),
}));

// Mock arranger-controller
vi.mock('../../../public/arranger-controller.js', () => ({
    refreshArrangerUI: vi.fn(),
    setKeyCenter: vi.fn(),
    switchToRelativeKey: vi.fn(),
    transposeKey: vi.fn(),
}));

// Mock config
vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { grouping: [4] },
        '3/4': { grouping: [3] },
        '2/4': { grouping: [2] },
        '5/4': { grouping: [3, 2] },
        '6/8': { grouping: [3, 3] },
        '7/8': { grouping: [2, 2, 3] },
        '7/4': { grouping: [4, 3] },
        '12/8': { grouping: [3, 3, 3, 3] },
    },
}));

// Mock instrument-controller
vi.mock('../../../public/instrument-controller.js', () => ({
    flushBuffers: vi.fn(),
    loadDrumPreset: vi.fn(),
}));

// Mock persistence
vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

// Mock sanitize
vi.mock('../../../public/sanitize.js', () => ({
    formatUnicodeSymbols: (str) => str,
}));

// Mock worker-client
vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
}));

const { mockArranger } = vi.hoisted(() => ({
    mockArranger: {
        key: 'C',
        timeSignature: '4/4',
        isMinor: false,
        grouping: null,
    },
}));
vi.mock('../../../public/state.js', () => ({
    arranger: mockArranger,
}));

import {
    refreshArrangerUI,
    setKeyCenter,
    switchToRelativeKey,
    transposeKey,
} from '../../../public/arranger-controller.js';
import { KeySignatureControls } from '../../../public/components/KeySignatureControls.jsx';
import { loadDrumPreset } from '../../../public/instrument-controller.js';

describe('KeySignatureControls Component', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);

        // Default state mock
        mockUseEnsembleState.mockImplementation((selector) => {
            const state = {
                arranger: {
                    key: 'C',
                    timeSignature: '4/4',
                    isMinor: false,
                    grouping: null,
                },
                groove: {
                    lastDrumPreset: null,
                },
                vizState: {},
            };
            return selector(state);
        });

        // Reset dynamic import state
        mockArranger.key = 'C';
        mockArranger.timeSignature = '4/4';
        mockArranger.isMinor = false;
        mockArranger.grouping = null;
    });

    afterEach(() => {
        act(() => {
            render(null, container);
        });
        document.body.removeChild(container);
        document.body.className = ''; // Reset body classes
        vi.clearAllMocks();
    });

    it('renders initial controls correctly', () => {
        act(() => {
            render(<KeySignatureControls />, container);
        });

        const keySelect = document.body.querySelector('#keySelect');
        const keyMenuBtn = container.querySelector('#keyMenuBtn');
        const activeMeter = document.body.querySelector('.meter-chip.is-active');
        const groupingToggle = document.body.querySelector('#groupingToggle');

        expect(keyMenuBtn.textContent).toContain('Key');
        expect(keyMenuBtn.textContent).toContain('C maj');
        expect(keySelect.value).toBe('C');
        expect(activeMeter?.getAttribute('data-meter')).toBe('4/4');
        expect((groupingToggle as HTMLElement).hidden).toBe(true);
    });

    it('handles key change', async () => {
        act(() => {
            render(<KeySignatureControls />, container);
        });

        const keySelect = document.body.querySelector('#keySelect');

        // Ensure Preact processes the state update
        keySelect.value = 'G';
        act(() => {
            keySelect.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await vi.waitFor(
            () => {
                // #778: the dropdown now TRANSPOSES to the chosen tonic (via setKeyCenter),
                // rather than relabeling the key (the old SET_KEY dispatch).
                expect(setKeyCenter).toHaveBeenCalledWith('G');
            },
            { timeout: 1000, interval: 5 },
        );
        // validate/save now happen inside setKeyCenter -> transposeKey -> refreshArrangerUI
        // (covered in arranger-controller.test.ts), not in the component.
    });

    it('handles time signature change without lastDrumPreset', async () => {
        act(() => {
            render(<KeySignatureControls />, container);
        });

        const meterChip = document.body.querySelector('[data-meter="3/4"]');

        act(() => {
            meterChip.dispatchEvent(new Event('click', { bubbles: true }));
        });

        await vi.waitFor(
            () => {
                expect(mockDispatch).toHaveBeenCalledWith('SET_TIME_SIGNATURE', '3/4');
            },
            { timeout: 1000, interval: 5 },
        );

        expect(mockDispatch).toHaveBeenCalledWith('SET_GROUPING', null);
        expect(loadDrumPreset).not.toHaveBeenCalled();
        // #1030/#1128: a mid-playback meter change delegates to refreshArrangerUI(),
        // which flushes + full-syncs the worker (no SET_TIME_SIGNATURE delta case) —
        // otherwise the worker keeps generating on the stale meter until stop→play.
        // The internal validate→syncWorker→flushBuffers order is guarded in
        // arranger-controller.test (#1120).
        expect(refreshArrangerUI).toHaveBeenCalled();
    });

    it('handles time signature change with lastDrumPreset', async () => {
        mockUseEnsembleState.mockImplementation((selector) => {
            return selector({
                arranger: { key: 'C', timeSignature: '4/4', isMinor: false, grouping: null },
                groove: { lastDrumPreset: 'Jazz Kit' },
                vizState: {},
            });
        });

        act(() => {
            render(<KeySignatureControls />, container);
        });

        const meterChip = document.body.querySelector('[data-meter="3/4"]');

        act(() => {
            meterChip.dispatchEvent(new Event('click', { bubbles: true }));
        });

        await vi.waitFor(
            () => {
                expect(loadDrumPreset).toHaveBeenCalledWith('Jazz Kit');
            },
            { timeout: 1000, interval: 5 },
        );

        expect(mockDispatch).toHaveBeenCalledWith('SET_TIME_SIGNATURE', '3/4');
    });

    it('renders grouping toggle for 5/4 and allows cycling options', async () => {
        mockUseEnsembleState.mockImplementation((selector) => {
            return selector({
                arranger: { key: 'C', timeSignature: '5/4', isMinor: false, grouping: [3, 2] },
                groove: { lastDrumPreset: null },
                vizState: {},
            });
        });

        mockArranger.timeSignature = '5/4';
        mockArranger.grouping = [3, 2];

        act(() => {
            render(<KeySignatureControls />, container);
        });

        const groupingToggle = document.body.querySelector('#groupingToggle');
        expect((groupingToggle as HTMLElement).hidden).toBe(false);

        const groupingLabel = document.body.querySelector('#groupingLabel');
        expect(groupingLabel.textContent).toBe('3+2');

        act(() => {
            groupingLabel.dispatchEvent(new Event('click', { bubbles: true }));
        });

        await vi.waitFor(
            () => {
                // 5/4 options are [[3, 2], [2, 3]]
                // It should advance from [3, 2] to [2, 3]
                expect(mockDispatch).toHaveBeenCalledWith('SET_GROUPING', [2, 3]);
            },
            { timeout: 1000, interval: 5 },
        );

        // #1128: cycling grouping delegates the worker resync to refreshArrangerUI().
        expect(refreshArrangerUI).toHaveBeenCalled();
    });

    it('does nothing when toggling grouping on unsupported time signature', async () => {
        mockUseEnsembleState.mockImplementation((selector) => {
            return selector({
                arranger: { key: 'C', timeSignature: '4/4', isMinor: false, grouping: null },
                groove: { lastDrumPreset: null },
                vizState: {},
            });
        });

        act(() => {
            render(<KeySignatureControls />, container);
        });

        const groupingLabel = document.body.querySelector('#groupingLabel');
        if (groupingLabel) {
            // Note: button might be in DOM but display:none
            await act(async () => {
                groupingLabel.dispatchEvent(new Event('click', { bubbles: true }));
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            expect(mockDispatch).not.toHaveBeenCalledWith('SET_GROUPING', expect.anything());
        }
    });

    it('handles relative key toggle', () => {
        act(() => {
            render(<KeySignatureControls />, container);
        });

        const relKeyBtn = document.body.querySelector('#relKeyBtn');
        expect(relKeyBtn.textContent).toBe('Relative minor');

        act(() => {
            relKeyBtn.dispatchEvent(new Event('click', { bubbles: true }));
        });

        expect(switchToRelativeKey).toHaveBeenCalled();
        // #1166: the button used to fire a trailing dispatch('REL_KEY_TOGGLE') that no reducer
        // arm or listener consumed. switchToRelativeKey() already does the real work (SET_PARAM
        // + refreshArrangerUI). Guard against the inert dispatch coming back.
        expect(mockDispatch).not.toHaveBeenCalledWith('REL_KEY_TOGGLE');
    });

    it('handles transpose buttons', () => {
        act(() => {
            render(<KeySignatureControls />, container);
        });

        const transDownBtn = document.body.querySelector('#transDownBtn');
        const transUpBtn = document.body.querySelector('#transUpBtn');

        act(() => {
            transDownBtn.dispatchEvent(new Event('click', { bubbles: true }));
        });

        expect(transposeKey).toHaveBeenCalledWith(-1);
        // #1166: no trailing inert dispatch — transposeKey() owns the state write.
        expect(mockDispatch).not.toHaveBeenCalledWith('TRANSPOSE');

        act(() => {
            transUpBtn.dispatchEvent(new Event('click', { bubbles: true }));
        });

        expect(transposeKey).toHaveBeenCalledWith(1);
        expect(mockDispatch).not.toHaveBeenCalledWith('TRANSPOSE');
    });
});
