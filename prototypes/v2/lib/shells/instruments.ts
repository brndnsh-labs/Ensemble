import { ordinal } from './theory';
import type { InstrumentDef, ShapeDef, ShapeRole } from './types';

/**
 * Closed triads (#1588) on three neighbouring strings, low to high, in all three inversions:
 * root position R–3–5, first inversion 3–5–R, second inversion 5–R–3. Closed means the three
 * notes sit inside one octave, the way a rhythm player grabs a triad on the top strings; the
 * root string is wherever the root lands, so `fretFor` builds each note around it.
 */
function closedTriads(low: number, mid: number, high: number): ShapeDef[] {
    const set = `${low}${mid}${high}`;
    const orders: [string, ShapeRole[]][] = [
        ['R–3–5', ['R', 'T', 'F']],
        ['3–5–R', ['T', 'F', 'R']],
        ['5–R–3', ['F', 'R', 'T']],
    ];
    return orders.map(([name, roles], inversion) => ({
        id: `T${set}-${inversion}`,
        kind: 'triad',
        rootString: [low, mid, high][roles.indexOf('R')],
        name,
        voices: [
            [low, roles[0]],
            [mid, roles[1]],
            [high, roles[2]],
        ],
    }));
}

/** A power chord with its root on `root`: the 5th a string up and the octave root above that. */
const powerChord = (root: number): ShapeDef => ({
    id: `P${root}`,
    kind: 'power',
    rootString: root,
    name: 'R–5–R',
    voices: [
        [root, 'R'],
        [root - 1, 'F'],
        [root - 2, 'O'],
    ],
});

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
            kind: 'shell',
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
            kind: 'shell',
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
            kind: 'shell',
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
            kind: 'shell',
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
            kind: 'shell',
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
            kind: 'shell',
            name: 'R–3–7',
            voices: [
                [4, 'R'],
                [3, 'T'],
                [2, 'S'],
            ],
        },
        // Triads on the top three string sets; the 6–4 set is left out (muddy, #1588).
        ...closedTriads(3, 2, 1),
        ...closedTriads(4, 3, 2),
        ...closedTriads(5, 4, 3),
        // Power chords with the root on the 6th, 5th and 4th strings, the way rock plays them.
        powerChord(6),
        powerChord(5),
        powerChord(4),
    ],
};

/**
 * Ukulele triads (#1588): the standard four-string chords, which are closed triads with one tone
 * doubled so every string rings. Each shape is named for the chord it is in first position; the
 * voicer picks among them. Strings run G C E A (4 → 1), and the re-entrant G means the lowest
 * string is not the lowest note (`inversionOf` reads pitch, not string).
 */
const UKE_TRIADS: ShapeDef[] = [
    // C 0003: G C E C — root on the C string, the root again on top.
    uke('UTC', 'C shape', 3, ['F', 'R', 'T', 'R2']),
    // F 2010: A C F A — root on the E string, the 3rd doubled on the A string.
    uke('UTF', 'F shape', 2, ['T', 'F', 'R', 'T2']),
    // G 0232: G D G B — open root, its octave on the E string, the 3rd on top.
    uke('UTG', 'G shape', 4, ['R', 'F', 'R2', 'T']),
    // A 2100 / Am 2000: A C♯ E A — root on the G string, again on the A string.
    uke('UTA', 'A shape', 4, ['R', 'T', 'F', 'R2']),
    // D 2220 / Dm 2210: A D F♯ A — root on the C string, the 5th doubled.
    uke('UTD', 'D shape', 3, ['F', 'R', 'T', 'F2']),
    // Em 0432: G E G B — root on the C string, the 3rd doubled on the open G and the E string.
    uke('UTE', 'E shape', 3, ['T', 'R', 'T2', 'F']),
];

/**
 * Ukulele power chords: root and 5th, the root doubled. C5 0033 strums all four strings; G5 023x
 * leaves the A string out (its 5th up there would be a five-fret stretch).
 */
const UKE_POWER: ShapeDef[] = [
    { ...uke('UPC', 'C shape', 3, ['F', 'R', 'F2', 'R2']), kind: 'power' },
    {
        id: 'UPG',
        kind: 'power',
        rootString: 4,
        name: 'G shape',
        voices: [
            [4, 'R'],
            [3, 'F'],
            [2, 'R2'],
        ],
    },
];

/** A four-string uke triad shape: `roles` run from the G string (4) to the A string (1). */
function uke(id: string, name: string, rootString: number, roles: ShapeRole[]): ShapeDef {
    return {
        id,
        kind: 'triad',
        rootString,
        name,
        voices: roles.map((role, i) => [4 - i, role] as [number, ShapeRole]),
    };
}

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
                kind: 'shell',
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
                kind: 'shell',
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
                kind: 'shell',
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
                kind: 'shell',
                name: 'A-string root',
                voices: [
                    [4, 'S'],
                    [3, 'T'],
                    [2, 'F'],
                    [1, 'R'],
                ],
            },
            ...UKE_TRIADS,
            ...UKE_POWER,
        ],
    };
}
export const UKULELE = makeUke(false);
/** Same frets as standard uke; only the 4th string sounds an octave lower (matters for audio, not voicing). */
export const UKULELE_LOW_G = makeUke(true);
