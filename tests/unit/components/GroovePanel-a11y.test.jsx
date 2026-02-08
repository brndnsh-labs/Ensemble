
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { h } from 'preact';
import React from 'preact/compat';
import { render } from 'preact';

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
                pendingGenreFeel: null
            },
            playback: {
                bandIntensity: 0.5,
                autoIntensity: false,
                complexity: 0.5
            }
        };
        return selector(state);
    },
    useDispatch: () => vi.fn()
}));

vi.mock('../../../public/state.js', () => ({
    dispatch: vi.fn(),
    ACTIONS: {
        SET_ACTIVE_TAB: 'SET_ACTIVE_TAB',
        SET_BAND_INTENSITY: 'SET_BAND_INTENSITY',
        SET_COMPLEXITY: 'SET_COMPLEXITY'
    }
}));

vi.mock('../../../public/types.js', () => ({
    ACTIONS: {
        SET_ACTIVE_TAB: 'SET_ACTIVE_TAB',
        SET_BAND_INTENSITY: 'SET_BAND_INTENSITY',
        SET_COMPLEXITY: 'SET_COMPLEXITY'
    }
}));

vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn()
}));

vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn()
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    togglePower: vi.fn(),
    updateMeasures: vi.fn(),
    cloneMeasure: vi.fn(),
    saveDrumPreset: vi.fn()
}));

// Mock child components to simplify testing
vi.mock('../../../public/components/InstrumentSettings.jsx', () => ({
    InstrumentSettings: () => <div data-testid="instrument-settings">Settings</div>
}));

vi.mock('../../../public/components/PresetLibrary.jsx', () => ({
    PresetLibrary: () => <div data-testid="preset-library">Presets</div>
}));

vi.mock('../../../public/components/SequencerGrid.jsx', () => ({
    SequencerGrid: () => <div data-testid="sequencer-grid">Grid</div>
}));

// Import component under test
import { GroovePanel } from '../../../public/components/GroovePanel.jsx';

describe('GroovePanel Accessibility', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        render(<GroovePanel />, container);
    });

    it('Complexity Slider should have accessible label and value text', () => {
        const slider = container.querySelector('#complexitySlider');
        expect(slider).toBeTruthy();

        // 1. Check for associated label
        const id = slider.getAttribute('id');
        const label = container.querySelector(`label[for="${id}"]`);

        // This is expected to FAIL currently
        expect(label).toBeTruthy();
        expect(label.textContent).toContain('Complexity');

        // 2. Check for aria-valuetext
        // This is expected to FAIL currently
        const valueText = slider.getAttribute('aria-valuetext');
        expect(valueText).toBe('Medium'); // Based on mock complexity 0.5
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
