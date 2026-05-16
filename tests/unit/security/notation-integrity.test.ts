// @ts-nocheck
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as stateModule from '../../../public/state.js';
import { hydrateState, loadFromUrl } from '../../../public/state-hydration.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock dependencies
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bpm: 100, bandIntensity: 0.5, complexity: 0.3, modals: {} },
        arranger: { sections: [], key: 'C', notation: 'roman', progression: [] },
        groove: { genreFeel: 'Rock', instruments: [] },
        chords: {},
        bass: {},
        soloist: makeSoloistMock({}),
        harmony: {},
        midi: {},
        vizState: {},
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: vi.fn(),
        storage: {
            get: vi.fn(),
            save: vi.fn(),
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
});
