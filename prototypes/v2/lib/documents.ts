import { validateChartDocument } from '@engine/songbook/codec';
import { validateChartDocumentV2 } from '@engine/songbook/document-v2';
import { proposeLegacyScoreConversion } from '@engine/songbook/legacy-score';
import { resolveScoreContext } from '@engine/songbook/score-context';
import { scoreMeter } from '@engine/songbook/score-duration';
import type { ChartDocumentV2, ScoreMeasure, SemanticScore } from '@engine/songbook/score-types';
import type { ChartContent, ChartDocument as LegacyDocument } from '@engine/songbook/types';
import { withSectionMeter } from './song-meter';

export type ChartDocument = LegacyDocument | ChartDocumentV2;
export type DocumentContent = ChartDocument['chart'];

export function validateDocument(candidate: unknown): ChartDocument {
    const legacy = validateChartDocument(candidate);
    const result =
        legacy.kind === 'future-version' && legacy.schemaVersion === 2
            ? validateChartDocumentV2(candidate)
            : legacy;
    if (result.kind !== 'ok') {
        const reason =
            result.kind === 'future-version'
                ? 'a newer document version'
                : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
        throw new Error(`Cannot open this chart: ${reason}. The source has not been changed.`);
    }
    return result.value;
}

/** Read-only display projection; never save or parse it as v1 music. */
export function arrangementOf(document: ChartDocument): ChartContent['arrangement'] {
    if (document.schemaVersion === 1) {
        return document.chart.arrangement;
    }
    const score = document.chart.score;
    return {
        key: score.key,
        isMinor: score.isMinor,
        notation: score.notation,
        timeSignature: score.meter,
        grouping: score.grouping,
        lastChordPreset: 'Songbook',
        sections: score.sections.map(
            ({ measures: _measures, meter, grouping: _grouping, ...section }) => ({
                ...section,
                value: '',
                ...(meter ? { timeSignature: meter } : {}),
            }),
        ),
    };
}

/** Explicit copy, not an in-place migration: the source keeps its ID and revision. */
export function convertedCopy(document: LegacyDocument): ChartDocumentV2 {
    const proposal = proposeLegacyScoreConversion(JSON.stringify(document));
    if (proposal.kind !== 'candidate') {
        throw new Error(proposal.issues.map((issue) => issue.message).join(' '));
    }
    return {
        ...proposal.value,
        id: crypto.randomUUID(),
        revision: 0,
        title: `${document.title.slice(0, 140)} — editable copy`,
    };
}

/** A fresh four-bar measure chart that borrows `base`'s band and performance setup. Not yet validated. */
export function blankSong(base: ChartDocument) {
    return {
        schemaVersion: 2,
        id: crypto.randomUUID(),
        title: 'Untitled song',
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        chart: {
            performance: base.chart.performance,
            band: base.chart.band,
            score: {
                key: 'C',
                isMinor: false,
                notation: 'name',
                meter: '4/4',
                grouping: null,
                sections: [
                    {
                        id: crypto.randomUUID(),
                        label: 'A',
                        repeat: 1,
                        measures: ['C', 'G', 'Am', 'F'].map((symbol) => ({
                            id: crypto.randomUUID(),
                            content: {
                                kind: 'events',
                                events: [{ kind: 'chord', symbol, duration: [4, 1] }],
                            },
                        })),
                    },
                ],
            },
        },
    };
}

/**
 * Appends one bar — to a new section, or to the section holding `measureId` — filled with the
 * tonic of the key and meter in force at that point. Returns a changed copy of `score`.
 */
