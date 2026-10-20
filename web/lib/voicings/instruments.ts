import { ordinal } from './theory';
import type { InstrumentDef, Quality, ShapeDef, ShapeRole } from './types';

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
 * The guitar's open chords, as the method books print them for the first lessons (#1833): the
 * CAGED open forms C, A, G, E and D, their minors Am, Em and Dm, the sus chords on the open A,
 * D and E (Asus2, Asus4, Dsus2, Dsus4, Esus4) with Csus4 x-3-3-0-1-1 and Fsus2 x-x-3-0-1-1, and
 * the three open power chords. Each is `[root pitch class, quality, frets low E first]`. A
 * guitar triad or power grip earns its open strings' credit only as part of one of these
 * (`openFormGrip` in `voicing.ts`): E x-x-2-1-0-x is the open E's middle, A x-x-x-2-2-0 the open
 * A's top. Any other grip that rings an open string is a chord no teacher shows, however
 * little it costs the hand (E♭ x-1-1-0-x-x, B♭ in the bass; Cm x-3-1-0-x-x).
 *
 * Only forms that ring an open string are listed, since no other grip is credited; the closed
 * forms (F, B♭, Bm) need none. Left out on purpose, being grips a chord dictionary prints and
 * a beginner's book does not: Gm 3-1-0-0-3-3, Csus2 x-3-0-0-1-3, Gsus4 3-3-0-0-1-3. The
 * diminished and augmented triads have no forms here, and so are not judged (`openFormGrip`).
 */
export const GUITAR_OPEN_CHORDS: readonly [number, Quality, string][] = [
    [0, 'maj', 'x 3 2 0 1 0'], // C
    [9, 'maj', 'x 0 2 2 2 0'], // A
    [7, 'maj', '3 2 0 0 0 3'], // G
    [4, 'maj', '0 2 2 1 0 0'], // E
    [2, 'maj', 'x x 0 2 3 2'], // D
    [9, 'min', 'x 0 2 2 1 0'], // Am
    [4, 'min', '0 2 2 0 0 0'], // Em
    [2, 'min', 'x x 0 2 3 1'], // Dm
    [9, 'sus2', 'x 0 2 2 0 0'], // Asus2
    [2, 'sus2', 'x x 0 2 3 0'], // Dsus2
    [5, 'sus2', 'x x 3 0 1 1'], // Fsus2
    [0, 'sus4', 'x 3 3 0 1 1'], // Csus4
    [9, 'sus4', 'x 0 2 2 3 0'], // Asus4
    [2, 'sus4', 'x x 0 2 3 3'], // Dsus4
    [4, 'sus4', '0 2 2 2 0 0'], // Esus4
    [4, 'five', '0 2 2 x x x'], // E5
    [9, 'five', 'x 0 2 2 x x'], // A5
    [2, 'five', 'x x 0 2 3 x'], // D5
];

/**
 * First-position chords that are not a moving shape (#1613): each is the book grip for ONE
 * root, made by an open string, and the six shapes of `UKE_TRIADS` cannot reach it — they
 * voiced Fm as 1543 (a five-fret reach), E as 1442 or 4442 and Cm as 5333. Every ukulele method
 * prints these instead.
 *
 * Each is held to the qualities it is taught for (`ShapeDef.qualities`) and to the place its
 * open string rings (`ShapeDef.openOnly`), because moved or re-coloured the same layout is a
 * grip nobody shows: the Fm form as a major chord is F 2013, a finger more than the book's
 * 2010, and a fret up it is F♯m 2124 for the book's 2120; the E form as a minor is Em 0402
 * for the book's 0432. Left free, the costs took all three.
 *
 * Two of them serve a sus chord as well (#1675), one finger from the chord beside it: the E
 * form with its 3rd moved up a fret is Esus4 2402, and the Cm form with its 3rd moved down one
 * is Csus2 0233 (the grip every book prints for Gsus4, which is the same three notes). Asus2
 * 2402 is a form of its own: the same four frets as Esus4 and the same three notes, with A
 * named as the root. Without it Asus2 was 2452 or 4452, a barre at the 2nd or 4th fret beside
 * the open A 2100.
 *
 * The one form that leaves its open string is the Cm form's sus2, and only inside the 4th fret
 * (#1688, `buildAt`): a fret up from Csus2 it is D♭sus2 1344, the book's grip. Any further up
 * it would be a moving shape the costs take over the book's (Esus2 4677 for 4422).
 */
