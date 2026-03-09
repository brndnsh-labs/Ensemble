/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveProgression } from '../../../public/arranger-controller.js';
import { saveDrumPreset } from '../../../public/instrument-controller.js';

// Mock dependencies for arranger-controller
vi.mock('../../../public/chords.js', () => ({
    transformRelativeProgression: vi.fn(),
    validateProgression: vi.fn(),
}));
vi.mock('../../../public/conductor.js', () => ({
    analyzeFormUI: vi.fn(),
    conductorState: {},
}));
vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: [],
    TIME_SIGNATURES: {},
}));
vi.mock('../../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
}));
vi.mock('../../../public/form-analysis.js', () => ({
    getSectionEnergy: vi.fn(),
}));
vi.mock('../../../public/history.js', () => ({
    pushHistory: vi.fn(),
}));
vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));
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
vi.mock('../../../public/ui.js', () => ({
    showToast: vi.fn(),
}));
vi.mock('../../../public/utils.js', () => ({
    compressSections: vi.fn(),
    generateId: () => 'test-id',
    normalizeKey: (k) => k,
}));
vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
}));

describe('Security: JSON.parse Error Handling', () => {
    let storage = {};

    beforeEach(() => {
        storage = {};
        // Stub window and Event for dispatchEvent calls in controllers
        vi.stubGlobal('window', globalThis);
        if (typeof Event === 'undefined') {
            vi.stubGlobal('Event', class { constructor(type) { this.type = type; } });
        }

        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => storage[key] || null),
            setItem: vi.fn((key, value) => {
                storage[key] = value;
            }),
            removeItem: vi.fn((key) => {
                delete storage[key];
            }),
            clear: vi.fn(() => {
                storage = {};
            }),
        });
        vi.stubGlobal('prompt', vi.fn(() => 'New Preset'));
        vi.stubGlobal('confirm', vi.fn(() => true));
    });

    it('arranger-controller: saveProgression should handle malformed localStorage gracefully', () => {
        storage['ensemble_userPresets'] = '{{{ invalid json';

        // This should not throw
        expect(() => saveProgression()).not.toThrow();

        // It should have overwritten the bad data with a valid array containing the new preset
        const setItemMock = globalThis.localStorage.setItem;
        const call = setItemMock.mock.calls.find((c) => c[0] === 'ensemble_userPresets');
        expect(call).toBeDefined();

        const saved = JSON.parse(call[1]);
        expect(Array.isArray(saved)).toBe(true);
        expect(saved.length).toBe(1);
        expect(saved[0].name).toBe('New Preset');
    });

    it('instrument-controller: saveDrumPreset should handle malformed localStorage gracefully', () => {
        storage['ensemble_userDrumPresets'] = '{{{ invalid json';

        // This should not throw
        expect(() => saveDrumPreset()).not.toThrow();

        // It should have overwritten the bad data
        const setItemMock = globalThis.localStorage.setItem;
        const call = setItemMock.mock.calls.find((c) => c[0] === 'ensemble_userDrumPresets');
        expect(call).toBeDefined();

        const saved = JSON.parse(call[1]);
        expect(Array.isArray(saved)).toBe(true);
        expect(saved.length).toBe(1);
    });
});
