import { validateChartDocument } from '@engine/songbook/codec';
import { validateChartDocumentV2 } from '@engine/songbook/document-v2';
import { proposeLegacyScoreConversion } from '@engine/songbook/legacy-score';
import { resolveScoreContext } from '@engine/songbook/score-context';
import { scoreMeter } from '@engine/songbook/score-duration';
import type { ChartDocumentV2, SemanticScore } from '@engine/songbook/score-types';
import type { ChartContent, ChartDocument as LegacyDocument } from '@engine/songbook/types';

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
