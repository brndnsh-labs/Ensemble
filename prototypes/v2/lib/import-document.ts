import type { IRealImportResult } from '@engine/songbook/ireal-import';
import { prepareScorePlayback } from '@engine/songbook/score-playback';
import type { ChartDocumentV2 } from '@engine/songbook/score-types';
import { type ChartDocument, validateDocument } from './documents';

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
    prepareScorePlayback(song.score);
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
            band: base.chart.band,
        },
    }) as ChartDocumentV2;
}
