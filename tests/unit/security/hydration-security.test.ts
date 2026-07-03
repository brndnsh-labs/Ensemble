// @ts-nocheck
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as stateModule from '../../../public/state.js';
import { hydrateState } from '../../../public/state-hydration.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Consolidated State and Storage Mock
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bpm: 100, bandIntensity: 0.5, complexity: 0.3 },
        arranger: { sections: [], key: 'C', timeSignature: '4/4', notation: 'roman' },
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
        soloist: makeSoloistMock({ enabled: false, volume: 0.5, reverb: 0.6 }),
        harmony: { enabled: false, volume: 0.4, reverb: 0.4 },
        vizState: { enabled: false },
        midi: { enabled: false },
    };

    const storage = {
        get: vi.fn((key) => {
            const item = localStorage.getItem(`ensemble_${key}`);
            if (!item) {
                return [];
            }
            try {
                return JSON.parse(item);
            } catch (_e) {
                return [];
            }
        }),
        save: vi.fn(),
    };

    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: vi.fn(),
        storage,
        arranger: mockState.arranger,
        playback: mockState.playback,
        groove: mockState.groove,
        bass: mockState.bass,
        soloist: mockState.soloist,
    };
});

vi.mock('../../../public/app-controller.js', () => ({
    applyTheme: vi.fn(),
}));

vi.mock('../../../public/midi-controller.js', () => ({
    initMIDI: vi.fn(),
}));

describe('Security: Hydration & Storage Resilience', () => {
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
        vi.clearAllMocks();

        // Setup localStorage mock using Vitest stubbing
        vi.stubGlobal('localStorage', mockStorage);
        mockStorage.clear();

        // Reset state defaults
        const state = stateModule.getState();
        state.arranger.sections = [];
        state.arranger.key = 'C';
        state.arranger.timeSignature = '4/4';
        state.arranger.notation = 'roman';
        state.playback.bpm = 100;
        state.playback.bandIntensity = 0.5;
        state.playback.complexity = 0.3;
        state.groove.measures = 1;
        state.groove.volume = 0.5;
        state.groove.swing = 0;
        state.groove.humanize = 20;
        state.bass.volume = 0.5;
        state.soloist.reverb = 0.6;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('State Hydration Validation & Clamping', () => {
        it('should clamp invalid numeric values from storage', () => {
            const maliciousState = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                bpm: 99999,
                bandIntensity: 100,
                complexity: -5,
                chords: {
                    volume: 999,
                    reverb: 9,
                },
                bass: {
                    volume: 2,
                    reverb: 8,
                },
                soloist: makeSoloistMock({ reverb: 5.5 }),
                harmony: { reverb: 7 },
                groove: {
                    genreFeel: 'MaliciousScript',
                    measures: 1000,
                    volume: 999,
                    reverb: -10,
                },
                notation: 'literal',
            };

            // Use setItem to trigger the functional mock we wrote above
            localStorage.setItem('ensemble_currentState', JSON.stringify(maliciousState));
            hydrateState();

            const state = stateModule.getState();

            // Notation check
            expect(state.arranger.notation).not.toBe('literal');
            expect(['roman', 'name', 'nns']).toContain(state.arranger.notation);

            // Playback clamping
            expect(state.playback.bpm).toBeLessThanOrEqual(300);
            expect(state.playback.bandIntensity).toBeLessThanOrEqual(1);
            expect(state.playback.complexity).toBeGreaterThanOrEqual(0);

            // Mixer defaults and clamping
            expect(state.groove.measures).toBeLessThanOrEqual(8);
            expect(state.groove.volume).toBe(1.0);
            expect(state.bass.volume).toBe(1.0);
            expect(state.chords.reverb).toBe(0.3);
            expect(state.bass.reverb).toBe(0.05);
            expect(state.soloist.reverb).toBe(0.6);
            expect(state.harmony.reverb).toBe(0.4);
            expect(state.groove.reverb).toBe(0.2);

            expect(stateModule.storage.save).toHaveBeenCalledWith(
                'currentState',
                expect.objectContaining({
                    mixerVersion: 2,
                }),
            );

            // Genre validation
            expect(state.groove.genreFeel).not.toBe('MaliciousScript');
            expect(state.groove.genreFeel).toBe('Rock'); // Default fallback
        });

        it('should clamp swing and humanize values', () => {
            const payload = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                groove: { swing: 150, humanize: -20 },
            };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            const state = stateModule.getState();
            expect(state.groove.swing).toBe(100);
            expect(state.groove.humanize).toBe(0);
        });

        it('should treat retired classic soloist preset values as unsupported', () => {
            const payload = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                soloist: makeSoloistMock({ preset: 'classic' }),
            };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            expect(stateModule.getState().soloist.preset).toBe('trumpet');
        });

        it('should clamp numeric fields even if strings are provided', () => {
            const payload = {
                sections: [{ id: '1', label: 'A', value: 'I' }],
                groove: { volume: '50', swing: '200' },
            };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            const state = stateModule.getState();
            expect(state.groove.volume).toBe(1.0);
            expect(state.groove.swing).toBe(100);
        });
    });

    describe('DoS & XSS Prevention during Hydration', () => {
        it('should limit the number of sections loaded from storage (DoS Prevention)', () => {
            const massiveSections = Array(1000)
                .fill(0)
                .map((_, i) => ({
                    id: `sec-${i}`,
                    label: `Section ${i}`,
                    value: 'I | IV',
                }));

            const payload = { sections: massiveSections };
            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));

            hydrateState();

            expect(stateModule.getState().arranger.sections.length).toBeLessThanOrEqual(500);
        });

        it('should sanitize section labels and values (XSS Prevention)', () => {
            const payload = {
                sections: [
                    { id: 'xss1', label: '<script>alert(1)</script>', value: 'I | IV' },
                    { id: 'xss2', label: 'Safe', value: '<img src=x>' },
                ],
            };

            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));
            hydrateState();

            const sections = stateModule.getState().arranger.sections;
            const sec1 = sections.find((s) => s.id === 'xss1');
            const sec2 = sections.find((s) => s.id === 'xss2');

            expect(sec1).toBeDefined();
            expect(sec1.label).not.toContain('<script>');
            expect(sec2).toBeDefined();
            expect(sec2.value).not.toContain('<img');
        });

        it('should validate key and timeSignature against allowlists', () => {
            const payload = {
                sections: [{ id: '1', label: 'Intro', value: 'I' }],
                key: 'InvalidKey',
                timeSignature: '99/8',
            };

            localStorage.setItem('ensemble_currentState', JSON.stringify(payload));
            hydrateState();

            const state = stateModule.getState();
            expect(state.arranger.key).toBe('C');
            expect(state.arranger.timeSignature).toBe('4/4');
        });
    });
});
