import { parseChord } from '@band/index';
import { describe, expect, it } from 'vitest';
import { spellRoot, voicingChord } from './adapter';
import {
    assignFingers,
    barres,
    type FingerOpts,
    fingerOptions,
    fingerSequence,
    fingerTransCost,
    taughtOptions,
} from './fingering';
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
import {
    GUITAR_OPEN_CHORDS,
    GUITAR_OPEN_SEVENTHS,
    GUITAR_OPEN_SUS_AFTER_PLAN,
    UKULELE_LOW_G,
} from './instruments';
import { keyRoot, SONG_SHAPES, songChart } from './test/keys';
import { QUALITIES } from './theory';
import type { Quality } from './types';
import {
    allowedShapes,
    buildAt,
    inReach,
    lessonGrip,
    oneFingerApart,
    rootFrets,
    slidFrom,
} from './voicing';

const tab = (inst: InstrumentDef, v: Voicing) => {
    const m = new Map(v.notes.map((n) => [n.string, n.fret]));
    return Array.from({ length: inst.strings }, (_, i) => inst.strings - i)
        .map((s) => m.get(s) ?? 'x')
        .join(' ');
};
const R = keyRoot;

/**
 * The guitar without the open triads and sus chords of #1849. At the nut the real guitar plays
 * those whole (C x 3 2 0 1 0, Am x 0 2 2 1 0); the tests that use this pin the first-position
 * fingering rules on the three-string grips they were written for, which the chords with no
 * open form, and every window from the 2nd fret, still play.
 */
