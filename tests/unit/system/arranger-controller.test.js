/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../public/state.js', () => {
    const mockState = {
        arranger: {
            sections: [],
            key: 'C',
            isMinor: false,
            progression: [],
            stepMap: [], // Added to prevent analyzeForm crashes
            lastChordPreset: null,
        },
        chords: {},
        playback: {},
        soloist: { enabled: true },
        harmony: {
            enabled: false,
            style: 'smart',
            octave: 60,
            volume: 0.4,
            complexity: 0.5,
            buffer: new Map(),
        },
        groove: { genreFeel: 'Rock', enabled: true },
        conductorState: {},
        vizState: {},
        midi: {},
        dispatch: vi.fn(),
    };
    return { ...mockState, stateMap: mockState, getState: () => mockState };
});

vi.mock('../../../public/form-analysis.js', () => ({
    analyzeForm: vi.fn(() => ({ sequence: 'A', sections: [] })),
}));

vi.mock('../../../public/ui.js', () => ({
    ui: {
        keySelect: { value: 'C' },
    },
    renderSections: vi.fn(),
    renderChordVisualizer: vi.fn(),
    showToast: vi.fn(),
    updateKeySelectLabels: vi.fn(),
    updateRelKeyButton: vi.fn(),
}));

vi.mock('../../../public/chords-engine.js', () => ({
    validateProgression: vi.fn((_state, _dispatch, renderCallback) => renderCallback?.()),
    transformRelativeProgression: vi.fn((val, shift) => {
        if (val === 'I | V' && shift === -3) {
            return 'bIII | bVII';
        }
        if (val === 'i | iv' && shift === 3) {
            return 'vi | ii';
        }
        return val;
    }),
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    flushBuffers: vi.fn(),
}));

vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
}));

vi.mock('../../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

vi.mock('../../../public/utils.js', () => ({
    generateId: vi.fn(() => 'mock-id'),
    normalizeKey: vi.fn((k) => {
        const map = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
        return map[k] || k;
    }),
}));

vi.mock('../../../public/history.js', () => ({
    pushHistory: vi.fn(),
}));

import {
    addSection,
    onSectionDelete,
    onSectionDuplicate,
    onSectionUpdate,
    switchToRelativeKey,
    transposeKey,
} from '../../../public/arranger-controller.js';
import { getState } from '../../../public/state.js';

const { arranger } = getState();

import { ui } from '../../../public/ui.js';

describe('Arranger Controller', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        arranger.sections = [];
        arranger.key = 'C';
        arranger.isMinor = false;
        arranger.progression = [];
        ui.keySelect.value = 'C';
    });

    describe('addSection', () => {
        it('should add a new section to the arranger with default label', () => {
            addSection();
            expect(arranger.sections).toHaveLength(1);
            expect(arranger.sections[0].label).toBe('Section 1');
            expect(arranger.sections[0].value).toBe('I');
        });
    });

    describe('onSectionUpdate', () => {
        it('should update an existing section label', () => {
            arranger.sections = [{ id: 's1', label: 'Verse', value: 'I' }];
            onSectionUpdate('s1', 'label', 'Chorus');
            expect(arranger.sections[0].label).toBe('Chorus');
        });

        it('should update an existing section value and validate', () => {
            arranger.sections = [{ id: 's1', label: 'Verse', value: 'I' }];
            onSectionUpdate('s1', 'value', 'IV');
            expect(arranger.sections[0].value).toBe('IV');
        });
    });

    describe('onSectionDelete', () => {
        it('should delete a section by ID', () => {
            arranger.sections = [
                { id: 's1', label: 'V', value: 'I' },
                { id: 's2', label: 'C', value: 'IV' },
            ];
            onSectionDelete('s1');
            expect(arranger.sections).toHaveLength(1);
            expect(arranger.sections[0].id).toBe('s2');
        });

        it('should not delete if it is the last section', () => {
            arranger.sections = [{ id: 's1', label: 'V', value: 'I' }];
            onSectionDelete('s1');
            expect(arranger.sections).toHaveLength(1);
        });
    });

    describe('onSectionDuplicate', () => {
        it('should duplicate a section', () => {
            arranger.sections = [{ id: 's1', label: 'Verse', value: 'I' }];
            onSectionDuplicate('s1');
            expect(arranger.sections).toHaveLength(2);
            expect(arranger.sections[1]).toEqual({
                id: 'mock-id',
                label: 'Verse (Copy)',
                value: 'I',
            });
        });
    });

    describe('transposeKey', () => {
        it('should transpose key and section chords', () => {
            arranger.key = 'C';
            arranger.sections = [{ id: 's1', value: 'C | F' }];

            // Transpose +2 semitones (C -> D)
            transposeKey(2, vi.fn());

            expect(arranger.key).toBe('D');

            // 'C | F' should become 'D | G' if they are NOT roman numerals
            expect(arranger.sections[0].value).toBe('D | G');
        });

        it('should NOT transpose Roman Numerals', () => {
            arranger.key = 'C';
            arranger.sections = [{ id: 's1', value: 'I | IV' }];

            transposeKey(2, vi.fn());

            expect(arranger.key).toBe('D');
            // Roman numerals stay relative
            expect(arranger.sections[0].value).toBe('I | IV');
        });

        it('should handle Unicode accidentals (e.g., \u266D, \u266F)', () => {
            arranger.key = 'C';
            arranger.sections = [{ id: 's1', value: 'A\u266Dmaj7 | C\u266Fm7' }];

            // Transpose +1 semitone (Ab -> A, C# -> D)
            transposeKey(1, vi.fn());

            expect(arranger.sections[0].value).toBe('Amaj7 | Dm7');
        });
    });

    describe('switchToRelativeKey', () => {
        it.each([
            {
                startKey: 'C',
                startMinor: false,
                startVal: 'I | V',
                expectedKey: 'A',
                expectedMinor: true,
                expectedVal: 'bIII | bVII',
                desc: 'Major to Relative Minor',
            },
            {
                startKey: 'A',
                startMinor: true,
                startVal: 'i | iv',
                expectedKey: 'C',
                expectedMinor: false,
                expectedVal: 'vi | ii',
                desc: 'Minor to Relative Major',
            },
        ])('should switch from $desc', ({
            startKey,
            startMinor,
            startVal,
            expectedKey,
            expectedMinor,
            expectedVal,
        }) => {
            arranger.key = startKey;
            arranger.isMinor = startMinor;
            arranger.sections = [{ value: startVal }];

            switchToRelativeKey(vi.fn());

            expect(arranger.key).toBe(expectedKey);
            expect(arranger.isMinor).toBe(expectedMinor);
            expect(arranger.sections[0].value).toBe(expectedVal);
        });
    });
});
