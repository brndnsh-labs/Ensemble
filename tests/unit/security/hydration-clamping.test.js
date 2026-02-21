// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateState } from '../../../public/state-hydration.js';

// Mock the state module
vi.mock('../../../public/state.js', () => {
    // Create a mock state object that mirrors the real structure
    const mockState = {
        arranger: { sections: [], key: 'C', timeSignature: '4/4' },
        playback: { bpm: 100, bandIntensity: 0.5, complexity: 0.5 },
        groove: {
            enabled: true,
            measures: 1,
            volume: 0.5,
            reverb: 0.2,
            swing: 0,
            humanize: 20,
            instruments: [],
        },
        chords: { enabled: true, volume: 0.5, reverb: 0.3 },
        bass: { enabled: true, volume: 0.5, reverb: 0.05 },
        soloist: { enabled: false, volume: 0.5, reverb: 0.6 },
        harmony: { enabled: false, volume: 0.4, reverb: 0.4 },
        vizState: { enabled: false },
        midi: { enabled: false },
    };

    return {
        getState: () => mockState,
        dispatch: vi.fn(),
        storage: {
            get: vi.fn(),
            save: vi.fn(),
        },
        ACTIONS: {
            SET_MIDI_CONFIG: 'SET_MIDI_CONFIG',
        },
    };
});

import { getState, storage } from '../../../public/state.js';

describe('State Hydration Security (Clamping)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mock state values
        const state = getState();
        state.groove.measures = 1;
        state.groove.volume = 0.5;
        state.groove.swing = 0;
        state.bass.volume = 0.5;
        state.soloist.reverb = 0.6;
    });

    it('should clamp excessively large values for groove measures', () => {
        storage.get.mockReturnValue({
            sections: [{ id: '1', label: 'A', value: 'I' }], // Valid sections required to trigger hydration
            groove: {
                measures: 1000, // Malicious value
                volume: 0.5,
            },
        });

        hydrateState();

        const state = getState();
        expect(state.groove.measures).toBeLessThanOrEqual(8); // Should be clamped
    });

    it('should clamp out-of-bounds volume and reverb', () => {
        storage.get.mockReturnValue({
            sections: [{ id: '1', label: 'A', value: 'I' }],
            groove: { volume: 999, reverb: -10 },
            bass: { volume: 2.0 },
            soloist: { reverb: 5.5 },
        });

        hydrateState();

        const state = getState();
        expect(state.groove.volume).toBe(1.0);
        expect(state.groove.reverb).toBe(0.0);
        expect(state.bass.volume).toBe(1.0);
        expect(state.soloist.reverb).toBe(1.0);
    });

    it('should clamp swing and humanize values', () => {
        storage.get.mockReturnValue({
            sections: [{ id: '1', label: 'A', value: 'I' }],
            groove: {
                swing: 150,
                humanize: -20,
            },
        });

        hydrateState();

        const state = getState();
        expect(state.groove.swing).toBe(100);
        expect(state.groove.humanize).toBe(0);
    });

    it('should clamp numeric fields even if strings are provided', () => {
        storage.get.mockReturnValue({
            sections: [{ id: '1', label: 'A', value: 'I' }],
            groove: {
                volume: '50', // String "50" -> should be clamped to 1.0
                swing: '200',
            },
        });

        hydrateState();

        const state = getState();
        expect(state.groove.volume).toBe(1.0);
        expect(state.groove.swing).toBe(100);
    });
});
