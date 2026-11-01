import { KEY_ORDER } from '../config.js';
import { normalizeKey } from '../utils.js';
import { spellPitchClass } from './note-spelling.js';

/**
 * The single source of truth for transposing chord text: `runtime.transpose` (the Key popover)
 * calls it for every chord symbol of the score.
 *
 * There used to be two divergent implementations whose split regexes disagreed about the
 * slash (`/`): one tokenized on it and transposed the bass, the other did not — so a transpose
 * left slash-bass notes stranded (`C/E` +2 → `D/E` instead of `D/Gb`). Unifying on one tokenizer
 * fixed that. (The relative major/minor rewrite of Roman and Nashville numerals, the text chart's
 * other caller, went with it in #1740.)
 */

// Tokenizer delimiters: whitespace, comma, pipe, hyphen — AND the slash, so a slash-bass note is
// its own token and gets transposed like any other note-name (the bug that motivated unifying).
const SPLIT_PATTERN = /([\s,|,-]+|\/)/;
const ROMAN_REGEX = /^([#b])?(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/;
const NNS_REGEX = /^([#b])?([1-7])/;
const NOTE_REGEX = /^([A-G][#b]?)/i;

// Robust wrap into [0,11] for any sign/magnitude of shift (JS `%` keeps the dividend's sign).
const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/**
 * Moves every note-name root and slash bass by `semitoneShift`. Roman and Nashville numerals are
 * key-relative, so they pass through unchanged: the key label moves instead.
 *
 * `target` is the key the text lands in (its bare tonic, as `transposeKeyName` returns it, and
 * whether it is minor): roots and slash basses are then spelled the way that key reads
 * (`spellPitchClass`), so E minor shows `F#m7b5`, not `Gbm7b5`. Without it every note is flat.
 */
export function transposeChordText(
    input: string,
    semitoneShift: number,
    target?: { key: string; isMinor: boolean },
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
        if (ROMAN_REGEX.test(norm) || NNS_REGEX.test(norm)) {
            return part; // key-relative numeral; the key label moves, the text stays
        }
        const noteMatch = norm.match(NOTE_REGEX);
        if (noteMatch) {
            // Note-name roots AND slash basses (each a separate token) move by +shift.
            const root = normalizeKey(
                noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase(),
            );
            const suffix = part.slice(noteMatch[0].length);
            const originalIndex = KEY_ORDER.indexOf(root);
            if (originalIndex !== -1) {
                const pc = mod12(originalIndex + semitoneShift);
                return spellPitchClass(pc, target?.key ?? '', '', '', target?.isMinor) + suffix;
            }
        }

        return part;
    });

    return transformed.join('');
}
