import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, getState, subscribe } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

describe('State Core Manager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getState', () => {
        it('should return the global state map', () => {
            const state = getState();
            expect(state).toHaveProperty('playback');
            expect(state).toHaveProperty('arranger');
            expect(state).toHaveProperty('chords');
        });
    });

    describe('subscribe and dispatch', () => {
        it('should notify subscribers when an action is dispatched', () => {
            const listener = vi.fn();
            const unsubscribe = subscribe(listener);

            const action = ACTIONS.SET_BPM;
            const payload = 140;

            dispatch(action, payload);

            expect(listener).toHaveBeenCalledWith(
                { type: action, payload },
                expect.any(Object),
                expect.objectContaining({
                    dispatch: expect.any(Function),
                }),
            );

            unsubscribe();
        });

        it('should stop notifying after unsubscribe', () => {
            const listener = vi.fn();
            const unsubscribe = subscribe(listener);

            unsubscribe();
            dispatch(ACTIONS.FLASH_EXPIRED);

            expect(listener).not.toHaveBeenCalled();
        });
    });
});
