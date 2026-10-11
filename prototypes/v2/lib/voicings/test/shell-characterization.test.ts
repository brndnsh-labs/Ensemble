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
import { GUITAR, UKULELE, voiceChart } from '../index';
import { keyRoot, SONG_SHAPES, songChart } from './keys';

interface Setup {
    ins: 'guitar' | 'uke';
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

// 216 charts, trimmed from the 360 the fixture began with (#1591) by measurement: 410 mutations,
// one at a time, of the shell costs (`unaryCost`, `transCost`, `handCost`, `fingerTransCost`, the
// instruments' `defaultTarget`), each caught or not by each chart. The 360 caught 333; the key of
// A and two songs (the major and minor ii–V–I, which Autumn Leaves and Blue Bossa contain) were
// the sole catcher of none, and this set catches the same 333. Nothing else comes out free:
// every other setup, window, song and key is the only catcher of some mutation, and 18 of the
// 333 are caught by exactly one chart. So add charts freely; measure before dropping one.
const CASES: Case[] = SETUPS.flatMap((setup) =>
    WINDOWS.flatMap((win) =>
        SONGS.flatMap((song) =>
            KEYS.map((key) => ({ ...setup, win, song, key, mode: SONG_SHAPES[song].mode })),
        ),
    ),
);

const label = (c: Case): string =>
    `${c.ins} ${c.rootSet} win=${c.win ?? 'any'} ${c.song} in ${c.key}`;

function voice(c: Case): GoldenChord[] {
    const voiced = voiceChart(songChart(keyRoot(c.key), SONG_SHAPES[c.song]), {
        instrument: c.ins === 'guitar' ? GUITAR : UKULELE,
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
}