export function extendedScore(source: SemanticScore, measureId: string, newSection: boolean) {
    const score = structuredClone(source);
    const selectedSection =
        score.sections.find((s) => s.measures.some((m) => m.id === measureId)) ?? score.sections[0];
    const section = newSection
        ? {
              id: crypto.randomUUID(),
              label: String.fromCharCode(65 + (score.sections.length % 26)),
              repeat: 1,
              measures: [],
          }
        : selectedSection;
    if (newSection) {
        score.sections.push(section);
    }
    let context = resolveScoreContext(score, section);
    for (const measure of section.measures) {
        context = resolveScoreContext(context, measure);
    }
    const id = crypto.randomUUID();
    section.measures.push({
        id,
        content: {
            kind: 'events',
            events: [
                {
                    kind: 'chord',
                    symbol: context.key + (context.isMinor ? 'm' : ''),
                    duration: scoreMeter(context.meter).length,
                },
            ],
        },
    });
    return { score, measureId: id, sectionId: section.id };
}

export type RemovalResult =
    | { kind: 'ok'; score: SemanticScore; measureId: string; sectionId: string }
    /** Nothing was changed; `message` says what the musician has to change first. */
    | { kind: 'blocked'; message: string };

/** The first bar outside `removed` whose content repeats a bar inside it, as "A · bar 3". */
function repeatOfRemoved(score: SemanticScore, removed: Set<string>): string | undefined {
    for (const section of score.sections) {
        for (const [index, measure] of section.measures.entries()) {
            if (
                !removed.has(measure.id) &&
                measure.content.kind === 'repeat' &&
                removed.has(measure.content.measureId)
            ) {
                return `${section.label} · bar ${index + 1}`;
            }
        }
    }
    return undefined;
}

function repeatRefusal(score: SemanticScore, removed: ScoreMeasure[]): string | undefined {
    const repeatedBy = repeatOfRemoved(score, new Set(removed.map((m) => m.id)));
    return repeatedBy ? `${repeatedBy} repeats this music. Change that bar first.` : undefined;
}

/**
 * Removes one bar. A bar that WROTE a key, mode, meter or grouping change hands it to the next
 * bar in its section (context never crosses a section boundary), so everything after it keeps
 * sounding as it did — unless that bar writes the same field itself. A written meter resets
 * grouping, so a handed-down grouping would re-divide a meter the next bar chose: it is only
 * handed over when the next bar writes no meter of its own.
 *
 * The only bar of a section takes the section with it; the only bar of the chart is refused.
 */
export function withoutMeasure(source: SemanticScore, measureId: string): RemovalResult {
    const sectionIndex = source.sections.findIndex((s) =>
        s.measures.some((m) => m.id === measureId),
    );
    if (sectionIndex < 0) {
        return { kind: 'blocked', message: 'Select a bar to remove.' };
    }
    const section = source.sections[sectionIndex];
    if (section.measures.length === 1) {
        return source.sections.length === 1
            ? {
                  kind: 'blocked',
                  message: 'A chart needs at least one bar. Change its chords instead.',
              }
            : withoutSection(source, section.id);
    }
    const index = section.measures.findIndex((m) => m.id === measureId);
    const target = section.measures[index];
    const blocked = repeatRefusal(source, [target]);
    if (blocked) {
        return { kind: 'blocked', message: blocked };
    }
    // Repeats pair up within a section, a repeat-start may be implicit and an ending-end is
    // optional (`score-form.ts`), so dropping one marked bar can leave a form that still
    // validates but plays differently — a lost repeat-start silently repeats from the top of
    // the section. Refusing any marked bar is stricter than "still plays"; a refusal changes
    // nothing. A whole section can go with its marks: sections are independent forms, and the
    // codec rejects a jump left pointing at a removed segno/coda/fine.
    if (target.content.kind === 'repeat' && target.content.display !== 'one-bar') {
        return {
            kind: 'blocked',
            message: 'This bar is half of a two-bar repeat. Change it to chords first.',
        };
    }
    if (target.start?.length || target.end?.length) {
        return {
            kind: 'blocked',
            message:
                'This bar carries repeat or navigation marks. Remove them first, or remove the whole section.',
        };
    }
    const score = structuredClone(source);
    const measures = score.sections[sectionIndex].measures;
    const [removed] = measures.splice(index, 1);
    const next = measures[index];
    if (next) {
        const nextWroteMeter = next.meter !== undefined;
        for (const field of ['key', 'isMinor', 'meter'] as const) {
            if (removed[field] !== undefined && next[field] === undefined) {
                Object.assign(next, { [field]: removed[field] });
            }
        }
        if (removed.grouping !== undefined && next.grouping === undefined && !nextWroteMeter) {
            next.grouping = removed.grouping;
        }
    }
    // The previous bar, or the next one when the first bar went.
    const selected = measures[Math.max(0, index - 1)];
    return { kind: 'ok', score, measureId: selected.id, sectionId: section.id };
}

