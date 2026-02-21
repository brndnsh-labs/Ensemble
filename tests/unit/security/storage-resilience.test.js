// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { storage } from '../../../public/state.js';

describe('Storage Security Resilience', () => {
    // Manual mock for localStorage because the environment seems to have it in a broken state
    const mockStorage = (() => {
        let store = {};
        return {
            getItem: (key) => store[key] || null,
            setItem: (key, value) => {
                store[key] = value.toString();
            },
            removeItem: (key) => {
                delete store[key];
            },
            clear: () => {
                store = {};
            },
            get length() {
                return Object.keys(store).length;
            },
            key: (i) => Object.keys(store)[i] || null,
        };
    })();

    beforeEach(() => {
        Object.defineProperty(window, 'localStorage', {
            value: mockStorage,
            writable: true,
        });
        mockStorage.clear();
    });

    it('should return default value when localStorage contains invalid JSON (Fixed)', () => {
        // Arrange: Inject corrupted data
        localStorage.setItem('ensemble_testKey', '{invalid-json');

        // Act
        const result = storage.get('testKey');

        // Assert: verify it handles error gracefully
        expect(result).toEqual([]);
    });

    it('should return default value when localStorage is empty', () => {
        const result = storage.get('nonExistentKey');
        expect(result).toEqual([]);
    });

    it('should return parsed data when localStorage is valid', () => {
        localStorage.setItem('ensemble_validKey', JSON.stringify({ foo: 'bar' }));
        const result = storage.get('validKey');
        expect(result).toEqual({ foo: 'bar' });
    });
});
