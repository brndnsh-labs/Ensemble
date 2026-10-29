// The shell voicer's characterization: what `voiceChart` plays for 7th-chord charts, note for note.
//
// `golden.json` is this engine's own output, frozen: for each chart in `CASES`, every chord's
// shape, root fret, and each note's string, fret, degree, role and finger. It began as the output
// of the HTML prototype the engine was ported from, which is not in this repo; the port matched
// it note for note, and since then the fixture is ours. Nothing outside the engine can
// regenerate it, and nothing needs to.
//
// So a red case here is a CHANGED shell voicing, not necessarily a wrong one. If the change is
// meant, regenerate the fixture and commit it with the change — its diff is the review surface:
//
//   UPDATE_VOICING_GOLDEN=1 npm run test:vitest -- shell-characterization
//
// The charts (`CASES`) are the input and live here; everything under `chords` is output.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GUITAR, UKULELE, UKULELE_LOW_G } from '../instruments';
import type { InstrumentDef } from '../types';
import { allPositions, inHome, voiceChart } from '../voicing';
import { keyRoot, SONG_SHAPES, songChart } from './keys';

const INSTRUMENTS = { guitar: GUITAR, uke: UKULELE, 'uke-low-g': UKULELE_LOW_G } satisfies Record<
    string,
    InstrumentDef
>;
interface Setup {
    ins: keyof typeof INSTRUMENTS;
    /** `classic` keeps a guitar shell's root on the 6th and 5th strings. */
    rootSet: 'all' | 'classic';
}
interface Case extends Setup {
    /** The hand window's lowest fret (the window is six frets), or null for no window. */
    win: number | null;
    song: string;
    key: string;
    mode: string;
}
type GoldenNote = [
    string: number,
    fret: number,
    degree: string,
    role: string,
    finger: number | null,
];
interface GoldenChord {
    sym: string;
    shape: string;
    r: number;
    notes: GoldenNote[];
}
interface GoldenCase extends Case {
    chords: GoldenChord[];
}

const SETUPS: Setup[] = [
    { ins: 'guitar', rootSet: 'all' },
    { ins: 'guitar', rootSet: 'classic' },
    { ins: 'uke', rootSet: 'all' },
];
const WINDOWS = [null, 2, 7];
const SONGS = ['pop', 'fifties', 'canon', 'autumn', 'blues', 'bridge', 'minorLoop', 'bossa'];
const KEYS = ['C', 'F♯', 'B♭'];

const grid = (
    setups: Setup[],
    windows: (number | null)[],
    songs: string[],
    keys: string[],
): Case[] =>
    setups.flatMap((setup) =>
        windows.flatMap((win) =>
            songs.flatMap((song) =>
                keys.map((key) => ({ ...setup, win, song, key, mode: SONG_SHAPES[song].mode })),
            ),
        ),
    );

