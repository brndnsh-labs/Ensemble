// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalShortcuts } from '../../public/components/GlobalShortcuts.jsx';
import { ACTIONS } from '../../public/types.js';

// Mock scheduler-core
vi.mock('../../public/engine/scheduler-core.js', () => ({
    togglePlay: vi.fn(),
}));

// Mock State
vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {
            viz: {},
            modals: { settings: false },
            chartLocked: true,
            isPlaying: false,
        },
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
        dispatch: mockState.dispatch,
    };
});

describe('Global Shortcuts', () => {
    let container;

    beforeEach(async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        render(<GlobalShortcuts />, container);
        await new Promise((r) => setTimeout(r, 100));
    });

    afterEach(() => {
        render(null, container);
        container.remove();
        vi.clearAllMocks();
    });

    it('should toggle playback on Space', async () => {
        const { dispatch } = await import('../../public/state.js');
        const event = new KeyboardEvent('keydown', { key: ' ' });
        window.dispatchEvent(event);
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.TOGGLE_PLAY);
    });

    it('should let a focused button handle Space', async () => {
        const { dispatch } = await import('../../public/state.js');
        const button = document.createElement('button');
        container.appendChild(button);
        button.focus();

        const event = new KeyboardEvent('keydown', {
            key: ' ',
            bubbles: true,
            cancelable: true,
        });
        button.dispatchEvent(event);

        expect(document.activeElement).toBe(button);
        expect(dispatch).not.toHaveBeenCalledWith(ACTIONS.TOGGLE_PLAY);
        expect(event.defaultPrevented).toBe(false);
    });

    it('should NOT toggle playback if modal is open via state', async () => {
        const { playback, dispatch } = await import('../../public/state.js');
        playback.modals.settings = true;

        const event = new KeyboardEvent('keydown', { key: ' ' });
        window.dispatchEvent(event);

        expect(dispatch).not.toHaveBeenCalledWith(ACTIONS.TOGGLE_PLAY, expect.anything());
        playback.modals.settings = false; // Reset
    });

    it('should unlock chart on E when locked', async () => {
        const { dispatch } = await import('../../public/state.js');
        const event = new KeyboardEvent('keydown', { key: 'e' });
        window.dispatchEvent(event);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_CHART_LOCKED, false);
    });
});
