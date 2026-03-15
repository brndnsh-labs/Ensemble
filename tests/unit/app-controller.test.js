/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, setBpm } from '../../public/app-controller.js';
import { saveCurrentState } from '../../public/persistence.js';
import { dispatch, getState } from '../../public/state.js';
import { syncWorker } from '../../public/worker-client.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

vi.mock('../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
}));

vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

describe('App Controller', () => {
    let state;

    beforeEach(() => {
        vi.clearAllMocks();
        state = {
            playback: {
                theme: 'dark',
                bpm: 120,
                isPlaying: false,
                audio: { currentTime: 100 },
                nextNoteTime: 100.5,
                unswungNextNoteTime: 100.5,
                step: 0,
            },
            arranger: {
                timeSignature: '4/4',
            },
        };
        getState.mockReturnValue(state);

        // Mock window.matchMedia
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(), // deprecated
                removeListener: vi.fn(), // deprecated
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    describe('applyTheme', () => {
        it('should apply a specific theme', () => {
            applyTheme('light');
            expect(state.playback.theme).toBe('light');
            expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        });

        it('should apply auto theme based on media query (dark)', () => {
            window.matchMedia.mockReturnValue({ matches: true });
            applyTheme('auto');
            expect(state.playback.theme).toBe('auto');
            expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        });

        it('should apply auto theme based on media query (light)', () => {
            window.matchMedia.mockReturnValue({ matches: false });
            applyTheme('auto');
            expect(state.playback.theme).toBe('auto');
            expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        });
    });

    describe('setBpm', () => {
        it('should update BPM and call sync/save when not playing', () => {
            setBpm(140);
            expect(state.playback.bpm).toBe(140);
            expect(syncWorker).toHaveBeenCalled();
            expect(saveCurrentState).toHaveBeenCalled();
            expect(dispatch).toHaveBeenCalledWith('BPM_CHANGE');
        });

        it('should constrain BPM between 40 and 240', () => {
            setBpm(10);
            expect(state.playback.bpm).toBe(40);
            setBpm(300);
            expect(state.playback.bpm).toBe(240);
        });

        it('should handle BPM change while playing', () => {
            state.playback.isPlaying = true;
            state.playback.audio = { currentTime: 100 };
            state.playback.nextNoteTime = 101; // 1 beat at 120bpm is 0.5s. Wait, 120bpm = 2bps. 1 beat = 0.5s.
            // 1s = 2 beats. nextNoteTime is 1s away from now (100).

            setBpm(60); // Halving BPM should double the remaining time.

            // Current BPM: 120, New BPM: 60. Ratio: 120/60 = 2.
            // noteTimeRemaining = 101 - 100 = 1.
            // new nextNoteTime = 100 + 1 * 2 = 102.
            expect(state.playback.nextNoteTime).toBe(102);
            expect(state.playback.bpm).toBe(60);
        });

        it('should not dispatch if fromDispatch is true', () => {
            setBpm(140, null, true);
            expect(dispatch).not.toHaveBeenCalled();
        });

        it('should return early if BPM is same and not fromDispatch', () => {
            state.playback.bpm = 120;
            setBpm(120);
            expect(syncWorker).not.toHaveBeenCalled();
        });

        it('should update viz reference if playing and viz provided', () => {
            state.playback.isPlaying = true;
            state.playback.audio = { currentTime: 100 };
            state.playback.unswungNextNoteTime = 100.5;
            state.playback.step = 0;

            const viz = { setBeatReference: vi.fn() };
            setBpm(140, viz);

            expect(viz.setBeatReference).toHaveBeenCalled();
        });
    });
});
