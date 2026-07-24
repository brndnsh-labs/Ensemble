// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockUseEnsembleState = vi.fn();

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => mockUseEnsembleState(selector),
}));

vi.mock('../../../public/state.js', () => {
    const mockState = {
        dispatch: vi.fn(),
        playback: { viz: {} },
        ACTIONS: { SET_MODAL_OPEN: 'SET_MODAL_OPEN' },
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

vi.mock('../../../public/controllers/app-controller.js', () => ({
    setBpm: vi.fn(),
}));

vi.mock('../../../public/engine/scheduler-core.js', () => ({
    togglePlay: vi.fn(),
}));

vi.mock('../../../public/controllers/instrument-controller.js', () => ({
    handleTap: vi.fn(),
}));

import { Transport } from '../../../public/components/Transport.jsx';

describe('Transport Component', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        vi.useFakeTimers();
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should display START when not playing', () => {
        mockUseEnsembleState.mockImplementation((_selector) => ({
            isPlaying: false,
            bpm: 120,
            sessionTimer: 5,
            sessionStartTime: 0,
            songMode: true,
        }));

        act(() => {
            render(<Transport />, container);
        });

        const btn = container.querySelector('#playBtn');
        expect(btn.textContent).toBe('START');
    });

    it('should display STOP when playing without timer', () => {
        mockUseEnsembleState.mockImplementation((_selector) => ({
            isPlaying: true,
            bpm: 120,
            sessionTimer: 0,
            sessionStartTime: 1000,
            songMode: true,
        }));

        act(() => {
            render(<Transport />, container);
        });

        const btn = container.querySelector('#playBtn');
        expect(btn.textContent).toBe('STOP');
    });

    it('should display countdown when playing with timer', async () => {
        const startTime = 10000;
        const sessionTimer = 5; // 5 minutes

        mockUseEnsembleState.mockImplementation((_selector) => ({
            isPlaying: true,
            bpm: 120,
            sessionTimer: sessionTimer,
            sessionStartTime: startTime,
            songMode: true,
        }));

        // Mock performance.now to return startTime initially
        vi.spyOn(performance, 'now').mockReturnValue(startTime);

        act(() => {
            render(<Transport />, container);
        });

        // Initial render should show full time
        const btn = container.querySelector('#playBtn');
        expect(btn.textContent).toBe('STOP (5:00)');

        // Advance time by 1 minute (60000ms)
        vi.spyOn(performance, 'now').mockReturnValue(startTime + 60000);

        await act(async () => {
            vi.advanceTimersByTime(1000); // Trigger interval
        });

        expect(btn.textContent).toBe('STOP (4:00)');

        // Advance time by 4 minutes and 30 seconds more (total 5:30 elapsed)
        // Remaining should be 0 (stopped at 0:00)
        vi.spyOn(performance, 'now').mockReturnValue(startTime + 5 * 60000 + 30000);

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        expect(btn.textContent).toBe('STOP (0:00)');
    });
});
