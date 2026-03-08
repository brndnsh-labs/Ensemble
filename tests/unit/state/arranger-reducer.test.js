import { beforeEach, describe, expect, it } from 'vitest';
import { arranger, arrangerReducer } from '../../../public/state/arranger.js';
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

    it('should handle MusicXML import with chords', () => {
        const payload = {
            hasChords: true,
            sections: [{ id: 'xml1', label: 'A', value: 'Cmaj7' }],
        };
        arrangerReducer(ACTIONS.IMPORT_MUSICXML, payload);
        expect(arranger.sections).toEqual(payload.sections);
        expect(arranger.isDirty).toBe(true);
        expect(arranger.notation).toBe('name');
    });

    it('should handle MusicXML import without chords (silent update)', () => {
        arrangerReducer(ACTIONS.IMPORT_MUSICXML, { hasChords: false });
        expect(arranger.isDirty).toBe(true);
    });
});
