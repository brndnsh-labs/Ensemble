/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { h } from 'preact';
import { render } from 'preact';

const { mockState } = vi.hoisted(() => ({
    mockState: {
        groove: {
            activeTab: 'smart',
            enabled: true,
            measures: 1,
            fillActive: false,
            lastSmartGenre: 'Rock',
            pendingGenreFeel: null,
            genreSwitchCountdown: null
        },
        playback: {
            bandIntensity: 0.5,
            autoIntensity: false,
            complexity: 0.5
        }
    }
}));

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => selector(mockState),
    useDispatch: () => vi.fn()
}));

// Mock other dependencies
vi.mock('../../../public/state.js', () => ({
    dispatch: vi.fn(),
    ACTIONS: {}
}));
vi.mock('../../../public/types.js', () => ({ ACTIONS: {} }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../../public/persistence.js', () => ({ saveCurrentState: vi.fn() }));
vi.mock('../../../public/instrument-controller.js', () => ({
    togglePower: vi.fn(),
    updateMeasures: vi.fn(),
    cloneMeasure: vi.fn(),
    saveDrumPreset: vi.fn()
}));
vi.mock('../../../public/components/InstrumentSettings.jsx', () => ({ InstrumentSettings: () => null }));
vi.mock('../../../public/components/PresetLibrary.jsx', () => ({ PresetLibrary: () => null }));
vi.mock('../../../public/components/SequencerGrid.jsx', () => ({ SequencerGrid: () => null }));
// Also mock presets.js since GenreSelector imports it dynamically
vi.mock('../../../public/presets.js', () => ({ SMART_GENRES: {} }));

import { GroovePanel } from '../../../public/components/GroovePanel.jsx';

describe('GroovePanel Genre Badge', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        // Reset mock state defaults
        mockState.groove.pendingGenreFeel = null;
        mockState.groove.genreSwitchCountdown = null;
    });

    it('should show countdown badge when genre is pending', () => {
        // Setup state for pending genre change
        mockState.groove.pendingGenreFeel = { genreName: 'Jazz' };
        mockState.groove.genreSwitchCountdown = 3;

        render(<GroovePanel />, container);

        const jazzBtn = container.querySelector('[data-genre="Jazz"]');
        expect(jazzBtn).toBeTruthy();
        expect(jazzBtn.classList.contains('pending')).toBe(true);
        expect(jazzBtn.getAttribute('data-countdown')).toBe('3');
    });

    it('should not show countdown badge when no genre is pending', () => {
        render(<GroovePanel />, container);

        const jazzBtn = container.querySelector('[data-genre="Jazz"]');
        expect(jazzBtn).toBeTruthy();
        expect(jazzBtn.classList.contains('pending')).toBe(false);
        expect(jazzBtn.hasAttribute('data-countdown')).toBe(false);
    });
});