/** Removes a whole section. The last section of a chart is refused. */
export function withoutSection(source: SemanticScore, sectionId: string): RemovalResult {
    const index = source.sections.findIndex((s) => s.id === sectionId);
    if (index < 0) {
        return { kind: 'blocked', message: 'Select a bar in the section to remove.' };
    }
    if (source.sections.length === 1) {
        return {
            kind: 'blocked',
            message: 'A chart needs at least one section. Change its bars instead.',
        };
    }
    const blocked = repeatRefusal(source, source.sections[index].measures);
    if (blocked) {
        return { kind: 'blocked', message: blocked };
    }
    const score = structuredClone(source);
    score.sections.splice(index, 1);
    // The previous section's last bar, or the next section's first when the first section went.
    const selected = index > 0 ? score.sections[index - 1] : score.sections[0];
    const measure =
        index > 0 ? selected.measures[selected.measures.length - 1] : selected.measures[0];
    return { kind: 'ok', score, measureId: measure.id, sectionId: selected.id };
}

/** The longest section name the settings accept — the codec allows 100; the stand's badge fits this. */
export const SECTION_NAME_MAX = 24;

/** One section-settings edit (#1374). `null` returns an override to the song's own value. */
export type SectionChange =
    | { label: string }
    | { repeat: number }
    | { key: string | null }
    | { isMinor: boolean | null }
    | { meter: string | null };

export type SectionChangeResult =
    | { kind: 'ok'; score: SemanticScore }
    /** Nothing was changed. `measureId`, when present, is the bar that needs a decision. */
    | { kind: 'blocked'; message: string; measureId?: string };

/**
 * Applies one section-settings edit and returns a changed copy. A meter change re-fits the
 * section's bars by `withSongMeter`'s rule (`withSectionMeter`); key and mode never rewrite chord
 * names, the same rule as the bar editor. Bars that wrote their own override keep it.
 */
export function withSectionSettings(
    source: SemanticScore,
    sectionId: string,
    change: SectionChange,
): SectionChangeResult {
    const index = source.sections.findIndex((s) => s.id === sectionId);
    if (index < 0) {
        return { kind: 'blocked', message: 'Select a bar in the section to change.' };
    }
    if ('meter' in change) {
        return withSectionMeter(source, sectionId, change.meter);
    }
    const score = structuredClone(source);
    const section = score.sections[index];
    if ('label' in change) {
        const label = change.label.trim();
        if (!label || label.length > SECTION_NAME_MAX) {
            return {
                kind: 'blocked',
                message: `A section name needs 1 to ${SECTION_NAME_MAX} characters. Nothing was changed.`,
            };
        }
        section.label = label;
    } else if ('repeat' in change) {
        if (!Number.isInteger(change.repeat) || change.repeat < 1 || change.repeat > 64) {
            return {
                kind: 'blocked',
                message: 'A section plays 1 to 64 times. Nothing was changed.',
            };
        }
        section.repeat = change.repeat;
    } else if ('key' in change) {
        if (change.key === null) {
            delete section.key;
        } else {
            section.key = change.key;
        }
    } else if (change.isMinor === null) {
        delete section.isMinor;
    } else {
        section.isMinor = change.isMinor;
    }
    return { kind: 'ok', score };
}
