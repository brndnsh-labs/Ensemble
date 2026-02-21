import { h, render } from 'preact';
import React from 'preact/compat';
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE imports
vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => {
        // Mock state
        const state = {
            groove: {
                activeTab: 'smart',
                enabled: true,
                measures: 1,
                fillActive: false,
                lastSmartGenre: 'Rock',
                pendingGenreFeel: null,
                creativity: false,
            },
            playback: {
                bandIntensity: 0.5,
                autoIntensity: false,
                complexity: 0.5,
            },
        };
        return selector(state);
    },
    useDispatch: () => vi.fn(),
}));

vi.mock('../../../public/state.js', () => ({
    dispatch: vi.fn(),
    ACTIONS: {
        SET_ACTIVE_TAB: 'SET_ACTIVE_TAB',
        SET_BAND_INTENSITY: 'SET_BAND_INTENSITY',
        SET_COMPLEXITY: 'SET_COMPLEXITY',
        SET_CREATIVITY: 'SET_CREATIVITY',
    },
}));

vi.mock('../../../public/types.js', () => ({
    ACTIONS: {
        SET_ACTIVE_TAB: 'SET_ACTIVE_TAB',
        SET_BAND_INTENSITY: 'SET_BAND_INTENSITY',
        SET_COMPLEXITY: 'SET_COMPLEXITY',
        SET_CREATIVITY: 'SET_CREATIVITY',
    },
}));

vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
}));

vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    togglePower: vi.fn(),
    updateMeasures: vi.fn(),
    cloneMeasure: vi.fn(),
    saveDrumPreset: vi.fn(),
}));

// Mock child components to simplify testing
vi.mock('../../../public/components/InstrumentSettings.jsx', () => ({
    InstrumentSettings: () => <div data-testid="instrument-settings">Settings</div>,
}));

vi.mock('../../../public/components/PresetLibrary.jsx', () => ({
    PresetLibrary: () => <div data-testid="preset-library">Presets</div>,
}));

vi.mock('../../../public/components/SequencerGrid.jsx', () => ({
    SequencerGrid: () => <div data-testid="sequencer-grid">Grid</div>,
}));

// Import component under test
import { GroovePanel } from '../../../public/components/GroovePanel.jsx';

describe('GroovePanel Accessibility', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        render(<GroovePanel />, container);
    });

    it('Creativity Toggle should have accessible label', () => {
        const check = container.querySelector('#creativityCheck');
        expect(check).toBeTruthy();

        // 1. Check for associated label
        const label = check.closest('label');
        expect(label).toBeTruthy();
        expect(label.textContent).toContain('Creativity');
    });

    it('Intensity Slider should have accessible label', () => {
        const slider = container.querySelector('#intensitySlider');
        expect(slider).toBeTruthy();

        const id = slider.getAttribute('id');
        const label = container.querySelector(`label[for="${id}"]`);

        // This is expected to FAIL currently
        expect(label).toBeTruthy();
        expect(label.textContent).toContain('Intensity');
    });
});
