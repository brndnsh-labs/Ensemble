/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = {
    groove: {
        enabled: true,
        genreFeel: 'Rock',
        larsMode: true,
        larsIntensity: 0.42,
        creativity: false,
        fillActive: false,
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

    it('exposes the genre selector as a labeled button', () => {
        const genreButton = container.querySelector('button[aria-label="Change groove genre"]');
        expect(genreButton).toBeTruthy();
        expect(genreButton.textContent).toContain('Rock');
    });

    it('labels the intensity slider', () => {
        const slider = container.querySelector('#intensitySlider');
        const label = container.querySelector('label[for="intensitySlider"]');

        expect(slider).toBeTruthy();
        expect(label?.textContent).toContain('Intensity');
    });

    it('labels the creativity switch', () => {
        const toggle = container.querySelector('#creativityCheck');
        const label = container.querySelector('label[for="creativityCheck"]');

        expect(toggle).toBeTruthy();
        expect(toggle?.getAttribute('aria-label')).toBe('Creativity');
        expect(label?.textContent).toContain('Creativity');
    });
});
