// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arranger, arrangerReducer } from '../../../public/state/arranger.js';
import * as stateModule from '../../../public/state.js';
import { hydrateState, loadFromUrl } from '../../../public/state-hydration.js';
import { ACTIONS } from '../../../public/types.js';

// Mock dependencies
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bpm: 100, bandIntensity: 0.5, complexity: 0.3, modals: {} },
        arranger: { sections: [], key: 'C', notation: 'roman', progression: [] },
        groove: { genreFeel: 'Rock', instruments: [] },
        chords: {},
        bass: {},
        soloist: {},
        harmony: {},
        midi: {},
        vizState: {},
    };
    return {
        getState: () => mockState,
        dispatch: vi.fn(),
        storage: {
            get: vi.fn(),
        },
        subscribe: vi.fn(),
    };
});

vi.mock('../../../public/app-controller.js', () => ({
    applyTheme: vi.fn(),
}));

vi.mock('../../../public/midi-controller.js', () => ({
    initMIDI: vi.fn(),
}));

describe('Notation Integrity: Regression Prevention', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset state
        const state = stateModule.getState();
        state.arranger.notation = 'roman';
        state.arranger.sections = [];

        Object.defineProperty(window, 'location', {
            writable: true,
            value: {
                search: '',
                origin: 'http://localhost',
                pathname: '/',
            },
        });
    });

    describe('URL Parameter Validation', () => {
        it('accepts current valid notation types', () => {
            const validTypes = ['roman', 'name', 'nns'];
            const state = stateModule.getState();

            for (const type of validTypes) {
                window.location.search = `?notation=${type}`;
                loadFromUrl();
                expect(state.arranger.notation).toBe(type);
            }
        });

        it('rejects legacy or invalid notation types from URL', () => {
            const invalidTypes = ['literal', 'chord', 'key', 'malicious', '<script>'];
            const state = stateModule.getState();

            for (const type of invalidTypes) {
                state.arranger.notation = 'roman'; // Reset
                window.location.search = `?notation=${type}`;
                loadFromUrl();
                expect(state.arranger.notation).toBe('roman');
            }
        });
    });

    describe('State Hydration Validation', () => {
        it('gracefully falls back when localStorage contains invalid notation', () => {
            const invalidStates = [
                { sections: [], notation: 'literal' },
                { sections: [], notation: 'chord' },
                { sections: [], notation: null },
                { sections: [], notation: undefined },
            ];

            for (const saved of invalidStates) {
                stateModule.storage.get.mockReturnValue(saved);
                hydrateState();
                const state = stateModule.getState();
                expect(['roman', 'name', 'nns']).toContain(state.arranger.notation);
            }
        });

        it('persists valid notation from localStorage', () => {
            const validSaved = { sections: [], notation: 'name' };
            stateModule.storage.get.mockReturnValue(validSaved);
            hydrateState();
            const state = stateModule.getState();
            expect(state.arranger.notation).toBe('name');
        });
    });

    describe('Reducer Integrity', () => {
        it('sets a valid notation when importing MusicXML', () => {
            const payload = {
                hasChords: true,
                sections: [{ id: 'new', value: 'C | G' }],
                leadSheetMelody: [],
            };

            arrangerReducer(ACTIONS.IMPORT_MUSICXML, payload);

            // Should be 'name' or another valid UI notation, definitely NOT 'literal'
            expect(arranger.notation).toBe('name');
            expect(['roman', 'name', 'nns']).toContain(arranger.notation);
        });
    });
});
