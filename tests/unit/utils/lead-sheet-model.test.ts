import { describe, expect, it } from 'vitest';

import {
    buildLeadSheetRows,
    buildLeadSheetSections,
    getLeadSheetDensity,
    getLeadSheetLayoutProfile,
    getLeadSheetViewport,
} from '../../../public/song/lead-sheet-model.js';
import { makeChord } from '../../utils/chord-fixture.js';

describe('lead-sheet-model', () => {
    const timeSignature = { beats: 4, stepsPerBeat: 4 };

    it('chunks sections into continuous four-measure rows', () => {
        const progression = Array.from({ length: 8 }, (_, index) =>
            makeChord({
                sectionId: 'a',
                sectionLabel: 'A',
                beats: 4,
                absName: `Chord ${index + 1}`,
            }),
        );

        const sections = buildLeadSheetSections(
            progression,
            [{ id: 'a', label: 'A', value: '', seamless: false }],
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
            makeChord({ sectionId: 'a', sectionLabel: 'A', beats: 4, absName: 'I' }),
            makeChord({ sectionId: 'a', sectionLabel: 'A', beats: 4, absName: 'IV' }),
            makeChord({ sectionId: 'b', sectionLabel: 'B', beats: 4, absName: 'V' }),
            makeChord({ sectionId: 'b', sectionLabel: 'B', beats: 4, absName: 'I' }),
        ];

        const sections = buildLeadSheetSections(
            progression,
            [
                { id: 'a', label: 'A', value: '', seamless: false },
                { id: 'b', label: 'B', value: '', seamless: false },
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
            makeChord({ sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '1' }),
            makeChord({ sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '2' }),
            makeChord({ sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '3' }),
            makeChord({ sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '4' }),
            makeChord({ sectionId: 'a', sectionLabel: 'A (Tonic)', beats: 4, absName: '5' }),
            makeChord({ sectionId: 'b', sectionLabel: 'A (III)', beats: 4, absName: '6' }),
            makeChord({ sectionId: 'b', sectionLabel: 'A (III)', beats: 4, absName: '7' }),
            makeChord({ sectionId: 'b', sectionLabel: 'A (III)', beats: 4, absName: '8' }),
        ];

        const sections = buildLeadSheetSections(
            progression,
            [
                { id: 'a', label: 'A', value: '', seamless: false },
                { id: 'b', label: 'B', value: '', seamless: true },
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

    it('builds measure bounds and chord timing from each section-local meter', () => {
        const sections = buildLeadSheetSections(
            [
                makeChord({
                    sectionId: 'odd',
                    sectionLabel: 'Odd',
                    beats: 7,
                    timeSignature: '7/8',
                    absName: 'Dm',
                }),
                makeChord({
                    sectionId: 'four',
                    sectionLabel: 'Four',
                    beats: 4,
                    timeSignature: '4/4',
                    absName: 'G',
                }),
            ],
            [
                { id: 'odd', label: 'Odd', value: '', seamless: false, timeSignature: '7/8' },
                { id: 'four', label: 'Four', value: '', seamless: false, timeSignature: '4/4' },
            ],
            { beats: 7, stepsPerBeat: 2 },
        );

        expect(sections).toHaveLength(2);
        expect(sections[0].measures[0].chords[0]).toMatchObject({ start: 0, end: 14 });
        expect(sections[1].measures[0].chords[0]).toMatchObject({ start: 14, end: 30 });
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

    // S8: chart layout must depend on measure count + viewport, never on the
    // time signature. The same progression-shape (N bars, K chords per bar)
    // must produce the same measure count — and therefore the same layout
    // profile — in any meter. The bug: `buildLeadSheetSections` closes a measure
    // when `currentMeasureBeats >= timeSignatureConfig.beats`, and per-chord
    // beats are `ts.beats / chordsPerBar`. In 4/4 a 6-chord bar gives 4/6 each,
    // and 4/6 × 6 = 3.9999999999999996 < 4 (float error), so the measure fails
    // to close at the bar line and the next bar's first chord bleeds into it —
    // drifting the measure count (12 bars → 11 measures). In 6/8 the same shape
    // gives 1.0 each (exact), sums to 6.0, closes cleanly → 12 measures.
    // Switching 4/4 → 6/8 on such a progression shifted the measure count,
    // hence the density/layout. (Whether a chord-count triggers it depends on
    // the meter, so the comparison must tolerate float drift, not the shape.)
    describe('TS-invariant measure grouping (S8)', () => {
        const buildShape = (bars: number, chordsPerBar: number, tsBeats: number) =>
            Array.from({ length: bars * chordsPerBar }, (_, index) =>
                makeChord({
                    sectionId: 'a',
                    sectionLabel: 'A',
                    beats: tsBeats / chordsPerBar,
                    absName: `Chord ${index + 1}`,
                }),
            );

        const measureCount = (
            bars: number,
            chordsPerBar: number,
            ts: { beats: number; stepsPerBeat: number },
        ) =>
            buildLeadSheetSections(
                buildShape(bars, chordsPerBar, ts.beats),
                [{ id: 'a', label: 'A', value: '', seamless: false }],
                ts,
            ).reduce((total, block) => total + block.measures.length, 0);

        const FOUR_FOUR = { beats: 4, stepsPerBeat: 4 };
        const SIX_EIGHT = { beats: 6, stepsPerBeat: 2 };

        it('groups one bar into exactly one measure regardless of chords-per-bar or meter', () => {
            for (const ts of [FOUR_FOUR, SIX_EIGHT]) {
                for (const chordsPerBar of [1, 2, 3, 4, 5, 6, 7, 8]) {
                    expect(
                        measureCount(12, chordsPerBar, ts),
                        `${ts.beats}-beat bar with ${chordsPerBar} chords/bar`,
                    ).toBe(12);
                }
            }
        });

        it('yields the same measure count (and layout) across meters for a 6-chord-per-bar progression', () => {
            const bars = 16;
            const measures44 = measureCount(bars, 6, FOUR_FOUR);
            const measures68 = measureCount(bars, 6, SIX_EIGHT);

            expect(measures44).toBe(bars);
            expect(measures68).toBe(bars);
            expect(measures44).toBe(measures68);

            const layoutFor = (totalMeasures: number) =>
                getLeadSheetLayoutProfile({
                    totalMeasures,
                    rowCount: Math.ceil(totalMeasures / 4),
                    viewportWidth: 1440,
                    viewportHeight: 900,
                });
            expect(layoutFor(measures44)).toEqual(layoutFor(measures68));
        });
    });
});
