// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import React from 'preact/compat';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Transport } from '../../public/components/Transport.jsx';
import { dispatch, getState } from '../../public/state.js';

const { playback } = getState();

// Mock state
vi.mock('../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        playback: {
            ...actual.playback,
            bpm: 120,
            isPlaying: false,
            viz: {},
        },
        dispatch: vi.fn(),
    };
});

// Mock app-controller
vi.mock('../../public/app-controller.js', () => ({
    setBpm: vi.fn((val) => {
        playback.bpm = parseInt(val, 10);
    }),
}));

describe('Tap Tempo UI', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        render(null, container);
        container.remove();
        vi.clearAllMocks();
        // Reset tapTimes if possible (it's local to module, but we can't easily reach it)
    });

    it('should call handleTap and dispatch SET_BPM on multiple clicks', async () => {
        render(<Transport />, container);
        const tapBtn = container.querySelector('#tapBtn');

        const now = performance.now();
        vi.spyOn(performance, 'now').mockReturnValue(now);

        tapBtn.click(); // First tap

        vi.spyOn(performance, 'now').mockReturnValue(now + 500); // 500ms later (120 BPM)
        tapBtn.click(); // Second tap

        const { ACTIONS } = await import('../../public/types.js');
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_BPM, 120);
    });
});
