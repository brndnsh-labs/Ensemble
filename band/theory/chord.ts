/**
 * THE chord authority. One parser turns a chart symbol into `ChordFacts`, and every lane
 * reads those facts; no lane re-derives a quality from the symbol text. (The old engine
 * read a quality in four lanes that could disagree, and needed a matrix test to guard it.)
 *
 * The vocabulary is closed: `SCORE_CHORD_QUALITIES` in `public/songbook/score-text.ts` is
 * what the chart codec accepts, and `chord.test.ts` proves every one of them parses here —
 * so "valid notation, unsupported voicing" cannot happen.
 */
import { type KeyContext, mod12, notePc } from './pitch.js';

// cspell:ignore minb susadd

export type ChordFamily =
    | 'major'
    | 'minor'
    | 'dominant'
    | 'half-diminished'
    | 'diminished'
    | 'augmented'
    | 'sus'
    | 'power';

export interface ChordFacts {
    symbol: string;
    /** Root pitch class. */
    root: number;
    /** Sounding bass pitch class (the slash note, else the root). */
    bass: number;
    /** Written chord tones as semitones above the root, ascending (extensions stay > 12). */
    intervals: number[];
    family: ChordFamily;
    third: 3 | 4 | null;
    fifth: 6 | 7 | 8 | null;
    /** 9 = diminished 7th, 10 = minor 7th, 11 = major 7th. */
    seventh: 9 | 10 | 11 | null;
    /** Written 6th (a 6 chord), which stands in for the 7th as a guide tone. */
    sixth: boolean;
    /** The tones that define the chord's function, as semitones above the root (< 12). */
    guides: number[];
    /** Written extensions above the 7th (9ths, 11ths, 13ths), reduced to < 12. */
    tensions: number[];
    /** The chord scale for passing tones and approaches, semitones above the root (< 12). */
    scale: number[];
    /**
     * Tensions the harmony implies but the chart doesn't write, for voicings to prefer over
     * the natural ones — a dominant resolving to a minor chord takes b9 and b13 (see
     * `timeline.ts`).
     */
    implied?: { ninth: number; thirteenth: number };
}

// Degree spellings → semitones above the root.
const DEGREE: Record<string, number> = {
    '1': 0,
    b9: 13,
    '2': 2,
    '9': 14,
    '#9': 15,
    b3: 3,
    '3': 4,
    '4': 5,
    '11': 17,
    '#11': 18,
    b5: 6,
    '5': 7,
    '#5': 8,
    b6: 8,
    '6': 9,
    b13: 20,
    '13': 21,
    bb7: 9,
    b7: 10,
    '7': 11,
};

/**
 * Every accepted quality spelling, grouped by the chord it names. Where chart conventions
 * disagree, the reading follows the iReal grammar the codec follows (`^` alone = maj7,
 * `maj` alone = major triad, `2` = sus2, `h` = half-diminished seventh).
 */
