import { describe, expect, it } from 'vitest';

import {
    buildLeadSheetRows,
    buildLeadSheetSections,
    getLeadSheetDensity,
    getLeadSheetLayoutProfile,
    getLeadSheetViewport,
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

    it('classifies lead-sheet viewports by width', () => {
        expect(getLeadSheetViewport(390)).toBe('mobile');
        expect(getLeadSheetViewport(900)).toBe('tablet');
        expect(getLeadSheetViewport(1440)).toBe('desktop');
    });

    it('uses tall-viewport fill for dense mobile charts that still fit', () => {
        expect(
            getLeadSheetLayoutProfile({
                totalMeasures: 32,
                rowCount: 8,
                viewportWidth: 390,
                viewportHeight: 844,
                isMaximized: false,
            }),
        ).toMatchObject({
            density: 'ultra-compact',
            lookaheadRows: 1,
            measuresPerRow: 4,
            scrollMode: 'fit',
            viewport: 'mobile',
            verticalFillMode: 'fitted',
            verticalFillScale: 1.1,
            verticalGapScale: 1.04,
            verticalTypeScale: 1.1,
        });
    });

    it('keeps guided desktop standards in compact mode before falling to ultra-compact', () => {
        expect(
            getLeadSheetLayoutProfile({
                totalMeasures: 36,
                rowCount: 9,
                viewportWidth: 1440,
                viewportHeight: 900,
                isMaximized: false,
            }),
        ).toMatchObject({
            density: 'compact',
            lookaheadRows: 2,
            measuresPerRow: 4,
            scrollMode: 'guided',
            viewport: 'desktop',
            verticalFillMode: 'compact',
            verticalFillScale: 1,
            verticalGapScale: 1,
            verticalTypeScale: 1,
        });
    });

    it('switches long desktop charts into guided scrolling with lookahead', () => {
        expect(
            getLeadSheetLayoutProfile({
                totalMeasures: 48,
                rowCount: 12,
                viewportWidth: 1440,
                viewportHeight: 900,
                isMaximized: false,
            }),
        ).toMatchObject({
            density: 'ultra-compact',
            lookaheadRows: 2,
            measuresPerRow: 4,
            scrollMode: 'guided',
            viewport: 'desktop',
            verticalFillMode: 'compact',
            verticalFillScale: 1,
            verticalGapScale: 1,
            verticalTypeScale: 1,
        });
    });

    it('uses capped vertical fill for short charts that already fit', () => {
        expect(
            getLeadSheetLayoutProfile({
                totalMeasures: 8,
                rowCount: 2,
                viewportWidth: 1440,
                viewportHeight: 900,
                isMaximized: false,
            }),
        ).toMatchObject({
            density: 'comfortable',
            scrollMode: 'fit',
            viewport: 'desktop',
            verticalFillMode: 'generous',
            verticalFillScale: 1.5,
            verticalGapScale: 1.31,
            verticalTypeScale: 1.28,
        });
    });

    it('keeps medium-length fit charts top-anchored instead of vertically centering them', () => {
        expect(
            getLeadSheetLayoutProfile({
                totalMeasures: 16,
                rowCount: 4,
                viewportWidth: 1440,
                viewportHeight: 900,
                isMaximized: false,
            }),
        ).toMatchObject({
            density: 'comfortable',
            scrollMode: 'fit',
            viewport: 'desktop',
            verticalFillMode: 'balanced',
            verticalFillScale: 1.27,
            verticalGapScale: 1.18,
            verticalTypeScale: 1.18,
        });
    });

    it('stretches compact desktop charts vertically when they fit on tall screens', () => {
        expect(
            getLeadSheetLayoutProfile({
                totalMeasures: 32,
                rowCount: 8,
                viewportWidth: 1440,
                viewportHeight: 900,
                isMaximized: false,
            }),
        ).toMatchObject({
            density: 'compact',
            scrollMode: 'fit',
            viewport: 'desktop',
            verticalFillMode: 'expanded-readable',
            verticalFillScale: 1.1,
            verticalGapScale: 1.04,
            verticalTypeScale: 1.17,
        });
    });
});
