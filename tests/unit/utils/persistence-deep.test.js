import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounceSaveState, saveCurrentState } from '../../../public/persistence.js';
import { getState, storage } from '../../../public/state.js';

vi.mock('../../../public/state.js', () => ({
    getState: vi.fn(),
    storage: { save: vi.fn() },
}));

describe('Persistence Deep Dive', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        getState.mockReturnValue({
            arranger: { sections: [] },
            playback: { theme: 'dark' },
            chords: {},
            bass: {},
            soloist: {},
            harmony: {},
            groove: { instruments: [] },
            vizState: {},
            midi: {},
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should clear existing timeout in saveCurrentState (Line 9)', () => {
        // First, trigger a timeout via debounce
        debounceSaveState();

        // Now call saveCurrentState immediately
        // This should trigger the line 9: if (saveTimeout) clearTimeout(saveTimeout)
        saveCurrentState();

        expect(storage.save).toHaveBeenCalledWith('currentState', expect.any(Object));
    });

    it('should handle multiple debounces', () => {
        debounceSaveState();
        debounceSaveState();

        vi.advanceTimersByTime(1000);
        expect(storage.save).toHaveBeenCalledTimes(1);
    });
});
