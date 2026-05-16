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
    switchToRelativeKey: vi.fn(),
    transposeKey: vi.fn(),
    validateAndAnalyze: vi.fn(),
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

// Mock utils
vi.mock('../../../public/utils.js', () => ({
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
    switchToRelativeKey,
    transposeKey,
    validateAndAnalyze,
} from '../../../public/arranger-controller.js';
import { KeySignatureControls } from '../../../public/components/KeySignatureControls.jsx';
import { flushBuffers, loadDrumPreset } from '../../../public/instrument-controller.js';
import { saveCurrentState } from '../../../public/persistence.js';
import { syncWorker } from '../../../public/worker-client.js';

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
        const timeSigSelect = container.querySelector('#timeSigSelect');
        const groupingToggle = document.body.querySelector('#groupingToggle');

        expect(keyMenuBtn.textContent).toContain('Key');
        expect(keyMenuBtn.textContent).toContain('C maj');
        expect(keySelect.value).toBe('C');
        expect(timeSigSelect.value).toBe('4/4');
        expect(groupingToggle.style.display).toBe('none');
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
                expect(mockDispatch).toHaveBeenCalledWith('SET_KEY', 'G');
            },
            { timeout: 1000, interval: 5 },
        );

        expect(validateAndAnalyze).toHaveBeenCalled();
        expect(saveCurrentState).toHaveBeenCalled();
    });

    it('handles time signature change without lastDrumPreset', async () => {
        act(() => {
            render(<KeySignatureControls />, container);
        });

        const timeSigSelect = container.querySelector('#timeSigSelect');

        timeSigSelect.value = '3/4';
        act(() => {
            timeSigSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await vi.waitFor(
            () => {
                expect(mockDispatch).toHaveBeenCalledWith('SET_TIME_SIGNATURE', '3/4');
            },
            { timeout: 1000, interval: 5 },
        );

        expect(mockDispatch).toHaveBeenCalledWith('SET_GROUPING', null);
        expect(loadDrumPreset).not.toHaveBeenCalled();
        expect(validateAndAnalyze).toHaveBeenCalled();
        expect(saveCurrentState).toHaveBeenCalled();
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

        const timeSigSelect = container.querySelector('#timeSigSelect');

        act(() => {
            timeSigSelect.value = '3/4';
            timeSigSelect.dispatchEvent(new Event('change'));
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
        expect(groupingToggle.style.display).toBe('flex');

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

        expect(flushBuffers).toHaveBeenCalled();
        expect(syncWorker).toHaveBeenCalled();
        expect(saveCurrentState).toHaveBeenCalled();
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
        expect(mockDispatch).toHaveBeenCalledWith('REL_KEY_TOGGLE');
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
        expect(mockDispatch).toHaveBeenCalledWith('TRANSPOSE');

        act(() => {
            transUpBtn.dispatchEvent(new Event('click', { bubbles: true }));
        });

        expect(transposeKey).toHaveBeenCalledWith(1);
        expect(mockDispatch).toHaveBeenCalledWith('TRANSPOSE');
    });
});
