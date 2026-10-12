// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transposeKey } from '../../../public/controllers/arranger-controller.js';
import { flushBuffers } from '../../../public/controllers/instrument-controller.js';
import { validateProgression } from '../../../public/engine/chords-engine.js';
import { restoreGains } from '../../../public/engine/engine.js';
import { getState, stateMap } from '../../../public/state.js';

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
    validateProgression: vi.fn(),
}));

vi.mock('../../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/controllers/instrument-controller.js', () => ({
    flushBuffers: vi.fn(),
}));

vi.mock('../../../public/utils.js', () => ({
    normalizeKey: vi.fn((k) => {
        const map = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
        return map[k] || k;
    }),
}));

describe('Arranger Controller', () => {
    let state;

    beforeEach(() => {
        vi.clearAllMocks();

        state = {
            arranger: {
                sections: [
                    { id: 's1', label: 'Verse', value: 'C G', repeat: 2, key: 'C' },
                    { id: 's2', label: 'Chorus', value: 'Am F', repeat: 1, key: 'A' },
                ],
                isMinor: false,
                key: 'C',
            },
        };
        Object.assign(getState(), state);
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

        it('writes new sections through dispatch and leaves the old ones alone (#1634)', () => {
            const before = state.arranger.sections;
            const [first, second] = before;

            transposeKey(7);

            // The array and objects that were state before the call are untouched...
            expect(before).toHaveLength(2);
            expect(first).toEqual({ id: 's1', label: 'Verse', value: 'C G', repeat: 2, key: 'C' });
            expect(second).toEqual({
                id: 's2',
                label: 'Chorus',
                value: 'Am F',
                repeat: 1,
                key: 'A',
            });
            // ...and what state holds now is a different array of different objects.
            expect(state.arranger.sections).not.toBe(before);
            expect(state.arranger.sections[0]).not.toBe(first);
            expect(state.arranger.sections[0]).toMatchObject({
                id: 's1',
                label: 'Verse',
                repeat: 2,
            });
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

    it('resyncs the engine after a transpose (validate, flush buffers, restore gains)', () => {
        transposeKey(2);
        expect(validateProgression).toHaveBeenCalledWith(stateMap);
        expect(flushBuffers).toHaveBeenCalled();
        expect(restoreGains).toHaveBeenCalledWith(stateMap);
    });
});
