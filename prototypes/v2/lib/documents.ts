import { validateChartDocument } from '@engine/songbook/codec';
import { validateChartDocumentV2 } from '@engine/songbook/document-v2';
import { proposeLegacyScoreConversion } from '@engine/songbook/legacy-score';
import type { ChartDocumentV2 } from '@engine/songbook/score-types';
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
