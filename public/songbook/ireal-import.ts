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
    songs: IRealImportSong[];
    diagnostics: IRealImportDiagnostic[];
}

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
        song.score = scoreFromIRealBody(body, key, index, modern);
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
 * Bounded, synchronous and side-effect-free. Parsing never fetches, executes HTML, persists,
 * adopts playback state, or rounds music until something sounds plausible. The exact input
 * accompanies successes and failures; callers must keep it private and render metadata as text.
 * A score is authored data, not a playback certificate: the ordinary playback validator must
 * still check supported qualities, lane semantics, form traversal and expansion limits.
 */
export function parseIRealImport(input: string): IRealImportResult {
    const result: IRealImportResult = { source: input, format: null, songs: [], diagnostics: [] };
    try {
        const decoded = decodeIRealInput(input);
        result.format = decoded.format;
        let totalMeasures = 0;
        for (const [index, fields] of decoded.entries.entries()) {
            const song = importSong(fields, decoded.format === 'irealb', index);
            totalMeasures +=
                song.score?.sections.reduce(
                    (count, section) => count + section.measures.length,
                    0,
                ) ?? 0;
            if (totalMeasures > 4096) {
                result.songs = [];
                throw new Error('Import at most 4,096 written measures across all selected songs.');
            }
            result.songs.push(song);
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
    return result;
}
