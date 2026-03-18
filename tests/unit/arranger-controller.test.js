/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addSection,
    onSectionDelete,
    onSectionDuplicate,
    onSectionUpdate,
    refreshArrangerUI,
    saveProgression,
    switchToRelativeKey,
    transposeKey,
    validateAndAnalyze,
} from '../../public/arranger-controller.js';
import { transformRelativeProgression, validateProgression } from '../../public/chords-engine.js';
import { analyzeFormUI } from '../../public/conductor.js';
import { restoreGains } from '../../public/engine/engine.js';
import { pushHistory } from '../../public/history.js';
import { flushBuffers } from '../../public/instrument-controller.js';
import { saveCurrentState } from '../../public/persistence.js';
import { getState, stateMap } from '../../public/state.js';
import { showToast } from '../../public/ui.js';
import { syncWorker } from '../../public/worker-client.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    stateMap: { mockState: true },
}));

vi.mock('../../public/chords-engine.js', () => ({
    validateProgression: vi.fn((_state, _, cb) => {
        if (cb) {
            cb();
        }
    }),
    transformRelativeProgression: vi.fn((val) => `rel-${val}`),
}));

vi.mock('../../public/conductor.js', () => ({
    analyzeFormUI: vi.fn(),
}));

vi.mock('../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
}));

vi.mock('../../public/history.js', () => ({
    pushHistory: vi.fn(),
}));

vi.mock('../../public/instrument-controller.js', () => ({
    flushBuffers: vi.fn(),
}));

vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

vi.mock('../../public/ui.js', () => ({
    showToast: vi.fn(),
}));

vi.mock('../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
}));

vi.mock('../../public/utils.js', () => ({
    compressSections: vi.fn((sections) => sections), // Just pass through for tests
    generateId: vi.fn(() => 'new-id'),
    normalizeKey: vi.fn((k) => k),
}));

// Mock window.prompt and window.confirm
const originalPrompt = window.prompt;
const originalConfirm = window.confirm;

// Manual localStorage mock
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => {
            store[key] = value.toString();
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        removeItem: vi.fn((key) => {
            delete store[key];
        }),
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
});

