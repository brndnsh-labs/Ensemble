import type { SemanticScore } from '../../../public/songbook/score-types';
import type { FormattedChordNames } from '../../../public/types';

/**
 * What the chart sheet draws for one written event. The old engine's `LeadSheetChord` satisfies
 * it as-is; the band engine's display (`band-chart.ts`) builds it from the score and timeline
 * without pretending to be an old-engine `Chord` (no voicing, no step-grid parse).
 */
export interface ChartChord {
    /** Display identity, and what a tap auditions. Negative = a bar the form never reaches. */
    globalIndex: number;
    /** Sixteenth steps (fractional for off-grid lengths); the width is `end - start`. */
    start: number;
    end: number;
    measureId?: string;
    sectionId?: string;
    key: string;
    keyIsMinor?: boolean;
    timeSignature: string;
    absName: string;
    display?: FormattedChordNames;
    /** Absent on the old engine, which can only ever show chords. */
    kind?: 'chord' | 'hold' | 'no-chord';
    fermata?: boolean;
}

export interface ChartMeasure {
    chords: ChartChord[];
    sectionId?: string;
    sectionLabel?: string;
    startsSection: boolean;
    isSeamlessStart: boolean;
}

export interface ChartBlock {
    id?: string;
    label?: string;
    measures: ChartMeasure[];
}

/**
 * Lay the written bars out in written order, one block per section (a seamless section joins
 * the block before it). Shared by both engines' displays.
 */
export function writtenBlocks<M extends ChartMeasure>(
    score: SemanticScore,
    measureOf: (barId: string) => M | undefined,
): { id: string; label: string; measures: M[] }[] {
    // Do not order the page by first encounter: an authored ending can serve passes
    // 2 and 3 while the physically later branch serves pass 1.
    const blocks: { id: string; label: string; measures: M[] }[] = [];
    for (const section of score.sections) {
        const block = (section.seamless && blocks.at(-1)) || {
            id: section.id,
            label: section.label,
            measures: [],
        };
        if (block !== blocks.at(-1)) {
            blocks.push(block);
        }
        for (const [index, bar] of section.measures.entries()) {
            const visit = measureOf(bar.id);
            if (!visit) {
                throw new Error('The written chart contains an unreachable measure.');
            }
            block.measures.push({
                ...visit,
                startsSection: index === 0,
                isSeamlessStart: !!section.seamless && index === 0,
            });
        }
    }
    return blocks;
}

/**
 * Every written event's `globalIndex`, bucketed by which WRITTEN MEASURE it belongs to (an
 * ordinal position among every measure in `blocks`, in written order). This is a measure-less
 * (v1) chart's only notion of "performed bar" — v1 has no repeat/ending marks (`ScoreDirection`
 * is a schemaVersion-2 concept only), so its performance is one straight pass and "written
 * measure" and "performed bar" name the exact same thing there. For a schemaVersion-2 chart,
 * `BandSlot.bar` (`band-chart.ts`) is the real performed-bar identity instead — see
 * `nextBarIndex`'s doc (`app/use-chart-view.ts`) for why the two must NOT be conflated.
 */
export function measureOfGlobalIndex(blocks: ChartBlock[]): Map<number, number> {
    const map = new Map<number, number>();
    let m = 0;
    for (const block of blocks) {
        for (const measure of block.measures) {
            for (const chord of measure.chords) {
                map.set(chord.globalIndex, m);
            }
            m += 1;
        }
    }
    return map;
}
