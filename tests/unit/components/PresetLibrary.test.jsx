/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

// Mock dependencies
const mockUseEnsembleState = vi.fn();
const mockDispatch = vi.fn();

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => mockUseEnsembleState(selector),
    useDispatch: () => mockDispatch
}));

vi.mock('../../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: mockDispatch
}));

// Mock Presets
vi.mock('../../../public/presets.js', () => ({
    CHORD_PRESETS: [
        { name: 'Pop (Standard)', category: 'Pop/Rock', sections: [] },
        { name: 'Another Preset', category: 'Other', sections: [] }
    ],
    DRUM_PRESETS: {
        'Basic Rock': { category: 'Pop/Rock', swing: 0, sub: '8th' },
        'Jazz': { category: 'Jazz', swing: 60, sub: '8th' }
    }
}));

// Mock Utils
vi.mock('../../../public/utils.js', () => ({
    formatUnicodeSymbols: (s) => s,
    generateId: () => 'test-id',
    decompressSections: (s) => s
}));

// Mock Controllers
vi.mock('../../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
    switchMeasure: vi.fn()
}));

vi.mock('../../../public/arranger-controller.js', () => ({
    validateAndAnalyze: vi.fn(),
    clearChordPresetHighlight: vi.fn() // We mock it to verify calls if needed, though we test Reactivity
}));

vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn()
}));

vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn()
}));

import { PresetLibrary } from '../../../public/components/PresetLibrary.jsx';

describe('PresetLibrary Component', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);

        // Mock localStorage
        const storage = {};
        global.localStorage = {
            getItem: (key) => storage[key] || null,
            setItem: (key, value) => { storage[key] = value; },
            removeItem: (key) => { delete storage[key]; }
        };
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.restoreAllMocks();
    });

    it('should show chord preset as active when isDirty is false', () => {
        // Setup state: dirty=false, lastChordPreset='Pop (Standard)'
        mockUseEnsembleState.mockImplementation(selector => {
            const state = {
                arranger: { lastChordPreset: 'Pop (Standard)', isDirty: false },
                groove: { lastDrumPreset: 'Basic Rock' }
            };
            return selector(state);
        });

        act(() => {
            render(<PresetLibrary type="chord" />, container);
        });

        const activeChip = container.querySelector('.chord-preset-chip.active');
        expect(activeChip).not.toBeNull();
        expect(activeChip.textContent).toBe('Pop (Standard)');
    });

    it('should NOT show chord preset as active when isDirty is true', () => {
        // Setup state: dirty=true, lastChordPreset='Pop (Standard)'
        mockUseEnsembleState.mockImplementation(selector => {
            const state = {
                arranger: { lastChordPreset: 'Pop (Standard)', isDirty: true },
                groove: { lastDrumPreset: 'Basic Rock' }
            };
            return selector(state);
        });

        act(() => {
            render(<PresetLibrary type="chord" />, container);
        });

        const activeChip = container.querySelector('.chord-preset-chip.active');
        // This expectation validates the FIX.
        // Currently (before fix), this test is expected to FAIL because the component ignores isDirty.
        expect(activeChip).toBeNull();
    });

    it('should show drum preset as active regardless of isDirty', () => {
        // Setup state: dirty=true (arranger dirty), lastDrumPreset='Basic Rock'
        mockUseEnsembleState.mockImplementation(selector => {
            const state = {
                arranger: { lastChordPreset: 'Pop (Standard)', isDirty: true },
                groove: { lastDrumPreset: 'Basic Rock' }
            };
            return selector(state);
        });

        act(() => {
            render(<PresetLibrary type="drum" />, container);
        });

        // Drums should stay active even if arranger is dirty
        const activeChip = container.querySelector('.drum-preset-chip.active');
        expect(activeChip).not.toBeNull();
        expect(activeChip.textContent).toBe('Basic Rock');
    });
});
