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
import { allowedShapes, buildAt, rootFrets } from './voicing';

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

describe('the tone that names the chord (#1606)', () => {
    /** The two shells whose 5th is the point: an m7♭5 without it is an m7, a °7 without it a m6. */
    const NAMED_BY_FIVE: Quality[] = ['m7b5', 'dim7'];
    const SETUPS: [InstrumentDef, number[] | undefined][] = [
        [GUITAR, undefined],
        [GUITAR, [6, 5]],
        [UKULELE, undefined],
    ];
    const degrees = (v: Voicing) => v.notes.map((n) => n.degree);
    /** Every grip the shapes can build, before `allPositions` drops the incomplete ones. */
    const built = (
        inst: InstrumentDef,
        root: string,
        quality: Quality,
        rootStrings?: number[],
    ): Voicing[] =>
        allowedShapes(inst, rootStrings, quality).flatMap((sh) =>
            rootFrets(inst, sh, R(root))
                .map((r) => buildAt(inst, sh, R(root), quality, r))
                .filter((v): v is Voicing => v !== null),
        );
    /** A guitar with only these shell shapes, to reach grips the full shape set never leaves alone. */
    const guitarWith = (...ids: string[]): InstrumentDef => ({
        ...GUITAR,
        shapes: ids.map((id) => shape(GUITAR, id)),
    });

    it('`buildAt` reports a grip with no room for the ♭5 (guitar R–3–7 on the 4th string)', () => {
        // x x 10 8 11 x: the ♭5 would sit four frets above the root on the 1st string.
        const v = buildAt(GUITAR, shape(GUITAR, '4B'), R('C'), 'm7b5', 10)!;
        expect(tab(GUITAR, v)).toBe('x x 10 8 11 x');
        expect(v.missing).toEqual(['b5']);
        expect(degrees(v)).not.toContain('b5');
    });
    it('every m7♭5 and °7 grip on offer has its root, ♭3, 7th and ♭5', () => {
        for (const [inst, rootStrings] of SETUPS) {
            for (const root of ROOTS) {
                for (const q of NAMED_BY_FIVE) {
                    const grips = allPositions(inst, root, q, { rootStrings });
                    expect(grips.length, `${inst.name} ${root.name}${q}`).toBeGreaterThan(0);
                    for (const v of grips) {
                        const where = `${inst.name} ${v.symbol} ${tab(inst, v)}`;
                        expect(v.missing, where).toEqual([]);
                        expect(degrees(v), where).toEqual(
                            expect.arrayContaining(['R', 'b3', QUALITIES[q].seventh, 'b5']),
                        );
                    }
                }
            }
        }
    });
    it('a complete grip is preferred: the incomplete ones are dropped, the rest untouched', () => {
        const all = built(GUITAR, 'C', 'm7b5');
        expect(all.filter((v) => v.missing.length).map((v) => tab(GUITAR, v))).toEqual([
            'x x 10 8 11 x',
        ]);
        expect(allPositions(GUITAR, R('C'), 'm7b5').map((v) => tab(GUITAR, v))).toEqual(
            all.filter((v) => !v.missing.length).map((v) => tab(GUITAR, v)),
        );
        // Em7♭5 on the 4th string once found room at the nut, around its open G string
        // (x x 2 0 3 6); that reach is refused now (#1607), so R–3–7 on the 4th string has no
        // room for a ♭5 anywhere and is offered only when it is all there is.
        const fourth = guitarWith('4B');
        expect(built(fourth, 'E', 'm7b5').map((v) => v.missing)).toEqual([['b5'], ['b5']]);
        expect(allPositions(fourth, R('E'), 'm7b5').map((v) => tab(fourth, v))).toEqual([
            'x x 2 0 3 x',
            'x x 14 12 15 x',
        ]);
        expect(allPositions(GUITAR, R('E'), 'm7b5').map((v) => v.shape.id)).not.toContain('4B');
    });
    it('the last resort still voices the chord: with no complete grip, the incomplete one plays', () => {
        const fourth = guitarWith('4B');
        const only = allPositions(fourth, R('C'), 'm7b5');
        expect(only.map((v) => tab(fourth, v))).toEqual(['x x 10 8 11 x']);
        expect(only[0].missing).toEqual(['b5']);
        const voiced = voiceChart(
            [
                { root: R('C'), quality: 'm7b5' },
                { root: R('F'), quality: 'dom7' },
            ],
            { instrument: fourth, home: [8, 13] },
        );
        expect(voiced.map((v) => v.symbol)).toEqual(['Cm7♭5', 'F7']);
        expect(tab(fourth, voiced[0])).toBe('x x 10 8 11 x');
    });
    it('complete comes before in-window: the hand leaves the window rather than play an m7', () => {
        // Frets 8–11 hold the 4th-string grip (no ♭5) and not the 5th-string one (x 3 4 3 4 x).
        const two = guitarWith('4B', '5A');
        const [v] = voiceChart([{ root: R('C'), quality: 'm7b5' }], {
            instrument: two,
            home: [8, 11],
        });
        expect(tab(two, v)).toBe('x 3 4 3 4 x');
        expect(degrees(v)).toContain('b5');
    });
    it('the six-fret window has to choose for one chord only: Em7♭5 on the open 6th string', () => {
        // Everywhere else in the app (its windows are six frets), where any grip fits a complete
        // one fits, so the order above is never called on. A window that holds no grip of the
        // chord at all (classic roots, the root at the window's edge: Gm7♭5 in frets 3–8)
        // offers every complete grip, as it always offered every grip.
        //
        // The exception is a root whose only 6th-string position near the nut is the open
        // string. Em7♭5 there is 0 x 0 0 x x: all open, so "inside" every window, and with no
        // room for its ♭5 (#1607 — the tone would make it an open-string one-off, 0 1 0 0 x x).
        // With roots kept to the 6th and 5th strings, frets 1–6 hold nothing else.
        const exceptions: string[] = [];
        for (const [inst, rootStrings] of SETUPS) {
            for (let w = 1; w <= 10; w++) {
                for (const root of ROOTS) {
                    for (const q of NAMED_BY_FIVE) {
                        const inside = built(inst, root.name, q, rootStrings).filter((v) =>
                            inHome(v, [w, w + 5]),
                        );
                        if (inside.length && !inside.some((v) => !v.missing.length)) {
                            exceptions.push(
                                `${inst.name} ${rootStrings ?? 'all'} ${root.name}${q} in frets ${w}-${w + 5}: ${inside.map((v) => tab(inst, v)).join(', ')}`,
                            );
                        }
                    }
                }
            }
        }
        expect(exceptions).toEqual(['Guitar 6,5 Em7b5 in frets 1-6: 0 x 0 0 x x']);
        // There the hand leaves the window for the complete grip at the 7th fret, as a player
        // held to those root strings does.
        const [v] = voiceChart([{ root: R('E'), quality: 'm7b5' }], {
            instrument: GUITAR,
            home: [1, 6],
            rootStrings: [6, 5],
        });
        expect(tab(GUITAR, v)).toBe('x 7 8 7 8 x');
    });
    it('guitar °7 is the four-note grip on each root string', () => {
        const grip = (id: string, root: string) =>
            build(GUITAR, shape(GUITAR, id), R(root), 'dim7')!;
        const fingers = (v: Voicing) => v.notes.map((n) => n.finger);
        // 6th string: G°7 3 x 2 3 2 x (G F♭ B♭ D♭), the index across the 2nd fret (#1607).
        expect(tab(GUITAR, grip('6A', 'G'))).toBe('3 x 2 3 2 x');
        expect(fingers(grip('6A', 'G'))).toEqual([2, 1, 3, 1]);
        // 5th string: C°7 x 3 4 2 4 x, the ♭5 on the string the shell skips.
        expect(tab(GUITAR, grip('5A', 'C'))).toBe('x 3 4 2 4 x');
        expect(fingers(grip('5A', 'C'))).toEqual([2, 3, 1, 4]);
        expect(
            grip('5A', 'C')
                .notes.map((n) => spellDegree(R('C'), n.degree))
                .join(' '),
        ).toBe('C G♭ B♭♭ E♭');
        // 4th string: E♭°7 x x 1 2 1 2, the top-four-strings diminished.
        expect(tab(GUITAR, grip('4A', 'E♭'))).toBe('x x 1 2 1 2');
        expect(fingers(grip('4A', 'E♭'))).toEqual([1, 3, 2, 4]);
        // On the 5th and 4th strings every fretted note has its own finger.
        for (const root of ROOTS) {
            for (const v of allPositions(GUITAR, root, 'dim7')) {
                if (v.shape.id !== '6A') {
                    expect(barres(v.notes), `${v.symbol} ${tab(GUITAR, v)}`).toEqual([]);
                }
            }
        }
    });
    it('where the added tone goes: narrowest, then fretted over open, then the easier fingering', () => {
        const grip = (id: string, root: string, quality: Quality) =>
            tab(GUITAR, build(GUITAR, shape(GUITAR, id), R(root), quality)!);
        // Fretted over open: both are one fret wide, and x 1 x 1 2 0 works for B♭ only.
        expect(grip('5A', 'B♭', 'm7b5')).toBe('x 1 2 1 2 x');
        expect(grip('5A', 'B♭', 'dim7')).toBe('x 1 2 0 2 x');
        // Easier fingering: C°7's x 3 x 2 4 2 is as narrow, with the root under the ring finger.
        expect(grip('5A', 'C', 'dim7')).toBe('x 3 4 2 4 x');
        // A tie all the way down keeps the higher string: Cm7♭5 is 8 x 8 8 7 x, not 8 9 8 8 x x.
        expect(grip('6A', 'C', 'm7b5')).toBe('8 x 8 8 7 x');
        // Narrower wins outright: Cm7♭5's x 3 x 3 4 2 is two frets wide, x 3 4 3 4 x is one.
        expect(grip('5A', 'C', 'm7b5')).toBe('x 3 4 3 4 x');
    });
    it('a passing °7 keeps its ♭5 in a chart, on every setup', () => {
        const chart: { root: ReturnType<typeof R>; quality: Quality }[] = [
            { root: R('C'), quality: 'maj7' },
            { root: R('C♯'), quality: 'dim7' },
            { root: R('D'), quality: 'm7' },
            { root: R('G'), quality: 'dom7' },
        ];
        for (const [instrument, rootStrings] of SETUPS) {
            const v = voiceChart(chart, { instrument, home: [1, 6], rootStrings });
            expect(degrees(v[1]), `${instrument.name} ${tab(instrument, v[1])}`).toContain('b5');
        }
        const guitar = voiceChart(chart, { instrument: GUITAR, home: [1, 6] });
        expect(tab(GUITAR, guitar[1])).toBe('x 4 5 3 5 x');
    });
    it('triads and power chords are not touched: none requires a tone, so none is dropped', () => {
        for (const inst of [GUITAR, UKULELE]) {
            for (const q of Object.keys(QUALITIES) as Quality[]) {
                if (QUALITIES[q].kind === 'shell') {
                    continue;
                }
                expect(QUALITIES[q].required, q).toEqual([]);
                for (const root of ROOTS) {
                    expect(
                        allPositions(inst, root, q).map((v) => tab(inst, v)),
                        `${inst.name} ${root.name}${q}`,
                    ).toEqual(built(inst, root.name, q).map((v) => tab(inst, v)));
                }
            }
        }
    });
});

