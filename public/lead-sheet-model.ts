import type { Chord, Section } from './types.js';

const LEAD_SHEET_MEASURES_PER_ROW = 4;

// Tolerance for the per-bar beat accumulator. Per-chord beats are
// `ts.beats / chordsPerBar`, which is often not exactly representable in f64
// (e.g. 4/6 × 6 = 3.9999999999999996 < 4). A strict `>= ts.beats` comparison
// then fails to close the measure at the bar line, so the next bar's chords
// bleed in and the measure count drifts — differently per meter, which made
// chart density shift on 4/4 ↔ 6/8 switches. Tolerate sub-beat float drift.
const MEASURE_BEATS_EPSILON = 1e-6;

const COMPACT_MEASURE_THRESHOLD = 24;
const ULTRA_COMPACT_MEASURE_THRESHOLD = 32;
const LEAD_SHEET_MOBILE_MAX_WIDTH = 700;
const LEAD_SHEET_TABLET_MAX_WIDTH = 1100;
const SHORT_LEAD_SHEET_VIEWPORT_HEIGHT = 720;

type Density = 'comfortable' | 'compact' | 'ultra-compact';
type Viewport = 'mobile' | 'tablet' | 'desktop';
type ScrollMode = 'fit' | 'guided';

const LEAD_SHEET_FIT_ROW_BUDGET: Record<Density, Record<Viewport, number>> = {
    comfortable: {
        desktop: 88,
        mobile: 68,
        tablet: 78,
    },
    compact: {
        desktop: 64,
        mobile: 52,
        tablet: 60,
    },
    'ultra-compact': {
        desktop: 58,
        mobile: 44,
        tablet: 50,
    },
};

function roundLeadSheetScale(value: number): number {
    return Math.round(value * 100) / 100;
}

function clampLeadSheetScale(value: number, min: number, max: number): number {
    return roundLeadSheetScale(Math.min(max, Math.max(min, value)));
}

function getLeadSheetLayoutDensity({
    totalMeasures,
    rowCount,
    viewport,
    scrollMode,
    isShortViewport,
}: {
    totalMeasures: number;
    rowCount: number;
    viewport: Viewport;
    scrollMode: ScrollMode;
    isShortViewport: boolean;
}): Density {
    const compactRowThreshold = viewport === 'mobile' ? 5 : 6;
    const ultraRowThreshold =
        scrollMode === 'guided' ? (viewport === 'mobile' ? 10 : 12) : viewport === 'mobile' ? 8 : 9;
    const ultraMeasureThreshold = scrollMode === 'guided' ? 48 : ULTRA_COMPACT_MEASURE_THRESHOLD;

    let density: Density =
        totalMeasures >= COMPACT_MEASURE_THRESHOLD || rowCount >= compactRowThreshold
            ? 'compact'
            : 'comfortable';

    if (
        totalMeasures > ultraMeasureThreshold ||
        rowCount >= ultraRowThreshold ||
        (isShortViewport && rowCount >= 8)
    ) {
        density = 'ultra-compact';
    }

    return density;
}

function getLeadSheetRowWidth({
    viewport,
    rowCount,
    scrollMode,
    containerWidth,
}: {
    viewport: Viewport;
    rowCount: number;
    scrollMode: ScrollMode;
    containerWidth: number;
}): number {
    if (viewport === 'mobile') {
        return Math.max(0, Math.round(containerWidth - 6));
    }

    if (viewport === 'tablet') {
        if (scrollMode === 'guided') {
            return Math.round(
                Math.min(Math.max(containerWidth * 0.98, 720), Math.min(containerWidth, 920)),
            );
        }

        const widthScale = rowCount >= 8 ? 0.97 : rowCount >= 4 ? 0.94 : 0.9;
        const minWidth = rowCount >= 8 ? 720 : 680;
        const maxWidth = rowCount >= 8 ? 900 : rowCount >= 4 ? 860 : 820;

        return Math.round(
            Math.min(
                Math.max(containerWidth * widthScale, minWidth),
                Math.min(containerWidth, maxWidth),
            ),
        );
    }

    if (scrollMode === 'guided') {
        const widthScale = rowCount >= 9 ? 0.96 : 0.97;
        const minWidth = rowCount >= 9 ? 920 : 900;
        const maxWidth = rowCount >= 9 ? 980 : 1000;

        return Math.round(
            Math.min(
                Math.max(containerWidth * widthScale, minWidth),
                Math.min(containerWidth, maxWidth),
            ),
        );
    }

    const widthScale = rowCount >= 8 ? 0.93 : rowCount >= 4 ? 0.89 : 0.83;
    const minWidth = rowCount >= 8 ? 900 : rowCount >= 4 ? 820 : 760;
    const maxWidth = rowCount >= 8 ? 960 : rowCount >= 4 ? 920 : 860;

    return Math.round(
        Math.min(
            Math.max(containerWidth * widthScale, minWidth),
            Math.min(containerWidth, maxWidth),
        ),
    );
}

