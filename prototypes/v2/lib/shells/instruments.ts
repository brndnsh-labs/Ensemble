import { ordinal } from './theory';
import type { InstrumentDef } from './types';

/**
 * Guitar shells: R–7–3 skips a string (mute it with the root finger), R–3–7 uses neighboring strings.
 * Each pair exists with the root on the 6th, 5th and 4th strings.
 */
export const GUITAR: InstrumentDef = {
    id: 'guitar',
    name: 'Guitar',
    strings: 6,
    maxFret: 15,
    open: { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 },
    letters: 'eBGDAE',
    rootStrings: [6, 5, 4],
    defaultTarget: 3,
    strName: (s) => `${ordinal(s)} string`,
    strShort: (s) => ordinal(s),
    shapes: [
        {
            id: '6A',
            rootString: 6,
            name: 'R–7–3',
            voices: [
                [6, 'R'],
                [4, 'S'],
                [3, 'T'],
            ],
        },
        {
            id: '6B',
            rootString: 6,
            name: 'R–3–7',
            voices: [
                [6, 'R'],
                [5, 'T'],
                [4, 'S'],
            ],
        },
        {
            id: '5A',
            rootString: 5,
            name: 'R–7–3',
            voices: [
                [5, 'R'],
                [3, 'S'],
                [2, 'T'],
            ],
        },
        {
            id: '5B',
            rootString: 5,
            name: 'R–3–7',
            voices: [
                [5, 'R'],
                [4, 'T'],
                [3, 'S'],
            ],
        },
        {
            id: '4A',
            rootString: 4,
            name: 'R–7–3',
            voices: [
                [4, 'R'],
                [2, 'S'],
                [1, 'T'],
            ],
        },
        {
            id: '4B',
            rootString: 4,
            name: 'R–3–7',
            voices: [
                [4, 'R'],
                [3, 'T'],
                [2, 'S'],
            ],
        },
    ],
};

/**
 * Ukulele (GCEA). One grip per root string; the 5th rides along as a helper (role F)
 * so all four strings can be strummed. These grips reproduce the standard uke chords
 * (G7 0212, Am7 0000, F7 2313, Dm7 2213, Cmaj7 0002).
 */
function makeUke(lowG: boolean): InstrumentDef {
    return {
        id: 'uke',
        name: lowG ? 'Ukulele (low G)' : 'Ukulele',
        strings: 4,
        maxFret: 15,
        open: { 1: 69, 2: 64, 3: 60, 4: lowG ? 55 : 67 },
        letters: 'AECG',
        rootStrings: [4, 3, 2, 1],
        defaultTarget: 2,
        strName: (s) => `${'AECG'[s - 1]} string`,
        strShort: (s) => 'AECG'[s - 1],
        shapes: [
            {
                id: 'UG',
                rootString: 4,
                name: 'G-string root',
                voices: [
                    [4, 'R'],
                    [3, 'F'],
                    [2, 'S'],
                    [1, 'T'],
                ],
            },
            {
                id: 'UC',
                rootString: 3,
                name: 'C-string root',
                voices: [
                    [4, 'F'],
                    [3, 'R'],
                    [2, 'T'],
                    [1, 'S'],
                ],
            },
            {
                id: 'UE',
                rootString: 2,
                name: 'E-string root',
                voices: [
                    [4, 'T'],
                    [3, 'S'],
                    [2, 'R'],
                    [1, 'F'],
                ],
            },
            {
                id: 'UA',
                rootString: 1,
                name: 'A-string root',
                voices: [
                    [4, 'S'],
                    [3, 'T'],
                    [2, 'F'],
                    [1, 'R'],
                ],
            },
        ],
    };
}
export const UKULELE = makeUke(false);
/** Same frets as standard uke; only the 4th string sounds an octave lower (matters for audio, not voicing). */
export const UKULELE_LOW_G = makeUke(true);
