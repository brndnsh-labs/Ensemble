/**
 * The chord-symbol answer key: what a chord symbol means according to someone other than the
 * band. The band's own tests check the band against `band/theory/chord.ts`; if that table
 * misreads a symbol, every test agrees with the mistake. This reads the same symbol from the
 * `@tonaljs/chord` dictionary instead, so `chord-oracle.test.ts` can hold the band to it.
 *
 * Three kinds of answer, in order of how far they can be trusted:
 * - `library`: the dictionary knows the spelling, or knows the chord under the name in
 *   `ALIASES` (a notation difference only: iReal's `-7#5` is the dictionary's `m7#5`).
 * - `composed`: the dictionary has no such chord, so it is built from one it has plus the
 *   notes the symbol itself names (`maj7#9` = its `maj7` and a ♯9). `COMPOSED` holds those.
 * - none: a spelling in neither table has no reference, and the oracle fails until it gets one.
 *
 * Never fill a row from what the band plays: an answer key copied from the answers checks
 * nothing. A row comes from the dictionary or from the name of the chord.
 */
import { get as libraryChord, getChord as libraryType } from '@tonaljs/chord';

/** Interval names as the dictionary writes them: `3M`, `7m`, `5A` (♯5), `13m` (♭13)… */
export interface ReferenceChord {
    intervals: ReadonlySet<string>;
    /** The same tones as semitones above the root, 0–11. */
    tones: ReadonlySet<number>;
    source: 'library' | 'composed';
}

/**
 * Band spelling → the dictionary's name for the same chord. The first two are the iReal
 * grammar the chart codec follows, where the dictionary reads the bare spelling differently:
 * `^` alone is a major seventh (the dictionary: a triad), and `2` is a sus2 (the dictionary:
 * add9).
 */
export const ALIASES: Readonly<Record<string, string>> = {
    '^': 'maj7',
    '2': 'sus2',
    ma: 'M',
    '△': 'maj7',
    '△7': 'maj7',
    Δ7: 'maj7',
    ma9: 'maj9',
    '△9': 'maj9',
    ma13: 'maj13',
    'maj7+': 'maj7#5',
    'M7#5': 'maj7#5',
    'M7+': 'maj7#5',
    maj7b5: 'M7b5',
    min13: 'm13',
    'm+5': 'm#5',
    'min#5': 'm#5',
    'min+5': 'm#5',
    '-+5': 'm#5',
    'm7+5': 'm7#5',
    'min7#5': 'm7#5',
    'min7+5': 'm7#5',
    '-7#5': 'm7#5',
    '-7+5': 'm7#5',
    'min(add4)': 'madd4',
    ø7: 'm7b5',
    h9: 'm9b5',
    '7(add13)': '7add13',
    alt: '7alt',
};

/** Band spelling → a dictionary chord plus the intervals the symbol names on top of it. */
export const COMPOSED: Readonly<Record<string, readonly [base: string, ...added: string[]]>> = {
    maj11: ['maj9', '11P'],
    ma11: ['maj9', '11P'],
    'maj7#9': ['maj7', '9A'],
    'maj(add4)': ['M', '4P'],
    'min^11': ['mMaj9', '11P'],
    // No 11th, as the dictionary's own 13th chords have none (its m13 is 1 ♭3 5 ♭7 9 13).
    'min^13': ['mMaj9', '13M'],
    '-b6': ['m', '6m'],
    mb6: ['m', '6m'],
    minb6: ['m', '6m'],
    min7b6: ['m7', '6m'],
    min9b6: ['m9', '6m'],
    '7b13sus': ['7sus4', '13m'],
    '7susadd3': ['7sus4', '3M'],
};

const NUMBER_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** `13m` → 8: a dictionary interval as semitones above the root, folded into one octave. */
function intervalSemitones(interval: string): number {
    const match = /^(\d+)([PMmAd])$/.exec(interval);
    if (!match) {
        throw new Error(`unreadable interval ${interval}`);
    }
    const step = (Number(match[1]) - 1) % 7;
    const perfect = step === 0 || step === 3 || step === 4;
    const shift = { P: 0, M: 0, m: -1, A: 1, d: perfect ? -1 : -2 }[match[2]] as number;
    return (NUMBER_SEMITONES[step] + shift + 12) % 12;
}

function fromIntervals(intervals: string[], source: ReferenceChord['source']): ReferenceChord {
    return {
        intervals: new Set(intervals),
        tones: new Set(intervals.map(intervalSemitones)),
        source,
    };
}

/** The reference reading of a quality spelling (`m7b5`, `^9#11`, `7alt`), or null if none. */
export function referenceQuality(quality: string): ReferenceChord | null {
    const composed = Object.hasOwn(COMPOSED, quality) ? COMPOSED[quality] : null;
    if (composed) {
        const [base, ...added] = composed;
        const chord = libraryType(base, 'C');
        if (chord.empty) {
            throw new Error(
                `COMPOSED['${quality}'] builds on '${base}', which the dictionary lacks`,
            );
        }
        return fromIntervals([...chord.intervals, ...added], 'composed');
    }
    const name = Object.hasOwn(ALIASES, quality)
        ? ALIASES[quality]
        : quality === ''
          ? 'M'
          : quality;
    const chord = libraryType(name, 'C');
    return chord.empty ? null : fromIntervals(chord.intervals, 'library');
}

/** Whether the dictionary reads this spelling as written, with no help from the tables. */
export function libraryKnows(quality: string): boolean {
    return !libraryType(quality, 'C').empty;
}

const LETTER: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pitchClass(note: string): number {
    const match = /^([A-G])([#b]*)$/.exec(note);
    if (!match) {
        throw new Error(`unreadable note ${note}`);
    }
    const shift = match[2].startsWith('#') ? match[2].length : -match[2].length;
    return (LETTER[match[1]] + shift + 12) % 12;
}

/**
 * The dictionary's reading of a whole note-name symbol's root and slash bass (`Bbm7/Ab` → 10
 * and 8), or null where it cannot read the symbol as written.
 */
export function referenceRoot(symbol: string): { root: number; bass: number } | null {
    const chord = libraryChord(symbol);
    if (chord.empty || !chord.tonic) {
        return null;
    }
    const root = pitchClass(chord.tonic);
    return { root, bass: chord.bass ? pitchClass(chord.bass) : root };
}