describe('Arranger Controller', () => {
    let state;

    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();

        state = {
            arranger: {
                lastChordPreset: 'Test Preset',
                sections: [
                    { id: 's1', label: 'Verse', value: 'C G', repeat: 2, key: 'C' },
                    { id: 's2', label: 'Chorus', value: 'Am F', repeat: 1, key: 'A' },
                ],
                isMinor: false,
                key: 'C',
                isDirty: false,
            },
        };
        getState.mockReturnValue(state);
    });

    afterEach(() => {
        window.prompt = originalPrompt;
        window.confirm = originalConfirm;
    });

    describe('saveProgression', () => {
        it('should save to localStorage and show toast', () => {
            window.prompt = vi.fn().mockReturnValue('My New Hit');

            saveProgression();

            const saved = JSON.parse(window.localStorage.getItem('ensemble_userPresets'));
            expect(saved).toHaveLength(1);
            expect(saved[0].name).toBe('My New Hit');
            expect(saved[0].sections.length).toBe(2);
            expect(showToast).toHaveBeenCalledWith('Saved "My New Hit" to library');
        });

        it('should bail if prompt is cancelled', () => {
            window.prompt = vi.fn().mockReturnValue(null);
            saveProgression();
            expect(window.localStorage.getItem('ensemble_userPresets')).toBeNull();
        });
    });

    describe('validateAndAnalyze', () => {
        it('should validate progression and trigger form analysis', () => {
            validateAndAnalyze();
            expect(validateProgression).toHaveBeenCalledWith(
                stateMap,
                undefined,
                expect.any(Function),
            );
            expect(analyzeFormUI).toHaveBeenCalled();
        });
    });

    describe('refreshArrangerUI', () => {
        it('should trigger the full refresh pipeline', () => {
            refreshArrangerUI();
            expect(validateProgression).toHaveBeenCalled();
            expect(syncWorker).toHaveBeenCalled();
            expect(flushBuffers).toHaveBeenCalled();
            expect(restoreGains).toHaveBeenCalledWith(stateMap);
            expect(saveCurrentState).toHaveBeenCalled();
        });
    });

    describe('onSectionUpdate', () => {
        it('should handle standard field updates', () => {
            onSectionUpdate('s1', 'value', 'C F G');
            expect(state.arranger.sections[0].value).toBe('C F G');
            expect(state.arranger.isDirty).toBe(true);
            expect(validateProgression).toHaveBeenCalled();
        });

        it('should bail on invalid section ID', () => {
            onSectionUpdate('bad-id', 'value', 'C');
            expect(state.arranger.isDirty).toBe(false);
        });

        it('should handle move operation', () => {
            onSectionUpdate('s1', 'move', 1); // Move Verse down
            expect(pushHistory).toHaveBeenCalled();
            expect(state.arranger.sections[0].id).toBe('s2');
            expect(state.arranger.sections[1].id).toBe('s1');
        });

        it('should not move out of bounds', () => {
            onSectionUpdate('s1', 'move', -1);
            expect(pushHistory).not.toHaveBeenCalled();
        });

        it('should handle reorder operation', () => {
            onSectionUpdate('s1', 'reorder', ['s2', 's1']);
            expect(pushHistory).toHaveBeenCalled();
            expect(state.arranger.sections[0].id).toBe('s2');
            expect(state.arranger.sections[1].id).toBe('s1');
        });

        it('should ignore reorder if order is unchanged', () => {
            onSectionUpdate('s1', 'reorder', ['s1', 's2']);
            expect(pushHistory).not.toHaveBeenCalled();
        });
    });

    describe('onSectionDelete', () => {
        it('should require confirmation if section has content', () => {
            window.confirm = vi.fn().mockReturnValue(false);
            onSectionDelete('s1');
            expect(state.arranger.sections.length).toBe(2); // Not deleted

            window.confirm = vi.fn().mockReturnValue(true);
            onSectionDelete('s1');
            expect(state.arranger.sections.length).toBe(1); // Deleted
            expect(state.arranger.isDirty).toBe(true);
            expect(syncWorker).toHaveBeenCalled(); // part of refreshArrangerUI
        });

        it('should bypass confirmation for empty or default sections', () => {
            state.arranger.sections.push({ id: 's3', value: 'I' });
            window.confirm = vi.fn();
            onSectionDelete('s3');
            expect(window.confirm).not.toHaveBeenCalled();
            expect(state.arranger.sections.length).toBe(2);
        });

        it('should not delete the last section', () => {
            state.arranger.sections = [{ id: 's1', value: 'C' }];
            onSectionDelete('s1');
            expect(state.arranger.sections.length).toBe(1);
        });
    });

    describe('onSectionDuplicate', () => {
        it('should duplicate a section', () => {
            onSectionDuplicate('s1');
            expect(pushHistory).toHaveBeenCalled();
            expect(state.arranger.sections.length).toBe(3);
            expect(state.arranger.sections[1].id).not.toBe('s1'); // new ID
            expect(state.arranger.sections[1].label).toBe('Verse (Copy)');
            expect(state.arranger.isDirty).toBe(true);
        });

        it('should ignore invalid ID', () => {
            onSectionDuplicate('bad-id');
            expect(state.arranger.sections.length).toBe(2);
        });
    });

    describe('addSection', () => {
        it('should add a new default section', () => {
            addSection();
            expect(state.arranger.sections.length).toBe(3);
            expect(state.arranger.sections[2].value).toBe('I');
            expect(state.arranger.sections[2].label).toBe('Section 3');
            expect(state.arranger.isDirty).toBe(true);
        });
    });

    describe('transposeKey', () => {
        it('should transpose chords and update explicit section keys', () => {
            // C -> G is +7 semitones
            transposeKey(7);

            expect(state.arranger.key).toBe('G');
            // 'C' + 7 = 'G'. 'G' + 7 = 'D'
            expect(state.arranger.sections[0].value).toBe('G D');
            // 'Am' + 7 = 'Em'. 'F' + 7 = 'C'
            expect(state.arranger.sections[1].value).toBe('Em C');

            // Explicit keys
            expect(state.arranger.sections[0].key).toBe('G');
            expect(state.arranger.sections[1].key).toBe('E');
        });

        it('should leave roman numeral notation intact', () => {
            state.arranger.sections[0].value = 'I V vi IV';
            transposeKey(2);
            expect(state.arranger.sections[0].value).toBe('I V vi IV');
        });
    });

    describe('switchToRelativeKey', () => {
        it('should swap between major and minor', () => {
            switchToRelativeKey();
            expect(state.arranger.isMinor).toBe(true);
            expect(state.arranger.key).toBe('A');

            expect(state.arranger.sections[0].value).toBe('rel-C G');
            expect(state.arranger.sections[0].key).toBe('A');

            expect(showToast).toHaveBeenCalledWith('Switched to Relative Minor: Am');

            // Switch back
            switchToRelativeKey();
            expect(state.arranger.isMinor).toBe(false);
            expect(state.arranger.key).toBe('C');
            expect(showToast).toHaveBeenCalledWith('Switched to Relative Major: C');
        });
    });
});
