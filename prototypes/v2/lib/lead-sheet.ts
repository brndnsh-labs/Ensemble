import type {
    LeadSheetMeasure,
    LeadSheetSectionBlock,
} from '../../../public/song/lead-sheet-model';
import type { SemanticScore } from '../../../public/songbook/score-types';
import type { ArrangerState } from '../../../public/types';

/** Written order stays stable; chord lengths/voicings come from the exact performed map. */
export function scoreLeadSheet(
    arranger: ArrangerState,
    score: SemanticScore,
): LeadSheetSectionBlock[] {
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
    // Do not order the page by first encounter: an authored ending can serve passes
    // 2 and 3 while the physically later branch serves pass 1.
    const blocks: LeadSheetSectionBlock[] = [];
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
            const visit = firstVisits.get(bar.id);
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