const GUITAR_TRIADS: InstrumentDef = {
    ...GUITAR,
    shapes: GUITAR.shapes.filter((s) => !(s.book && s.kind !== 'shell')),
};
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
    describe('the first-position forms the six shapes cannot reach (#1613)', () => {
        const grip = (id: string, root: string, quality: Quality) =>
            build(UKULELE, shape(UKULELE, id), R(root), quality)!;
        const fingers = (v: Voicing) => v.notes.map((n) => n.finger).join(' ');
        /** Every chord a shape is offered to, over all twelve roots and every triad quality. */
        const offeredTo = (id: string) =>
            ROOTS.flatMap((root) =>
                (Object.keys(QUALITIES) as Quality[]).flatMap((q) =>
                    allPositions(UKULELE, root, q)
                        .filter((v) => v.shape.id === id)
                        .map((v) => `${v.symbol} ${tab(UKULELE, v)}`),
                ),
            );

        // The pitches are worked out from the tuning (G4 67, C4 60, E4 64, A4 69), not read
        // off the digits: each grip must sound its own chord and nothing else.
        it('Fm 1 0 1 3 is A♭ C F C, index, middle and little finger', () => {
            const fm = grip('UTFm', 'F', 'min');
            expect(tab(UKULELE, fm)).toBe('1 0 1 3');
            expect(gripMidis(UKULELE, fm)).toEqual([68, 60, 65, 72]);
            expect(fingers(fm)).toBe('1 0 2 4');
            expect(barres(fm.notes)).toEqual([]);
        });
        it('E 1 4 0 2 is G♯ E E B, index, little finger and middle', () => {
            const e = grip('UTEo', 'E', 'maj');
            expect(tab(UKULELE, e)).toBe('1 4 0 2');
            expect(gripMidis(UKULELE, e)).toEqual([68, 64, 64, 71]);
            expect(fingers(e)).toBe('1 4 0 2');
            expect(barres(e.notes)).toEqual([]);
        });
        it('Cm 0 3 3 3 is G E♭ G C, the index across the three 3s', () => {
            const cm = grip('UTCm', 'C', 'min');
            expect(tab(UKULELE, cm)).toBe('0 3 3 3');
            expect(gripMidis(UKULELE, cm)).toEqual([67, 63, 67, 72]);
            expect(fingers(cm)).toBe('0 1 1 1');
            expect(barres(cm.notes)).toEqual([{ finger: 1, fret: 3, strings: [1, 3] }]);
        });
        it('F♯sus2 1 1 2 4 is G♯ C♯ F♯ C♯, the index across the two 1s; Fsus2 is 0 0 1 3', () => {
            const fs = grip('UTFs', 'F♯', 'sus2');
            expect(tab(UKULELE, fs)).toBe('1 1 2 4');
            expect(gripMidis(UKULELE, fs)).toEqual([68, 61, 66, 73]);
            expect(fingers(fs)).toBe('1 1 2 4');
            expect(barres(fs.notes)).toEqual([{ finger: 1, fret: 1, strings: [3, 4] }]);
            const f = grip('UTFs', 'F', 'sus2');
            expect(tab(UKULELE, f)).toBe('0 0 1 3');
            expect(gripMidis(UKULELE, f)).toEqual([67, 60, 65, 72]);
        });
        it('each open form is one root: not moved up the neck, not lent to another quality', () => {
            // Free to move or change colour they are grips nobody shows, and the costs took
            // them: F 2 0 1 3 for the book's 2 0 1 0, F♯m 2 1 2 4 for 2 1 2 0, Em 0 4 0 2 for
            // 0 4 3 2, C♯m 1 4 4 4 for 1 1 0 4. The E and Cm forms also serve the sus chord
            // one finger away (#1675).
            expect(offeredTo('UTFm')).toEqual(['Fm 1 0 1 3']);
            expect(offeredTo('UTEo')).toEqual(['E 1 4 0 2', 'Esus4 2 4 0 2']);
            // As a sus2 the Cm form also moves inside the 4th fret (#1688): D♭sus2 1 3 4 4,
            // the book's grip a fret up from Csus2. Every other root would leave it.
            expect(offeredTo('UTCm')).toEqual(['Cm 0 3 3 3', 'Csus2 0 2 3 3', 'D♭sus2 1 3 4 4']);
            expect(offeredTo('UTAs')).toEqual(['Asus2 2 4 0 2']);
            expect(offeredTo('UPA')).toEqual(['A5 2 4 0 0']);
            expect(offeredTo('UPE')).toEqual(['E5 4 4 0 2']);
            // The sus2 shape does move, for sus2 only: every root has it.
            const sus2 = offeredTo('UTFs');
            expect(sus2.every((s) => s.includes('sus2'))).toBe(true);
            expect(new Set(sus2.map((s) => s.split(' ')[0])).size).toBe(12);
        });
        // As above: the pitches come from the tuning, so each grip is shown to sound its own
        // chord — and Esus4 and Asus2, the same three notes, the same four strings.
        it('Esus4 and Asus2 are both 2 4 0 2, A E E B (#1675)', () => {
            const esus4 = grip('UTEo', 'E', 'sus4');
            const asus2 = grip('UTAs', 'A', 'sus2');
            for (const v of [esus4, asus2]) {
                expect(tab(UKULELE, v)).toBe('2 4 0 2');
                expect(gripMidis(UKULELE, v)).toEqual([69, 64, 64, 71]);
                expect(barres(v.notes)).toEqual([]);
            }
            expect(esus4.notes.map((n) => n.degree)).toEqual(['4', 'R', 'R', '5']);
            expect(asus2.notes.map((n) => n.degree)).toEqual(['R', '5', '5', '2']);
        });
        it('Csus2 0 2 3 3 is G D G C; A5 2 4 0 0 is A E E A; E5 4 4 0 2 is B E E B (#1675)', () => {
            const csus2 = grip('UTCm', 'C', 'sus2');
            expect(tab(UKULELE, csus2)).toBe('0 2 3 3');
            expect(gripMidis(UKULELE, csus2)).toEqual([67, 62, 67, 72]);
            const a5 = grip('UPA', 'A', 'five');
            expect(tab(UKULELE, a5)).toBe('2 4 0 0');
            expect(gripMidis(UKULELE, a5)).toEqual([69, 64, 64, 69]);
            const e5 = grip('UPE', 'E', 'five');
            expect(tab(UKULELE, e5)).toBe('4 4 0 2');
            expect(gripMidis(UKULELE, e5)).toEqual([71, 64, 64, 71]);
        });
        it('build gives a shape only the qualities it is taught for (#1675)', () => {
            // It went straight to `buildAt`, so the Fm form built an F major, 2 0 1 3.
            expect(build(UKULELE, shape(UKULELE, 'UTFm'), R('F'), 'maj')).toBeNull();
            expect(build(UKULELE, shape(UKULELE, 'UTEo'), R('E'), 'min')).toBeNull();
            expect(build(UKULELE, shape(UKULELE, 'UTFs'), R('F'), 'min')).toBeNull();
            expect(build(UKULELE, shape(UKULELE, 'UTFm'), R('F'), 'min')).not.toBeNull();
            // A shape with no list serves every quality of its kind, as before.
            expect(tab(UKULELE, build(UKULELE, shape(UKULELE, 'UTD'), R('D'), 'sus4')!)).toBe(
                '2 2 3 0',
            );
        });
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
                    // The guitar has no add9 grip (#1820): its three-string triads have no
                    // string to spare, so the adapter never hands it one.
                    if (inst === GUITAR && q === 'add9') {
                        expect(allPositions(inst, root, q)).toEqual([]);
                        continue;
                    }
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
            // It was the stretch x x 2 0 3 6 on the way down. Dm7 and Fmaj7 are the book's open
            // chords since #1838, and Gm7 the R–3–7 shell beside them.
            expect(voiced.map((v) => tab(GUITAR, v))).toEqual([
                'x x 0 2 1 1',
                'x x 2 3 3 3',
                'x x 3 2 1 0',
                '3 1 3 x x x',
                'x x 3 2 1 0',
                'x x 2 3 3 3',
                'x x 0 2 1 1',
            ]);
        });
        it('the minor ii–V–i in D minor, frets 1–6: no open one-off for the m7♭5', () => {
            const two = (rootStrings?: number[]) =>
                voiceChart(chart(['F', 'maj7'], ['E', 'm7b5'], ['A', 'dom7'], ['D', 'm7']), {
                    instrument: GUITAR,
                    home: [1, 6],
                    rootStrings,
                }).map((v) => tab(GUITAR, v));
            // 0 1 0 0 x x read as the hand at the nut and pulled Fmaj7 down to 1 0 2 x x x. Fmaj7,
            // A7 and Dm7 are the book's open chords (#1838).
            expect(two()).toEqual(['x x 3 2 1 0', 'x x 2 3 3 3', 'x 0 2 0 2 0', 'x x 0 2 1 1']);
            // Roots on the 6th and 5th strings: Em7♭5 leaves the window for the 7th fret, and the
            // open chords beside it are the book's all the same (they are no moving shells).
            expect(two([6, 5])).toEqual([
                'x x 3 2 1 0',
                'x 7 8 7 8 x',
                'x 0 2 0 2 0',
                'x x 0 2 1 1',
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
        it('a guitar shell is not sent looking for open strings: the open 7ths of the books are a tier of their own', () => {
            // With the credit these became 0 x 0 1 x x, x 0 x 0 2 x, x x 0 x 1 2: three
            // one-off grips, each skipping a string a strum rings. Since #1838 a 7th chord at the
            // nut that has an open book chord plays it, whole (`GUITAR_OPEN_SEVENTHS`).
            for (const home of [[1, 6], null] as ([number, number] | null)[]) {
                const voiced = voiceChart(
                    chart(['E', 'dom7'], ['A', 'dom7'], ['D', 'dom7'], ['G', 'dom7']),
                    { instrument: GUITAR, home },
                );
                expect(voiced.map((v) => tab(GUITAR, v))).toEqual([
                    '0 2 0 1 0 0',
                    'x 0 2 0 2 0',
                    'x x 0 2 1 2',
                    '3 2 0 0 0 1',
                ]);
            }
            // Up the neck they are the shells they were.
            const up = voiceChart(
                chart(['E', 'dom7'], ['A', 'dom7'], ['D', 'dom7'], ['G', 'dom7']),
                { instrument: GUITAR, home: [2, 7] },
            );
            expect(up.every((v) => v.notes.length === 3 && !v.shape.book)).toBe(true);
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
                        // The book's open 7ths are strummed chords, barred as the books print
                        // them (Dmaj7 x x 0 2 2 2, #1838), not comping shells.
                        if (v.shape.book) {
                            continue;
                        }
                        const fretted = v.notes.filter((n) => n.fret > 0).length;
                        const barred =
                            (q === 'dim7' && v.shape.id === '6A' && fretted === 4) ||
                            (q === 'six' && ['6B', '5B'].includes(v.shape.id) && fretted === 3);
                        expect(barres(v.notes).length > 0, `${v.symbol} ${tab(GUITAR, v)}`).toBe(
                            barred,
                        );
                    }
                    // A ukulele shell is a strummed chord and bars as its triads do (#1681):
                    // four notes on one fret are never a fingertip each.
                    for (const v of allPositions(UKULELE, root, q)) {
                        if (new Set(v.notes.map((n) => n.fret)).size === 1 && v.notes[0].fret) {
                            expect(barres(v.notes), `${v.symbol} ${tab(UKULELE, v)}`).toEqual([
                                { finger: 1, fret: v.notes[0].fret, strings: [1, 4] },
                            ]);
                        }
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
            // In frets 2–7: at the nut G7 is the book's open chord since #1838, and Dm7♭5 beside
            // it the open x x 0 1 1 1.
            const v = voiced([2, 7], undefined, ['D', 'm7b5'], ['G', 'dom7'], ['C', 'm7']);
            expect(tabsOf(v)).toEqual(['x 5 6 5 6 x', 'x x 5 4 6 x', 'x 3 x 3 4 x']);
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
        it('it is still played where the position holds nothing else, in the window or a fret past it', () => {
            // Roots on the 6th and 5th strings, frets 10–15: Cm7♭5's only other grips are at
            // the 3rd fret and the 8th (8 x 8 8 7 x, three frets below the window), so the
            // hand stays and takes this one.
            const classic = voiced([10, 15], [6, 5], ['C', 'm7b5'], ['F', 'dom7'], ['B♭', 'm7']);
            expect(tabsOf(classic)[0]).toBe('x 15 13 15 x 14');
            // In frets 2–7 Em7♭5 is in the same spot (x 7 5 7 x 6), but there the root-first
            // grip is one fret past the window with its root inside, and it is taken (#1610).
            const reach = voiced([2, 7], [6, 5], ['E', 'm7b5'], ['A', 'dom7'], ['D', 'm7']);
            expect(tabsOf(reach)[0]).toBe('x 7 8 7 8 x');
            // With the 4th string allowed there is a grip to prefer inside the window.
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
            // beside 3 x 3 3 x x and x x 5 x 6 6 and still wins between D7 and C7. In frets
            // 2–7: at the nut D7 and C7 are the book's open chords (#1838).
            const v = voiced([2, 7], undefined, ['D', 'dom7'], ['G', 'm7'], ['C', 'dom7']);
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
    describe('a symbol voiced two ways keeps the book grip (#1613)', () => {
        /** The grips one symbol of a chart is voiced with. */
        const gripsOf = (
            inst: InstrumentDef,
            names: string,
            symbol: string,
            home: [number, number] | null,
        ) => new Set(tabs(inst, names, home).filter((_, i) => names.split(' ')[i] === symbol));

        it('a jazz blues in A plays every A7 as 0 1 0 0, and moves for F♯7 3 4 2 4', () => {
            // It was 2 4 3 4 throughout: F♯7 has to be 3 4 2 4, one finger from that A7, so
            // holding the closed grip was the cheaper of the two holds. The open one is what a
            // teacher shows (`bookGrip`); since #1675 it is the only A7 on offer at the nut.
            const names = 'A7 D7 A7 A7 D7 D7 A7 F♯7 Bm7 E7 A7 F♯7 Bm7 E7';
            for (const home of NUT) {
                expect(gripsOf(UKULELE, names, 'A7', home)).toEqual(new Set([BOOK.A7]));
                expect(gripsOf(UKULELE, names, 'F♯7', home)).toEqual(new Set(['3 4 2 4']));
            }
        });
        it('the same for Amaj7 1 1 0 0 in a canon in A, and a triad: E♭ 0 3 3 1 in B♭', () => {
            const canon = 'Amaj7 E7 F♯m7 C♯m7 Dmaj7 Amaj7 Dmaj7 E7';
            expect(gripsOf(UKULELE, canon, 'Amaj7', [1, 6])).toEqual(new Set(['1 1 0 0']));
            const triads = 'B♭ F Gm Dm E♭ B♭ E♭ F';
            expect(gripsOf(UKULELE, triads, 'E♭', [1, 6])).toEqual(new Set(['0 3 3 1']));
        });
        it('a chord with no open grip stays in first position: C♯7 1 1 1 2 (#1688)', () => {
            // C♯7's book grip 1 1 1 2 has no open string. Until #1688 the costs placed it, and
            // beside F♯maj7 3 5 2 4 it went up to 4 5 4 4 (`firstPosition`).
            expect(tabs(UKULELE, 'F♯maj7 C♯7 D♯m7 Bmaj7', [1, 6])[1]).toBe('1 1 1 2');
            // C♯m7 in that canon in A has one, 1 1 0 2, and plays it (#1675). It was
            // 4 4 4 4: the plan voiced it one way, so the rule for a split symbol never saw it.
            expect(
                gripsOf(UKULELE, 'Amaj7 E7 F♯m7 C♯m7 Dmaj7 Amaj7 Dmaj7 E7', 'C♯m7', [1, 6]),
            ).toEqual(new Set(['1 1 0 2']));
        });
        it('B♭maj7 in a canon in B♭ is 2 2 1 1 throughout (#1688)', () => {
            // It was 2 2 1 1 and 3 5 5 5: one B♭maj7 cost 2.275, past the tolerance, and
            // neither grip is open. 3 5 5 5 has left first position, so it is no longer on offer
            // beside 2 2 1 1 (`firstPosition`). The tolerance itself is pinned on the guitar.
            const canon = 'B♭maj7 F7 Gm7 Dm7 E♭maj7 B♭maj7 E♭maj7 F7';
            expect(gripsOf(UKULELE, canon, 'B♭maj7', [1, 6])).toEqual(new Set(['2 2 1 1']));
        });
        it('only in first position: in frets 2–7 the cheaper hold wins, D 2 2 2 5', () => {
            // D 2 2 2 0 is on offer there (an open string is inside every window) and is
            // one of the two grips the plan uses; up the neck it is the hand gone to the nut.
            expect(gripsOf(UKULELE, 'G D Em Bm C G C D', 'D', [2, 7])).toEqual(
                new Set(['2 2 2 5']),
            );
        });
        it('only a grip that strums every string: a guitar triad keeps the cheaper hold', () => {
            // E x x x 1 0 0 is one inversion among three, not the book's one grip. On the
            // three-string grips: the real guitar plays the whole open E there (#1849).
            expect(gripsOf(GUITAR_TRIADS, 'B F♯ G♯m D♯m E B E F♯', 'E', null)).toEqual(
                new Set(['x x x 4 5 4']),
            );
        });
    });
    describe('first-position triads take the book grip (#1613)', () => {
        it('C C7 F Fm C: Fm is 1 0 1 3, and F stays 2 0 1 0', () => {
            // Fm was 1 5 4 3, a five-fret reach, the only Fm the six shapes hold near the nut.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'C C7 F Fm C', home)).toEqual([
                    '0 0 0 3',
                    C7,
                    '2 0 1 0',
                    '1 0 1 3',
                    '0 0 0 3',
                ]);
            }
        });
        it('A D E A: E is 1 4 0 2', () => {
            // It was 1 4 4 2, or 4 4 4 2 beside a B.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'A D E A', home)).toEqual([
                    '2 1 0 0',
                    '2 2 2 0',
                    '1 4 0 2',
                    '2 1 0 0',
                ]);
            }
        });
        it('Cm Fm G Cm: Cm is 0 3 3 3', () => {
            // It was 5 3 3 3, with Fm 5 5 4 3 and G 4 2 3 2 following it up the neck.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'Cm Fm G Cm', home)).toEqual([
                    '0 3 3 3',
                    '1 0 1 3',
                    '0 2 3 2',
                    '0 3 3 3',
                ]);
            }
        });
        it('the chords whose book grip the six shapes already hold keep it', () => {
            expect(tabs(UKULELE, 'G Em C D', [1, 6])).toEqual([
                '0 2 3 2',
                '0 4 3 2',
                '0 0 0 3',
                '2 2 2 0',
            ]);
            expect(tabs(UKULELE, 'F♯m B E C♯m', [1, 6])).toEqual([
                '2 1 2 0',
                '4 3 2 2',
                '1 4 0 2',
                '1 1 0 4',
            ]);
        });
        it('no major or minor triad at the nut is five frets wide where a narrower grip fits', () => {
            // I V vi IV, I vi IV V, i iv V i, I IV V I, i ♭VII ♭VI V and ii V I vi in all twelve
            // keys, in frets 1–6 and unlocked. Before the open forms this held 14 such grips,
            // every one of them Fm 1 5 4 3.
            const span = (v: Voicing) => {
                const fretted = v.notes.map((n) => n.fret).filter((f) => f > 0);
                return fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
            };
            const PROGRESSIONS: [number, Quality][][] = [
                [
                    [0, 'maj'],
                    [7, 'maj'],
                    [9, 'min'],
                    [5, 'maj'],
                ],
                [
                    [0, 'maj'],
                    [9, 'min'],
                    [5, 'maj'],
                    [7, 'maj'],
                ],
                [
                    [0, 'min'],
                    [5, 'min'],
                    [7, 'maj'],
                    [0, 'min'],
                ],
                [
                    [0, 'maj'],
                    [5, 'maj'],
                    [7, 'maj'],
                    [0, 'maj'],
                ],
                [
                    [0, 'min'],
                    [10, 'maj'],
                    [8, 'maj'],
                    [7, 'maj'],
                ],
                [
                    [2, 'min'],
                    [7, 'maj'],
                    [0, 'maj'],
                    [9, 'min'],
                ],
            ];
            const wide: string[] = [];
            for (const home of NUT) {
                for (let tonic = 0; tonic < 12; tonic++) {
                    for (const bars of PROGRESSIONS) {
                        const voiced = voiceChart(
                            bars.map(([interval, quality]) => ({
                                root: ROOTS[(tonic + interval) % 12],
                                quality,
                            })),
                            { instrument: UKULELE, home },
                        );
                        for (const v of voiced) {
                            const narrower = allPositions(UKULELE, v.root, v.quality).some(
                                (o) => inHome(o, home) && span(o) < 4,
                            );
                            if (span(v) >= 4 && narrower) {
                                wide.push(`${v.symbol} ${tab(UKULELE, v)}`);
                            }
                        }
                    }
                }
            }
            expect(wide).toEqual([]);
        });
    });
    describe('a chord with a book grip plays it, whatever stands beside it (#1675)', () => {
        it('F is 2 0 1 0 between two Cm 0 3 3 3, never the Em shape 2 5 5 3', () => {
            // The i–IV–i vamp. It was 2 5 5 3: a fret from the Cm on three strings, so the
            // shorter trip. `Cm F` and `Cm F G Cm` already gave 2 0 1 0.
            const F = '2 0 1 0';
            const CM = '0 3 3 3';
            for (const home of NUT) {
                for (const inst of [UKULELE, UKULELE_LOW_G]) {
                    expect(tabs(inst, 'Cm F Cm', home)).toEqual([CM, F, CM]);
                    expect(tabs(inst, 'Cm F Cm G', home)).toEqual([CM, F, CM, '0 2 3 2']);
                    expect(tabs(inst, 'Cm F Cm Cm', home)).toEqual([CM, F, CM, CM]);
                    expect(tabs(inst, 'Cm Cm F Cm', home)).toEqual([CM, CM, F, CM]);
                    // A♭ 1 3 4 3 is its first-position grip (5 3 4 3 is for a hand at the 3rd fret).
                    expect(tabs(inst, 'Cm F A♭ G', home)).toEqual([CM, F, '1 3 4 3', '0 2 3 2']);
                }
            }
        });
        it('a dim triad beside it does not pull C or F off the nut', () => {
            // C was 5 4 3 3 beside Fdim and Cdim, F 2 5 5 3 beside Fdim.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'F Fdim C', home)).toEqual(['2 0 1 0', '4 5 4 2', '0 0 0 3']);
                expect(tabs(UKULELE, 'C Fdim', home)).toEqual(['0 0 0 3', '4 5 4 2']);
                expect(tabs(UKULELE, 'C Cdim Dm7 G7', home)).toEqual([
                    '0 0 0 3',
                    '5 3 2 3',
                    '2 2 1 3',
                    G7,
                ]);
            }
        });
        it('A7 opens at 0 1 0 0 before D7 2 2 2 3', () => {
            // It was 2 4 3 4, one finger from the D7; with a second A7 after an E7 it was open.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'A7 D7', home)).toEqual(book('A7 D7'));
                expect(tabs(UKULELE, 'A7 D7 E7', home)).toEqual(book('A7 D7 E7'));
            }
        });
        it('E is 1 4 0 2 beside Eaug, Asus2 and G♯m', () => {
            // It was 1 4 4 2 in all three, the Em shape as a major: the plan voiced E one way,
            // so the rule for a split symbol had nothing to settle.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'E Eaug E6 E7 A', home)).toEqual([
                    '1 4 0 2',
                    '1 4 4 3',
                    '1 1 0 2',
                    BOOK.E7,
                    '2 1 0 0',
                ]);
                // Asus2 2 4 0 2 is one finger from that E; A is the open 2 1 0 0 (it was the
                // G shape 2 4 5 4, one finger from Asus2 2 4 5 2).
                expect(tabs(UKULELE, 'E Asus2 A B', home)).toEqual([
                    '1 4 0 2',
                    '2 4 0 2',
                    '2 1 0 0',
                    '4 3 2 2',
                ]);
                expect(tabs(UKULELE, 'E G♯m A B', home)).toEqual([
                    '1 4 0 2',
                    '1 3 4 2',
                    '2 1 0 0',
                    '4 3 2 2',
                ]);
            }
        });
        it('Esus4 is 2 4 0 2 beside E 1 4 0 2; up the neck both are closed', () => {
            for (const home of NUT) {
                expect(tabs(UKULELE, 'E Esus4 E', home)).toEqual(['1 4 0 2', '2 4 0 2', '1 4 0 2']);
            }
            // In frets 2–7 the E is a closed grip, and the sus4 is that grip with one finger up.
            expect(tabs(UKULELE, 'E Esus4 E', [2, 7])).toEqual(['4 4 4 7', '4 4 5 7', '4 4 4 7']);
        });
        it('alone: Esus4 and Asus2 2 4 0 2, Csus2 0 2 3 3, A5 2 4 0 0, E5 4 4 0 2', () => {
            // They were 4 4 5 2 (both), 5 2 3 3, 2 4 5 x and 4 4 7 7 — and E5 in frets 1–6,
            // which hold no 4 4 7 7, went to the 9th fret.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'Esus4', home)).toEqual(['2 4 0 2']);
                expect(tabs(UKULELE, 'Asus2', home)).toEqual(['2 4 0 2']);
                expect(tabs(UKULELE, 'Csus2', home)).toEqual(['0 2 3 3']);
                expect(tabs(UKULELE, 'A5', home)).toEqual(['2 4 0 0']);
                expect(tabs(UKULELE, 'E5', home)).toEqual(['4 4 0 2']);
            }
            expect(tabs(UKULELE, 'C Csus2 C', [1, 6])).toEqual(['0 0 0 3', '0 2 3 3', '0 0 0 3']);
        });
        it('every chord that has a book grip plays one, in twelve keys', () => {
            // Plain chords beside the neighbours that used to move them: a dim, aug or sus
            // chord, a closed 7th, the minor tonic's barre. A book grip, read off the frets
            // alone: a string open, nothing past the 4th fret.
            const isBook = (v: Voicing) =>
                v.notes.length === UKULELE.strings &&
                v.notes.some((n) => n.fret === 0) &&
                v.notes.every((n) => n.fret <= 4);
            const PROGRESSIONS: [number, Quality][][] = [
                [
                    [0, 'min'],
                    [5, 'maj'],
                    [0, 'min'],
                ],
                [
                    [5, 'maj'],
                    [5, 'dim'],
                    [0, 'maj'],
                ],
                [
                    [0, 'maj'],
                    [0, 'dim'],
                    [2, 'm7'],
                    [7, 'dom7'],
                ],
                [
                    [0, 'dom7'],
                    [5, 'dom7'],
                    [7, 'dom7'],
                ],
                [
                    [0, 'maj'],
                    [0, 'aug'],
                    [0, 'six'],
                    [0, 'dom7'],
                    [5, 'maj'],
                ],
                [
                    [0, 'maj'],
                    [5, 'sus2'],
                    [5, 'maj'],
                    [7, 'maj'],
                ],
                [
                    [0, 'maj'],
                    [8, 'min'],
                    [5, 'maj'],
                    [7, 'maj'],
                ],
            ];
            const closed: string[] = [];
            let seen = 0;
            for (const home of NUT) {
                for (let tonic = 0; tonic < 12; tonic++) {
                    for (const bars of PROGRESSIONS) {
                        const voiced = voiceChart(
                            bars.map(([interval, quality]) => ({
                                root: ROOTS[(tonic + interval) % 12],
                                quality,
                            })),
                            { instrument: UKULELE, home },
                        );
                        for (const v of voiced) {
                            if (allPositions(UKULELE, v.root, v.quality).some(isBook)) {
                                seen++;
                                if (!isBook(v)) {
                                    closed.push(`${v.symbol} ${tab(UKULELE, v)}`);
                                }
                            }
                        }
                    }
                }
            }
            expect(closed).toEqual([]);
            // Not vacuous: about half the chords of these charts have such a grip.
            expect(seen).toBeGreaterThan(300);
        });
        it('a chord with no open grip stays in first position: D♭ 1 1 1 4 beside D♭sus2 (#1688)', () => {
            // D♭ 1 1 1 4 is in every book and has no open string. Until #1688 the costs placed
            // it, and beside D♭sus2 6 3 4 4 it was 6 5 4 4, one finger away. Now both stay in
            // first position (`firstPosition`): D♭sus2 is the book's 1 3 4 4, the open Csus2
            // 0 2 3 3 a fret up (the Cm form, which as a sus2 may move inside the 4th fret).
            for (const home of NUT) {
                for (const inst of [UKULELE, UKULELE_LOW_G]) {
                    expect(tabs(inst, 'D♭ D♭sus2 D♭', home)).toEqual([
                        '1 1 1 4',
                        '1 3 4 4',
                        '1 1 1 4',
                    ]);
                    // A♭ was 5 3 4 3 beside D♭sus2 6 3 4 4; now its first-position default.
                    expect(tabs(inst, 'A♭ D♭sus2 A♭', home)).toEqual([
                        '1 3 4 3',
                        '1 3 4 4',
                        '1 3 4 3',
                    ]);
                }
            }
            // The Cm form moves no further: up the neck Esus2 keeps its own grip, not 4 6 7 7.
            expect(allPositions(UKULELE, R('E'), 'sus2').map((v) => tab(UKULELE, v))).not.toContain(
                '4 6 7 7',
            );
        });
        it('only in first position: in frets 2–7 A beside Asus2 stays the closed pair', () => {
            // An open string there is the hand gone back to the nut (`atTheNut`).
            expect(tabs(UKULELE, 'A Asus2 A', [2, 7])).toEqual(['2 4 5 4', '2 4 5 2', '2 4 5 4']);
            expect(tabs(UKULELE, 'Cm F Cm', [2, 7])).toEqual(['5 3 3 3', '5 5 5 3', '5 3 3 3']);
        });
    });
    describe('a chord with no open grip stays in first position (#1688)', () => {
        it('Fdim 4 5 4 2 does not pull its neighbours up the neck', () => {
            // Fdim has no grip inside the 4th fret, and beside it these went up to share its
            // frets: the dim7 4 5 4 5, Bm7♭5 4 5 5 5, D♭maj7 5 5 4 4, Dm7♭5 5 5 4 5.
            for (const home of NUT) {
                for (const inst of [UKULELE, UKULELE_LOW_G]) {
                    expect(tabs(inst, 'Fdim B°7', home)).toEqual(['4 5 4 2', '1 2 1 2']);
                    expect(tabs(inst, 'F°7 Fdim A♭°7', home)).toEqual([
                        '1 2 1 2',
                        '4 5 4 2',
                        '1 2 1 2',
                    ]);
                    expect(tabs(inst, 'Bm7♭5 Fdim', home)).toEqual(['2 2 1 2', '4 5 4 2']);
                    expect(tabs(inst, 'D♭maj7 Fdim', home)).toEqual(['1 1 1 3', '4 5 4 2']);
                    expect(tabs(inst, 'Dm7♭5 Fdim', home)).toEqual(['1 2 1 3', '4 5 4 2']);
                }
            }
        });
        it('nor does a power chord, which plays its two-string grip at the nut (#1809)', () => {
            // F♯ was 6 6 6 4 beside F♯5 6 6 9 9, B♭ 3 5 6 5 beside B♭5 3 5 6 x. After #1688
            // they stayed and the hand jumped to the power chord and back; with the books'
            // two-string grips at the nut (`UKE_TWO_STRING_POWER`) nothing jumps.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'F♯ F♯5 F♯', home)).toEqual(['3 1 2 1', 'x 1 2 x', '3 1 2 1']);
                expect(tabs(UKULELE, 'B♭ B♭5 B♭', home)).toEqual(['3 2 1 1', 'x x 1 1', '3 2 1 1']);
                expect(tabs(UKULELE, 'B B5 B', home)).toEqual(['4 3 2 2', 'x x 2 2', '4 3 2 2']);
            }
        });
        it('every chord with a grip inside the 4th fret plays one, in twelve keys', () => {
            // The neighbours that used to move them: Fdim, a power chord, a closed 7th.
            const inFirst = (v: Voicing) =>
                v.notes.length === UKULELE.strings && v.notes.every((n) => n.fret <= 4);
            const PROGRESSIONS: [number, Quality][][] = [
                [
                    [0, 'maj'],
                    [0, 'five'],
                    [0, 'maj'],
                ],
                [
                    [0, 'dim7'],
                    [4, 'dim'],
                    [0, 'm7b5'],
                ],
                [
                    [0, 'maj7'],
                    [7, 'dom7'],
                    [9, 'm7'],
                    [5, 'maj7'],
                ],
                [
                    [0, 'sus2'],
                    [0, 'maj'],
                    [0, 'sus4'],
                    [0, 'aug'],
                ],
            ];
            const left: string[] = [];
            let seen = 0;
            for (const home of NUT) {
                for (let tonic = 0; tonic < 12; tonic++) {
                    for (const bars of PROGRESSIONS) {
                        const voiced = voiceChart(
                            bars.map(([interval, quality]) => ({
                                root: ROOTS[(tonic + interval) % 12],
                                quality,
                            })),
                            { instrument: UKULELE, home },
                        );
                        for (const v of voiced) {
                            if (allPositions(UKULELE, v.root, v.quality).some(inFirst)) {
                                seen++;
                                if (!inFirst(v)) {
                                    left.push(`${v.symbol} ${tab(UKULELE, v)}`);
                                }
                            }
                        }
                    }
                }
            }
            expect(left).toEqual([]);
            // Not vacuous: most chords of these charts have such a grip.
            expect(seen).toBeGreaterThan(200);
        });
        it('only in first position: up the neck the window decides', () => {
            // In frets 2–7 B 4 3 2 2 is inside the window and under the 4th fret, but the hand
            // sits at the window and B stays with the E beside it, as before.
            expect(tabs(UKULELE, 'B E B F♯', [2, 7]).slice(0, 2)).toEqual(['4 6 7 6', '4 4 4 7']);
        });
    });
    describe('power chords at the nut, and a sus4 beside its own chord (#1809)', () => {
        it('the books’ two-string power grips: F5, F♯5, B♭5 and B5 alone', () => {
            // ukutabs.com prints each as the simplest grip. Before, in frets 1–6 F5 and F♯5 were
            // 10 12 13 x and 11 13 14 x, B♭5 3 5 6 x; with no window F♯5 was 6 6 9 9.
            for (const home of NUT) {
                for (const inst of [UKULELE, UKULELE_LOW_G]) {
                    expect(tabs(inst, 'F5', home)).toEqual(['x 0 1 x']);
                    expect(tabs(inst, 'F♯5', home)).toEqual(['x 1 2 x']);
                    expect(tabs(inst, 'B♭5', home)).toEqual(['x x 1 1']);
                    expect(tabs(inst, 'B5', home)).toEqual(['x x 2 2']);
                }
            }
        });
        it('a power-chord riff stays at the nut, D♭5 on its four-string 1 1 4 4', () => {
            // It went 1 1 4 4 / 4 6 7 x / 6 6 9 9 / 1 1 4 4. Power chords stay under
            // `firstPosition`: exempted, D♭5 became x x 4 4 and B♭5 beside it 3 5 6 x.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'D♭5 B5 F♯5 D♭5', home)).toEqual([
                    '1 1 4 4',
                    'x x 2 2',
                    'x 1 2 x',
                    '1 1 4 4',
                ]);
            }
        });
        it('a four-string grip in first position still wins: C5, G5, A5, E5, D♭5, D5', () => {
            for (const home of NUT) {
                expect(tabs(UKULELE, 'C5', home)).toEqual(['0 0 3 3']);
                expect(tabs(UKULELE, 'G5', home)).toEqual(['0 2 3 x']);
                expect(tabs(UKULELE, 'A5', home)).toEqual(['2 4 0 0']);
                expect(tabs(UKULELE, 'E5', home)).toEqual(['4 4 0 2']);
                expect(tabs(UKULELE, 'D♭5', home)).toEqual(['1 1 4 4']);
                expect(tabs(UKULELE, 'D5', home)).toEqual(['2 2 5 5']);
            }
        });
        it('a two-string grip is built only inside the 4th fret (`nutOnly`)', () => {
            // Built anywhere, E♭5 x x 6 6 took this chart up the neck with no window:
            // x 5 6 x / 5 5 8 8 / x x 6 6 / 5 5 8 8.
            expect(tabs(UKULELE, 'B♭5 F5 E♭5 F5', null)).toEqual([
                'x x 1 1',
                'x 0 1 x',
                '3 3 6 6',
                'x 0 1 x',
            ]);
        });
        it('nor beside a chord whose power grip is near the nut: G5 0 2 3 x, A♭5 1 3 4 x', () => {
            // A muted string costs the plan nothing, so offered to every root the two-string
            // grips took G5 to x 2 3 x beside Bsus4 and A♭5 to x 3 4 x beside E♭5. They are for
            // a power chord with no other grip inside the 4th fret.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'G5 Bsus4', home)).toEqual(['0 2 3 x', '4 4 2 2']);
                expect(tabs(UKULELE, 'E♭5 A♭5', home)).toEqual(['3 3 6 6', '1 3 4 x']);
            }
        });
        it('up the neck the two-string grips are not offered (`nutOnly`)', () => {
            // In frets 2–7 x x 3 3 took C C5 C to 5 4 3 3 / x x 3 3.
            expect(tabs(UKULELE, 'C C5 C', [2, 7])).toEqual(['0 0 0 3', '0 0 3 3', '0 0 0 3']);
            expect(tabs(UKULELE, 'A5 D5 E5', [5, 10])).toEqual([
                '9 9 12 12',
                '7 9 10 x',
                '4 4 7 7',
            ]);
        });
        it('Dsus4 beside D is 2 2 3 0 in either order; alone it is 0 2 3 0', () => {
            // `Dsus4 D Dsus4` was 0 2 3 0 throughout, `D Dsus4` ended on it: lifting D's A off
            // the G string was a free move, so a chart's order chose the grip.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'D Dsus4 D', home)).toEqual(['2 2 2 0', '2 2 3 0', '2 2 2 0']);
                expect(tabs(UKULELE, 'Dsus4 D Dsus4', home)).toEqual([
                    '2 2 3 0',
                    '2 2 2 0',
                    '2 2 3 0',
                ]);
                expect(tabs(UKULELE, 'D Dsus4', home)).toEqual(['2 2 2 0', '2 2 3 0']);
                expect(tabs(UKULELE, 'Dsus4', home)).toEqual(['0 2 3 0']);
            }
        });
        it('E♭sus4 beside E♭ 0 3 3 1 is 1 3 4 1 in either order: each 3rd up a fret', () => {
            // `E♭sus4 E♭` was 3 3 4 1, the G string's 3rd going to the 5th, not the 4th.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'E♭sus4 E♭', home)).toEqual(['1 3 4 1', '0 3 3 1']);
                expect(tabs(UKULELE, 'E♭ E♭sus4', home)).toEqual(['0 3 3 1', '1 3 4 1']);
                expect(tabs(UKULELE, 'E♭sus4', home)).toEqual(['3 3 4 1']);
            }
        });
        it('between roots a finger lifted to an open string is still free: C to Am', () => {
            // Held on every root, the rule took Gsus2 beside A off the book's 0 2 3 0 to 2 2 3 0.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'C Am', home)).toEqual(['0 0 0 3', '2 0 0 0']);
                expect(tabs(UKULELE, 'A Gsus2', home)).toEqual(['2 1 0 0', '0 2 3 0']);
            }
        });
    });
    describe('a change of strum, all four strings or one left out, is a move (#1812)', () => {
        // `triadTransCost`'s string-set term, kept for the ukulele: there it fires only between
        // a grip that sounds the A string and a power grip that leaves it out. Each case below
        // moves when it is dropped for the ukulele.
        it('beside the open chords in frets 2–7 A5 is 2 4 0 0, not 2 4 5 x', () => {
            // Dropped, these were 2 4 5 3 / 2 4 5 x / 2 4 5 3 and 2 4 5 2 / 2 4 5 x / 2 4 5 2.
            expect(tabs(UKULELE, 'Am A5 Am', [2, 7])).toEqual(['2 0 0 0', '2 4 0 0', '2 0 0 0']);
            expect(tabs(UKULELE, 'Asus2 A5 Asus2', [2, 7])).toEqual([
                '2 4 0 2',
                '2 4 0 0',
                '2 4 0 2',
            ]);
        });
        it('a power riff keeps its one shape as it slides past the window', () => {
            // Dropped, A5 went back down to 2 4 5 x and B5 to 4 6 7 x.
            expect(tabs(UKULELE, 'E5 G5 A5 E5', [5, 10])).toEqual([
                '4 4 7 7',
                '7 7 10 10',
                '9 9 12 12',
                '4 4 7 7',
            ]);
            expect(tabs(UKULELE, 'F♯5 A5 B5 F♯5', [7, 12])).toEqual([
                '6 6 9 9',
                '9 9 12 12',
                '11 11 14 14',
                '6 6 9 9',
            ]);
        });
        it('at the nut B♭5 stays on the riff it is in', () => {
            // Dropped, B♭5 left x x 1 1 for 3 5 6 x, and with no window F5 went to x 0 1 x.
            for (const home of NUT) {
                expect(tabs(UKULELE, 'B♭5 D♭5 E♭5 B♭5', home)).toEqual([
                    'x x 1 1',
                    '1 1 4 4',
                    '3 3 6 6',
                    'x x 1 1',
                ]);
            }
            expect(tabs(UKULELE, 'B♭5 E♭5 F5', null)).toEqual(['3 5 6 x', '3 3 6 6', '5 5 8 8']);
        });
    });
    describe('a lone power chord keeps the hand in the window (#1814, `powerAFretPast`)', () => {
        it('takes the three-string grip a fret past, not the four-string one two frets out', () => {
            // They were 10 9 8 8 / 5 5 8 8 / 10 9 8 8, 8 7 6 6 / 3 3 6 6 / 8 7 6 6 and
            // 6 5 4 4 / 1 1 4 4 / 6 5 4 4: the hand left the window for one chord.
            expect(tabs(UKULELE, 'F F5 F', [7, 12])).toEqual([
                '10 9 8 8',
                '10 12 13 x',
                '10 9 8 8',
            ]);
            expect(tabs(UKULELE, 'Fm F5 Fm', [7, 12])[1]).toBe('10 12 13 x');
            expect(tabs(UKULELE, 'E♭ E♭5 E♭', [5, 10])).toEqual([
                '8 7 6 6',
                '8 10 11 x',
                '8 7 6 6',
            ]);
            expect(tabs(UKULELE, 'D♭ D♭5 D♭', [3, 8])).toEqual(['6 5 4 4', '6 8 9 x', '6 5 4 4']);
            expect(tabs(UKULELE_LOW_G, 'F F5 F', [7, 12])[1]).toBe('10 12 13 x');
        });
        it('four strings first: A5 in frets 3–8 is still 2 4 0 0, not 2 4 5 x', () => {
            // Both sit a fret below the window. Offered together, the costs took 2 4 5 x for
            // A5 alone, which a strummed chart would have to skip the A string for.
            expect(tabs(UKULELE, 'A5', [3, 8])).toEqual(['2 4 0 0']);
            expect(tabs(UKULELE, 'A A5 A', [3, 8])).toEqual(['6 4 5 4', '2 4 0 0', '6 4 5 4']);
        });
        it('fretted only: G5 beside G in frets 3–8 is not the open 0 2 3 x', () => {
            // Offered, it took G to 4 7 7 5 and the hand back to the nut for G5.
            expect(tabs(UKULELE, 'G G5 G', [3, 8])).toEqual(['7 7 7 5', '7 7 10 10', '7 7 7 5']);
        });
        it('not in a riff: beside another power chord the costs keep the riff together', () => {
            // Offered, these were 8 8 11 11 / 6 8 9 x / 3 3 6 6 and 12 12 15 15 / 10 12 13 x /
            // 7 7 10 10.
            expect(tabs(UKULELE, 'A♭5 D♭5 E♭5', [3, 8])).toEqual(['1 3 4 x', '1 1 4 4', '3 3 6 6']);
            expect(tabs(UKULELE, 'C5 F5 G5', [7, 12])).toEqual(['5 7 8 x', '5 5 8 8', '7 7 10 10']);
            expect(tabs(UKULELE, 'B♭5 E♭5 F5', [5, 10])).toEqual(['3 5 6 x', '3 3 6 6', '5 5 8 8']);
        });
        it('a symbol in a riff anywhere is in a riff throughout, so it keeps one grip', () => {
            // Decided per occurrence, the lone F5 was offered 10 12 13 x alone and the riff's
            // F5 every grip; `unifyGrips` then held F5 to the riff's 5 5 8 8, left the lone
            // occurrence nothing, and the voicer threw.
            expect(tabs(UKULELE, 'F5 G5 F F5 F', [7, 12])).toEqual([
                '5 5 8 8',
                '7 7 10 10',
                '10 9 8 8',
                '5 5 8 8',
                '10 9 8 8',
            ]);
            expect(tabs(UKULELE, 'F F5 F F5 G5', [7, 12])).toEqual([
                '10 9 8 8',
                '5 5 8 8',
                '10 9 8 8',
                '5 5 8 8',
                '7 7 10 10',
            ]);
            expect(tabs(UKULELE, 'E♭ E♭5 E♭ B♭5 E♭5', [5, 10])).toEqual([
                '8 7 6 6',
                '3 3 6 6',
                '8 7 6 6',
                '3 5 6 x',
                '3 3 6 6',
            ]);
            expect(tabs(UKULELE, 'D♭ D♭5 D♭ A♭5 D♭5', [3, 8])).toEqual([
                '6 5 4 4',
                '1 1 4 4',
                '6 5 4 4',
                '1 3 4 x',
                '1 1 4 4',
            ]);
        });
        it('nothing changes at the nut or on guitar', () => {
            for (const home of NUT) {
                expect(tabs(UKULELE, 'F F5 F', home)).toEqual(['2 0 1 0', 'x 0 1 x', '2 0 1 0']);
            }
            // A guitar grip is never widened this way: F5 stays the 5th-string power chord.
            expect(tabs(GUITAR, 'F F5 F', [7, 12])).toEqual([
                'x 12 10 10 x x',
                'x 8 10 10 x x',
                'x 12 10 10 x x',
            ]);
        });
    });
    describe('a five-fret reach is the last resort (#1675)', () => {
        const span = (frets: string) => {
            const fretted = frets
                .split(' ')
                .map(Number)
                .filter((f) => f > 0);
            return fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
        };
        it('the Em shape as a minor needs its open G string: Gm 7 7 6 5, B♭m 10 10 9 8', () => {
            // They were 3 7 6 5 and 6 10 9 8, the same grips with the G string four frets
            // below the rest. Alone the chords already took the D shape; a neighbour brought
            // the reach in.
            expect(tabs(UKULELE, 'Gm C D', [2, 7])).toEqual(['7 7 6 5', '5 4 3 3', '2 2 2 5']);
            expect(tabs(UKULELE, 'Gm B♭ F Gm', [2, 7])[0]).toBe('7 7 6 5');
            expect(tabs(UKULELE, 'B♭m G♭ D♭ A♭', [5, 10])[0]).toBe('10 10 9 8');
            expect(tabs(UKULELE_LOW_G, 'B♭m G♭ D♭ A♭', [5, 10])[0]).toBe('10 10 9 8');
            // Em itself is that shape on its open string, three frets wide under the fingers.
            expect(tabs(UKULELE, 'G Em C D', [1, 6])[1]).toBe('0 4 3 2');
            // The major form is no reach and stays: F♯ 3 6 6 4.
            expect(tabs(UKULELE, 'F♯ B C♯', [2, 7])[0]).toBe('3 6 6 4');
        });
        it('Fdim is 4 5 4 2, not 1 5 4 2', () => {
            for (const home of NUT) {
                expect(tabs(UKULELE, 'F Fdim Gm7 C7', home)[1]).toBe('4 5 4 2');
                expect(tabs(UKULELE, 'E Fdim F♯m B', home)[1]).toBe('4 5 4 2');
            }
        });
        it('in first position a reach beats leaving: Ddim stays 1 2 1 5, and so do its neighbours', () => {
            // 1 2 1 5 is the only D diminished triad inside frets 1–6; the narrow one is
            // 7 5 4 5. Taking that dragged the chart up after it: B♭ 3 5 6 5, F7 5 5 5 6,
            // B♭7 3 5 4 5, D♭ 6 5 4 4. (The dim triad stays a triad: 1 2 1 2, the dim7 teachers
            // play there, adds a note the symbol does not name.)
            for (const home of NUT) {
                for (const inst of [UKULELE, UKULELE_LOW_G]) {
                    expect(tabs(inst, 'B♭ Ddim E♭ F', home)).toEqual([
                        '3 2 1 1',
                        '1 2 1 5',
                        '0 3 3 1',
                        '2 0 1 0',
                    ]);
                    expect(tabs(inst, 'F7 Ddim', home)).toEqual(['2 3 1 3', '1 2 1 5']);
                    expect(tabs(inst, 'B♭ B♭7 Ddim E♭', home)).toEqual([
                        '3 2 1 1',
                        '1 2 1 1',
                        '1 2 1 5',
                        '0 3 3 1',
                    ]);
                    expect(tabs(inst, 'D♭ Ddim E♭m A♭', home)).toEqual([
                        '1 1 1 4',
                        '1 2 1 5',
                        '3 3 2 1',
                        '1 3 4 3',
                    ]);
                    // No hop out of first position and back for one chord.
                    expect(tabs(inst, 'Cm Ddim G7 Cm', home)).toEqual([
                        '0 3 3 3',
                        '1 2 1 5',
                        G7,
                        '0 3 3 3',
                    ]);
                }
                expect(tabs(UKULELE, 'Ddim', home)).toEqual(['1 2 1 5']);
            }
        });
        it('a reach gives way in first position only to a grip that stays there: Fdim 4 5 4 2', () => {
            // Up to the 6th fret, the nut window's own top: 4 5 4 2 has a 5th-fret note and
            // still counts. Ddim's 7 5 4 5 does not.
            const narrow = (root: string) =>
                allPositions(UKULELE, R(root), 'dim')
                    .filter((v) => span(tab(UKULELE, v)) <= 3 && inHome(v, [1, 6]))
                    .map((v) => tab(UKULELE, v));
            expect(narrow('F')).toEqual(['4 5 4 2']);
            expect(narrow('D')).toEqual([]);
            // Every other triad has such a grip: Ddim is the one chord the reach is kept for.
            const kept: string[] = [];
            for (const root of ROOTS) {
                for (const q of ['maj', 'min', 'dim', 'aug', 'sus4', 'sus2'] as Quality[]) {
                    const grips = allPositions(UKULELE, root, q);
                    if (!grips.some((v) => span(tab(UKULELE, v)) <= 3 && inHome(v, [1, 6]))) {
                        kept.push(`${root.name}${QUALITIES[q].symbol}`);
                    }
                }
            }
            expect(kept).toEqual(['Ddim']);
        });
        it('up the neck the window widens a fret before a reach is taken', () => {
            // E♭m in frets 2–7 held only 3 3 2 6.
            expect(tabs(UKULELE, 'E♭m', [2, 7])).toEqual(['8 6 6 6']);
            expect(tabs(UKULELE, 'B♭m E♭m F B♭m', [2, 7])[1]).toBe('3 3 2 1');
            // Ddim in frets 2–7 has 7 5 4 5 inside and needs no widening.
            expect(tabs(UKULELE, 'Ddim', [2, 7])).toEqual(['7 5 4 5']);
        });
        it('a grip inside the window comes first: nothing leaves it that need not', () => {
            // Dm 2 2 1 5 had company in frets 1–6, and it is no longer pulled onto the reach
            // by the Ddim beside it.
            expect(tabs(UKULELE, 'Dm Ddim', [1, 6])).toEqual(['2 2 1 0', '1 2 1 5']);
            // C♯m 1 1 0 4 is the C shape on an open string: three frets under the fingers.
            expect(tabs(UKULELE, 'F♯m B E C♯m', [1, 6])[3]).toBe('1 1 0 4');
        });
        it('no triad alone is five frets wide but Ddim at the nut, up to frets 9–14', () => {
            // Unlocked and in each six-fret window. Before, 28 were (the sweep over frets
            // 1–15); what is left is Ddim in first position, kept on purpose, and Bdim in
            // frets 10–15, where the neck ends.
            const windows: ([number, number] | null)[] = [null];
            for (let w = 1; w <= 9; w++) {
                windows.push([w, w + 5]);
            }
            const wide: string[] = [];
            for (const home of windows) {
                for (const root of ROOTS) {
                    for (const q of ['maj', 'min', 'dim', 'aug', 'sus4', 'sus2'] as Quality[]) {
                        const [v] = voiceChart([{ root, quality: q }], {
                            instrument: UKULELE,
                            home,
                        });
                        if (span(tab(UKULELE, v)) > 3) {
                            wide.push(`${v.symbol} ${tab(UKULELE, v)} in ${home}`);
                        }
                        // Never more than a fret out of the window, and never out of a
                        // window from the nut at all.
                        if (home) {
                            const reach = home[0] === 1 ? 0 : 1;
                            for (const n of v.notes) {
                                expect(
                                    n.fret === 0 ||
                                        (n.fret >= home[0] - reach && n.fret <= home[1] + reach),
                                    `${v.symbol} ${tab(UKULELE, v)} in ${home}`,
                                ).toBe(true);
                            }
                        }
                    }
                }
            }
            expect(wide).toEqual(['Ddim 1 2 1 5 in null', 'Ddim 1 2 1 5 in 1,6']);
            expect(tabs(UKULELE, 'Bdim', [10, 15])).toEqual(['10 11 10 14']);
        });
    });
    it('the guitar is not touched: its triads and shells keep their own reckoning', () => {
        // On the three-string grips, which the ukulele's rules must leave alone (at the nut the
        // real guitar plays C, G and Am whole, #1849).
        const guitar = (names: string, home: [number, number] | null) =>
            tabs(GUITAR_TRIADS, names, home);
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
        // In frets 2–7: at the nut the three 7ths are the book's open chords (#1838).
        expect(guitar('C Am7 Dm7 G7', [2, 7])).toEqual([
            'x 7 5 5 x x',
            '5 x 5 5 x x',
            'x 5 x 5 6 x',
            'x x 5 4 6 x',
        ]);
        expect(guitar('C Am7 Dm7 G7', null)).toEqual([
            'x 3 2 0 x x',
            'x 0 2 0 1 0',
            'x x 0 2 1 1',
            '3 2 0 0 0 1',
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
        it('B♭7 E♭7 B♭7 F7 plays one B♭7, 1 2 1 1', () => {
            expect(tabs(UKULELE, 'B♭7 E♭7 B♭7 F7', [1, 6])).toEqual([
                '1 2 1 1',
                '3 3 3 4',
                '1 2 1 1',
                '2 3 1 3',
            ]);
            // The plan alone started on 3 5 4 5, level with the E♭7, and came down for the F7.
            // Since #1688 B♭7 has only its first-position grip on offer at the nut
            // (`firstPosition`), so the plan alone plays it too; up the neck the rule still
            // holds a shell (the blues in G below).
            expect(tabs(UKULELE, 'B♭7 E♭7 B♭7 F7', [1, 6], 0)).toEqual(
                tabs(UKULELE, 'B♭7 E♭7 B♭7 F7', [1, 6]),
            );
            // Gm7 Cm7 D7 Gm7 was this test's chart, opening on 3 5 3 5 with the rule off. Gm7
            // has an open grip, so it is 0 2 1 1 both times before the rule is asked (#1675).
            expect(tabs(UKULELE, 'Gm7 Cm7 D7 Gm7', [1, 6], 0)).toEqual([
                '0 2 1 1',
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

describe('the window widens a fret; an open string is not a shape (#1610)', () => {
    const CLASSIC = [6, 5];
    const chart = (...chords: [string, Quality][]) =>
        chords.map(([root, quality]) => ({ root: R(root), quality }));
    const voiced = (
        home: [number, number] | null,
        rootStrings: number[] | undefined,
        ...c: [string, Quality][]
    ) => voiceChart(chart(...c), { instrument: GUITAR, home, rootStrings });
    const tabsOf = (vs: Voicing[]) => vs.map((v) => tab(GUITAR, v));
    const grip = (id: string, root: string, quality: Quality, r: number) =>
        buildAt(GUITAR, shape(GUITAR, id), R(root), quality, r)!;
    const SHELLS = (Object.keys(QUALITIES) as Quality[]).filter(
        (q) => QUALITIES[q].kind === 'shell',
    );
    const rootFinger = (v: Voicing) => v.notes.find((n) => n.role === 'R')?.finger ?? 0;

    describe('one fret past the window, root in it', () => {
        it('the root-first grip a fret out beats the buried root inside', () => {
            // Roots on the 6th and 5th strings. Each window holds only the R–3–7 grip, the
            // root under the ring or little finger; the R–7–3 grip tops out one fret higher.
            const cases: [[number, number], string, Quality, string][] = [
                [[1, 6], 'E♭', 'm7b5', 'x 6 7 6 7 x'], // not x 6 4 6 x 5
                [[1, 6], 'E♭', 'dim7', 'x 6 7 5 7 x'], // not x 6 4 5 x 5
                [[2, 7], 'E', 'm7b5', 'x 7 8 7 8 x'], // not x 7 5 7 x 6
                [[2, 7], 'E', 'dim7', 'x 7 8 6 8 x'], // not x 7 5 6 x 6
            ];
            for (const [home, root, quality, want] of cases) {
                const [v] = voiced(home, CLASSIC, [root, quality]);
                expect(tab(GUITAR, v), `${v.symbol} in frets ${home.join('–')}`).toBe(want);
                expect(rootFinger(v)).toBeLessThanOrEqual(2);
            }
        });
        it('a window with no grip at all takes the one a fret out, not one across the neck', () => {
            // F♯m7♭5 in frets 2–7: nothing fits inside. Between two E♭m7 at the 6th fret the
            // costs alone go up to x 9 10 9 10 x, three frets past the window; 2 x 2 2 1 x has
            // its root in the window and one note a fret below it.
            const v = voiced([2, 7], CLASSIC, ['E♭', 'm7'], ['F♯', 'm7b5'], ['E♭', 'm7']);
            expect(tabsOf(v)[1]).toBe('2 x 2 2 1 x');
        });
        it('what counts as in reach: one fret, either end, the root in the window', () => {
            // One fret past the top, and one below the bottom.
            expect(inReach(grip('5B', 'E♭', 'maj7', 6), [1, 6])).toBe(true); // x 6 5 7 x x
            expect(inReach(grip('6A', 'F♯', 'm7b5', 2), [2, 7])).toBe(true); // 2 x 2 2 1 x
            // Two frets is another position.
            expect(inReach(grip('5A', 'E♭', 'maj7', 6), [1, 6])).toBe(false); // x 6 x 7 8 x
            // So is a fretted root outside, though every note is a fret away.
            expect(inReach(grip('6A', 'B♭', 'maj7', 6), [7, 12])).toBe(false); // 6 x 7 7 x x
            // An open root is in every window, as an open string is for `inHome`; its fretted
            // notes are still held to one fret (E7 0 x 0 1 x x is five below frets 6–11).
            expect(inReach(grip('6A', 'E', 'maj7', 0), [2, 7])).toBe(true); // 0 x 1 1 x x
            expect(inReach(grip('6A', 'E', 'dom7', 0), [6, 11])).toBe(false);
            // No window, nothing to widen; a triad has no root that places it.
            expect(inReach(grip('5B', 'E♭', 'maj7', 6), null)).toBe(false);
            const triad = allPositions(GUITAR, R('C'), 'maj').find(
                (v) => Math.max(...v.notes.map((n) => n.fret)) === 7,
            )!;
            expect(inReach(triad, [1, 6])).toBe(false);
        });
        it('an open root a fret below the window is offered beside the fretted one', () => {
            // Emaj7 in frets 2–7, roots on the 6th and 5th strings: nothing inside. Both
            // x 7 6 8 x x and the open 0 x 1 1 x x are a fret out with the root in the window,
            // and the costs choose: after a ii–V at the 2nd fret the open one, a step away,
            // not a five-fret jump for one chord; from the 7th fret the fretted one.
            const low = voiced([2, 7], CLASSIC, ['F♯', 'm7'], ['B', 'dom7'], ['E', 'maj7']);
            expect(tabsOf(low)).toEqual(['2 x 2 2 x x', 'x 2 x 2 4 x', '0 x 1 1 x x']);
            const high = voiced([2, 7], CLASSIC, ['B', 'm7'], ['E', 'maj7'], ['B', 'm7']);
            expect(tabsOf(high)[1]).toBe('x 7 6 8 x x');
        });
        it('two frets out is left to the costs: Em7♭5 in frets 1–6 is still x 7 8 7 8 x', () => {
            // Its root is a fret past the window and its top two (#1607's accepted case), so it
            // is not a reach; with nothing inside or in reach every grip is offered, as before.
            const [v] = voiced([1, 6], CLASSIC, ['E', 'm7b5']);
            expect(tab(GUITAR, v)).toBe('x 7 8 7 8 x');
        });
        it('a window that holds a grip a player would take is never left', () => {
            // Every shell, root, six-fret window and root-string limit, alone and between two
            // chords that pull it up or down the neck: a grip outside the window means every
            // grip inside it had the root under the ring or little finger, and then the grip
            // taken has its root in the window, under the index or middle finger, and is a fret
            // out at most.
            let reached = 0;
            for (const rootStrings of [undefined, CLASSIC]) {
                for (let w = 1; w <= 10; w++) {
                    const home: [number, number] = [w, w + 5];
                    for (const root of ROOTS) {
                        for (const q of SHELLS) {
                            const inside = allPositions(GUITAR, root, q, { rootStrings }).filter(
                                (v) => inHome(v, home),
                            );
                            if (!inside.length) {
                                continue;
                            }
                            for (const pull of [null, ROOTS[0], ROOTS[6]]) {
                                const side = pull ? chart([pull.name, 'dom7']) : [];
                                const v = voiceChart([...side, { root, quality: q }, ...side], {
                                    instrument: GUITAR,
                                    home,
                                    rootStrings,
                                })[side.length];
                                if (inHome(v, home)) {
                                    continue;
                                }
                                reached++;
                                const where = `${v.symbol} ${tab(GUITAR, v)} in frets ${w}-${w + 5}`;
                                expect(
                                    inside.every((g) => rootFinger(g) > 2),
                                    where,
                                ).toBe(true);
                                expect(inReach(v, home), where).toBe(true);
                                expect(rootFinger(v), where).toBeLessThanOrEqual(2);
                            }
                        }
                    }
                }
            }
            // 27 chords have only a buried root in their window and the other grip a fret out
            // (m7♭5, °7 and, since #1817, m6 on nine roots, all `classic`), each voiced three
            // ways here. The m6's is the 5th-string R–♭3–6, E♭m6 x 6 4 5 x x in frets 1–6,
            // which leaves for the R–6–♭3 x 6 x 5 7 x a fret out, the root under the middle.
            expect(reached).toBe(81);
        });
        it('with every root string allowed the window never widens: each holds a grip to take', () => {
            for (let w = 1; w <= 10; w++) {
                for (const root of ROOTS) {
                    for (const q of SHELLS) {
                        const [v] = voiceChart([{ root, quality: q }], {
                            instrument: GUITAR,
                            home: [w, w + 5],
                        });
                        expect(inHome(v, [w, w + 5]), `${v.symbol} ${tab(GUITAR, v)}`).toBe(true);
                    }
                }
            }
        });
        it('no chord goes unvoiced: one shape, its only grip far from the window', () => {
            const only: InstrumentDef = { ...GUITAR, shapes: [shape(GUITAR, '5A')] };
            const [v] = voiceChart(chart(['E', 'maj7']), { instrument: only, home: [1, 4] });
            expect(tab(only, v)).toBe('x 7 x 8 9 x');
        });
    });

    describe('a three-note shell with an open string, where its root has a fretted shell', () => {
        /** A fretted shell on the same root: same string, same fret, no open string. */
        const frettedOnItsRoot = (v: Voicing, rootStrings?: number[]) =>
            allPositions(GUITAR, v.root, v.quality, { rootStrings }).some(
                (w) =>
                    w.shape.rootString === v.shape.rootString &&
                    w.rootFret === v.rootFret &&
                    w.notes.every((n) => n.fret > 0),
            );

        it('B♭7 is x 1 x 1 3 x, not x 1 0 1 x x; Bm7 is x 2 x 2 3 x, not x 2 0 2 x x', () => {
            // The R–3–7 shape at the 1st or 2nd fret drops its 3rd onto an open string; the
            // R–7–3 shape is fretted on the same root, and is the one the books print.
            const b7 = voiced([1, 6], CLASSIC, ['F', 'm7'], ['B♭', 'dom7'], ['F', 'm7']);
            expect(tabsOf(b7)).toEqual(['1 x 1 1 x x', 'x 1 x 1 3 x', '1 x 1 1 x x']);
            // E7 is the book's open chord since #1838.
            const bm7 = voiced([1, 6], CLASSIC, ['E', 'dom7'], ['B', 'm7'], ['E', 'dom7']);
            expect(tabsOf(bm7)).toEqual(['0 2 0 1 0 0', 'x 2 x 2 3 x', '0 2 0 1 0 0']);
            // The same with no window: F7 beside the open E7 is 1 x 1 2 x x, not 1 0 1 x x.
            const f7 = voiced(null, CLASSIC, ['E', 'dom7'], ['F', 'dom7'], ['E', 'dom7']);
            expect(tabsOf(f7)[1]).toBe('1 x 1 2 x x');
        });
        it('a root on an open string has no fretted shell: this rule leaves A7 x 0 x 0 2 x alone', () => {
            // The R–7–3 shape at the nut; no fretted shell can sit on an open root, so it is not
            // this rule's one-off. Re-aimed by #1850: it was taken in frets 2–7, and there its
            // skipped 4th string rings with no finger beside it, so another rule holds it back
            // (`ringsASkippedString`) and the closed shells play. At the nut these chords are
            // the book's open ones (#1838).
            for (const [q, open] of [
                ['7sus4', 'x 0 x 0 3 x'],
                ['dom7', 'x 0 x 0 2 x'],
            ] as const) {
                const g = allPositions(GUITAR, R('A'), q).find((w) => tab(GUITAR, w) === open)!;
                expect(g, open).toBeDefined();
                expect(frettedOnItsRoot(g), open).toBe(false);
            }
            const v = voiced([2, 7], undefined, ['A', '7sus4'], ['A', 'dom7'], ['D', 'maj']);
            expect(tabsOf(v)).toEqual(['5 5 5 x x x', '5 4 5 x x x', 'x 5 4 2 x x']);
            const nut = voiced([1, 6], CLASSIC, ['A', 'm7'], ['E', 'm7']);
            expect(tabsOf(nut)).toEqual(['x 0 2 0 1 0', '0 2 0 0 0 0']);
        });
        it('a 6 chord at the 1st fret stays: B♭6 x 1 x 0 3 x has no fretted shell on its root', () => {
            // Both shapes put the 6th on an open string, so this is the shape at that fret:
            // into B♭7 only the 3rd string moves, open to the 1st fret.
            const v = voiced([1, 6], undefined, ['B♭', 'six'], ['B♭', 'dom7'], ['E♭', 'maj7']);
            expect(tabsOf(v)).toEqual(['x 1 x 0 3 x', 'x 1 x 1 3 x', 'x x 1 x 3 3']);
            expect(frettedOnItsRoot(v[0])).toBe(false);
        });
        it('a grip with an added tone is not asked: Bm7♭5 keeps x 2 0 2 x 1 in first position', () => {
            // Its open strings were ruled on where the ♭5 was placed (#1607's `openOneOff`).
            const v = voiced(
                [1, 6],
                CLASSIC,
                ['F', 'maj7'],
                ['B', 'm7b5'],
                ['E', 'dom7'],
                ['A', 'm7'],
            );
            // Fmaj7, E7 and Am7 are the book's open chords beside it (#1838).
            expect(tabsOf(v)).toEqual(['x x 3 2 1 0', 'x 2 0 2 x 1', '0 2 0 1 0 0', 'x 0 2 0 1 0']);
        });
        it('on the whole neck: an open string is voiced only where the root has no fretted shell', () => {
            // maj7, 7, m7, 6, 7sus4 and m6 on every root, between two chords on every root,
            // with and without a window and a root-string limit.
            const THREE_NOTE = SHELLS.filter((q) => !QUALITIES[q].required.length);
            const kept = new Set<string>();
            for (const rootStrings of [undefined, CLASSIC]) {
                for (const home of [null, [1, 6], [2, 7]] as ([number, number] | null)[]) {
                    for (const root of ROOTS) {
                        for (const q of THREE_NOTE) {
                            for (const side of ROOTS) {
                                const vs = voiceChart(
                                    [
                                        { root: side, quality: 'm7' },
                                        { root, quality: q },
                                        { root: side, quality: 'm7' },
                                    ],
                                    { instrument: GUITAR, home, rootStrings },
                                );
                                for (const v of vs) {
                                    // The book's open 7ths are full chords, not shells (#1838).
                                    if (!v.notes.some((n) => n.fret === 0) || v.shape.book) {
                                        continue;
                                    }
                                    const name = `${v.symbol} ${tab(GUITAR, v)}`;
                                    expect(frettedOnItsRoot(v, rootStrings), name).toBe(false);
                                    kept.add(name);
                                }
                            }
                        }
                    }
                }
            }
            // The open grips that are voiced: the 6 and m6 chords at the 1st fret, and Emaj7
            // 0 x 1 1 x x, whose skipped string has a fretted note beside it to mute it. The
            // R–7–3 shape on an open root is gone: at the nut those chords play the book's open
            // chords (#1838), and up the neck its skipped string rings with no finger beside it
            // (A7 x 0 x 0 2 x, Em7 0 x 0 0 x x), a last resort (`ringsASkippedString`, #1850).
            // F6 1 0 0 x x x went with it: it was taken in frets 2–7 beside the open Em7. A
            // 7sus4's R–3–7 shape on an open root frets nothing (A7sus4 x 0 0 0 x x) and is
            // `openStrum`'s last resort (#1817).
            expect([...kept].sort()).toMatchInlineSnapshot(`
              [
                "B♭6 x 1 x 0 3 x",
                "B♭m6 x 1 x 0 2 x",
                "Emaj7 0 x 1 1 x x",
                "F6 1 x 0 2 x x",
                "Fm6 1 x 0 1 x x",
              ]
            `);
        });
        it('it is still played where the window holds nothing else', () => {
            // No chord can be left with only such grips (the fretted shell on the same root is
            // always there), so the last resort is about the window. A hand held to the 1st
            // fret alone cannot take x 1 x 1 3 x, two frets past it, and plays the open form
            // rather than leave; given the 2nd fret too, the fretted grip is one fret out.
            const [held] = voiced([1, 1], CLASSIC, ['B♭', 'dom7']);
            expect(tab(GUITAR, held)).toBe('x 1 0 1 x x');
            const [reach] = voiced([1, 2], CLASSIC, ['B♭', 'dom7']);
            expect(tab(GUITAR, reach)).toBe('x 1 x 1 3 x');
            // One shape only, so no other shell on the root: the open form is the shape.
            const only: InstrumentDef = { ...GUITAR, shapes: [shape(GUITAR, '5B')] };
            const [v] = voiceChart(chart(['B♭', 'dom7']), { instrument: only, home: [1, 6] });
            expect(tab(only, v)).toBe('x 1 0 1 x x');
        });
    });
});

describe('fingers a teacher would show (#1611)', () => {
    const CLASSIC = [6, 5];
    const SHELL: FingerOpts = { rootBarre: true };
    /** A ukulele chord, triad or 7th: what `voiceChart` fingers every four-string grip with. */
    const UKE: FingerOpts = { barre: true, ukulele: true };
    const SHELLS = (Object.keys(QUALITIES) as Quality[]).filter(
        (q) => QUALITIES[q].kind === 'shell',
    );
    /** A grip from its tab, lowest string first; `root` is the string holding the root. */
    const notesOf = (tabs: string, root: number): Note[] => {
        const frets = tabs.split(' ');
        return frets.flatMap((t, i): Note[] => {
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
    };
    /** Fretted notes' fingers, low string first: '2-1-3'. */
    const fingersOf = (p: Array<number | null>) => p.join('-');
    const MARK = { left: '*', before: '<', after: '>' };
    /**
     * Whether an option is one of a guitar strummed grip's crowded fingerings (#1683,
     * `crowdedOptions`): a second fingering dearer than the margin a taught one keeps to. They
     * are listed apart (`crowded`), so the lists above stay the taught ones.
     */
    const crowds = (tabs: string, root: number, opts: FingerOpts) => {
        const all = fingerOptions(notesOf(tabs, root), opts);
        const near = new Set(
            all.filter((o) => o.cost <= all[0].cost + 1.0001).map((o) => fingersOf(o.p)),
        );
        return (o: { p: Array<number | null>; needs?: string }) =>
            opts.barre === true &&
            !opts.ukulele &&
            (o.needs === 'before' || o.needs === 'after') &&
            !near.has(fingersOf(o.p));
    };
    /**
     * A guitar shell's taught fingerings, cheapest first. A mark is a fingering taken only
     * beside a chord that shares its fingers: `*` fingers left where they were, `<` and `>`
     * the second standard fingering that keeps the hand on the chord before or after. The
     * fingerings taken only beside a drilled open chord (`FingerOption.adapts`, #1835) are
     * left out, as the crowded ones are: they are pinned in their own describe.
     */
    const taught = (tabs: string, root: number, opts: FingerOpts = SHELL) =>
        taughtOptions(notesOf(tabs, root), opts)
            .filter((o) => !crowds(tabs, root, opts)(o) && !o.adapts)
            .map((o) => fingersOf(o.p) + (o.needs ? MARK[o.needs] : ''));
    /** Every fingering within reach, cheapest first, each with how much dearer than the cheapest. */
    const within = (tabs: string, root: number) => {
        const all = fingerOptions(notesOf(tabs, root), SHELL);
        return new Map(
            all.map((o) => [fingersOf(o.p), Math.round((o.cost - all[0].cost) * 10) / 10]),
        );
    };
    const chart = (...chords: [string, Quality][]) =>
        chords.map(([root, quality]) => ({ root: R(root), quality }));
    const voiced = (
        inst: InstrumentDef,
        home: [number, number] | null,
        rootStrings: number[] | undefined,
        ...c: [string, Quality][]
    ) => voiceChart(chart(...c), { instrument: inst, home, rootStrings });
    const show = (inst: InstrumentDef, v: Voicing) =>
        `${tab(inst, v)} [${v.notes.map((n) => n.finger).join('-')}]`;
    /** A voiced chart as `tab [fingers]`, an open string's finger 0. */
    const played = (
        inst: InstrumentDef,
        home: [number, number] | null,
        rootStrings: number[] | undefined,
        ...c: [string, Quality][]
    ) => voiced(inst, home, rootStrings, ...c).map((v) => show(inst, v));
    /** The fingers that stay down from `a` to `b`, as the neck narrates them. */
    const staying = (inst: InstrumentDef, a: Voicing, b: Voicing) =>
        fingerMoves(inst, a, b)
            .moves.filter((m) => m.kind === 'hold')
            .map((m) => m.finger);
    /** Fingers planned across grips given as tabs (`fingerSequence`). */
    const planned = (...grips: [tabs: string, root: number, opts: FingerOpts][]) => {
        const chords = grips.map(([tabs, root, opts]) => ({ notes: notesOf(tabs, root), ...opts }));
        fingerSequence(chords);
        return chords.map((c) => c.notes.map((n) => n.finger).join('-'));
    };

    describe('a held note chooses only between fingerings that are taught', () => {
        it('never a buried root: D7 x 5 4 5 x x is 2-1-3 after Am7♭5, not 3-2-4', () => {
            // Autumn Leaves in G minor. The little finger is on the 5th fret of the 3rd string
            // in Am7♭5 and D7 has that note too; holding it put D7's root under the ring finger.
            // In frets 2–7: at the nut D7 is the book's open chord (#1838).
            const v = played(
                GUITAR,
                [2, 7],
                undefined,
                ['C', 'm7'],
                ['F', 'dom7'],
                ['B♭', 'maj7'],
                ['E♭', 'maj7'],
                ['A', 'm7b5'],
                ['D', 'dom7'],
                ['G', 'm7'],
            );
            expect(v.slice(4, 6)).toEqual(['5 x 5 5 4 x [2-3-4-1]', 'x 5 4 5 x x [2-1-3]']);
        });
        it('root first where the cheapest fingering is: the R–3–7 shapes are 2-1-3', () => {
            expect([...within('x 4 3 4 x x', 5).keys()]).toEqual(['2-1-3', '3-2-4', '2-1-4']);
            expect(taught('x 4 3 4 x x', 5)).toEqual(['2-1-3']);
            expect(taught('x 2 1 3 x x', 5)).toEqual(['2-1-3']);
        });
        it('the rule is the root, not the price: the °7 low on the neck is the barre only', () => {
            // A finger per note, root under the ring finger, is only 0.7 and 1 dearer than the
            // barre here (the barre's cost rises as the frets widen): inside the margin.
            expect(within('2 x 1 2 1 x', 6).get('3-1-4-2')).toBe(0.7);
            expect(within('3 x 2 3 2 x', 6).get('3-1-4-2')).toBe(1);
            expect(taught('2 x 1 2 1 x', 6)).toEqual(['2-1-3-1']);
            expect(taught('3 x 2 3 2 x', 6)).toEqual(['2-1-3-1']);
            expect(taught('9 x 8 9 8 x', 6)).toEqual(['2-1-3-1']);
            // E♭m7 to G°7 share no note; nothing but the price ever chose 3-1-4-2 here.
            expect(planned(['x x 1 x 2 2', 4, SHELL], ['3 x 2 3 2 x', 6, SHELL])).toEqual([
                '1-2-3',
                '2-1-3-1',
            ]);
        });
        it('a ii–V–I in C: Dm7 is 2-1-3, and the 7th slides to G7 rather than the 3rd staying', () => {
            const v = voiced(GUITAR, [2, 7], undefined, ['D', 'm7'], ['G', 'dom7'], ['C', 'maj7']);
            expect(v.map((x) => show(GUITAR, x))).toEqual([
                'x 5 3 5 x x [2-1-3]',
                '3 x 3 4 x x [1-2-3]',
                'x 3 x 4 5 x [2-3-4]',
            ]);
            // No two taught fingerings keep the F under one finger; the B is another matter.
            expect(staying(GUITAR, v[0], v[1])).toEqual([]);
            expect(staying(GUITAR, v[1], v[2])).toEqual([3]);
        });
        it('the margin: every choice of fingers is in (0.8 at most), every stretch out (2.8 at least)', () => {
            // Gm7 x x 5 3 6 x: the cheapest has the root under the ring finger (3-1-4, a
            // finger per fret), so root first a fret wider stays on offer, 0.6 and 0.8 dearer.
            expect(within('x x 5 3 6 x', 4).get('2-1-4')).toBe(0.8);
            expect(taught('x x 5 3 6 x', 4)).toEqual(['3-1-4', '2-1-3', '2-1-4']);
            // Fmaj7 x x 3 2 5 x: 2-1-3 puts the ring finger two frets from the middle, 2.8
            // dearer than 2-1-4 and the cheapest stretch any shell has.
            expect(within('x x 3 2 5 x', 4).get('2-1-3')).toBe(2.8);
            expect(taught('x x 3 2 5 x', 4)).toEqual(['2-1-4']);
            expect(within('3 x 3 4 x x', 6).get('1-2-4')).toBe(3.2);
            expect(taught('3 x 3 4 x x', 6)).toEqual(['1-2-3', '2-3-4']);
        });
    });

    describe('a useful hold is still held, in every key', () => {
        it('G7 to Cmaj7 keeps the ring finger on the B: Cmaj7 is 2-3-4, alone it is 1-2-3', () => {
            const v = played(GUITAR, [2, 7], undefined, ['G', 'dom7'], ['C', 'maj7']);
            expect(v).toEqual(['3 x 3 4 x x [1-2-3]', 'x 3 x 4 5 x [2-3-4]']);
            expect(played(GUITAR, [2, 7], undefined, ['C', 'maj7'])).toEqual([
                'x 3 x 4 5 x [1-2-3]',
            ]);
        });
        it('the same ii–V–I a tone down, at the 1st fret: F7 to B♭maj7 keeps the ring finger too', () => {
            // Shape for shape the C one, two frets lower: the fingers are the same.
            const inC = planned(
                ['x 5 3 5 x x', 5, SHELL],
                ['3 x 3 4 x x', 6, SHELL],
                ['x 3 x 4 5 x', 5, SHELL],
            );
            const inBFlat = planned(
                ['x 3 1 3 x x', 5, SHELL],
                ['1 x 1 2 x x', 6, SHELL],
                ['x 1 x 2 3 x', 5, SHELL],
            );
            expect(inC).toEqual(['2-1-3', '1-2-3', '2-3-4']);
            expect(inBFlat).toEqual(inC);
            // As the stand voices it (roots on the 6th and 5th strings, frets 1–6), with the
            // narration the C chart has: "Finger 3 stays down".
            const v = voiced(GUITAR, [1, 6], CLASSIC, ['C', 'm7'], ['F', 'dom7'], ['B♭', 'maj7']);
            expect(v.map((x) => show(GUITAR, x))).toEqual([
                'x 3 1 3 x x [2-1-3]',
                '1 x 1 2 x x [1-2-3]',
                'x 1 x 2 3 x [2-3-4]',
            ]);
            expect(staying(GUITAR, v[1], v[2])).toEqual([3]);
        });
        it('the rhythm fingering, index idle behind the root, is on offer from the 2nd fret', () => {
            expect(taught('3 x 3 3 x x', 6)).toEqual(['1-2-3', '2-3-4']);
            expect(taught('2 x 2 2 x x', 6)).toEqual(['1-2-3', '2-3-4']);
            expect(taught('x 3 x 4 5 x', 5)).toEqual(['1-2-3', '2-3-4']);
        });
    });

    describe('an idle index never stretches the other fingers', () => {
        it('C7 x 3 x 3 5 x is 1-2-3 or 1-2-4, not 2-3-4 (ring and little finger two frets apart)', () => {
            // As cheap as the others, so only this rule keeps it out.
            expect(within('x 3 x 3 5 x', 5).get('2-3-4')).toBe(0.6);
            expect(taught('x 3 x 3 5 x', 5)).toEqual(['1-2-3', '1-2-4']);
        });
        it('Fmaj7 x x 3 x 5 5 is 1-3-4 or 1-2-3, not 2-3-4', () => {
            expect(taught('x x 3 x 5 5', 4)).toEqual(['1-3-4', '1-2-3']);
        });
        it('in a chart: plagal in C keeps C7 and Fmaj7 off 2-3-4', () => {
            // In frets 2–7: at the nut C7 and Fmaj7 are the book's open chords (#1838).
            const v = played(
                GUITAR,
                [2, 7],
                undefined,
                ['C', 'six'],
                ['C', 'dom7'],
                ['F', 'maj7'],
                ['F', 'm7'],
            );
            // C7 has the E under the ring finger, and Fmaj7 in position keeps it there
            // (#1677). It was 1-2-4 into 1-2-3: C6's little finger kept, then the E
            // re-fingered for Fmaj7. One held note either way.
            expect(v.slice(1, 3)).toEqual(['x 3 x 3 5 x [1-2-3]', 'x x 3 x 5 5 [1-3-4]']);
        });
    });

    describe('nobody arrives with the index behind the nut; a finger already down stays', () => {
        it('a lone 1st-fret note takes the index: E7 0 x 0 1 x x, Am7 x 0 x 0 1 x', () => {
            // The rhythm changes bridge opened on E7 with the little finger; the canon came to
            // Am7 from G7 with it. Neither kept a note: an idle finger was just free to place.
            // The grips as the charts voiced them before #1838 made these chords the book's
            // open ones at the nut: the rule is the shell's, wherever it is played.
            const bridge = planned(
                ['0 x 0 1 x x', 6, SHELL],
                ['0 x 0 1 x x', 6, SHELL],
                ['x 0 x 0 2 x', 5, SHELL],
            );
            expect(bridge.slice(0, 2)).toEqual(['0-0-1', '0-0-1']);
            const canon = planned(
                ['x 3 2 4 x x', 5, SHELL],
                ['3 2 3 x x x', 6, SHELL],
                ['x 0 x 0 1 x', 5, SHELL],
                ['0 x 0 0 x x', 6, SHELL],
                ['1 x 2 2 x x', 6, SHELL],
            );
            expect(canon[2]).toBe('0-0-1');
        });
        it('two 1st-fret notes take the index and middle: Dm7 x x 0 x 1 1', () => {
            // The shell as Dm7 Em7♭5 Fmaj7 voiced it before #1838 (now the open x x 0 2 1 1).
            expect(planned(['x x 0 x 1 1', 4, SHELL], ['x x 2 3 3 3', 4, SHELL])[0]).toBe('0-1-2');
        });
        it('arrived at cold, Fmaj7 1 x 2 2 x x and Fm7 1 x 1 1 x x are 1-2-3', () => {
            // As C6 C7 Fmaj7 Fm7 voiced them in frets 1–6 before #1838 made C7 and Fmaj7 the
            // book's open chords there.
            const v = planned(
                ['x 3 2 2 x x', 5, SHELL],
                ['x 3 2 3 x x', 5, SHELL],
                ['1 x 2 2 x x', 6, SHELL],
                ['1 x 1 1 x x', 6, SHELL],
            );
            expect(v.slice(2)).toEqual(['1-2-3', '1-2-3']);
            // From a chord it shares no note with, and at the top of a chart.
            expect(planned(['x 3 2 3 x x', 5, SHELL], ['1 x 2 2 x x', 6, SHELL])[1]).toBe('1-2-3');
            expect(planned(['1 x 1 1 x x', 6, SHELL])).toEqual(['1-2-3']);
        });
        it('such a fingering is offered only as fingers left down; a fret up it is an ordinary choice', () => {
            expect(taught('1 x 1 1 x x', 6)).toEqual(['1-2-3', '2-3-4*']);
            expect(taught('2 x 2 2 x x', 6)).toEqual(['1-2-3', '2-3-4']);
            expect(taught('0 x 0 1 x x', 6)).toEqual(['1', '2*', '3*', '4*']);
            expect(taught('x 0 x 0 2 x', 5)).toEqual(['1', '2', '3*', '4*']);
        });
        it('ukulele G7 0 2 1 2 to Cmaj7 0 0 0 2 leaves the ring finger where it is', () => {
            const g7: [string, number, FingerOpts] = ['0 2 1 2', 4, UKE];
            const cmaj7: [string, number, FingerOpts] = ['0 0 0 2', 3, UKE];
            expect(planned(g7, cmaj7)).toEqual(['0-2-1-3', '0-0-0-3']);
            // Placed fresh, it is the middle finger, the 2nd fret's own (#1677): alone, and
            // after a chord that held nothing there.
            expect(planned(cmaj7)).toEqual(['0-0-0-2']);
            expect(planned(['0 0 0 0', 3, UKE], cmaj7)).toEqual(['0-0-0-0', '0-0-0-2']);
            // Not placed early for the chord after either: G7 re-fingers the note.
            expect(planned(cmaj7, g7)).toEqual(['0-0-0-2', '0-2-1-3']);
        });
        it('any finger left down counts, not only the lowest: ukulele Bm7♭5 2 2 1 2 to E7 1 2 0 2', () => {
            // Ring and little finger stay, the middle slides back a fret, the index lifts.
            const v = voiced(UKULELE, null, undefined, ['B', 'm7b5'], ['E', 'dom7'], ['A', 'm7']);
            expect(v.slice(0, 2).map((x) => show(UKULELE, x))).toEqual([
                '2 2 1 2 [2-3-1-4]',
                '1 2 0 2 [2-3-0-4]',
            ]);
            expect(staying(UKULELE, v[0], v[1])).toEqual([3, 4]);
            // From a chord that leaves no finger there, E7 is the 1-2-3 of the method books.
            expect(planned(['0 0 0 0', 3, UKE], ['1 2 0 2', 2, UKE])[1]).toBe('1-2-0-3');
        });
        it('left in place means no finger is swapped for another: ukulele Emaj7 1 3 0 2 stays 1-3-0-2', () => {
            // After G♯m7 1 3 2 2 (1-4-2-3), 2-4-0-3 would keep the ring and little finger but
            // put the middle finger on the note the index was holding.
            expect(planned(['1 3 2 2', 2, UKE], ['1 3 0 2', 2, UKE])).toEqual([
                '1-4-2-3',
                '1-3-0-2',
            ]);
            // After B7 2 3 2 2 with a finger each (1-4-2-3, a guitar-style fingering the
            // ukulele no longer takes) it would send the middle finger across to the string
            // the index is on, a fret below it. A finger stays or slides on its own string.
            expect(planned(['2 3 2 2', 1, {}], ['1 3 0 2', 2, {}])).toEqual(['1-4-2-3', '1-3-0-2']);
        });
    });

    describe('the minor 7th in position, 3-1-4, to keep the hand on the chord beside it', () => {
        it('is offered for the 6th- and 5th-string R–♭3–♭7 only, and only with a reason', () => {
            expect(within('x 5 3 5 x x', 5).get('3-1-4')).toBe(2.4);
            expect(taught('x 5 3 5 x x', 5)).toEqual(['2-1-3', '3-1-4<', '3-1-4>']);
            expect(taught('5 3 5 x x x', 6)).toEqual(['2-1-3', '3-1-4<', '3-1-4>']);
            // Never 3-2-4, the fingering that kept "Finger 2 stays down" on Dm7 to G7.
            expect(within('x 5 3 5 x x', 5).has('3-2-4')).toBe(true);
            // The °7's finger per note crowds the index's fret and is not in position.
            expect(taught('5 x 4 5 4 x', 6)).toEqual(['2-1-3-1']);
        });
        it('Dm7 x 5 3 5 x x into the B♭ triad x 5 3 3 x x keeps the ring finger on the root', () => {
            // In frets 2–7: at the nut Dm7 and Fmaj7 are the book's open chords (#1838).
            const v = voiced(
                GUITAR,
                [2, 7],
                undefined,
                ['F', 'maj7'],
                ['C', 'maj'],
                ['D', 'm7'],
                ['B♭', 'maj'],
            );
            expect(v.slice(2).map((x) => show(GUITAR, x))).toEqual([
                'x 5 3 5 x x [3-1-4]',
                'x 5 3 3 x x [3-1-1]',
            ]);
            // The index stays on its fret too, laid flat for the barre (narrated as a move).
            expect(staying(GUITAR, v[2], v[3])).toEqual([3]);
            // And out of it the same way.
            expect(planned(['x 5 3 3 x x', 5, { barre: true }], ['x 5 3 5 x x', 5, SHELL])).toEqual(
                ['3-1-1', '3-1-4'],
            );
        });
        it('with nothing to keep it is 2-1-3: alone, at the end of a chart, before G7', () => {
            expect(planned(['x 5 3 5 x x', 5, SHELL])).toEqual(['2-1-3']);
            expect(planned(['x 5 3 5 x x', 5, SHELL], ['3 x 3 4 x x', 6, SHELL])).toEqual([
                '2-1-3',
                '1-2-3',
            ]);
            expect(planned(['3 x 3 4 x x', 6, SHELL], ['x 5 3 5 x x', 5, SHELL])[1]).toBe('2-1-3');
            // A chart cannot end on it waiting for a chord that never comes (B♭maj7 Am7♭5 Gm7).
            expect(
                planned(
                    ['x 1 x 2 3 x', 5, SHELL],
                    ['x 0 1 0 1 x', 5, SHELL],
                    ['3 1 3 x x x', 6, SHELL],
                )[2],
            ).toBe('2-1-3');
        });
        it('a finger the cheapest fingering keeps as well is no reason: Cmaj7 to Am7 5 3 5', () => {
            // The index is on the 3rd fret of the 5th string in both chords, under 2-1-3 too.
            // (I–vi–IV–V in C; without the rule the travel cost picks 3-1-4 here.)
            expect(
                planned(
                    ['x 3 x 4 5 x', 5, SHELL],
                    ['5 3 5 x x x', 6, SHELL],
                    ['1 x 2 2 x x', 6, SHELL],
                    ['3 2 3 x x x', 6, SHELL],
                ).slice(0, 2),
            ).toEqual(['1-2-3', '2-1-3']);
        });
        it('two second choices do not justify each other: Gm7 x 10 8 10 x x to Dm7 10 x 10 10 x x', () => {
            // 3-1-4 to 2-3-4 keeps the little finger; 2-1-3 to 1-2-3 keeps the ring finger on
            // the same note, each chord fingered its ordinary way.
            expect(
                planned(
                    ['x 8 x 8 10 x', 5, SHELL],
                    ['x 10 8 10 x x', 5, SHELL],
                    ['10 x 10 10 x x', 6, SHELL],
                    ['11 10 12 x x x', 6, SHELL],
                ).slice(1, 3),
            ).toEqual(['2-1-3', '1-2-3']);
        });
    });

    describe('what the rules leave alone', () => {
        it('every shell on offer: its default is the cheapest fingering, unmarked, and uses the index', () => {
            // But for the one guitar shape whose cheapest is out of position (#1677).
            const notCheapest = new Set<string>();
            for (const inst of [GUITAR, UKULELE]) {
                const opts: FingerOpts = inst === GUITAR ? SHELL : UKE;
                for (const root of ROOTS) {
                    for (const q of SHELLS) {
                        for (const v of allPositions(inst, root, q)) {
                            const fresh = v.notes.map((n) => ({ ...n }));
                            const best = taughtOptions(fresh, opts)[0];
                            const label = `${v.symbol} ${tab(inst, v)}`;
                            // A ukulele's default is not always the cheapest: no cramped
                            // barre (Cm7♭5 5 6 6 6 is 1-2-3-4, not 1-2-3-3), and the table.
                            if (
                                inst === GUITAR &&
                                fingersOf(best.p) !== fingersOf(fingerOptions(fresh, opts)[0].p)
                            ) {
                                const low = Math.min(...v.notes.map((n) => n.fret));
                                notCheapest.add(
                                    `${v.quality} ${v.notes.map((n) => `${n.string}:${n.fret - low}`).join(' ')} ${fingersOf(best.p)}`,
                                );
                            }
                            expect(best.needs, label).toBeUndefined();
                            // A ukulele chord of one note takes the finger of its fret
                            // instead (Cmaj7 0 0 0 2, #1677).
                            if (best.p.length === 1 && inst === UKULELE) {
                                expect(best.p, label).toEqual([best.fr[0].fret]);
                            } else if (best.p.length) {
                                expect(best.p, label).toContain(1);
                            }
                        }
                    }
                }
            }
            // The maj7 on strings 4, 2 and 1 (Fmaj7 x x 3 x 5 5), wherever it sits.
            expect([...notCheapest]).toEqual(['maj7 4:0 2:2 1:2 1-3-4']);
        });
        it('a chord by itself is fingered as it always was', () => {
            for (const root of ROOTS) {
                for (const q of SHELLS) {
                    const [v] = voiceChart([{ root, quality: q }], {
                        instrument: GUITAR,
                        home: [1, 6],
                    });
                    const alone = v.notes.map((n) => ({ ...n }));
                    // The book's open 7ths are fingered as strummed chords (#1838).
                    assignFingers(alone, v.shape.book ? { barre: true } : SHELL);
                    expect(
                        v.notes.map((n) => n.finger),
                        `${v.symbol} ${tab(GUITAR, v)}`,
                    ).toEqual(alone.map((n) => n.finger));
                }
            }
        });
        it('a chart of closed triads keeps its barres: C G Am F in frets 2–7', () => {
            const v = played(
                GUITAR,
                [2, 7],
                undefined,
                ['C', 'maj'],
                ['G', 'maj'],
                ['A', 'min'],
                ['F', 'maj'],
            );
            expect(v).toEqual([
                'x x x 5 5 3 [3-3-1]',
                'x x x 4 3 3 [2-1-1]',
                'x x x 5 5 5 [1-1-1]',
                'x x x 5 6 5 [1-2-1]',
            ]);
        });
    });

    describe('a strummed grip is fingered as it is taught (#1617)', () => {
        const STRUM: FingerOpts = { barre: true };
        const strummed = (tabs: string) => taught(tabs, 0, STRUM);
        /** A ukulele grip's taught fingerings: `<` and `>` need two fingers kept (#1681). */
        const ukulele = (tabs: string) => taught(tabs, 0, UKE);

        it('guitar triads, shape by shape: the barre forms and the three inversions', () => {
            // Root position, first and second inversion on the top three strings.
            expect(strummed('x x x 5 5 3')).toEqual(['3-3-1', '3-4-1']); // C, the A shape
            expect(strummed('x x x 9 8 8')).toEqual(['2-1-1']); // C/E, the F shape
            // D, a finger each. Never 2-4-3, the little finger tucked inside over an idle
            // index (#1691).
            expect(strummed('x x x 2 3 2')).toEqual(['1-3-2']);
            expect(strummed('x x x 7 8 7')).toEqual(['1-2-1', '1-3-2']);
            expect(strummed('x x x 12 13 12')).toEqual(['1-2-1']); // C/G, the index barre
            // The minors on the same strings.
            expect(strummed('x x x 4 3 2')).toEqual(['3-2-1', '4-3-2']); // Bm
            expect(strummed('x x x 7 7 7')).toEqual(['1-1-1']); // Bm/D
            expect(strummed('x x x 2 3 1')).toEqual(['2-3-1', '3-4-2*']); // Dm/A, the open Dm
            // The 5th-string set.
            expect(strummed('x 5 4 2 x x')).toEqual(['4-3-1']); // D, the C shape
            expect(strummed('x 5 3 2 x x')).toEqual(['4-2-1']); // Dm
            expect(strummed('x 5 3 3 x x')).toEqual(['3-1-1']); // B♭/D
            expect(strummed('x 3 3 2 x x')).toEqual(['2-3-1', '3-4-2']); // F/C
            expect(strummed('x 5 5 3 x x')).toEqual(['3-3-1', '3-4-1']); // Gm/D
        });
        it('open triads take the fingers of the open chord, and the nut rule holds for them', () => {
            expect(strummed('x x 2 0 1 x')).toEqual(['2-1', '3-2*', '4-3*']); // C
            expect(strummed('x x 2 1 0 x')).toEqual(['2-1', '3-2*', '4-3*']); // E
            // From the nut a finger takes the fret of its number (#1677): C is 3-2 as in
            // x32010, and 2-1 a second fingering for the chord beside it.
            expect(strummed('x 3 2 0 x x')).toEqual(['3-2', '2-1<', '2-1>', '4-3*']); // C
            expect(strummed('x 2 0 0 x x')).toEqual(['2', '1<', '1>', '3*', '4*']); // G
            // A: never 1-2 (#1834); its book 1-3 is priced past `crowds`' reach, below.
            expect(strummed('x x x 2 2 0')).toEqual(['2-3', '3-4*']); // A
        });
        it('a power chord is 1-3-3 or 1-3-4, never 1-2-3 or 2-3-4', () => {
            expect(strummed('x 2 4 4 x x')).toEqual(['1-3-3', '1-3-4']);
            expect(strummed('7 9 9 x x x')).toEqual(['1-3-3', '1-3-4']);
            expect(strummed('x 0 2 2 x x')).toEqual(['1-1']);
            const all = fingerOptions(notesOf('x 2 4 4 x x', 5), STRUM).map((o) => fingersOf(o.p));
            // Never 1-4-4: the little finger never lies flat (#1819).
            expect(all).toEqual(['1-3-3', '1-2-3', '1-3-4', '2-3-4']);
        });
        it('the fingertip-per-note fingering beside a ring-finger barre is priced as a choice', () => {
            // `handCost` reads 3-4 on one fret as a fret of stretch, 2.6: more than a held
            // note is worth, so one held note could never choose it.
            const [barre, split] = taughtOptions(notesOf('x x x 5 5 3', 1), STRUM);
            expect([fingersOf(barre.p), fingersOf(split.p)]).toEqual(['3-3-1', '3-4-1']);
            expect(split.cost - barre.cost).toBe(1);
            // C6 x 3 x 2 5 x has the little finger on the 5th fret of the 2nd string, and the C
            // triad keeps it there; alone it bars.
            expect(planned(['x 3 x 2 5 x', 5, SHELL], ['x x x 5 5 3', 1, STRUM])).toEqual([
                '2-1-4',
                '3-4-1',
            ]);
            expect(planned(['x x x 5 5 3', 1, STRUM])).toEqual(['3-3-1']);
        });
        it('no ring finger laid flat a fret above the index: F x 3 3 2 x x is not 3-3-1', () => {
            const all = fingerOptions(notesOf('x 3 3 2 x x', 5), STRUM);
            const cramped = all.find((o) => fingersOf(o.p) === '3-3-1')!;
            // Inside the margin, so only this rule keeps it out.
            expect(Math.round((cramped.cost - all[0].cost) * 10) / 10).toBe(0.8);
            expect(strummed('x 3 3 2 x x')).not.toContain('3-3-1');
            // The ukulele's Dm 2 2 1 0 the same: 2-3-1, as every chart prints it.
            expect(ukulele('2 2 1 0')).toEqual(['2-3-1', '3-4-2*']);
            // Two frets above the index it is the A shape.
            expect(strummed('x x x 4 4 2')[0]).toBe('3-3-1');
        });
        it('no stretch the cheapest does not have: B♭ x 5 3 3 x x is never 4-2-3', () => {
            const all = fingerOptions(notesOf('x 5 3 3 x x', 5), STRUM).map((o) => fingersOf(o.p));
            expect(all).toContain('4-2-3');
            expect(strummed('x 5 3 3 x x')).toEqual(['3-1-1']);
            // The ukulele's B 4 3 2 2 was 4-3-1-2 beside E 1 4 0 2.
            expect(ukulele('4 3 2 2')).toEqual(['3-2-1-1']);
            expect(played(UKULELE, [1, 6], undefined, ['B', 'maj'], ['E', 'maj'])).toEqual([
                '4 3 2 2 [3-2-1-1]',
                '1 4 0 2 [1-4-0-2]',
            ]);
        });

        describe('ukulele: the method-book fingerings', () => {
            it('C is the ring finger and Am the middle: a finger takes the fret of its number', () => {
                expect(ukulele('0 0 0 3')).toEqual(['3', '1*', '2*', '4*']);
                expect(ukulele('2 0 0 0')).toEqual(['2', '1*', '3*', '4*']);
                expect(played(UKULELE, [1, 6], undefined, ['C', 'maj'], ['A', 'min'])).toEqual([
                    '0 0 0 3 [0-0-0-3]',
                    '2 0 0 0 [2-0-0-0]',
                ]);
            });
            // The table's other fingerings wait for a finger that stays, before or after.
            const BOOK_E_FLAT = ['2-3-1', '3-3-1<', '3-4-1<', '3-3-1>', '3-4-1>'];
            it('Fm 1 0 1 3 is 1-2-4; E♭ 0 3 3 1 is 2-3-1, or the barre, or 3-4-1', () => {
                expect(ukulele('1 0 1 3')).toEqual(['1-2-4', '1-2-3*']);
                expect(ukulele('0 3 3 1')).toEqual(BOOK_E_FLAT);
                // In a chart the first of them is the default, though the barre is cheaper.
                const v = played(
                    UKULELE,
                    [1, 6],
                    undefined,
                    ['E♭', 'maj'],
                    ['A♭', 'maj'],
                    ['B♭', 'maj'],
                );
                expect(v).toEqual(['0 3 3 1 [0-2-3-1]', '1 3 4 3 [1-2-4-3]', '3 2 1 1 [3-2-1-1]']);
            });
            it('the F shape up the neck is the index barre at every fret: F♯ 3 1 2 1', () => {
                // The costs take a fingertip each below the 6th fret, as a guitar's D shape does.
                const cheapest = (tabs: string) =>
                    fingersOf(fingerOptions(notesOf(tabs, 0), UKE)[0].p);
                expect(cheapest('3 1 2 1')).toBe('4-1-3-2');
                expect(ukulele('3 1 2 1')).toEqual(['3-1-2-1', '4-1-3-2*']);
                expect(ukulele('5 3 4 3')).toEqual(['3-1-2-1', '4-1-3-2*']);
                expect(ukulele('12 10 11 10')).toEqual(['3-1-2-1']);
                // A guitar's D shape is left to the costs: the table is four strings wide.
                expect(strummed('x x x 2 3 2')[0]).toBe('1-3-2');
            });
            it('the chords the costs already finger by the book keep it', () => {
                // Never 4-3, the ring and little finger alone, even left down (#1811).
                expect(ukulele('2 0 1 0')).toEqual(['2-1', '3-2*']); // F
                expect(ukulele('2 1 0 0')).toEqual(['2-1', '3-2*']); // A
                expect(ukulele('0 2 3 2')).toEqual(['1-3-2', '2-4-3<', '2-4-3>']); // G
                expect(ukulele('0 2 3 1')).toEqual(['2-3-1', '3-4-2*']); // Gm
                expect(ukulele('0 4 3 2')).toEqual(['3-2-1', '4-3-2<', '4-3-2>']); // Em
                expect(ukulele('2 2 2 0')).toEqual(['1-2-3', '2-3-4<', '2-3-4>']); // D (#1681)
                expect(ukulele('0 3 3 3')).toEqual(['1-1-1', '1-2-3<', '1-2-3>']); // Cm
                expect(ukulele('1 4 0 2')).toEqual(['1-4-2']); // E
                expect(ukulele('3 2 1 1')).toEqual(['3-2-1-1']); // B♭
                expect(ukulele('4 2 2 2')).toEqual(['3-1-1-1']); // Bm
                expect(ukulele('1 1 1 4')).toEqual(['1-1-1-4']); // D♭
                expect(ukulele('3 3 2 1')).toEqual(['3-4-2-1', '3-3-2-1<', '3-3-2-1>']); // E♭m
            });
            it('in a chart: C C7 F Fm C, and the finger already down on the C stays', () => {
                const v = played(
                    UKULELE,
                    [1, 6],
                    undefined,
                    ['C', 'maj'],
                    ['C', 'dom7'],
                    ['F', 'maj'],
                    ['F', 'min'],
                    ['C', 'maj'],
                );
                expect(v).toEqual([
                    '0 0 0 3 [0-0-0-3]',
                    '0 0 0 1 [0-0-0-1]',
                    '2 0 1 0 [2-0-1-0]',
                    '1 0 1 3 [1-0-2-4]',
                    // Fm's little finger is on this C. It is not lifted to match the table.
                    '0 0 0 3 [0-0-0-4]',
                ]);
                // Cm F G Cm: F was 4-0-3-0 here, and Fm 2-0-3-4 with the index idle.
                expect(
                    played(UKULELE, [1, 6], undefined, ['C', 'min'], ['F', 'maj'], ['G', 'maj']),
                ).toEqual(['0 3 3 3 [0-1-1-1]', '2 0 1 0 [2-0-1-0]', '0 2 3 2 [0-1-3-2]']);
                expect(
                    played(UKULELE, [1, 6], undefined, ['C', 'min'], ['F', 'min'], ['G', 'maj'])[1],
                ).toBe('1 0 1 3 [1-0-2-4]');
            });
            it('a chord by itself takes the book fingering too', () => {
                const alone = (tabs: string) => {
                    const notes = notesOf(tabs, 0);
                    assignFingers(notes, UKE);
                    return notes.map((n) => n.finger).join('-');
                };
                expect(alone('0 0 0 3')).toBe('0-0-0-3');
                expect(alone('0 3 3 1')).toBe('0-2-3-1');
                expect(alone('3 1 2 1')).toBe('3-1-2-1');
            });
        });

        it('every triad and power grip on offer: its default is unmarked and in the options', () => {
            const STRUMMED = (Object.keys(QUALITIES) as Quality[]).filter(
                (q) => QUALITIES[q].kind !== 'shell',
            );
            for (const inst of [GUITAR, UKULELE]) {
                for (const root of ROOTS) {
                    for (const q of STRUMMED) {
                        for (const v of allPositions(inst, root, q)) {
                            const fresh = v.notes.map((n) => ({ ...n }));
                            const opts = inst === UKULELE ? UKE : STRUM;
                            const offered = taughtOptions(fresh, opts);
                            const all = fingerOptions(fresh, opts).map((o) => fingersOf(o.p));
                            const label = `${v.symbol} ${tab(inst, v)}`;
                            expect(offered[0].needs, label).toBeUndefined();
                            expect(offered[0].own, label).not.toContain(true);
                            for (const o of offered) {
                                // One book fingering is past what the costs offer (#1677),
                                // and so is a guitar grip's crowded hand (#1683), which
                                // always waits for two fingers that stay.
                                if (tab(inst, v) === '0 3 3 3' && fingersOf(o.p) === '1-2-3') {
                                    continue;
                                }
                                if (inst === GUITAR && !all.includes(fingersOf(o.p))) {
                                    expect(o.needs, label).toMatch(/before|after/);
                                    expect(o.hold, label).toBe(2);
                                    continue;
                                }
                                expect(all, label).toContain(fingersOf(o.p));
                            }
                        }
                    }
                }
            }
        });

        describe('one plan for a chart that mixes shells and triads', () => {
            it('B♭ x 5 3 3 x x beside Cm7 is the barre, with no pass to hold it there', () => {
                // E♭maj7 B♭ Cm7 A♭. The triad used to be planned first, with every fingering
                // open, and frozen; planned with the shells it took 4-2-3 to hold a note of Cm7.
                const v = played(
                    GUITAR,
                    [1, 6],
                    CLASSIC,
                    ['E♭', 'maj7'],
                    ['B♭', 'maj'],
                    ['C', 'm7'],
                    ['A♭', 'maj'],
                );
                expect([v[1], v[3]]).toEqual(['x 5 3 3 x x [3-1-1]', 'x 3 1 1 x x [3-1-1]']);
                // The Cm7 between them takes its position fingering to stay on the A♭.
                expect(v[2]).toBe('x 3 1 3 x x [3-1-4]');
            });
            it('a lone note beside open strings takes the finger of its fret: Cmaj7 Am Fmaj7 G', () => {
                // The three-string grips: at the nut the real Am and G are whole (#1849).
                const v = played(
                    GUITAR_TRIADS,
                    [1, 6],
                    undefined,
                    ['C', 'maj7'],
                    ['A', 'min'],
                    ['F', 'maj7'],
                    ['G', 'maj'],
                );
                // Am beside the book's open Cmaj7 and Fmaj7 (#1838) is the open Am's top.
                expect([v[1], v[3]]).toEqual(['x x x 2 1 0 [2-1-0]', 'x 2 0 0 x x [2-0-0]']);
            });
            it('a shell holds a note of the triad beside it: C7 to F', () => {
                // The frozen triad was 3-3-1 here, and the 3rd of C7 changed finger. Up the neck
                // C7 is the shell; at the nut the book's open C7 (#1838), and F keeps its root
                // under the ring finger.
                const v = voiced(GUITAR, [2, 7], CLASSIC, ['C', 'dom7'], ['F', 'maj']);
                expect(v.map((x) => show(GUITAR, x))).toEqual([
                    'x 3 2 3 x x [2-1-3]',
                    'x 3 3 2 x x [2-3-1]',
                ]);
                expect(staying(GUITAR, v[0], v[1])).toEqual([2]);
                const nut = voiced(GUITAR, [1, 6], CLASSIC, ['C', 'dom7'], ['F', 'maj']);
                expect(nut.map((x) => show(GUITAR, x))).toEqual([
                    'x 3 2 3 1 0 [3-2-4-1-0]',
                    'x 3 3 2 x x [3-4-2]',
                ]);
                expect(staying(GUITAR, nut[0], nut[1])).toEqual([3]);
            });
        });

        describe('one fingering for a grip, unless a held note says otherwise', () => {
            it('changing fingering costs only the notes that change finger', () => {
                const [a, b] = taughtOptions(notesOf('3 x 3 3 x x', 6), SHELL);
                expect([fingersOf(a.p), fingersOf(b.p)]).toEqual(['1-2-3', '2-3-4']);
                const next = taughtOptions(notesOf('x 5 4 5 x x', 5), SHELL)[0];
                // No note shared: nothing, whichever fingers come from wherever.
                expect(fingerTransCost(a, next)).toBe(0);
                expect(fingerTransCost(b, next)).toBe(0);
                // The same grip under other fingers: every note re-fingered.
                expect(fingerTransCost(a, b)).toBe(7.5);
                expect(fingerTransCost(a, a)).toBe(0);
            });
            it('Autumn Leaves in G minor: Gm7 3 x 3 3 x x is 1-2-3 every time', () => {
                // Bars 7–8 and bar 15. It was 2-3-4 in bar 15, between two D7s it shares no
                // note with: the fingers that had just played D7 were charged for the trip.
                const QUALITY: Record<string, Quality> = {
                    m7: 'm7',
                    '7': 'dom7',
                    maj7: 'maj7',
                    'm7♭5': 'm7b5',
                };
                const tune =
                    'Cm7 F7 B♭maj7 E♭maj7 Am7♭5 D7 Gm7 Gm7 Cm7 F7 B♭maj7 E♭maj7 Am7♭5 D7 Gm7 D7'
                        .split(' ')
                        .map((sym): [string, Quality] => {
                            const [, root, kind] = /^([A-G]♭?)(.*)$/.exec(sym)!;
                            return [root, QUALITY[kind]];
                        });
                // In frets 2–7: at the nut D7 is the book's open chord (#1838), and Gm7 beside it
                // the R–3–7 shell 3 1 3 x x x, 2-1-3 every time.
                const v = played(GUITAR, [2, 7], CLASSIC, ...tune);
                expect([v[6], v[7], v[14]]).toEqual(Array(3).fill('3 x 3 3 x x [1-2-3]'));
            });
            it('a blues in B♭: B♭7 x 1 x 1 3 x is 1-2-3 every time', () => {
                const blues = 'B♭ B♭ B♭ B♭ E♭ E♭ B♭ B♭ F E♭ B♭ F'
                    .split(' ')
                    .map((r): [string, Quality] => [r, 'dom7']);
                const v = played(GUITAR, [1, 6], undefined, ...blues);
                expect(v.filter((x) => x.startsWith('x 1 x 1 3 x'))).toEqual(
                    Array(7).fill('x 1 x 1 3 x [1-2-3]'),
                );
                // E♭7 after F7 took 2-3-4 to keep the index's note; since #1851 a shell in frets
                // 1–6 keeps one fingering a song, and with no window a comper still re-fingers.
                expect(v.slice(8, 10)).toEqual(['1 x 1 2 x x [1-2-3]', 'x x 1 x 2 3 [1-2-3]']);
                const free = played(GUITAR, null, undefined, ...blues);
                expect(free.slice(8, 10)).toEqual(['1 x 1 2 x x [1-2-3]', 'x x 1 x 2 3 [2-3-4]']);
            });
            it('in every key, both instruments: a fingering that is not the default holds a note', () => {
                const PROGRESSIONS: [number, Quality][][] = [
                    // The blues, Autumn Leaves' A section with a turnaround, as shells.
                    [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7].map((i) => [i, 'dom7']),
                    [
                        [2, 'm7'],
                        [7, 'dom7'],
                        [0, 'maj7'],
                        [5, 'maj7'],
                        [11, 'm7b5'],
                        [4, 'dom7'],
                        [9, 'm7'],
                        [4, 'dom7'],
                    ],
                    // Triads, and triads mixed with 7ths.
                    [
                        [0, 'maj'],
                        [7, 'maj'],
                        [9, 'min'],
                        [4, 'min'],
                        [5, 'maj'],
                        [0, 'maj'],
                        [5, 'maj'],
                        [7, 'maj'],
                    ],
                    [
                        [0, 'maj'],
                        [0, 'dom7'],
                        [5, 'maj'],
                        [5, 'min'],
                        [0, 'maj'],
                        [9, 'min'],
                        [2, 'm7'],
                        [7, 'dom7'],
                    ],
                ];
                const gripOf = (v: Voicing) => v.notes.map((n) => `${n.string}:${n.fret}`).join();
                const unexplained: string[] = [];
                let second = 0;
                for (const inst of [GUITAR, UKULELE]) {
                    for (const home of [[1, 6], [5, 10], null] as ([number, number] | null)[]) {
                        for (let key = 0; key < 12; key++) {
                            for (const bars of PROGRESSIONS) {
                                const v = voiceChart(
                                    bars.map(([i, quality]) => ({
                                        root: ROOTS[(key + i) % 12],
                                        quality,
                                    })),
                                    { instrument: inst, home },
                                );
                                v.forEach((g, i) => {
                                    const alone = g.notes.map((n) => ({ ...n }));
                                    // The book's open 7ths are strummed chords (#1838).
                                    const shell = g.shape.kind === 'shell' && !g.shape.book;
                                    const ukulele = inst === UKULELE;
                                    assignFingers(alone, ukulele ? UKE : shell ? SHELL : STRUM);
                                    if (g.notes.every((n, k) => n.finger === alone[k].finger)) {
                                        return;
                                    }
                                    second++;
                                    // The nearest different grip on either side of `at`.
                                    const besideOf = (at: number) =>
                                        [-1, 1].map((step) => {
                                            let j = at + step;
                                            while (v[j] && gripOf(v[j]) === gripOf(g)) {
                                                j += step;
                                            }
                                            return v[j];
                                        });
                                    // The same grip under these fingers at `at` keeps a note
                                    // under a finger of its own.
                                    const keeps = (at: number) =>
                                        v[at].notes.some(
                                            (n, k) =>
                                                n.fret > 0 &&
                                                n.finger !== alone[k].finger &&
                                                besideOf(at).some((o) =>
                                                    o?.notes.some(
                                                        (m) =>
                                                            m.string === n.string &&
                                                            m.fret === n.fret &&
                                                            m.finger === n.finger,
                                                    ),
                                                ),
                                        );
                                    // A guitar triad or power grip keeps one fingering for the
                                    // song (#1836): where it keeps nothing, it is the fingering
                                    // the same grip takes elsewhere in the chart to keep a note.
                                    const kept =
                                        keeps(i) ||
                                        (!ukulele &&
                                            !shell &&
                                            v.some(
                                                (w, j) =>
                                                    gripOf(w) === gripOf(g) &&
                                                    w.notes.every(
                                                        (n, k) => n.finger === g.notes[k].finger,
                                                    ) &&
                                                    keeps(j),
                                            ));
                                    // A ukulele chord leaves its default only for two fingers
                                    // that stay on the chord right beside it; or for one, when
                                    // that is the only finger it moves (#1677) or the fingering
                                    // is another its books print (E♭ 0 3 3 1, Cm 0 3 3 3).
                                    const fretted = g.notes.filter((n) => n.fret > 0);
                                    const moved = new Set(
                                        fretted
                                            .filter(
                                                (n) =>
                                                    n.finger !== alone[g.notes.indexOf(n)].finger,
                                            )
                                            .map((n) => n.finger),
                                    );
                                    const BOOK = ['0 3 3 1', '0 3 3 3'];
                                    const needed = BOOK.includes(tab(inst, g))
                                        ? 1
                                        : Math.min(2, moved.size);
                                    const stay = (o: Voicing | undefined) =>
                                        new Set(
                                            g.notes
                                                .filter(
                                                    (n) =>
                                                        n.fret > 0 &&
                                                        o?.notes.some(
                                                            (m) =>
                                                                m.string === n.string &&
                                                                m.fret === n.fret &&
                                                                m.finger === n.finger,
                                                        ),
                                                )
                                                .map((n) => n.finger),
                                        ).size;
                                    const enough =
                                        !ukulele ||
                                        Math.max(stay(v[i - 1]), stay(v[i + 1])) >= needed;
                                    if (!kept || !enough) {
                                        unexplained.push(
                                            `${inst.name} ${home} #${i + 1} ${show(inst, g)}`,
                                        );
                                    }
                                });
                            }
                        }
                    }
                }
                expect(unexplained).toEqual([]);
                // Not vacuous: second fingerings are taken, each for a note it keeps.
                expect(second).toBeGreaterThan(80);
            });
        });
    });

    describe('ukulele chords are fingered as the ukulele is taught (#1681)', () => {
        /** One grip alone, from its tab: `0-2-1-1`. */
        const alone = (tabs: string) => planned([tabs, 0, UKE])[0];
        const uke = (...c: [string, Quality][]) => played(UKULELE, [1, 6], undefined, ...c);

        it('a 7th chord on one fret is a barre, not four fingertips', () => {
            const rows: [string, Quality, string][] = [
                ['D', 'dom7', '2 2 2 3 [1-1-1-2]'],
                ['D♭', 'dom7', '1 1 1 2 [1-1-1-2]'],
                ['E♭', 'dom7', '3 3 3 4 [1-1-1-2]'],
                ['B', 'm7', '2 2 2 2 [1-1-1-1]'],
                ['C', 'm7', '3 3 3 3 [1-1-1-1]'],
                ['B♭', 'm7', '1 1 1 1 [1-1-1-1]'],
                ['B', 'dom7', '2 3 2 2 [1-2-1-1]'],
                ['B♭', 'dom7', '1 2 1 1 [1-2-1-1]'],
                ['D', 'maj7', '2 2 2 4 [1-1-1-3]'],
                ['E♭', 'maj7', '3 3 3 5 [1-1-1-3]'],
                ['A♭', 'maj7', '1 3 3 3 [1-3-3-3]'],
                ['B♭', 'maj7', '2 2 1 1 [2-3-1-1]'],
                ['G', 'm7', '0 2 1 1 [0-2-1-1]'],
            ];
            for (const [root, quality, shown] of rows) {
                expect(uke([root, quality]), `${root}${quality}`).toEqual([shown]);
            }
        });
        it('no ukulele grip on offer puts four fingertips on one fret', () => {
            for (const root of ROOTS) {
                for (const q of Object.keys(QUALITIES) as Quality[]) {
                    for (const v of allPositions(UKULELE, root, q)) {
                        const frets = new Set(v.notes.map((n) => n.fret));
                        if (v.notes.length === 4 && frets.size === 1 && !frets.has(0)) {
                            expect(
                                new Set(v.notes.map((n) => n.finger)).size,
                                `${v.symbol} ${tab(UKULELE, v)}`,
                            ).toBe(1);
                        }
                    }
                }
            }
        });
        it('the chord after one keeps its book fingering: D D7 G, and a blues in A', () => {
            // D7 a fingertip each left the little finger on the A string, and G took 0-2-4-3.
            expect(uke(['D', 'maj'], ['D', 'dom7'], ['G', 'maj'])).toEqual([
                '2 2 2 0 [1-2-3-0]',
                '2 2 2 3 [1-1-1-2]',
                '0 2 3 2 [0-1-3-2]',
            ]);
            const blues = uke(
                ...['A', 'A', 'D', 'D', 'A', 'E', 'D', 'A'].map((r): [string, Quality] => [
                    r,
                    'dom7',
                ]),
            );
            expect([...new Set(blues)]).toEqual([
                '0 1 0 0 [0-1-0-0]',
                '2 2 2 3 [1-1-1-2]',
                '1 2 0 2 [1-2-0-3]',
            ]);
        });
        it('a ring finger laid flat a fret above the index is not what the others are measured from', () => {
            // A♭m7♭5 1 2 2 2: the cramped barres are the cheapest, and the grip is 1-2-3-4.
            const all = fingerOptions(notesOf('1 2 2 2', 0), UKE).map((o) => fingersOf(o.p));
            expect(all.slice(0, 3)).toEqual(['1-2-3-3', '1-3-3-3', '1-2-3-4']);
            expect(taught('1 2 2 2', 0, UKE)).toEqual(['1-2-3-4']);
            // Two frets above the index the ring finger does lie flat: A♭maj7.
            expect(taught('1 3 3 3', 0, UKE)).toEqual(['1-3-3-3']);
        });

        it('D 2 2 2 0 is 1-2-3, and 2-3-4 beside a chord that keeps two of those fingers', () => {
            expect(alone('2 2 2 0')).toBe('1-2-3-0');
            expect(taught('2 2 2 0', 0, UKE)).toEqual(['1-2-3', '2-3-4<', '2-3-4>']);
            // No barre is on offer at all: it would lie on the open A string.
            const all = fingerOptions(notesOf('2 2 2 0', 0), UKE).map((o) => fingersOf(o.p));
            expect(all).toEqual(['1-2-3', '2-3-4', '1-2-4', '1-3-4']);
        });
        it('no barre lies on an open string: Asus4 and Dsus2 2 2 0 0, C♯m 1 1 0 4, Faug 2 1 1 0', () => {
            expect(alone('2 2 0 0')).toBe('1-2-0-0');
            expect(alone('1 1 0 4')).toBe('1-2-0-4');
            expect(alone('2 1 1 0')).toBe('3-1-2-0');
            expect(alone('1 1 0 0')).toBe('1-2-0-0'); // Amaj7
            expect(alone('1 1 0 2')).toBe('1-2-0-3'); // C♯m7
        });
        it('an open string beyond the fingertip is clear of the barre: Gm7 0 2 1 1, Gmaj7 0 2 2 2', () => {
            expect(alone('0 2 1 1')).toBe('0-2-1-1');
            expect(alone('0 2 2 2')).toBe('0-1-1-1');
            expect(alone('0 3 3 3')).toBe('0-1-1-1'); // Cm
            expect(alone('0 1 1 1')).toBe('0-1-1-1'); // Gm7♭5
        });
        it('B5 x x 2 2 and B♭5 x x 1 1 are index and middle, as the book prints them (#1809)', () => {
            expect(uke(['B', 'five'])).toEqual(['x x 2 2 [1-2]']);
            expect(uke(['B♭', 'five'])).toEqual(['x x 1 1 [1-2]']);
            // Beside a chord that bars those strings the index stays across them.
            expect(uke(['B', 'maj'], ['B', 'five'])).toEqual([
                '4 3 2 2 [3-2-1-1]',
                'x x 2 2 [1-1]',
            ]);
        });
        it('Dsus4 2 2 3 0 follows from D: two fingers stay and the ring finger moves up a fret', () => {
            const v = voiced(UKULELE, [1, 6], undefined, ['D', 'maj'], ['D', 'sus4'], ['D', 'maj']);
            expect(v.map((x) => show(UKULELE, x))).toEqual([
                '2 2 2 0 [1-2-3-0]',
                '2 2 3 0 [1-2-3-0]',
                '2 2 2 0 [1-2-3-0]',
            ]);
            expect(staying(UKULELE, v[0], v[1])).toEqual([1, 2]);
            expect(uke(['A', 'maj'], ['A', 'sus4'], ['A', 'maj'])[1]).toBe('2 2 0 0 [1-2-0-0]');
        });

        it('one held finger does not move a chord off its book fingering: E7 after Dm, G7 after Fm', () => {
            // Dm's ring finger is on the C string's 2nd fret, and E7 was 2-3-0-4 to keep it.
            expect(uke(['A', 'min'], ['D', 'min'], ['E', 'dom7'])).toEqual([
                '2 0 0 0 [2-0-0-0]',
                '2 2 1 0 [2-3-1-0]',
                '1 2 0 2 [1-2-0-3]',
            ]);
            // Fm's middle finger is on the E string's 1st fret, and G7 was 0-3-2-4.
            expect(uke(['C', 'min'], ['F', 'min'], ['G', 'dom7'])).toEqual([
                '0 3 3 3 [0-1-1-1]',
                '1 0 1 3 [1-0-2-4]',
                '0 2 1 2 [0-2-1-3]',
            ]);
            // Nor is a chord fingered oddly for the one finger the next chord could keep.
            expect(uke(['G', 'maj'], ['D', 'maj'])).toEqual([
                '0 2 3 2 [0-1-3-2]',
                '2 2 2 0 [1-2-3-0]',
            ]);
        });
        it('two fingers that stay do: G7 after Dm7♭5, Em after G, and Em before G', () => {
            const ii = voiced(UKULELE, [1, 6], undefined, ['D', 'm7b5'], ['G', 'dom7']);
            expect(ii.map((x) => show(UKULELE, x))).toEqual([
                '1 2 1 3 [1-3-2-4]',
                '0 2 1 2 [0-3-2-4]',
            ]);
            expect(staying(UKULELE, ii[0], ii[1])).toEqual([2, 3]);
            expect(uke(['G', 'maj'], ['E', 'min'])).toEqual([
                '0 2 3 2 [0-1-3-2]',
                '0 4 3 2 [0-4-3-2]',
            ]);
            expect(uke(['E', 'min'], ['G', 'maj'])[0]).toBe('0 4 3 2 [0-4-3-2]');
            expect(uke(['E', 'min'])).toEqual(['0 4 3 2 [0-3-2-1]']);
        });
        it('a one-finger chord keeps its one finger: Cmaj7 after G7, C after Fm', () => {
            expect(planned(['0 2 1 2', 0, UKE], ['0 0 0 2', 0, UKE])[1]).toBe('0-0-0-3');
            expect(planned(['1 0 1 3', 0, UKE], ['0 0 0 3', 0, UKE])[1]).toBe('0-0-0-4');
        });
        it('the fingerings a table prints for one chord are still chosen by a single finger', () => {
            // E♭ 0 3 3 1 is printed 2-3-1, 3-3-1 and 3-4-1: all three are book fingerings, so
            // one finger that stays is enough. After F7 2 3 1 3 the ring finger stays on the
            // C string.
            const others = taughtOptions(notesOf('0 3 3 1', 0), UKE).slice(1);
            expect(others.map((o) => o.hold)).toEqual([1, 1, 1, 1]);
            expect(planned(['2 3 1 3', 0, UKE], ['0 3 3 1', 0, UKE])).toEqual([
                '2-3-1-4',
                '0-3-3-1',
            ]);
        });
        it("the two-finger rule is a ukulele grip's: one held note still chooses on a guitar", () => {
            // Between a guitar shell's two fingerings (#1611), and a triad's (#1677).
            expect(taught('3 x 3 3 x x', 6)).toEqual(['1-2-3', '2-3-4']);
            // An open grip's second fingering asks for a finger per fingertip off its fret
            // (#1683): Em as 1-2 has one, so one held note still chooses it.
            const second = taughtOptions(notesOf('x 2 2 0 x x', 0), { barre: true }).slice(1, 3);
            expect(second.map((o) => `${fingersOf(o.p)}:${o.hold}`)).toEqual(['1-2:1', '1-2:1']);
            // And a closed grip's asks for nothing more than the note it shares.
            const closed = taughtOptions(notesOf('x 3 3 2 x x', 0), { barre: true }).filter(
                (o) => !o.adapts,
            );
            expect(closed.map((o) => `${fingersOf(o.p)}:${o.hold}`)).toEqual([
                '2-3-1:undefined',
                '3-4-2:undefined',
            ]);
        });
    });

    describe('the fingerings two teachers corrected (#1677)', () => {
        const STRUM: FingerOpts = { barre: true };
        const strummed = (tabs: string) => taught(tabs, 0, STRUM);
        const ukulele = (tabs: string) => taught(tabs, 0, UKE);
        /** Every fingering within reach of a grip, as `fingerOptions` lists them. */
        const reach = (tabs: string, opts: FingerOpts) =>
            fingerOptions(notesOf(tabs, 0), opts).map((o) => fingersOf(o.p));
        /** One grip alone, from its tab: `0-2-1-1`. */
        const alone = (tabs: string, opts: FingerOpts = UKE) => planned([tabs, 0, opts])[0];
        const uke = (...c: [string, Quality][]) => played(UKULELE, [1, 6], undefined, ...c);

        describe('guitar: no barre lies on an open string on its palm side', () => {
            it('two notes on one fret under a sounding open string take a fingertip each', () => {
                // Em and A: 2-3; Em 1-2 for the chord beside it, and A never 1-2 (#1834).
                expect(strummed('x 2 2 0 x x')).toEqual(['2-3', '1-2<', '1-2>', '3-4*']);
                expect(strummed('x x x 2 2 0')).toEqual(['2-3', '3-4*']);
                // On the 1st fret, 1-2.
                expect(strummed('x 1 1 0 x x')).toEqual(['1-2', '2-3*', '3-4*']);
                expect(strummed('x x 1 1 0 x')).toEqual(['1-2', '2-3*', '3-4*']);
                // Csus4 on the 3rd: 3-4, and 2-3 or 1-2 beside a chord that keeps a finger.
                expect(strummed('x 3 3 0 x x')).toEqual(['3-4', '1-2<', '2-3<', '1-2>', '2-3>']);
                // The barre is not within reach at all.
                for (const tabs of ['x 2 2 0 x x', 'x x x 2 2 0', 'x 1 1 0 x x', 'x 3 3 0 x x']) {
                    expect(reach(tabs, STRUM), tabs).not.toContain('1-1');
                }
            });
            it('an open string beyond the fingertip is clear of it: E5 and A5 keep the barre', () => {
                expect(strummed('0 2 2 x x x')[0]).toBe('1-1');
                expect(strummed('x 0 2 2 x x')[0]).toBe('1-1');
                expect(alone('0 2 2 x x x', STRUM)).toBe('0-1-1');
            });
            it('Em as 1-2 keeps the middle finger into C; alone and into G it is 2-3', () => {
                const em: [string, number, FingerOpts] = ['x 2 2 0 x x', 0, STRUM];
                const c: [string, number, FingerOpts] = ['x 3 2 0 x x', 5, STRUM];
                expect(planned(em, c)).toEqual(['1-2-0', '3-2-0']);
                expect(planned(em)).toEqual(['2-3-0']);
                expect(planned(em, ['x 2 0 0 x x', 0, STRUM])).toEqual(['2-3-0', '2-0-0']);
            });
            it('A as 1-3 keeps the index into D, through two bars of A', () => {
                // A fingering that waits for the chord after waits through its own repeat.
                // It was 1-2, the middle finger on the B string, until #1834.
                const a: [string, number, FingerOpts] = ['x x x 2 2 0', 0, STRUM];
                const d: [string, number, FingerOpts] = ['x x x 2 3 2', 2, STRUM];
                expect(planned(a, a, d, a)).toEqual(['1-3-0', '1-3-0', '1-3-2', '1-3-0']);
                // D is never 2-4-3 to meet an A played 2-3.
                expect(planned(a, d)).toEqual(['1-3-0', '1-3-2']);
            });
        });

        describe('guitar: from the nut a finger takes the fret of its number', () => {
            it('open C x 3 2 0 x x is 3-2; 2-1 only to keep both fingers into Am', () => {
                // These grips carry only roots and 5ths (`notesOf`), so no drilled chord is
                // asked: the nut rule alone. The real C, a drilled chord, is never 2-1 and the
                // Am beside it is 3-2-1 (#1835, the describe at the end of this file).
                const c: [string, number, FingerOpts] = ['x 3 2 0 x x', 5, STRUM];
                const am: [string, number, FingerOpts] = ['x 3 2 2 x x', 0, STRUM];
                expect(strummed('x 3 2 0 x x')).toEqual(['3-2', '2-1<', '2-1>', '4-3*']);
                expect(planned(c)).toEqual(['3-2-0']);
                expect(planned(c, am)).toEqual(['2-1-0', '2-1-1']);
                expect(planned(c, c, am)).toEqual(['2-1-0', '2-1-0', '2-1-1']);
                expect(planned(am, c)).toEqual(['2-1-1', '2-1-0']);
                // In a chart: C G Am F opens on 3-2, and G is the middle finger (on the
                // three-string grips; at the nut the real C and G are whole, #1849).
                expect(
                    played(
                        GUITAR_TRIADS,
                        [1, 6],
                        undefined,
                        ['C', 'maj'],
                        ['G', 'maj'],
                        ['A', 'min'],
                        ['F', 'maj'],
                    ).slice(0, 2),
                ).toEqual(['x 3 2 0 x x [3-2-0]', 'x 2 0 0 x x [2-0-0]']);
            });
            it('a lone note takes the finger of its fret: G x 2 0 0 x x, and the 3rd fret the ring', () => {
                expect(strummed('x 2 0 0 x x')[0]).toBe('2');
                expect(strummed('x 3 0 0 x x')[0]).toBe('3');
                expect(strummed('x x x 0 1 0')[0]).toBe('1');
            });
            it('the grips that already sat at the nut keep their fingers: C x x 2 0 1 x, E x x 2 1 0 x', () => {
                expect(strummed('x x 2 0 1 x')).toEqual(['2-1', '3-2*', '4-3*']);
                expect(strummed('x x 2 1 0 x')).toEqual(['2-1', '3-2*', '4-3*']);
            });
            it('a 4th-fret note is the hand moved up, and a grip with no open string is not asked', () => {
                expect(strummed('x 4 2 0 x x')[0]).toBe('3-1'); // C♯dim
                expect(strummed('x 3 3 2 x x')[0]).toBe('2-3-1'); // F
                expect(strummed('x x 5 3 5 x')[0]).toBe('2-1-3'); // the dim triad, root first
            });
            it('a shell is left alone: A7 x 0 x 0 2 x is still the index', () => {
                // Its default is `taughtAmong`'s, the cheapest: asked there, the same rule
                // would finger Dmaj7 x x 0 x 2 2 as 2-3, off the 1-2 it is taught with.
                expect(taught('x 0 x 0 2 x', 5)).toEqual(['1', '2', '3*', '4*']);
                expect(taught('x x 0 x 2 2', 4)[0]).toBe('1-2');
            });
        });

        describe('guitar: Fmaj7 x x 3 x 5 5 is 1-3-4 cold', () => {
            it('the in-position fingering is the default, and 1-2-3 a free second', () => {
                const [first, second] = taughtOptions(notesOf('x x 3 x 5 5', 4), SHELL);
                expect([fingersOf(first.p), fingersOf(second.p)]).toEqual(['1-3-4', '1-2-3']);
                expect([first.needs, second.needs]).toEqual([undefined, undefined]);
                // Priced as the cheapest, so the plan reaches for it with nothing to hold.
                expect(first.cost).toBeLessThan(second.cost);
                expect(first.cost).toBe(fingerOptions(notesOf('x x 3 x 5 5', 4), SHELL)[0].cost);
                expect(planned(['x x 3 x 5 5', 4, SHELL])).toEqual(['1-3-4']);
                for (let f = 1; f <= 8; f++) {
                    expect(planned([`x x ${f} x ${f + 2} ${f + 2}`, 4, SHELL])).toEqual(['1-3-4']);
                }
            });
            it('where the in-position fingering is past the margin the cheapest stays: Dm7 x 5 3 5 x x', () => {
                expect(taught('x 5 3 5 x x', 5)[0]).toBe('2-1-3');
                expect(taught('3 x 3 4 x x', 6)[0]).toBe('1-2-3');
                expect(taught('x 3 x 3 5 x', 5)[0]).toBe('1-2-3');
            });
        });

        describe('ukulele: which finger lies flat', () => {
            it('E♭m 3 3 2 1 is 3-4-2-1, and the ring barre the second fingering', () => {
                expect(ukulele('3 3 2 1')).toEqual(['3-4-2-1', '3-3-2-1<', '3-3-2-1>']);
                expect(alone('3 3 2 1')).toBe('3-4-2-1');
                expect(alone('7 7 6 5')).toBe('3-4-2-1');
                // Over ONE lower string the ring finger does lie flat: E 4 4 4 2.
                expect(alone('4 4 4 2')).toBe('3-3-3-1');
            });
            it('the little finger never lies flat: the closed E shape is 1-3-4-2', () => {
                for (const tabs of ['1 4 4 2', '2 5 5 3', '3 6 6 4']) {
                    expect(ukulele(tabs), tabs).toEqual(['1-3-4-2', '1-3-3-2<', '1-3-3-2>']);
                }
                // 1 1 4 4 was 1-2-4-4 to keep a finger for A♭; it is not within reach now.
                expect(reach('1 1 4 4', UKE)).not.toContain('1-2-4-4');
                expect(alone('1 1 4 4')).toBe('1-1-3-4');
                // No ukulele grip on offer puts the little finger on two strings.
                for (const root of ROOTS) {
                    for (const q of Object.keys(QUALITIES) as Quality[]) {
                        for (const v of allPositions(UKULELE, root, q)) {
                            for (const o of fingerOptions(
                                v.notes.map((n) => ({ ...n })),
                                UKE,
                            )) {
                                expect(
                                    o.p.filter((f) => f === 4).length,
                                    `${v.symbol} ${tab(UKULELE, v)} ${fingersOf(o.p)}`,
                                ).toBeLessThan(2);
                            }
                        }
                    }
                }
                // Nor, since #1819, a guitar grip: the power chord is 1-3-3 or 1-3-4.
                expect(reach('x 2 4 4 x x', STRUM)).not.toContain('1-4-4');
            });
            it('only the index lies flat under another finger: the G shape is 1-2-4-3 at every fret', () => {
                for (let f = 1; f <= 10; f++) {
                    const tabs = `${f} ${f + 2} ${f + 3} ${f + 2}`;
                    expect(alone(tabs), tabs).toBe('1-2-4-3');
                    expect(reach(tabs, UKE), tabs).not.toContain('1-3-4-3');
                }
                // The index still does: the F shape, and the dim7 up the neck.
                expect(alone('3 1 2 1')).toBe('3-1-2-1');
                expect(alone('8 9 8 9')).toBe('1-2-1-3');
            });
            it('the sus4 shape 3 3 1 1 is 3-4-1-1: the index covers its fret', () => {
                for (const tabs of ['3 3 1 1', '4 4 2 2', '9 9 7 7']) {
                    expect(alone(tabs), tabs).toBe('3-4-1-1');
                }
                expect(ukulele('3 3 1 1')[0]).toBe('3-4-1-1');
                expect(uke(['C', 'dom7'], ['B♭', 'sus4'])).toEqual([
                    '0 0 0 1 [0-0-0-1]',
                    '3 3 1 1 [3-4-1-1]',
                ]);
                // An open string on the barre's palm side and there is none: Asus4. And a
                // string between the two is `holeCost`'s to decide: the sus2 shape low down.
                expect(alone('2 2 0 0')).toBe('1-2-0-0');
                expect(alone('2 4 5 2')).toBe('1-3-4-2');
            });
            it('no finger reaches ahead of its fret where one need not: E5 4 4 0 2 is 3-4-1', () => {
                expect(alone('4 4 0 2')).toBe('3-4-0-1');
                // Where every fingering reaches, the cheapest stays: A♭sus4 1 3 4 4.
                expect(alone('1 3 4 4')).toBe('1-2-3-4');
            });
        });

        describe('ukulele: a finger that can stay', () => {
            it('C Cm C keeps the ring finger: Cm 0 3 3 3 is also printed 1-2-3', () => {
                expect(uke(['C', 'maj'], ['C', 'min'], ['C', 'maj'])).toEqual([
                    '0 0 0 3 [0-0-0-3]',
                    '0 3 3 3 [0-1-2-3]',
                    '0 0 0 3 [0-0-0-3]',
                ]);
                // Alone, and beside a chord that keeps no finger of it, it is the barre.
                expect(alone('0 3 3 3')).toBe('0-1-1-1');
                expect(uke(['C', 'min'], ['F', 'maj'])[0]).toBe('0 3 3 3 [0-1-1-1]');
                // The costs never offer it: three fingertips on one fret read as a stretch.
                expect(reach('0 3 3 3', UKE)).not.toContain('1-2-3');
            });
            it('C Fm C keeps the ring finger on the A string throughout', () => {
                expect(uke(['C', 'maj'], ['F', 'min'], ['C', 'maj'])).toEqual([
                    '0 0 0 3 [0-0-0-3]',
                    '1 0 1 3 [1-0-2-3]',
                    '0 0 0 3 [0-0-0-3]',
                ]);
                // Fm as 1-2-3 moves one finger off the book's 1-2-4, so one that stays is
                // enough; a fingering that moves three still needs two.
                const hold = (tabs: string) =>
                    taughtOptions(notesOf(tabs, 0), UKE)
                        .filter((o) => o.needs)
                        .map((o) => `${fingersOf(o.p)}:${o.hold}`);
                expect(hold('1 0 1 3')).toEqual(['1-2-3:1']);
                expect(hold('1 2 0 2')).toEqual(['2-3-4:2']);
                expect(hold('2 2 2 0')).toEqual(['2-3-4:2', '2-3-4:2']);
                // So neither of #1681's two comes back.
                expect(uke(['A', 'min'], ['D', 'min'], ['E', 'dom7'])[2]).toBe('1 2 0 2 [1-2-0-3]');
                expect(uke(['C', 'min'], ['F', 'min'], ['G', 'dom7'])).toEqual([
                    '0 3 3 3 [0-1-1-1]',
                    '1 0 1 3 [1-0-2-4]',
                    '0 2 1 2 [0-2-1-3]',
                ]);
            });
            it('a one-note chord takes the finger of its fret: Cmaj7 0 0 0 2 is the middle', () => {
                expect(ukulele('0 0 0 2')).toEqual(['2', '1*', '3*', '4*']);
                expect(ukulele('0 0 0 3')).toEqual(['3', '1*', '2*', '4*']);
                expect(ukulele('0 0 0 1')).toEqual(['1', '2*', '3*', '4*']);
                expect(uke(['C', 'maj'], ['C', 'maj7'], ['C', 'dom7'])).toEqual([
                    '0 0 0 3 [0-0-0-3]',
                    '0 0 0 2 [0-0-0-2]',
                    '0 0 0 1 [0-0-0-1]',
                ]);
                // A fuller open chord is printed from the index, whatever its fret.
                expect(alone('2 2 2 0')).toBe('1-2-3-0');
                expect(alone('0 2 3 2')).toBe('0-1-3-2');
            });
            it('a three-string power chord is a ukulele chord too: G5 0 2 3 x beside D', () => {
                // Fingered as a guitar grip it kept one finger of D and was 2-3.
                const v = voiced(UKULELE, [1, 6], undefined, ['D', 'maj'], ['G', 'five']);
                expect(v.map((x) => show(UKULELE, x))).toEqual([
                    '2 2 2 0 [1-2-3-0]',
                    '0 2 3 x [0-1-2]',
                ]);
                expect(
                    taughtOptions(notesOf('0 2 3 x', 0), UKE)
                        .filter((o) => o.needs)
                        .every((o) => o.hold === 2),
                ).toBe(true);
            });
        });

        describe('ukulele: never the ring and little finger alone (#1811)', () => {
            it('Dm7 Dsus4 G5 Gsus2: G5 is not left under the ring and little finger', () => {
                // It was Dsus4 2-3-4 (Dm7's middle and ring kept) and then G5 and Gsus2 3-4,
                // the middle finger lifted and the index behind the nut. Now Dsus4 takes its
                // book 1-2-3 and G5 is that grip with the index lifted.
                expect(uke(['D', 'm7'], ['D', 'sus4'], ['G', 'five'], ['G', 'sus2'])).toEqual([
                    '2 2 1 3 [2-3-1-4]',
                    '2 2 3 0 [1-2-3-0]',
                    '0 2 3 x [0-2-3]',
                    '0 2 3 0 [0-2-3-0]',
                ]);
                // Alone, or after a chord that holds none of their notes, the book's 1-2.
                expect(alone('0 2 3 x')).toBe('0-1-2');
                expect(alone('0 2 3 0')).toBe('0-1-2-0');
                expect(uke(['D', 'sus4'], ['G', 'five'])[1]).toBe('0 2 3 x [0-1-2]');
            });
            it('Em7 0 2 0 2 after Ddim7 or Bm7♭5 is index and middle, not 3-4', () => {
                expect(uke(['D', 'dim7'], ['E', 'm7'], ['D', 'dim7'])[1]).toBe('0 2 0 2 [0-1-0-2]');
                expect(uke(['B', 'm7b5'], ['E', 'm7'])[1]).toBe('0 2 0 2 [0-1-0-2]');
            });
            it('a lift that leaves the middle finger down is still taken', () => {
                expect(uke(['D', 'min'], ['D', 'sus2'], ['D', 'min'])[1]).toBe('2 2 0 0 [2-3-0-0]');
                expect(uke(['F', 'min'], ['F', 'sus2'], ['F', 'min'])[1]).toBe('0 0 1 3 [0-0-2-4]');
                expect(uke(['G', 'min'], ['G', 'five'], ['G', 'min'])[1]).toBe('0 2 3 x [0-2-3]');
                // And a one-finger chord keeps the ring finger G7 leaves there.
                expect(uke(['G', 'dom7'], ['C', 'maj7'])[1]).toBe('0 0 0 2 [0-0-0-3]');
            });
            it('no fingering a ukulele grip is taught leaves the ring and little finger alone', () => {
                for (const root of ROOTS) {
                    for (const q of Object.keys(QUALITIES) as Quality[]) {
                        for (const v of allPositions(UKULELE, root, q)) {
                            for (const o of taughtOptions(v.notes, UKE)) {
                                const weak = o.p.length > 1 && o.p.every((f) => (f ?? 0) >= 3);
                                expect(weak, `${root}${q} ${tab(UKULELE, v)}`).toBe(false);
                            }
                        }
                    }
                }
            });
        });
    });

    describe('one finger moves and the rest stay (#1683)', () => {
        const STRUM: FingerOpts = { barre: true };
        type Grip = { notes: Note[] } & FingerOpts;
        /**
         * A guitar grip from its tab with its real degrees, low string to high, one for each
         * sounding string: `chord('x x x 2 3 3', '5 R 4')` is Dsus4.
         */
        const chord = (tabs: string, degrees: string): Grip => {
            const frets = tabs.split(' ');
            const named = degrees.split(' ') as Note['degree'][];
            let k = 0;
            const notes = frets.flatMap((t, i): Note[] => {
                if (t === 'x') {
                    return [];
                }
                const degree = named[k++];
                return [
                    {
                        string: frets.length - i,
                        fret: Number(t),
                        degree,
                        role: degree === 'R' ? 'R' : 'F',
                        finger: null,
                    },
                ];
            });
            return { notes, ...STRUM };
        };
        /** Fingers planned across chords built by `chord`, each a fresh copy. */
        const run = (...chords: Grip[]) => {
            const fresh = chords.map((c) => ({ ...c, notes: c.notes.map((n) => ({ ...n })) }));
            fingerSequence(fresh);
            return fresh.map((c) => c.notes.map((n) => n.finger).join('-'));
        };
        /** The crowded fingerings on offer for a grip (`crowdedOptions`), each once. */
        const crowded = (c: Grip) => {
            const all = fingerOptions(c.notes, STRUM);
            const near = new Set(
                all.filter((o) => o.cost <= all[0].cost + 1.0001).map((o) => fingersOf(o.p)),
            );
            return taughtOptions(c.notes, STRUM)
                .filter((o) => o.needs === 'before' && !o.adapts && !near.has(fingersOf(o.p)))
                .map((o) => fingersOf(o.p));
        };
        const D = chord('x x x 2 3 2', '5 R 3');
        const Dm = chord('x x x 2 3 1', '5 R b3');
        const Dsus4 = chord('x x x 2 3 3', '5 R 4');
        const Dsus2 = chord('x x x 2 3 0', '5 R 2');
        const C = chord('x 3 2 0 x x', 'R 3 5');
        const Csus4 = chord('x 3 3 0 x x', 'R 4 5');
        const F = chord('x 3 3 2 x x', '5 R 3');
        const Fm = chord('x 3 3 1 x x', '5 R b3');
        const Fsus4 = chord('x 3 3 3 x x', '5 R 4');
        const Am = chord('x 3 2 2 x x', 'b3 5 R');
        const Em = chord('x 2 2 0 x x', '5 R b3');

        describe('a sus chord beside its own major keeps the major’s fingers', () => {
            it('D to Dsus4 adds the little finger, and back', () => {
                expect(run(D, Dsus4)).toEqual(['1-3-2', '1-3-4']);
                expect(run(D, Dsus4, D)).toEqual(['1-3-2', '1-3-4', '1-3-2']);
                expect(run(Dsus4, D)).toEqual(['1-3-4', '1-3-2']);
            });
            it('D to Dsus2 lifts the middle finger, and back', () => {
                expect(run(D, Dsus2)).toEqual(['1-3-2', '1-3-0']);
                expect(run(D, Dsus2, D)).toEqual(['1-3-2', '1-3-0', '1-3-2']);
                expect(run(D, Dsus4, Dsus2, D)).toEqual(['1-3-2', '1-3-4', '1-3-0', '1-3-2']);
            });
            it('C to Csus4 keeps the ring finger on C and adds the little finger, and back', () => {
                // Already the fingering from the nut (#1677), and still it.
                expect(run(C, Csus4)).toEqual(['3-2-0', '3-4-0']);
                expect(run(C, Csus4, C)).toEqual(['3-2-0', '3-4-0', '3-2-0']);
            });
            it('F to Fsus4 adds the little finger, and back', () => {
                expect(run(F, Fsus4)).toEqual(['2-3-1', '2-3-4']);
                expect(run(F, Fsus4, F)).toEqual(['2-3-1', '2-3-4', '2-3-1']);
                expect(run(Fsus4, F)).toEqual(['2-3-4', '2-3-1']);
            });
            it('a sus chord with no such neighbour keeps its default', () => {
                expect(run(Dsus4)).toEqual(['1-2-3']);
                // The open D with the middle finger lifted, 1-3 (#1691; it was 2-3).
                expect(run(Dsus2)).toEqual(['1-3-0']);
                expect(run(Csus4)).toEqual(['3-4-0']);
                expect(run(Fsus4)).toEqual(['1-1-1']);
                // And the default is still first, unmarked, on every one.
                for (const c of [Dsus4, Dsus2, Csus4, Fsus4]) {
                    expect(taughtOptions(c.notes, STRUM)[0].needs).toBeUndefined();
                }
            });
            it('beside its minor the same: Dm to Dsus4 is 2-3-4, to Dsus2 2-3', () => {
                expect(run(Dm, Dsus4, Dm)).toEqual(['2-3-1', '2-3-4', '2-3-1']);
                expect(run(Dm, Dsus2, Dm)).toEqual(['2-3-1', '2-3-0', '2-3-1']);
            });
            it('the same shapes at other frets: two of the major’s fingers stay', () => {
                const kept = (a: string, b: string) =>
                    a.split('-').filter((f, i) => f !== '0' && f === b.split('-')[i]).length;
                for (let f = 2; f <= 9; f++) {
                    // The D shape and its sus4; the F shape and its sus4.
                    const d = run(
                        chord(`x x x ${f} ${f + 1} ${f}`, '5 R 3'),
                        chord(`x x x ${f} ${f + 1} ${f + 1}`, '5 R 4'),
                    );
                    expect(kept(d[0], d[1]), `D shape, fret ${f}: ${d}`).toBe(2);
                    const g = run(
                        chord(`x ${f + 1} ${f + 1} ${f} x x`, '5 R 3'),
                        chord(`x ${f + 1} ${f + 1} ${f + 1} x x`, '5 R 4'),
                    );
                    expect(g, `F shape, fret ${f}`).toEqual(['2-3-1', '2-3-4']);
                }
            });
        });

        describe('what the crowded hand is held to', () => {
            it('it is on offer only as a second fingering that needs two fingers to stay', () => {
                expect(crowded(Dsus4)).toEqual(['1-2-4', '1-3-4']);
                // 1-3 is Dsus2's own fingering now (#1691), so not a crowded one.
                expect(crowded(Dsus2)).toEqual(['2-4', '1-4']);
                expect(crowded(Fsus4)).toContain('2-3-4');
                for (const c of [Dsus4, Dsus2, Fsus4]) {
                    for (const o of taughtOptions(c.notes, STRUM)) {
                        if (crowded(c).includes(fingersOf(o.p))) {
                            expect(o.hold).toBe(2);
                            expect(o.needs).toMatch(/before|after/);
                        }
                    }
                }
                // Never a reach: Fm x 3 3 1 x x as 2-3-1, the middle finger two frets from the
                // index, is not one of them, and a grip that is no suspension has none.
                expect(crowded(Fm)).toEqual([]);
                expect(crowded(F)).toEqual([]);
            });
            it('every shape that has them, pinned (#1691)', () => {
                const Ebsus2 = chord('x x 3 3 4 x', '2 5 R');
                const Esus4 = chord('0 2 2 2 0 0', 'R 5 R 4 5 R');
                const Asus4 = chord('x 0 2 2 3 0', 'R 5 R 4 5');
                // A finger added: a sus grip, open or closed.
                // And the index laid flat, as beside E♭m (#1691).
                expect(crowded(Ebsus2)).toEqual(['1-2-3', '1-1-3', '2-3-4', '1-2-4', '1-3-4']);
                expect(crowded(Esus4)).toEqual(['1-2-4', '1-3-4']);
                expect(crowded(Asus4)).toEqual(['1-2-4', '1-3-4']);
                // A finger lifted: any two-note grip with both fingers down.
                expect(crowded(Csus4)).toEqual(['1-3', '2-4', '1-4']);
                expect(crowded(Em)).toEqual(['1-3', '2-4', '1-4']);
                expect(crowded(C)).toEqual(['3-1', '4-2', '4-1']);
                // None: a barre, a reach, a grip already a fingertip each.
                for (const c of [Am, D, Dm, chord('x x 1 3 4 x', 'R 5 R')]) {
                    expect(crowded(c)).toEqual([]);
                }
                for (const c of [Ebsus2, Esus4, Asus4, Csus4, Em, C]) {
                    for (const o of taughtOptions(c.notes, STRUM)) {
                        if (crowded(c).includes(fingersOf(o.p))) {
                            expect(o.hold).toBe(2);
                        }
                    }
                }
            });
            it('and played where two fingers stay: E♭5 to E♭sus2, E to Esus4, Am to Asus4', () => {
                const Eb5 = chord('x x 1 3 4 x', 'R 5 R');
                const Ebsus2 = chord('x x 3 3 4 x', '2 5 R');
                expect(run(Eb5, Ebsus2, Eb5)).toEqual(['1-3-4', '2-3-4', '1-3-4']);
                const E = chord('0 2 2 1 0 0', 'R 5 R 3 5 R');
                const Esus4 = chord('0 2 2 2 0 0', 'R 5 R 4 5 R');
                expect(run(E, Esus4, E)).toEqual(['0-2-3-1-0-0', '0-2-3-4-0-0', '0-2-3-1-0-0']);
                const openAm = chord('x 0 2 2 1 0', 'R 5 R b3 5');
                const Asus4 = chord('x 0 2 2 3 0', 'R 5 R 4 5');
                expect(run(openAm, Asus4)).toEqual(['0-2-3-1-0', '0-2-3-4-0']);
            });
            it('only a suspension takes a finger added: Dm to B♭ is as it was', () => {
                // Dm x 5 3 2 x x (4-2-1) to B♭ x 5 3 3 x x shares two notes the same way, and
                // B♭ is the barre it is taught with, never 4-2-3 (#1617).
                const dm = chord('x 5 3 2 x x', 'R b3 5');
                const bb = chord('x 5 3 3 x x', '3 5 R');
                expect(run(dm, bb)).toEqual(['4-2-1', '3-1-1']);
                expect(crowded(bb)).toEqual([]);
                // The hold #1617 dropped stays dropped: D x x 4 2 3 x into Dm.
                expect(run(chord('x x 4 2 3 x', '3 5 R'), chord('x x 3 2 3 x', 'b3 5 R'))).toEqual([
                    '3-1-2',
                    '2-1-3',
                ]);
            });
            it('and only beside its own chord: the same grip as Gsus2 beside D is not 1-3-4', () => {
                // x x x 2 3 3 is Dsus4 and Gsus2. Beside D it shares the same two notes either
                // way, but as Gsus2 each has a new job: another chord, so its own fingering.
                const gsus2 = chord('x x x 2 3 3', '2 5 R');
                expect(run(D, gsus2)).toEqual(['1-3-2', '1-2-3']);
            });
            it('a finger lifted is any chord’s: Dm x x 3 2 3 x to D5 x x 0 2 3 x keeps both', () => {
                const dm = chord('x x 3 2 3 x', 'b3 5 R');
                const d5 = chord('x x 0 2 3 x', 'R 5 R');
                expect(run(dm, d5, dm)).toEqual(['2-1-3', '0-1-3', '2-1-3']);
                // One finger that stays is not two: D5 after A x x x 2 2 0 is never the
                // crowded 1-2. Since #1834 A is never 1-2 either, so D5 is 2-3, Dm minus a
                // finger (#1691): A's middle finger stays and the ring finger slides a fret.
                expect(run(chord('x x x 2 2 0', '5 R 3'), d5)).toEqual(['2-3-0', '0-2-3']);
            });
        });

        describe('a held finger does not take an open grip off the nut', () => {
            it('one held finger no longer leaves the index behind the nut', () => {
                // G♯m, C♯m, D♯7: C♯m was 2-3 for the middle finger and D♯7 2-3-4 after it.
                expect(
                    planned(
                        ['x x 1 1 0 x', 0, STRUM],
                        ['x x x 1 2 0', 0, STRUM],
                        ['x x 1 x 2 3', 4, SHELL],
                    ),
                ).toEqual(['1-2-0', '1-2-0', '1-2-3']);
                // A to Dmaj7 x x 0 x 2 2: 3-4 for the ring finger, now 1-2.
                expect(planned(['x x x 2 2 0', 0, STRUM], ['x x 0 x 2 2', 4, SHELL])).toEqual([
                    '2-3-0',
                    '0-1-2',
                ]);
                // A, Bm7♭5, A in frets 1–6: the last A was 3-4 (the three-string A; the real
                // one at the nut is whole, #1849).
                expect(
                    played(
                        GUITAR_TRIADS,
                        [1, 6],
                        undefined,
                        ['A', 'maj'],
                        ['B', 'm7b5'],
                        ['A', 'maj'],
                    ),
                ).toEqual(['x x x 2 2 0 [2-3-0]', 'x 2 0 2 x 1 [2-0-3-1]', 'x x x 2 2 0 [2-3-0]']);
            });
            it('each fingertip off its own fret asks for a finger that stays, up to two', () => {
                const holds = (tabs: string, root: number, opts: FingerOpts) =>
                    taughtOptions(notesOf(tabs, root), opts)
                        .filter((o) => o.needs && !o.adapts && !crowds(tabs, root, opts)(o))
                        .map((o) => `${fingersOf(o.p)}${MARK[o.needs!]}${o.hold}`);
                expect(holds('x x x 1 2 0', 0, STRUM)).toEqual(['2-3*2', '3-4*2']);
                expect(holds('x 3 2 0 x x', 0, STRUM)).toEqual(['2-1<2', '2-1>2', '4-3*2']);
                expect(holds('x 2 2 0 x x', 0, STRUM)).toEqual(['1-2<1', '1-2>1', '3-4*2']);
                expect(holds('x 2 0 0 x x', 0, STRUM)).toEqual(['1<1', '1>1', '3*1', '4*1']);
                // An open shell the same; a closed shell on the 1st fret is not asked.
                expect(holds('x x 0 x 2 2', 4, SHELL)).toEqual(['3-4*2']);
                expect(holds('x 1 x 2 3 x', 5, SHELL)).toEqual(['2-3-4*undefined']);
            });
            it('two fingers that stay still take it: Asus2 after F♯m7♭5', () => {
                // C into Am x 3 2 2 x x kept both as 2-1 into 2-1-1 until #1835: now C stays
                // 3-2 and Am takes the index, 3-2-1.
                expect(run(C, Am)).toEqual(['3-2-0', '3-2-1']);
                expect(planned(['2 x 2 2 1 x', 6, SHELL], ['x x 2 2 0 x', 0, STRUM])).toEqual([
                    '2-3-4-1',
                    '3-4-0',
                ]);
                // And a closed shell keeps #1611's one finger: F7 to B♭maj7.
                expect(planned(['1 x 1 2 x x', 6, SHELL], ['x 1 x 2 3 x', 5, SHELL])).toEqual([
                    '1-2-3',
                    '2-3-4',
                ]);
            });
            it('C beside F is 3-2: one finger kept is not reason to play it 2-1', () => {
                expect(run(C, F)[0]).toBe('3-2-0');
                expect(run(F, C)[1]).toBe('3-2-0');
                // The three-string grips: at the nut the real C and G are whole (#1849).
                const inC = played(
                    GUITAR_TRIADS,
                    [1, 6],
                    undefined,
                    ['C', 'maj'],
                    ['F', 'maj'],
                    ['C', 'maj'],
                    ['G', 'maj'],
                );
                expect(inC.filter((_, i) => i !== 1)).toEqual([
                    'x 3 2 0 x x [3-2-0]',
                    'x 3 2 0 x x [3-2-0]',
                    'x 2 0 0 x x [2-0-0]',
                ]);
                // One fingertip off its fret still takes one finger: Em into C, as it did.
                expect(run(Em, C)).toEqual(['1-2-0', '3-2-0']);
            });
        });

        describe('a fingering does not depend on how many bars a chord lasts', () => {
            it('F to Fm is the same a bar each and two bars each', () => {
                const [f, fm] = run(F, Fm);
                expect(run(F, F, Fm, Fm)).toEqual([f, f, fm, fm]);
                expect(run(F, F, F, Fm)).toEqual([f, f, f, fm]);
                expect([f, fm]).toEqual(['3-4-2', '3-4-1']);
            });
            it('across charts on both instruments: A B and A A B B agree', () => {
                const QUALITY: Quality[] = ['maj', 'min', 'sus4', 'sus2', 'five', 'dom7', 'm7'];
                const tabs = (x: string) => x.split(' [')[0];
                let compared = 0;
                for (const inst of [GUITAR, UKULELE]) {
                    for (const root of ['C', 'D', 'E♭', 'F', 'G', 'A', 'B♭']) {
                        for (const a of QUALITY) {
                            for (const b of QUALITY) {
                                if (a === b) {
                                    continue;
                                }
                                const once = played(inst, [1, 6], undefined, [root, a], [root, b]);
                                const twice = played(
                                    inst,
                                    [1, 6],
                                    undefined,
                                    [root, a],
                                    [root, a],
                                    [root, b],
                                    [root, b],
                                );
                                // Grip choice may differ with the length of a chart; where it
                                // does not, the fingers may not.
                                if (
                                    tabs(twice[0]) !== tabs(once[0]) ||
                                    tabs(twice[2]) !== tabs(once[1])
                                ) {
                                    continue;
                                }
                                compared++;
                                expect(twice, `${inst.name} ${root} ${a} ${b}`).toEqual([
                                    once[0],
                                    once[0],
                                    once[1],
                                    once[1],
                                ]);
                            }
                        }
                    }
                }
                expect(compared).toBeGreaterThan(400);
            });
        });

        describe('the leftovers of #1683, from a guitar teacher’s review (#1691)', () => {
            // The three-string grips these were reviewed on: at the nut the real guitar plays
            // the chords with an open form whole (#1849).
            const any = (...c: [string, Quality][]) => played(GUITAR_TRIADS, null, undefined, ...c);
            it('item 1: D5 and Dsus2 at the nut are the open D minus a finger, 1-3', () => {
                const d5 = chord('x x 0 2 3 x', 'R 5 R');
                const dsus2 = chord('x x x 2 3 0', '5 R 2');
                expect(run(d5)).toEqual(['0-1-3']);
                expect(run(dsus2)).toEqual(['1-3-0']);
                expect(run(chord('x x 0 2 3 0', 'R 5 R 2'))).toEqual(['0-1-3-0']);
                // A5 into D5 keeps the index on A.
                expect(any(['A', 'five'], ['D', 'five'])).toEqual([
                    'x 0 2 2 x x [0-1-1]',
                    'x x 0 2 3 x [0-1-3]',
                ]);
                // Beside B°, D5's ring finger is where D has it, and B° is never 2-4-3 for it.
                expect(any(['D', 'five'], ['B', 'dim'])[1]).toBe('x x 3 4 3 x [1-3-2]');
                // Dsus2 to Bm and back: the ring finger stays on D, and the index lifts.
                expect(any(['B', 'min'], ['D', 'sus2'], ['B', 'min'])).toEqual([
                    'x x x 4 3 2 [4-3-2]',
                    'x x x 2 3 0 [1-3-0]',
                    'x x x 4 3 2 [4-3-2]',
                ]);
                // 2-3 stays a second fingering: Dm minus a finger, both fingers kept.
                expect(run(chord('x x 0 2 3 1', 'R 5 R b3'), d5)).toEqual(['0-2-3-1', '0-2-3']);
            });
            it('item 2: C5 Csus4 C5 keeps the index in 3rd position; E E° E keeps the ring finger', () => {
                expect(any(['C', 'five'], ['C', 'sus4'], ['C', 'five'])).toEqual([
                    'x 3 5 5 x x [1-3-3]',
                    'x 3 3 0 x x [1-2-0]',
                    'x 3 5 5 x x [1-3-3]',
                ]);
                // The middle finger slides from B to B♭ along its string.
                expect(any(['E', 'maj'], ['E', 'dim'], ['E', 'maj'])).toEqual([
                    'x 2 2 1 x x [2-3-1]',
                    'x 1 2 0 x x [2-3-0]',
                    'x 2 2 1 x x [2-3-1]',
                ]);
                // The same beside the whole open E the real guitar plays (#1849).
                expect(
                    played(GUITAR, null, undefined, ['E', 'maj'], ['E', 'dim'], ['E', 'maj']),
                ).toEqual([
                    '0 2 2 1 0 0 [0-2-3-1-0-0]',
                    'x 1 2 0 x x [2-3-0]',
                    '0 2 2 1 0 0 [0-2-3-1-0-0]',
                ]);
                // An open chord a method drills keeps #1683's count: Am F C G, F to C is a
                // full change, C at 3-2, and C beside F is never 2-1.
                expect(any(['A', 'min'], ['F', 'maj'], ['C', 'maj'], ['G', 'maj'])).toEqual([
                    'x 3 2 2 x x [2-1-1]',
                    'x 3 3 2 x x [2-3-1]',
                    'x 3 2 0 x x [3-2-0]',
                    'x 2 0 0 x x [2-0-0]',
                ]);
                // Even where the index would only slide a fret along its string: C beside Cm7
                // x 3 1 3 x x stays 3-2, the ring finger kept, not 2-1 into Cm7's 2-1-3.
                const cm7 = { notes: chord('x 3 1 3 x x', 'R b3 b7').notes, rootBarre: true };
                expect(run(chord('x 3 2 0 x x', 'R 3 5'), cm7)).toEqual(['3-2-0', '3-1-4']);
            });
            it('item 3: no D-shape triad as 2-4-3, the little finger tucked over an idle index', () => {
                // G x x x 7 8 7 before Gmaj7 x x 5 x 7 7 kept the ring finger on B as 2-4-3.
                expect(played(GUITAR, [5, 10], undefined, ['G', 'maj'], ['G', 'maj7'])).toEqual([
                    'x x x 7 8 7 [1-2-1]',
                    'x x 5 x 7 7 [1-3-4]',
                ]);
                for (const tabs of ['x x x 2 3 2', 'x x x 5 6 5', 'x x 3 4 3 x', 'x x x 7 8 7']) {
                    const n = chord(tabs, '5 R 3');
                    expect(
                        taughtOptions(n.notes, STRUM).map((o) => fingersOf(o.p)),
                        tabs,
                    ).not.toContain('2-4-3');
                }
                // A little finger on the outside string is no knot: C♯+ x 4 3 2 x x keeps
                // D♭'s ring and little finger as 4-3-2.
                expect(run(chord('x 4 3 1 x x', 'R 3 5'), chord('x 4 3 2 x x', 'R 3 #5'))).toEqual([
                    '4-3-1',
                    '4-3-2',
                ]);
            });
            it('item 4: Dm Dsus2 Dm lays the index flat and keeps the ring finger, 1-1-3', () => {
                expect(any(['D', 'min'], ['D', 'sus2'], ['D', 'min'])).toEqual([
                    'x x 3 2 3 x [2-1-3]',
                    'x x 2 2 3 x [1-1-3]',
                    'x x 3 2 3 x [2-1-3]',
                ]);
                // Em Esus4 Em Esus2 in frets 2-7: the same shape two frets up.
                expect(
                    played(
                        GUITAR,
                        [2, 7],
                        undefined,
                        ['E', 'min'],
                        ['E', 'sus4'],
                        ['E', 'min'],
                        ['E', 'sus2'],
                    ),
                ).toEqual([
                    'x x 5 4 5 x [2-1-3]',
                    'x x 7 4 5 x [4-1-3]',
                    'x x 5 4 5 x [2-1-3]',
                    'x x 4 4 5 x [1-1-3]',
                ]);
                // Known limit: with no window it re-fingers both notes, since keeping them
                // needs the index two frets from the middle finger, a stretch no held note buys.
                expect(
                    any(['E', 'min'], ['E', 'sus4'], ['E', 'min'], ['E', 'sus2']).slice(2),
                ).toEqual(['x x x 4 5 3 [2-3-1]', 'x x x 4 5 2 [3-4-1]']);
                // Only the index lies flat, with no finger pulled two frets back: not 1-1-4.
                const crowdedDsus2 = crowded(chord('x x 2 2 3 x', '2 5 R'));
                expect(crowdedDsus2).toContain('1-1-3');
                expect(crowdedDsus2).not.toContain('1-1-4');
            });
            it('item 9: on a tie the held note is re-fingered late: Csus4 Csus2 A♭maj7', () => {
                // The three-string Csus4: the real one at the nut is x 3 3 0 1 1 (#1849).
                expect(
                    played(
                        GUITAR_TRIADS,
                        [1, 6],
                        [6, 5],
                        ['C', 'sus4'],
                        ['C', 'sus2'],
                        ['A♭', 'maj7'],
                        ['A♭', 'maj7'],
                    ),
                ).toEqual([
                    'x 3 3 0 x x [3-4-0]',
                    'x 3 0 0 x x [3-0-0]',
                    '4 3 5 x x x [2-1-3]',
                    '4 3 5 x x x [2-1-3]',
                ]);
            });
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
    it('guitar unlocked C Am F G takes the open chords', () => {
        // The book's whole C, Am and G since #1849 (they were x 3 2 0 x x, x 3 2 2 x x and
        // x 2 0 0 x x); F has no open form and takes the top of the small F x x 3 2 1 1.
        expect(tabs(GUITAR, ['C', 'Am', 'F', 'G'], null)).toEqual([
            'x 3 2 0 1 0',
            'x 0 2 2 1 0',
            'x x 3 2 1 x',
            '3 2 0 0 0 3',
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
        // Four strings is a ukulele grip, fingered as `voiceChart` fingers one.
        assignFingers(notes, { barre, ukulele: notes.length === 4 });
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
    it('uke D 2220 is a fingertip each: a barre there would lie on the open A string (#1681)', () => {
        expect(fingered('2 2 2 0', 3)).toBe('1 2 3 0');
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
    it('a chart of closed triads takes barres; a ii–V–I of guitar shells does not', () => {
        const pop = voiceChart(chart(['C', 'G', 'Am', 'F']), { instrument: GUITAR, home: [2, 7] });
        expect(pop.some((v) => barres(v.notes).length > 0)).toBe(true);
        const iiVI = (inst: InstrumentDef) =>
            voiceChart(chart(['Dm7', 'G7', 'Cmaj7']), { instrument: inst, home: [2, 7] });
        expect(iiVI(GUITAR).every((v) => barres(v.notes).length === 0)).toBe(true);
        // A ukulele's 7th chords are strummed across every string and bar as its triads do
        // (#1681): Dm7 5 5 5 5 is one finger.
        expect(
            iiVI(UKULELE).map(
                (v) => `${tab(UKULELE, v)} [${v.notes.map((n) => n.finger).join('-')}]`,
            ),
        ).toEqual(['5 5 5 5 [1-1-1-1]', '4 5 3 5 [2-3-1-4]', '4 4 3 3 [2-3-1-1]']);
    });
    it('a barre that gives way to one note it was on stays down (#1683)', () => {
        // G x x x 4 3 3 (2-1-1) to Em x x x 4 5 3 (2-3-1): the index stays on the 1st string.
        const [g, em] = voiceChart(chart(['G', 'Em', 'C', 'D']), {
            instrument: GUITAR,
            home: [2, 7],
        });
        expect([g, em].map((v) => v.notes.map((n) => n.finger).join('-'))).toEqual([
            '2-1-1',
            '2-3-1',
        ]);
        const moves = fingerMoves(GUITAR, g, em).moves;
        expect(moves.map((m) => `${m.finger} ${m.kind}`)).toEqual(['1 hold', '2 hold', '3 move']);
        const index = moves[0];
        expect([index.from?.string, index.to?.string, index.to?.fret]).toEqual([1, 1, 3]);
        expect(index.barre).toBeUndefined();
        // Back again the index is laid across two strings: that is a move, and named.
        expect(fingerMoves(GUITAR, em, g).moves[0]).toMatchObject({ finger: 1, kind: 'move' });
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
    it('names the path on the neck, not the interval', () => {
        const a = build(GUITAR, shape(GUITAR, '6A'), R('C'), 'm7'); // 8th fret, 6th string
        const b = build(GUITAR, shape(GUITAR, '5A'), R('F'), 'dom7'); // 8th fret, 5th string
        const m = rootMove(GUITAR, a!, b!);
        expect(m.geometry).toBe('moves one string over, same fret');
        expect(m.straightAcross).toBe(true);
    });
});

describe('a tie between two fingerings falls by order, never by float rounding (#1691)', () => {
    it('B♭7 and A♭m7 in frets 2–7 keep the finger the plan reaches first', () => {
        // Two plans cost exactly the same here: B♭7 6-x-6-7 as 1-2-3 then A♭m7 as 2-1-3, or
        // 2-3-4 then 3-1-4; both keep a finger on the 4th string's 6th fret. Taking a run's own
        // cost off and putting it back left the two a rounding error apart, which chose.
        const chart = 'Bm Bsus2 F#maj7 Ebm Ebm Dbsus4 Dbsus4 Bb7 Abm7 Abm7 Fm7b5'
            .split(' ')
            .map((symbol) =>
                voicingChord(parseChord(symbol, { tonic: 0, minor: false })!, 'C', false),
            );
        const voiced = voiceChart(chart, { instrument: GUITAR, home: [2, 7] });
        const fingers = (i: number) =>
            voiced[i].notes.map((n) => `${n.string}:${n.fret}:${n.finger}`).join(' ');
        expect(fingers(7)).toBe('6:6:2 4:6:3 3:7:4');
        expect(fingers(8)).toBe('4:6:3 3:4:1 2:7:4');
    });
});

describe('7sus4 and m6 are shells of their own (#1817)', () => {
    // They were reduced to a dominant 7 and a m7, with a notice: Wonderwall's A7sus4 showed
    // A7's C♯ where the song has a D. A shell's 3rd seat holds the 4th, as a sus triad's does,
    // and its 7th seat the 6th, as `six` does.
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    /** Each grip of a chart as `frets [fingers]`, fingers for the strings it sounds, low first. */
    const played = (
        inst: InstrumentDef,
        names: string,
        home: [number, number] | null,
        rootStrings?: number[],
    ) =>
        voiceChart(chart(names), { instrument: inst, home, rootStrings }).map((v) => {
            const low = [...v.notes].sort((a, b) => b.string - a.string);
            return `${tab(inst, v)} [${low.map((n) => n.finger).join('-')}]`;
        });
    const NUT: ([number, number] | null)[] = [[1, 6], null];

    it('the ukulele plays the book grips at the nut: A7sus4 0 2 0 0, G7sus4, C7sus4, E7sus4', () => {
        for (const home of NUT) {
            for (const inst of [UKULELE, UKULELE_LOW_G]) {
                expect(played(inst, 'A7sus4', home)).toEqual(['0 2 0 0 [0-2-0-0]']);
                expect(played(inst, 'G7sus4', home)).toEqual(['0 2 1 3 [0-2-1-3]']);
                // The index across the E and A strings, as the charts print it.
                expect(played(inst, 'C7sus4', home)).toEqual(['0 0 1 1 [0-0-1-1]']);
                expect(played(inst, 'E7sus4', home)).toEqual(['2 2 0 2 [1-2-0-3]']);
            }
        }
    });
    it('and the m6 grips: Dm6 2 2 1 2, Gm6 0 2 0 1, and Am6 2 4 2 3', () => {
        for (const home of NUT) {
            expect(played(UKULELE, 'Dm6', home)).toEqual(['2 2 1 2 [2-3-1-4]']);
            expect(played(UKULELE, 'Gm6', home)).toEqual(['0 2 0 1 [0-2-0-1]']);
            // 2 4 2 3 is the Am6 ukutabs and kytary print (read 2026-10-20), and the F♯m7♭5
            // grip: the four shells play every m6 with its 5th as the helper. 2 0 2 0, which
            // leaves the 5th out and doubles the root, is a variant they do not print, and no
            // shape holds it. Both chords are fingered as the charts print them (#1823, a
            // `UKE_BOOK` row): 1-3-1-2, the index across the G and E strings under the ring
            // finger, the middle on the A string. Alone the costs gave 1-4-2-3.
            for (const inst of [UKULELE, UKULELE_LOW_G]) {
                expect(played(inst, 'Am6', home)).toEqual(['2 4 2 3 [1-3-1-2]']);
                expect(played(inst, 'F#m7b5', home)).toEqual(['2 4 2 3 [1-3-1-2]']);
            }
        }
    });
    it('a grip is named for the shell it plays, with that shell’s degrees: A7sus4, Am6', () => {
        const [sus, six, nine] = voiceChart(chart('A7sus4 Am6 A9sus4'), {
            instrument: UKULELE,
            home: [1, 6],
        });
        expect(sus.symbol).toBe('A7sus4');
        expect(six.symbol).toBe('Am6');
        // The shell's name, not the chart's: the 9th is not played, as C9's grip is C7's.
        expect(nine.symbol).toBe('A7sus4');
        const degrees = (v: Voicing) =>
            v.notes.map((n) => `${spellDegree(v.root, n.degree)}:${n.degree}`).join(' ');
        expect(degrees(sus)).toBe('G:b7 D:4 E:5 A:R');
        expect(degrees(six)).toBe('A:R E:5 F♯:6 C:b3');
    });
    it('beside their neighbours the ukulele keeps the hand: Wonderwall, A7sus4 A7, Gm Gm6 D7', () => {
        for (const home of NUT) {
            // Dsus4 to A7sus4 keeps the index on the C string's D, a tone of both chords.
            expect(played(UKULELE, 'Em7 G Dsus4 A7sus4 C', home)).toEqual([
                '0 2 0 2 [0-1-0-2]',
                '0 2 3 2 [0-1-3-2]',
                '0 2 3 0 [0-1-2-0]',
                '0 2 0 0 [0-1-0-0]',
                '0 0 0 3 [0-0-0-3]',
            ]);
            // The 4th falls a fret to the 3rd.
            expect(played(UKULELE, 'A7sus4 A7', home)).toEqual([
                '0 2 0 0 [0-2-0-0]',
                '0 1 0 0 [0-1-0-0]',
            ]);
            expect(played(UKULELE, 'Gm Gm6 D7', home)).toEqual([
                '0 2 3 1 [0-2-3-1]',
                '0 2 0 1 [0-2-0-1]',
                '2 2 2 3 [1-1-1-2]',
            ]);
            // Am's middle finger gives way to the index barre: Am 2 0 0 0 is fingered from
            // the nut (the middle finger on the 2nd fret), and only a finger already down may
            // keep the index there (`needs: 'left'`), as Am6 Am does.
            expect(played(UKULELE, 'Am Am6 Am', home)).toEqual([
                '2 0 0 0 [2-0-0-0]',
                '2 4 2 3 [1-3-1-2]',
                '2 0 0 0 [1-0-0-0]',
            ]);
            // Into E7 and from Dm the grips are the book's, each in its book fingering.
            expect(played(UKULELE, 'Am6 E7', home)).toEqual([
                '2 4 2 3 [1-3-1-2]',
                '1 2 0 2 [1-2-0-3]',
            ]);
            expect(played(UKULELE, 'Dm Am6', home)).toEqual([
                '2 2 1 0 [2-3-1-0]',
                '2 4 2 3 [1-3-1-2]',
            ]);
            // The ii of a minor ii–V–i keeps the book fingering beside its neighbours.
            expect(played(UKULELE, 'Cmaj7 F#m7b5 B7 Em', home)).toEqual([
                '0 0 0 2 [0-0-0-2]',
                '2 4 2 3 [1-3-1-2]',
                '2 3 2 2 [1-2-1-1]',
                '0 4 3 2 [0-3-2-1]',
            ]);
        }
    });
    it('the guitar plays three-note shells, R–4–♭7 and R–♭3–6, on 6th- and 5th-string roots', () => {
        for (const home of [
            [1, 6],
            [2, 7],
        ] as [number, number][]) {
            // R–6–♭3, a finger per fret, as A6 and A7 are fingered on the same strings.
            expect(played(GUITAR, 'Am6', home)).toEqual(['5 x 4 5 x x [2-1-3]']);
        }
        // The R–7–3 shape with its 3rd up a fret (G7 is 3 x 3 4 x x). In frets 1–6 a shell is
        // aimed at the nut since #1851, and G7sus4 takes the R–4–♭7 grip a fret lower.
        expect(played(GUITAR, 'G7sus4', [2, 7])).toEqual(['3 x 3 5 x x [1-2-3]']);
        expect(played(GUITAR, 'G7sus4', [1, 6])).toEqual(['3 3 3 x x x [1-2-3]']);
        // The R–3–7 shape with its 3rd up a fret (A7 is 5 4 5 x x x), and Dm6's R–6–♭3. At the
        // nut both are the book's open chords (#1838).
        expect(played(GUITAR, 'A7sus4', [2, 7])).toEqual(['5 5 5 x x x [1-2-3]']);
        expect(played(GUITAR, 'Dm6', [2, 7])).toEqual(['x 5 x 4 6 x [2-1-3]']);
        expect(played(GUITAR, 'A7sus4', [1, 6])).toEqual(['x 0 2 0 3 0 [0-2-0-3-0]']);
        expect(played(GUITAR, 'Dm6', [1, 6])).toEqual(['x x 0 2 0 1 [0-2-0-1]']);
        const classic = (names: string) => played(GUITAR, names, [2, 7], [6, 5]);
        expect(classic('Gm6')).toEqual(['3 x 2 3 x x [2-1-3]']);
        // Beside its own 7 the 7sus4 keeps the root and ♭7 fingers down (#1825, below).
        expect(classic('A7sus4 A7')).toEqual(['5 5 5 x x x [2-3-4]', '5 4 5 x x x [2-1-4]']);
        expect(classic('C7sus4')).toEqual(['x 3 x 3 6 x [1-2-4]']);
        expect(classic('Gm Gm6 D7')).toEqual([
            'x 5 5 3 x x [3-3-1]',
            '3 x 2 3 x x [2-1-3]',
            'x 5 4 5 x x [2-1-3]',
        ]);
    });
    it('a guitar 7sus4 is never three open strings: Wonderwall in frets 1–6 stays where A7’s did', () => {
        // A7sus4 x 0 0 0 x x frets nothing, and offered it took the chart onto the open strings
        // (Em7 0 x 0 0 x x, G x 2 0 0 x x, Dsus4 x 0 0 0 x x). It is a last resort
        // (`openStrum`). Since #1838 the 7ths at the nut are the book's open chords, so
        // Wonderwall is Em7 0 2 0 0 0 0 and A7sus4 x 0 2 0 3 0, A7's grip with the ring finger
        // up a fret, and E7sus4 between two Es 0 2 0 2 0 0. Since #1849 G, C and Dsus4 are
        // the book's whole open chords too (they were x 2 0 0 x x, x 3 2 0 x x and x 5 5 2 x x).
        const grips = (names: string) => played(GUITAR, names, [1, 6]).map((g) => g.split(' [')[0]);
        expect(grips('Em7 G Dsus4 A7sus4 C Dsus4 A7sus4')).toEqual([
            '0 2 0 0 0 0',
            '3 2 0 0 0 3',
            'x x 0 2 3 3',
            'x 0 2 0 3 0',
            'x 3 2 0 1 0',
            'x x 0 2 3 3',
            'x 0 2 0 3 0',
        ]);
        expect(grips('Em7 G Dsus4 A7 C Dsus4 A7')[3]).toBe('x 0 2 0 2 0');
        expect(grips('E E7sus4 E')[1]).toBe('0 2 0 2 0 0');
        for (const home of [null, [1, 6], [2, 7]] as ([number, number] | null)[]) {
            for (const names of ['A7sus4', 'E7sus4', 'Am A7sus4 D', 'E7sus4 E7 A', 'Em7 A7sus4']) {
                const voiced = voiceChart(chart(names), { instrument: GUITAR, home });
                for (const v of voiced.filter((g) => g.quality === '7sus4')) {
                    const where = `${names}: ${v.symbol} ${tab(GUITAR, v)}`;
                    expect(
                        v.notes.some((n) => n.fret > 0),
                        where,
                    ).toBe(true);
                }
            }
        }
    });
    it('the guitar holds shared notes into A7sus4: Dsus4 A7sus4 keeps fingers 3 and 4 on D and G', () => {
        // Up the neck A7sus4 x 0 x 0 3 x rang its skipped 4th string (#1850), so it is the
        // closed shell, and Dsus4 sits on the same strings to keep two fingers into it. It was
        // x x 5 2 3 x [4-1-2] to x 0 x 0 3 x [0-0-2], the middle finger on D.
        expect(played(GUITAR, 'Dsus4 A7sus4', [2, 7])).toEqual([
            'x 5 5 2 x x [3-4-1]',
            '5 5 5 x x x [2-3-4]',
        ]);
    });
    describe('a guitar 7sus4 and its own 7 keep the root and the ♭7 down (#1825)', () => {
        // On the R–3–♭7 shapes the 7sus4 is 1-2-3 alone and the 7 is 2-1-3, so the root
        // changed finger between them. A teacher plays the 7sus4 2-3-4 and the 7 2-1-4: the
        // root and ♭7 fingers stay, the ring finger lifts off the 4th and the index takes the
        // 3rd a fret below it. That 7 is 3.2 dearer than its cheapest, a crowded hand
        // (`suspensionOptions`), offered only beside its suspension.
        it('both ways, on the 6th-, 5th- and 4th-string roots', () => {
            // Up the neck. At the nut these are the book's open chords (#1838), below.
            expect(played(GUITAR, 'A7 A7sus4 A7', [2, 7])).toEqual([
                '5 4 5 x x x [2-1-4]',
                '5 5 5 x x x [2-3-4]',
                '5 4 5 x x x [2-1-4]',
            ]);
            expect(played(GUITAR, 'A7sus4 A7', [2, 7])).toEqual([
                '5 5 5 x x x [2-3-4]',
                '5 4 5 x x x [2-1-4]',
            ]);
            expect(played(GUITAR, 'D7sus4 D7 G', [2, 7])).toEqual([
                'x 5 5 5 x x [2-3-4]',
                'x 5 4 5 x x [2-1-4]',
                'x 5 5 4 x x [2-3-1]',
            ]);
            expect(played(GUITAR, 'G7sus4 G7 C', [2, 7])).toEqual([
                'x x 5 5 6 x [2-3-4]',
                'x x 5 4 6 x [2-1-4]',
                'x x 5 5 5 x [1-1-1]',
            ]);
            expect(played(GUITAR, 'E7sus4 E7 A', [2, 7])).toEqual([
                'x 7 7 7 x x [2-3-4]',
                'x 7 6 7 x x [2-1-4]',
                'x 7 7 6 x x [2-3-1]',
            ]);
        });
        it('where the cheapest fingerings already keep both, nothing changes', () => {
            // The R–♭7–3 shape: the 4th falls a fret under the same finger.
            expect(played(GUITAR, 'G7sus4 G7', [2, 7])).toEqual([
                '3 x 3 5 x x [1-2-3]',
                '3 x 3 4 x x [1-2-3]',
            ]);
            // The book's open chords at the nut (#1838): the middle finger stays, the ring
            // finger moves a fret along its string (A7sus4 to A7) or the index takes the 3rd
            // (E7sus4 to E7).
            for (const home of [[1, 6], null] as ([number, number] | null)[]) {
                expect(played(GUITAR, 'A7 A7sus4 A7', home)).toEqual([
                    'x 0 2 0 2 0 [0-2-0-3-0]',
                    'x 0 2 0 3 0 [0-2-0-3-0]',
                    'x 0 2 0 2 0 [0-2-0-3-0]',
                ]);
                // A is the open A since #1849, 1-2-3.
                expect(played(GUITAR, 'E7sus4 E7 A', home)).toEqual([
                    '0 2 0 2 0 0 [0-2-0-3-0-0]',
                    '0 2 0 1 0 0 [0-2-0-1-0-0]',
                    'x 0 2 2 2 0 [0-1-2-3-0]',
                ]);
                expect(played(GUITAR, 'D7sus4 D7', home)).toEqual([
                    'x x 0 2 1 3 [0-2-1-3]',
                    'x x 0 2 1 2 [0-2-1-3]',
                ]);
            }
        });
        it('a neighbour takes a taught fingering that keeps the root for it', () => {
            // Am7 5 x 5 5 as 2-3-4, the root under the middle finger, a taught fingering of the shape.
            // In frets 2–7: at the nut all four are the book's open chords (#1838).
            expect(played(GUITAR, 'Am7 A7sus4 A7 Dmaj7', [2, 7])).toEqual([
                '5 x 5 5 x x [2-3-4]',
                '5 5 5 x x x [2-3-4]',
                '5 4 5 x x x [2-1-4]',
                'x 5 4 6 x x [2-1-3]',
            ]);
        });
        it('only the suspension, on one string: a 6, m7 or maj7 beside its 7 keeps its fingering', () => {
            // Each differs from the 7 by one note a fret along its own string, on one root, as
            // the 4th and the 3rd do. Offered beside them as well, the crowded fingering
            // re-handed both chords: F♯6 2-1-4 into F♯7 2-3-4, A7 3-2-4 into Am7 3-1-4, A7 and
            // Amaj7 1-3-4.
            expect(played(GUITAR, 'F#6 F#7 Csus4 Ebm G6 G+ G+', null).slice(0, 2)).toEqual([
                '2 x 1 3 x x [2-1-3]',
                '2 x 2 3 x x [1-2-3]',
            ]);
            expect(played(GUITAR, 'Cdim7 Cm A7 Am7 A Gm F#dim', [5, 10]).slice(2, 4)).toEqual([
                'x x 7 6 8 x [2-1-3]',
                'x x 7 5 8 x [2-1-3]',
            ]);
            expect(played(GUITAR, 'Adim Am7b5 A7 Amaj7 A+', [5, 10]).slice(2, 4)).toEqual([
                'x x 7 x 8 9 [1-2-3]',
                'x x 7 x 9 9 [1-2-3]',
            ]);
            // And only on one string: E7 x x 2 x 3 4 has its 3rd on the 1st string, E7sus4
            // x x 2 2 3 x its 4th on the 3rd, another hand. Offered, E7 took 1-3-4, the middle
            // finger idle, to keep the index and ring finger into it.
            expect(played(GUITAR, 'Bb6 Ab7 Eb+ E7 E7sus4 E5 Ebdim', [2, 7]).slice(3, 5)).toEqual([
                'x x 2 x 3 4 [1-2-3]',
                'x x 2 2 3 x [1-2-3]',
            ]);
        });
        it('two crowded fingerings never justify each other', () => {
            // Each beside the other in its own crowded 1-3-4, B7sus4 and B7 kept A on the ring
            // finger into F; a crowded shell's neighbour takes a fingering of its own accord.
            expect(played(GUITAR, 'Bdim Bsus4 B7sus4 B7 F', [5, 10]).slice(2, 4)).toEqual([
                '7 x 7 9 x x [1-2-3]',
                '7 x 7 8 x x [1-2-3]',
            ]);
        });
    });
});

describe('a ukulele add9 plays its 9th in the seat the triad doubles (#1820)', () => {
    // It was the plain triad, with a notice: Cadd9 was C 0 0 0 3. A ukulele triad doubles one
    // tone to fill four strings; the 9th takes that string, as the chord charts print it
    // (Kytary and UkuTabs, read 2026-10-20). The guitar's three-string triads have none spare.
    const chart = (names: string, inst: InstrumentDef) =>
        names
            .split(' ')
            .map((s) =>
                voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false, '', inst),
            );
    /** Each grip of a chart as `frets [fingers]`, fingers for the strings it sounds, low first. */
    const played = (inst: InstrumentDef, names: string, home: [number, number] | null) =>
        voiceChart(chart(names, inst), { instrument: inst, home }).map((v) => {
            const low = [...v.notes].sort((a, b) => b.string - a.string);
            return `${tab(inst, v)} [${low.map((n) => n.finger).join('-')}]`;
        });
    const NUT: ([number, number] | null)[] = [[1, 6], null];

    it('at the nut every root takes the grip the charts print, with the book fingering', () => {
        const BOOK: Record<string, string> = {
            C: '0 2 0 3 [0-2-0-3]',
            Db: '1 3 1 4 [1-3-1-4]',
            D: '2 4 2 5 [1-3-1-4]',
            Eb: '0 3 1 1 [0-3-1-1]',
            // The books lay the middle finger across the E and A strings (1-4-2-2); a ukulele
            // barre is the index's or the ring finger's (`barreOptions`), so here it is a
            // fingertip each.
            E: '1 4 2 2 [1-4-2-3]',
            F: '0 0 1 0 [0-0-1-0]',
            'F#': '1 1 2 1 [1-1-2-1]',
            // Kytary's grip, and UkuTabs's easier one. UkuTabs leads with 0 2 5 2, which frets
            // past the 4th fret, so at the nut it gives way to this one (`firstPosition`).
            G: '2 2 3 2 [1-1-2-1]',
            Ab: '3 3 4 3 [1-1-2-1]',
            A: '2 1 0 2 [2-1-0-3]',
            Bb: '3 2 1 3 [3-2-1-4]',
            B: '4 3 2 4 [3-2-1-4]',
        };
        for (const home of NUT) {
            for (const inst of [UKULELE, UKULELE_LOW_G]) {
                for (const [root, grip] of Object.entries(BOOK)) {
                    expect(played(inst, `${root}add9`, home), `${root}add9`).toEqual([grip]);
                }
            }
        }
    });
    it('is named an add9, with its 9th as a degree of its own and no notice', () => {
        const [v] = voiceChart(chart('Cadd9', UKULELE), { instrument: UKULELE, home: [1, 6] });
        expect(v.symbol).toBe('Cadd9');
        expect(v.approximation).toBeNull();
        const degrees = v.notes.map((n) => `${spellDegree(v.root, n.degree)}:${n.degree}`);
        expect(degrees.join(' ')).toBe('G:5 D:9 E:3 C:R');
    });
    it('beside its neighbours: C Cadd9 C, G Cadd9 D, Cadd9 G D Em, F Fadd9, G Gadd9 G', () => {
        for (const home of NUT) {
            // One finger added, the ring finger staying on the A string.
            expect(played(UKULELE, 'C Cadd9 C', home)).toEqual([
                '0 0 0 3 [0-0-0-3]',
                '0 2 0 3 [0-2-0-3]',
                '0 0 0 3 [0-0-0-3]',
            ]);
            expect(played(UKULELE, 'G Cadd9 D', home)).toEqual([
                '0 2 3 2 [0-1-3-2]',
                '0 2 0 3 [0-2-0-3]',
                '2 2 2 0 [1-2-3-0]',
            ]);
            // From Csus2 0 2 3 3 (0-1-2-3) the middle finger lifts, index and ring staying:
            // the book's second fingering (`UKE_BOOK`).
            expect(played(UKULELE, 'Csus2 Cadd9 C', home)).toEqual([
                '0 2 3 3 [0-1-2-3]',
                '0 2 0 3 [0-1-0-3]',
                '0 0 0 3 [0-0-0-3]',
            ]);
            // Into G the index stays on the C string's D. Between G and D (above) the D changes
            // finger once whichever fingering Cadd9 takes, G holding it with the index and D
            // with the middle finger, so it keeps its default.
            expect(played(UKULELE, 'Cadd9 G D Em', home)).toEqual([
                '0 2 0 3 [0-1-0-3]',
                '0 2 3 2 [0-1-3-2]',
                '2 2 2 0 [1-2-3-0]',
                '0 4 3 2 [0-3-2-1]',
            ]);
            // F with the middle finger lifted.
            expect(played(UKULELE, 'F Fadd9', home)).toEqual([
                '2 0 1 0 [2-0-1-0]',
                '0 0 1 0 [0-0-1-0]',
            ]);
            // From G its three fingers stay and the index lies across the G and C strings.
            expect(played(UKULELE, 'G Gadd9 G', home)).toEqual([
                '0 2 3 2 [0-1-3-2]',
                '2 2 3 2 [1-1-3-2]',
                '0 2 3 2 [0-1-3-2]',
            ]);
            expect(played(UKULELE, 'A Aadd9', home)).toEqual([
                '2 1 0 0 [2-1-0-0]',
                '2 1 0 2 [2-1-0-3]',
            ]);
        }
    });
    it('up the neck it takes the charts’ other grips of the same shapes', () => {
        expect(played(UKULELE, 'Cadd9', [2, 7])).toEqual(['5 4 3 5 [3-2-1-4]']);
        expect(played(UKULELE, 'Cadd9', [5, 10])).toEqual(['7 7 8 7 [1-1-2-1]']);
        expect(played(UKULELE, 'Gadd9', [5, 10])).toEqual(['7 9 7 10 [1-3-1-4]']);
        expect(played(UKULELE, 'Dadd9', [5, 10])).toEqual(['7 6 5 7 [3-2-1-4]']);
        expect(played(UKULELE, 'F Fadd9', [7, 12])).toEqual([
            '10 9 8 8 [3-2-1-1]',
            '10 9 8 10 [3-2-1-4]',
        ]);
    });
    it('the guitar keeps the plain triad and says so', () => {
        const grips = (vs: Voicing[]) =>
            vs.map((v) => `${v.symbol} ${tab(GUITAR, v)} ${v.notes.map((n) => n.finger)}`);
        for (const home of [null, [1, 6], [2, 7]] as ([number, number] | null)[]) {
            for (const [add, plain] of [
                ['Cadd9', 'C'],
                ['G Cadd9 D', 'G C D'],
                ['Cadd9 G D Em', 'C G D Em'],
                ['F Fadd9', 'F F'],
            ]) {
                const voiced = voiceChart(chart(add, GUITAR), { instrument: GUITAR, home });
                const triad = voiceChart(chart(plain, GUITAR), { instrument: GUITAR, home });
                expect(grips(voiced), `${add} in ${home}`).toEqual(grips(triad));
            }
        }
        const [c] = chart('Cadd9', GUITAR);
        expect(c.quality).toBe('maj');
        expect(c.approximation).toMatch(/plain major triad \(the added 9 is not played\)/);
    });
    it('only an add9 takes the shapes with a 9th, and it takes no others', () => {
        for (const q of Object.keys(QUALITIES) as Quality[]) {
            const shapes = allowedShapes(UKULELE, undefined, q);
            const ninth = shapes.filter((sh) => sh.voices.some(([, role]) => role === 'N'));
            expect(ninth.length > 0, q).toBe(q === 'add9');
            if (q === 'add9') {
                expect(shapes).toEqual(ninth);
            }
        }
    });
});

describe('a guitar triad that frets nothing is a last resort (#1822)', () => {
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    const grips = (names: string, home: [number, number] | null, rootStrings?: number[]) =>
        voiceChart(chart(names), { instrument: GUITAR, home, rootStrings }).map((v) =>
            tab(GUITAR, v),
        );

    it('a teacher puts a finger down: the open chord, or the closed grip', () => {
        // Em x x x 0 0 0 took E onto the top strings beside it; with a finger down it was the
        // open Em's top, beside the open E's, and since #1849 it is the whole open Em and E.
        expect(grips('E Em E', [1, 6])).toEqual(['0 2 2 1 0 0', '0 2 2 0 0 0', '0 2 2 1 0 0']);
        // G x x 0 0 0 x was a lift from G+ x x 1 0 0 x; G kept a finger on its B (x 2 0 0 x x),
        // and is the whole open G since #1849.
        expect(grips('G+ G G+', [1, 6])).toEqual(['x 2 1 0 x x', '3 2 0 0 0 3', 'x 2 1 0 x x']);
        // Gsus2 x 0 0 0 x x is the closed grip on Gm's strings, the 3rd down a fret to the 2nd.
        // Since #1827 the top strings, Gm the top of its 3rd-fret barre (it was x x 5 3 3 x /
        // x x 5 2 3 x, aimed at the window's middle).
        expect(grips('Gm Gsus2 Gm', [1, 6])).toEqual(['x x x 3 3 3', 'x x x 2 3 3', 'x x x 3 3 3']);
        expect(grips('A Asus4 Asus2 Edim Ebsus2 D5 G', [1, 6]).at(-1)).toBe('3 2 0 0 0 3');
    });

    it('no guitar triad is voiced on open strings alone, in any window', () => {
        const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const SUFFIXES = ['', 'm', 'sus2', 'sus4', '5', 'dim', '+'];
        const homes: ([number, number] | null)[] = [null, [1, 6], [2, 7]];
        const charts = ROOTS.flatMap((r) =>
            SUFFIXES.flatMap((a) => [
                r + a,
                ...SUFFIXES.filter((b) => b !== a).map((b) => `${r + a} ${r + b} ${r + a}`),
            ]),
        );
        let checked = 0;
        for (const home of homes) {
            for (const rootStrings of [undefined, [6, 5]]) {
                for (const names of charts) {
                    for (const g of grips(names, home, rootStrings)) {
                        expect(/[1-9]/.test(g), `${names} in ${home}: ${g}`).toBe(true);
                        checked++;
                    }
                }
            }
        }
        expect(checked).toBe(9576);
    });

    it('the open shells are left to their own rules, and the ukulele’s all-open grips stay', () => {
        // A7 x 0 x 0 2 x skips a string: a shell on its open root, not three open strings, so
        // this rule never touched it. Re-aimed by #1850: up the neck its skipped string rings
        // with no finger beside it (`ringsASkippedString`), so frets 2–7 play the closed
        // shells; at the nut a 7th chord plays the book's open chord (#1838).
        expect(grips('A7sus4 A7 D', [2, 7])).toEqual(['5 5 5 x x x', '5 4 5 x x x', 'x 5 4 2 x x']);
        expect(grips('Em7 A7 Dmaj7', [1, 6])).toEqual([
            '0 2 0 0 0 0',
            'x 0 2 0 2 0',
            'x x 0 2 2 2',
        ]);
        // A ukulele strums every string, and its C6 and Am7 0 0 0 0 are book grips.
        for (const inst of [UKULELE, UKULELE_LOW_G]) {
            for (const names of ['C6', 'Am7', 'C C6 C']) {
                const voiced = voiceChart(chart(names), { instrument: inst, home: [1, 6] });
                expect(
                    voiced.some((v) => tab(inst, v) === '0 0 0 0'),
                    names,
                ).toBe(true);
            }
        }
    });
});

describe('up the neck, a grip that rings a skipped string is a last resort (#1850)', () => {
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    const grips = (
        inst: InstrumentDef,
        names: string,
        home: [number, number] | null,
        rootStrings?: number[],
    ) => voiceChart(chart(names), { instrument: inst, home, rootStrings }).map((v) => tab(inst, v));
    /** A muted string between two sounding ones, with no fretted note beside it to mute it. */
    const rings = (g: string) => {
        const t = g.split(' ');
        const sounding = t.flatMap((f, i) => (f === 'x' ? [] : [i]));
        const fretted = (i: number) => t[i] !== 'x' && t[i] !== '0';
        return t.some(
            (f, i) =>
                f === 'x' &&
                i > sounding[0] &&
                i < sounding.at(-1)! &&
                !fretted(i - 1) &&
                !fretted(i + 1),
        );
    };

    it('in frets 2–7 the open-root shells give way to closed ones', () => {
        // A7 x 0 x 0 2 x, A7sus4 x 0 x 0 3 x, Em7 0 x 0 0 x x and E7sus4 0 x 0 2 x x left the
        // 4th or 5th string ringing with an open string on each side of it.
        expect(grips(GUITAR, 'A7sus4 A7 D', [2, 7])).toEqual([
            '5 5 5 x x x',
            '5 4 5 x x x',
            'x 5 4 2 x x',
        ]);
        // The 6th- and 5th-string shells a comper alternates: it was 0 x 0 0 x x /
        // x 0 x 0 2 x / x x 0 x 2 2.
        expect(grips(GUITAR, 'Em7 A7 Dmaj7', [2, 7])).toEqual([
            'x 7 5 7 x x',
            '5 x 5 6 x x',
            'x 5 4 6 x x',
        ]);
        expect(grips(GUITAR, 'E7sus4 B5 E+', [2, 7])).toEqual([
            'x x 2 2 3 x',
            'x 2 4 4 x x',
            'x 7 6 5 x x',
        ]);
        // With the roots on the 6th and 5th strings Em7 has one closed shell there, and B7 meets
        // it at the 7th fret.
        expect(grips(GUITAR, 'B7 Em7', [2, 7], [6, 5])).toEqual(['7 6 7 x x x', 'x 7 5 7 x x']);
    });

    it('a skipped string with a fretted note beside it stays: the finger there mutes it', () => {
        // Closed shells, the comper's: the bass finger's underside damps the string above it.
        expect(grips(GUITAR, 'Cmaj7', [2, 7])).toEqual(['x 3 x 4 5 x']);
        expect(grips(GUITAR, 'Dm7 G7 Cmaj7', [2, 7])[2]).toBe('x 3 x 4 5 x');
        // An open string on one side and a fretted note on the other.
        expect(grips(GUITAR, 'Dmaj7 Cm Fm7', [2, 7])[0]).toBe('x x 0 x 2 2');
        expect(grips(GUITAR, 'F#m7 B7 Emaj7', [2, 7], [6, 5])[2]).toBe('0 x 1 1 x x');
    });

    it('at the nut and with no window nothing changes: the book chords play there', () => {
        for (const home of [null, [1, 6]] as ([number, number] | null)[]) {
            expect(grips(GUITAR, 'A7sus4 A7 D', home)).toEqual([
                'x 0 2 0 3 0',
                'x 0 2 0 2 0',
                'x x 0 2 3 2',
            ]);
            expect(grips(GUITAR, 'Em7 A7 Dmaj7', home)).toEqual([
                '0 2 0 0 0 0',
                'x 0 2 0 2 0',
                'x x 0 2 2 2',
            ]);
        }
    });

    it('no guitar grip up the neck rings a skipped string; closed skips are still played', () => {
        const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const SUFFIXES = ['7', 'maj7', 'm7', '6', 'm6', '7sus4', 'm7b5', 'dim7'];
        let closedSkips = 0;
        for (const home of [
            [2, 7],
            [3, 8],
            [5, 10],
        ] as [number, number][]) {
            for (const rootStrings of [undefined, [6, 5]]) {
                for (const r of ROOTS) {
                    for (const q of SUFFIXES) {
                        for (const names of [r + q, `A7 ${r + q} Em7`]) {
                            for (const g of grips(GUITAR, names, home, rootStrings)) {
                                expect(rings(g), `${names} in ${home}: ${g}`).toBe(false);
                                closedSkips += /\d x \d/.test(g) ? 1 : 0;
                            }
                        }
                    }
                }
            }
        }
        expect(closedSkips).toBeGreaterThan(100);
    });

    it('the ukulele is not asked: it sounds every string', () => {
        expect(grips(UKULELE, 'A7sus4 A7 D', [2, 7])).toEqual(['2 4 3 5', '2 4 3 4', '2 2 2 5']);
    });
});

describe('the guitar’s little finger never lies flat (#1819)', () => {
    // A triad with two notes on one fret and the index three frets lower was 4-4-1, the little
    // finger laid across two strings (Dsus4 x 5 5 2 x x, E♭sus4 x 6 6 3 x x, Csus2
    // x 10 10 7 x x). Teachers rarely ask for that: alone it is 3-4-1, a fingertip each, and
    // beside D x 5 4 2 x x (4-3-1) it is 4-3-1, the ring finger sliding up a fret.
    const STRUM: FingerOpts = { barre: true };
    /** A guitar grip from its tab with its real degrees, one for each sounding string. */
    const grip = (tabs: string, degrees: string): Note[] => {
        const frets = tabs.split(' ');
        const named = degrees.split(' ') as Note['degree'][];
        let k = 0;
        return frets.flatMap((t, i): Note[] => {
            if (t === 'x') {
                return [];
            }
            const degree = named[k++];
            return [
                {
                    string: frets.length - i,
                    fret: Number(t),
                    degree,
                    role: degree === 'R' ? 'R' : 'F',
                    finger: null,
                },
            ];
        });
    };
    /** Fingers planned across grips built by `grip`, each a fresh copy, low string first. */
    const run = (...grips: Note[][]) => {
        const fresh = grips.map((notes) => ({ notes: notes.map((n) => ({ ...n })), ...STRUM }));
        fingerSequence(fresh);
        return fresh.map((c) => c.notes.map((n) => n.finger).join('-'));
    };
    const D = grip('x 5 4 2 x x', 'R 3 5');
    const Dm = grip('x 5 3 2 x x', 'R b3 5');
    const Dsus2 = grip('x 5 2 2 x x', 'R 2 5');
    const Dsus4 = grip('x 5 5 2 x x', 'R 4 5');
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    /** Each grip of a chart as `frets [fingers]`, fingers for the strings it sounds, low first. */
    const played = (names: string, home: [number, number] | null) =>
        voiceChart(chart(names), { instrument: GUITAR, home }).map((v) => {
            const low = [...v.notes].sort((a, b) => b.string - a.string);
            return `${tab(GUITAR, v)} [${low.map((n) => n.finger).join('-')}]`;
        });

    it('a lone Dsus4 x 5 5 2 x x is 3-4-1, a fingertip each', () => {
        expect(run(Dsus4)).toEqual(['3-4-1']);
        const alone = Dsus4.map((n) => ({ ...n }));
        assignFingers(alone, STRUM);
        expect(alone.map((n) => n.finger).join('-')).toBe('3-4-1');
        // The same shape at every fret, and its sus2 under the root a string lower.
        for (let f = 1; f <= 9; f++) {
            const tabs = `x ${f + 3} ${f + 3} ${f} x x`;
            expect(run(grip(tabs, 'R 4 5')), `sus4, fret ${f}`).toEqual(['3-4-1']);
            expect(run(grip(tabs, '5 R 2')), `sus2, fret ${f}`).toEqual(['3-4-1']);
        }
        // Nor does the ring finger take the little finger's barre three frets above the index.
        expect(taughtOptions(Dsus4, STRUM).map((o) => o.p.join('-'))).not.toContain('3-3-1');
    });

    it('D to Dsus4 and back keeps the little finger: Dsus4 is 4-3-1 beside D', () => {
        expect(run(D, Dsus4, D)).toEqual(['4-3-1', '4-3-1', '4-3-1']);
        expect(run(Dsus4, D)).toEqual(['4-3-1', '4-3-1']);
        expect(run(D, Dsus4)).toEqual(['4-3-1', '4-3-1']);
        // Beside its minor and its sus2 the same: the little finger on the root, the index on
        // the 5th.
        expect(run(Dm, Dsus4, Dm)).toEqual(['4-2-1', '4-3-1', '4-2-1']);
        expect(run(Dsus2, Dsus4, Dsus2)).toEqual(['4-1-1', '4-3-1', '4-1-1']);
        // The same shape at other frets: E♭ x 6 5 3 x x to E♭sus4, and on.
        for (let f = 1; f <= 9; f++) {
            const major = grip(`x ${f + 3} ${f + 2} ${f} x x`, 'R 3 5');
            const sus4 = grip(`x ${f + 3} ${f + 3} ${f} x x`, 'R 4 5');
            expect(run(major, sus4, major), `fret ${f}`).toEqual(['4-3-1', '4-3-1', '4-3-1']);
        }
        // In a chart: in frets 2–7, D is x 5 4 2 x x and Dsus4 x 5 5 2 x x.
        expect(played('D Dsus4 D', [2, 7])).toEqual([
            'x 5 4 2 x x [4-3-1]',
            'x 5 5 2 x x [4-3-1]',
            'x 5 4 2 x x [4-3-1]',
        ]);
        // A second fingering: offered only beside its own chord, for two fingers that stay.
        const crossed = taughtOptions(Dsus4, STRUM).filter((o) => o.p.join('-') === '4-3-1');
        expect(crossed.map((o) => [o.needs, o.hold, o.sameRoot])).toEqual([
            ['before', 2, true],
            ['after', 2, true],
        ]);
    });

    it('no guitar fingering puts the little finger on two strings', () => {
        let checked = 0;
        for (const root of ROOTS) {
            for (const q of Object.keys(QUALITIES) as Quality[]) {
                const opts: FingerOpts =
                    QUALITIES[q].kind === 'shell' ? { rootBarre: true } : { barre: true };
                for (const v of allPositions(GUITAR, root, q)) {
                    const notes = v.notes.map((n) => ({ ...n }));
                    for (const o of [
                        ...fingerOptions(notes, opts),
                        ...taughtOptions(notes, opts),
                    ]) {
                        expect(
                            o.p.filter((f) => f === 4).length,
                            `${v.symbol} ${tab(GUITAR, v)} ${o.p.join('-')}`,
                        ).toBeLessThan(2);
                        checked++;
                    }
                }
            }
        }
        expect(checked).toBeGreaterThan(1000);
        // And across charts, where a chord may take the fingering that keeps its neighbour's.
        const homes: ([number, number] | null)[] = [null, [1, 6], [2, 7], [5, 10], [7, 12]];
        for (const home of homes) {
            for (const r of ['C', 'D', 'Eb', 'F#', 'Ab', 'B']) {
                for (const names of [
                    `${r} ${r}sus4 ${r}`,
                    `${r}sus2 ${r}sus4 ${r}sus2`,
                    `${r}m ${r}sus4 ${r}m`,
                    `${r}5 ${r}sus2 ${r}5`,
                    `${r}sus4 ${r}dim ${r}sus4`,
                ]) {
                    for (const v of voiceChart(chart(names), { instrument: GUITAR, home })) {
                        expect(
                            v.notes.filter((n) => n.finger === 4).length,
                            `${names} in ${home}: ${tab(GUITAR, v)}`,
                        ).toBeLessThan(2);
                    }
                }
            }
        }
    });
});

describe('a guitar triad in a window from fret 1 is aimed at first position (#1827)', () => {
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    // On the three-string grips (`GUITAR_TRIADS`): at the nut the real guitar plays the chords
    // with an open form whole since #1849, and these pin the rules for the grips that remain.
    const grips = (names: string, home: [number, number] | null, rootStrings?: number[]) =>
        voiceChart(chart(names), { instrument: GUITAR_TRIADS, home, rootStrings }).map((v) =>
            tab(GUITAR, v),
        );

    it('a lone Gsus2 or Dsus4 is the top of the book’s Dsus4, not a reach to the 5th fret', () => {
        // Aimed at the window's middle (fret 3.5), x x 5 2 3 x won by 0.15.
        for (const rootStrings of [undefined, [6, 5]]) {
            expect(grips('Gsus2', [1, 6], rootStrings)).toEqual(['x x x 2 3 3']);
            expect(grips('Dsus4', [1, 6], rootStrings)).toEqual(['x x x 2 3 3']);
        }
    });

    it('the open chords’ tops and the book power chords, where the hand sits at the nut', () => {
        expect(grips('E5', [1, 6])).toEqual(['0 2 2 x x x']); // was x x 2 4 5 x
        expect(grips('F5', [1, 6])).toEqual(['1 3 3 x x x']); // was x x 3 5 6 x
        // was x 5 4 2 x x / x 5 3 2 x x
        expect(grips('D Dm D', [1, 6])).toEqual(['x x x 2 3 2', 'x x x 2 3 1', 'x x x 2 3 2']);
        // F, C, Dm and B♭ on the top three strings: the tops of x x 3 2 1 1, x 3 2 0 1 0,
        // x x 0 2 3 1 and x 1 3 3 3 1 (it was x 3 3 2 x x, x 3 2 0 x x, x 5 3 2 x x, x 5 3 3 x x).
        expect(grips('F C Dm Bb', [1, 6])).toEqual([
            'x x x 2 1 1',
            'x x x 0 1 0',
            'x x x 2 3 1',
            'x x x 3 3 1',
        ]);
        // The tops of the open E and A (it was x x x 4 5 4 / x x x 6 5 5, up the neck).
        expect(grips('E A E B', [1, 6])).toEqual([
            'x x x 1 0 0',
            'x x x 2 2 0',
            'x x x 1 0 0',
            'x x x 4 4 2',
        ]);
    });

    it('keeps what #1822 put a finger down for, and E7 is the open E7', () => {
        expect(grips('E Em E', [1, 6])).toEqual(['x x 2 1 0 x', 'x x 2 0 0 x', 'x x 2 1 0 x']);
        expect(grips('G+ G G+', [1, 6])).toEqual(['x 2 1 0 x x', 'x 2 0 0 x x', 'x 2 1 0 x x']);
        // E7 was x x 2 x 3 4 here once #1822 took Dsus4 off x 0 0 0 x x, then the open E7's
        // middle strings x x 2 1 3 x (#1827), a guitar shell being aimed at the window's middle.
        // Since #1838 it is the book's open E7. Beside it Adim and A♭dim were x x 1 2 1 x and
        // x x 0 1 0 x until #1851 aimed the shells at the nut and Cm7 took x 3 1 3 x x, and
        // they followed it onto the 5th string.
        expect(grips('Gdim7 E7 Adim Abdim Dsus4 Em Cm7', [1, 6]).slice(0, 4)).toEqual([
            '3 x 2 3 2 x',
            '0 2 0 1 0 0',
            'x 3 1 2 x x',
            'x 2 0 1 x x',
        ]);
    });
});

describe('a guitar grip earns its open strings only as part of the open chord (#1833)', () => {
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    // On the three-string grips (`GUITAR_TRIADS`): at the nut the real guitar plays the chords
    // with an open form whole since #1849, and these pin the rules for the grips that remain.
    const grips = (names: string, home: [number, number] | null, rootStrings?: number[]) =>
        voiceChart(chart(names), { instrument: GUITAR_TRIADS, home, rootStrings }).map((v) =>
            tab(GUITAR, v),
        );

    it('a chord with no open form takes the top of its closed grip, not an open string', () => {
        // E♭ x 1 1 0 x x (B♭ in the bass, the open G as its 3rd) is no part of any open chord.
        for (const rootStrings of [undefined, [6, 5]]) {
            expect(grips('Eb', [1, 6], rootStrings)).toEqual(['x x x 3 4 3']);
            expect(grips('Gm', [1, 6], rootStrings)).toEqual(['x x x 3 3 3']); // was x 1 0 0 x x
        }
        expect(grips('Eb Ebsus4 Eb', [1, 6])).toEqual([
            'x x x 3 4 3',
            'x x x 3 4 4',
            'x x x 3 4 3',
        ]);
        // The tops of the 1st- and 3rd-fret barres (Gm and E♭ were x 1 0 0 x x / x 1 1 0 x x).
        expect(grips('Bb F Gm Eb', [1, 6])).toEqual([
            'x x x 3 3 1',
            'x x x 2 1 1',
            'x x x 3 3 3',
            'x x x 3 4 3',
        ]);
        // Fsus2 x 3 3 0 x x is Csus4's grip under another name; the book's is x x 3 0 1 1.
        expect(grips('F Fsus2 F', [1, 6])).toEqual(['x x 3 2 1 x', 'x x 3 0 1 x', 'x x 3 2 1 x']);
    });

    it('the open chords keep their open strings', () => {
        expect(grips('Fsus2', [1, 6])).toEqual(['x x 3 0 1 x']);
        expect(grips('E Em E', [1, 6])).toEqual(['x x 2 1 0 x', 'x x 2 0 0 x', 'x x 2 1 0 x']);
        expect(grips('Esus4 Em Esus4', [1, 6])).toEqual([
            'x x 2 2 0 x',
            'x x 2 0 0 x',
            'x x 2 2 0 x',
        ]);
        expect(grips('C Bdim Am Em', [1, 6]).at(-1)).toBe('x 2 2 0 x x');
        expect(grips('C G Am F', [1, 6])).toEqual([
            'x 3 2 0 x x',
            'x 2 0 0 x x',
            'x 3 2 2 x x',
            'x 3 3 2 x x',
        ]);
        expect(grips('Csus4 C', [1, 6])).toEqual(['x 3 3 0 x x', 'x 3 2 0 x x']);
        // Csus4's x 3 3 0 1 1 is a book chord: x x 3 0 1 x is its middle (uncredited, x x 5 5 6 x).
        expect(grips('Dbm6 Csus4', [1, 6]).at(-1)).toBe('x x 3 0 1 x');
        expect(grips('E5 A5 D5', [1, 6])).toEqual(['0 2 2 x x x', 'x 0 2 2 x x', 'x x 0 2 3 x']);
        // A diminished triad is not judged: E° x 1 2 0 x x keeps the open E beside it (judged,
        // with no window the chart went to x x x 4 5 4 / x x x 3 5 3).
        for (const home of [null, [1, 6] as [number, number]]) {
            expect(grips('E Edim E', home)).toEqual(['x 2 2 1 x x', 'x 1 2 0 x x', 'x 2 2 1 x x']);
        }
    });
});
describe('guitar A at the nut: the B-string note is the ring finger (#1834)', () => {
    // A x x x 2 2 0, the open A's top, was 1-2 beside D, the middle finger on the B string. In
    // every method the B string is the ring finger: 2-3 (A as 1-2-3) or 1-3 (A as 2-1-3, the
    // A taught beside D, the index staying on the G string's A).
    const STRUM: FingerOpts = { barre: true };
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    /** A chart's grips as `tab [fingers]`, an open string's finger 0. */
    // On the three-string grips (`GUITAR_TRIADS`): at the nut the real guitar plays the chords
    // with an open form whole since #1849, and these pin the rules for the grips that remain.
    const fingered = (names: string, home: [number, number] | null = [1, 6]) =>
        voiceChart(chart(names), { instrument: GUITAR_TRIADS, home }).map(
            (v) => `${tab(GUITAR, v)} [${v.notes.map((n) => n.finger).join('-')}]`,
        );
    /** The open A's top, x x x 2 2 0, with its real degrees. */
    const a = (): Note[] => [
        { string: 3, fret: 2, degree: '5', role: 'F', finger: null },
        { string: 2, fret: 2, degree: '3', role: 'F', finger: null },
        { string: 1, fret: 0, degree: 'R', role: 'R', finger: null },
    ];
    const A = 'x x x 2 2 0 [2-3-0]';
    const A13 = 'x x x 2 2 0 [1-3-0]';
    const D = 'x x x 2 3 2 [1-3-2]';

    it('alone it is 2-3, 1-3 is its second fingering, and 1-2 is never offered', () => {
        const offered = taughtOptions(a(), STRUM);
        expect(offered[0].p).toEqual([2, 3]);
        expect(offered.filter((o) => o.p[0] === 1 && o.p[1] === 3).map((o) => o.needs)).toEqual([
            'before',
            'after',
        ]);
        // Not as a second fingering, nor as fingers left down.
        expect(offered.filter((o) => o.p[0] === 1 && o.p[1] === 2)).toEqual([]);
        expect(fingered('A')).toEqual([A]);
    });

    it('beside D the index stays on the G string and the ring finger slides a fret (1-3)', () => {
        expect(fingered('D A D A')).toEqual([D, A13, D, A13]);
        expect(fingered('A D A')).toEqual([A13, D, A13]);
        expect(fingered('D A Bm G').slice(0, 2)).toEqual([D, A13]);
        // Through two bars of A; and beside a chord that keeps no finger, 2-3.
        expect(fingered('A A D')).toEqual([A13, A13, D]);
        expect(fingered('E A E')[1]).toBe(A);
        // The F♯m barre x x x 2 2 2 shares both notes, but 1-3 would re-finger the B: 2-3.
        expect(fingered('F#m A')[1]).toBe(A);
    });

    it('beside Asus4 x x x 2 3 0 the ring finger slides a fret, whichever comes first', () => {
        const sus = 'x x x 2 3 0 [2-3-0]';
        expect(fingered('A Asus4 A')).toEqual([A, sus, A]);
        expect(fingered('Asus4 A Asus4')).toEqual([sus, A, sus]);
        // Alone, Asus4 keeps the open D's top, 1-3 (#1691).
        expect(fingered('Asus4')).toEqual(['x x x 2 3 0 [1-3-0]']);
    });
});
describe('guitar open C keeps 3-2 beside C7, Cmaj7 and Am; the neighbour adapts (#1835)', () => {
    // C x 3 2 0 x x is 3-2 in every method (C x 3 2 0 1 0, 3-2-0-1). Beside a chord that kept
    // its notes on the A and D strings it was 2-1, both fingertips a fret past their own, so
    // that chord could keep its own fingering. Now the chord beside it adds or lifts a finger.
    const STRUM: FingerOpts = { barre: true };
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    /** A chart's grips as `tab [fingers]`, an open string's finger 0. */
    // On the three-string grips (`GUITAR_TRIADS`): at the nut the real guitar plays the chords
    // with an open form whole since #1849, and these pin the rules for the grips that remain.
    const fingered = (names: string, home: [number, number] | null = [1, 6]) =>
        voiceChart(chart(names), { instrument: GUITAR_TRIADS, home }).map(
            (v) => `${tab(GUITAR, v)} [${v.notes.map((n) => n.finger).join('-')}]`,
        );
    /** A guitar grip from its tab and its degrees, low string to high, sounding strings only. */
    const grip = (tabs: string, degrees: string): Note[] => {
        const frets = tabs.split(' ');
        const named = degrees.split(' ') as Note['degree'][];
        let k = 0;
        return frets.flatMap((t, i): Note[] => {
            if (t === 'x') {
                return [];
            }
            const degree = named[k++];
            const role = degree === 'R' ? 'R' : 'F';
            return [{ string: frets.length - i, fret: Number(t), degree, role, finger: null }];
        });
    };
    const C = 'x 3 2 0 x x [3-2-0]';

    it('C7 and Cmaj7 are C with the little finger added, 3-2-4', () => {
        // In frets 2–7, where C7 and Cmaj7 are the shells.
        expect(fingered('C C7 F', [2, 7])).toEqual([
            C,
            'x 3 2 3 x x [3-2-4]',
            // The ring finger stays on C into F, 3-4-2, as it does from C (#1683).
            'x 3 3 2 x x [3-4-2]',
        ]);
        // Imagine.
        expect(fingered('C Cmaj7 F G', [2, 7]).slice(0, 2)).toEqual([C, 'x 3 2 4 x x [3-2-4]']);
        // Csus4 x 3 3 0 x x keeps its nut fingering, 3-4, the ring finger staying into C7.
        expect(fingered('Csus4 C7 C', [2, 7])).toEqual([
            'x 3 3 0 x x [3-4-0]',
            'x 3 2 3 x x [3-2-4]',
            C,
        ]);
        // At the nut they are the book's open chords (#1838), C with fingers added the same
        // way: C7 x 3 2 3 1 0 adds the little finger and the index, 3-2-4-1, and Cmaj7
        // x 3 2 0 0 0 is C with the index lifted.
        const c7 = 'x 3 2 3 1 0 [3-2-4-1-0]';
        expect(fingered('C C7 F')).toEqual([C, c7, 'x 3 3 2 x x [3-4-2]']);
        expect(fingered('C Cmaj7 F G').slice(0, 2)).toEqual([C, 'x 3 2 0 0 0 [3-2-0-0-0]']);
        expect(fingered('C7 C')).toEqual([c7, C]);
        expect(fingered('C C C7')).toEqual([C, C, c7]);
    });

    it('Am x 3 2 2 x x beside C is C with the index added, 3-2-1', () => {
        // The middle finger and the index crossed on one fret, as in the open A's 2-1-3.
        const am = 'x 3 2 2 x x [3-2-1]';
        expect(fingered('C Am F G', null).slice(0, 2)).toEqual([C, am]);
        expect(fingered('Am C', null)).toEqual([am, C]);
        expect(fingered('C C Am', null)).toEqual([C, C, am]);
        // C6, the same frets.
        expect(fingered('C6 C', null)).toEqual(['x 3 2 2 x x [3-2-1]', C]);
    });

    it('the fingerings that adapt keep the hand in position, a fingertip each', () => {
        const adapting = (notes: Note[], opts: FingerOpts) =>
            taughtOptions(notes, opts)
                .filter((o) => o.adapts && o.needs === 'before')
                .map((o) => `${o.p.join('-')}:${o.hold}`);
        // Never 3-2-4 for Am, the little finger two frets back from its own; never a barre.
        expect(adapting(grip('x 3 2 2 x x', 'b3 5 R'), STRUM)).toEqual([
            '3-1-2:2',
            '3-2-1:2',
            '4-2-3:2',
            '4-3-2:2',
        ]);
        expect(adapting(grip('x 3 2 3 x x', 'R 3 b7'), { rootBarre: true })).toEqual([
            '3-1-2:2',
            '3-2-4:2',
            '4-2-3:2',
        ]);
        // Each is offered both ways round, for the chord before and the chord after.
        const am = taughtOptions(grip('x 3 2 2 x x', 'b3 5 R'), STRUM).filter((o) => o.adapts);
        expect(am.filter((o) => o.needs === 'after')).toHaveLength(4);
        // The ukulele is not asked.
        const uke = grip('0 0 0 3', 'R 3 5 R');
        expect(taughtOptions(uke, { barre: true, ukulele: true }).some((o) => o.adapts)).toBe(
            false,
        );
    });

    it('open C is never fingered 2-1, and stays 3-2 beside F and Cm7', () => {
        const c = grip('x 3 2 0 x x', 'R 3 5');
        expect(taughtOptions(c, STRUM).filter((o) => o.p.join() === '2,1')).toEqual([]);
        expect(fingered('C')).toEqual([C]);
        expect(fingered('C F')).toEqual([C, 'x 3 3 2 x x [3-4-2]']);
        expect(fingered('C Cm7')).toEqual([C, 'x 3 1 3 x x [3-1-4]']);
        // One fingertip off its fret is a book fingering of its own: Em as 1-2 into C.
        expect(fingered('Em C', null)).toEqual(['x 2 2 0 x x [1-2-0]', C]);
    });

    it('alone, or beside a chord no method drills, each keeps its own fingering', () => {
        // Am the barre 2-1-1; C7 and Cmaj7 x 3 2 4 x x 2-1-3, the root under the middle.
        expect(fingered('Am', null)).toEqual(['x 3 2 2 x x [2-1-1]']);
        for (const [tabs, degrees] of [
            ['x 3 2 3 x x', 'R 3 b7'],
            ['x 3 2 4 x x', 'R 3 7'],
        ]) {
            expect(taughtOptions(grip(tabs, degrees), { rootBarre: true })[0].p, tabs).toEqual([
                2, 1, 3,
            ]);
        }
        // C+ x 3 2 1 x x holds C's notes under the same fingers, but it is no drilled chord,
        // so Am and C7 do not take the hand it leaves.
        expect(fingered('Caug Am', null)).toEqual(['x 3 2 1 x x [3-2-1]', 'x 3 2 2 x x [2-1-1]']);
        // C7 as the shell, the grip it is up the neck (at the nut it is the book's open C7).
        const caugC7 = [
            { notes: grip('x 3 2 1 x x', 'R 3 #5'), ...STRUM },
            { notes: grip('x 3 2 3 x x', 'R 3 b7'), rootBarre: true },
        ];
        fingerSequence(caugC7);
        expect(caugC7.map((c) => c.notes.map((n) => n.finger).join('-'))).toEqual([
            '3-2-1',
            '2-1-3',
        ]);
    });
});
describe('a guitar chord keeps one fingering through a song, unless two fingers stay (#1836)', () => {
    // A teacher gives a chord one fingering for the song and fingers it a second way only where
    // two fingers stay down into the next chord, or come down from the one before. The plan
    // kept a held note at every change it could, so one held note was reason enough for a
    // second fingering, and F x 3 3 2 x x was two fingerings in one song.
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    /** A chart's grips as `tab [fingers]`, an open string's finger 0. */
    // On the three-string grips (`GUITAR_TRIADS`): at the nut the real guitar plays the chords
    // with an open form whole since #1849, and these pin the rules for the grips that remain.
    const fingered = (names: string, home: [number, number] | null = [1, 6]) =>
        voiceChart(chart(names), { instrument: GUITAR_TRIADS, home }).map(
            (v) => `${tab(GUITAR, v)} [${v.notes.map((n) => n.finger).join('-')}]`,
        );
    const pick = (v: string[], ...at: number[]) => at.map((i) => v[i]);

    it('Let It Be, Hey Jude, La Bamba and Ring of Fire finger each chord one way', () => {
        // Let It Be: F was 2-3-1 after Am and 3-4-2 after G, the ring finger kept into C. Am
        // to F keeps two fingers (the middle on C, the index on A), so F is 2-3-1 throughout.
        for (const home of [[1, 6], null] as ([number, number] | null)[]) {
            const v = fingered('C G Am F C G F C', home);
            expect(pick(v, 3, 6)).toEqual(Array(2).fill('x 3 3 2 x x [2-3-1]'));
        }
        // Hey Jude: F was 3-4-2 into C and 2-3-1 after B♭.
        // Since #1838 C7 is the book's open x 3 2 3 1 0, and F the top of the small F beside
        // it, one way throughout all the same.
        const jude = fingered('F C C7 F Bb F C7 F');
        expect(pick(jude, 0, 3, 5, 7)).toEqual(Array(4).fill('x x 3 2 1 x [3-2-1]'));
        // La Bamba: F was 3-4-2 after C, the ring finger kept on C, and 2-3-1 after G. One
        // finger kept is no reason to leave the default, so F is 2-3-1 throughout.
        expect(fingered('C F G F')).toEqual([
            'x 3 2 0 x x [3-2-0]',
            'x 3 3 2 x x [2-3-1]',
            'x 2 0 0 x x [2-0-0]',
            'x 3 3 2 x x [2-3-1]',
        ]);
        // Ring of Fire in frets 2–7: G x x 5 4 3 x was 3-2-1 and 4-3-2 (the middle finger kept
        // into D); it is its default 3-2-1 throughout.
        const ring = fingered('G C G G D G', [2, 7]);
        expect(pick(ring, 0, 2, 3, 5)).toEqual(Array(4).fill('x x 5 4 3 x [3-2-1]'));
        // Where the song's fingering cannot be the default, it is the cheapest that has a way
        // through; F once beside C stays 3-4-2, the ring finger kept on C (#1683).
        expect(fingered('C F')[1]).toBe('x 3 3 2 x x [3-4-2]');
    });

    it('a second fingering stays where two fingers stay, or slide along their strings', () => {
        // Hallelujah: Am x 3 2 2 x x is C with the index added after C (#1835), keeping two
        // fingers, and the barre where nothing is kept.
        const v = fingered('C Am C Am F G C G C F G Am F G E7 Am');
        expect(pick(v, 1, 3, 11, 15)).toEqual([
            'x 3 2 2 x x [3-2-1]',
            'x 3 2 2 x x [3-2-1]',
            'x 3 2 2 x x [2-1-1]',
            'x 3 2 2 x x [2-1-1]',
        ]);
        // E° after E keeps the ring finger on E and slides the middle from B to B♭ (#1691).
        expect(fingered('Edim E Edim')).toEqual([
            'x 1 2 0 x x [1-2-0]',
            'x 2 2 1 x x [2-3-1]',
            'x 1 2 0 x x [2-3-0]',
        ]);
        // And beside the whole open E the real guitar plays at the nut (#1849).
        expect(
            voiceChart(chart('Edim E Edim'), { instrument: GUITAR, home: [1, 6] }).map(
                (v) => `${tab(GUITAR, v)} [${v.notes.map((n) => n.finger).join('-')}]`,
            ),
        ).toEqual(['x 1 2 0 x x [1-2-0]', '0 2 2 1 0 0 [0-2-3-1-0-0]', 'x 1 2 0 x x [2-3-0]']);
        // A grip that frets one note keeps its one finger: C x x x 0 1 0 after C+.
        expect(fingered('C C+ C')).toEqual([
            'x x x 0 1 0 [0-1-0]',
            'x x x 1 1 0 [1-2-0]',
            'x x x 0 1 0 [0-2-0]',
        ]);
    });

    it('in every chart, a grip fingered two ways keeps two fingers wherever it leaves one', () => {
        // The positive form of the rule, read off the voiced chart and not off the plan: for a
        // guitar triad or power grip fingered more than one way in a chart, some one fingering
        // is the song's, and every occurrence fingered otherwise keeps two of its fingers (its
        // one, for a grip of one fretted note) with the nearest other grip before or after it,
        // on the same note or a fret along its string.
        const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const SUFFIX = ['', 'm', 'sus2', 'sus4', '5', 'dim', '+'];
        const MAJOR: [number, string][] = [
            [0, ''],
            [2, 'm'],
            [4, 'm'],
            [5, ''],
            [7, ''],
            [9, 'm'],
        ];
        const POPS = [
            [0, 4, 5, 3],
            [5, 3, 0, 4],
            [0, 5, 3, 4, 0, 5, 3, 0],
            [0, 3, 0, 3, 4, 5, 0, 4],
            [3, 0, 4, 3],
        ];
        const charts: string[] = [];
        ROOTS.forEach((root, k) => {
            for (const a of SUFFIX) {
                for (const b of SUFFIX) {
                    if (a !== b) {
                        charts.push(`${root}${a} ${root}${b} ${root}${a}`);
                    }
                }
            }
            for (const p of POPS) {
                charts.push(p.map((d) => ROOTS[(k + MAJOR[d][0]) % 12] + MAJOR[d][1]).join(' '));
            }
        });
        type Grip = Voicing['notes'];
        const fingersOf = (g: Grip) => g.map((n) => n.finger).join('-');
        const keyOf = (g: Grip) => g.map((n) => `${n.string}/${n.fret}`).join(' ');
        const kept = (a: Grip, b: Grip) =>
            new Set(
                a
                    .filter((x) => {
                        const y = b.find((n) => n.string === x.string);
                        return (
                            x.fret > 0 &&
                            y !== undefined &&
                            y.fret > 0 &&
                            y.finger === x.finger &&
                            Math.abs(y.fret - x.fret) <= 1
                        );
                    })
                    .map((x) => x.finger),
            ).size;
        let splits = 0;
        const unearned: string[] = [];
        // The real guitar and its three-string grips alone: at the nut the open chords of #1849
        // leave few grips fingered two ways, and the rule still binds the grips beside them.
        for (const [instrument, home] of [GUITAR, GUITAR_TRIADS].flatMap((inst) =>
            ([[1, 6], [2, 7], null] as ([number, number] | null)[]).map((h) => [inst, h] as const),
        )) {
            for (const names of charts) {
                const v = voiceChart(chart(names), { instrument, home });
                const groups = new Map<string, number[]>();
                v.forEach((g, i) => {
                    if (g.shape.kind !== 'shell') {
                        groups.set(keyOf(g.notes), [...(groups.get(keyOf(g.notes)) ?? []), i]);
                    }
                });
                for (const [key, at] of groups) {
                    const ways = new Set(at.map((i) => fingersOf(v[i].notes)));
                    if (ways.size < 2) {
                        continue;
                    }
                    splits++;
                    const keepsTwo = (i: number) => {
                        const g = v[i].notes;
                        const want = Math.min(
                            2,
                            new Set(g.filter((n) => n.fret > 0).map((n) => n.finger)).size,
                        );
                        const side = (step: number) => {
                            let j = i + step;
                            while (
                                v[j] &&
                                keyOf(v[j].notes) === key &&
                                fingersOf(v[j].notes) === fingersOf(g)
                            ) {
                                j += step;
                            }
                            return v[j];
                        };
                        return [side(-1), side(1)].some((o) => o && kept(g, o.notes) >= want);
                    };
                    const earned = [...ways].some((main) =>
                        at.every((i) => fingersOf(v[i].notes) === main || keepsTwo(i)),
                    );
                    if (!earned) {
                        unearned.push(
                            `${instrument === GUITAR ? 'guitar' : 'triads'} ${home} ${names}: ${key}`,
                        );
                    }
                }
            }
        }
        expect(unearned).toEqual([]);
        // Not vacuous: the charts hold grips that are fingered two ways for two fingers.
        expect(splits).toBeGreaterThan(5);
    });

    it('the fingerings the audit kept are unchanged', () => {
        // Em and E to B7 x 2 1 2 x x keep the middle finger on B. At the nut B7 is the book's
        // open x 2 1 2 0 2 since #1838 and the triads beside it take the open chords' tops, so
        // the hold is pinned on the grips themselves.
        const held = (...grips: [string, string, FingerOpts][]) => {
            const chords = grips.map(([tabs, degrees, opts]) => {
                const named = degrees.split(' ');
                let k = 0;
                const cells = tabs.split(' ');
                const notes = cells.flatMap((t, i): Note[] => {
                    if (t === 'x') {
                        return [];
                    }
                    const degree = named[k++] as Note['degree'];
                    const role = degree === 'R' ? 'R' : 'F';
                    return [
                        { string: cells.length - i, fret: Number(t), degree, role, finger: null },
                    ];
                });
                return { notes, ...opts };
            });
            fingerSequence(chords);
            return chords.map((c) => c.notes.map((n) => n.finger).join('-'));
        };
        const STRUM: FingerOpts = { barre: true };
        const SHELL: FingerOpts = { rootBarre: true };
        expect(
            held(
                ['x 2 2 0 x x', '5 R b3', STRUM],
                ['x 2 1 2 x x', 'R 3 b7', SHELL],
                ['x 2 2 0 x x', '5 R b3', STRUM],
            ),
        ).toEqual(['2-3-0', '2-1-3', '2-3-0']);
        expect(
            held(
                ['x 2 2 1 x x', '5 R 3', STRUM],
                ['x 2 1 2 x x', 'R 3 b7', SHELL],
                ['x 2 2 1 x x', '5 R 3', STRUM],
            ),
        ).toEqual(['2-3-1', '2-1-3', '2-3-1']);
        expect(fingered('E B7 E')).toEqual([
            'x x x 1 0 0 [1-0-0]',
            'x 2 1 2 0 2 [2-1-3-0-4]',
            'x x x 1 0 0 [1-0-0]',
        ]);
        // D to Dsus4 adds the little finger (#1683); D x 5 4 2 x x keeps the little finger and
        // the index (#1819).
        expect(fingered('D Dsus4 D')).toEqual([
            'x x x 2 3 2 [1-3-2]',
            'x x x 2 3 3 [1-3-4]',
            'x x x 2 3 2 [1-3-2]',
        ]);
        expect(fingered('D Dsus4 D', [2, 7])).toEqual([
            'x 5 4 2 x x [4-3-1]',
            'x 5 5 2 x x [4-3-1]',
            'x 5 4 2 x x [4-3-1]',
        ]);
        // F to Fm keeps the ring and little finger (#1683).
        expect(fingered('F Fm F')).toEqual([
            'x 3 3 2 x x [3-4-2]',
            'x 3 3 1 x x [3-4-1]',
            'x 3 3 2 x x [3-4-2]',
        ]);
        // Em as 1-2 into C, the middle finger staying (#1683).
        expect(fingered('Em C', null)).toEqual(['x 2 2 0 x x [1-2-0]', 'x 3 2 0 x x [3-2-0]']);
        // The open A beside D is 1-3, the ring finger on the B string (#1834).
        expect(fingered('D A D A')).toEqual([
            'x x x 2 3 2 [1-3-2]',
            'x x x 2 2 0 [1-3-0]',
            'x x x 2 3 2 [1-3-2]',
            'x x x 2 2 0 [1-3-0]',
        ]);
    });
});

describe('at the nut a guitar 7th chord plays the book’s open chord (#1838)', () => {
    // The comping shells at the nut skipped a string between two open ones with no finger
    // beside it to mute it (A7 x 0 x 0 2 x, E7 0 x 0 1 x x), and a strum rang it. Every method
    // shows the full chord: `GUITAR_OPEN_SEVENTHS`, offered alone in first position.
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    const played = (
        names: string,
        home: [number, number] | null,
        rootStrings?: number[],
        inst: InstrumentDef = GUITAR,
    ) =>
        voiceChart(chart(names), { instrument: inst, home, rootStrings }).map(
            (v) => `${tab(inst, v)} [${v.notes.map((n) => n.finger).join('-')}]`,
        );
    const NUT: ([number, number] | null)[] = [null, [1, 6]];
    const SHELL_QUALITIES = (Object.keys(QUALITIES) as Quality[]).filter(
        (q) => QUALITIES[q].kind === 'shell',
    );
    const BOOK: Record<string, string> = {
        E7: '0 2 0 1 0 0 [0-2-0-1-0-0]',
        A7: 'x 0 2 0 2 0 [0-2-0-3-0]',
        D7: 'x x 0 2 1 2 [0-2-1-3]',
        G7: '3 2 0 0 0 1 [3-2-0-0-0-1]',
        C7: 'x 3 2 3 1 0 [3-2-4-1-0]',
        B7: 'x 2 1 2 0 2 [2-1-3-0-4]',
        Am7: 'x 0 2 0 1 0 [0-2-0-1-0]',
        Em7: '0 2 0 0 0 0 [0-2-0-0-0-0]',
        Dm7: 'x x 0 2 1 1 [0-2-1-1]',
        Cmaj7: 'x 3 2 0 0 0 [3-2-0-0-0]',
        Dmaj7: 'x x 0 2 2 2 [0-1-1-1]',
        Amaj7: 'x 0 2 1 2 0 [0-2-1-3-0]',
        Fmaj7: 'x x 3 2 1 0 [3-2-1-0]',
        Emaj7: '0 2 1 1 0 0 [0-3-1-2-0-0]',
        A7sus4: 'x 0 2 0 3 0 [0-2-0-3-0]',
        E7sus4: '0 2 0 2 0 0 [0-2-0-3-0-0]',
        D7sus4: 'x x 0 2 1 3 [0-2-1-3]',
        Dm6: 'x x 0 2 0 1 [0-2-0-1]',
        D6: 'x x 0 2 0 2 [0-2-0-3]',
    };

    it('each row of the table is its own chord, on its own root, and no other', () => {
        expect(GUITAR_OPEN_SEVENTHS).toHaveLength(Object.keys(BOOK).length);
        // The 7ths; the open triads of #1849 are books too, tested below.
        const books = GUITAR.shapes.filter((s) => s.book && s.kind === 'shell');
        expect(books).toHaveLength(GUITAR_OPEN_SEVENTHS.length);
        GUITAR_OPEN_SEVENTHS.forEach(([pc, quality, frets], i) => {
            const shape = books[i];
            for (const root of ROOTS) {
                for (const q of SHELL_QUALITIES) {
                    // Built from its root by `fretFor` (`build`, which holds a shape to its
                    // qualities): every note where the table puts it, and only on its root.
                    const built = build(GUITAR, shape, root, q);
                    expect(built && tab(GUITAR, built), `${frets} as ${root.name} ${q}`).toBe(
                        root.pc === pc && q === quality ? frets : null,
                    );
                }
            }
        });
    });

    it('alone, with no window and in frets 1–6, with either root-string setting', () => {
        for (const home of NUT) {
            for (const rootStrings of [undefined, [6, 5]]) {
                for (const [symbol, grip] of Object.entries(BOOK)) {
                    expect(played(symbol, home, rootStrings), `${symbol} ${home}`).toEqual([grip]);
                }
            }
        }
    });

    it('a blues in A and in E at the nut is the open 7ths throughout', () => {
        for (const home of NUT) {
            for (const rootStrings of [undefined, [6, 5]]) {
                const inA = played('A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7', home, rootStrings);
                expect(new Set(inA)).toEqual(new Set([BOOK.A7, BOOK.D7, BOOK.E7]));
                const inE = played('E7 E7 E7 E7 A7 A7 E7 E7 B7 A7 E7 B7', home, rootStrings);
                expect(new Set(inE)).toEqual(new Set([BOOK.E7, BOOK.A7, BOOK.B7]));
            }
        }
        // Every string between the lowest and the highest sounding rings: nothing to mute.
        for (const grip of Object.values(BOOK)) {
            expect(grip.split(' [')[0].replace(/^(x )+/, ''), grip).not.toMatch(/x/);
        }
    });

    it('the shells beside them keep the comper’s costs: a ii–V in F, a jazz blues in F', () => {
        // Gm7 has no open book chord: the R–3–7 shell beside the open C7 and Fmaj7.
        expect(played('Gm7 C7 Fmaj7', [1, 6])).toEqual([
            '3 1 3 x x x [2-1-3]',
            BOOK.C7,
            BOOK.Fmaj7,
        ]);
        // B♭7 and F7 stay the 1st-fret shells; D7 and C7 are the open chords.
        const blues = played('F7 Bb7 F7 F7 Bb7 Bb7 F7 D7 Gm7 C7 F7 C7', [1, 6], [6, 5]);
        expect(blues.filter((g, i) => blues.indexOf(g) === i)).toEqual([
            '1 x 1 2 x x [1-2-3]',
            'x 1 x 1 3 x [1-2-3]',
            BOOK.D7,
            '3 1 3 x x x [2-1-3]',
            BOOK.C7,
        ]);
    });

    it('up the neck, from fret 2, nothing changes: only a window from the nut offers them', () => {
        for (let w = 2; w <= 10; w++) {
            for (const rootStrings of [undefined, [6, 5]]) {
                for (const symbol of Object.keys(BOOK)) {
                    const voiced = voiceChart(chart(`${symbol} ${symbol}`), {
                        instrument: GUITAR,
                        home: [w, w + 5],
                        rootStrings,
                    });
                    expect(
                        voiced.some((v) => v.shape.book),
                        `${symbol} in frets ${w}–${w + 5}`,
                    ).toBe(false);
                }
            }
        }
        // The blues in A in frets 2–7 is the shells it was.
        expect(played('A7 D7 A7 E7', [2, 7])).toEqual([
            '5 4 5 x x x [2-1-3]',
            'x 5 4 5 x x [2-1-3]',
            '5 4 5 x x x [2-1-3]',
            'x 7 6 7 x x [2-1-3]',
        ]);
    });

    it('the ukulele is not asked: no ukulele shape is a book open 7th, and its blues is its own', () => {
        for (const inst of [UKULELE, UKULELE_LOW_G]) {
            expect(inst.shapes.some((s) => s.book)).toBe(false);
            for (const home of NUT) {
                expect(played('A7 D7 E7', home, undefined, inst)).toEqual([
                    '0 1 0 0 [0-1-0-0]',
                    '2 2 2 3 [1-1-1-2]',
                    '1 2 0 2 [1-2-0-3]',
                ]);
            }
        }
    });
});

describe('in first position a guitar 7th keeps one grip through a chart (#1839)', () => {
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    /** The grips each symbol of a chart is voiced with. */
    const grips = (
        names: string,
        home: [number, number] | null,
        rootStrings?: number[],
    ): Map<string, Set<string>> => {
        const by = new Map<string, Set<string>>();
        const symbols = names.split(' ');
        voiceChart(chart(names), { instrument: GUITAR, home, rootStrings }).forEach((v, i) => {
            by.set(symbols[i], (by.get(symbols[i]) ?? new Set()).add(tab(GUITAR, v)));
        });
        return by;
    };
    const blues = (I: string, IV: string, V: string) =>
        [I, IV, I, I, IV, IV, I, I, V, IV, I, V].map((r) => `${r}7`).join(' ');

    it('at frets 1–6 every shell symbol plays one grip', () => {
        for (const rootStrings of [undefined, [6, 5]]) {
            for (const names of [
                // F♯7 was 2 1 2 x x x and 2 x 2 3 x x.
                blues('F♯', 'B', 'C♯'),
                // F7 was x x 3 2 4 x and 1 x 1 2 x x.
                blues('C', 'F', 'G'),
                // A♭7 was 4 3 4 x x x and 4 x 4 5 x x; D♭7 x 4 3 4 x x and x 4 x 4 6 x.
                blues('A♭', 'D♭', 'E♭'),
                // Cm7 opened on x 3 x 3 4 x and came back as x 3 1 3 x x.
                'Cm7 Fm7 G7 Cm7',
            ]) {
                for (const [sym, set] of grips(names, [1, 6], rootStrings)) {
                    expect([...set], `${sym} in ${names}`).toHaveLength(1);
                }
            }
        }
        const c = grips(blues('C', 'F', 'G'), [1, 6]);
        // The 1st-fret F7, since #1851 aimed the shells at the nut (it was x x 3 2 4 x).
        expect([...c.get('F7')!]).toEqual(['1 x 1 2 x x']);
        // The book's open 7ths beside it are as they were (#1838).
        expect([...c.get('C7')!]).toEqual(['x 3 2 3 1 0']);
        expect([...c.get('G7')!]).toEqual(['3 2 0 0 0 1']);
    });
    it('up the neck a comper still moves a 7th between its root strings', () => {
        // Frets 2–7: G7 on the 6th string, then on the 4th.
        expect([...grips(blues('G', 'C', 'D'), [2, 7]).get('G7')!].sort()).toEqual([
            '3 x 3 4 x x',
            'x x 5 4 6 x',
        ]);
    });
    it('a chart with no window is left to the plan, as before', () => {
        // The rule is for a window placed at the nut; with none, F7 still plays two ways.
        expect(grips(blues('C', 'F', 'G'), null).get('F7')!.size).toBe(2);
    });
});

describe('at the nut a guitar chord with an open form plays the whole open chord (#1849)', () => {
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    /** A chart's grips as `tab [fingers]`, an open string's finger 0. */
    const played = (names: string, home: [number, number] | null, rootStrings?: number[]) =>
        voiceChart(chart(names), { instrument: GUITAR, home, rootStrings }).map(
            (v) => `${tab(GUITAR, v)} [${v.notes.map((n) => n.finger).join('-')}]`,
        );
    const grips = (names: string, home: [number, number] | null, rootStrings?: number[]) =>
        played(names, home, rootStrings).map((g) => g.split(' [')[0]);
    const NUT: ([number, number] | null)[] = [null, [1, 6]];
    const SETUPS = NUT.flatMap((home) =>
        [undefined, [6, 5]].map((rootStrings) => ({ home, rootStrings })),
    );
    const TRIADS = (Object.keys(QUALITIES) as Quality[]).filter(
        (q) => QUALITIES[q].kind === 'triad',
    );
    const OPEN = GUITAR_OPEN_CHORDS.filter(([, q]) => QUALITIES[q].kind === 'triad');

    it('each open chord is its own root and quality, and no other', () => {
        // Not the open sus chords that come in after the plan (#1843): those have their own table.
        const books = GUITAR.shapes.filter((s) => s.book && !s.afterPlan && s.kind === 'triad');
        expect(books).toHaveLength(OPEN.length);
        OPEN.forEach(([pc, quality, frets], i) => {
            for (const root of ROOTS) {
                for (const q of TRIADS) {
                    const built = build(GUITAR, books[i], root, q);
                    expect(built && tab(GUITAR, built), `${frets} as ${root.name} ${q}`).toBe(
                        root.pc === pc && q === quality ? frets : null,
                    );
                }
            }
        });
        // The ukulele has none.
        expect(UKULELE.shapes.some((s) => s.book)).toBe(false);
    });

    it('a doubled tone is R2, T2 or F2, so a grip says which notes are the shell', () => {
        const roles = (pc: number, quality: Quality) =>
            GUITAR.shapes
                .find((s) => s.book && s.id === `O${pc}${quality}`)!
                .voices.map(([, role]) => role)
                .join(' ');
        expect(roles(4, 'maj')).toBe('R F R2 T F2 R2'); // E 0 2 2 1 0 0
        expect(roles(7, 'maj')).toBe('R T F R2 T2 R2'); // G 3 2 0 0 0 3
        expect(roles(0, 'maj')).toBe('R T F R2 T2'); // C x 3 2 0 1 0
        expect(roles(9, 'min')).toBe('R F R2 T F2'); // Am x 0 2 2 1 0
        expect(roles(2, 'maj')).toBe('R F R2 T'); // D x x 0 2 3 2
    });

    it('the open-key songs are the book chords, with either root-string setting', () => {
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            expect(grips('C Am Dm G7', home, rootStrings), at).toEqual([
                'x 3 2 0 1 0',
                'x 0 2 2 1 0',
                'x x 0 2 3 1',
                '3 2 0 0 0 1',
            ]);
            expect(grips('G Em C D', home, rootStrings), at).toEqual([
                '3 2 0 0 0 3',
                '0 2 2 0 0 0',
                'x 3 2 0 1 0',
                'x x 0 2 3 2',
            ]);
            // C and the G7 beside it; F has no open form and takes a three-string F.
            const cfg = grips('C F G7 C', home, rootStrings);
            expect([cfg[0], cfg[2], cfg[3]], at).toEqual([
                'x 3 2 0 1 0',
                '3 2 0 0 0 1',
                'x 3 2 0 1 0',
            ]);
            expect(
                cfg[1].split(' ').filter((f) => f !== 'x'),
                at,
            ).toHaveLength(3);
            expect(grips('E A B7 E', home, rootStrings), at).toEqual([
                '0 2 2 1 0 0',
                'x 0 2 2 2 0',
                'x 2 1 2 0 2',
                '0 2 2 1 0 0',
            ]);
        }
    });

    it('fingered as the books print them', () => {
        for (const home of NUT) {
            expect(played('C', home)).toEqual(['x 3 2 0 1 0 [3-2-0-1-0]']);
            expect(played('A', home)).toEqual(['x 0 2 2 2 0 [0-1-2-3-0]']);
            expect(played('G', home)).toEqual(['3 2 0 0 0 3 [2-1-0-0-0-3]']);
            expect(played('E', home)).toEqual(['0 2 2 1 0 0 [0-2-3-1-0-0]']);
            expect(played('D', home)).toEqual(['x x 0 2 3 2 [0-1-3-2]']);
            expect(played('Am', home)).toEqual(['x 0 2 2 1 0 [0-2-3-1-0]']);
            expect(played('Em', home)).toEqual(['0 2 2 0 0 0 [0-2-3-0-0-0]']);
            expect(played('Dm', home)).toEqual(['x x 0 2 3 1 [0-2-3-1]']);
            expect(played('Asus4', home)).toEqual(['x 0 2 2 3 0 [0-1-2-3-0]']);
            expect(played('Dsus4', home)).toEqual(['x x 0 2 3 3 [0-1-3-4]']);
            expect(played('Fsus2', home)).toEqual(['x x 3 0 1 1 [3-0-1-1]']);
        }
    });

    it('beside its neighbour a book chord keeps the book’s hand, and a common tone stays', () => {
        // E to B7 keeps the middle finger on B (it was the triad top x x x 1 0 0, #1838).
        expect(played('E B7 E', [1, 6])).toEqual([
            '0 2 2 1 0 0 [0-2-3-1-0-0]',
            'x 2 1 2 0 2 [2-1-3-0-4]',
            '0 2 2 1 0 0 [0-2-3-1-0-0]',
        ]);
        // A beside D is 2-1-3, the index staying on the G string's A.
        expect(played('D A D A', [1, 6])).toEqual(
            Array(2).fill(['x x 0 2 3 2 [0-1-3-2]', 'x 0 2 2 2 0 [0-2-1-3-0]']).flat(),
        );
        // C to Am keeps the index and middle finger, the ring finger moving to the G string.
        expect(played('C Am', null)).toEqual([
            'x 3 2 0 1 0 [3-2-0-1-0]',
            'x 0 2 2 1 0 [0-2-3-1-0]',
        ]);
        // F after the open Am is F's own 3-2-1, not 4-3-1 to keep Am's ring finger and index;
        // D beside Dm is D's own 1-3-2, never 2-3-1.
        expect(played('C G Am F', null).at(-1)).toBe('x x 3 2 1 x [3-2-1]');
        // Nor one finger of a book chord kept with the index idle: A° after the open Am is
        // its own 3-1-2, not 4-2-3 for Am's ring finger on the G string.
        expect(played('A Am Adim Am6', null)[2]).toBe('x 3 1 2 x x [3-1-2]');
        expect(played('D Dm D', [1, 6])).toEqual([
            'x x 0 2 3 2 [0-1-3-2]',
            'x x 0 2 3 1 [0-2-3-1]',
            'x x 0 2 3 2 [0-1-3-2]',
        ]);
    });

    it('up the neck the three-string grips stay', () => {
        expect(grips('C G Am F', [2, 7])).toEqual([
            'x x x 5 5 3',
            'x x x 4 3 3',
            'x x x 5 5 5',
            'x x x 5 6 5',
        ]);
        expect(grips('E A B7 E', [2, 7])).toEqual([
            'x 7 6 4 x x',
            'x 7 7 6 x x',
            '7 6 7 x x x',
            'x 7 6 4 x x',
        ]);
        for (const home of [
            [2, 7],
            [5, 10],
            [7, 12],
        ] as [number, number][]) {
            for (const names of ['C G Am F', 'G Em C D', 'A D E', 'Dsus4 Asus2 Esus4']) {
                for (const v of voiceChart(chart(names), { instrument: GUITAR, home })) {
                    expect(v.shape.book, `${names} in ${home}: ${v.symbol}`).toBeFalsy();
                }
            }
        }
    });

    it('a chord with no open form keeps its grip', () => {
        expect(grips('F', [1, 6])).toEqual(['x 3 3 2 x x']);
        expect(grips('Bm F#m B', null)).toEqual(['x x x 4 3 2', 'x x x 2 2 2', 'x x x 4 4 2']);
        expect(grips('F Bb Gm Eb', [1, 6])).toEqual([
            'x x x 2 1 1',
            'x x x 3 3 1',
            'x x x 3 3 3',
            'x x x 3 4 3',
        ]);
        // The open power chords are already their full grips.
        expect(grips('E5 A5 D5', [1, 6])).toEqual(['0 2 2 x x x', 'x 0 2 2 x x', 'x x 0 2 3 x']);
    });
});

describe('in first position a guitar shell is aimed at the nut (#1851)', () => {
    const shells = (song: string, key: string, home: [number, number] | null, inst = GUITAR) =>
        voiceChart(songChart(keyRoot(key), SONG_SHAPES[song]), { instrument: inst, home }).map(
            (v) => `${v.symbol} ${tab(inst, v)}`,
        );
    /** The grips one symbol of a characterization chart is voiced with. */
    const symbol = (song: string, key: string, home: [number, number] | null, sym: string) =>
        new Set(
            shells(song, key, home)
                .filter((s) => s.split(' ')[0] === sym)
                .map((s) => s.slice(sym.length + 1)),
        );

    it('F♯m7 is 2 x 2 2 x x through the F♯-minor charts in frets 1–6', () => {
        // It was held to the stretch x x 4 2 5 x, and F♯7 beside it to x x 4 3 5 x. In `bossa`
        // and `minorDim` a hold to 2 x 2 2 x x costs past the tolerance after C♯7 x 4 3 4 x x,
        // so it takes the aim and the learner's hold together (`learnersShell`).
        for (const song of ['minorLoop', 'bossa', 'minorDim']) {
            expect([...symbol(song, 'F♯', [1, 6], 'F♯m7')], song).toEqual(['2 x 2 2 x x']);
        }
        expect([...symbol('minorDim', 'F♯', [1, 6], 'F♯7')]).toEqual(['2 x 2 3 x x']);
    });

    it('B♭m7 and F7 come down to the 1st fret', () => {
        const chart = 'Bbm7 Ebm7 Ab7 Dbmaj7 F#maj7 Cm7b5 F7 Bbm7'
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
        const g = voiceChart(chart, { instrument: GUITAR, home: [1, 6] }).map((v) =>
            tab(GUITAR, v),
        );
        // Was 6 4 6 x x x both times, and F7 x x 3 x 4 5; now F7 is the 1st fret's.
        expect([g[0], g[6], g[7]]).toEqual(['x 1 x 1 2 x', '1 x 1 2 x x', 'x 1 x 1 2 x']);
    });

    it('a shell comes down without a stretch: pop in F♯, and Fm7 at the 1st fret', () => {
        // `pop` in F♯ was the comper's x x 4 x 6 6 / x 4 x 4 6 x / x 6 4 6 x x / x 2 x 3 4 x.
        expect(shells('pop', 'F♯', [1, 6])).toEqual([
            'F♯maj7 2 x 3 3 x x',
            'C♯7 x 4 3 4 x x',
            'D♯m7 x x 1 x 2 2',
            'Bmaj7 x 2 1 3 x x',
        ]);
        // Aimed at the 2nd fret by its centre alone, Fm7 took the 1–4 stretch x x 3 1 4 x over
        // the 1st fret's 1 x 1 1 x x (`FIRST_POSITION_STRETCH`).
        expect(symbol('minorLoop', 'C', [1, 6], 'Fm7')).toEqual(new Set(['1 x 1 1 x x']));
        const lone = voiceChart(
            [voicingChord(parseChord('Fm7', { tonic: 0, minor: false })!, 'C', false)],
            { instrument: GUITAR, home: [1, 6] },
        );
        expect(tab(GUITAR, lone[0])).toBe('1 x 1 1 x x');
    });

    it('up the neck, with no window and on the ukulele nothing moves', () => {
        // A comper's costs: the window's middle (frets 2–7) or the guitar's home (no window),
        // and the chord moves between its root strings.
        const both = new Set(['2 x 2 2 x x', 'x x 4 2 5 x']);
        expect(symbol('minorLoop', 'F♯', [2, 7], 'F♯m7')).toEqual(both);
        expect(symbol('bossa', 'F♯', [2, 7], 'F♯m7')).toEqual(both);
        expect(symbol('minorLoop', 'F♯', null, 'F♯m7')).toEqual(both);
        // `pop` in F♯ stays the comper's with no window, and `pop` in C in frets 2–7 keeps
        // Cmaj7 on the 5th string's root (aimed at the 2nd fret it was x 3 2 4 x x).
        expect(shells('pop', 'F♯', null)).toEqual([
            'F♯maj7 x x 4 x 6 6',
            'C♯7 x 4 x 4 6 x',
            'D♯m7 x 6 4 6 x x',
            'Bmaj7 x 2 x 3 4 x',
        ]);
        expect(shells('pop', 'C', [2, 7])).toEqual([
            'Cmaj7 x 3 x 4 5 x',
            'G7 3 x 3 4 x x',
            'Am7 5 3 5 x x x',
            'Fmaj7 x x 3 x 5 5',
        ]);
        expect(shells('minorLoop', 'F♯', [1, 6], UKULELE)).toEqual([
            'F♯m7 2 4 2 4',
            'Bm7 2 2 2 2',
            'C♯7 1 1 1 2',
            'F♯m7 2 4 2 4',
        ]);
    });
});

describe('in first position a guitar shell keeps one fingering per song (#1851)', () => {
    /** Each grip a chart plays, by its frets, and the fingerings it takes. */
    const fingerings = (
        song: string,
        key: string,
        home: [number, number] | null,
        rootStrings?: number[],
    ): Map<string, Set<string>> => {
        const by = new Map<string, Set<string>>();
        voiceChart(songChart(keyRoot(key), SONG_SHAPES[song]), {
            instrument: GUITAR,
            home,
            rootStrings,
        }).forEach((v) => {
            const fingers = [...v.notes]
                .sort((a, b) => b.string - a.string)
                .map((n) => n.finger ?? 0)
                .join('-');
            const grip = `${v.symbol} ${tab(GUITAR, v)}`;
            by.set(grip, (by.get(grip) ?? new Set()).add(fingers));
        });
        return by;
    };

    it('in frets 1–6 a shell grip is fingered one way through a chart', () => {
        // E♭7 x x 1 x 2 3 was 1-2-3, and 2-3-4 after F7 1 x 1 2 x x for its index's note.
        expect(fingerings('blues', 'B♭', [1, 6]).get('E♭7 x x 1 x 2 3')).toEqual(
            new Set(['1-2-3']),
        );
        for (const key of ['C', 'F♯', 'B♭']) {
            for (const rootStrings of [undefined, [6, 5]]) {
                for (const song of ['pop', 'canon', 'autumn', 'blues', 'bridge', 'bossa']) {
                    for (const [grip, set] of fingerings(song, key, [1, 6], rootStrings)) {
                        expect([...set], `${grip} in ${song} in ${key}`).toHaveLength(1);
                    }
                }
            }
        }
    });

    it('a second fingering that keeps two fingers stays, as for a triad (#1836)', () => {
        // Cm7 x 3 1 3 x x is 3-1-4 into the open C7 x 3 2 3 1 0, the ring and little finger
        // staying, and 2-1-3 after G7.
        expect(fingerings('minorDim', 'C', [1, 6]).get('Cm7 x 3 1 3 x x')).toEqual(
            new Set(['3-1-4', '2-1-3']),
        );
    });

    it('up the neck and with no window a comper still re-fingers a shell for a held note', () => {
        expect(fingerings('blues', 'B♭', null).get('E♭7 x x 1 x 2 3')).toEqual(
            new Set(['1-2-3', '2-3-4']),
        );
        expect(fingerings('blues', 'C', [2, 7]).get('F7 x x 3 x 4 5')).toEqual(
            new Set(['1-2-3', '2-3-4']),
        );
    });
});

describe('a guitar book chord plays alone only where the song sits at the nut around it (#1859)', () => {
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    const grips = (
        names: string,
        home: [number, number] | null,
        rootStrings?: number[],
        inst: InstrumentDef = GUITAR,
    ) => voiceChart(chart(names), { instrument: inst, home, rootStrings }).map((v) => tab(inst, v));
    const SETUPS = ([null, [1, 6]] as ([number, number] | null)[]).flatMap((home) =>
        [undefined, [6, 5]].map((rootStrings) => ({ home, rootStrings })),
    );

    it('an open-position song is unchanged: the book chords, beside each other', () => {
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            expect(grips('C G Am F', home, rootStrings).slice(0, 3), at).toEqual([
                'x 3 2 0 1 0',
                '3 2 0 0 0 3',
                'x 0 2 2 1 0',
            ]);
            // F has x 3 3 2 x x inside the 4th fret, so C beside it is the open C.
            expect(grips('F C F', home, rootStrings)[1], at).toBe('x 3 2 0 1 0');
            expect(grips('E A B7 E', home, rootStrings), at).toEqual([
                '0 2 2 1 0 0',
                'x 0 2 2 2 0',
                'x 2 1 2 0 2',
                '0 2 2 1 0 0',
            ]);
            expect(grips('G Em C D', home, rootStrings), at).toEqual([
                '3 2 0 0 0 3',
                '0 2 2 0 0 0',
                'x 3 2 0 1 0',
                'x x 0 2 3 2',
            ]);
            expect(
                new Set(grips('A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7', home, rootStrings)),
            ).toEqual(new Set(['x 0 2 0 2 0', 'x x 0 2 1 2', '0 2 0 1 0 0']));
            expect(
                new Set(grips('E7 E7 E7 E7 A7 A7 E7 E7 B7 A7 E7 B7', home, rootStrings)),
            ).toEqual(new Set(['0 2 0 1 0 0', 'x 0 2 0 2 0', 'x 2 1 2 0 2']));
            expect(grips('Em7 G Dsus4 A7sus4 C Dsus4 A7sus4', home, rootStrings), at).toEqual([
                '0 2 0 0 0 0',
                '3 2 0 0 0 3',
                'x x 0 2 3 3',
                'x 0 2 0 3 0',
                'x 3 2 0 1 0',
                'x x 0 2 3 3',
                'x 0 2 0 3 0',
            ]);
            // A chart of one chord: the window says where it sits.
            expect(grips('C', home, rootStrings), at).toEqual(['x 3 2 0 1 0']);
        }
    });

    it('between chords with nothing near the nut it is priced with the grips beside them', () => {
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            // The open C between two closed diminished grips is the A-shape C's top, a finger
            // from them (it was x 3 2 0 1 0).
            expect(grips('Cdim C Cdim', home, rootStrings), at).toEqual([
                'x x x 5 4 2',
                'x x x 5 5 3',
                'x x x 5 4 2',
            ]);
            // E beside an Esus2 with no grip inside the 4th fret: one finger, not the open E.
            expect(grips('Esus2 E Esus2', home, rootStrings), at).toEqual([
                'x x x 4 5 2',
                'x x x 4 5 4',
                'x x x 4 5 2',
            ]);
            // D7 a fret above D♭maj7, not the open D7 and a jump.
            expect(grips('D7 D7 Dbmaj7', home, rootStrings), at).toEqual([
                'x 5 4 5 x x',
                'x 5 4 5 x x',
                'x 4 3 5 x x',
            ]);
        }
    });

    it('the book chord’s own fragments are not offered in its place', () => {
        // C5 has no grip inside the 4th fret, so C is priced; C x 3 2 0 x x, the open C with
        // strings left out, is not on offer, and the whole open C wins.
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            expect(grips('C C5 C', home, rootStrings), at).toEqual([
                'x 3 2 0 1 0',
                'x 3 5 5 x x',
                'x 3 2 0 1 0',
            ]);
            expect(grips('Csus4 C5 Csus4', home, rootStrings)[0], at).toBe('x 3 3 0 1 1');
        }
    });

    it('the form comes round: a first chord’s neighbour is the last', () => {
        // C's only neighbour on the page is D♭°7, with nothing near the nut; the form comes
        // back to it from the open G7.
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            expect(grips('C Dbdim7 Dm7 G7', home, rootStrings)[0], at).toBe('x 3 2 0 1 0');
            expect(grips('Bbsus2 Adim F+ Db5 Db5 A', home, rootStrings).at(-1), at).toBe(
                'x 0 2 2 2 0',
            );
        }
    });

    it('the ukulele, and windows up the neck, are untouched', () => {
        expect(grips('Cdim C Cdim', [1, 6], undefined, UKULELE)[1]).toBe('0 0 0 3');
        expect(grips('Cdim C Cdim', null, undefined, UKULELE)[1]).toBe('0 0 0 3');
        // E♭5 `3 3 6 6` has no ukulele grip inside the 4th fret, so on the guitar's rule E♭
        // would be priced and take the closed `3 3 3 1`.
        expect(grips('Eb Eb5 Eb', [1, 6], undefined, UKULELE)[0]).toBe('0 3 3 1');
        expect(grips('Eb Eb5 Eb', null, undefined, UKULELE)[0]).toBe('0 3 3 1');
        for (const home of [
            [2, 7],
            [5, 10],
        ] as [number, number][]) {
            for (const v of voiceChart(chart('Cdim C Cdim'), { instrument: GUITAR, home })) {
                expect(v.shape.book, `${home}: ${v.symbol}`).toBeFalsy();
            }
        }
    });
});
describe('an off-form open triad gives way to its lesson grip (#1857/#1861)', () => {
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    const grips = (names: string, home: [number, number] | null, inst: InstrumentDef = GUITAR) =>
        voiceChart(chart(names), { instrument: inst, home }).map((v) => tab(inst, v));
    /** The grip of `root` `quality` written as `t`, from every position it may take. */
    const grip = (root: string, quality: Quality, t: string, inst: InstrumentDef = GUITAR) => {
        const v = allPositions(inst, R(root), quality).find((w) => tab(inst, w) === t);
        expect(v, `${root} ${quality} ${t}`).toBeDefined();
        return v!;
    };
    const AT_THE_NUT = [null, [1, 6]] as ([number, number] | null)[];

    it('a lesson grip is a closed triad on G-B-E or D-G-B, in any inversion', () => {
        // The barre chords' tops: the A shape's Cm and C♯m, the E shape's Gm and A♭m, E♭'s.
        for (const [root, q, t] of [
            ['C', 'min', 'x x x 5 4 3'],
            ['G', 'min', 'x x x 3 3 3'],
            ['E♭', 'maj', 'x x x 3 4 3'],
            ['C♯', 'min', 'x x x 6 5 4'],
            ['A♭', 'min', 'x x x 4 4 4'],
            // Every inversion, on both sets.
            ['C', 'maj', 'x x x 5 5 3'],
            ['C', 'maj', 'x x x 9 8 8'],
            ['C', 'min', 'x x 5 5 4 x'],
            ['G', 'min', 'x x 5 3 3 x'],
            ['C♯', 'min', 'x x 2 1 2 x'],
        ] as [string, Quality, string][]) {
            expect(lessonGrip(grip(root, q, t), GUITAR), `${root} ${q} ${t}`).toBe(true);
        }
        for (const [root, q, t] of [
            // A-D-G, under the barre's top.
            ['A♭', 'min', 'x 2 1 1 x x'],
            ['E♭', 'maj', 'x 6 5 3 x x'],
            // An open string, on any set.
            ['C', 'min', 'x 3 1 0 x x'],
            ['C', 'min', 'x x 1 0 1 x'],
            ['C', 'maj', 'x x x 0 1 0'],
            // A book chord, a shell, a power chord.
            ['C', 'maj', 'x 3 2 0 1 0'],
            ['C', 'm7', 'x 3 1 3 x x'],
            ['C', 'five', 'x 3 5 5 x x'],
        ] as [string, Quality, string][]) {
            expect(lessonGrip(grip(root, q, t), GUITAR), `${root} ${q} ${t}`).toBe(false);
        }
        // The ukulele has no string sets: its Cm 0 3 3 3 strums all four.
        expect(lessonGrip(grip('C', 'min', '0 3 3 3', UKULELE), UKULELE)).toBe(false);
    });

    it('a grip slid from another: its strings, every fret moved the same', () => {
        const abm = grip('A♭', 'min', 'x x 1 1 0 x');
        const dbm = grip('C♯', 'min', 'x x x 1 2 0');
        // B♭m's shape two frets down; the open Dm's top a fret down (Dm sounds the open D too).
        expect(slidFrom(abm, grip('B♭', 'min', 'x x 3 3 2 x'))).toBe(true);
        expect(slidFrom(dbm, grip('D', 'min', 'x x 0 2 3 1'))).toBe(true);
        // Not the other way round: Dm sounds a string C♯m leaves out.
        expect(slidFrom(grip('D', 'min', 'x x 0 2 3 1'), dbm)).toBe(false);
        // Not a finger moved alone (D♭ x x x 1 2 1), not another set.
        expect(slidFrom(dbm, grip('D♭', 'maj', 'x x x 1 2 1'))).toBe(false);
        expect(slidFrom(abm, grip('B♭', 'min', 'x x x 3 2 1'))).toBe(false);
    });

    it('beside open chords the off-form grip takes the barre top', () => {
        for (const home of AT_THE_NUT) {
            // The issue's own example: Cm x 3 1 0 x x beside the open C.
            expect(grips('C Cm C', home), `${home}`).toEqual([
                'x 3 2 0 1 0',
                'x x x 5 4 3',
                'x 3 2 0 1 0',
            ]);
            expect(grips('Csus4 Cm Csus4', home)[1], `${home}`).toBe('x x x 5 4 3');
            // The open C7 is a book chord too, though no open triad form.
            expect(grips('C7 Cm C7', home)[1], `${home}`).toBe('x x x 5 4 3');
            expect(grips('Cm', home), `${home}`).toEqual(['x x x 5 4 3']);
        }
    });

    it('in a line of barre tops it takes the top on their strings', () => {
        for (const home of AT_THE_NUT) {
            // C♯m beside B x x x 4 4 2, the A-shape tops moving together.
            expect(grips('E B Dbm A', home)[2], `${home}`).toBe('x x x 6 5 4');
            expect(grips('B Dbm B', home)[1], `${home}`).toBe('x x x 6 5 4');
            // F x x 3 2 1 x and B♭ x x 3 3 3 x are on D-G-B; Cm's top is on G-B-E, so the open
            // grip stays rather than leave their strings.
            expect(grips('Cm F Bb Bb', home)[0], `${home}`).toBe('x x 1 0 1 x');
        }
    });

    it('among other small grips at the nut the open triad stays', () => {
        for (const home of AT_THE_NUT) {
            // E♭ among A♭ and D♭ on A-D-G, Cm between two C+ x 3 2 1 x x: the hand is already
            // playing small shapes in first position.
            expect(grips('Ab Db Eb Db', home)[2], `${home}`).toBe('x 1 1 0 x x');
            expect(grips('C+ Cm C+', home)[1], `${home}`).toBe('x 3 1 0 x x');
            // Csus2 was the fragment x 3 0 0 x x here, a small grip too. Since #1843 it plays its
            // open form x 3 0 0 3 3, Cm beside it takes the A-shape top, and Csus2 the grip one
            // finger from that (see the #1843 tests).
            expect(grips('Csus2 Cm Csus2', home), `${home}`).toEqual([
                'x x x 5 3 3',
                'x x x 5 4 3',
                'x x x 5 3 3',
            ]);
            // Read round: the line comes back from D♭sus4 x x 4 1 2 x to the first Cm.
            expect(grips('Dbsus4 Csus4 Cm Cm', home)[2], `${home}`).toBe('x 3 1 0 x x');
        }
    });

    it('a grip that is the shape of the chord beside it, slid, stays', () => {
        for (const home of AT_THE_NUT) {
            // A♭m x x 1 1 0 x is B♭m x x 3 3 2 x two frets down, a lesson grip on its own set;
            // C♯m x x x 1 2 0 is the open Dm's top a fret down.
            expect(grips('Bbm Abm Bbm', home), `${home}`).toEqual([
                'x x 3 3 2 x',
                'x x 1 1 0 x',
                'x x 3 3 2 x',
            ]);
            expect(grips('Dm Dbm Dm', home), `${home}`).toEqual([
                'x x 0 2 3 1',
                'x x x 1 2 0',
                'x x 0 2 3 1',
            ]);
        }
    });

    it('no new move of the hand by three frets', () => {
        // A♭m's lesson grips on D-G-B sit from the 4th fret, three frets from D♭ x x 3 1 2 x.
        expect(grips('Abm Db F# F#', [1, 6])[0]).toBe('x x 1 1 0 x');
        // C♯m's top-set grip is x x x 6 5 4, three frets from D♭ x x x 1 2 1.
        expect(grips('B Dbm Db', [1, 6])[1]).toBe('x x x 1 2 0');
    });

    it('counts the move round the form, so a loop voices alike from any chord', () => {
        // C♯m x x x 6 5 4 would be three frets from F x x x 2 1 1, the chord before it round
        // the form; read off the page alone, `Dbm D G F` took it and `F Dbm D G` did not. (With
        // no window the plan itself puts C♯m on x 4 2 1 x x in the first, before this pass.)
        expect(grips('Dbm D G F', [1, 6])[0]).toBe('x x x 1 2 0');
        expect(grips('F Dbm D G', [1, 6])[1]).toBe('x x x 1 2 0');
    });

    it('of two lesson grips that pass, the one the hand reaches more cheaply', () => {
        // E♭ x x x 3 4 3 and x x 5 3 4 x (Gm x x x 3 3 3 and x x 5 3 3 x) both pass beside
        // the open chords; the top-set grip is the cheaper move, and it is taken.
        for (const home of AT_THE_NUT) {
            expect(grips('C Eb C', home)[1], `${home}`).toBe('x x x 3 4 3');
            expect(grips('Em Gm Em', home)[1], `${home}`).toBe('x x x 3 3 3');
        }
    });

    it('the ukulele, and windows up the neck, are untouched', () => {
        for (const home of AT_THE_NUT) {
            expect(grips('C Cm C', home, UKULELE)[1], `${home}`).toBe('0 3 3 3');
        }
        expect(grips('C Cm C', [2, 7])[1]).toBe('x x 5 5 4 x');
        expect(grips('C Cm C', [5, 10])[1]).toBe('x x x 8 8 8');
        expect(grips('Csus2 Cm Csus2', [2, 7])[1]).toBe('x x 5 5 4 x');
    });
});
describe('Csus2 and Gsus4 play their open forms at the nut (#1843)', () => {
    const chart = (names: string) =>
        names
            .split(' ')
            .map((s) => voicingChord(parseChord(s, { tonic: 0, minor: false })!, 'C', false));
    /** A chart's grips as `tab [fingers]`, an open string's finger 0. */
    const played = (
        names: string,
        home: [number, number] | null,
        rootStrings?: number[],
        inst: InstrumentDef = GUITAR,
    ) =>
        voiceChart(chart(names), { instrument: inst, home, rootStrings }).map(
            (v) => `${tab(inst, v)} [${v.notes.map((n) => n.finger).join('-')}]`,
        );
    const grips = (names: string, home: [number, number] | null, rootStrings?: number[]) =>
        played(names, home, rootStrings).map((g) => g.split(' [')[0]);
    const SETUPS = ([null, [1, 6]] as ([number, number] | null)[]).flatMap((home) =>
        [undefined, [6, 5]].map((rootStrings) => ({ home, rootStrings })),
    );
    /** The grip of `root` `quality` written as `t`, from every position it may take. */
    const grip = (root: string, quality: Quality, t: string) => {
        const v = allPositions(GUITAR, R(root), quality).find((w) => tab(GUITAR, w) === t);
        expect(v, `${root} ${quality} ${t}`).toBeDefined();
        return v!;
    };

    it('each open form is its own root and quality, and comes in only after the plan', () => {
        const forms = GUITAR.shapes.filter((s) => s.afterPlan);
        expect(forms).toHaveLength(GUITAR_OPEN_SUS_AFTER_PLAN.length);
        GUITAR_OPEN_SUS_AFTER_PLAN.forEach(([pc, quality, frets], i) => {
            expect(forms[i].book, frets).toBe(true);
            for (const root of ROOTS) {
                for (const q of ['sus2', 'sus4'] as Quality[]) {
                    const built = build(GUITAR, forms[i], root, q);
                    expect(built && tab(GUITAR, built), `${frets} as ${root.name} ${q}`).toBe(
                        root.pc === pc && q === quality ? frets : null,
                    );
                }
            }
        });
        // The ukulele has its own open forms (`UKE_OPEN_FORMS`), and none of these.
        expect(UKULELE.shapes.some((s) => s.afterPlan)).toBe(false);
    });

    it('two grips are one finger apart when only one string changes fret', () => {
        const gm = grip('G', 'min', 'x x x 3 3 3');
        expect(oneFingerApart(gm, grip('G', 'sus4', 'x x x 5 3 3'))).toBe(true);
        expect(oneFingerApart(gm, grip('G', 'sus2', 'x x x 2 3 3'))).toBe(true);
        // Two strings move; another string set; the same grip.
        const csus2 = grip('C', 'sus2', 'x x x 5 3 3');
        expect(oneFingerApart(csus2, grip('C', 'dim', 'x x x 5 4 2'))).toBe(false);
        expect(oneFingerApart(gm, grip('G', 'sus4', 'x x 5 5 3 x'))).toBe(false);
        expect(oneFingerApart(gm, gm)).toBe(false);
    });

    it('alone, and beside the open C and G, they are the open forms', () => {
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            // Fingered as fachords prints them; they were the fragment x 3 0 0 x x, no book's.
            expect(played('Csus2', home, rootStrings), at).toEqual(['x 3 0 0 3 3 [2-0-0-3-4]']);
            expect(played('Gsus4', home, rootStrings), at).toEqual(['3 x 0 0 1 3 [3-0-0-1-4]']);
            expect(grips('C Csus2 C', home, rootStrings), at).toEqual([
                'x 3 2 0 1 0',
                'x 3 0 0 3 3',
                'x 3 2 0 1 0',
            ]);
            expect(grips('G Gsus4 G', home, rootStrings), at).toEqual([
                '3 2 0 0 0 3',
                '3 x 0 0 1 3',
                '3 2 0 0 0 3',
            ]);
        }
    });

    it('the chords beside them are not moved to suit them: Gm Gsus4 Gm moves one finger', () => {
        // Offered to the plan as book chords, the open Gsus4 took the hand off this one-finger
        // move (x x x 3 3 3 to x x x 5 3 3) for a jump to the nut and back.
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            expect(grips('Gm Gsus4 Gm', home, rootStrings), at).toEqual([
                'x x x 3 3 3',
                'x x x 5 3 3',
                'x x x 3 3 3',
            ]);
            expect(grips('Gsus4 Gm Gsus4', home, rootStrings), at).toEqual([
                'x x x 5 3 3',
                'x x x 3 3 3',
                'x x x 5 3 3',
            ]);
        }
    });

    it('beside the same-root lesson grip, the open form gives way to the grip a finger from it', () => {
        // Cm x 3 1 0 x x beside the open Csus2 takes the A-shape top (#1861), and Csus2 then
        // takes x x x 5 3 3, its 3rd down a fret, rather than a re-finger to the open form.
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            expect(grips('Cm Csus2 Cm', home, rootStrings), at).toEqual([
                'x x x 5 4 3',
                'x x x 5 3 3',
                'x x x 5 4 3',
            ]);
        }
    });

    it('a closed grip on the same root that holds the root keeps it down', () => {
        // C5 to Csus2 x 3 0 0 x x keeps the index on C; the open form's 2-3-4 would re-finger it
        // at every change. (In frets 1–6 C5 has no grip inside the 4th fret and the plan already
        // takes Csus2 x 5 5 5 x x, #1859.)
        expect(played('C5 Csus2 C5', null)).toEqual([
            'x 3 5 5 x x [1-3-3]',
            'x 3 0 0 x x [1-0-0]',
            'x 3 5 5 x x [1-3-3]',
        ]);
    });

    it('no new move of the hand by three frets', () => {
        // Round the form from A♭7sus4 4 4 4 x x x, the open form's 1st-fret C is a jump the
        // fragment's 3rd fret is not.
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            expect(grips('Ab7sus4 Db6 Gsus4', home, rootStrings)[2], at).toBe('x 3 0 0 x x');
        }
    });

    it('only the chords on its own root decide whether a closed grip keeps the root down', () => {
        // C7 x 3 2 3 1 0 holds the fragment's C on the A string, but it is not a Csus2's own
        // chord: the open form comes in.
        for (const { home, rootStrings } of SETUPS) {
            const at = `${home} ${rootStrings}`;
            expect(grips('F+ C7 Csus2 Fm Bbm7 Eb7sus4', home, rootStrings)[2], at).toBe(
                'x 3 0 0 3 3',
            );
        }
    });

    it('the open form gives way only to a closed grip, and to no jump', () => {
        // Beside Gm x 1 0 0 x x the fragment x 3 0 0 x x is one finger away; it does not come
        // back for the open form.
        for (const rootStrings of [undefined, [6, 5]]) {
            expect(grips('Abm Gsus4 Gm Ab Adim', [1, 6], rootStrings)[1], `${rootStrings}`).toBe(
                '3 x 0 0 1 3',
            );
            // x 5 5 5 x x is one finger from Gsus2 x 5 5 2 x x, but three frets from it.
            expect(grips('Gsus4 Gsus2 Gsus4', null, rootStrings), `${rootStrings}`).toEqual([
                '3 x 0 0 1 3',
                'x 5 5 2 x x',
                '3 x 0 0 1 3',
            ]);
        }
    });

    it('the ukulele, and windows up the neck, are untouched', () => {
        expect(played('Csus2', [1, 6], undefined, UKULELE)[0]).toBe('0 2 3 3 [0-1-2-3]');
        // In frets 2–7 the open form's notes are all in the window, but it is the nut's alone.
        for (const rootStrings of [undefined, [6, 5]]) {
            expect(grips('Bb5 Csus2 C', [2, 7], rootStrings)[1], `${rootStrings}`).toBe(
                'x 3 0 0 x x',
            );
        }
        for (const home of [
            [2, 7],
            [5, 10],
        ] as [number, number][]) {
            for (const v of voiceChart(chart('C Csus2 G Gsus4'), { instrument: GUITAR, home })) {
                expect(v.shape.book, `${home}: ${v.symbol}`).toBeFalsy();
            }
        }
    });
});
