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
            verticalFillMode: 'paper-fill',
            verticalFillScale: 1.56,
            verticalGapScale: 1.12,
            verticalTypeScale: 1.3,
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
            verticalFillMode: 'paper-guided',
            verticalFillScale: 1.04,
            verticalGapScale: 1.03,
            verticalTypeScale: 1.06,
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
            verticalFillMode: 'paper-fill',
            verticalFillScale: 1.45,
            verticalGapScale: 1.12,
            verticalTypeScale: 1.26,
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
            verticalFillMode: 'paper-fill',
            verticalFillScale: 1.3,
            verticalGapScale: 1.09,
            verticalTypeScale: 1.19,
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
            verticalFillMode: 'paper-fit',
            verticalFillScale: 1.22,
            verticalGapScale: 1.06,
            verticalTypeScale: 1.18,
        });
    });
});
