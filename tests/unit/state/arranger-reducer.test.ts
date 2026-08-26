import { beforeEach, describe, expect, it } from 'vitest';
import { arranger, arrangerReducer } from '../../../public/state/arranger.js';
import { ACTIONS } from '../../../public/types.js';

describe('Arranger Reducer', () => {
    beforeEach(() => {
        arrangerReducer({ type: ACTIONS.RESET_STATE, payload: undefined });
    });

    it('should reset to default values', () => {
        arranger.key = 'Eb';
        arranger.notation = 'name';
        arrangerReducer({ type: ACTIONS.RESET_STATE, payload: undefined });
        expect(arranger.key).toBe('C');
        expect(arranger.notation).toBe('roman');
        expect(arranger.sections.length).toBe(1);
    });

    it('should set notation style', () => {
        arrangerReducer({ type: ACTIONS.SET_NOTATION, payload: 'nns' });
        expect(arranger.notation).toBe('nns');
    });

    it('should update arrangement sections', () => {
        const newSections = [
            { id: '1', label: 'Verse', value: 'I' },
            { id: '2', label: 'Chorus', value: 'IV' },
        ];
        arrangerReducer({ type: ACTIONS.SET_ARRANGEMENT, payload: newSections });
        expect(arranger.sections).toEqual(newSections);
    });

    it('clears authored grouping whenever an action changes the meter', () => {
        arranger.grouping = [2, 3];
        arrangerReducer({ type: ACTIONS.SET_TIME_SIGNATURE, payload: '7/8' });
        expect(arranger.grouping).toBeNull();

        arranger.grouping = [2, 2, 3];
        arrangerReducer({
            type: ACTIONS.LOAD_TEMPLATE,
            payload: { sections: [], timeSignature: '5/4' },
        });
        expect(arranger.grouping).toBeNull();

        arranger.grouping = [3, 2];
        arrangerReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'arranger', param: 'timeSignature', value: '4/4' },
        });
        expect(arranger.grouping).toBeNull();
    });

    it('preserves authored grouping when a meter action is a no-op', () => {
        arranger.timeSignature = '5/4';
        arranger.grouping = [2, 3];

        arrangerReducer({ type: ACTIONS.SET_TIME_SIGNATURE, payload: '5/4' });
        expect(arranger.grouping).toEqual([2, 3]);

        arrangerReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'arranger', param: 'timeSignature', value: '5/4' },
        });
        expect(arranger.grouping).toEqual([2, 3]);
    });

    describe('setArrangerParam', () => {
        it('should update all supported parameters', () => {
            const params = {
                sections: [],
                progression: [{ c: 1 }],
                key: 'F#',
                timeSignature: '3/4',
                grouping: [3, 2],
                isMinor: true,
                notation: 'name',
                valid: true,
                totalSteps: 128,
                stepMap: [{ s: 1 }],
                measureMap: [{ m: 1 }],
                sectionMap: [{ id: '1' }],
                history: ['{}'],
                lastInteractedSectionId: 's2',
                lastChordPreset: 'Jazz',
                mutatedSectionId: 's1',
                isDirty: true,
            };

            for (const [param, value] of Object.entries(params)) {
                arrangerReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'arranger', param, value },
                });
                expect((arranger as any)[param]).toEqual(value);
            }
        });
    });
});
