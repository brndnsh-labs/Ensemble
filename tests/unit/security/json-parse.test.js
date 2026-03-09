/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveProgression } from '../../../public/arranger-controller.js';
import { saveDrumPreset } from '../../../public/instrument-controller.js';

// Mock dependencies for arranger-controller
vi.mock('../../../public/chords.js', () => ({}));
vi.mock('../../../public/conductor.js', () => ({}));
vi.mock('../../../public/config.js', () => ({ KEY_ORDER: [] }));
vi.mock('../../../public/engine/engine.js', () => ({}));
vi.mock('../../../public/form-analysis.js', () => ({}));
vi.mock('../../../public/history.js', () => ({}));
vi.mock('../../../public/persistence.js', () => ({ saveCurrentState: vi.fn() }));
vi.mock('../../../public/state.js', () => ({
    getState: () => ({
        arranger: { sections: [], lastChordPreset: 'test' },
        groove: {
            lastDrumPreset: 'test',
            measures: 1,
            swing: 0,
            swingSub: '8th',
            instruments: [],
        },
    }),
    dispatch: vi.fn(),
}));
vi.mock('../../../public/ui.js', () => ({ showToast: vi.fn() }));
vi.mock('../../../public/utils.js', () => ({
    compressSections: vi.fn(),
    generateId: () => 'test-id',
    normalizeKey: (k) => k,
}));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

describe('Security: JSON.parse Error Handling', () => {
    beforeEach(() => {
        const storage = {};
        global.localStorage = {
            getItem: vi.fn((key) => storage[key] || null),
            setItem: vi.fn((key, value) => {
                storage[key] = value;
            }),
        };
        global.prompt = vi.fn(() => 'New Preset');
        global.confirm = vi.fn(() => true);
    });

    it('arranger-controller: saveProgression should handle malformed localStorage gracefully', () => {
        localStorage.setItem('ensemble_userPresets', '{{{ invalid json');

        // This should not throw
        expect(() => saveProgression()).not.toThrow();

        // It should have overwritten the bad data with a valid array containing the new preset
        const saved = JSON.parse(
            localStorage.setItem.mock.calls.find((call) => call[0] === 'ensemble_userPresets')[1],
        );
        expect(Array.isArray(saved)).toBe(true);
        expect(saved.length).toBe(1);
        expect(saved[0].name).toBe('New Preset');
    });

    it('instrument-controller: saveDrumPreset should handle malformed localStorage gracefully', () => {
        localStorage.setItem('ensemble_userDrumPresets', '{{{ invalid json');

        // This should not throw
        expect(() => saveDrumPreset()).not.toThrow();

        // It should have overwritten the bad data
        const saved = JSON.parse(
            localStorage.setItem.mock.calls.find(
                (call) => call[0] === 'ensemble_userDrumPresets',
            )[1],
        );
        expect(Array.isArray(saved)).toBe(true);
        expect(saved.length).toBe(1);
    });
});
