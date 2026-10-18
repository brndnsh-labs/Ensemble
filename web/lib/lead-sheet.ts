import type { SemanticScore } from '../../core/songbook/score-types';
import type { FormattedChordNames } from '../../core/types';

/**
 * What the chart sheet draws for one written event, built by the band's display
 * (`band-chart.ts`) from the score and timeline (no voicing, no step-grid parse).
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
    /** A chord, a hold or no chord. */
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
 * the block before it).
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
