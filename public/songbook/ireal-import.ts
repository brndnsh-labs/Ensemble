import { decodeIRealInput, decodeIRealMusic } from './ireal-decode.js';
import { scoreFromIRealBody } from './ireal-score.js';
import type { SemanticScore } from './score-types.js';

export interface IRealImportDiagnostic {
    severity: 'error' | 'warning';
    message: string;
    path?: string;
}

export interface IRealImportSong {
    title: string;
    composer?: string;
    style?: string;
    score?: SemanticScore;
    metadata: { key: string; transpose: string; tempo: string; repeats: string; fields: string[] };
    diagnostics: IRealImportDiagnostic[];
}

export interface IRealImportResult {
    source: string;
    format: 'irealbook' | 'irealb' | null;
    /**
     * The playlist's own title (#1478), when the export carries one that is bounded plain text —
     * what a whole-playlist import names its collection. One that is not is dropped with a warning,
     * never shown, exactly as an unsafe song title is.
     */
    playlistName?: string;
    songs: IRealImportSong[];
    diagnostics: IRealImportDiagnostic[];
}

/**
 * The most written measures one import may hold, across every song in it (#1478; 4,096 before a
 * playlist could import whole). Sized from the largest playlist this importer is built for:
 * iReal's Jazz 1460 measured 34,510 written measures across the 1,220 of its 1,460 tunes that
 * build a score (2026-10-02), about 28 a tune. 65,536 holds a full 2,000-song import
 * (`MAX_IREAL_SONGS`) of tunes that size with about 15% to spare, and nearly twice Jazz 1460.
 * Each tune is also bounded on its own by the score builder; this bounds the whole import's work.
 */
export const MAX_IMPORT_MEASURES = 65_536;

// biome-ignore lint/suspicious/noControlCharactersInRegex: display metadata must never contain markup or controls.
const UNSAFE_TEXT = /[<>\u0000-\u001f\u007f]/;

function displayText(
    value: string,
    name: string,
    allowEmpty = true,
    maxLength = 200,
): string | undefined {
    if (!value && allowEmpty) {
        return;
    }
    if (!value.trim() || value.length > maxLength || UNSAFE_TEXT.test(value)) {
        throw new Error(
            `The ${name} must be bounded plain text; original metadata is preserved in the source.`,
        );
    }
    return value;
}

function importSong(fields: string[], modern: boolean, index: number): IRealImportSong {
    const key = fields[modern ? 4 : 3];
    const song: IRealImportSong = {
        title: `Imported song ${index + 1}`,
        metadata: {
            key,
            transpose: modern ? fields[5] : '',
            tempo: modern ? fields[8] : '',
            repeats: modern ? fields[9] : '',
            fields: [...fields],
        },
        diagnostics: [],
    };
    try {
        song.title = displayText(fields[0], 'title', false, 160) ?? song.title;
        song.composer = displayText(fields[1], 'composer');
        song.style = displayText(fields[modern ? 3 : 2], 'style');
        if (modern && fields[2] !== '') {
            throw new Error('This extra modern header field is not supported.');
        }
        if (!modern && fields[4] !== 'n' && fields[4] !== '') {
            throw new Error('This open-protocol header variant is not supported.');
        }
        const body = modern ? decodeIRealMusic(fields[6]) : fields[5];
        const built = scoreFromIRealBody(body, key, index, modern);
        song.score = built.score;
        for (const note of built.notes) {
            song.diagnostics.push({ severity: 'warning', message: note });
        }
        song.diagnostics.push({
            severity: 'warning',
            message: modern
                ? 'Stored key is used without transposition. iReal style, transpose, tempo and player repetitions are preserved as raw metadata, not applied as Ensemble settings.'
                : 'The stored key is used. iReal style is preserved as text, not applied as an Ensemble genre.',
        });
    } catch (error) {
        delete song.score;
        song.diagnostics.push({
            severity: 'error',
            path: `songs[${index}]`,
            message:
                error instanceof Error
                    ? error.message
                    : 'The iReal chart could not be interpreted safely.',
        });
    }
    return song;
}

/**
 * The import as a sequence of steps: the decode, then one song per step, each yielding the number
 * of songs read so far and the total. `parseIRealImport` drains it in one go; `parseIRealImportInSteps`
 * hands the event loop back between slices, so a whole playlist never freezes the page (#1478).
 * Both build the same `result`, so the two can never disagree about a song.
 */
function* importSteps(
    input: string,
    result: IRealImportResult,
): Generator<{ done: number; total: number }, void, void> {
    try {
        const decoded = decodeIRealInput(input);
        result.format = decoded.format;
        if (decoded.playlistName !== undefined) {
            try {
                result.playlistName = displayText(decoded.playlistName, 'playlist name');
            } catch (error) {
                result.diagnostics.push({
                    severity: 'warning',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }
        const total = decoded.entries.length;
        let totalMeasures = 0;
        for (const [index, fields] of decoded.entries.entries()) {
            const song = importSong(fields, decoded.format === 'irealb', index);
            totalMeasures +=
                song.score?.sections.reduce(
                    (count, section) => count + section.measures.length,
                    0,
                ) ?? 0;
            if (totalMeasures > MAX_IMPORT_MEASURES) {
                result.songs = [];
                throw new Error(
                    `Import at most ${MAX_IMPORT_MEASURES.toLocaleString('en-US')} written measures across all selected songs.`,
                );
            }
            result.songs.push(song);
            yield { done: index + 1, total };
        }
    } catch (error) {
        result.diagnostics.push({
            severity: 'error',
            message:
                error instanceof Error
                    ? error.message
                    : 'This iReal input could not be decoded safely.',
        });
    }
}

function emptyResult(input: string): IRealImportResult {
    return { source: input, format: null, songs: [], diagnostics: [] };
}

/**
 * Bounded, synchronous and side-effect-free. Parsing never fetches, executes HTML, persists,
 * adopts playback state, or rounds music until something sounds plausible. The exact input
 * accompanies successes and failures; callers must keep it private and render metadata as text.
 * A score is authored data, not a playback certificate: the ordinary playback validator must
 * still check supported qualities, lane semantics, form traversal and expansion limits.
 */
export function parseIRealImport(input: string): IRealImportResult {
    const result = emptyResult(input);
    for (const _ of importSteps(input, result)) {
        // Drained in one go: every song is read before this returns.
    }
    return result;
}

export interface ImportStepOptions {
    /**
     * Asked after every song: true when this slice has run long enough to hand the event loop back.
     * The caller owns the clock (a UI passes a frame budget), so this module keeps none.
     */
    shouldYield: () => boolean;
    /** Hands the event loop back; resolves when the import may continue. */
    yieldNow: () => Promise<void>;
    /** Songs read so far, after each yield — never before the song it counts was read. */
    onProgress?: (done: number, total: number) => void;
    /** Checked after every yield: true stops the import and resolves null. */
    cancelled?: () => boolean;
}

/**
 * `parseIRealImport`, in slices (#1478). Parsing Jazz 1460's 1,460 tunes took 1.1-2.3 s
 * in one go on a desktop, which is several seconds of a frozen page on a phone. The result is
 * identical to `parseIRealImport`'s; null only when `cancelled` said so.
 */
export async function parseIRealImportInSteps(
    input: string,
    options: ImportStepOptions,
): Promise<IRealImportResult | null> {
    const result = emptyResult(input);
    for (const { done, total } of importSteps(input, result)) {
        if (options.shouldYield()) {
            options.onProgress?.(done, total);
            await options.yieldNow();
            if (options.cancelled?.()) {
                return null;
            }
        }
    }
    return result;
}
