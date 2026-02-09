import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hydrateState } from '../../../public/state-hydration.js';
import * as stateModule from '../../../public/state.js';

// Mock dependencies
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bpm: 100, bandIntensity: 0.5, complexity: 0.3 },
        arranger: { sections: [], key: 'C' },
        groove: { genreFeel: 'Rock', instruments: [] },
        chords: {},
        bass: {},
        soloist: {},
        harmony: {},
        midi: {},
        vizState: {}
    };
    return {
        getState: () => mockState,
        dispatch: vi.fn(),
        storage: {
            get: vi.fn()
        }
    };
});

vi.mock('../../../public/app-controller.js', () => ({
    applyTheme: vi.fn()
}));

vi.mock('../../../public/midi-controller.js', () => ({
    initMIDI: vi.fn()
}));

describe('Security: State Hydration Validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should clamp invalid numeric values from storage', () => {
        const maliciousState = {
            sections: [], // valid
            bpm: 99999, // DoS risk
            bandIntensity: 100, // logic break risk
            complexity: -5, // logic break risk
            groove: {
                genreFeel: 'MaliciousScript' // XSS/Logic break risk
            }
        };

        stateModule.storage.get.mockReturnValue(maliciousState);

        hydrateState();

        const state = stateModule.getState();

        // Expectations for SAFE values (Security Enhancement)
        expect(state.playback.bpm).toBeLessThanOrEqual(300);
        expect(state.playback.bpm).toBeGreaterThanOrEqual(20);

        expect(state.playback.bandIntensity).toBeLessThanOrEqual(1);
        expect(state.playback.bandIntensity).toBeGreaterThanOrEqual(0);

        expect(state.playback.complexity).toBeLessThanOrEqual(1);
        expect(state.playback.complexity).toBeGreaterThanOrEqual(0);

        // Should fallback to default 'Rock' or similar if invalid
        expect(state.groove.genreFeel).not.toBe('MaliciousScript');
        const validGenres = ['Rock', 'Jazz', 'Funk', 'Disco', 'Hip Hop', 'Blues', 'Neo-Soul', 'Reggae', 'Acoustic', 'Bossa', 'Country', 'Metal', 'Ska-Punk'];
        expect(validGenres).toContain(state.groove.genreFeel);
    });
});