// The first 216 charts were trimmed from the 360 the fixture began with (#1591) by measurement:
// 410 mutations, one at a time, of the shell costs (`unaryCost`, `transCost`, `handCost`,
// `fingerTransCost`, the instruments' `defaultTarget`), each caught or not by each chart. The 360
// caught 333; the key of A and two songs (the major and minor ii–V–I, which Autumn Leaves and
// Blue Bossa contain) were the sole catcher of none, and those 216 catch the same 333. Nothing
// else comes out free: every other setup, window, song and key is the only catcher of some
// mutation.
//
// The other 57 are for what those 216 could not see (#1604), and raise the 333 to 381:
// - `plagal` and `minorDim` bring the °7 and 6 shells to every setup, window and key. They also
//   make `transCost`'s same-root cost decide: the 216 moved only when it was removed, these
//   move when it drops a twentieth or rises a tenth.
// - Two low-G ukulele charts. It voices as the high-G one does (strings an octave apart are the
//   same string to the voicer), so two charts pin that, on all four uke shell shapes.
// - `walk` in F on the 1–6 window held the one shell grip wider than three frets, Em7♭5's
//   x-x-2-0-3-6, a reach around its open G string. #1607 refuses that grip (`openOneOff`), and
//   the chart now pins what plays instead: Em7♭5 as x-x-2-3-3-3 both times, the chart a
//   palindrome on the 4th string.
// Things no chart can catch, because no shell reaches them: `unaryCost`'s out-of-window cost
// and `fretFor`'s reach (each says why where it is written), and since #1607 `unaryCost`'s
// wide-span cost and `MAX_SPAN` at any value from 2 up (no shell on offer is wider than three
// frets, and no added tone widens a grip past two). So the three mutations `walk` alone caught
// in #1604's count (the wide-span cost nudged either way, `MAX_SPAN` lowered) are caught by
// nothing now; the counts above are that measurement, not a new one.
//
// The last 90 (#1607) are the window the app opens on: frets 1–6, where every chart starts on
// either instrument (`placeNeckHand`; a guitar in a sharp key opened on 2–7 until #1840). The 273 before them never
// voiced it (their windows are none, 2–7 and 7–12), and first position is the only place two
// of #1607's rules act: the open-string credit a ukulele shell earns (`openStringCredit`) and
// the open strings an added tone may leave (`openOneOff`). Every setup, song and key above, at
// window 1. With them the credit nudged to 0.15, 0.25 or 0.3 turns a ukulele chart red; the
// 273 let all three pass. (First position read as ending at the 1st fret or the 6th was
// already caught by the 273, and still is.)
//
// With those 363, removing each of #1607's rules turns charts red: the open-string rule 2, the
// ukulele's open-string credit 11, the barre that frees a root 22, the buried-root rule 38.
// `engine.test.ts` brackets each from both sides.
//
// #1609 moved 68 of the 122 ukulele charts and no guitar chart. A ukulele shell strums every
// string, so it is now costed as the ukulele triads are (the fretting hand's position and each
// voice's step, not the root's path), aimed at first position whenever the window starts at
// the nut, and kept to one grip per symbol (`byHand`, `handFree`, `unifyGrips`, `unaryCost`'s
// target). So the ukulele charts here also move with `triadUnaryCost`, `triadTransCost` and
// `SAME_GRIP_TOLERANCE`, which the 410 mutations above never touched: that count is the
// guitar's now, and the ukulele's share of it has not been measured again. Undoing each part of
// #1609 by itself turns ukulele charts red, and never a guitar one: the first-position target
// 12, its pull (0.45 a fret, back to a window's 0.15) 7, the hand's costs 65, the all-open
// grip's free hand 9, one grip per symbol 21. Letting either rule reach a guitar shell turns
// guitar charts red instead: one grip per symbol 55, the first-position target 20.
//
// The last 6 (#1610) are for the window widened by a fret (`inReach`). Only a guitar held
// to roots on the 6th and 5th strings ever has a window with no grip a player would take, and
// of the 363 just two charts met one (both in B♭, at frets 2–7 and 7–12); neither is a window
// the app opens on. These are, at frets 1–6 and 2–7:
// - `plagal` in E♭ and in E, `minorDim` in C♯ and in D: the °7 and the m7♭5 whose window holds
//   only the buried-root grip, with the root-first one a fret out (E♭°7 x-6-7-5-7-x, D♯m7♭5
//   x-6-7-6-7-x, E°7 x-7-8-6-8-x, Em7♭5 x-7-8-7-8-x). `plagal` in E♭ also ends on the B♭7 that
//   was x-1-0-1-x-x until the open form of a fretted shape became a last resort
//   (`openShapeOneOff`).
// - `bossa` in D at frets 1–6: what the reach leaves alone. Its Em7♭5 is two frets out with
//   its root outside (x-7-8-7-8-x, #1607's accepted case), which is not a reach, and its E♭maj7
//   (x-6-5-7-x-x) is one the costs already chose.
// - `fifties` in B at frets 2–7, the window B opens on: its E is the open 6th string or the 7th
//   fret of the 5th, so Emaj7 has nothing inside, and an open root counts as in the window
//   (0-x-1-1-x-x, between G♯m7 at the 4th fret and F♯7 at the 2nd; with fretted roots only
//   it is x-7-6-8-x-x, up the neck and back for one chord).
// With all 369, removing the wider window turns 6 charts red, removing the open-form rule 2,
// and counting fretted roots only 1 (this one).
//
// #1611 added no chart and moved no grip: it changed FINGERS on 279 chords in 157 of the 369
// charts (264 chords in 147 guitar charts, 12 in 8 high-G ukulele charts, 3 in the two low-G
// ones), every shape, root fret, string, fret, degree and role as it was. The chart plan now
// gives a shell only the fingerings it is taught with (`fingering.ts`'s `taughtAmong`).
// Undoing each part turns charts red here: the idle-index rule 17; the index-behind-the-nut
// rule 53, and that rule made absolute (a finger already down lifted) 15; a marked fingering
// needing no finger of its own 3; the margin at 2.8, where the cheapest stretch gets in, 4.
// Parts no chart here sees, each bracketed in `engine.test.ts` instead: the margin at 0.7 (the
// one choice of fingers 0.8 dearer is the root-first Gm7 x-x-5-3-6-x, never taken here); the
// root-first rule without the margin's help (only the 6th-string °7 below the 4th fret); a
// finger swapped on its string; and the minor 7th's position fingering, 3-1-4, which in practice a
// neighbouring triad gives a reason for — no chart here mixes shells with triads, so the
// pass that kept a triad's fingers beside a shell (gone in #1617) was not seen either.
// Letting 3-1-4 in with no reason turns 17 red, and with any fingering of the neighbour for a
// reason 2.
//
// The last 1 (#1613) is for the book grip a split symbol is held to (`unifyGrips`, `bookGrip`):
// a ukulele `canon` in A at frets 1–6, whose Amaj7 the plan voices as 1-1-0-0 and as 2-4-4-4.
// Holding either is inside the tolerance, the closed one cheaper; it plays 1-1-0-0. None of
// the 369 before it met the rule (in C, F♯ and B♭ no symbol is split between an open grip and
// a cheaper closed one), so #1613 moved none of them, and with the rule off this chart alone
// turns red. #1613's triad forms (`UKE_OPEN_FORMS`) are no shell's, and no chart here sees them.
// (Since #1675 that rule is not `unifyGrips`' any more: see below.)
//
// #1617 added no chart and moved no grip: it changed FINGERS on 265 chords in 150 of the 370
// charts (263 on guitar, 2 on the ukulele), every shape, root fret, string, fret, degree and
// role as it was. A change of fingering now costs only the notes that change finger
// (`fingering.ts`'s `fingerTransCost`): the charge for a finger's travel is gone, and with it
// every second fingering no held note explains. Before, 45 grips here took two fingerings in
// one chart, off their default 58 times and 48 of those keeping no note; now 12 do, 14 times,
// each keeping one. All but
// four of the 55 distinct changes are a second fingering going back to the grip's default
// (B♭7 x-1-x-1-3-x 1-2-4 to 1-2-3, Gm7 3-x-3-3-x-x 2-3-4 to 1-2-3); the four take a second
// one to keep a note (C7 x-3-x-3-5-x 1-2-4 after C6, the little finger staying). Putting the
// travel back turns 150 charts red. Capped at a lift and a place it turns none red here: what
// the cap leaves is a barre chosen over a fingertip each by the count of fingers, and no
// shell chart has one. `engine.test.ts` holds that, and #1617's triad rules, which no chart
// here sees either.
//
// #1675 added no chart and moved 17 chords in 9 of the 121 high-G ukulele charts, no guitar
// chart and neither low-G one: a ukulele chord that has a book grip in first position is voiced
// from those alone (`candidates`, `bookGrip`), where before the open grip was only preferred
// when the plan had split the symbol. All in B♭, unlocked and at frets 1–6 (Gm7 and B♭6
// 3-5-3-5 to 0-2-1-1, B♭7 3-5-4-5 to 1-2-1-1, B♭°7 and E°7 3-4-3-4 to 0-1-0-1, and a
// B♭maj7 that follows its Gm7 down, 3-5-5-5 to 2-2-1-1), and the C♯m7 of the `canon` in A
// (4-4-4-4 to 1-1-0-2). With the rule off those 9 turn red. Its other rule, the five-fret
// reach as a last resort (`fiveFretReach`), is no shell's: no ukulele shell is that wide, and
// `engine.test.ts` holds it on triads.
//
// So add charts freely, after the ones here, so the fixture's diff is additions only; measure
// before dropping one (45 of the 436 mutations tried are caught by exactly one chart).
const classic = (win: number, song: string, key: string): Case => ({
    ins: 'guitar',
    rootSet: 'classic',
    win,
    song,
    key,
    mode: SONG_SHAPES[song].mode,
});
const REACH_CASES: Case[] = [
    classic(1, 'plagal', 'E♭'),
    classic(1, 'minorDim', 'C♯'),
    classic(2, 'plagal', 'E'),
    classic(2, 'minorDim', 'D'),
    classic(1, 'bossa', 'D'),
    classic(2, 'fifties', 'B'),
];

