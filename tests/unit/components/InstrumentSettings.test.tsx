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
vi.mock('../../../public/state/persistence.js', () => ({
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
                    swing: 30,
                    swingSub: '8th',
                },
                // GrooveControls reads arranger.timeSignature (#1065) to gate the
                // Swing control disabled in 6/8 and 12/8.
                arranger: { timeSignature: '4/4' },
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

    // --- #1167 regression -----------------------------------------------------
    //
    // The soloist "Complexity" slider used to dispatch SET_PARAM `complexity`, but
    // `soloist.complexity` is absent from `buildSoloistSyncPayload` and read by no
    // engine — the control was inert. It now writes `phrasingIntensity`, which IS
    // synced to the worker and drives `intensityLift` in the phrase-first soloist.
    it('soloist Complexity slider reads and writes phrasingIntensity, not the dead complexity field', () => {
        mockUseEnsembleState.mockImplementation((cb) =>
            cb({
                soloist: {
                    // Deliberately divergent so a read of the wrong field is visible:
                    // the slider must show 70%, never 20%.
                    phrasingIntensity: 0.7,
                    complexity: 0.2,
                    mode: 'monophonic',
                    autoMode: false,
                    style: 'smart',
                    tradeMode: 'manual',
                    voice: 'synth',
                    autoSound: true,
                },
                // InstrumentSpecificSettings also renders InstrumentSoundSource,
                // which reads groove.lastSmartGenre.
                groove: { lastSmartGenre: 'Jazz' },
                playback: {},
            }),
        );

        act(() => {
            render(<InstrumentSpecificSettings module="soloist" />, container);
        });

        const slider = container.querySelector('#soloistComplexity');
        expect(slider).not.toBeNull();
        expect(slider.value).toBe('0.7');
        expect(slider.getAttribute('aria-valuetext')).toBe('70%');

        act(() => {
            slider.value = '0.45';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const call = mockDispatch.mock.calls.find(
            ([, payload]) =>
                payload?.module === 'soloist' && payload?.param === 'phrasingIntensity',
        );
        expect(call, 'slider should dispatch SET_PARAM soloist.phrasingIntensity').toBeTruthy();
        expect(call[1].value).toBeCloseTo(0.45);

        // ...and must no longer write the inert field.
        const stale = mockDispatch.mock.calls.find(
            ([, payload]) => payload?.module === 'soloist' && payload?.param === 'complexity',
        );
        expect(stale, 'slider must not write the dead soloist.complexity').toBeUndefined();
    });
});