const QUALITY_TABLE: readonly (readonly [spellings: readonly string[], formula: string])[] = [
    // Major family.
    [['', 'maj', 'ma'], '1 3 5'],
    [['^', '△', 'Δ', '^7', 'maj7', 'ma7', 'M7', '△7', 'Δ7'], '1 3 5 7'],
    [['^9', 'maj9', 'ma9', '△9'], '1 3 5 7 9'],
    [['maj11', 'ma11'], '1 3 5 7 9 11'],
    [['^13', 'maj13', 'ma13'], '1 3 5 7 9 13'],
    [['^7#11', 'maj7#11'], '1 3 5 7 #11'],
    [['^9#11'], '1 3 5 7 9 #11'],
    [['maj13#11'], '1 3 5 7 9 #11 13'],
    [['^7#5', 'maj7#5', 'maj7+', 'M7#5', 'M7+'], '1 3 #5 7'],
    [['maj7b5'], '1 3 b5 7'],
    [['maj7#9'], '1 3 5 7 #9'],
    [['6'], '1 3 5 6'],
    [['69', '6/9'], '1 3 5 6 9'],
    [['add9', 'add2'], '1 3 5 9'],
    [['maj(add4)'], '1 3 4 5'],
    [['5'], '1 5'],
    [['+', 'aug'], '1 3 #5'],
    // Minor family.
    [['-', 'm', 'min'], '1 b3 5'],
    [['-7', 'm7'], '1 b3 5 b7'],
    [['-9', 'm9'], '1 b3 5 b7 9'],
    [['-11', 'm11'], '1 b3 5 b7 9 11'],
    [['m13', 'min13'], '1 b3 5 b7 9 11 13'],
    [['-6', 'm6'], '1 b3 5 6'],
    [['-69'], '1 b3 5 6 9'],
    [['-^7'], '1 b3 5 7'],
    [['-^9'], '1 b3 5 7 9'],
    [['min^11'], '1 b3 5 7 9 11'],
    [['min^13'], '1 b3 5 7 9 13'],
    [['-b6', 'mb6', 'minb6'], '1 b3 5 b6'],
    [['-#5', 'm#5', 'm+5', 'min#5', 'min+5', '-+5'], '1 b3 #5'],
    [['m7#5', 'm7+5', 'min7#5', 'min7+5', '-7#5', '-7+5'], '1 b3 #5 b7'],
    [['min7b6'], '1 b3 5 b6 b7'],
    [['min9b6'], '1 b3 5 b6 b7 9'],
    [['min(add4)'], '1 b3 4 5'],
    // Diminished family.
    [['o', 'dim', '°'], '1 b3 b5'],
    [['o7', 'dim7', '°7'], '1 b3 b5 bb7'],
    [['h', 'h7', 'ø', 'ø7', '-7b5', 'm7b5'], '1 b3 b5 b7'],
    [['h9'], '1 b3 b5 b7 9'],
    // Suspended.
    [['sus', 'sus4'], '1 4 5'],
    [['sus2', '2'], '1 2 5'],
    [['7sus', '7sus4'], '1 4 5 b7'],
    [['9sus'], '1 4 5 b7 9'],
    [['13sus'], '1 4 5 b7 9 13'],
    [['7b9sus'], '1 4 5 b7 b9'],
    [['7b13sus'], '1 4 5 b7 b13'],
    [['7susadd3'], '1 3 4 5 b7'],
    // Dominant family.
    [['7'], '1 3 5 b7'],
    [['9'], '1 3 5 b7 9'],
    // A dominant 11th drops the 3rd: the 11 would sit a minor 9th above it.
    [['11'], '1 5 b7 9 11'],
    [['13'], '1 3 5 b7 9 13'],
    [['7(add13)'], '1 3 5 b7 13'],
    [['7b9'], '1 3 5 b7 b9'],
    [['7#9'], '1 3 5 b7 #9'],
    [['7#11'], '1 3 5 b7 #11'],
    [['7b5'], '1 3 b5 b7'],
    [['7#5', '7+', '7aug', 'aug7', '+7'], '1 3 #5 b7'],
    [['9#11'], '1 3 5 b7 9 #11'],
    [['9b5'], '1 3 b5 b7 9'],
    [['9#5'], '1 3 #5 b7 9'],
    [['7b13'], '1 3 5 b7 b13'],
    [['7#9#5'], '1 3 #5 b7 #9'],
    [['7#9b5'], '1 3 b5 b7 #9'],
    [['7#9#11'], '1 3 5 b7 #9 #11'],
    [['7b9#11'], '1 3 5 b7 b9 #11'],
    [['7b9b5'], '1 3 b5 b7 b9'],
    [['7b9#5'], '1 3 #5 b7 b9'],
    [['7b9#9'], '1 3 5 b7 b9 #9'],
    [['7b9b13'], '1 3 5 b7 b9 b13'],
    // Altered: no 5th; the b9/#9/b13 carry the colour.
    [['7alt', 'alt'], '1 3 b7 b9 #9 b13'],
    [['13#11'], '1 3 5 b7 9 #11 13'],
    [['13b9'], '1 3 5 b7 b9 13'],
    [['13#9'], '1 3 5 b7 #9 13'],
];

const FORMULAS = new Map<string, number[]>();
for (const [spellings, formula] of QUALITY_TABLE) {
    const intervals = formula.split(' ').map((degree) => DEGREE[degree]);
    for (const spelling of spellings) {
        FORMULAS.set(spelling, intervals);
    }
}

/** The quality spellings this parser knows (for the codec-parity test). */
export const KNOWN_QUALITIES: ReadonlySet<string> = new Set(FORMULAS.keys());

