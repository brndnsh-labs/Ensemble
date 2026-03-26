export const LEAD_SHEET_MEASURES_PER_ROW = 4;

const COMPACT_MEASURE_THRESHOLD = 24;
const ULTRA_COMPACT_MEASURE_THRESHOLD = 32;

/**
 * @param {any[]} progression
 * @param {any[]} sectionsState
 * @param {{ beats: number, stepsPerBeat: number }} timeSignatureConfig
 */
export function buildLeadSheetSections(progression, sectionsState, timeSignatureConfig) {
    /** @type {any[]} */
    const blocks = [];
    /** @type {any} */
    let currentBlock = null;
    /** @type {any} */
    let currentMeasure = null;
    let currentMeasureBeats = 0;
    let currentStep = 0;

    progression.forEach((chord, index) => {
        const sectionData = sectionsState.find((section) => section.id === chord.sectionId);
        const isSeamless = Boolean(sectionData?.seamless);
        const isNewSection = !currentBlock || currentBlock.lastSectionId !== chord.sectionId;

        if (isNewSection) {
            if (!currentBlock || !isSeamless) {
                currentBlock = {
                    id: chord.sectionId,
                    label: chord.sectionLabel,
                    measures: [],
                    lastSectionId: chord.sectionId,
                };
                blocks.push(currentBlock);
                currentMeasure = null;
                currentMeasureBeats = 0;
            } else {
                currentBlock.lastSectionId = chord.sectionId;
            }
        }

        if (isNewSection && currentMeasureBeats > 0) {
            currentMeasure = null;
            currentMeasureBeats = 0;
        }

        if (!currentMeasure || currentMeasureBeats >= timeSignatureConfig.beats) {
            currentMeasure = {
                chords: [],
                sectionId: chord.sectionId,
                sectionLabel: chord.sectionLabel,
                startsSection: isNewSection,
                isSeamlessStart: isNewSection && isSeamless,
            };
            currentBlock.measures.push(currentMeasure);
            currentMeasureBeats = 0;
        }

        const durationSteps = Math.round(chord.beats * timeSignatureConfig.stepsPerBeat);
        currentMeasure.chords.push({
            ...chord,
            globalIndex: index,
            start: currentStep,
            end: currentStep + durationSteps,
        });
        currentStep += durationSteps;
        currentMeasureBeats += chord.beats;
    });

    return blocks;
}

/**
 * @param {any[]} sectionBlocks
 * @param {number} [measuresPerRow]
 */
export function buildLeadSheetRows(sectionBlocks, measuresPerRow = LEAD_SHEET_MEASURES_PER_ROW) {
    /** @type {any[]} */
    const rows = [];
    /** @type {any} */
    let currentRow = null;
    let rowCount = 0;

    sectionBlocks.forEach((sectionBlock) => {
        sectionBlock.measures.forEach((/** @type {any} */ measure) => {
            const startsSection = Boolean(measure.startsSection);
            const isSeamlessStart = Boolean(measure.isSeamlessStart);
            const sectionId = measure.sectionId || sectionBlock.id;
            const sectionLabel = measure.sectionLabel || sectionBlock.label;

            const shouldStartNewRow =
                !currentRow ||
                currentRow.measures.length >= measuresPerRow ||
                (startsSection && !isSeamlessStart);

            if (shouldStartNewRow) {
                currentRow = {
                    id: `${sectionId}-row-${rowCount}`,
                    sectionId,
                    sectionLabel,
                    isSectionStart: startsSection,
                    measures: [],
                };
                rows.push(currentRow);
                rowCount += 1;
            }

            currentRow.measures.push({
                ...measure,
                sectionId,
                sectionLabel,
                isSectionStart: startsSection,
                isSeamlessStart,
            });
        });
    });

    return rows;
}

/**
 * @param {number} totalMeasures
 */
export function getLeadSheetDensity(totalMeasures) {
    if (totalMeasures > ULTRA_COMPACT_MEASURE_THRESHOLD) {
        return 'ultra-compact';
    }

    if (totalMeasures >= COMPACT_MEASURE_THRESHOLD) {
        return 'compact';
    }

    return 'comfortable';
}
