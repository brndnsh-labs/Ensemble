// @ts-nocheck
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
    replaceChordInSection,
    saveProgression,
    setKeyCenter,
    setSectionInstrumentEnabled,
    setSectionIntensity,
    switchToRelativeKey,
    transposeKey,
    validateAndAnalyze,
} from '../../../public/arranger-controller.js';
import { validateProgression } from '../../../public/engine/chords-engine.js';
import { analyzeFormUI } from '../../../public/engine/conductor.js';
import { restoreGains } from '../../../public/engine/engine.js';
import { pushHistory } from '../../../public/history.js';
import { flushBuffers } from '../../../public/instrument-controller.js';
import { saveCurrentState } from '../../../public/persistence.js';
import { getState, stateMap } from '../../../public/state.js';
import { showToast } from '../../../public/ui.js';
import { syncWorker } from '../../../public/worker-client.js';

vi.mock('../../../public/state.js', () => {
    const mockState = {};
    return {
        getState: () => mockState,
        stateMap: { mockState: true },
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_PARAM') {
                if (mockState[payload.module]) {
                    mockState[payload.module][payload.param] = payload.value;
                }
            }
        }),
    };
});

vi.mock('../../../public/engine/chords-engine.js', () => ({
    validateProgression: vi.fn((_state, _, cb) => {
        if (cb) {
            cb();
        }
    }),
    transformRelativeProgression: vi.fn((val, shift) => {
        if (val === 'I | V' && shift === -3) {
            return 'bIII | bVII';
        }
        if (val === 'i | iv' && shift === 3) {
            return 'vi | ii';
        }
        return `rel-${val}`;
    }),
}));

vi.mock('../../../public/engine/conductor.js', () => ({
    analyzeFormUI: vi.fn(),
}));

vi.mock('../../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/history.js', () => ({
    pushHistory: vi.fn(),
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    flushBuffers: vi.fn(),
}));

vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: vi.fn(),
}));

vi.mock('../../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
}));

vi.mock('../../../public/state/share-codec.js', () => ({
    compressSections: vi.fn((sections) => sections), // Just pass through for tests
    generateId: vi.fn(() => 'new-id'),
}));

