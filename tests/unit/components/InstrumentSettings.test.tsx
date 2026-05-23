// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const { mockUseEnsembleState, mockDispatch } = vi.hoisted(() => ({
    mockUseEnsembleState: vi.fn(),
    mockDispatch: vi.fn(),
}));

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => mockUseEnsembleState(selector),
}));

// Mock state.js
vi.mock('../../../public/state.js', () => {
    const mockState = {
        dispatch: vi.fn(),
        playback: {
            viz: {},
            audio: { currentTime: 0 },
            swing: 30,
            swingSub: '8th',
        },
        ACTIONS: { SET_MODAL_OPEN: 'SET_MODAL_OPEN' },
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
        dispatch: mockDispatch,
    };
});

// Mock config
vi.mock('../../../public/config.js', () => ({
    MIXER_GAIN_MULTIPLIERS: { drums: 1.0, harmonies: 1.0 },
}));

// Mock persistence
vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

import {
    InstrumentMixerStrip,
    InstrumentSpecificSettings,
} from '../../../public/components/InstrumentSettings.jsx';

describe('InstrumentSettings Component', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.restoreAllMocks();
    });

    it('should render Volume and Reverb sliders for generic module', () => {
        // Mock state for a generic module (e.g. harmony)
        mockUseEnsembleState.mockImplementation((cb) => {
            const fullState = {
                harmony: {
                    volume: 0.8,
                    reverb: 0.2,
                    complexity: 0.5,
                },
                playback: {},
            };
            return cb(fullState);
        });

        act(() => {
            render(<InstrumentMixerStrip module="harmony" />, container);
        });

        const volumeSlider = container.querySelector('#harmonyVolume');
        const reverbSlider = container.querySelector('#harmonyReverb');

        expect(volumeSlider).not.toBeNull();
        expect(reverbSlider).not.toBeNull();
        expect(volumeSlider.value).toBe('0.8');
        expect(reverbSlider.value).toBe('0.2');

        // Verify value display is present
        const spans = container.querySelectorAll('span');
        const spanTexts = Array.from(spans).map((s) => s.textContent);

        expect(spanTexts).toContain('80%');
        expect(spanTexts).toContain('20%');

        // Verify accessibility attributes
        expect(volumeSlider.hasAttribute('aria-valuetext')).toBe(true);
        expect(volumeSlider.getAttribute('aria-valuetext')).toBe('80%');

        expect(reverbSlider.hasAttribute('aria-valuetext')).toBe(true);
        expect(reverbSlider.getAttribute('aria-valuetext')).toBe('20%');
    });

    it('should render Swing and Humanize sliders for groove module', () => {
        // Mock state for groove
        mockUseEnsembleState.mockImplementation((cb) => {
            const fullState = {
                groove: {
                    volume: 0.7,
                    reverb: 0.3,
                    humanize: 40,
                    creativity: false,
                    swing: 30,
                    swingSub: '8th',
                },
                playback: {},
            };
            return cb(fullState);
        });

        act(() => {
            render(<InstrumentSpecificSettings module="groove" />, container);
        });

        const swingSlider = container.querySelector('#swingSlider');
        const humanizeSlider = container.querySelector('#humanizeSlider');

        expect(swingSlider).not.toBeNull();
        expect(humanizeSlider).not.toBeNull();
        expect(swingSlider.value).toBe('30');
        expect(humanizeSlider.value).toBe('40');

        // Verify value display is present
        const spans = container.querySelectorAll('span');
        const spanTexts = Array.from(spans).map((s) => s.textContent);

        expect(spanTexts).toContain('30%');
        expect(spanTexts).toContain('40%');

        // Verify accessibility attributes
        expect(swingSlider.hasAttribute('aria-valuetext')).toBe(true);
        expect(swingSlider.getAttribute('aria-valuetext')).toBe('30%');

        expect(humanizeSlider.hasAttribute('aria-valuetext')).toBe(true);
        expect(humanizeSlider.getAttribute('aria-valuetext')).toBe('40%');
    });

    it('should render and dispatch the Creativity toggle for groove module', () => {
        mockDispatch.mockClear();
        mockUseEnsembleState.mockImplementation((cb) => {
            const fullState = {
                groove: {
                    volume: 0.7,
                    reverb: 0.3,
                    humanize: 40,
                    creativity: false,
                    swing: 30,
                    swingSub: '8th',
                },
                playback: {},
            };
            return cb(fullState);
        });

        act(() => {
            render(<InstrumentSpecificSettings module="groove" />, container);
        });

        const creativityToggle = container.querySelector('#creativityCheck');
        expect(creativityToggle).not.toBeNull();
        expect(creativityToggle.getAttribute('aria-label')).toBe('Creativity');

        act(() => {
            creativityToggle.click();
        });

        expect(mockDispatch).toHaveBeenCalledWith('SET_PARAM', {
            module: 'groove',
            param: 'creativity',
            value: true,
        });
    });
});