function getLeadSheetFitSizing({
    viewport,
    rowCount,
    density,
    availableHeight,
    isShortViewport,
}: {
    viewport: Viewport;
    rowCount: number;
    density: Density;
    availableHeight: number;
    isShortViewport: boolean;
}) {
    const baseBudget = LEAD_SHEET_FIT_ROW_BUDGET[density][viewport];
    const shortViewportPenalty =
        isShortViewport && viewport === 'mobile' ? 0.12 : isShortViewport ? 0.08 : 0;
    const fillCap =
        viewport === 'mobile'
            ? rowCount >= 8
                ? 1.56
                : rowCount >= 4
                  ? 1.42
                  : 1.3
            : viewport === 'tablet'
              ? rowCount >= 8
                  ? 1.3
                  : rowCount >= 4
                    ? 1.24
                    : 1.18
              : rowCount >= 8
                ? 1.22
                : rowCount >= 4
                  ? 1.3
                  : 1.45;
    const fillScale = clampLeadSheetScale(
        availableHeight / Math.max(1, rowCount * baseBudget) - shortViewportPenalty,
        1,
        fillCap,
    );
    const gapBonus = rowCount <= 4 ? 0.04 : rowCount >= 8 ? 0.02 : 0.03;
    const gapScale = clampLeadSheetScale(
        1 + Math.max(0, (fillScale - 1) * (viewport === 'mobile' ? 0.22 : 0.18) + gapBonus),
        1,
        viewport === 'mobile' ? 1.12 : 1.18,
    );
    const typeBonus =
        rowCount <= 4 ? 0.04 : rowCount >= 8 ? (viewport === 'desktop' ? 0.04 : 0.02) : 0.03;
    const typeWeight = viewport === 'mobile' ? 0.62 : rowCount >= 8 ? 0.65 : 0.5;
    const typeScale = clampLeadSheetScale(
        1 + Math.max(0, (fillScale - 1) * typeWeight + typeBonus),
        1,
        viewport === 'mobile' ? 1.3 : rowCount >= 8 ? 1.2 : rowCount <= 2 ? 1.3 : 1.24,
    );
    const mode =
        fillScale >= (viewport === 'mobile' ? 1.42 : 1.24)
            ? 'paper-fill'
            : fillScale >= 1.12
              ? 'paper-fit'
              : 'paper-balanced';

    return {
        mode,
        verticalFillScale: fillScale,
        verticalGapScale: gapScale,
        verticalTypeScale: typeScale,
    };
}

function getLeadSheetGuidedSizing({
    viewport,
    rowCount,
    density,
    isShortViewport,
}: {
    viewport: Viewport;
    rowCount: number;
    density: Density;
    isShortViewport: boolean;
}) {
    if (isShortViewport) {
        return {
            mode: 'compact',
            verticalFillScale: 1,
            verticalGapScale: 1,
            verticalTypeScale: 1,
        };
    }

    if (viewport === 'desktop' && density === 'compact' && rowCount <= 10) {
        return {
            mode: 'paper-guided',
            verticalFillScale: 1.04,
            verticalGapScale: 1.03,
            verticalTypeScale: 1.06,
        };
    }

    if (viewport === 'tablet' && rowCount <= 10) {
        return {
            mode: 'paper-guided',
            verticalFillScale: 1.04,
            verticalGapScale: 1.03,
            verticalTypeScale: 1.05,
        };
    }

    if (viewport === 'mobile' && rowCount <= 12) {
        return {
            mode: 'paper-guided',
            verticalFillScale: density === 'ultra-compact' ? 1.06 : 1.08,
            verticalGapScale: 1.03,
            verticalTypeScale: density === 'ultra-compact' ? 1.08 : 1.1,
        };
    }

    return {
        mode: 'compact',
        verticalFillScale: 1,
        verticalGapScale: 1,
        verticalTypeScale: 1,
    };
}

/**
 * A chord as placed on the lead sheet: the canonical {@link Chord} plus the
 * positional fields the builder tags on (`globalIndex` is the chord's index in
 * the flat progression; `start`/`end` are step offsets within the chart).
 */
export interface LeadSheetChord extends Chord {
    globalIndex: number;
    start: number;
    end: number;
}

/**
 * One measure (bar) of the lead sheet — the chords that fall inside it plus the
 * section context carried down from the owning block.
 */
export interface LeadSheetMeasure {
    chords: LeadSheetChord[];
    sectionId?: string;
    sectionLabel?: string;
    startsSection: boolean;
    isSeamlessStart: boolean;
}

/**
 * A contiguous run of measures belonging to one section. `lastSectionId` tracks
 * the section the block currently extends (seamless sections fold into the
 * previous block, so it can differ from `id`).
 */
export interface LeadSheetSectionBlock {
    id?: string;
    label?: string;
    measures: LeadSheetMeasure[];
    lastSectionId?: string;
}