const UKE_OPEN_FORMS: ShapeDef[] = [
    // Fm 1013: A♭ C F C — the 3rd, the open C string's 5th, the root, the 5th again on top.
    openForm('UTFm', 'Fm form', 2, ['T', 'F', 'R', 'F2'], ['min']),
    // E 1402: G♯ E E B — the 3rd, the root, the open E string's root, the 5th.
    // Esus4 2402: A E E B — the 4th in the 3rd's seat.
    openForm('UTEo', 'E form', 3, ['T', 'R', 'R2', 'F'], ['maj', 'sus4']),
    // Cm 0333: G E♭ G C — the open G string's 5th, the 3rd, the 5th again, the root on top.
    // Csus2 0233: G D G C — the 2nd in the 3rd's seat.
    openForm('UTCm', 'Cm form', 1, ['F', 'T', 'F2', 'R'], ['min', 'sus2']),
    // Asus2 2402: A E E B — the root, the 5th, the open E string's 5th, the 2nd on top.
    openForm('UTAs', 'Asus2 form', 4, ['R', 'F', 'F2', 'T'], ['sus2']),
];

/**
 * Ukulele triads (#1588): the standard four-string chords, which are closed triads with one tone
 * doubled so every string rings. Each shape is named for the chord it is in first position; the
 * voicer picks among them. Strings run G C E A (4 → 1), and the re-entrant G means the lowest
 * string is not the lowest note (`inversionOf` reads pitch, not string).
 */
