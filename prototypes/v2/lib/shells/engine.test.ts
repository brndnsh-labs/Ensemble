import { parseChord } from '@band/index';
import { describe, expect, it } from 'vitest';
import {
    allPositions,
    build,
    fingerMoves,
    GUITAR,
    handTravel,
    type InstrumentDef,
    inHome,
    type Quality,
    rootMove,
    shellChord,
    spellRoot,
    UKULELE,
    type Voicing,
    voiceChart,
    voiceNext,
} from './index';
import { keyFamily, keyRoot } from './test/keys';

const tab = (inst: InstrumentDef, v: Voicing) => {
    const m = new Map(v.notes.map((n) => [n.string, n.fret]));
    return Array.from({ length: inst.strings }, (_, i) => inst.strings - i)
        .map((s) => m.get(s) ?? 'x')
        .join(' ');
};
const R = keyRoot;
/** The twelve roots, spelled as a chart in C spells them. */
const ROOTS = Array.from({ length: 12 }, (_, pc) => spellRoot(pc, 'C', false));
const shape = (inst: InstrumentDef, id: string) => inst.shapes.find((s) => s.id === id)!;

describe('"All the notes are right there"', () => {
    for (const inst of [GUITAR, UKULELE]) {
        it(`${inst.name}: every maj7, 7 and m7 in all 12 keys fits in any 6-fret window`, () => {
            for (let w = 1; w <= 10; w++) {
                for (const root of ROOTS) {
                    for (const q of ['maj7', 'dom7', 'm7'] as Quality[]) {
                        const fits = allPositions(inst, root, q).some((v) => inHome(v, [w, w + 5]));
                        expect(fits, `${root.name}${q} in frets ${w}-${w + 5}`).toBe(true);
                    }
                }
            }
        });
    }
});

describe('grips', () => {
    it('guitar R–7–3 on the 6th string: Gmaj7 3x44, G7 3x34, Gm7 3x33', () => {
        expect(tab(GUITAR, build(GUITAR, shape(GUITAR, '6A'), R('G'), 'maj7')!)).toBe(
            '3 x 4 4 x x',
        );
        expect(tab(GUITAR, build(GUITAR, shape(GUITAR, '6A'), R('G'), 'dom7')!)).toBe(
            '3 x 3 4 x x',
        );
        expect(tab(GUITAR, build(GUITAR, shape(GUITAR, '6A'), R('G'), 'm7')!)).toBe('3 x 3 3 x x');
    });
    it('guitar m7♭5 adds its ♭5 (Cm7♭5 x3434x on the 5th string)', () => {
        expect(tab(GUITAR, build(GUITAR, shape(GUITAR, '5A'), R('C'), 'm7b5')!)).toBe(
            'x 3 4 3 4 x',
        );
    });
    it('ukulele grips reproduce the standard uke chords', () => {
        expect(tab(UKULELE, build(UKULELE, shape(UKULELE, 'UG'), R('G'), 'dom7')!)).toBe('0 2 1 2');
        expect(tab(UKULELE, build(UKULELE, shape(UKULELE, 'UA'), R('A'), 'm7')!)).toBe('0 0 0 0');
        expect(tab(UKULELE, build(UKULELE, shape(UKULELE, 'UE'), R('F'), 'dom7')!)).toBe('2 3 1 3');
        expect(tab(UKULELE, build(UKULELE, shape(UKULELE, 'UC'), R('D'), 'm7')!)).toBe('2 2 1 3');
        expect(tab(UKULELE, build(UKULELE, shape(UKULELE, 'UC'), R('C'), 'maj7')!)).toBe('0 0 0 2');
    });
    it('fingers follow standard teaching (R–3–7: 2-1-3)', () => {
        const v = build(GUITAR, shape(GUITAR, '6B'), R('G'), 'maj7')!;
        expect(v.notes.map((n) => n.finger)).toEqual([2, 1, 3]);
    });
});

