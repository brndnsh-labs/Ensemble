import type { LeadSheetSectionBlock } from '@engine/song/lead-sheet-model';
import type { ArrangerState } from '@engine/types';

/** Display the exact compiled map sent to the worker, without re-counting chord text. */
export function scoreLeadSheet(arranger: ArrangerState): LeadSheetSectionBlock[] {
    let eventIndex = 0;
    let measureIndex = 0;
    const blocks: LeadSheetSectionBlock[] = [];
    for (const section of arranger.sectionMap) {
        const seamless = !!arranger.sections.find((written) => written.id === section.id)?.seamless;
        const block: LeadSheetSectionBlock = (seamless && blocks.at(-1)) || {
            id: section.id,
            label: section.label,
            measures: [],
        };
        if (block !== blocks.at(-1)) {
            blocks.push(block);
        }
        while (
            measureIndex < arranger.measureMap.length &&
            arranger.measureMap[measureIndex].start < section.end
        ) {
            const measure = arranger.measureMap[measureIndex++];
            const chords = [];
            while (
                eventIndex < arranger.stepMap.length &&
                arranger.stepMap[eventIndex].start < measure.end
            ) {
                const event = arranger.stepMap[eventIndex];
                chords.push({
                    ...event.chord,
                    start: event.start,
                    end: event.end,
                    globalIndex: eventIndex++,
                });
            }
            block.measures.push({
                chords,
                sectionId: section.id,
                sectionLabel: section.label,
                startsSection: measure.start === section.start,
                isSeamlessStart: seamless && measure.start === section.start,
            });
        }
    }
    return blocks;
}
