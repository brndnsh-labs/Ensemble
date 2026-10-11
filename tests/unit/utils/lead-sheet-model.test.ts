import { describe, expect, it } from 'vitest';

import { buildLeadSheetSections } from '../../../public/song/lead-sheet-model.js';
import { makeChord } from '../../utils/chord-fixture.js';

describe('lead-sheet-model', () => {
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

    // S8: chart layout must depend on measure count, never on the time
    // signature. The same progression-shape (N bars, K chords per bar) must
    // produce the same measure count in any meter. The bug: `buildLeadSheetSections`
    // closes a measure when `currentMeasureBeats >= timeSignatureConfig.beats`, and per-chord
    // beats are `ts.beats / chordsPerBar`. In 4/4 a 6-chord bar gives 4/6 each,
    // and 4/6 × 6 = 3.9999999999999996 < 4 (float error), so the measure fails
    // to close at the bar line and the next bar's first chord bleeds into it —
    // drifting the measure count (12 bars → 11 measures). In 6/8 the same shape
    // gives 1.0 each (exact), sums to 6.0, closes cleanly → 12 measures.
    // Switching 4/4 → 6/8 on such a progression shifted the measure count, and
    // with it the chart's density. (Whether a chord-count triggers it depends on
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

        it('yields the same measure count across meters for a 6-chord-per-bar progression', () => {
            const bars = 16;
            const measures44 = measureCount(bars, 6, FOUR_FOUR);
            const measures68 = measureCount(bars, 6, SIX_EIGHT);

            expect(measures44).toBe(bars);
            expect(measures68).toBe(bars);
            expect(measures44).toBe(measures68);
        });
    });
});