describe('voiceChart', () => {
    const chart = (names: string[]) =>
        names.map((s) => {
            const p = shellChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false);
            return { root: p.root, quality: p.quality, label: s };
        });

    it('keeps a ii–V–I inside the home window and carries extra fields through', () => {
        const v = voiceChart(chart(['Dm7', 'G7', 'Cmaj7']), { instrument: GUITAR, home: [2, 7] });
        expect(v.map((x) => x.symbol)).toEqual(['Dm7', 'G7', 'Cmaj7']);
        expect(v.every((x) => inHome(x, [2, 7]))).toBe(true);
        expect(v.map((x) => x.label)).toEqual(['Dm7', 'G7', 'Cmaj7']);
    });
    it('holds a shared note with the same finger (B held into Cmaj7)', () => {
        const v = voiceChart(chart(['G7', 'Cmaj7']), { instrument: GUITAR, home: [2, 7] });
        const held = fingerMoves(GUITAR, v[0], v[1]).moves.filter((m) => m.kind === 'hold');
        expect(held.length).toBeGreaterThan(0);
    });
    it('unlocked, the ukulele ii–V–I in C lands on the classic first-position shapes', () => {
        const v = voiceChart(chart(['Dm7', 'G7', 'Cmaj7']), { instrument: UKULELE, home: null });
        expect(v.map((x) => tab(UKULELE, x))).toEqual(['2 2 1 3', '0 2 1 2', '0 0 0 2']);
    });
    it('locked to frets 1–6, the voicer aims for the middle of the window', () => {
        const v = voiceChart(chart(['Dm7', 'G7', 'Cmaj7']), { instrument: UKULELE, home: [1, 6] });
        expect(v.every((x) => inHome(x, [1, 6]))).toBe(true);
    });
    it('respects a root-string limit', () => {
        const v = voiceChart(chart(['Dm7', 'G7', 'Cmaj7', 'Fmaj7']), {
            instrument: GUITAR,
            home: [5, 10],
            rootStrings: [6, 5],
        });
        expect(v.every((x) => [6, 5].includes(x.shape.rootString))).toBe(true);
    });
    it('a long chart stays in a small zone of the neck', () => {
        const v = voiceChart(chart(['Cm7', 'F7', 'B♭maj7', 'E♭maj7', 'Am7b5', 'D7', 'Gm7']), {
            instrument: GUITAR,
            home: [3, 8],
        });
        const t = handTravel(GUITAR, v);
        expect(t.highestFret - t.lowestFret).toBeLessThanOrEqual(5);
    });
});

describe('voiceNext', () => {
    it('picks a grip near the previous chord', () => {
        const prev = voiceNext(
            null,
            { root: R('C'), quality: 'maj7' },
            { instrument: GUITAR, home: [2, 7] },
        );
        const next = voiceNext(
            prev,
            { root: R('F'), quality: 'maj7' },
            { instrument: GUITAR, home: [2, 7] },
        );
        expect(inHome(next, [2, 7])).toBe(true);
        expect(rootMove(GUITAR, prev, next).text).toBe('up a 4th');
    });
});

describe('rootMove', () => {
    it('names the interval and the path on the neck', () => {
        const a = build(GUITAR, shape(GUITAR, '6A'), R('C'), 'm7', 'none'); // 8th fret, 6th string
        const b = build(GUITAR, shape(GUITAR, '5A'), R('F'), 'dom7', 'none'); // 8th fret, 5th string
        const m = rootMove(GUITAR, a!, b!);
        expect(m.text).toBe('up a 4th');
        expect(m.geometry).toBe('same fret, one string over');
        expect(m.straightAcross).toBe(true);
    });
});

describe('keyFamily', () => {
    it('C major: Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7♭5', () => {
        expect(keyFamily(R('C'), 'major').map((c) => c.root.name + c.quality)).toEqual([
            'Cmaj7',
            'Dm7',
            'Em7',
            'Fmaj7',
            'Gdom7',
            'Am7',
            'Bm7b5',
        ]);
    });
    it('spells by key: B♭ major has E♭, not D♯', () => {
        expect(keyFamily(R('B♭'), 'major')[3].root.name).toBe('E♭');
    });
    it('minor uses the harmonic-minor V7', () => {
        const fam = keyFamily(R('A'), 'minor');
        expect(fam[4].root.name + fam[4].quality).toBe('Edom7');
    });
});