describe('a shell a player would choose (#1607)', () => {
    const SHELLS = (Object.keys(QUALITIES) as Quality[]).filter(
        (q) => QUALITIES[q].kind === 'shell',
    );
    const grip = (id: string, root: string, quality: Quality, r: number) =>
        buildAt(GUITAR, shape(GUITAR, id), R(root), quality, r)!;
    const chart = (...chords: [string, Quality][]) =>
        chords.map(([root, quality]) => ({ root: R(root), quality }));

    describe('an open string belongs to first position', () => {
        it('the added tone never leaves an open string under a hand up the neck', () => {
            // Em7♭5 x x 2 0 3 6: a reach from the 2nd fret to the 6th around the open G string.
            const stretch = grip('4B', 'E', 'm7b5', 2);
            expect(tab(GUITAR, stretch)).toBe('x x 2 0 3 x');
            expect(stretch.missing).toEqual(['b5']);
            // E♭m7♭5 11 0 11 11 x x and Fm7♭5 13 x 13 13 0 x leaned on an open string from the
            // 11th and 13th frets; both take the movable grip, the ♭5 fretted on the 2nd string.
            expect(tab(GUITAR, grip('6A', 'E♭', 'm7b5', 11))).toBe('11 x 11 11 10 x');
            expect(tab(GUITAR, grip('6A', 'F', 'm7b5', 13))).toBe('13 x 13 13 12 x');
        });
        it('nor does it make a grip of three open strings: Em7♭5 is not 0 1 0 0 x x', () => {
            // On the open 6th string the ♭5 could go to the 6th fret (0 x 0 0 x 6, up the neck)
            // or to the 5th string (0 1 0 0 x x: three of four notes open, a tritone on the two
            // lowest strings). Neither is a shell, so the grip has no room for it and is dropped.
            const open = grip('6A', 'E', 'm7b5', 0);
            expect(tab(GUITAR, open)).toBe('0 x 0 0 x x');
            expect(open.missing).toEqual(['b5']);
            expect(allPositions(GUITAR, R('E'), 'm7b5').map((v) => tab(GUITAR, v))).toEqual([
                '12 x 12 12 11 x',
                '12 10 12 x 11 x',
                'x 7 8 7 8 x',
                'x 7 5 7 x 6',
                'x x 2 3 3 3',
                'x x 14 15 15 15',
            ]);
            // Two open strings beside fretted notes at the nut are the book grips, and stay.
            expect(tab(GUITAR, grip('5A', 'A', 'm7b5', 0))).toBe('x 0 1 0 1 x');
            expect(tab(GUITAR, grip('4A', 'D', 'dim7', 0))).toBe('x x 0 1 0 1');
            expect(tab(GUITAR, grip('6A', 'F', 'dim7', 1))).toBe('1 x 0 1 0 x');
            // A three-note shell is not asked: Em7 on open strings is still on offer.
            expect(allPositions(GUITAR, R('E'), 'm7').map((v) => tab(GUITAR, v))).toContain(
                '0 x 0 0 x x',
            );
        });
        it('no shell with an added tone rings more than two open strings', () => {
            for (const root of ROOTS) {
                for (const q of ['m7b5', 'dim7'] as Quality[]) {
                    for (const v of allPositions(GUITAR, root, q)) {
                        expect(
                            v.notes.filter((n) => n.fret === 0).length,
                            `${v.symbol} ${tab(GUITAR, v)}`,
                        ).toBeLessThanOrEqual(2);
                    }
                }
            }
        });
        it('in first position the open string stays: these are the grips at the nut', () => {
            // The same Fm7♭5 shape at the 1st fret keeps its open B string.
            expect(tab(GUITAR, grip('6A', 'F', 'm7b5', 1))).toBe('1 x 1 1 0 x');
            expect(tab(GUITAR, grip('5A', 'A', 'm7b5', 0))).toBe('x 0 1 0 1 x');
            expect(tab(GUITAR, grip('5A', 'B♭', 'dim7', 1))).toBe('x 1 2 0 2 x');
            expect(tab(GUITAR, grip('5B', 'B', 'm7b5', 2))).toBe('x 2 0 2 x 1');
            expect(tab(GUITAR, grip('5A', 'A', 'm7', 0))).toBe('x 0 x 0 1 x');
            expect(tab(GUITAR, grip('6A', 'E', 'dom7', 0))).toBe('0 x 0 1 x x');
            for (const v of [grip('6A', 'F', 'm7b5', 1), grip('5A', 'A', 'm7b5', 0)]) {
                expect(v.missing).toEqual([]);
            }
        });
        it('no shell on offer has an open string past the 4th fret, or is wider than three frets', () => {
            for (const inst of [GUITAR, UKULELE]) {
                for (const root of ROOTS) {
                    for (const q of SHELLS) {
                        for (const v of allPositions(inst, root, q)) {
                            const frets = v.notes.map((n) => n.fret);
                            const fretted = frets.filter((f) => f > 0);
                            const where = `${inst.name} ${v.symbol} ${tab(inst, v)}`;
                            if (frets.includes(0)) {
                                expect(Math.max(...frets), where).toBeLessThanOrEqual(4);
                            }
                            if (fretted.length) {
                                expect(
                                    Math.max(...fretted) - Math.min(...fretted),
                                    where,
                                ).toBeLessThanOrEqual(3);
                            }
                        }
                    }
                }
            }
        });
        it('Em7♭5 in a chart is x x 2 3 3 3 both times, walking up and back (frets 1–6)', () => {
            const voiced = voiceChart(
                chart(
                    ['D', 'm7'],
                    ['E', 'm7b5'],
                    ['F', 'maj7'],
                    ['G', 'm7'],
                    ['F', 'maj7'],
                    ['E', 'm7b5'],
                    ['D', 'm7'],
                ),
                { instrument: GUITAR, home: [1, 6] },
            );
            // It was the stretch x x 2 0 3 6 on the way down.
            expect(voiced.map((v) => tab(GUITAR, v))).toEqual([
                'x x 0 x 1 1',
                'x x 2 3 3 3',
                'x x 3 2 5 x',
                'x x 5 3 6 x',
                'x x 3 2 5 x',
                'x x 2 3 3 3',
                'x x 0 x 1 1',
            ]);
        });
        it('the minor ii–V–i in D minor, frets 1–6: no open one-off, and its neighbours stay shells', () => {
            const two = (rootStrings?: number[]) =>
                voiceChart(chart(['F', 'maj7'], ['E', 'm7b5'], ['A', 'dom7'], ['D', 'm7']), {
                    instrument: GUITAR,
                    home: [1, 6],
                    rootStrings,
                }).map((v) => tab(GUITAR, v));
            // 0 1 0 0 x x read as the hand at the nut and pulled Fmaj7 down to 1 0 2 x x x.
            expect(two()).toEqual(['x x 3 2 5 x', 'x x 2 3 3 3', 'x 0 x 0 2 x', 'x x 0 x 1 1']);
            // Roots on the 6th and 5th strings: Em7♭5 leaves the window for the 7th fret.
            expect(two([6, 5])).toEqual([
                '1 x 2 2 x x',
                'x 7 8 7 8 x',
                '5 x 5 6 x x',
                'x 5 x 5 6 x',
            ]);
        });
        it('E♭m7♭5 in frets 9–14 is a fretted grip', () => {
            const voiced = voiceChart(chart(['E♭', 'm7b5'], ['A♭', 'dom7'], ['D♭', 'm7']), {
                instrument: GUITAR,
                home: [9, 14],
            });
            expect(voiced[0].notes.every((n) => n.fret > 0)).toBe(true);
            expect(voiced[0].notes.map((n) => n.degree)).toContain('b5');
        });
    });

    describe('a ukulele shell in first position takes its open strings', () => {
        const tabs = (
            inst: InstrumentDef,
            home: [number, number] | null,
            ...c: [string, Quality][]
        ) => voiceChart(chart(...c), { instrument: inst, home }).map((v) => tab(inst, v));

        it('C6 is 0 0 0 0 and C7 0 0 0 1, in the default window and unlocked', () => {
            // They were 2 4 3 3 and 3 4 3 3: nearer the middle of the window, no string open.
            for (const home of [[1, 6], null] as ([number, number] | null)[]) {
                for (const inst of [UKULELE, UKULELE_LOW_G]) {
                    expect(tabs(inst, home, ['C', 'six'], ['C', 'dom7'])).toEqual([
                        '0 0 0 0',
                        '0 0 0 1',
                    ]);
                }
            }
        });
        it('Dm7 G7 Cmaj7 and Bm7♭5 E7 Am7 are the first-position chords of the method books', () => {
            expect(tabs(UKULELE, [1, 6], ['D', 'm7'], ['G', 'dom7'], ['C', 'maj7'])).toEqual([
                '2 2 1 3',
                '0 2 1 2',
                '0 0 0 2',
            ]);
            expect(tabs(UKULELE, [1, 6], ['B', 'm7b5'], ['E', 'dom7'], ['A', 'm7'])).toEqual([
                '2 2 1 2',
                '1 2 0 2',
                '0 0 0 0',
            ]);
        });
        it('up the neck an open string earns nothing: from the 2nd fret the grips are closed', () => {
            // The window says where the hand is. One fret off the nut the open C6 no longer
            // wins, though all-open it is inside every window.
            expect(tabs(UKULELE, [2, 7], ['C', 'six'])).toEqual(['5 7 5 7']);
            expect(tabs(UKULELE, [2, 7], ['A', 'm7'], ['D', 'm7'])).toEqual(['5 7 5 7', '5 5 5 5']);
        });
        it('a guitar shell is not sent looking for open strings', () => {
            // With the credit these become 0 x 0 1 x x, x 0 x 0 2 x, x x 0 x 1 2: three
            // one-off grips where the chart is there to teach one movable shape.
            for (const home of [[1, 6], null] as ([number, number] | null)[]) {
                const voiced = voiceChart(
                    chart(['E', 'dom7'], ['A', 'dom7'], ['D', 'dom7'], ['G', 'dom7']),
                    { instrument: GUITAR, home },
                );
                expect(voiced.map((v) => tab(GUITAR, v))).toEqual([
                    'x x 2 x 3 4',
                    '5 4 5 x x x',
                    'x 5 4 5 x x',
                    'x x 5 4 6 x',
                ]);
            }
        });
    });

    describe('the index barre that frees a root', () => {
        /** A grip from its tab, the root on string `root`; fingered as a guitar shell is. */
        const fingered = (tabs: string, root: number, rootBarre = true) => {
            const frets = tabs.split(' ');
            const notes = frets.flatMap((t, i): Note[] => {
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
                          },
                      ];
            });
            assignFingers(notes, { rootBarre });
            const by = new Map(notes.map((n) => [n.string, n.finger]));
            return {
                fingers: frets.map((_, i) => by.get(frets.length - i) ?? 'x').join(' '),
                barres: barres(notes),
            };
        };

        it('G♯°7 4 x 3 4 3 x is 2-1-3-1, the index across the 3rd fret', () => {
            const held = fingered('4 x 3 4 3 x', 6);
            expect(held.fingers).toBe('2 x 1 3 1 x');
            expect(held.barres).toEqual([{ finger: 1, fret: 3, strings: [2, 4] }]);
            // A finger per note leaves the root under the ring finger.
            expect(fingered('4 x 3 4 3 x', 6, false).fingers).toBe('3 x 1 4 2 x');
        });
        it('C6 x 3 2 2 x x is 2-1-1: the same barre under a three-note grip', () => {
            expect(fingered('x 3 2 2 x x', 5).fingers).toBe('x 2 1 1 x x');
            expect(fingered('x 3 2 2 x x', 5, false).fingers).toBe('x 3 1 2 x x');
        });
        it('is not offered where a finger per note already has the root', () => {
            // Each could take a barre; none needs one, so each keeps the fingering it is taught with.
            expect(fingered('x 5 6 5 6 x', 5)).toEqual({ fingers: 'x 1 3 2 4 x', barres: [] });
            expect(fingered('x x 1 2 1 2', 4)).toEqual({ fingers: 'x x 1 3 2 4', barres: [] });
            expect(fingered('x x 3 x 4 4', 4)).toEqual({ fingers: 'x x 1 x 2 3', barres: [] });
            expect(fingered('4 x 4 4 3 x', 6)).toEqual({ fingers: '2 x 3 4 1 x', barres: [] });
        });
        it('cannot free a root when a muted string lies between the notes', () => {
            // E°7 x 7 5 6 x 6: the two 6s have the muted 2nd string between them.
            expect(fingered('x 7 5 6 x 6', 5)).toEqual({ fingers: 'x 4 1 2 x 3', barres: [] });
            expect(fingered('x 5 3 5 x 4', 5)).toEqual({ fingers: 'x 3 1 4 x 2', barres: [] });
        });
        it('among the shells on offer, only the 6th-string °7 and the R–3–6 grips are barred', () => {
            for (const root of ROOTS) {
                for (const q of SHELLS) {
                    for (const v of allPositions(GUITAR, root, q)) {
                        const fretted = v.notes.filter((n) => n.fret > 0).length;
                        const barred =
                            (q === 'dim7' && v.shape.id === '6A' && fretted === 4) ||
                            (q === 'six' && ['6B', '5B'].includes(v.shape.id) && fretted === 3);
                        expect(barres(v.notes).length > 0, `${v.symbol} ${tab(GUITAR, v)}`).toBe(
                            barred,
                        );
                    }
                    // A ukulele shell rings every string and keeps a finger per note.
                    for (const v of allPositions(UKULELE, root, q)) {
                        expect(barres(v.notes), `${v.symbol} ${tab(UKULELE, v)}`).toEqual([]);
                    }
                }
            }
        });
        it('does not move the added tone: F♯°7 at the 9th fret is still x 9 10 8 10 x', () => {
            // x 9 x 8 10 8 could take the barre too, and up the neck would then be the easier.
            expect(tab(GUITAR, grip('5A', 'F♯', 'dim7', 9))).toBe('x 9 10 8 10 x');
        });
        it('in a chart the planner takes it', () => {
            const [v] = voiceChart(chart(['G♯', 'dim7']), {
                instrument: GUITAR,
                home: [2, 7],
                rootStrings: [6, 5],
            });
            expect(tab(GUITAR, v)).toBe('4 x 3 4 3 x');
            expect(v.notes.map((n) => n.finger)).toEqual([2, 1, 3, 1]);
        });
    });

    describe('a buried root is the last resort', () => {
        const voiced = (
            home: [number, number] | null,
            rootStrings: number[] | undefined,
            ...c: [string, Quality][]
        ) => voiceChart(chart(...c), { instrument: GUITAR, home, rootStrings });
        const tabsOf = (vs: Voicing[]) => vs.map((v) => tab(GUITAR, v));

        it('Blue Bossa: Dm7♭5 is x 5 6 5 6 x, not x 5 3 5 x 4 (ring finger on the root)', () => {
            const v = voiced([1, 6], undefined, ['D', 'm7b5'], ['G', 'dom7'], ['C', 'm7']);
            expect(tabsOf(v)).toEqual(['x 5 6 5 6 x', '3 x 3 4 x x', 'x 3 x 3 4 x']);
            expect(v[0].notes.find((n) => n.role === 'R')?.finger).toBe(1);
        });
        it('E°7 is x 7 8 6 8 x, not x 7 5 6 x 6 (little finger on the root)', () => {
            const v = voiced(null, [6, 5], ['E♭', 'm7'], ['E', 'dim7'], ['F', 'dom7']);
            expect(tabsOf(v)[1]).toBe('x 7 8 6 8 x');
        });
        it('B♭°7 is 6 x 5 6 5 x, not 6 4 5 x 5 x', () => {
            const v = voiced([2, 7], [6, 5], ['B♭', 'six'], ['B♭', 'dim7'], ['C', 'm7']);
            expect(tabsOf(v)[1]).toBe('6 x 5 6 5 x');
            expect(v[1].notes.map((n) => n.finger)).toEqual([2, 1, 3, 1]);
        });
        it('it is still played where the position holds nothing else', () => {
            // Roots on the 6th and 5th strings, frets 2–7: Em7♭5's other grips start at the 7th
            // fret and run past the window (x 7 8 7 8 x), so the hand stays and takes this one.
            const classic = voiced([2, 7], [6, 5], ['E', 'm7b5'], ['A', 'dom7'], ['D', 'm7']);
            expect(tabsOf(classic)[0]).toBe('x 7 5 7 x 6');
            // With the 4th string allowed there is a grip to prefer.
            const all = voiced([2, 7], undefined, ['E', 'm7b5'], ['A', 'dom7'], ['D', 'm7']);
            expect(tabsOf(all)[0]).toBe('x x 2 3 3 3');
        });
        it('no chord goes unvoiced: when every grip buries the root, one plays', () => {
            const only: InstrumentDef = { ...GUITAR, shapes: [shape(GUITAR, '5B')] };
            const [v] = voiceChart(chart(['D', 'm7b5']), { instrument: only, home: [1, 6] });
            expect(tab(only, v)).toBe('x 5 3 5 x 4');
        });
        it('a three-note shell is never one: Gm7 x x 5 3 6 x can be held root first', () => {
            // Its cheapest fingering is 3-1-4, but 2-1-3 holds it too, so it stays on offer
            // beside 3 x 3 3 x x and x x 5 x 6 6 and still wins between D7 and C7.
            const v = voiced([1, 6], undefined, ['D', 'dom7'], ['G', 'm7'], ['C', 'dom7']);
            expect(tabsOf(v)).toEqual(['x 5 4 5 x x', 'x x 5 3 6 x', 'x 3 x 3 5 x']);
            expect(v[1].notes.map((n) => n.finger)).toEqual([3, 1, 4]);
        });
        it('with every root string allowed, no m7♭5 or °7 buries its root in any six-fret window', () => {
            for (let w = 1; w <= 10; w++) {
                for (const root of ROOTS) {
                    for (const q of ['m7b5', 'dim7'] as Quality[]) {
                        const [v] = voiceChart([{ root, quality: q }], {
                            instrument: GUITAR,
                            home: [w, w + 5],
                        });
                        const finger = v.notes.find((n) => n.role === 'R')?.finger ?? 0;
                        expect(
                            finger,
                            `${v.symbol} ${tab(GUITAR, v)} in frets ${w}-${w + 5}`,
                        ).toBeLessThanOrEqual(2);
                    }
                }
            }
        });
    });
});

