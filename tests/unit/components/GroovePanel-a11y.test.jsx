/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = {
    groove: {
        enabled: true,
        genreFeel: 'Rock',
        creativity: false,
        fillActive: false,
    },
    playback: {
        autoIntensity: true,
        bandIntensity: 0.35,
    },
};

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => selector(mockState),
}));

vi.mock('../../../public/state.js', () => ({
    dispatch: vi.fn(),
    groove: {
        creativity: false,
        larsIntensity: 0.42,
        larsMode: true,
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
}));

vi.mock('../../../public/components/InstrumentSettings.jsx', () => ({
    InstrumentSettings: () => <div data-testid="instrument-settings">Settings</div>,
}));

import { GroovePanel } from '../../../public/components/GroovePanel.jsx';

describe('GroovePanel accessibility', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        render(<GroovePanel />, container);
    });

    it('labels the auto intensity toggle', () => {
        const toggle = container.querySelector('#autoIntensityCheck');
        const label = container.querySelector('label[for="autoIntensityCheck"]');

        expect(toggle).toBeTruthy();
        expect(toggle?.getAttribute('aria-label')).toBe('Auto intensity');
        expect(label?.textContent).toContain('Auto intensity');
    });

    it('labels the intensity slider', () => {
        const slider = container.querySelector('#bandIntensitySlider');
        const label = container.querySelector('label[for="bandIntensitySlider"]');

        expect(slider).toBeTruthy();
        expect(slider?.getAttribute('aria-label')).toBe('Band energy');
        expect(label?.textContent).toContain('Band energy');
    });

    it('labels the creativity switch', () => {
        const toggle = container.querySelector('#creativityCheck');
        const label = container.querySelector('label[for="creativityCheck"]');

        expect(toggle).toBeTruthy();
        expect(toggle?.getAttribute('aria-label')).toBe('Creativity');
        expect(label?.textContent).toContain('Creativity');
    });
});
