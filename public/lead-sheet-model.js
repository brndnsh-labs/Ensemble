export const LEAD_SHEET_MEASURES_PER_ROW = 4;

const COMPACT_MEASURE_THRESHOLD = 24;
const ULTRA_COMPACT_MEASURE_THRESHOLD = 32;
const LEAD_SHEET_MOBILE_MAX_WIDTH = 700;
const LEAD_SHEET_TABLET_MAX_WIDTH = 1100;
const SHORT_LEAD_SHEET_VIEWPORT_HEIGHT = 720;

/**
 * @param {number} value
 */
function roundLeadSheetScale(value) {
    return Math.round(value * 100) / 100;
}

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

/**
 * @param {number} viewportWidth
 * @returns {'mobile' | 'tablet' | 'desktop'}
 */
export function getLeadSheetViewport(viewportWidth) {
    if (viewportWidth <= LEAD_SHEET_MOBILE_MAX_WIDTH) {
        return 'mobile';
    }

    if (viewportWidth <= LEAD_SHEET_TABLET_MAX_WIDTH) {
        return 'tablet';
    }

    return 'desktop';
}

/**
 * @param {{
 *   totalMeasures: number,
 *   rowCount: number,
 *   viewportWidth?: number,
 *   viewportHeight?: number,
 *   isMaximized?: boolean,
 * }} options
 */
export function getLeadSheetLayoutProfile({
    totalMeasures,
    rowCount,
    viewportWidth = 1280,
    viewportHeight = 800,
    isMaximized = false,
}) {
    const viewport = getLeadSheetViewport(viewportWidth);
    const isShortViewport = viewportHeight < SHORT_LEAD_SHEET_VIEWPORT_HEIGHT;

    let density = getLeadSheetDensity(totalMeasures);

    if (rowCount >= 9 || (viewport === 'mobile' && rowCount >= 8)) {
        density = 'ultra-compact';
    } else if (rowCount >= 6 || (viewport === 'mobile' && rowCount >= 5)) {
        density = 'compact';
    }

    if (isShortViewport && rowCount >= 8) {
        density = 'ultra-compact';
    }

    const fitRowThreshold = isMaximized ? 10 : viewport === 'desktop' ? 8 : 9;
    const scrollMode = rowCount > fitRowThreshold ? 'guided' : 'fit';
    const lookaheadRows =
        scrollMode === 'guided' ? (viewport === 'desktop' && !isShortViewport ? 2 : 1) : 1;
    let verticalFillMode = 'compact';
    let verticalFillScale = 1;
    let verticalGapScale = 1;
    let verticalTypeScale = 1;
    let contentDistribution = 'start';

    if (scrollMode === 'fit') {
        if (rowCount <= 2) {
            verticalFillMode = 'generous';
            verticalFillScale = viewport === 'desktop' ? 1.42 : viewport === 'tablet' ? 1.28 : 1.16;
            verticalGapScale = viewport === 'desktop' ? 1.26 : 1.14;
            verticalTypeScale = viewport === 'desktop' ? 1.22 : viewport === 'tablet' ? 1.14 : 1.08;
            contentDistribution = 'start';
        } else if (rowCount <= 4) {
            verticalFillMode = 'balanced';
            verticalFillScale = viewport === 'desktop' ? 1.2 : viewport === 'tablet' ? 1.12 : 1.06;
            verticalGapScale = viewport === 'desktop' ? 1.14 : 1.08;
            verticalTypeScale = viewport === 'desktop' ? 1.12 : viewport === 'tablet' ? 1.08 : 1.04;
            contentDistribution = 'start';
        } else if (rowCount <= 6 && density === 'comfortable') {
            verticalFillMode = 'balanced';
            verticalFillScale = viewport === 'desktop' ? 1.08 : 1.03;
            verticalGapScale = 1.04;
            verticalTypeScale = viewport === 'desktop' ? 1.05 : 1.02;
            contentDistribution = 'start';
        } else if (viewport === 'desktop' && density === 'compact' && rowCount <= 8) {
            verticalFillMode = 'readable';
            verticalTypeScale = 1.08;
        }
    }

    if (scrollMode === 'fit' && !isShortViewport) {
        const tallViewportThreshold =
            viewport === 'desktop' ? 820 : viewport === 'tablet' ? 780 : 760;
        const extraTallViewportThreshold =
            viewport === 'desktop' ? 900 : viewport === 'tablet' ? 860 : 830;

        if (viewportHeight >= tallViewportThreshold) {
            let fillBoost = 0;
            let gapBoost = 0;
            let typeBoost = 0;

            if (rowCount <= 2) {
                fillBoost = viewport === 'desktop' ? 0.06 : viewport === 'tablet' ? 0.05 : 0.04;
                gapBoost = viewport === 'desktop' ? 0.04 : 0.03;
                typeBoost = viewport === 'desktop' ? 0.04 : 0.03;
            } else if (rowCount <= 4) {
                fillBoost = viewport === 'desktop' ? 0.05 : viewport === 'tablet' ? 0.04 : 0.03;
                gapBoost = viewport === 'desktop' ? 0.03 : 0.02;
                typeBoost = viewport === 'desktop' ? 0.04 : 0.03;
            } else if (rowCount <= 6) {
                fillBoost = viewport === 'desktop' ? 0.04 : 0.03;
                gapBoost = viewport === 'desktop' ? 0.02 : 0.01;
                typeBoost = viewport === 'desktop' ? 0.03 : 0.02;
            } else if (rowCount <= 8) {
                fillBoost = viewport === 'desktop' ? 0.08 : viewport === 'tablet' ? 0.06 : 0.08;
                gapBoost = 0.03;
                typeBoost = viewport === 'desktop' ? 0.07 : viewport === 'tablet' ? 0.05 : 0.08;
                verticalFillMode = verticalFillMode === 'readable' ? 'expanded-readable' : 'fitted';
            }

            if (viewportHeight >= extraTallViewportThreshold) {
                if (rowCount <= 2) {
                    fillBoost += 0.02;
                    gapBoost += 0.01;
                    typeBoost += 0.02;
                } else if (rowCount <= 4) {
                    fillBoost += 0.02;
                    gapBoost += 0.01;
                    typeBoost += 0.02;
                } else if (rowCount <= 6) {
                    fillBoost += 0.02;
                    gapBoost += 0.01;
                    typeBoost += 0.02;
                } else if (rowCount <= 8) {
                    fillBoost += 0.02;
                    gapBoost += 0.01;
                    typeBoost += 0.02;
                }
            }

            if (fillBoost > 0 || gapBoost > 0 || typeBoost > 0) {
                verticalFillScale = roundLeadSheetScale(verticalFillScale + fillBoost);
                verticalGapScale = roundLeadSheetScale(verticalGapScale + gapBoost);
                verticalTypeScale = roundLeadSheetScale(verticalTypeScale + typeBoost);
            }
        }
    }

    if (isShortViewport && scrollMode === 'fit') {
        verticalFillScale = Math.max(1, verticalFillScale - 0.08);
        verticalGapScale = Math.max(1, verticalGapScale - 0.06);
        verticalTypeScale = Math.max(1, verticalTypeScale - 0.05);
    }

    return {
        contentDistribution,
        density,
        lookaheadRows,
        measuresPerRow: LEAD_SHEET_MEASURES_PER_ROW,
        scrollMode,
        viewport,
        verticalFillMode,
        verticalFillScale,
        verticalGapScale,
        verticalTypeScale,
    };
}
