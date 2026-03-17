/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, getState, playback, storage, subscribe } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

// Manual localStorage mock
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => {
            store[key] = value.toString();
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        removeItem: vi.fn((key) => {
            delete store[key];
        }),
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
});

describe('State Core Manager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
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
                action,
                payload,
                expect.any(Object),
                expect.objectContaining({
                    dispatch: expect.any(Function),
                }),
            );

            unsubscribe();
        });

        it('should increment stateVersion on every dispatch', () => {
            const initialVersion = playback.stateVersion;
            dispatch('DUMMY_ACTION');
            expect(playback.stateVersion).toBe(initialVersion + 1);
        });

        it('should stop notifying after unsubscribe', () => {
            const listener = vi.fn();
            const unsubscribe = subscribe(listener);

            unsubscribe();
            dispatch('ACTION');

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('storage helper', () => {
        it('should save and retrieve data from localStorage', () => {
            const key = 'testKey';
            const data = { foo: 'bar' };

            storage.save(key, data);
            const retrieved = storage.get(key);

            expect(retrieved).toEqual(data);
        });

        it('should return empty array if key does not exist', () => {
            const retrieved = storage.get('nonExistent');
            expect(retrieved).toEqual([]);
        });

        it('should return empty array and log error on invalid JSON', () => {
            window.localStorage.setItem('ensemble_invalid', 'not-json');
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const retrieved = storage.get('invalid');

            expect(retrieved).toEqual([]);
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should handle localStorage being unavailable', () => {
            // Mock localStorage to be undefined
            const originalLocalStorage = window.localStorage;
            Object.defineProperty(window, 'localStorage', {
                value: undefined,
                configurable: true,
            });

            // Should not throw
            storage.save('key', 'val');
            const result = storage.get('key');
            expect(result).toEqual([]);

            Object.defineProperty(window, 'localStorage', {
                value: originalLocalStorage,
                configurable: true,
            });
        });
    });
});
