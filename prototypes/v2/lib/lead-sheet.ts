import type {
    LeadSheetMeasure,
    LeadSheetSectionBlock,
} from '../../../public/song/lead-sheet-model';
import type { SemanticScore } from '../../../public/songbook/score-types';
import type { ArrangerState, FormattedChordNames } from '../../../public/types';

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

/** Written order stays stable; chord lengths/voicings come from the exact performed map. */
export function scoreLeadSheet(
    arranger: ArrangerState,
    score: SemanticScore,
    written?: ArrangerState,
): LeadSheetSectionBlock[] {
    const unplayed = written
        ? new Map(
              scoreLeadSheet(written, score)
                  .flatMap((block) => block.measures)
                  .map((measure) => [
                      measure.chords[0]?.measureId,
                      {
                          ...measure,
                          chords: measure.chords.map((chord) => ({
                              ...chord,
                              globalIndex: -1 - chord.globalIndex,
                          })),
                      },
                  ]),
          )
        : new Map<string, LeadSheetMeasure>();
    let eventIndex = 0;
    const firstVisits = new Map<string, LeadSheetMeasure>();
    for (const measure of arranger.measureMap) {
        const first = arranger.stepMap[eventIndex]?.chord;
        const chords = [];
        while (
            eventIndex < arranger.stepMap.length &&
            arranger.stepMap[eventIndex].start < measure.end
        ) {
            const event = arranger.stepMap[eventIndex];
            if (first?.measureId && !firstVisits.has(first.measureId)) {
                chords.push({
                    ...event.chord,
                    start: event.start,
                    end: event.end,
                    globalIndex: eventIndex,
                });
            }
            eventIndex++;
        }
        if (first?.measureId && !firstVisits.has(first.measureId)) {
            firstVisits.set(first.measureId, {
                chords,
                sectionId: first.sectionId,
                sectionLabel: first.sectionLabel,
                startsSection: false,
                isSeamlessStart: false,
            });
        }
    }
    return writtenBlocks(score, (id) => firstVisits.get(id) ?? unplayed.get(id));
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

/** Map every performed event to the first visit of its written bar/event slot. */
export function scoreDisplayIndices(arranger: ArrangerState): number[] {
    const firstVisits = new Map<string, number>();
    let barStart = 0;
    let previousId: string | undefined;
    let measureIndex = 0;
    return arranger.stepMap.map((event, index) => {
        while (
            measureIndex + 1 < arranger.measureMap.length &&
            event.start >= arranger.measureMap[measureIndex].end
        ) {
            measureIndex++;
            previousId = undefined;
        }
        const id = event.chord.measureId;
        if (id !== previousId) {
            previousId = id;
            barStart = index;
        }
        const key = `${id}:${index - barStart}`;
        if (!firstVisits.has(key)) {
            firstVisits.set(key, index);
        }
        return firstVisits.get(key)!;
    });
}
