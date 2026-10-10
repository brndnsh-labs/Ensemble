import { LETTERS, mod, NAT, spellFrom } from '../theory';
import type { ChartChord, Quality, Spelled } from '../types';

export type Mode = 'major' | 'minor';
/** How a chord feels in its key. Drives pad colors: home green, away purple, tension orange, visitor dashed. */
export type ChordFunction = 'home' | 'away' | 'tension' | 'visitor';

export interface KeyChord extends ChartChord {
    numeral: string;
    function: ChordFunction;
    /** Plain-language role, e.g. "pulls back home". */
    does: string;
    /** Position in the key's family (0-6), or undefined for visitors. */
    degreeIndex?: number;
}

type Row = [
    interval: number,
    step: number,
    quality: Quality,
    numeral: string,
    fn: ChordFunction,
    does: string,
];
const FAMILY: Record<Mode, Row[]> = {
    major: [
        [0, 0, 'maj7', 'I', 'home', 'home base'],
        [2, 1, 'm7', 'ii', 'away', 'wanders away'],
        [4, 2, 'm7', 'iii', 'home', 'a softer home'],
        [5, 3, 'maj7', 'IV', 'away', 'wanders away, bright'],
        [7, 4, 'dom7', 'V', 'tension', 'pulls back home'],
        [9, 5, 'm7', 'vi', 'home', "home's sad cousin"],
        [11, 6, 'm7b5', 'viiø', 'tension', 'tense, pulls home'],
    ],
    // Minor uses the harmonic-minor V7, as players almost always do
    minor: [
        [0, 0, 'm7', 'i', 'home', 'home base'],
        [2, 1, 'm7b5', 'iiø', 'away', 'wanders away, dark'],
        [3, 2, 'maj7', '♭III', 'home', 'the bright relative'],
        [5, 3, 'm7', 'iv', 'away', 'wanders away'],
        [7, 4, 'dom7', 'V', 'tension', 'pulls back home'],
        [8, 5, 'maj7', '♭VI', 'away', 'wanders away, warm'],
        [10, 6, 'dom7', '♭VII', 'tension', 'leans toward ♭III'],
    ],
};

/** The seven 7th chords that belong to a key, with numerals and functions. */
export function keyFamily(key: Spelled, mode: Mode): KeyChord[] {
    return FAMILY[mode].map(([int, step, quality, numeral, fn, does], i) => ({
        root: spellFrom(key, int, step),
        quality,
        numeral,
        function: fn,
        does,
        degreeIndex: i,
    }));
}

/**
 * A bar in a song shape: a family index (0-6) or a visitor relative to the key.
 * Visitors that turn out to be in the family are reported as family chords.
 */
export type BarSpec =
    | number
    | { interval: number; step: number; quality: Quality; numeral: string; does?: string };

export function resolveBar(key: Spelled, mode: Mode, bar: BarSpec): KeyChord {
    const fam = keyFamily(key, mode);
    if (typeof bar === 'number') {
        return fam[bar];
    }
    const root = spellFrom(key, bar.interval, bar.step);
    const inFam = fam.find((f) => f.root.pc === root.pc && f.quality === bar.quality);
    if (inFam) {
        return inFam;
    }
    return {
        root,
        quality: bar.quality,
        numeral: bar.numeral,
        function: 'visitor',
        does: bar.does ?? 'borrowed from outside the key',
    };
}

const v = (
    interval: number,
    step: number,
    quality: Quality,
    numeral: string,
    does?: string,
): BarSpec => ({ interval, step, quality, numeral, does });

export interface SongShape {
    name: string;
    mode: Mode;
    bars: BarSpec[];
    blurb: string;
}
/** The song shapes from the prototype. Chord progressions only; no melodies or lyrics. */
export const SONG_SHAPES: Record<string, SongShape> = {
    pop: {
        name: 'I–V–vi–IV (pop)',
        mode: 'major',
        bars: [0, 4, 5, 3],
        blurb: 'The four-chord loop behind hundreds of pop hits.',
    },
    fifties: {
        name: 'I–vi–IV–V (’50s)',
        mode: 'major',
        bars: [0, 5, 3, 4],
        blurb: 'The doo-wop loop.',
    },
    jazz: {
        name: 'ii–V–I (jazz)',
        mode: 'major',
        bars: [1, 4, 0, 0],
        blurb: 'Away, tension, home.',
    },
    canon: {
        name: 'Canon (I–V–vi–iii–IV–I–IV–V)',
        mode: 'major',
        bars: [0, 4, 5, 2, 3, 0, 3, 4],
        blurb: 'The Pachelbel-style chain.',
    },
    autumn: {
        name: 'Autumn Leaves (A section)',
        mode: 'major',
        bars: [1, 4, 0, 3, 6, v(4, 2, 'dom7', 'III7', 'a visitor pulling toward vi'), 5, 5],
        blurb: 'One visitor, III7, pulls into vi.',
    },
    blues: {
        name: '12-bar blues',
        mode: 'major',
        bars: [
            v(0, 0, 'dom7', 'I7'),
            v(0, 0, 'dom7', 'I7'),
            v(0, 0, 'dom7', 'I7'),
            v(0, 0, 'dom7', 'I7'),
            v(5, 3, 'dom7', 'IV7'),
            v(5, 3, 'dom7', 'IV7'),
            v(0, 0, 'dom7', 'I7'),
            v(0, 0, 'dom7', 'I7'),
            4,
            v(5, 3, 'dom7', 'IV7'),
            v(0, 0, 'dom7', 'I7'),
            4,
        ],
        blurb: 'Every chord becomes a 7.',
    },
    bridge: {
        name: 'Rhythm changes bridge',
        mode: 'major',
        bars: [
            v(4, 2, 'dom7', 'III7'),
            v(4, 2, 'dom7', 'III7'),
            v(9, 5, 'dom7', 'VI7'),
            v(9, 5, 'dom7', 'VI7'),
            v(2, 1, 'dom7', 'II7'),
            v(2, 1, 'dom7', 'II7'),
            4,
            4,
        ],
        blurb: 'Roots up a 4th, landing on V.',
    },
    minorLoop: {
        name: 'i–iv–V (minor)',
        mode: 'minor',
        bars: [0, 3, 4, 0],
        blurb: 'Home, away, tension, home.',
    },
    minor251: {
        name: 'minor ii–V–i',
        mode: 'minor',
        bars: [1, 4, 0, 0],
        blurb: 'The minor-key ii–V–I.',
    },
    bossa: {
        name: 'Blue Bossa',
        mode: 'minor',
        bars: [
            0,
            0,
            3,
            3,
            1,
            4,
            0,
            0,
            v(3, 2, 'm7', '♭iii'),
            v(8, 5, 'dom7', '♭VI7'),
            v(1, 1, 'maj7', '♭II'),
            v(1, 1, 'maj7', '♭II'),
            1,
            4,
            0,
            4,
        ],
        blurb: 'Visits a new key for four bars.',
    },
};

export const songChart = (key: Spelled, shape: SongShape): KeyChord[] =>
    shape.bars.map((b) => resolveBar(key, shape.mode, b));

/**
 * The parity fixtures name their keys the prototype's way ("B♭", "F♯"). Read one into a
 * `Spelled` by its letter and accidentals; the live app spells through the adapter instead.
 */
export function keyRoot(name: string): Spelled {
    const letter = LETTERS.indexOf(name[0]);
    const acc = [...name.slice(1)].reduce((a, c) => a + (c === '♯' ? 1 : c === '♭' ? -1 : 0), 0);
    return { name, pc: mod(NAT[letter] + acc, 12), letter };
}