describe('a ukulele chart stays in first position (#1609)', () => {
    const chart = (names: string) =>
        names.split(' ').map((s) => {
            const p = voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false);
            return { root: p.root, quality: p.quality };
        });
    const tabs = (
        inst: InstrumentDef,
        names: string,
        home: [number, number] | null,
        sameGripTolerance?: number,
    ) =>
        voiceChart(chart(names), { instrument: inst, home, sameGripTolerance }).map((v) =>
            tab(inst, v),
        );
    /** The grips each symbol of a chart is voiced with. */
    const gripsBySymbol = (names: string, home: [number, number] | null) => {
        const by = new Map<string, Set<string>>();
        const voiced = tabs(UKULELE, names, home);
        names.split(' ').forEach((sym, i) => {
            by.set(sym, (by.get(sym) ?? new Set()).add(voiced[i]));
        });
        return by;
    };
    /** The first-position grips every ukulele method prints. */
    const BOOK: Record<string, string> = {
        G7: '0 2 1 2',
        C7: '0 0 0 1',
        D7: '2 2 2 3',
        A7: '0 1 0 0',
        E7: '1 2 0 2',
    };
    const { G7, C7, D7 } = BOOK;
    const book = (names: string) => names.split(' ').map((s) => BOOK[s]);
    const NUT: ([number, number] | null)[] = [[1, 6], null];

    // The charts below are the point of #1609. The describes after them bracket its rules one
    // at a time; what each of these three brackets is said on it.
    it('a blues in G is G7 0 2 1 2, C7 0 0 0 1, D7 2 2 2 3 throughout', () => {
        // The method-book grips. Aimed at the middle of frets 1–6 it was 4 5 3 5 and
        // 3 4 3 3 for eight bars, then the open grips for the last three. Either rule fixes it
        // by itself (the hand's costs for a shell, or the aim at first position), so this fails
        // only with both gone: a regression pin, not a bracket.
        const blues = 'G7 G7 G7 G7 C7 C7 G7 G7 D7 C7 G7 G7';
        for (const home of NUT) {
            for (const inst of [UKULELE, UKULELE_LOW_G]) {
                expect(tabs(inst, blues, home)).toEqual(book(blues));
            }
        }
    });
    it('a blues in A is A7 0 1 0 0, D7 2 2 2 3, E7 1 2 0 2 throughout', () => {
        // It was 2 4 3 4 and 4 4 4 5: wholly up the neck, no string open. This one brackets
        // the hand's costs for a shell (`byHand`): with the aim at first position left in and a
        // shell costed by `center` and its root's path again, A7 goes back up the neck.
        const blues = 'A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 A7';
        expect(tabs(UKULELE, blues, [1, 6])).toEqual(book(blues));
    });
    it('F Dm7 Gm7 C7 is 2 0 1 0, 2 2 1 3, 0 2 1 1, 0 0 0 1', () => {
        // One triad and three shells, all in first position. It was 5 5 5 3, 5 5 5 5,
        // 3 5 3 5, 3 4 3 3: the triad aimed at the window's middle, the shells following.
        // Like the blues in G, a regression pin: it fails only with both rules gone.
        expect(tabs(UKULELE, 'F Dm7 Gm7 C7', [1, 6])).toEqual([
            '2 0 1 0',
            '2 2 1 3',
            '0 2 1 1',
            C7,
        ]);
    });
    it('known limit: a jazz blues in A keeps A7 at 2 4 3 4, beside F♯7 3 4 2 4', () => {
        // Not the book's 0 1 0 0, and pinned so that it is seen rather than stumbled on: F♯7
        // has to be 3 4 2 4, one finger away from 2 4 3 4, and `unifyGrips` holds the A7 that
        // is cheaper across the chart. Tracked in #1613; when that lands this
        // expectation changes with it.
        const names = 'A7 D7 A7 A7 D7 D7 A7 F♯7 Bm7 E7 A7 F♯7 Bm7 E7';
        const a7 = tabs(UKULELE, names, [1, 6]).filter((_, i) => names.split(' ')[i] === 'A7');
        expect(new Set(a7)).toEqual(new Set(['2 4 3 4']));
    });
    it('the guitar is not touched: its triads and shells keep their own reckoning', () => {
        const guitar = (names: string, home: [number, number] | null) => tabs(GUITAR, names, home);
        // Three open strings of six are not "every string" (`handFree`): were Am x x 0 0 0 x
        // read as no hand position, this run would leave the 5th-string set for it
        // (x x 2 0 1 x, x x 0 0 0 x).
        expect(guitar('C G Am F', [1, 6])).toEqual([
            'x 3 2 0 x x',
            'x 2 0 0 x x',
            'x 3 2 2 x x',
            'x 3 3 2 x x',
        ]);
        // A move between a guitar triad and a guitar shell is the hand's (`transCost`: either
        // grip read by the hand), as it was before #1609. Two guitar shells keep the root's path.
        expect(guitar('C Am7 Dm7 G7', null)).toEqual([
            'x 3 2 0 x x',
            '5 3 5 x x x',
            'x 5 3 5 x x',
            'x x 5 4 6 x',
        ]);
    });

    describe('a window from the nut is first position, not a middle to aim for', () => {
        it('a blues in B♭ takes B♭7 1 2 1 1 and F7 2 3 1 3 beside E♭7 3 3 3 4', () => {
            // 0.45 a fret, as with no window. At a window's 0.15 the pull to first position is
            // too weak to bring B♭7 down from 3 5 4 5, beside an E♭7 that has to be at the 3rd.
            expect(tabs(UKULELE, 'B♭7 E♭7 B♭7 F7', [1, 6])).toEqual([
                '1 2 1 1',
                '3 3 3 4',
                '1 2 1 1',
                '2 3 1 3',
            ]);
        });
        it('the triads are aimed there too: Am F C G is 2 0 0 0, 2 0 1 0, 0 0 0 3, 0 2 3 2', () => {
            // Started on Am in frets 1–6 it was 2 4 5 3, 2 5 5 3, then the open C and G.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'Am F C G', home)).toEqual([
                    '2 0 0 0',
                    '2 0 1 0',
                    '0 0 0 3',
                    '0 2 3 2',
                ]);
            }
        });
        it('a window that starts higher keeps its own middle and takes no open string', () => {
            for (const home of [
                [2, 7],
                [5, 10],
                [7, 12],
            ] as [number, number][]) {
                for (const names of [
                    'G7 G7 G7 G7 C7 C7 G7 G7 D7 C7 G7 G7',
                    'C6 C7 Fmaj7 Fm7 C6 Dm7 G7',
                    'C Am7 Dm7 G7',
                    'Am F C G',
                ]) {
                    const voiced = voiceChart(chart(names), { instrument: UKULELE, home });
                    for (const v of voiced) {
                        expect(
                            v.notes.every((n) => n.fret >= home[0] && n.fret <= home[1]),
                            `${v.symbol} ${tab(UKULELE, v)} in frets ${home[0]}–${home[1]}`,
                        ).toBe(true);
                    }
                }
            }
            // The same blues in frets 5–10: every grip up the neck, around the 7th fret.
            expect(tabs(UKULELE, 'G7 C7 D7 G7', [5, 10])).toEqual([
                '7 7 7 8',
                '9 10 8 10',
                '7 9 8 9',
                '7 7 7 8',
            ]);
        });
    });

    describe('a shell is costed as the triad beside it', () => {
        it('C to Am7 is 0 0 0 3 to 0 0 0 0: lifting every finger is not a shift', () => {
            // Read as "the hand at fret 0", all-open Am7 was three frets from the C, and the
            // pair went up the neck instead (5 4 3 3 to 2 4 3 3).
            for (const home of NUT) {
                expect(tabs(UKULELE, 'C Am7 Dm7 G7', home)).toEqual([
                    '0 0 0 3',
                    '0 0 0 0',
                    '2 2 1 3',
                    G7,
                ]);
            }
        });
        it('off the nut all four strings open is the hand gone to the nut, as before', () => {
            expect(tabs(UKULELE, 'C Am7', [2, 7])).not.toContain('0 0 0 0');
        });
    });

    describe('one grip per symbol', () => {
        it('holds a ukulele shell: Gm7 Cm7 D7 Gm7 plays one Gm7, 0 2 1 1', () => {
            expect(tabs(UKULELE, 'Gm7 Cm7 D7 Gm7', [1, 6])).toEqual([
                '0 2 1 1',
                '3 3 3 3',
                D7,
                '0 2 1 1',
            ]);
            // The plan alone starts on 3 5 3 5, level with the Cm7, and ends on the open grip.
            expect(tabs(UKULELE, 'Gm7 Cm7 D7 Gm7', [1, 6], 0)).toEqual([
                '3 5 3 5',
                '3 3 3 3',
                D7,
                '0 2 1 1',
            ]);
        });
        it('up the neck too: a blues in G in frets 5–10 plays one C7', () => {
            const blues = 'G7 G7 G7 G7 C7 C7 G7 G7 D7 C7 G7 D7';
            expect(
                new Set(tabs(UKULELE, blues, [5, 10]).filter((_, i) => [4, 5, 9].includes(i))),
            ).toEqual(new Set(['5 7 6 7']));
            expect(tabs(UKULELE, blues, [5, 10], 0)[9]).toBe('9 10 8 10');
        });
        it('the charts of #1609 voice every symbol one way, in frets 1–6 and unlocked', () => {
            for (const names of [
                // F blues with a turnaround: Gm7 and C7 were 0 2 1 1 / 0 0 0 1, then 3 5 3 5 / 3 4 3 3
                'F7 B♭7 F7 F7 B♭7 B♭7 F7 D7 Gm7 C7 F7 D7 Gm7 C7',
                // I6 I7 IV iv I6 I°7 ii V in C: C6 was 0 0 0 0, then 2 4 3 3
                'C6 C7 Fmaj7 Fm7 C6 Cdim7 Dm7 G7',
                'G7 C7 G7 D7 C7 G7',
                'G7 G7 G7 G7 C7 C7 G7 G7 D7 C7 G7 D7',
                'A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7',
            ]) {
                for (const home of NUT) {
                    for (const [sym, grips] of gripsBySymbol(names, home)) {
                        expect([...grips], `${sym} in ${names}`).toHaveLength(1);
                    }
                }
            }
            expect(tabs(UKULELE, 'G7 C7 G7 D7 C7 G7', [1, 6])).toEqual([G7, C7, G7, D7, C7, G7]);
            expect(tabs(UKULELE, 'C6 C7 Fmaj7 Fm7 C6 Cdim7 Dm7 G7', [1, 6])).toEqual([
                '0 0 0 0',
                C7,
                '2 4 1 3',
                '1 3 1 3',
                '0 0 0 0',
                '2 3 2 3',
                '2 2 1 3',
                G7,
            ]);
        });
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
    it('guitar G D Em C G D C D in frets 2–7 plays one C (#1599)', () => {
        // Voiced chord by chord the first C follows the Em (x 7 5 5 x x) and the second follows
        // the D (x 3 2 0 x x). One C costs the chart 1.5, under a position shift, so it is kept:
        // the Em comes down with it, and the string set (above) holds.
        const names = ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'];
        expect(tabs(GUITAR, names, [2, 7])).toEqual([
            'x 5 5 4 x x',
            'x 5 4 2 x x',
            'x 2 2 0 x x',
            'x 3 2 0 x x',
            'x 5 5 4 x x',
            'x 5 4 2 x x',
            'x 3 2 0 x x',
            'x 5 4 2 x x',
        ]);
        // The rule off is the planner alone: two Cs.
        const alone = (tolerance: number) =>
            voiceChart(chart(names), {
                instrument: GUITAR,
                home: [2, 7],
                sameGripTolerance: tolerance,
            }).map((v) => tab(GUITAR, v));
        expect([alone(0)[3], alone(0)[6]]).toEqual(['x 7 5 5 x x', 'x 3 2 0 x x']);
        // The threshold is exclusive, bracketed on this chart's own 1.5 by one step of the cost
        // model (every term is a multiple of 0.025).
        expect(alone(1.5)).toEqual(alone(0));
        expect(alone(1.525)).toEqual(tabs(GUITAR, names, [2, 7]));
    });
    it('one grip per symbol stops at a position shift: 2.075 unifies, 2.125 does not (#1599)', () => {
        const grips = (names: string[], symbol: string, voiced: string[]) =>
            new Set(voiced.filter((_, i) => names[i] === symbol));
        // Just under the default 2.1: one D♭ costs 2.075, so both take the first-position grip.
        const under = ['Db', 'Ab', 'Ebm', 'B', 'Bbm', 'Fm', 'Db'];
        const split = voiceChart(chart(under), {
            instrument: GUITAR,
            home: null,
            sameGripTolerance: 0,
        }).map((v) => tab(GUITAR, v));
        expect(grips(under, 'Db', split)).toEqual(new Set(['x x x 6 6 4', 'x x x 1 2 1']));
        expect(grips(under, 'Db', tabs(GUITAR, under, null))).toEqual(new Set(['x x x 1 2 1']));
        // Just over: one Em would cost 2.125. The first sits between a Dm and an F at the 2nd
        // and 3rd frets, the last follows a G at the 5th, and each stays where its neighbours are.
        const over = ['Dm', 'Em', 'F', 'Bb', 'G', 'Em'];
        expect(grips(over, 'Em', tabs(GUITAR, over, [2, 7]))).toEqual(
            new Set(['x 2 2 0 x x', 'x 7 5 4 x x']),
        );
    });
    it('a symbol whose two grips are a neck apart keeps both (#1599)', () => {
        // The A after an F♯ at the 2nd fret is the open-position x x x 2 2 0; the A between an
        // E and an A♭m at the 4th fret is x x x 6 5 5. One A would cost 3.125, a five-fret leap
        // there and back, so the voice leading wins and the chart is exactly the planner's.
        const names = ['E', 'A', 'Abm', 'E', 'Ebm', 'B', 'F#', 'A', 'B', 'Ebm'];
        const voiced = tabs(GUITAR, names, [2, 7]);
        expect([voiced[1], voiced[7]]).toEqual(['x x x 6 5 5', 'x x x 2 2 0']);
        expect(voiced).toEqual(
            voiceChart(chart(names), {
                instrument: GUITAR,
                home: [2, 7],
                sameGripTolerance: 0,
            }).map((v) => tab(GUITAR, v)),
        );
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
    it('off the nut a ukulele shell is closed and sits in its window: Dm7 G7 Cmaj7 in frets 2–7', () => {
        // A ukulele shell is costed as its triads are, everywhere (#1609). Off the nut that
        // gives it nothing first position does: no open-string credit, the window's own middle
        // as the target. So the grips are the closed ones, as they were before.
        expect(tabs(UKULELE, ['Dm7', 'G7', 'Cmaj7'], [2, 7])).toEqual([
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
    it('locked to frets 1–6, the ukulele ii–V–I is the same first-position shapes (#1609)', () => {
        // A window from the nut is first position plus reach, not a middle to aim for.
        const v = voiceChart(chart(['Dm7', 'G7', 'Cmaj7']), { instrument: UKULELE, home: [1, 6] });
        expect(v.every((x) => inHome(x, [1, 6]))).toBe(true);
        expect(v.map((x) => tab(UKULELE, x))).toEqual(['2 2 1 3', '0 2 1 2', '0 0 0 2']);
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
    it('a chart of closed triads takes barres; a ii–V–I of shells does not', () => {
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
