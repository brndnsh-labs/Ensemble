// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setBpm, setMode, setPalette } from '../../../public/controllers/app-controller.js';
import { dispatch, getState } from '../../../public/state.js';
import { syncWorker } from '../../../public/worker-client.js';

vi.mock('../../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
}));

describe('App Controller', () => {
    let state;

    beforeEach(() => {
        vi.clearAllMocks();
        state = {
            playback: {
                palette: 'after-hours',
                mode: 'dark',
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

    describe('setPalette', () => {
        it('should dispatch SET_PARAM for a new palette', () => {
            // #1144 — persistence is no longer this function's job: the
            // dispatch alone schedules the #1127 chokepoint's save (proven by
            // tests/unit/app/persistence-roundtrip.test.ts), so dispatch is
            // the only observable effect to assert here.
            setPalette('midnight');
            expect(dispatch).toHaveBeenCalledWith('SET_PARAM', {
                module: 'playback',
                param: 'palette',
                value: 'midnight',
            });
        });

        it('should not dispatch if the palette is unchanged', () => {
            state.playback.palette = 'after-hours';
            setPalette('after-hours');
            expect(dispatch).not.toHaveBeenCalled();
        });
    });

    describe('setMode', () => {
        it('should dispatch SET_PARAM for a new mode', () => {
            setMode('light');
            expect(dispatch).toHaveBeenCalledWith('SET_PARAM', {
                module: 'playback',
                param: 'mode',
                value: 'light',
            });
        });

        it('should not dispatch if the mode is unchanged', () => {
            state.playback.mode = 'dark';
            setMode('dark');
            expect(dispatch).not.toHaveBeenCalled();
        });
    });

    describe('setBpm', () => {
        it('should dispatch SET_BPM and sync the worker when not playing', () => {
            setBpm(140);
            expect(dispatch).toHaveBeenCalledWith('SET_BPM', 140);
            expect(syncWorker).toHaveBeenCalled();
        });

        it('should dispatch constrained BPM between 40 and 240', () => {
            setBpm(10);
            expect(dispatch).toHaveBeenCalledWith('SET_BPM', 40);
            setBpm(300);
            expect(dispatch).toHaveBeenCalledWith('SET_BPM', 240);
        });

        it('should handle BPM change while playing', () => {
            state.playback.isPlaying = true;
            state.playback.audio = { currentTime: 100 };
            state.playback.nextNoteTime = 101;

            setBpm(60); // Halving BPM should double the remaining time.

            // Current BPM: 120, New BPM: 60. Ratio: 120/60 = 2.
            // noteTimeRemaining = 101 - 100 = 1.
            // new nextNoteTime = 100 + 1 * 2 = 102.
            expect(state.playback.nextNoteTime).toBe(102);
            expect(dispatch).toHaveBeenCalledWith('SET_BPM', 60);
        });

        it('should not dispatch if fromDispatch is true', () => {
            setBpm(140, true);
            expect(dispatch).not.toHaveBeenCalled();
        });

        it('should return early if BPM is same and not fromDispatch', () => {
            state.playback.bpm = 120;
            setBpm(120);
            expect(syncWorker).not.toHaveBeenCalled();
        });
    });
});