/**
 * One rendered row of the lead sheet — up to `measuresPerRow` measures, with the
 * row-resolved section context (`measure.sectionId || block.id`; both sources are
 * optional, so the resolved value can still be undefined).
 */
export interface LeadSheetRow {
    id: string;
    /** Resolved from the measure, falling back to the block id (which is itself optional). */
    sectionId?: string;
    sectionLabel?: string;
    isSectionStart: boolean;
    measures: LeadSheetRowMeasure[];
}

/**
 * A measure as placed in a row — a {@link LeadSheetMeasure} with the row-resolved
 * section context re-stamped on and an `isSectionStart` flag.
 */
export interface LeadSheetRowMeasure extends LeadSheetMeasure {
    isSectionStart: boolean;
}

export function buildLeadSheetSections(
    progression: Chord[],
    sectionsState: Section[],
    timeSignatureConfig: { beats: number; stepsPerBeat: number },
): LeadSheetSectionBlock[] {
    const blocks: LeadSheetSectionBlock[] = [];
    let currentBlock: LeadSheetSectionBlock | null = null;
    let currentMeasure: LeadSheetMeasure | null = null;
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

        // By here a block always exists: when `isNewSection` is false, the
        // truthiness check at line ~327 proves `currentBlock` was already set;
        // when true, the branch above assigned one. tsc can't narrow across the
        // `forEach` closure, so capture it into a non-null local.
        if (!currentBlock) {
            return;
        }

        if (
            !currentMeasure ||
            currentMeasureBeats >= timeSignatureConfig.beats - MEASURE_BEATS_EPSILON
        ) {
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

export function buildLeadSheetRows(
    sectionBlocks: LeadSheetSectionBlock[],
    measuresPerRow = LEAD_SHEET_MEASURES_PER_ROW,
): LeadSheetRow[] {
    const rows: LeadSheetRow[] = [];
    let currentRow: LeadSheetRow | null = null;
    let rowCount = 0;

    sectionBlocks.forEach((sectionBlock) => {
        sectionBlock.measures.forEach((measure) => {
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

            // A row always exists here: `shouldStartNewRow` is true whenever
            // `currentRow` is null (and assigns one), so the else path can only
            // run with a row already set. tsc can't narrow across the closure.
            if (!currentRow) {
                return;
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

export function getLeadSheetDensity(totalMeasures: number): Density {
    if (totalMeasures > ULTRA_COMPACT_MEASURE_THRESHOLD) {
        return 'ultra-compact';
    }

    if (totalMeasures >= COMPACT_MEASURE_THRESHOLD) {
        return 'compact';
    }

    return 'comfortable';
}

export function getLeadSheetViewport(viewportWidth: number): Viewport {
    if (viewportWidth <= LEAD_SHEET_MOBILE_MAX_WIDTH) {
        return 'mobile';
    }

    if (viewportWidth <= LEAD_SHEET_TABLET_MAX_WIDTH) {
        return 'tablet';
    }

    return 'desktop';
}

export function getLeadSheetLayoutProfile({
    totalMeasures,
    rowCount,
    viewportWidth = 1280,
    viewportHeight = 800,
    containerWidth = viewportWidth,
    containerHeight = viewportHeight,
}: {
    totalMeasures: number;
    rowCount: number;
    viewportWidth?: number;
    viewportHeight?: number;
    containerWidth?: number;
    containerHeight?: number;
}) {
    const viewport = getLeadSheetViewport(viewportWidth);
    const isShortViewport = viewportHeight < SHORT_LEAD_SHEET_VIEWPORT_HEIGHT;
    const availableHeight = Math.max(0, containerHeight);
    const fitRowThreshold = viewport === 'desktop' ? 8 : 9;
    const scrollMode: ScrollMode = rowCount > fitRowThreshold ? 'guided' : 'fit';
    const rowWidth = getLeadSheetRowWidth({
        viewport,
        rowCount,
        scrollMode,
        containerWidth,
    });
    const density = getLeadSheetLayoutDensity({
        totalMeasures,
        rowCount,
        viewport,
        scrollMode,
        isShortViewport,
    });
    const lookaheadRows =
        scrollMode === 'guided' ? (viewport === 'desktop' && !isShortViewport ? 2 : 1) : 1;
    const {
        mode: verticalFillMode,
        verticalFillScale,
        verticalGapScale,
        verticalTypeScale,
    } = scrollMode === 'fit'
        ? getLeadSheetFitSizing({
              viewport,
              rowCount,
              density,
              availableHeight,
              isShortViewport,
          })
        : getLeadSheetGuidedSizing({
              viewport,
              rowCount,
              density,
              isShortViewport,
          });

    return {
        density,
        lookaheadRows,
        measuresPerRow: LEAD_SHEET_MEASURES_PER_ROW,
        rowWidth,
        scrollMode,
        viewport,
        verticalFillMode,
        verticalFillScale,
        verticalGapScale,
        verticalTypeScale,
    };
}
