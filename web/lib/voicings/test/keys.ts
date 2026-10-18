import { LETTERS, mod, NAT, spellFrom } from '../theory';
import type { ChartChord, Quality, Spelled } from '../types';

export type Mode = 'major' | 'minor';

export interface KeyChord extends ChartChord {
    numeral: string;
}

type Row = [interval: number, step: number, quality: Quality, numeral: string];
const FAMILY: Record<Mode, Row[]> = {
    major: [
        [0, 0, 'maj7', 'I'],
        [2, 1, 'm7', 'ii'],
        [4, 2, 'm7', 'iii'],
        [5, 3, 'maj7', 'IV'],
        [7, 4, 'dom7', 'V'],
        [9, 5, 'm7', 'vi'],
        [11, 6, 'm7b5', 'viiø'],
    ],
    // Minor uses the harmonic-minor V7, as players almost always do
    minor: [
        [0, 0, 'm7', 'i'],
        [2, 1, 'm7b5', 'iiø'],
        [3, 2, 'maj7', '♭III'],
        [5, 3, 'm7', 'iv'],
        [7, 4, 'dom7', 'V'],
        [8, 5, 'maj7', '♭VI'],
        [10, 6, 'dom7', '♭VII'],
    ],
};

/** The seven 7th chords that belong to a key, with numerals. */
export function keyFamily(key: Spelled, mode: Mode): KeyChord[] {
    return FAMILY[mode].map(([int, step, quality, numeral]) => ({
        root: spellFrom(key, int, step),
        quality,
        numeral,
    }));
}

/**
 * A bar in a song shape: a family index (0-6) or a visitor relative to the key.
 * Visitors that turn out to be in the family are reported as family chords.
 */
export type BarSpec =
    | number
    | { interval: number; step: number; quality: Quality; numeral: string };

export function resolveBar(key: Spelled, mode: Mode, bar: BarSpec): KeyChord {
    const fam = keyFamily(key, mode);
    if (typeof bar === 'number') {
        return fam[bar];
    }
    const root = spellFrom(key, bar.interval, bar.step);
    const inFam = fam.find((f) => f.root.pc === root.pc && f.quality === bar.quality);
    return inFam ?? { root, quality: bar.quality, numeral: bar.numeral };
}

const v = (interval: number, step: number, quality: Quality, numeral: string): BarSpec => ({
    interval,
    step,
    quality,
    numeral,
});

export interface SongShape {
    mode: Mode;
    bars: BarSpec[];
}
/**
 * The charts the shell characterization voices (`shell-characterization.test.ts` lists the ones
 * it runs). Chord progressions only; no melodies or lyrics.
 */
export const SONG_SHAPES: Record<string, SongShape> = {
    // I–V–vi–IV
    pop: { mode: 'major', bars: [0, 4, 5, 3] },
    // I–vi–IV–V, the doo-wop loop
    fifties: { mode: 'major', bars: [0, 5, 3, 4] },
    // The canon chain: I–V–vi–iii–IV–I–IV–V
    canon: { mode: 'major', bars: [0, 4, 5, 2, 3, 0, 3, 4] },
    // Autumn Leaves, A section: a ii–V–I, then one visitor (III7) pulling into vi
    autumn: { mode: 'major', bars: [1, 4, 0, 3, 6, v(4, 2, 'dom7', 'III7'), 5, 5] },
    // 12-bar blues: every chord a 7
    blues: {
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
    },
    // Rhythm changes bridge: roots up a 4th, landing on V
    bridge: {
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
    },
    // i–iv–V–i
    minorLoop: { mode: 'minor', bars: [0, 3, 4, 0] },
    // Blue Bossa: a minor ii–V–i, and four bars in a new key
    bossa: {
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
    },
    // I6–I7–IV–iv–I6–I°7–ii–V: the 6 and dim7 shells, and three chords that change quality on
    // one root (I6→I7, IV→iv, I6→I°7), which is what `transCost`'s same-root term prices
    plagal: {
        mode: 'major',
        bars: [
            v(0, 0, 'six', 'I6'),
            v(0, 0, 'dom7', 'I7'),
            3,
            v(5, 3, 'm7', 'iv'),
            v(0, 0, 'six', 'I6'),
            v(0, 0, 'dim7', 'I°7'),
            1,
            4,
        ],
    },
    // i–I7–iv–♯iv°7–V–i–iiø–V: the tonic turns dominant to reach iv, and a dim7 passes up to V
    minorDim: {
        mode: 'minor',
        bars: [0, v(0, 0, 'dom7', 'I7'), 3, v(6, 3, 'dim7', '♯iv°7'), 4, 0, 1, 4],
    },
    // vi–viiø–I–ii–I–viiø–vi: the scale walked up and back. In F its viiø is Em7♭5, which
    // once took x-x-2-0-3-6 on the way down, a reach around its open G string (`openOneOff`)
    walk: { mode: 'major', bars: [5, 6, 0, 1, 0, 6, 5] },
};

export const songChart = (key: Spelled, shape: SongShape): KeyChord[] =>
    shape.bars.map((b) => resolveBar(key, shape.mode, b));

/**
 * The fixture names its keys with the accidental signs ("B♭", "F♯"). Read one into a `Spelled`
 * by its letter and accidentals; the live app spells through the adapter instead.
 */
export function keyRoot(name: string): Spelled {
    const letter = LETTERS.indexOf(name[0]);
    const acc = [...name.slice(1)].reduce((a, c) => a + (c === '♯' ? 1 : c === '♭' ? -1 : 0), 0);
    return { name, pc: mod(NAT[letter] + acc, 12), letter };
}
