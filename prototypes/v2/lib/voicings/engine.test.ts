import { parseChord } from '@band/index';
import { describe, expect, it } from 'vitest';
import { spellRoot, voicingChord } from './adapter';
import { assignFingers, barres, fingerOptions } from './fingering';
import {
    allPositions,
    build,
    fingerMoves,
    GUITAR,
    gripMidis,
    type InstrumentDef,
    inHome,
    inversionOf,
    type Note,
    rootMove,
    spellDegree,
    UKULELE,
    type Voicing,
    voiceChart,
} from './index';
import { UKULELE_LOW_G } from './instruments';
import { keyRoot } from './test/keys';
import { QUALITIES } from './theory';
import type { Quality } from './types';

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

describe('triad grips (#1588)', () => {
    /** Every grip of one shape for a chord, low to high on the neck. */
    const tabsOf = (inst: InstrumentDef, root: string, quality: Quality, id: string) =>
        allPositions(inst, R(root), quality)
            .filter((v) => v.shape.id === id)
            .map((v) => tab(inst, v));

    it('guitar C on strings 1–3 in three closed inversions', () => {
        expect(tabsOf(GUITAR, 'C', 'maj', 'T321-0')).toEqual(['x x x 5 5 3']);
        expect(tabsOf(GUITAR, 'C', 'maj', 'T321-1')).toEqual(['x x x 9 8 8']);
        // The 2nd inversion also exists in open position (G C E on the open G string).
        expect(tabsOf(GUITAR, 'C', 'maj', 'T321-2')).toEqual(['x x x 0 1 0', 'x x x 12 13 12']);
    });
    it('names the inversion by the lowest-pitched note', () => {
        const at = (id: string, fret: number) =>
            allPositions(GUITAR, R('C'), 'maj').find(
                (v) => v.shape.id === id && v.rootFret === fret,
            )!;
        expect(inversionOf(GUITAR, at('T321-0', 5))).toBe(0);
        expect(inversionOf(GUITAR, at('T321-1', 8))).toBe(1);
        expect(inversionOf(GUITAR, at('T321-2', 13))).toBe(2);
        // Uke C 0003 is G C E C, but the re-entrant G string is high: the C string's C is the
        // lowest note, so it is root position. With a low G, the G is the bass.
        const c = build(UKULELE, shape(UKULELE, 'UTC'), R('C'), 'maj')!;
        expect(inversionOf(UKULELE, c)).toBe(0);
        expect(inversionOf(UKULELE_LOW_G, c)).toBe(2);
        // A shell always reads as root position.
        expect(inversionOf(GUITAR, build(GUITAR, shape(GUITAR, '6A'), R('G'), 'maj7')!)).toBe(0);
    });
    it('sounds a grip low string first, by string not pitch (#1596)', () => {
        const at = (id: string, fret: number) =>
            allPositions(GUITAR, R('C'), 'maj').find(
                (v) => v.shape.id === id && v.rootFret === fret,
            )!;
        // x x x 5 5 3 over open G3 B3 E4 (55 59 64): C4 E4 G4.
        expect(gripMidis(GUITAR, at('T321-0', 5))).toEqual([60, 64, 67]);
        // Uke C 0003: the open strings sound their open pitch. The re-entrant G (string 4) is
        // strummed first though it is pitched above the C string; with a low G it is the bass.
        const c = build(UKULELE, shape(UKULELE, 'UTC'), R('C'), 'maj')!;
        expect(gripMidis(UKULELE, c)).toEqual([67, 60, 64, 72]);
        expect(gripMidis(UKULELE_LOW_G, c)).toEqual([55, 60, 64, 72]);
    });
    it('the ukulele triads are the standard first-position chords', () => {
        const uke = (id: string, root: string, quality: Quality) =>
            tab(UKULELE, build(UKULELE, shape(UKULELE, id), R(root), quality)!);
        expect(uke('UTC', 'C', 'maj')).toBe('0 0 0 3');
        expect(uke('UTF', 'F', 'maj')).toBe('2 0 1 0');
        expect(uke('UTG', 'G', 'maj')).toBe('0 2 3 2');
        expect(uke('UTA', 'A', 'min')).toBe('2 0 0 0');
        expect(uke('UTD', 'D', 'min')).toBe('2 2 1 0');
        expect(uke('UTE', 'E', 'min')).toBe('0 4 3 2');
        expect(uke('UTD', 'D', 'maj')).toBe('2 2 2 0');
        expect(uke('UTA', 'A', 'maj')).toBe('2 1 0 0');
    });
    it('a power chord is root, 5th and octave: E5 on the 6th string is 0 2 2', () => {
        expect(tab(GUITAR, build(GUITAR, shape(GUITAR, 'P6'), R('E'), 'five')!)).toBe(
            '0 2 2 x x x',
        );
    });
    it('sus and aug spell their own tones: C sus4 has F, sus2 has D, aug has G♯', () => {
        const names = (quality: Quality) =>
            build(GUITAR, shape(GUITAR, 'T321-0'), R('C'), quality)!
                .notes.map((n) => spellDegree(R('C'), n.degree))
                .join(' ');
        expect(names('sus4')).toBe('C F G');
        expect(names('sus2')).toBe('C D G');
        expect(names('aug')).toBe('C E G♯');
    });
    it('shells and triads never share a shape', () => {
        for (const inst of [GUITAR, UKULELE]) {
            expect(allPositions(inst, R('C'), 'maj7').every((v) => v.shape.kind === 'shell')).toBe(
                true,
            );
            expect(allPositions(inst, R('C'), 'maj').every((v) => v.shape.kind === 'triad')).toBe(
                true,
            );
            expect(allPositions(inst, R('C'), 'five').every((v) => v.shape.kind === 'power')).toBe(
                true,
            );
        }
    });
    it('the classic root-string limit leaves triad grips alone', () => {
        const all = allPositions(GUITAR, R('C'), 'maj');
        const classic = allPositions(GUITAR, R('C'), 'maj', { rootStrings: [6, 5] });
        expect(classic.map((v) => tab(GUITAR, v))).toEqual(all.map((v) => tab(GUITAR, v)));
    });
    it('every quality has a grip for every root on both instruments', () => {
        for (const inst of [GUITAR, UKULELE]) {
            for (const root of ROOTS) {
                for (const q of Object.keys(QUALITIES) as Quality[]) {
                    expect(
                        allPositions(inst, root, q).length,
                        `${inst.name} ${root.name}${q}`,
                    ).toBeGreaterThan(0);
                }
            }
        }
    });
    for (const inst of [GUITAR, UKULELE]) {
        it(`${inst.name}: every major and minor triad in all 12 keys fits in any 6-fret window`, () => {
            for (let w = 1; w <= 10; w++) {
                for (const root of ROOTS) {
                    for (const q of ['maj', 'min'] as Quality[]) {
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

describe('voiceChart on triads (#1588): the hand stays put, open chords win first position', () => {
    const chart = (names: string[]) =>
        names.map((s) => {
            const p = voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false);
            return { root: p.root, quality: p.quality };
        });
    const tabs = (inst: InstrumentDef, names: string[], home: [number, number] | null) =>
        voiceChart(chart(names), { instrument: inst, home }).map((v) => tab(inst, v));

    it('ukulele C Am F G is the first-position set, in the default window and unlocked', () => {
        const canon = ['0 0 0 3', '2 0 0 0', '2 0 1 0', '0 2 3 2'];
        expect(tabs(UKULELE, ['C', 'Am', 'F', 'G'], [1, 6])).toEqual(canon);
        expect(tabs(UKULELE, ['C', 'Am', 'F', 'G'], null)).toEqual(canon);
    });
    it('ukulele G C D and C G Am F keep their open chords too', () => {
        expect(tabs(UKULELE, ['G', 'C', 'D', 'G'], [1, 6])).toEqual([
            '0 2 3 2',
            '0 0 0 3',
            '2 2 2 0',
            '0 2 3 2',
        ]);
        expect(tabs(UKULELE, ['C', 'G', 'Am', 'F'], [1, 6])).toEqual([
            '0 0 0 3',
            '0 2 3 2',
            '2 0 0 0',
            '2 0 1 0',
        ]);
    });
    it('ukulele C Am F G locked to frets 5–10 moves to the closed shapes up the neck', () => {
        const v = voiceChart(chart(['C', 'Am', 'F', 'G']), { instrument: UKULELE, home: [5, 10] });
        expect(v.every((x) => inHome(x, [5, 10]) && x.notes.every((n) => n.fret >= 5))).toBe(true);
    });
    it('guitar C G Am F in frets 2–7 voice-leads on one string set (#1597)', () => {
        // Every voice steps or holds on the top three strings: G held on top into the G, then
        // B→C, D→E, G→A into the Am, then C and A held while E steps to F. The 4-3-2 path
        // (x x 5 5 5 x, x x 5 4 3 x, x x 7 5 5 x, x x 7 5 6 x) is the same voice leading a 4th
        // lower; this one sits at frets 3–6 around the window's centre where that one climbs
        // to the 7th, so the hand shifts less.
        const v = voiceChart(chart(['C', 'G', 'Am', 'F']), { instrument: GUITAR, home: [2, 7] });
        expect(v.map((x) => tab(GUITAR, x))).toEqual([
            'x x x 5 5 3',
            'x x x 4 3 3',
            'x x x 5 5 5',
            'x x x 5 6 5',
        ]);
        const frets = v.flatMap((x) => x.notes.map((n) => n.fret));
        expect(Math.max(...frets) - Math.min(...frets)).toBeLessThan(4);
    });
    it('guitar G D Em C G D C D in frets 2–7 keeps one string set (#1597)', () => {
        const v = voiceChart(chart(['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D']), {
            instrument: GUITAR,
            home: [2, 7],
        });
        const sets = new Set(
            v.map((x) =>
                x.notes
                    .map((n) => n.string)
                    .sort()
                    .join(''),
            ),
        );
        expect(sets.size).toBe(1);
    });
    it('guitar unlocked C Am F G takes the open-position triads', () => {
        expect(tabs(GUITAR, ['C', 'Am', 'F', 'G'], null)).toEqual([
            'x 3 2 0 x x',
            'x 3 2 2 x x',
            'x 3 3 2 x x',
            'x 2 0 0 x x',
        ]);
    });
    it('power chords: E5 A5 B5 in frets 1–6 are the rock shapes', () => {
        expect(tabs(GUITAR, ['E5', 'A5', 'B5'], [1, 6])).toEqual([
            '0 2 2 x x x',
            'x 0 2 2 x x',
            'x 2 4 4 x x',
        ]);
    });
    it('a shell chart is costed exactly as before (the triad costs never see one)', () => {
        expect(tabs(UKULELE, ['Dm7', 'G7', 'Cmaj7'], [1, 6])).toEqual([
            '5 5 5 5',
            '4 5 3 5',
            '4 4 3 3',
        ]);
    });
});

describe('voiceChart', () => {
    const chart = (names: string[]) =>
        names.map((s) => {
            const p = voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false);
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
        const fretted = v.flatMap((x) => x.notes.map((n) => n.fret).filter((f) => f > 0));
        expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(5);
    });
});

describe('barres (#1594): what guitarists and uke players actually do', () => {
    /**
     * A grip straight from its tab ('x x x 5 5 3'), lowest-numbered string last; `root` is the
     * string holding the root (the cost keeps a root off the weak fingers).
     */
    const grip = (tabs: string, root: number): Note[] => {
        const frets = tabs.split(' ');
        return frets.flatMap((t, i) => {
            const string = frets.length - i;
            return t === 'x'
                ? []
                : [
                      {
                          string,
                          fret: Number(t),
                          degree: string === root ? 'R' : '5',
                          role: string === root ? 'R' : 'F',
                          finger: null,
                      } satisfies Note,
                  ];
        });
    };
    /** The fingers, in tab order (x for a string not played). */
    const fingered = (tabs: string, root: number, barre = true) => {
        const notes = grip(tabs, root);
        assignFingers(notes, { barre });
        const by = new Map(notes.map((n) => [n.string, n.finger]));
        return tabs
            .split(' ')
            .map((_, i, all) => by.get(all.length - i) ?? 'x')
            .join(' ');
    };
    /**
     * How much cheaper the best barre is than the best fingering without one (Infinity when the
     * split is out of the running altogether).
     */
    const margin = (tabs: string, root: number) => {
        const options = fingerOptions(grip(tabs, root), { barre: true });
        const barred = (p: Array<number | null>) => new Set(p).size < p.length;
        const split = options.find((o) => !barred(o.p))?.cost ?? Infinity;
        return split - options.find((o) => barred(o.p))!.cost;
    };

    it('guitar C 5-5-3: index on the 3, ring across the 5s', () => {
        expect(fingered('x x x 5 5 3', 3)).toBe('x x x 3 3 1');
        const notes = grip('x x x 5 5 3', 3);
        assignFingers(notes, { barre: true });
        expect(barres(notes)).toEqual([{ finger: 3, fret: 5, strings: [2, 3] }]);
        // A preference, not a rule: less than re-fingering a held note costs the chart planner.
        expect(margin('x x x 5 5 3', 3)).toBeGreaterThan(1);
        expect(margin('x x x 5 5 3', 3)).toBeLessThan(2.5);
    });
    it('guitar C/E 9-8-8: index barre on the 8s, middle on the 9', () => {
        expect(fingered('x x x 9 8 8', 1)).toBe('x x x 2 1 1');
        expect(margin('x x x 9 8 8', 1)).toBeGreaterThan(2);
    });
    it('guitar C/G 12-13-12: index barre across all three, middle on the 13', () => {
        expect(fingered('x x x 12 13 12', 2)).toBe('x x x 1 2 1');
        expect(margin('x x x 12 13 12', 2)).toBeGreaterThan(1);
    });
    it('the same 2-3-2 shape low on the neck is a finger each (the open D shape is 1-3-2)', () => {
        expect(fingered('x x x 2 3 2', 2)).toBe('x x x 1 3 2');
        expect(margin('x x x 2 3 2', 2)).toBeLessThan(-1);
    });
    it('three-note A5 x-0-2-2: the index lies across the two 2s', () => {
        expect(fingered('x 0 2 2 x x', 5)).toBe('x 0 1 1 x x');
    });
    it('three-note B5 x-2-4-4: index on the root, ring across the other two', () => {
        expect(fingered('x 2 4 4 x x', 5)).toBe('x 1 3 3 x x');
    });
    it('uke D 2220 is one index barre', () => {
        expect(fingered('2 2 2 0', 3)).toBe('1 1 1 0');
    });
    it('uke E 4442: ring across the 4s, index on the 2', () => {
        expect(fingered('4 4 4 2', 3)).toBe('3 3 3 1');
    });
    it('uke G 0232 and F 2010 are not barred', () => {
        expect(fingered('0 2 3 2', 4)).toBe('0 1 3 2');
        expect(margin('0 2 3 2', 4)).toBeLessThan(-1);
        expect(fingered('2 0 1 0', 2)).toBe('2 0 1 0');
    });
    it('never bars over an open string or a lower note inside the run', () => {
        // Uke A 2100: the open strings sit outside the index's reach; nothing to bar.
        expect(fingered('2 1 0 0', 4)).toBe('2 1 0 0');
        // Guitar 5-4-5: the 4 sits inside the run, so the 5s cannot share a finger.
        expect(barres(grip('x x x 5 4 5', 3))).toEqual([]);
        const notes = grip('x x x 5 4 5', 3);
        assignFingers(notes, { barre: true });
        expect(barres(notes)).toEqual([]);
    });
    it('without the barre flag (a shell) every note keeps its own finger', () => {
        expect(fingered('x x x 9 8 8', 1, false)).toBe('x x x 3 1 2');
    });

    const chart = (names: string[]) =>
        names.map((s) => {
            const p = voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false);
            return { root: p.root, quality: p.quality };
        });
    it('a chart of closed triads takes barres; a shell chart never does', () => {
        const pop = voiceChart(chart(['C', 'G', 'Am', 'F']), { instrument: GUITAR, home: [2, 7] });
        expect(pop.some((v) => barres(v.notes).length > 0)).toBe(true);
        for (const inst of [GUITAR, UKULELE]) {
            const shells = voiceChart(chart(['Dm7', 'G7', 'Cmaj7']), {
                instrument: inst,
                home: [2, 7],
            });
            expect(shells.every((v) => barres(v.notes).length === 0)).toBe(true);
        }
    });
    it('narrates a barre as one finger', () => {
        const pop = voiceChart(chart(['C', 'G', 'Am', 'F']), { instrument: GUITAR, home: [2, 7] });
        const lines = pop.slice(1).map((v, i) => fingerMoves(GUITAR, pop[i], v).moves);
        const barred = lines.flat().filter((m) => m.barre);
        expect(barred.length).toBeGreaterThan(0);
        for (const m of barred) {
            expect(m.finger).toBe(m.barre!.finger);
        }
    });
});

describe('rootMove', () => {
    it('names the interval and the path on the neck', () => {
        const a = build(GUITAR, shape(GUITAR, '6A'), R('C'), 'm7'); // 8th fret, 6th string
        const b = build(GUITAR, shape(GUITAR, '5A'), R('F'), 'dom7'); // 8th fret, 5th string
        const m = rootMove(GUITAR, a!, b!);
        expect(m.text).toBe('up a 4th');
        expect(m.geometry).toBe('same fret, one string over');
        expect(m.straightAcross).toBe(true);
    });
});
