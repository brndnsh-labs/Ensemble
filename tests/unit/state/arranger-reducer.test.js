import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arranger, arrangerReducer, setArrangerParam } from '../../../public/state/arranger.js';
import { ACTIONS } from '../../../public/types.js';

describe('Arranger Reducer', () => {
    beforeEach(() => {
        arrangerReducer(ACTIONS.RESET_STATE);
    });

    it('should reset to default values', () => {
        arranger.key = 'Eb';
        arranger.notation = 'name';
        arrangerReducer(ACTIONS.RESET_STATE);
        expect(arranger.key).toBe('C');
        expect(arranger.notation).toBe('roman');
        expect(arranger.sections.length).toBe(1);
    });

    it('should set notation style', () => {
        arrangerReducer(ACTIONS.SET_NOTATION, 'nns');
        expect(arranger.notation).toBe('nns');
    });

    it('should update arrangement sections', () => {
        const newSections = [
            { id: '1', label: 'Verse', value: 'I' },
            { id: '2', label: 'Chorus', value: 'IV' },
        ];
        arrangerReducer(ACTIONS.SET_ARRANGEMENT, newSections);
        expect(arranger.sections).toEqual(newSections);
    });

    it('should handle MusicXML import', () => {
        const payload = {
            hasChords: true,
            sections: [{ id: 'xml1', label: 'A', value: 'Cmaj7' }]
        };
        arrangerReducer(ACTIONS.IMPORT_MUSICXML, payload);
        expect(arranger.sections).toEqual(payload.sections);
        expect(arranger.isDirty).toBe(true);
        expect(arranger.notation).toBe('name');

        // Silent update if no chords
        arrangerReducer(ACTIONS.IMPORT_MUSICXML, { hasChords: false });
        expect(arranger.isDirty).toBe(true);
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
                isDirty: true
            };

            for (const [param, value] of Object.entries(params)) {
                setArrangerParam(param, value);
                expect(arranger[param]).toEqual(value);
            }
        });

        it('should log warning for unknown parameters', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            setArrangerParam('ghost', 'val');
            expect(spy).toHaveBeenCalled();
        });
    });
});
