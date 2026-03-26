import { describe, expect, it } from 'vitest';

import {
    buildLeadSheetRows,
    buildLeadSheetSections,
    getLeadSheetDensity,
} from '../../../public/lead-sheet-model.js';

describe('lead-sheet-model', () => {
    const timeSignature = { beats: 4, stepsPerBeat: 4 };

    it('chunks sections into continuous four-measure rows', () => {
        const progression = Array.from({ length: 8 }, (_, index) => ({
            sectionId: 'a',
            sectionLabel: 'A',
            beats: 4,
            absName: `Chord ${index + 1}`,
        }));

        const sections = buildLeadSheetSections(
            progression,
            [{ id: 'a', seamless: false }],
            timeSignature,
        );
        const rows = buildLeadSheetRows(sections);

        expect(sections).toHaveLength(1);
        expect(rows).toHaveLength(2);
        expect(rows[0].measures).toHaveLength(4);
        expect(rows[1].measures).toHaveLength(4);
        expect(rows[0].measures[0].isSectionStart).toBe(true);
        expect(rows[1].measures[0].isSectionStart).toBe(false);
    });

    it('starts a new row when a section changes', () => {
        const progression = [
            { sectionId: 'a', sectionLabel: 'A', beats: 4, absName: 'I' },
            { sectionId: 'a', sectionLabel: 'A', beats: 4, absName: 'IV' },
            { sectionId: 'b', sectionLabel: 'B', beats: 4, absName: 'V' },
            { sectionId: 'b', sectionLabel: 'B', beats: 4, absName: 'I' },
        ];

        const sections = buildLeadSheetSections(
            progression,
            [
                { id: 'a', seamless: false },
                { id: 'b', seamless: false },
            ],
            timeSignature,
        );
        const rows = buildLeadSheetRows(sections);

        expect(rows).toHaveLength(2);
        expect(rows[0].sectionLabel).toBe('A');
        expect(rows[1].sectionLabel).toBe('B');
        expect(rows[1].measures[0].isSectionStart).toBe(true);
    });

    it('keeps seamless section changes inside the current row when space remains', () => {
        const progression = [
            { sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '1' },
            { sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '2' },
            { sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '3' },
            { sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '4' },
            { sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '5' },
            { sectionId: 'b', sectionLabel: 'A (III)', beats: 4, absName: '6' },
            { sectionId: 'b', sectionLabel: 'A (III)', beats: 4, absName: '7' },
            { sectionId: 'b', sectionLabel: 'A (III)', beats: 4, absName: '8' },
        ];

        const sections = buildLeadSheetSections(
            progression,
            [
                { id: 'a', seamless: false },
                { id: 'b', seamless: true },
            ],
            timeSignature,
        );
        const rows = buildLeadSheetRows(sections);

        expect(rows).toHaveLength(2);
        expect(rows[0].measures).toHaveLength(4);
        expect(rows[1].measures).toHaveLength(4);
        expect(rows[1].measures[0].sectionLabel).toBe('A (Tonic)');
        expect(rows[1].measures[0].isSectionStart).toBe(false);
        expect(rows[1].measures[1].sectionLabel).toBe('A (III)');
        expect(rows[1].measures[1].isSectionStart).toBe(true);
        expect(rows[1].measures[1].isSeamlessStart).toBe(true);
    });

    it('reports lead-sheet density from total measure count', () => {
        expect(getLeadSheetDensity(8)).toBe('comfortable');
        expect(getLeadSheetDensity(24)).toBe('compact');
        expect(getLeadSheetDensity(32)).toBe('compact');
        expect(getLeadSheetDensity(33)).toBe('ultra-compact');
    });
});
