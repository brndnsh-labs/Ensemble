// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arranger } from '../../../public/state.js';
import { hydrateState } from '../../../public/state-hydration.js';

// Mock the dispatch function to avoid side effects during hydration
vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        dispatch: vi.fn(() => {
            // Pass through SET_PARAM actions to allow state updates if needed,
            // or just let the reducer logic run if we were using the real dispatch.
            // But since we are testing hydration which modifies state objects directly (mostly),
            // we primarily need to ensure the objects in 'actual' are updated.
            // However, hydration calls dispatch('HYDRATE') at the end.
            return;
        }),
    };
});

describe('Security: State Hydration Safety', () => {
    // Manual mock for localStorage
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

        // Reset arranger state defaults
        arranger.sections = [];
        arranger.key = 'C';
        arranger.timeSignature = '4/4';
    });

    it('should limit the number of sections loaded from storage (DoS Prevention)', () => {
        // Create 1000 sections
        const massiveSections = Array(1000)
            .fill(0)
            .map((_, i) => ({
                id: `sec-${i}`,
                label: `Section ${i}`,
                value: 'I | IV',
            }));

        const payload = {
            sections: massiveSections,
        };

        mockStorage.setItem('ensemble_currentState', JSON.stringify(payload));

        hydrateState();

        // Expect to be capped at 500
        expect(arranger.sections.length).toBeLessThanOrEqual(500);
    });

    it('should sanitize section labels from storage (XSS Prevention)', () => {
        const payload = {
            sections: [
                { id: 'xss1', label: '<script>alert(1)</script>', value: 'I | IV' },
                { id: 'xss2', label: 'Safe', value: '<img src=x>' }, // value should be stripped of dangerous chars
            ],
        };

        mockStorage.setItem('ensemble_currentState', JSON.stringify(payload));

        hydrateState();

        const sec1 = arranger.sections.find((s) => s.id === 'xss1');
        const sec2 = arranger.sections.find((s) => s.id === 'xss2');

        expect(sec1.label).not.toContain('<script>');
        expect(sec1.label).toContain('&lt;script&gt;');

        expect(sec2.value).not.toContain('<img');
        expect(sec2.value).not.toContain('<');
    });

    it('should validate key and timeSignature against allowlists', () => {
        const payload = {
            sections: [{ id: '1', label: 'Intro', value: 'I' }],
            key: 'InvalidKey', // Should fallback to C or stay C
            timeSignature: '99/8', // Should fallback to 4/4 or stay 4/4
        };

        mockStorage.setItem('ensemble_currentState', JSON.stringify(payload));

        // Set initial state to something else to prove it didn't update to invalid
        arranger.key = 'C';
        arranger.timeSignature = '4/4';

        hydrateState();

        expect(arranger.key).toBe('C');
        expect(arranger.timeSignature).toBe('4/4');
    });
});
