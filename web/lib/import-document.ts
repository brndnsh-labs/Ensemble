import { writtenSettings } from '@core/songbook/codec';
import { songSourceLink } from '@core/songbook/ireal-decode';
import type { IRealImportResult } from '@core/songbook/ireal-import';
import type { ChartDocumentV2 } from '@core/songbook/score-types';
import { type ChartDocument, followingFeel, validateDocument } from './documents';
import { checkPlayable } from './engine-mode';
import { genreSwing } from './genre-swing';

/**
 * Build a detached candidate only. Reviewing an import never changes the running band.
 *
 * `source` is what the document keeps as its original (`importSource.text`): the whole input by
 * default — one song picked from a file keeps the file it came from — or, for a whole-playlist
 * import (#1478), `'song'`: that song's own link (`songSourceLink`), so 1,350 documents never each
 * carry the whole playlist.
 *
 * `genre` is the band style the song plays in (#2004): left out, the style iReal's export maps to
 * (`IRealImportSong.genre`), else the setup it borrows; `null` keeps the borrowed setup whatever
 * the export says. A genre that differs from the setup's brings its own swing, as picking it does.
 */
export function importedDocument(
    result: IRealImportResult,
    index: number,
    base: ChartDocument,
    bpm: number,
    source: 'input' | 'song' = 'input',
    genre?: string | null,
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
    // The band's setup as a chart is written today (`writtenSettings`).
    const setup = writtenSettings(base.chart);
    const chosen = genre === undefined ? song.genre : genre;
    const band = followingFeel(setup.band);
    if (chosen && chosen !== band.groove.genre) {
        band.groove = { ...band.groove, genre: chosen, ...genreSwing(chosen) };
    }
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
        importSource: {
            format: result.format,
            text:
                source === 'song'
                    ? songSourceLink(result.format, song.metadata.fields)
                    : result.source,
        },
        chart: {
            score: song.score,
            performance: { ...setup.performance, bpm },
            band,
        },
    }) as ChartDocumentV2;
}
