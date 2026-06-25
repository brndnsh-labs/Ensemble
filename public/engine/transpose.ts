import {
    INTERVAL_TO_NNS,
    INTERVAL_TO_ROMAN,
    KEY_ORDER,
    NNS_OFFSETS,
    ROMAN_VALS,
} from '../config.js';
import { normalizeKey } from '../utils.js';

/**
 * The single source of truth for transposing a chord-progression string.
 *
 * Both transpose entrypoints route through here:
 *  - `transposeKey` (absolute +/- transpose, and the key dropdown) calls with the default
 *    `rewriteRelative: false`.
 *  - `transformRelativeProgression` (relative major/minor switch) calls with `rewriteRelative: true`.
 *
 * Previously these were two divergent implementations whose split regexes disagreed about the
 * slash (`/`): the relative path tokenized on it and transposed the bass, the absolute path did
 * not — so `transposeKey` left slash-bass notes stranded (`C/E` +2 → `D/E` instead of `D/Gb`).
 * Unifying on one tokenizer fixes that and removes the drift.
 */

// Tokenizer delimiters: whitespace, comma, pipe, hyphen — AND the slash, so a slash-bass note is
// its own token and gets transposed like any other note-name (the bug that motivated unifying).
const SPLIT_PATTERN = /([\s,|,-]+|\/)/;
const ROMAN_REGEX = /^([#b])?(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/;
const NNS_REGEX = /^([#b])?([1-7])/;
const NOTE_REGEX = /^([A-G][#b]?)/i;

// Robust wrap into [0,11] for any sign/magnitude of shift (JS `%` keeps the dividend's sign).
const mod12 = (n: number): number => ((n % 12) + 12) % 12;

interface TransposeOptions {
    /**
     * `false` (default) — absolute transpose. Roman/NNS tokens are key-relative, so they pass
     * through unchanged: the caller shifts the key label by the same amount, so they still resolve
     * to the intended pitch. Only note-name roots (and slash basses) move.
     *
     * `true` — relative major/minor switch. The absolute pitches are preserved by the caller's key
     * change, so Roman/NNS tokens are REWRITTEN by `-shift` to keep representing the same pitch in
     * the new key. Note-name roots still move by `+shift`.
     */
    rewriteRelative?: boolean;
}

export function transposeChordText(
    input: string,
    semitoneShift: number,
    { rewriteRelative = false }: TransposeOptions = {},
): string {
    const parts = input.split(SPLIT_PATTERN);
    const transformed = parts.map((part) => {
        if (!part.trim() || part === '|' || part === '/' || part === ',' || part === '-') {
            return part;
        }

        // Normalize Unicode accidentals (♯/♭) to ASCII for matching. The replacement is
        // char-for-char, so indices are stable and the suffix can still be sliced off the
        // ORIGINAL `part` to preserve its spelling.
        const norm = part.replace(/♯/g, '#').replace(/♭/g, 'b');

        const romanMatch = norm.match(ROMAN_REGEX);
        const nnsMatch = norm.match(NNS_REGEX);
        const noteMatch = norm.match(NOTE_REGEX);

        if (romanMatch) {
            if (!rewriteRelative) {
                return part; // key-relative numeral; the key label moves, the text stays
            }
            const accidental = romanMatch[1] || '';
            const numeral = romanMatch[2];
            const suffix = part.slice(romanMatch[0].length);

            let originalOffset = (ROMAN_VALS as Record<string, number>)[numeral.toUpperCase()];
            if (accidental === 'b') {
                originalOffset -= 1;
            }
            if (accidental === '#') {
                originalOffset += 1;
            }

            const newOffset = mod12(originalOffset - semitoneShift);
            let newRoman = (INTERVAL_TO_ROMAN as Record<number, string>)[newOffset];
            // Preserve the original casing (major/minor quality) of the numeral.
            if (numeral === numeral.toLowerCase()) {
                newRoman = newRoman.toLowerCase();
            }
            return newRoman + suffix;
        } else if (nnsMatch) {
            if (!rewriteRelative) {
                return part;
            }
            const accidental = nnsMatch[1] || '';
            const number = parseInt(nnsMatch[2], 10);
            const suffix = part.slice(nnsMatch[0].length);

            let originalOffset = NNS_OFFSETS[number - 1];
            if (accidental === 'b') {
                originalOffset -= 1;
            }
            if (accidental === '#') {
                originalOffset += 1;
            }

            const newOffset = mod12(originalOffset - semitoneShift);
            const newNNS = (INTERVAL_TO_NNS as Record<number, string>)[newOffset];
            return newNNS + suffix;
        } else if (noteMatch) {
            // Note-name roots AND slash basses (each a separate token) move by +shift in BOTH modes.
            const root = normalizeKey(
                noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase(),
            );
            const suffix = part.slice(noteMatch[0].length);
            const originalIndex = KEY_ORDER.indexOf(root);
            if (originalIndex !== -1) {
                return KEY_ORDER[mod12(originalIndex + semitoneShift)] + suffix;
            }
        }

        return part;
    });

    return transformed.join('');
}
