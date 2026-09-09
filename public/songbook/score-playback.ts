import { TIME_SIGNATURES, type TimeSignatureConfig } from '../config.js';
import { getEffectiveTimeSignature } from '../meter.js';
import type { ArrangerState, Chord, EnsembleState, Section } from '../types.js';
import { validateSemanticScore } from './score-codec.js';
import { resolveScoreContext } from './score-context.js';
import { durationToSteps, scoreMeter } from './score-duration.js';
import { compileScoreForm, type ScoreFormVisit } from './score-form.js';
import type { SemanticScore } from './score-types.js';

/** A derived, bounded performance input. Never a document or persistence authority. */
export interface ScorePlaybackPlan {
    sections: {
        section: Section;
        visits: ScoreFormVisit[];
        measures: {
            id: string;
            key: string;
            isMinor: boolean;
            meter: string;
            config: TimeSignatureConfig;
            symbols: string[];
            steps: number[];
        }[];
    }[];
}

// This adapter deliberately exposes only qualities the existing voicing engine resolves
// completely. The authored codec has a wider vocabulary; accepting it is not playback parity.
const PLAYABLE_CHORD =
    /^(?:[#b]?(?:III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|[#b]?[1-7]|[A-Ga-g][#b]?)(?:maj7|m7b5|m13|m11|m9|m7|m6|m|dim7|dim|7#5|7b5|7b9|7#9|7#11|7b13|sus4|sus2|add9|13|11|9|7|6|5)?(?:\/(?:[#b]?(?:III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|[#b]?[1-7]|[A-Ga-g][#b]?))?$/;

/** Validate the entire score and its current playback capabilities before changing live state. */
export function prepareScorePlayback(candidate: unknown): ScorePlaybackPlan {
    const checked = validateSemanticScore(candidate);
    if (checked.kind !== 'ok') {
        throw new Error('The chart is invalid; its source has not been changed.');
    }
    const score = checked.value;
    const itinerary = compileScoreForm(score);
    let performedEvents = 0;
    let performedMeasures = 0;
    let performedSteps = 0;
    return {
        sections: score.sections.map((written, sectionIndex) => {
            const visits = itinerary.filter((visit) => visit.sectionIndex === sectionIndex);
            let context = resolveScoreContext(score, written);
            const measures = written.measures.map((measure, index) => {
                const where = `${written.label}, bar ${index + 1}`;
                context = resolveScoreContext(context, measure);
                const meter = TIME_SIGNATURES[context.meter];
                if (!meter) {
                    throw new Error(`${where}: ${context.meter} playback is not supported yet.`);
                }
                if (measure.content.kind !== 'events') {
                    throw new Error(
                        `${where}: measure-repeat signs cannot be played yet. The chart is preserved.`,
                    );
                }
                const symbols: string[] = [];
                const steps: number[] = [];
                for (const event of measure.content.events) {
                    if (
                        event.kind !== 'chord' ||
                        event.fermata ||
                        (event.alternates?.length ?? 0) > 0
                    ) {
                        throw new Error(
                            `${where}: holds, N.C., fermatas and alternate chords cannot be played yet.`,
                        );
                    }
                    const symbol = event.symbol.replace(/♯/g, '#').replace(/♭/g, 'b');
                    if (!PLAYABLE_CHORD.test(symbol)) {
                        throw new Error(
                            `${where}: “${event.symbol}” is valid notation but its voicing is not supported yet.`,
                        );
                    }
                    const length = durationToSteps(event.duration);
                    if (length === null) {
                        throw new Error(
                            `${where}: choose chord lengths that fit the sixteenth-note grid; timing will not be rounded.`,
                        );
                    }
                    symbols.push(symbol);
                    steps.push(length);
                }
                return {
                    id: measure.id,
                    key: context.key,
                    isMinor: context.isMinor,
                    meter: context.meter,
                    config: getEffectiveTimeSignature(context.meter, context.grouping),
                    symbols,
                    steps,
                };
            });
            for (const visit of visits) {
                const measure = measures[visit.measureIndex];
                performedEvents += measure.symbols.length;
                performedMeasures++;
                performedSteps += durationToSteps(scoreMeter(measure.meter).length)!;
                if (
                    performedEvents > 65_536 ||
                    performedMeasures > 16_384 ||
                    performedSteps > 1_048_576
                ) {
                    throw new Error(
                        'This chart expands beyond the current playback limit. Reduce repeats.',
                    );
                }
            }
            const { measures: _measures, meter, grouping: _grouping, ...settings } = written;
            return {
                section: {
                    ...settings,
                    ...(meter ? { timeSignature: meter } : {}),
                    // Compatibility projection for engine readers of section overrides. It is
                    // never written to a v1 document or reparsed while this plan is installed.
                    value: measures.map((measure) => measure.symbols.join(' ')).join(' | '),
                },
                measures,
                visits,
            };
        }),
    };
}

type ParseBar = (
    state: EnsembleState,
    input: string,
    key: string,
    meter: string,
    previousMidis: number[],
    isMinor: boolean,
    bassActive: boolean,
    startsSection: boolean,
) => { chords: Chord[]; finalMidis: number[] };

/** One exact map drives the scheduler, worker, detached exports and the v2 lead sheet. */
export function renderScorePlayback(state: EnsembleState, parse: ParseBar) {
    const plan = state.arranger.scorePlan;
    if (!plan) {
        throw new Error('Prepare the semantic chart before rendering it.');
    }
    const progression: Chord[] = [];
    const stepMap: ArrangerState['stepMap'] = [];
    const measureMap: ArrangerState['measureMap'] = [];
    const sectionMap: ArrangerState['sectionMap'] = [];
    let step = 0;
    let previousMidis: number[] = [];
    for (const { section, measures, visits } of plan.sections) {
        const sectionStart = step;
        // A detached stem render may mask lanes in its passed-state sections.
        // Voicing follows that effective bass presence, not the authored plan's copy.
        const bassActive =
            state.arranger.sections.find((entry) => entry.id === section.id)?.instruments?.bass ??
            Boolean(state.bass?.enabled);
        let localIndex = 0;
        let previousSectionPass = -1;
        for (const visit of visits) {
            const bar = measures[visit.measureIndex];
            const startsSection = visit.sectionPass !== previousSectionPass;
            if (startsSection) {
                localIndex = 0;
            }
            previousSectionPass = visit.sectionPass;
            const start = step;
            const parsed = parse(
                state,
                bar.symbols.join(' '),
                bar.key,
                bar.meter,
                previousMidis,
                bar.isMinor,
                bassActive,
                startsSection,
            );
            if (parsed.chords.length !== bar.steps.length) {
                throw new Error('The playback adapter could not resolve every written chord.');
            }
            previousMidis = parsed.finalMidis;
            parsed.chords.forEach((voicing, index) => {
                const end = step + bar.steps[index];
                const chord: Chord = {
                    ...voicing,
                    beats: bar.steps[index] / bar.config.stepsPerBeat,
                    sectionId: section.id,
                    sectionLabel: section.label,
                    keyIsMinor: bar.isMinor,
                    localIndex: localIndex++,
                    repeatIndex: visit.sectionPass,
                    measureId: bar.id,
                };
                progression.push(chord);
                stepMap.push({ start: step, end, chord });
                step = end;
            });
            measureMap.push({
                start,
                end: step,
                ts: bar.meter,
                config: bar.config,
            });
        }
        sectionMap.push({ id: section.id, label: section.label, start: sectionStart, end: step });
    }
    return { progression, stepMap, measureMap, sectionMap, totalSteps: step };
}

export function scoreArrangement(score: SemanticScore, plan = prepareScorePlayback(score)) {
    return {
        key: score.key,
        isMinor: score.isMinor,
        timeSignature: score.meter,
        grouping: score.grouping,
        notation: score.notation,
        sections: plan.sections.map((entry) => entry.section),
        lastChordPreset: 'Songbook',
    };
}
