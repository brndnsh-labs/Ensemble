import type { IRealImportResult } from '@engine/songbook/ireal-import';
import type { ChartDocumentV2 } from '@engine/songbook/score-types';
import { type ChartDocument, followingFeel, validateDocument } from './documents';
import { checkPlayable } from './engine-mode';

/** Build a detached candidate only. Reviewing an import never changes the running band. */
export function importedDocument(
    result: IRealImportResult,
    index: number,
    base: ChartDocument,
    bpm: number,
): ChartDocumentV2 {
    const song = result.songs[index];
    if (
        !result.format ||
        !song?.score ||
        [...result.diagnostics, ...song.diagnostics].some((d) => d.severity === 'error')
    ) {
        throw new Error('Resolve the import warnings marked as errors before adding this chart.');
    }
    if (!Number.isInteger(bpm) || bpm < 40 || bpm > 240) {
        throw new Error('Choose a tempo from 40 to 240 BPM.');
    }
    checkPlayable(song.score);
    const now = new Date().toISOString();
    return validateDocument({
        schemaVersion: 2,
        id: crypto.randomUUID(),
        title: song.title,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        metadata: {
            ...(song.composer ? { composer: song.composer } : {}),
            ...(song.style ? { style: song.style } : {}),
        },
        importSource: { format: result.format, text: result.source },
        chart: {
            score: song.score,
            performance: { ...base.chart.performance, bpm },
            band: followingFeel(base.chart.band),
        },
    }) as ChartDocumentV2;
}
