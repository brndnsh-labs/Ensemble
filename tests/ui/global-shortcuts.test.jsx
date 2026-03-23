/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import React from 'preact/compat';
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
            modals: { editor: false, settings: false },
        },
        groove: { currentMeasure: 0, measures: 4 },
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
        dispatch: mockState.dispatch,
    };
});

// Mock instrument-controller
vi.mock('../../public/instrument-controller.js', () => ({
    switchMeasure: vi.fn(),
}));

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

    it('should NOT toggle playback if modal is open via state', async () => {
        const { playback, dispatch } = await import('../../public/state.js');
        playback.modals.editor = true;

        const event = new KeyboardEvent('keydown', { key: ' ' });
        window.dispatchEvent(event);

        expect(dispatch).not.toHaveBeenCalledWith(ACTIONS.TOGGLE_PLAY, expect.anything());
        playback.modals.editor = false; // Reset
    });

    it('should toggle editor on E', async () => {
        const { dispatch } = await import('../../public/state.js');
        const event = new KeyboardEvent('keydown', { key: 'e' });
        window.dispatchEvent(event);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_MODAL_OPEN, {
            modal: 'editor',
            open: true,
        });
    });
});
