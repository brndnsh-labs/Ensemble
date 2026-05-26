// Thin seed parser for the Roll-the-Dice wizard. Accepts free-form chord text
// in either Roman numeral form ("I vi IV V", "i-bVI-bIII-bVII") or absolute
// letter form ("C Am F G7"), or a mix. Returns an array of chord tokens that
// generateSong() can place into a section's value via formatProgression().
//
// Permissive by design: the goal is to let a musician type the way they
// already write progressions on a napkin. Whitespace, commas, dashes, pipes,
// and dot separators are all valid. Tokens that don't look chord-shaped are
// dropped silently (the caller can show a chip preview so the user sees what
// landed).

const ROMAN_TOKEN = /^([#b]?)(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/;
const NNS_TOKEN = /^([#b]?)([1-7])/;
// Letter chords are uppercase A-G by convention; lowercase is reserved for
// Roman numerals. Case-sensitive matching prevents "garbage" tokens that
// happen to start with a-g from sneaking through.
const LETTER_TOKEN = /^([A-G][#b]?)/;

function looksLikeChord(token: string): boolean {
    if (token.length === 0) {
        return false;
    }
    return ROMAN_TOKEN.test(token) || NNS_TOKEN.test(token) || LETTER_TOKEN.test(token);
}

export function parseSeedText(input: string): string[] {
    if (!input || typeof input !== 'string') {
        return [];
    }
    return input
        .split(/[\s,\-|·]+/)
        .map((t) => t.trim())
        .filter(looksLikeChord);
}

// Extract a chord token array from a generated section's `value` field, which
// uses the canonical " | " separator. Used by the "Pull from chart" picker to
// turn an existing section into a seed.
export function chordsFromSectionValue(value: string): string[] {
    if (!value) {
        return [];
    }
    return value
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
}
