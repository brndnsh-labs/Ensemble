// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

/**
 * #1070 — the band-settings surface is the home for every control that acts on
 * the whole band: Genre, Feel (Swing + base, Humanize), Energy (auto intensity,
 * intensity) and Color (harmonic color). These used to be scattered — Swing and
 * Humanize lived inside the Drums gear even though swing is the grid geometry
 * every lane is scheduled against, and the harmony color choice lived on the
 * Harmony lane as an inert-above-40% percentage slider.
 *
 * The acceptance these tests pin: Swing and Humanize are reachable WITHOUT
 * opening an instrument-specific panel.
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDispatch, mockState } = vi.hoisted(() => ({
    mockDispatch: vi.fn(),
    mockState: {
        current: {},
    },
}));

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => selector(mockState.current),
    // Desktop: the rail renders its surfaces as anchored popovers.
    useMediaQuery: () => false,
}));

vi.mock('../../../public/state.js', () => ({
    dispatch: mockDispatch,
    getState: () => mockState.current,
}));

vi.mock('../../../public/controllers/instrument-controller.js', () => ({
    togglePower: vi.fn(),
}));

vi.mock('../../../public/telemetry.js', () => ({
    track: vi.fn(),
}));

import { InstrumentRail } from '../../../public/components/InstrumentRail.jsx';

function baseState(overrides = {}) {
    return {
        groove: {
            enabled: true,
            swing: 30,
            swingSub: '8th',
            humanize: 40,
            lastSmartGenre: 'Jazz',
            genreFeel: 'Jazz',
            volume: 1,
            reverb: 0.2,
            ...(overrides.groove || {}),
        },
        bass: { enabled: true, volume: 1, reverb: 0.05 },
        chords: { enabled: true, volume: 1, reverb: 0.3 },
        harmony: {
            enabled: false,
            complexity: 0.5,
            volume: 1,
            reverb: 0.4,
            ...(overrides.harmony || {}),
        },
        soloist: { enabled: false, tradeMode: 'manual', volume: 1, reverb: 0.6 },
        arranger: { timeSignature: '4/4', sections: [], ...(overrides.arranger || {}) },
        playback: {
            autoIntensity: true,
            bandIntensity: 0.5,
            currentSectionId: null,
            ...(overrides.playback || {}),
        },
    };
}

describe('InstrumentRail — band settings surface (#1070)', () => {
    let container;

    beforeEach(() => {
        mockState.current = baseState();
        mockDispatch.mockClear();
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        act(() => {
            render(null, container);
        });
        document.body.removeChild(container);
    });

    function openBandSurface() {
        act(() => {
            render(<InstrumentRail />, container);
        });
        const trigger = container.querySelector('.workspace-studio-genre-button');
        expect(trigger, 'band-settings trigger should be in the rail').not.toBeNull();
        act(() => {
            trigger.click();
        });
        // The surface portals to document.body, not into `container`.
        const surface = document.querySelector('.workspace-studio-surface--band-feel');
        expect(surface).not.toBeNull();
        return surface;
    }

    it('exposes Swing, swing base and Humanize without opening an instrument panel', () => {
        const surface = openBandSurface();

        const swing = surface.querySelector('#swingSlider');
        const swingBase = surface.querySelector('#swingBaseSelect');
        const humanize = surface.querySelector('#humanizeSlider');

        expect(swing).not.toBeNull();
        expect(swingBase).not.toBeNull();
        expect(humanize).not.toBeNull();
        expect(swing.value).toBe('30');
        expect(swing.getAttribute('aria-valuetext')).toBe('30%');
        expect(humanize.value).toBe('40');
        expect(humanize.getAttribute('aria-valuetext')).toBe('40%');
    });

    it('exposes genre choices as a labeled toggle group', () => {
        const surface = openBandSurface();
        const grid = surface.querySelector('.workspace-studio-genre-grid');

        expect(grid).not.toBeNull();
        expect(grid.getAttribute('role')).toBe('group');
        expect(grid.getAttribute('aria-label')).toBe('Genre');
        expect(grid.querySelector('[aria-pressed]')).not.toBeNull();
    });

    it('disables Swing in meters whose notation already carries the shuffle (#1065)', () => {
        mockState.current = baseState({ arranger: { timeSignature: '12/8' } });
        const surface = openBandSurface();

        expect(surface.querySelector('#swingSlider').disabled).toBe(true);
        expect(surface.querySelector('#swingBaseSelect').disabled).toBe(true);
    });

    it('renders the harmonic-color control as the two states it actually has', () => {
        const surface = openBandSurface();

        const color = surface.querySelector('#harmonyColorSelect');
        expect(color).not.toBeNull();
        // Not a percentage slider: `harmonies.ts` only ever tests `< 0.4`.
        expect(color.tagName).toBe('SELECT');
        expect(Array.from(color.options).map((o) => o.value)).toEqual(['guide', 'full']);
        // Default complexity 0.5 sits at/above the threshold → full voicings.
        expect(color.value).toBe('full');

        act(() => {
            color.value = 'guide';
            color.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const call = mockDispatch.mock.calls.find(
            ([, payload]) => payload?.module === 'harmony' && payload?.param === 'complexity',
        );
        expect(call, 'selecting Guide tones should write harmony.complexity').toBeTruthy();
        expect(call[1].value).toBeLessThan(0.4);
    });

    it('reads a below-threshold harmony.complexity back as Guide tones', () => {
        mockState.current = baseState({ harmony: { complexity: 0.1 } });
        const surface = openBandSurface();
        expect(surface.querySelector('#harmonyColorSelect').value).toBe('guide');
    });

    it('labels no band control "Complexity" — that word belongs to one control only', () => {
        const surface = openBandSurface();
        expect(surface.textContent).not.toContain('Complexity');
    });
});