// The six that move: each is the first-position chord it is named for, and the same grip up
// the neck for every other root.
const UKE_MOVING: ShapeDef[] = [
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

/** A doubled role's plain name: R2 is R, T2 is T, F2 is F. */
const single = (role: ShapeRole): ShapeRole =>
    role === 'R2' ? 'R' : role === 'T2' ? 'T' : role === 'F2' ? 'F' : role;

/**
 * A moving triad shape with an add9's 9th (role N, #1820) on string `seat`, one of the two
 * strings the shape doubles a tone on; the other keeps that tone. Nothing else changes, so an
 * add9 is the triad grip a student already holds with one note moved, and it is offered, costed
 * and fingered as that triad is. A root that stays is `R` wherever it sits (`rootString`, and
 * every reader that finds the root).
 */
function addNine(shape: ShapeDef, seat: number): ShapeDef {
    const doubled = single(shape.voices.find(([s]) => s === seat)![1]);
    const voices = shape.voices.map(
        ([s, role]) =>
            [s, s === seat ? 'N' : single(role) === doubled ? doubled : role] as [
                number,
                ShapeRole,
            ],
    );
    return {
        id: `${shape.id}9`,
        kind: 'triad',
        rootString: voices.find(([, role]) => role === 'R')![0],
        name: `${shape.name}, 9th on the ${'AECG'[seat - 1]} string`,
        voices,
    };
}

/**
 * The add9 grips (#1820): the moving shapes with the 9th in the doubled seat the
 * chord charts put it in (kytary.cz and ukutabs.com, read 2026-10-20). The other seat of each
 * pair is not offered: those grips are printed nowhere, and the two that ring an open string in
 * first position (Aadd9 4-1-0-0, the A shape's G-string root as the 9th, and Gadd9 4-2-3-0, the
 * F shape's A-string 3rd) took the chord from the book's grip (`bookGrip` in `voicing.ts`). The
 * D shape is left out: no chart prints an add9 on its doubled 5th.
 */
const UKE_ADD9: ShapeDef[] = [
    // Cadd9 0203, D♭add9 1314, Dadd9 2425: the C shape, its C-string root as the 9th.
    addNine(UKE_MOVING[0], 3),
    // Fadd9 0010, F♯add9 1121, Gadd9 2232, A♭add9 3343: the F shape, its G-string 3rd as the
    // 9th (the G shape with its G-string root as the 9th is the same grip).
    addNine(UKE_MOVING[1], 4),
    // Gadd9 0252: the G shape, its E-string root as the 9th (ukutabs's grip).
    addNine(UKE_MOVING[2], 2),
    // Aadd9 2102, B♭add9 3213, Badd9 4324: the A shape, its A-string root as the 9th.
    addNine(UKE_MOVING[3], 1),
    // E♭add9 0311, Eadd9 1422: the E shape, its E-string 3rd as the 9th.
    addNine(UKE_MOVING[5], 2),
];

const UKE_TRIADS: ShapeDef[] = [
    ...UKE_MOVING,
    ...UKE_OPEN_FORMS,
    // F♯sus2 1124 / Fsus2 0013: G♯ C♯ F♯ C♯ — the Fm form's layout with the 2nd in the 3rd's
    // seat, and for a sus2 it is a shape that moves (index across the two low strings).
    { ...uke('UTFs', 'Fsus2 shape', 2, ['T', 'F', 'R', 'F2']), qualities: ['sus2'] },
    ...UKE_ADD9,
];

/**
 * The ukulele's two-string power chords (#1809): a root and its 5th on two neighbouring strings,
 * the others left silent. A ukulele has no first-position power grip on four strings for most
 * roots (F♯5 is 6-6-9-9, B5 4-6-7-x on the shapes above), and these are what the chord charts
 * print at the nut instead (ukutabs.com: F5 x-0-1-x, F♯5/G♭5 x-1-2-x, B♭5 x-x-1-1, B5 x-x-2-2,
 * each "the simplest playable grip"; read 2026-10-19). Two shapes, each moving with its root:
 *
 * - 5th on the C string, root on the E string a fret or two up: G5 0-2-3-x less its open G.
 * - 5th on the E string, root on the A string at the same fret: C5 0-0-3-3 less its two low
 *   strings.
 *
 * Both are `nutOnly`, and `candidates` in `voicing.ts` offers them only to a chord with no
 * other grip inside the 4th fret: four strings (C5 0-0-3-3, A5 2-4-0-0, D♭5 1-1-4-4) or three
 * (G5 0-2-3-x, A♭5 1-3-4-x). A muted string costs the plan nothing, so offered beside those
 * they took G5 to x-2-3-x and A♭5 to x-3-4-x, grips no chart gives instead. So these four are
 * all they ever play.
 */
const UKE_TWO_STRING_POWER: ShapeDef[] = [
    {
        id: 'UP2C',
        kind: 'power',
        rootString: 2,
        name: 'C–E strings',
        nutOnly: true,
        voices: [
            [3, 'F'],
            [2, 'R'],
        ],
    },
    {
        id: 'UP2E',
        kind: 'power',
        rootString: 1,
        name: 'E–A strings',
        nutOnly: true,
        voices: [
            [2, 'F'],
            [1, 'R'],
        ],
    },
];

/**
 * Ukulele power chords: root and 5th, the root doubled. C5 0033 strums all four strings; G5 023x
 * leaves the A string out (its 5th up there would be a five-fret stretch). The two-string grips
 * at the nut (F5 x01x, F♯5 x12x, B♭5 xx11, B5 xx22) are `UKE_TWO_STRING_POWER`'s.
 *
 * Two more are first-position forms like `UKE_OPEN_FORMS` (#1675), each for the one root whose
 * open strings make it: A5 2400 and E5 4402. The two shapes above gave A5 as 245x, a string
 * short, and E5 as 4477, which no window from the nut holds (in frets 1–6 it went to the 9th
 * fret).
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
    // A5 2400: A E E A — the root, the 5th, and the open E and A strings.
    { ...openForm('UPA', 'A5 form', 4, ['R', 'F', 'F2', 'R2'], ['five']), kind: 'power' },
    // E5 4402: B E E B — the 5th, the root, the open E string's root, the 5th on top.
    { ...openForm('UPE', 'E5 form', 3, ['F', 'R', 'R2', 'F2'], ['five']), kind: 'power' },
    ...UKE_TWO_STRING_POWER,
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

/** A first-position form: one layout, for the qualities named, offered only on its open string. */
function openForm(
    id: string,
    name: string,
    rootString: number,
    roles: ShapeRole[],
    qualities: Quality[],
): ShapeDef {
    return { ...uke(id, name, rootString, roles), qualities, openOnly: true };
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