// Mirrors the codec's ROOT grammar (roman, then Nashville numbers, then note names), with
// capture groups. Order matters: `bVII` is a roman numeral, not a B-flat.
const ROOT =
    /^(?:([#b]?)(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)|([#b]?)([1-7])|([A-Ga-g][#b]?))/;
const DEGREE_OFFSET = [0, 2, 4, 5, 7, 9, 11];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

interface ParsedRoot {
    pc: number;
    length: number;
    /** A lowercase roman numeral: the chord is minor unless its quality says otherwise. */
    lowercase: boolean;
}

function parseRoot(text: string, key: KeyContext): ParsedRoot | null {
    const match = ROOT.exec(text);
    if (!match) {
        return null;
    }
    const shift = (accidental: string) => (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
    if (match[2]) {
        // Numerals are major-scale degrees of the key, in either mode; a minor-key chart
        // writes its flat degrees explicitly (`bIII`, `bVI`), as iReal and Nashville do.
        const degree = ROMAN.indexOf(match[2].toUpperCase());
        const pc = mod12(key.tonic + DEGREE_OFFSET[degree] + shift(match[1]));
        return { pc, length: match[0].length, lowercase: match[2] === match[2].toLowerCase() };
    }
    if (match[4]) {
        const pc = mod12(key.tonic + DEGREE_OFFSET[Number(match[4]) - 1] + shift(match[3]));
        return { pc, length: match[0].length, lowercase: false };
    }
    return { pc: notePc(match[5]), length: match[0].length, lowercase: false };
}

function describe(intervals: number[]) {
    const has = (n: number) => intervals.includes(n);
    const pcs = new Set(intervals.map(mod12));
    const third = has(4) ? 4 : has(3) ? 3 : null;
    const fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : null;
    // A written b6 over a minor triad is a colour tone, not an augmented fifth.
    const seventh = has(11) ? 11 : has(10) ? 10 : third === 3 && fifth === 6 && has(9) ? 9 : null;
    const sixth = has(9) && seventh !== 9;
    let family: ChordFamily;
    if (third === null) {
        family = pcs.has(5) || pcs.has(2) ? 'sus' : 'power';
    } else if (third === 3) {
        family =
            fifth === 6 ? (seventh === 10 ? 'half-diminished' : 'diminished') : ('minor' as const);
    } else if (seventh === 10) {
        family = 'dominant';
    } else if (fifth === 8 && seventh === null) {
        family = 'augmented';
    } else {
        family = 'major';
    }
    // A dominant with a suspended 4th (and no 3rd) still functions as a dominant.
    if (family === 'sus' && seventh === 10) {
        family = 'dominant';
    }
    return { third, fifth, seventh, sixth, family } as const;
}

/**
 * Make a scale honour the chart: any written chord tone the template lacks replaces the
 * template tone a semitone away (maj7#9's #9 displaces the 9), or is inserted.
 */
function reconcile(scale: number[], intervals: number[]): number[] {
    const out = [...scale];
    for (const pc of new Set(intervals.map(mod12))) {
        if (out.includes(pc)) {
            continue;
        }
        const clash = out.findIndex(
            (n) =>
                n !== 0 &&
                (mod12(n - pc) === 1 || mod12(pc - n) === 1) &&
                !intervals.map(mod12).includes(n),
        );
        if (clash >= 0) {
            out[clash] = pc;
        } else {
            out.push(pc);
        }
    }
    return out.sort((a, b) => a - b);
}

function chordScale(
    intervals: number[],
    d: ReturnType<typeof describe>,
    key: KeyContext,
    root: number,
) {
    const pcs = new Set(intervals.map(mod12));
    const has = (n: number) => pcs.has(n);
    const degree = mod12(root - key.tonic);
    switch (d.family) {
        case 'major': {
            if (d.fifth === 8) {
                return [0, 2, 4, 6, 8, 9, 11]; // lydian augmented
            }
            // IV in a major key and bVI in a minor key are lydian: the natural 4 over them
            // would contradict the key's own leading tone or tonic.
            const lydian = has(6) || degree === (key.minor ? 8 : 5);
            return lydian ? [0, 2, 4, 6, 7, 9, 11] : [0, 2, 4, 5, 7, 9, 11];
        }
        case 'dominant':
            if (d.third === null) {
                // Sus: mixolydian without the 3rd, taking any written b9/b13 (7b9sus = phrygian).
                return [0, has(1) ? 1 : 2, 5, 7, has(8) ? 8 : 9, 10];
            }
            if (has(3) && (has(8) || d.fifth !== 7)) {
                return [0, 1, 3, 4, 6, 8, 10]; // altered
            }
            if (has(1) && has(8)) {
                return [0, 1, 4, 5, 7, 8, 10]; // phrygian dominant
            }
            if (has(1) || has(3)) {
                return [0, 1, 3, 4, 6, 7, 9, 10]; // half-whole diminished
            }
            if (d.fifth === 8) {
                return [0, 2, 4, 6, 8, 10]; // whole tone
            }
            if (has(6)) {
                return [0, 2, 4, 6, 7, 9, 10]; // lydian dominant
            }
            if (has(8)) {
                return [0, 2, 4, 5, 7, 8, 10]; // mixolydian b13
            }
            return [0, 2, 4, 5, 7, 9, 10]; // mixolydian
        case 'minor':
            if (d.seventh === 11) {
                return [0, 2, 3, 5, 7, 9, 11]; // melodic minor
            }
            if (d.sixth) {
                return [0, 2, 3, 5, 7, 9, 10]; // a written 6th is dorian's
            }
            // The key decides the mode: iii is phrygian and vi aeolian in major; i, v are
            // aeolian in minor. ii (major) and iv (minor) — and anything chromatic — dorian.
            if (degree === (key.minor ? -1 : 4)) {
                return [0, 1, 3, 5, 7, 8, 10]; // phrygian
            }
            if (has(8) || (key.minor ? degree === 0 || degree === 7 : degree === 9)) {
                return [0, 2, 3, 5, 7, 8, 10]; // aeolian
            }
            return [0, 2, 3, 5, 7, 9, 10]; // dorian
        case 'half-diminished':
            return has(2) ? [0, 2, 3, 5, 6, 8, 10] : [0, 1, 3, 5, 6, 8, 10];
        case 'diminished':
            return [0, 2, 3, 5, 6, 8, 9, 11]; // whole-half
        case 'augmented':
            return [0, 2, 4, 6, 8, 10];
        case 'sus':
            return has(2) ? [0, 2, 4, 7, 9] : [0, 2, 5, 7, 9, 10];
        case 'power':
            return [0, 3, 5, 7, 10]; // minor pentatonic: rock's neutral colour
    }
}

function guideTones(d: ReturnType<typeof describe>, intervals: number[]): number[] {
    const colour = d.seventh ?? (d.sixth ? 9 : null);
    if (d.third !== null) {
        return colour === null ? [d.third] : [d.third, colour];
    }
    // Suspended: the 4th (or 2nd) carries the tension the 3rd would have.
    const pcs = new Set(intervals.map(mod12));
    const sus = pcs.has(5) ? 5 : pcs.has(2) ? 2 : null;
    return [sus, colour].filter((n): n is number => n !== null);
}

/** Parse a chart symbol (`Dm7`, `bVII^7`, `ii7/5`, `F#7alt`) in a key. Null if unknown. */
export function parseChord(symbol: string, key: KeyContext): ChordFacts | null {
    const text = symbol.replaceAll('♭', 'b').replaceAll('♯', '#').trim();
    const root = parseRoot(text, key);
    if (!root) {
        return null;
    }
    let tail = text.slice(root.length);
    let bass = root.pc;
    if (!FORMULAS.has(tail)) {
        const slash = tail.lastIndexOf('/');
        if (slash < 0) {
            return null;
        }
        const over = parseRoot(tail.slice(slash + 1), key);
        if (!over || over.length !== tail.length - slash - 1) {
            return null;
        }
        bass = over.pc;
        tail = tail.slice(0, slash);
    }
    const formula = FORMULAS.get(tail);
    if (!formula) {
        return null;
    }
    let intervals = [...formula];
    if (root.lowercase && intervals.includes(4)) {
        // `ii7` is a minor seventh and `iv6` a minor sixth: the numeral's case names the third.
        intervals = intervals.map((n) => (n === 4 ? 3 : n));
    }
    const d = describe(intervals);
    const tensions = [...new Set(intervals.filter((n) => n > 11).map(mod12))];
    return {
        symbol,
        root: root.pc,
        bass,
        intervals,
        ...d,
        guides: guideTones(d, intervals),
        tensions,
        scale: reconcile(chordScale(intervals, d, key, root.pc), intervals),
    };
}

/** Chord tones as pitch classes (root-relative intervals folded, then transposed). */
export function chordPcs(chord: ChordFacts): number[] {
    return [...new Set(chord.intervals.map((n) => mod12(chord.root + n)))];
}