vi.mock('../../../public/utils.js', () => ({
    normalizeKey: vi.fn((k) => {
        const map = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
        return map[k] || k;
    }),
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
        Object.assign(getState(), state);
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

        // #1120 — the load-bearing order guard. This is the canonical resync every
        // arrangement-mutating UI now delegates to (#1128 consolidated the
        // hand-copied copies in PresetLibrary/KeySignatureControls onto it), so the
        // order lives here: syncWorker() must patch the mirrored state BEFORE
        // flushBuffers() refills the worker's buffers from getSyncState() — else the
        // ~4-measure primed lookahead is built from the stale pre-swap progression.
        it('runs validate → syncWorker → flushBuffers in that order (#1120)', () => {
            refreshArrangerUI();
            const validateOrder = vi.mocked(validateProgression).mock.invocationCallOrder[0];
            const syncOrder = vi.mocked(syncWorker).mock.invocationCallOrder[0];
            const flushOrder = vi.mocked(flushBuffers).mock.invocationCallOrder[0];
            expect(syncOrder).toBeGreaterThan(validateOrder);
            expect(flushOrder).toBeGreaterThan(syncOrder);
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

        it('should handle Unicode accidentals (e.g., \u266D, \u266F)', () => {
            state.arranger.key = 'C';
            state.arranger.sections = [{ id: 's1', value: 'A\u266Dmaj7 | C\u266Fm7' }];

            // Transpose +1 semitone (Ab -> A, C# -> D)
            transposeKey(1);

            expect(state.arranger.sections[0].value).toBe('Amaj7 | Dm7');
        });

        it('should transpose the slash bass together with the root (#777)', () => {
            state.arranger.key = 'C';
            state.arranger.sections = [{ id: 's1', value: 'C/E F/A | G/B' }];

            // +2 semitones — the bass must move too (was the bug: bass stayed put → 'D/E').
            transposeKey(2);

            expect(state.arranger.sections[0].value).toBe('D/Gb G/B | A/Db');
        });
    });

    describe('setKeyCenter', () => {
        it('transposes the whole chart to the chosen tonic, preserving minor mode (#778)', () => {
            state.arranger.key = 'A';
            state.arranger.isMinor = true;
            state.arranger.sections = [{ id: 's1', value: 'Am Dm E7' }];

            setKeyCenter('C'); // A minor -> C minor (transpose up a minor third, mode kept)

            expect(state.arranger.key).toBe('C');
            expect(state.arranger.isMinor).toBe(true);
            expect(state.arranger.sections[0].value).toBe('Cm Fm G7');
        });

        it('leaves Roman notation intact (key-relative) while moving the key label', () => {
            state.arranger.key = 'C';
            state.arranger.isMinor = false;
            state.arranger.sections = [{ id: 's1', value: 'I V vi IV' }];

            setKeyCenter('E');

            expect(state.arranger.key).toBe('E');
            expect(state.arranger.sections[0].value).toBe('I V vi IV');
        });

        it('transposes the slash bass too (shares the unified transposer)', () => {
            state.arranger.key = 'C';
            state.arranger.sections = [{ id: 's1', value: 'C/E' }];

            setKeyCenter('D'); // +2

            expect(state.arranger.sections[0].value).toBe('D/Gb');
        });

        it('is a no-op when the selected key equals the current key', () => {
            state.arranger.key = 'G';
            state.arranger.sections = [{ id: 's1', value: 'G C D' }];

            setKeyCenter('G');

            expect(state.arranger.sections[0].value).toBe('G C D');
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
        ])(
            'should switch from $desc',
            ({ startKey, startMinor, startVal, expectedKey, expectedMinor, expectedVal }) => {
                state.arranger.key = startKey;
                state.arranger.isMinor = startMinor;
                state.arranger.sections = [{ value: startVal }];

                switchToRelativeKey();

                expect(state.arranger.key).toBe(expectedKey);
                expect(state.arranger.isMinor).toBe(expectedMinor);
                expect(state.arranger.sections[0].value).toBe(expectedVal);
            },
        );
    });

    describe('setSectionIntensity', () => {
        it('writes a clamped intensity onto the section', () => {
            setSectionIntensity('s1', 0.42);
            const updated = state.arranger.sections.find((s) => s.id === 's1');
            expect(updated.targetIntensity).toBeCloseTo(0.42);
        });

        it('clamps out-of-range values into [0, 1]', () => {
            setSectionIntensity('s1', 2.5);
            expect(state.arranger.sections.find((s) => s.id === 's1').targetIntensity).toBe(1);
            setSectionIntensity('s1', -0.4);
            expect(state.arranger.sections.find((s) => s.id === 's1').targetIntensity).toBe(0);
        });

        it('passing undefined removes the override', () => {
            setSectionIntensity('s1', 0.6);
            expect(
                state.arranger.sections.find((s) => s.id === 's1').targetIntensity,
            ).toBeDefined();
            setSectionIntensity('s1', undefined);
            expect(
                state.arranger.sections.find((s) => s.id === 's1').targetIntensity,
            ).toBeUndefined();
        });

        it('is a no-op for unknown section ids', () => {
            const before = state.arranger.sections.slice();
            setSectionIntensity('does-not-exist', 0.5);
            expect(state.arranger.sections).toEqual(before);
        });
    });

    describe('setSectionInstrumentEnabled', () => {
        it('writes a per-instrument override on the section', () => {
            setSectionInstrumentEnabled('s2', 'bass', false);
            const updated = state.arranger.sections.find((s) => s.id === 's2');
            expect(updated.instruments).toEqual({ bass: false });
        });

        it('passing undefined removes that instrument override; clearing the last drops the whole map', () => {
            setSectionInstrumentEnabled('s2', 'bass', false);
            setSectionInstrumentEnabled('s2', 'soloist', true);
            expect(state.arranger.sections.find((s) => s.id === 's2').instruments).toEqual({
                bass: false,
                soloist: true,
            });

            setSectionInstrumentEnabled('s2', 'bass', undefined);
            expect(state.arranger.sections.find((s) => s.id === 's2').instruments).toEqual({
                soloist: true,
            });

            setSectionInstrumentEnabled('s2', 'soloist', undefined);
            expect(state.arranger.sections.find((s) => s.id === 's2').instruments).toBeUndefined();
        });

        it('is a no-op for unknown section ids', () => {
            const before = state.arranger.sections.slice();
            setSectionInstrumentEnabled('nope', 'chords', true);
            expect(state.arranger.sections).toEqual(before);
        });
    });

    describe('replaceChordInSection', () => {
        beforeEach(() => {
            // Mirror the parsed-progression shape with charStart/charEnd offsets
            // pointing into each section's source `value`.
            state.arranger.sections = [
                { id: 's1', label: 'Verse', value: 'I | V | vi | IV', repeat: 1 },
                { id: 's2', label: 'Chorus', value: 'vi | IV | I | V', repeat: 1 },
            ];
            state.arranger.progression = [
                // s1: I=0..1, V=4..5, vi=8..10, IV=13..15
                {
                    sectionId: 's1',
                    localIndex: 0,
                    repeatIndex: 0,
                    charStart: 0,
                    charEnd: 1,
                },
                {
                    sectionId: 's1',
                    localIndex: 1,
                    repeatIndex: 0,
                    charStart: 4,
                    charEnd: 5,
                },
                {
                    sectionId: 's1',
                    localIndex: 2,
                    repeatIndex: 0,
                    charStart: 8,
                    charEnd: 10,
                },
                {
                    sectionId: 's1',
                    localIndex: 3,
                    repeatIndex: 0,
                    charStart: 13,
                    charEnd: 15,
                },
                // s2:
                {
                    sectionId: 's2',
                    localIndex: 0,
                    repeatIndex: 0,
                    charStart: 0,
                    charEnd: 2,
                },
            ];
        });

        it('splices only the targeted chord; the rest of the section text is unchanged', () => {
            const ok = replaceChordInSection('s1', 1, 'IV');
            expect(ok).toBe(true);
            expect(state.arranger.sections[0].value).toBe('I | IV | vi | IV');
            // Sibling section untouched
            expect(state.arranger.sections[1].value).toBe('vi | IV | I | V');
        });

        it('trims whitespace from the new chord text', () => {
            replaceChordInSection('s1', 0, '  bIIImaj7  ');
            expect(state.arranger.sections[0].value).toBe('bIIImaj7 | V | vi | IV');
        });

        it('returns false for unknown section id', () => {
            const ok = replaceChordInSection('nope', 0, 'I');
            expect(ok).toBe(false);
        });

        it('returns false for unknown localIndex', () => {
            const ok = replaceChordInSection('s1', 99, 'I');
            expect(ok).toBe(false);
        });

        it('returns false (no-op) when the new text equals the existing slice', () => {
            // The chord at localIndex 0 is "I" (range 0..1). Passing "I" yields
            // the same string after splice — the controller should bail.
            const ok = replaceChordInSection('s1', 0, 'I');
            expect(ok).toBe(false);
            expect(state.arranger.sections[0].value).toBe('I | V | vi | IV');
        });

        it('returns false on empty new text', () => {
            const ok = replaceChordInSection('s1', 0, '   ');
            expect(ok).toBe(false);
        });
    });
});
