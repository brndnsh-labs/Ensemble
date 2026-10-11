import { TIME_SIGNATURES } from '../config.js';
import type { Chord, Section } from '../types.js';

// Tolerance for the per-bar beat accumulator. Per-chord beats are
// `ts.beats / chordsPerBar`, which is often not exactly representable in f64
// (e.g. 4/6 × 6 = 3.9999999999999996 < 4). A strict `>= ts.beats` comparison
// then fails to close the measure at the bar line, so the next bar's chords
// bleed in and the measure count drifts — differently per meter, which made
// chart density shift on 4/4 ↔ 6/8 switches. Tolerate sub-beat float drift.
const MEASURE_BEATS_EPSILON = 1e-6;

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
    let currentMeterConfig = timeSignatureConfig;

    progression.forEach((chord, index) => {
        const sectionData = sectionsState.find((section) => section.id === chord.sectionId);
        // validateProgression stamps every placed chord with its section-local meter.
        // The fallback preserves the model's small test/legacy-input surface, whose
        // chord fixtures predate that required runtime field. Grouping does not change
        // either value used here (beats or stepsPerBeat), so the canonical table is the
        // right authority for a section override while the caller's effective config
        // remains the authority for the global meter.
        const localMeterConfig =
            (chord.timeSignature && TIME_SIGNATURES[chord.timeSignature]) ||
            (sectionData?.timeSignature && TIME_SIGNATURES[sectionData.timeSignature]) ||
            timeSignatureConfig;
        const isSeamless = Boolean(sectionData?.seamless);
        const isNewSection = !currentBlock || currentBlock.lastSectionId !== chord.sectionId;
        const meterChanged = localMeterConfig !== currentMeterConfig;

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

        if ((isNewSection || meterChanged) && currentMeasureBeats > 0) {
            currentMeasure = null;
            currentMeasureBeats = 0;
        }
        currentMeterConfig = localMeterConfig;

        // By here a block always exists: when `isNewSection` is false, the
        // truthiness check at line ~327 proves `currentBlock` was already set;
        // when true, the branch above assigned one. tsc can't narrow across the
        // `forEach` closure, so capture it into a non-null local.
        if (!currentBlock) {
            return;
        }

        if (
            !currentMeasure ||
            currentMeasureBeats >= localMeterConfig.beats - MEASURE_BEATS_EPSILON
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

        const durationSteps = Math.round(chord.beats * localMeterConfig.stepsPerBeat);
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
