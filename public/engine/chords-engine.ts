// cspell:ignore mmaj madd majadd minadd susadd minb
import {
    INTERVAL_TO_NNS,
    INTERVAL_TO_ROMAN,
    KEY_ORDER,
    NNS_OFFSETS,
    ROMAN_VALS,
    TIME_SIGNATURES,
} from '../config.js';
import type { Chord, Dispatch, FormattedChordNames, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';
import { normalizeKey } from '../utils.js';
import { spellPitchClass } from './note-spelling.js';

const ROMAN_REGEX = /^([#b])?(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/;
const NNS_REGEX = /^([#b])?([1-7])/;
const NOTE_REGEX = /^([A-G][#b]?)/i;

/** Roots are worked out as MIDI numbers from C4; only their pitch class is ever used. */
const ROOT_OCTAVE_MIDI = 60;

/**
 * Can this text be a chord ROOT — a roman numeral, a Nashville number, or a note name?
 * The three regexes above are the only ways `resolveChordRoot` recognises one, and it
 * silently falls back to the key root when none matches, so a caller that needs to know
 * "is this a slash BASS or part of the quality" has to ask here (#1329).
 */
function looksLikeChordRoot(part: string): boolean {
    return ROMAN_REGEX.test(part) || NNS_REGEX.test(part) || NOTE_REGEX.test(part);
}

export interface ChordDetails {
    quality: string;
    is7th: boolean;
    /** The canonical table spelling that matched, NOT the text the caller passed. */
    suffix: string;
    /**
     * True when the whole normalised suffix was consumed by that spelling — i.e. the parser
     * understood all of it, not just a prefix (#1331). `Cm7#11` matches `m7` and leaves `#11`
     * behind, so it is NOT recognised; `CMaj7`, `Cm7(b5)` and `CΔ7` are, even though the
     * matched spelling differs from what was typed. An empty suffix (a bare triad) counts as
     * recognised. Consumers that need "would this text silently become a different chord"
     * must read THIS, not compare `suffix` to their own string: normalisation (case,
     * parentheses, Δ, the slash) means the canonical spelling legitimately differs.
     */
    recognised: boolean;
}

export interface ResolvedChordRoot {
    rootMidi: number;
    rootPart: string;
    romanMatch: RegExpMatchArray | null;
    nnsMatch: RegExpMatchArray | null;
    noteMatch: RegExpMatchArray | null;
    rootRomanBase: string;
}

/**
 * Formats an absolute note name using explicit accidentals first, then the local key context.
 * This avoids flat-biased spellings like Gb inside sharp-oriented keys such as E major.
 */
function getAbsoluteDisplayNoteName(
    pitchClass: number,
    keyContext: string,
    accidentalHint: string = '',
    explicitNote: string = '',
    keyIsMinor: boolean = false,
): string {
    return spellPitchClass(pitchClass, keyContext, accidentalHint, explicitNote, keyIsMinor);
}

/**
 * Canonical quality + `is7th` for every chord SPELLING the parser accepts (#1320-#1324).
 *
 * `is7th` is a property of the matched QUALITY, never sniffed out of the raw symbol. The
 * old `symbol.includes('7' | '9' | '11' | '13')` heuristic is what gave `Cadd9` a b7,
 * `C69` a b7 over its written 6th, and `Cm(add9)` a Cm7 — the digit that names a colour
 * tone is not evidence of a seventh. Three qualities encode the triad/seventh pair in
 * `is7th` rather than in the quality name, and that encoding is load-bearing for every
 * downstream consumer: `minor` + true == m7, `dim` + true == dim7, `aug` + true == aug7.
 *
 * Matching is LONGEST-SPELLING-FIRST (derived below, not hand-ordered) and anchored at
 * the start of the normalised suffix. Anchoring is what stops an alternative matching
 * mid-word — `ma` inside `madd9` (which made a minor chord a maj7) and `o` inside `dom7`
 * (which made a dominant a dim7). Trailing text the table can't represent is IGNORED,
 * which implements the one rule behind the whole table: never sound a tone that
 * contradicts a written one. A subset of the written chord is acceptable (a dropped
 * colour tone); a different chord is not — so a compound alteration whose first match
 * would sound the NATURAL version of an altered tone gets its own row mapping it to the
 * richest quality that is a genuine subset (`13b9` -> `7b9`, `9b5` -> `7b5`,
 * `m11b5` -> `halfdim`, `7#9#5` -> `7alt`).
 *
 * ENCODING: the value is the canonical quality, with a trailing `!` when that quality
 * carries a seventh — so `'minor!'` IS m7 and `'minor'` is the plain triad.
 */
const SUFFIX_QUALITIES = new Map<string, string>([
    // --- major 7th family. `maj`/`ma`/`△`/`^` alone read as maj7 (Cmaj = major, C△ = maj7).
    ['maj7#11', 'maj7#11!'],
    ['maj7#5', 'augmaj7!'],
    ['maj7+', 'augmaj7!'],
    // #1329 — a real quality, because no OTHER quality voices a flat 5 without a natural 5:
    // the previous maj7#11 mapping sounded the written b5 pitch class but kept the 5 the
    // chart had flattened. `M7b5` normalises onto this row.
    ['maj7b5', 'maj7b5!'],
    // Same contradiction one extension up: `maj9b5` matched 'maj9', which voices the
    // natural 5 the chart flattened. Drops the 9th as a subset (#1329).
    ['maj9b5', 'maj7b5!'],
    ['maj13', 'maj13!'],
    ['maj11', 'maj11!'],
    ['maj9', 'maj9!'],
    ['maj7', 'maj7!'],
    // A written 6th is not a 7th: `maj6`/`M6` is the 6 chord, `maj69` the 6/9 (#1320).
    ['maj69', '6/9'],
    ['maj6', '6'],
    // An added tone REPLACES the seventh; the 4/11 is dropped as a subset, never voiced
    // as the dominant 11th quality (#1322).
    ['majadd4', 'major'],
    // why (#1329): in chart convention a bare `Cmaj` is a major TRIAD — the old code's
    // own comment said so ("Cmaj = major, C△ = maj7") while returning maj7, so a
    // written Cmaj displayed "Cmaj7" and sounded a B. `△`/`^` alone stay maj7: that IS
    // their meaning in the iReal grammar this vocabulary follows.
    ['maj', 'major'],
    ['△9', 'maj9!'],
    ['△7', 'maj7!'],
    ['△', 'maj7!'],
    ['^7#11', 'maj7#11!'],
    ['^7#5', 'augmaj7!'],
    ['^13', 'maj13!'],
    ['^9', 'maj9!'],
    ['^7', 'maj7!'],
    ['^', 'maj7!'],

    // --- minor-major 7th (#1321). Every spelling normalises to `mmaj…` before matching.
    ['mmaj13', 'mMaj7!'],
    ['mmaj11', 'mMaj7!'],
    ['mmaj9', 'mMaj7!'],
    ['mmaj7', 'mMaj7!'],
    ['mmaj', 'mMaj7!'],

    // --- minor with a RAISED fifth (#1336). A real quality for the same reason `maj7b5` is:
    // no other quality voices a minor 3rd without a natural 5, so every spelling of this
    // chord matched the bare `m`/`min`/`-` row and came out a plain minor triad — the
    // natural 5 the chart had sharpened. `-#5` is the iReal spelling and was already in
    // `songbook/score-text.ts`'s accepted vocabulary while parsing as a plain minor. The
    // `+5` spellings are the same chord ("minor, raised 5"); bare `m+` is deliberately NOT
    // a row, because it would also capture `m+7`/`m+9`, whose reading is genuinely
    // contested (minor-MAJOR 7 by the "+ raises the 7th" convention, m7#5 by this table's
    // own `+7` -> aug7 analogy) — picking a side there is a separate decision.
    // Rows are 3+ characters so the longest-first matcher puts them ahead of `m`/`min`/`-`.
    ['m#5', 'm#5'],
    ['min#5', 'm#5'],
    ['-#5', 'm#5'],
    ['m+5', 'm#5'],
    ['min+5', 'm#5'],
    ['-+5', 'm#5'],

    // --- minor SEVENTH with a raised fifth (#1340): the 7th-chord sibling of the rows above,
    // and the last minor-family spelling where the band contradicted a written tone. Every
    // spelling matched the `m7` row, so the comp voiced C-Eb-G-Bb: the natural 5 the chart had
    // sharpened. Unlike `m#5` this one IS a seventh chord, so it carries the `!`: [0,3,8,10] is
    // the m7 with its fifth raised — the same four pitch classes as an `add9` a major third
    // below it (Cm7#5 = Ab-C-Eb-Bb), which is why dropping the ♯5 to a natural 5 does not read
    // as a near miss but as a different chord.
    // `mi7#5` needs no row (the normaliser folds `mi` -> `m`); `min7…` does,
    // because only the UPPERCASE `MIN`/`Min` are normalised. Rows are 4+ characters so the
    // longest-first matcher puts them ahead of `m7`/`min7`/`-7` — and `m7#9`/`m7#11`/`m7b9`
    // keep matching `m7` as before, since none of them starts with one of these spellings.
    ['m7#5', 'm7#5!'],
    ['min7#5', 'm7#5!'],
    ['-7#5', 'm7#5!'],
    ['m7+5', 'm7#5!'],
    ['min7+5', 'm7#5!'],
    ['-7+5', 'm7#5!'],

    // --- minor triad with an added FLAT SIXTH (#1340). iReal's `-b6` was already in
    // `songbook/score-text.ts`'s accepted vocabulary while the parser matched the bare
    // `m`/`min`/`-` row and dropped the ♭6 entirely — a subset, so never a wrong chord, but
    // the written colour was silently unplayable. A TRIAD plus colour, like `madd9`: iReal
    // spells the version WITH a seventh `min7b6`, which is the evidence that `mb6` means "no
    // 7th". `mib6` folds onto `mb6` in the normaliser. `mb5`/`-b5` are untouched — neither
    // starts with one of these spellings.
    ['mb6', 'mb6'],
    ['minb6', 'mb6'],
    ['-b6', 'mb6'],

    // --- minor family. `minor` + is7th true IS m7 (the canonical pair, not a shortcut).
    ['m7b5', 'halfdim!'],
    ['min7b5', 'halfdim!'],
    ['m9b5', 'halfdim!'],
    ['m11b5', 'halfdim!'],
    ['m13', 'm13!'],
    ['m11', 'm11!'],
    ['m9', 'm9!'],
    ['m7', 'minor!'],
    ['m69', 'm6'],
    ['m6', 'm6'],
    ['madd9', 'madd9'],
    ['madd2', 'madd9'],
    ['min13', 'm13!'],
    ['min11', 'm11!'],
    ['min9', 'm9!'],
    ['min7', 'minor!'],
    ['min69', 'm6'],
    ['min6', 'm6'],
    ['min', 'minor'],
    ['m', 'minor'],
    ['-7b5', 'halfdim!'],
    ['-13', 'm13!'],
    ['-11', 'm11!'],
    ['-9', 'm9!'],
    ['-7', 'minor!'],
    ['-69', 'm6'],
    ['-6', 'm6'],
    ['-', 'minor'],

    // --- diminished / half-diminished. `dim` + is7th true IS dim7.
    ['dim7', 'dim!'],
    ['dim', 'dim'],
    ['o7', 'dim!'],
    ['o', 'dim'],
    ['°7', 'dim!'],
    ['°', 'dim'],
    ['ø7', 'halfdim!'],
    ['ø', 'halfdim!'],
    ['h7', 'halfdim!'],
    ['h9', 'halfdim!'],
    ['h', 'halfdim!'],

    // --- augmented. `aug` + is7th true IS aug7 (a dominant #5).
    ['aug7', 'aug!'],
    ['aug9', 'aug!'],
    ['aug', 'aug'],
    ['+7', 'aug!'],
    ['+9', 'aug!'],
    ['+', 'aug'],

    // --- suspended, including the shorthand where `sus` alone means sus4 (#1323).
    ['7sus4', '7sus4!'],
    ['7sus2', 'sus2'],
    ['7sus', '7sus4!'],
    ['9sus4', '9sus4!'],
    ['9sus', '9sus4!'],
    ['13sus4', '13sus4!'],
    ['13sus', '13sus4!'],
    // A suspended dominant keeps its suspension; the b9/b13 colour has no sus quality to
    // live in and is dropped as a subset.
    ['7b9sus', '7sus4!'],
    ['7b13sus', '7sus4!'],
    ['sus4', 'sus4'],
    ['sus2', 'sus2'],
    ['sus', 'sus4'],

    // --- added tones and 6ths. The added colour tone REPLACES the seventh (#1322).
    ['add9', 'add9'],
    ['add2', 'add2'],
    ['add11', 'major'],
    ['add4', 'major'],
    ['6/9', '6/9'],
    ['69', '6/9'],
    ['6add9', '6/9'],
    ['6', '6'],

    // --- dominants and their alterations.
    ['7alt', '7alt!'],
    ['alt', '7alt!'],
    ['7#5#9', '7alt!'],
    ['7#9#5', '7alt!'],
    ['7b5b9', '7alt!'],
    ['7#9b5', '7alt!'],
    ['7b9#5', '7alt!'],
    ['7b9b5', '7alt!'],
    ['7#11', '7#11!'],
    ['9#11', '7#11!'],
    ['7b13', '7b13!'],
    ['7b9', '7b9!'],
    ['7#9', '7#9!'],
    ['7b5', '7b5!'],
    ['7#5', 'aug!'],
    ['7+', 'aug!'],
    ['7aug', 'aug!'],
    ['9b5', '7b5!'],
    ['9#5', 'aug!'],
    // A 13th's voicing carries the NATURAL 9, so a written b9/#9 has to move to the
    // dominant quality that states the alteration (#1324). The 13 is dropped as a subset.
    ['13b9', '7b9!'],
    ['13#11b9', '7b9!'],
    ['13#11#9', '7#9!'],
    ['13#9', '7#9!'],
    // A 13 whose b9/#9 arrives after ANOTHER alteration is the same chord as `13b9`:
    // the 13 voicing's natural 9 contradicts the written one either way (#1329).
    ['13', '13!'],
    ['11', '11!'],
    ['9', '9!'],
    ['7', '7!'],
    // `dom`/`dom7` is dominant, not diminished — the `o` used to match inside it (#1324).
    ['dom7', '7!'],
    ['dom', '7!'],

    // --- quality-neutral.
    ['5', '5'],
    ['2', 'sus2'],
]);

// Longest spelling first, so a shorter one can never shadow a more specific one
// ('m7b5' before 'm7' before 'm'; '13b9' before '13'). DERIVED rather than hand-ordered:
// hand-ordering a ~160-row alternation is exactly how `ma` came to match inside `madd9`.
const SUFFIX_SPELLINGS = [...SUFFIX_QUALITIES.keys()].sort((a, b) => b.length - a.length);

/**
 * Case/notation normalisation applied to the START of a chord suffix, in order, once.
 *
 * The ONE case-sensitive distinction that must survive is bare `M` (major) vs bare `m`
 * (minor) — everything else is folded onto the lowercase spelling the table knows. `Δ`
 * (Greek capital delta, U+0394) and `∆` (increment, U+2206) are what most keyboards and
 * pastes produce for the maj7 triangle `△` (U+25B3).
 */
const SUFFIX_NORMALISATIONS: ReadonlyArray<readonly [RegExp, string]> = [
    // Minor-major FIRST: every spelling of it starts with a minor marker followed by a
    // major-7 marker, and both halves have case variants. Matching `m`/`min`/`-` before
    // this rule ran is what made CmMaj7 a Cm7.
    [/^(?:MIN|Min|min|MI|Mi|mi|m|-)(?:MAJ|Maj|maj|MA|Ma|ma|M)(?=7|9|11|13|$)/, 'mmaj'],
    [/^(?:MIN|Min|min|MI|Mi|mi|m|-)(?:△|\^)(?=7|9|11|13|$)/, 'mmaj'],
    // Capitalised major-7 family. `Ma`/`MA` alone reads as maj7 like bare `ma` does.
    [/^(?:MAJ|Maj|MA|Ma)(?=\d|#|\+|$)/, 'maj'],
    // why (#1329): `ma` means maj7 — but only as a whole word. As a TABLE row it is also a
    // prefix of every `madd…` spelling, so `Cmadd11` matched it and came back a major chord
    // (the `ma`-inside-`madd9` trap the anchored matcher was built to kill, reintroduced by
    // dropping the redundant-looking `madd11`/`madd4` rows). Normalising `ma`-not-followed-
    // by-a-letter onto `maj` lets the table drop the whole `ma*` family, so no minor
    // spelling can ever reach it again.
    [/^ma(?![a-z])/, 'maj'],
    // A capital M is the major-7 family ONLY when an extension follows it; bare `CM` is a
    // major triad.
    [/^M(?=6|7|9|11|13)/, 'maj'],
    [/^(?:MIN|Min)/, 'min'],
    // `mi` is the Real Book's minor (Cmi7, Cmi7b5). Folded onto `m` so every minor row
    // serves it; without this the bare `m` row matched and dropped the written 7th.
    [/^(?:MI|Mi|mi)(?![nN])/, 'm'],
    [/^(?:SUS|Sus)/, 'sus'],
    [/^(?:DIM|Dim)/, 'dim'],
    [/^(?:AUG|Aug)/, 'aug'],
    [/^(?:ADD|Add)/, 'add'],
    [/^(?:DOM|Dom)/, 'dom'],
    [/^(?:ALT|Alt)/, 'alt'],
];

/**
 * Strip the notation a chord symbol carries for the reader's benefit and fold case
 * variants onto the canonical spellings — so the matcher itself stays a flat table.
 *
 * Parentheses are the iReal/Real Book house style for an alteration (`m7(b5)`, `7(b9)`,
 * `6(9)`) and were previously dropped along with the alteration inside them (#1324). The
 * slash goes with them (#1329): by the time a suffix reaches here `parseProgressionPart`
 * has already split off a real slash BASS, so any surviving `/` is notation inside the
 * quality — `6/9`, `m6/9`, `m/maj7` — and every one of those has a slash-less row. A
 * leading root note is tolerated so callers can pass a whole symbol (`Cma7`) or just the
 * suffix (`ma7`) — production always passes the suffix, since `resolveChordRoot` has
 * already consumed the root, and no supported suffix starts with an uppercase A-G.
 */
function normalizeChordSuffix(symbol: string): string {
    let suffix = symbol.replace(/[()\s/]/g, '').replace(/[Δ∆]/g, '△');
    // A capitalised quality WORD is not a root: `Add9`, `Aug7`, `Dim7`, `Dom7` start with
    // a root letter, and stripping it first left `dd9` / `ug7` / `im7` / `om7` (-> dim).
    if (!/^(?:ADD|Add|AUG|Aug|DIM|Dim|DOM|Dom|ALT|Alt)/.test(suffix)) {
        suffix = suffix.replace(/^[A-G](?:#|b)?/, '');
    }
    for (const [pattern, replacement] of SUFFIX_NORMALISATIONS) {
        const normalised = suffix.replace(pattern, replacement);
        if (normalised !== suffix) {
            return normalised;
        }
    }
    return suffix;
}

/**
 * Extracts quality and 7th status from a chord symbol string.
 */
export function getChordDetails(symbol: string): ChordDetails {
    const normalised = normalizeChordSuffix(symbol);
    const suffix = SUFFIX_SPELLINGS.find((spelling) => normalised.startsWith(spelling)) ?? '';
    const encoded = SUFFIX_QUALITIES.get(suffix) ?? 'major';
    const is7th = encoded.endsWith('!');
    return {
        quality: is7th ? encoded.slice(0, -1) : encoded,
        is7th,
        suffix,
        recognised: suffix === normalised,
    };
}

/**
 * Resolves the root midi and base representations from a chord string.
 */
function resolveChordRoot(
    part: string,
    keyRootMidi: number,
    baseOctave: number,
): ResolvedChordRoot {
    const romanMatch = part.match(ROMAN_REGEX);
    const nnsMatch = part.match(NNS_REGEX);
    const noteMatch = part.match(NOTE_REGEX);

    let rootMidi = keyRootMidi;
    let rootPart = '';
    let rootRomanBase = '';

    if (romanMatch) {
        rootPart = romanMatch[0];
        const accidental = romanMatch[1] || '',
            numeral = romanMatch[2];
        rootRomanBase = numeral;
        let rootOffset = (ROMAN_VALS as Record<string, number>)[numeral.toUpperCase()];
        if (accidental === 'b') {
            rootOffset -= 1;
        }
        if (accidental === '#') {
            rootOffset += 1;
        }
        rootMidi = keyRootMidi + rootOffset;
    } else if (nnsMatch) {
        rootPart = nnsMatch[0];
        rootRomanBase = 'I'; // Fallback
        const accidental = nnsMatch[1] || '',
            number = parseInt(nnsMatch[2], 10);
        let rootOffset = NNS_OFFSETS[number - 1];
        if (accidental === 'b') {
            rootOffset -= 1;
        }
        if (accidental === '#') {
            rootOffset += 1;
        }
        rootMidi = keyRootMidi + rootOffset;
    } else if (noteMatch) {
        rootPart = noteMatch[0];
        rootRomanBase = 'I'; // Fallback
        const note = normalizeKey(
            noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase(),
        );
        rootMidi = baseOctave + KEY_ORDER.indexOf(note);
    }

    return { rootMidi, rootPart, romanMatch, nnsMatch, noteMatch, rootRomanBase };
}

/**
 * Formats chord names with appropriate suffixes based on quality and extensions.
 */
export function getFormattedChordNames(
    rootName: string,
    rootNNS: string,
    rootRomanBase: string,
    quality: string,
    is7th: boolean,
): FormattedChordNames {
    let absSuffix = '',
        nnsSuffix = '',
        romSuffix = '';
    if (quality === 'minor') {
        absSuffix = 'm';
        nnsSuffix = '-';
    } else if (quality === 'dim') {
        absSuffix = 'dim';
        nnsSuffix = '°';
        romSuffix = '°';
    } else if (quality === 'halfdim') {
        absSuffix = 'm7b5';
        nnsSuffix = 'ø';
        romSuffix = 'ø';
    } else if (quality === 'aug') {
        if (is7th) {
            absSuffix = '7+';
            nnsSuffix = '7+';
            romSuffix = '7+';
        } else {
            absSuffix = 'aug';
            nnsSuffix = '+';
            romSuffix = '+';
        }
    } else if (quality === 'augmaj7') {
        absSuffix = 'maj7#5';
        nnsSuffix = 'maj7+';
        romSuffix = 'maj7+';
    } else if (quality === 'maj7') {
        absSuffix = 'maj7';
        nnsSuffix = 'maj7';
        romSuffix = 'maj7';
    } else if (quality === 'maj9') {
        absSuffix = 'maj9';
        nnsSuffix = 'maj9';
        romSuffix = 'maj9';
    } else if (quality === 'maj13') {
        absSuffix = 'maj13';
        nnsSuffix = 'maj13';
        romSuffix = 'maj13';
    } else if (quality === 'mMaj7') {
        // why (#1321): the chart wrote a minor-major 7th; `mMaj7` is the spelling the Real
        // Book uses and it must not collapse to 'm' + the is7th '7' append below (Cm7).
        absSuffix = 'mMaj7';
        nnsSuffix = '-Maj7';
        romSuffix = 'Maj7';
    } else if (quality === 'm#5') {
        // why (#1336): without a branch this collapsed to the default empty suffix, so a
        // written `Cm#5` displayed as a bare `C` — the major chord it is furthest from.
        // `-#5` is the iReal/NNS spelling of the same chord.
        absSuffix = 'm#5';
        nnsSuffix = '-#5';
        romSuffix = '#5';
    } else if (quality === 'm7#5') {
        // why (#1340): same default-empty-suffix trap as `m#5` above — a written `Cm7#5` showed
        // as a bare `C`. The quality spells its own seventh, so it also has to sit in the
        // "don't append 7" list below or it renders `Cm7#57`.
        absSuffix = 'm7#5';
        nnsSuffix = '-7#5';
        romSuffix = '7#5';
    } else if (quality === 'm7b9' || quality === 'm7#11' || quality === 'm7b13') {
        // why (#1662): a lowercase numeral with a dominant's alteration (`i7b9`) is a minor
        // seventh with that colour, which is what the band plays. The quality is its own
        // letter-name suffix; the numeral and the `-` carry the minor third in the other two.
        absSuffix = quality;
        nnsSuffix = `-${quality.slice(1)}`;
        romSuffix = quality.slice(1);
    } else if (quality === 'mb6') {
        // why (#1340): `-b6` is iReal's spelling of the same chord and was already accepted by
        // the score vocabulary; `is7th` is false here, so no append guard is needed.
        absSuffix = 'mb6';
        nnsSuffix = '-b6';
        romSuffix = 'b6';
    } else if (quality === 'madd9') {
        absSuffix = 'madd9';
        nnsSuffix = '-add9';
        romSuffix = 'add9';
    } else if (quality === 'm9') {
        absSuffix = 'm9';
        nnsSuffix = '-9';
        romSuffix = '9';
    } else if (quality === 'm11') {
        absSuffix = 'm11';
        nnsSuffix = '-11';
        romSuffix = '11';
    } else if (quality === 'm13') {
        absSuffix = 'm13';
        nnsSuffix = '-13';
        romSuffix = '13';
    } else if (quality === 'maj11') {
        absSuffix = 'maj11';
        nnsSuffix = 'maj11';
        romSuffix = 'maj11';
    } else if (quality === 'maj7#11') {
        absSuffix = 'maj7#11';
        nnsSuffix = 'maj7#11';
        romSuffix = 'maj7#11';
    } else if (quality === 'maj7b5') {
        absSuffix = 'maj7b5';
        nnsSuffix = 'maj7b5';
        romSuffix = 'maj7b5';
    } else if (quality === 'sus4') {
        absSuffix = 'sus4';
        nnsSuffix = 'sus4';
        romSuffix = 'sus4';
    } else if (quality === '7sus4') {
        absSuffix = '7sus4';
        nnsSuffix = '7sus4';
        romSuffix = '7sus4';
    } else if (quality === '9sus4') {
        absSuffix = '9sus4';
        nnsSuffix = '9sus4';
        romSuffix = '9sus4';
    } else if (quality === '13sus4') {
        absSuffix = '13sus4';
        nnsSuffix = '13sus4';
        romSuffix = '13sus4';
    } else if (quality === 'sus2') {
        absSuffix = 'sus2';
        nnsSuffix = 'sus2';
        romSuffix = 'sus2';
    } else if (quality === 'add9') {
        absSuffix = 'add9';
        nnsSuffix = 'add9';
        romSuffix = 'add9';
    } else if (quality === 'add2') {
        absSuffix = 'add2';
        nnsSuffix = 'add2';
        romSuffix = 'add2';
    } else if (quality === '6/9') {
        absSuffix = '6/9';
        nnsSuffix = '6/9';
        romSuffix = '6/9';
    } else if (quality === '6') {
        absSuffix = '6';
        nnsSuffix = '6';
        romSuffix = '6';
    } else if (quality === 'm6') {
        absSuffix = 'm6';
        nnsSuffix = '-6';
        romSuffix = '6';
    } else if (quality === '9') {
        absSuffix = '9';
        nnsSuffix = '9';
        romSuffix = '9';
    } else if (quality === '11') {
        absSuffix = '11';
        nnsSuffix = '11';
        romSuffix = '11';
    } else if (quality === '13') {
        absSuffix = '13';
        nnsSuffix = '13';
        romSuffix = '13';
    } else if (quality === '7alt') {
        absSuffix = '7alt';
        nnsSuffix = '7alt';
        romSuffix = '7alt';
    } else if (quality === '7b9') {
        absSuffix = '7b9';
        nnsSuffix = '7b9';
        romSuffix = '7b9';
    } else if (quality === '7#9') {
        absSuffix = '7#9';
        nnsSuffix = '7#9';
        romSuffix = '7#9';
    } else if (quality === '7#11') {
        absSuffix = '7#11';
        nnsSuffix = '7#11';
        romSuffix = '7#11';
    } else if (quality === '7b13') {
        absSuffix = '7b13';
        nnsSuffix = '7b13';
        romSuffix = '7b13';
    } else if (quality === '7b5') {
        absSuffix = '7b5';
        nnsSuffix = '7b5';
        romSuffix = '7b5';
    } else if (quality === '5') {
        absSuffix = '5';
        nnsSuffix = '5';
        romSuffix = '5';
    }

    if (
        is7th &&
        ![
            'maj7',
            'maj9',
            'maj11',
            'maj13',
            'maj7#11',
            'maj7b5',
            'aug',
            'augmaj7',
            'halfdim',
            '7b9',
            '7#9',
            '7alt',
            '7#11',
            '7b13',
            '7b5',
            '9',
            '11',
            '13',
            'm9',
            'm11',
            'm13',
            // why: add9 contains '9' so is7th=true, but the quality resolves to 'add9' not a
            // dominant/extended chord — excluding it prevents a stray '7' being appended (→ "add97")
            'add9',
            // why (#1323): these qualities SPELL their own seventh, so appending another one
            // renders the nonsense the issue is named for — `G7sus4` displayed as "G7sus47".
            '7sus4',
            '9sus4',
            '13sus4',
            'mMaj7',
            // why (#1340): `m7#5` spells its own seventh too — without this a written Cm7#5
            // displayed as "Cm7#57", the exact nonsense #1323 is named for.
            'm7#5',
            // why (#1662): and so do the minor sevenths with a written colour above them.
            'm7b9',
            'm7#11',
            'm7b13',
        ].includes(quality)
    ) {
        absSuffix += '7';
        nnsSuffix += '7';
        romSuffix += '7';
    }

    let romanName: string;
    if (
        quality === 'minor' ||
        quality === 'dim' ||
        quality === 'halfdim' ||
        quality === 'm9' ||
        quality === 'm11' ||
        quality === 'm13' ||
        quality === 'm6' ||
        // #1321/#1322 — a minor-major 7th and a minor add9 are MINOR chords, so the numeral
        // is lowercase like every other minor quality's. Without these a chart in roman
        // notation displayed `IMaj7` for what it plays as a minor tonic.
        quality === 'mMaj7' ||
        quality === 'madd9' ||
        // #1336 — a raised fifth does not make the chord major; its b3 does the naming.
        quality === 'm#5' ||
        // #1340 — same rule for the 7th-chord sibling and for the added ♭6: the b3 names both.
        quality === 'm7#5' ||
        quality === 'mb6' ||
        // #1662 — and for a minor seventh with a b9, #11 or b13 above it.
        quality === 'm7b9' ||
        quality === 'm7#11' ||
        quality === 'm7b13'
    ) {
        romanName = rootRomanBase.toLowerCase();
    } else {
        romanName = rootRomanBase;
    }

    return {
        name: { root: rootName, suffix: absSuffix },
        nns: { root: rootNNS, suffix: nnsSuffix },
        roman: { root: romanName, suffix: romSuffix },
    };
}

/**
 * The quality a LOWERCASE roman numeral names: the chord its suffix spells, with the major
 * third lowered and nothing else moved. That is how the band reads the token it plays
 * (`parseChord` in `band/theory/chord.ts`), and the chart shows what the band plays
 * (DECISION 2026-10-12, #1662), so a tap and the neck sound the chord that is heard. The
 * numeral is read literally, in any key and on any degree: `vii` is a minor triad, not the
 * key's half-diminished seventh, which is written `viim7b5`.
 *
 * `prototypes/v2/lib/legacy-band-chart.test.ts` holds every suffix a measure-less chart can
 * play to the band's own reading. A quality with no row here has no major third to lower
 * (`sus4`, `5`, `dim`), is minor already, or is one of the spellings such a chart cannot play
 * (`7alt`, `maj7#11`, `maj7b5`, `maj7#5`), which keep the name they had.
 */
function minorReading(quality: string, is7th: boolean): string {
    switch (quality) {
        case 'major':
        case '7':
            // `is7th` tells the pair apart: 'minor' with a seventh IS m7.
            return 'minor';
        case '7#9':
            // The sharp ninth is the minor third's own pitch, so with the third lowered there
            // is no colour left to name: the band plays a minor seventh.
            return 'minor';
        case '9':
            return 'm9';
        case '13':
            return 'm13';
        case '6':
            // why (#1317): `i6`/`iv6` are everyday minor-key chords (Minor Swing is
            // `i6 | iv6 | V7`); the MAJOR 6th quality put an A natural over an F minor triad.
            // `m6` keeps `is7th === false` (#1313): a 6th chord has no 7th.
            return 'm6';
        case '6/9':
            // why (#1322): there is no minor 6/9 quality here. `m6` is the honest subset: it
            // keeps the b3 and the 6th and drops only the 9th, as the `m6/9` spelling does.
            return 'm6';
        case 'add9':
        case 'add2':
            // why (#1322): a minor triad plus the added tone; `add9`'s major 3rd contradicts
            // the numeral.
            return 'madd9';
        case 'maj7':
        case 'maj9':
        case 'maj11':
        case 'maj13':
            // why (#1321): `imaj7` / `iM7` is the minor-major 7th, the melodic-minor tonic.
            // The extensions collapse to the same quality (a subset: the 9/11/13 colour is
            // dropped, the defining b3 + maj7 is not).
            return 'mMaj7';
        case 'aug':
            // `i7#5` is a minor seventh with a raised fifth, `i+` the triad.
            return is7th ? 'm7#5' : 'm#5';
        case '7b5':
            // A minor third, a flat fifth and a minor seventh: the half-diminished chord.
            return 'halfdim';
        case '7b9':
            return 'm7b9';
        case '7#11':
            return 'm7#11';
        case '7b13':
            return 'm7b13';
        case '11':
            // A dominant 11th is written without its third (the 11 would sit a minor 9th
            // above a major one), but a lowercase numeral has ruled the major third out: the
            // band plays `i11` as the ordinary minor 11th (1 b3 5 b7 9 11) (#1674).
            return 'm11';
        default:
            return quality;
    }
}

/**
 * Parses a single progression string part (e.g., from one section).
 */
function parseProgressionPart(
    input: string,
    key: string,
    timeSignature: string,
    keyIsMinor: boolean = false,
): Chord[] {
    const parsed: Chord[] = [];
    const baseOctave = ROOT_OCTAVE_MIDI;
    const keyRootMidi = baseOctave + KEY_ORDER.indexOf(normalizeKey(key));

    const barParts = input.split(/(\|)/);

    barParts.forEach((barOrPipe) => {
        if (barOrPipe === '|') {
            return;
        }

        const barText = barOrPipe;
        const chordTokens = barText.split(/(\s+)/);
        const actualChordParts = chordTokens.filter((t) => t.trim() && t !== '|');

        const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];
        const beatsPerChord = actualChordParts.length > 0 ? ts.beats / actualChordParts.length : 0;

        chordTokens.forEach((token) => {
            if (token.trim().length > 0) {
                const part = token.trim();
                const slashParts = part.split('/');
                let chordPart = slashParts[0];
                let bassPart: string | undefined = slashParts[1];
                // A slash inside a chord symbol is only a BASS note when what follows it is
                // actually a root — `Am/G`, `Imaj7/V`, `F/A`. Otherwise the slash is
                // notation inside the quality (`C6/9`, `Cm/maj7`, `Cm6/9`) and the token has
                // to be recombined before the bass branch below reads that text as a root.
                // #780 solved this for `6/9` with a literal `bassPart === '9'` test; #1329
                // generalises it, because `Cm/maj7` hit the same trap the other way — the
                // suffix became a bare `m` (a plain Cm) and `maj7` was resolved as a bass
                // note, which silently falls back to the KEY root when nothing matches.
                if (bassPart !== undefined && !looksLikeChordRoot(bassPart)) {
                    chordPart = part;
                    bassPart = undefined;
                }

                const { rootMidi, rootPart, romanMatch, nnsMatch, noteMatch } = resolveChordRoot(
                    chordPart,
                    keyRootMidi,
                    baseOctave,
                );

                // Handle slash bass if present
                let bassNameAbs: string | null = null,
                    bassNameNNS: string | null = null,
                    bassNameRom: string | null = null;
                if (bassPart) {
                    const resolvedBass = resolveChordRoot(bassPart, keyRootMidi, baseOctave);
                    const bassMidi = resolvedBass.rootMidi;

                    const bassInterval = (bassMidi - keyRootMidi + 24) % 12;
                    const bassAccidentalHint =
                        resolvedBass.romanMatch?.[1] ||
                        resolvedBass.nnsMatch?.[1] ||
                        (resolvedBass.noteMatch?.[1]?.includes('#')
                            ? '#'
                            : resolvedBass.noteMatch?.[1]?.includes('b')
                              ? 'b'
                              : '');
                    bassNameAbs = getAbsoluteDisplayNoteName(
                        bassMidi % 12,
                        key,
                        bassAccidentalHint,
                        resolvedBass.noteMatch?.[1] || '',
                        keyIsMinor,
                    );
                    bassNameNNS = (INTERVAL_TO_NNS as Record<number, string>)[bassInterval];
                    bassNameRom = (INTERVAL_TO_ROMAN as Record<number, string>)[bassInterval];
                }

                const suffixPart = chordPart.slice(rootPart.length);
                const { quality: written, is7th } = getChordDetails(suffixPart);
                const lowercase =
                    romanMatch !== null && romanMatch[2] === romanMatch[2].toLowerCase();
                const quality = lowercase ? minorReading(written, is7th) : written;

                const interval = (rootMidi - keyRootMidi + 24) % 12;
                const rootNNS = (INTERVAL_TO_NNS as Record<number, string>)[interval];
                const displayRomanBase = romanMatch
                    ? `${romanMatch[1] || ''}${romanMatch[2].toUpperCase()}`
                    : (INTERVAL_TO_ROMAN as Record<number, string>)[interval];
                const rootAccidentalHint =
                    romanMatch?.[1] ||
                    nnsMatch?.[1] ||
                    (noteMatch?.[1]?.includes('#')
                        ? '#'
                        : noteMatch?.[1]?.includes('b')
                          ? 'b'
                          : '');
                const rootName = getAbsoluteDisplayNoteName(
                    rootMidi % 12,
                    key,
                    rootAccidentalHint,
                    noteMatch?.[1] || '',
                    keyIsMinor,
                );

                const formatted = getFormattedChordNames(
                    rootName,
                    rootNNS,
                    displayRomanBase,
                    quality,
                    is7th,
                );

                let finalAbsName = formatted.name.root + formatted.name.suffix;

                if (bassPart && bassNameAbs) {
                    finalAbsName += `/${bassNameAbs}`;
                    formatted.name.bass = bassNameAbs;
                    // bassNameNNS/Rom are set alongside bassNameAbs above, so they're
                    // non-null whenever this guard passes; coalesce null→undefined to
                    // match ChordNamePart.bass (string | undefined).
                    formatted.nns.bass = bassNameNNS ?? undefined;
                    formatted.roman.bass = bassNameRom ?? undefined;
                }

                parsed.push({
                    absName: finalAbsName,
                    display: formatted,
                    beats: beatsPerChord,
                    timeSignature: timeSignature,
                    key: key,
                });
            }
        });
    });

    return parsed;
}

/**
 * Parses the progression input string and updates the chord state.
 */
export function validateProgression(state: any, dispatch?: Dispatch): void {
    const { arranger } = state;
    let allChords: Chord[] = [];

    arranger.sections.forEach((section: any) => {
        try {
            const repeats = section.repeat || 1;
            const sectionKey = section.key || arranger.key;
            const sectionTS = section.timeSignature || arranger.timeSignature;
            const sectionIsMinor =
                typeof section.isMinor === 'boolean' ? section.isMinor : arranger.isMinor;

            for (let r = 0; r < repeats; r++) {
                const chords = parseProgressionPart(
                    section.value,
                    sectionKey,
                    sectionTS,
                    sectionIsMinor,
                );
                const taggedChords = chords.map((c, idx) => ({
                    ...c,
                    sectionId: section.id,
                    sectionLabel: section.label,
                    keyIsMinor: sectionIsMinor,
                    localIndex: idx,
                    repeatIndex: r,
                }));
                allChords = allChords.concat(taggedChords);
            }
        } catch (e) {
            console.error(`[Arranger] Error parsing section "${section.label}":`, e);
            // Optionally add a placeholder "Error" chord to the progression to keep the structure intact
        }
    });

    (arranger as Mutable<typeof arranger>).progression = allChords; // @direct-mutation
    updateProgressionCache(state);
    if (dispatch) {
        dispatch(ACTIONS.PROG_VALIDATED); // tell dispatch subscribers the progression changed
    }
}

/**
 * Caches progression metadata (the step map) to avoid redundant calculations by its readers.
 */
function updateProgressionCache(state: any): void {
    const { arranger } = state;
    if (!arranger.progression.length) {
        Object.assign(arranger, {
            totalSteps: 0,
            stepMap: [],
            sectionMap: [],
        });
        return;
    }

    let current = 0;
    const newStepMap = arranger.progression.map((chord: any) => {
        const tsName = chord.timeSignature || arranger.timeSignature;
        const ts = TIME_SIGNATURES[tsName] || TIME_SIGNATURES['4/4'];
        const steps = Math.round(chord.beats * ts.stepsPerBeat);
        const entry = { start: current, end: current + steps, chord };
        current += steps;
        return entry;
    });

    const newSectionMap: any[] = [];

    let mapIndex = 0;
    let sectionAcc = 0;

    arranger.sections.forEach((section: any) => {
        const sectionStart = sectionAcc;

        const startMapIndex = mapIndex;

        while (mapIndex < newStepMap.length) {
            const entry = newStepMap[mapIndex];

            if (entry.chord.sectionId !== section.id) {
                break;
            }

            if (mapIndex > startMapIndex) {
                const prevEntry = newStepMap[mapIndex - 1];
                if (entry.chord.localIndex <= prevEntry.chord.localIndex) {
                    if (entry.chord.repeatIndex !== prevEntry.chord.repeatIndex + 1) {
                        break;
                    }
                }
            }

            mapIndex++;
        }

        const totalSectionSteps =
            mapIndex > startMapIndex
                ? newStepMap[mapIndex - 1].end - newStepMap[startMapIndex].start
                : 0;

        newSectionMap.push({
            id: section.id,
            start: sectionStart,
            end: sectionStart + totalSectionSteps,
        });
        sectionAcc += totalSectionSteps;
    });

    Object.assign(arranger, {
        totalSteps: current,
        stepMap: newStepMap,
        sectionMap: newSectionMap,
    });
}