const CASES: Case[] = [
    ...grid(SETUPS, WINDOWS, SONGS, KEYS),
    ...grid(SETUPS, WINDOWS, ['plagal', 'minorDim'], KEYS),
    ...grid([{ ins: 'uke-low-g', rootSet: 'all' }], [null], ['plagal', 'minorDim'], ['C']),
    ...grid([{ ins: 'guitar', rootSet: 'all' }], [1], ['walk'], ['F']),
    ...grid(SETUPS, [1], [...SONGS, 'plagal', 'minorDim'], KEYS),
    ...REACH_CASES,
    ...grid([{ ins: 'uke', rootSet: 'all' }], [1], ['canon'], ['A']),
];

const label = (c: Case): string =>
    `${c.ins} ${c.rootSet} win=${c.win ?? 'any'} ${c.song} in ${c.key}`;

function voice(c: Case): GoldenChord[] {
    const voiced = voiceChart(songChart(keyRoot(c.key), SONG_SHAPES[c.song]), {
        instrument: INSTRUMENTS[c.ins],
        home: c.win === null ? null : [c.win, c.win + 5],
        rootStrings: c.ins === 'guitar' && c.rootSet === 'classic' ? [6, 5] : undefined,
    });
    return voiced.map((v) => ({
        sym: v.symbol,
        shape: v.shape.id,
        r: v.rootFret,
        notes: v.notes.map((n): GoldenNote => [n.string, n.fret, n.degree, n.role, n.finger]),
    }));
}

