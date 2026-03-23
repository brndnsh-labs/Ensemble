/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state and controller dependencies
vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {},
        groove: { enabled: true, activeTab: 'smart', lastDrumPreset: null, instruments: [] },
        arranger: { lastChordPreset: null, isDirty: false },
        chords: { enabled: true, activeTab: 'smart' },
        bass: { enabled: true, activeTab: 'smart' },
        soloist: { enabled: true, activeTab: 'smart' },
        harmony: { enabled: true, activeTab: 'smart' },
    };
    return {
        dispatch: vi.fn(),
        stateMap: mockState,
        getState: () => mockState,
        subscribe: vi.fn(() => () => {}),
    };
});

vi.mock('../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) =>
        selector({
            playback: {},
            groove: { enabled: true, activeTab: 'smart', lastDrumPreset: null, instruments: [] },
            arranger: { lastChordPreset: null, isDirty: false },
            chords: { enabled: true, activeTab: 'smart' },
            bass: { enabled: true, activeTab: 'smart' },
            soloist: { enabled: true, activeTab: 'smart' },
            harmony: { enabled: true, activeTab: 'smart' },
        }),
    useDispatch: () => vi.fn(),
}));

vi.mock('../../public/instrument-controller.js', () => ({
    togglePower: vi.fn(),
    cloneMeasure: vi.fn(),
    saveDrumPreset: vi.fn(),
    updateMeasures: vi.fn(),
    switchMeasure: vi.fn(),
}));

vi.mock('../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
}));

vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

vi.mock('../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
}));

import { GroovePanel } from '../../public/components/GroovePanel.jsx';
import { InstrumentPanel } from '../../public/components/InstrumentPanel.jsx';

describe('Menu Interaction Regression Tests', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);

        // Mock localStorage
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
        });
    });

    afterEach(() => {
        if (container?.parentNode) {
            document.body.removeChild(container);
        }
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('should close the GroovePanel menu when clicking outside', async () => {
        act(() => {
            render(<GroovePanel isActiveMobile={false} />, container);
        });

        const kebabBtn = container.querySelector('.panel-menu-btn[aria-label="Grooves Settings"]');
        const settingsMenu = container.querySelector('.grooves-settings-menu');

        // Initially closed
        expect(settingsMenu.classList.contains('open')).toBe(false);

        // Click to open
        act(() => {
            kebabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(settingsMenu.classList.contains('open')).toBe(true);

        // Click outside (on the body)
        act(() => {
            document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });

        // Should now be closed
        expect(settingsMenu.classList.contains('open')).toBe(false);
    });

    it('should close the InstrumentPanel menu when clicking elsewhere on the panel', async () => {
        act(() => {
            render(
                <InstrumentPanel
                    id="test-panel"
                    module="chords"
                    title="Chords"
                    styles={[]}
                    isActiveMobile={false}
                />,
                container,
            );
        });

        const kebabBtn = container.querySelector('.panel-menu-btn');
        const settingsMenu = container.querySelector('.panel-settings-menu');
        const panelBody = container.querySelector('.instrument-tab-content');

        // Click to open
        act(() => {
            kebabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(settingsMenu.classList.contains('open')).toBe(true);

        // Click on panel body (outside the menu container which holds button + menu)
        act(() => {
            panelBody.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });

        // Should now be closed
        expect(settingsMenu.classList.contains('open')).toBe(false);
    });

    it('should NOT close the menu when clicking inside the menu', async () => {
        act(() => {
            render(
                <InstrumentPanel
                    id="test-panel"
                    module="chords"
                    title="Chords"
                    styles={[]}
                    isActiveMobile={false}
                />,
                container,
            );
        });

        const kebabBtn = container.querySelector('.panel-menu-btn');
        const settingsMenu = container.querySelector('.panel-settings-menu');

        // Click to open
        act(() => {
            kebabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(settingsMenu.classList.contains('open')).toBe(true);

        // Click inside settings menu
        act(() => {
            settingsMenu.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });

        // Should still be open
        expect(settingsMenu.classList.contains('open')).toBe(true);
    });
});