/**
 * The fixture as Biome formats it (it is inside `npm run lint`): four-space indent, a chord's
 * notes on one line when that fits the 100-column width, else a note per line. Written here, so
 * an update never needs a format pass and a diff shows voicings only.
 */
function serialize(cases: GoldenCase[]): string {
    const WIDTH = 100;
    const pad = (depth: number) => ' '.repeat(depth * 4);
    const note = (n: GoldenNote) => `[${n.map((x) => JSON.stringify(x)).join(', ')}]`;
    const notes = (ns: GoldenNote[]): string => {
        const line = `${pad(4)}"notes": [${ns.map(note).join(', ')}]`;
        return line.length <= WIDTH
            ? line
            : `${pad(4)}"notes": [\n${ns.map((n) => pad(5) + note(n)).join(',\n')}\n${pad(4)}]`;
    };
    const chord = (ch: GoldenChord) =>
        [
            `${pad(3)}{`,
            `${pad(4)}"sym": ${JSON.stringify(ch.sym)},`,
            `${pad(4)}"shape": ${JSON.stringify(ch.shape)},`,
            `${pad(4)}"r": ${ch.r},`,
            notes(ch.notes),
            `${pad(3)}}`,
        ].join('\n');
    const one = (c: GoldenCase) =>
        [
            `${pad(1)}{`,
            ...(['ins', 'rootSet', 'win', 'song', 'key', 'mode'] as const).map(
                (k) => `${pad(2)}"${k}": ${JSON.stringify(c[k])},`,
            ),
            `${pad(2)}"chords": [`,
            c.chords.map(chord).join(',\n'),
            `${pad(2)}]`,
            `${pad(1)}}`,
        ].join('\n');
    return `[\n${cases.map(one).join(',\n')}\n]\n`;
}

const FIXTURE = new URL('./golden.json', import.meta.url);
const HINT =
    'a shell voicing changed; if that is the point of this change, run ' +
    '`UPDATE_VOICING_GOLDEN=1 npm run test:vitest -- shell-characterization` and commit golden.json';

if (process.env.UPDATE_VOICING_GOLDEN === '1') {
    describe('shell voicings: writing golden.json', () => {
        it(`writes ${CASES.length} charts`, () => {
            writeFileSync(FIXTURE, serialize(CASES.map((c) => ({ ...c, chords: voice(c) }))));
        });
    });
} else {
    const golden: GoldenCase[] = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const frozen = new Map(golden.map((g) => [label(g), g]));

    describe('shell voicings match golden.json', () => {
        // A chart added to or dropped from `CASES` without an update is caught here, not skipped.
        it(`golden.json holds exactly these ${CASES.length} charts`, () => {
            expect(golden.map(label), HINT).toEqual(CASES.map(label));
        });
        for (const c of CASES) {
            it(label(c), () => {
                expect({ ...c, chords: voice(c) }, HINT).toEqual(frozen.get(label(c)));
            });
        }
    });

    // #1613's acceptance, held on the fixture: a ukulele grip never reaches across five
    // frets while the chord has a narrower grip inside the same window. None does (nor did
    // any before #1613: the wide grips it removed were triads, which `engine.test.ts` sweeps).
    describe('no ukulele grip in golden.json is five frets wide where a narrower one fits', () => {
        const span = (frets: number[]): number => {
            const fretted = frets.filter((f) => f > 0);
            return fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
        };
        it('in every ukulele chart', () => {
            const wide: string[] = [];
            for (const c of CASES.filter((x) => x.ins !== 'guitar')) {
                const home: [number, number] | null = c.win === null ? null : [c.win, c.win + 5];
                const chart = songChart(keyRoot(c.key), SONG_SHAPES[c.song]);
                frozen.get(label(c))?.chords.forEach((chord, i) => {
                    const narrower = allPositions(
                        INSTRUMENTS[c.ins],
                        chart[i].root,
                        chart[i].quality,
                    ).some((v) => inHome(v, home) && span(v.notes.map((n) => n.fret)) < 4);
                    if (span(chord.notes.map((n) => n[1])) >= 4 && narrower) {
                        wide.push(`${label(c)}: ${chord.sym}`);
                    }
                });
            }
            expect(wide).toEqual([]);
        });
    });
}
