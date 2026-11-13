import { DEFAULT_SETTINGS, type PitchedNote } from '../../core/types.js';
import { compileTimeline } from '../../form/timeline.js';
import { type PassMemory, performPass } from '../../perform.js';
import { score } from '../../test/scores.js';
import { parseChord } from '../../theory/chord.js';
import { type ApproachKind, approach, BASS, floorsBelow, meetRoot } from './line.js';

/**
 * #2071 (from #2008): a lead-in across a section change aims at the new section's root in the
 * new section's own register, so the section starts in the octave it then keeps. Placed in the
 * old section's register, the lead-in's promise held the new section's first bar an octave off
 * the rest of it.
 */
describe('a lead-in across a section change lands in the new section’s register', () => {
    // F through the chorus: its first bar's root and its second's are the same chord, so they
    // are the same note unless the first was placed somewhere the section does not play.
    const timeline = compileTimeline(
        score([
            { label: 'Verse', bars: 'C | C | C | G' },
            { label: 'Chorus', bars: 'F | F | F | F' },
        ]),
    );
    for (const style of ['reggae', 'rock'] as const) {
        it(style, () => {
            let leadIns = 0;
            const off: string[] = [];
            for (let s = 0; s < 60; s++) {
                const { events } = performPass(
                    timeline,
                    { ...DEFAULT_SETTINGS, style, seed: `s${s}` },
                    { pass: 0, looping: true },
                );
                const bass = events.filter((e): e is PitchedNote => e.lane === 'bass');
                const inBar = (bar: number) =>
                    bass.filter((e) => e.bar === bar).sort((a, b) => a.tick - b.tick);
                const into = inBar(3).at(-1);
                const [arrival] = inBar(4);
                const [settled] = inBar(5);
                // Only the bars a half-step lead-in walked into: those carry its promise.
                if (!into || !arrival || !settled || Math.abs(into.midi - arrival.midi) !== 1) {
                    continue;
                }
                leadIns++;
                if (arrival.midi !== settled.midi) {
                    off.push(`seed s${s}: ${into.midi} → ${arrival.midi}, then ${settled.midi}`);
                }
            }
            // The check judged real lead-ins, not none.
            expect(leadIns).toBeGreaterThan(5);
            expect(off).toEqual([]);
        });
    }
});

/**
 * #2197 (from #2178): a lead-in at the floor of the range comes from above, mid-song as in an
 * ending. A line that wrapped the step below up an octave played a leap (Eb2 into E1) or a note
 * under the open string, and called it a lead-in.
 */
describe('a lead-in at the floor of the range comes from above', () => {
    const chordOn = (symbol: string) => parseChord(symbol, { tonic: 0, minor: false })!;

    // The floor targets (E1, F1) and the one above them. Each expectation is the first step on
    // the instrument: from above where the string stops, from below where there is a string.
    it.each([
        // chord, kind, target, the lead-in
        ['E7', 'chromatic-below', BASS.lo, BASS.lo + 1],
        ['F7', 'chromatic-below', BASS.lo + 1, BASS.lo],
        ['E7', 'scale', BASS.lo, BASS.lo + 2],
        ['Em7', 'scale', BASS.lo, BASS.lo + 1],
        ['F7', 'scale', BASS.lo + 1, BASS.lo + 3],
        // One above the floor a scale step still comes from below, as before.
        ['F#7', 'scale', BASS.lo + 2, BASS.lo],
        ['G7', 'chromatic-below', BASS.lo + 3, BASS.lo + 2],
    ] as const)('%s %s into %i is %i', (symbol, kind: ApproachKind, target, expected) => {
        // Catches: the below-step folded an octave up (Eb2 into E1, an eleven-semitone "step").
        expect(approach(target, chordOn(symbol), kind)).toBe(expected);
        expect(Math.abs(approach(target, chordOn(symbol), kind) - target)).toBeLessThanOrEqual(2);
    });

    it.each([
        // chord, target, whether its nearest scale step under it is off the instrument
        ['F7', BASS.lo + 1, true], // Eb1 under F1
        ['E7', BASS.lo, true], // D1 under E1
        ['F', BASS.lo + 1, false], // E1, the open string, is in F's scale
        ['F#7', BASS.lo + 2, false], // E1 under F#1
        ['F7', BASS.lo + 13, false], // the same chord an octave up
    ] as const)('floorsBelow: %s into %i is %s', (symbol, target, expected) => {
        // Catches the floor test that jazz and neo-soul read to keep their own way onto the
        // string (#2197) answering wrong: false at a floor brings back jazz's walk parked on
        // the open string (F1 A1 F1 G1 | F1); true above it re-aims lines that were fine.
        expect(floorsBelow(target, chordOn(symbol))).toBe(expected);
    });

    it.each([
        // A seventh under the floor (a D#, a D) folds above, where it used to fold up an octave
        // or play under the open string: from above a whole step or a half step.
        ['a box tone a half step under the floor (D#)', BASS.lo - 1 + 12, BASS.lo, BASS.lo + 1],
        ['a box tone a whole step under the floor (D)', BASS.lo - 2 + 12, BASS.lo, BASS.lo + 2],
        ['a whole step under F1', BASS.lo + 1 - 2 + 12, BASS.lo + 1, BASS.lo + 3],
        // Where the fold lands exactly on the open E it stays there, a leading tone from below.
        ['a half step under F1 (the open E)', BASS.lo + 1 - 1 + 12, BASS.lo + 1, BASS.lo],
        ['a whole step under F#1 (the open E)', BASS.lo + 2 - 2 + 12, BASS.lo + 2, BASS.lo],
        // One above the floor it folds below, as before.
        [
            'a half step under a target above the floor',
            BASS.lo + 2 - 1 + 12,
            BASS.lo + 2,
            BASS.lo + 1,
        ],
    ])('meetRoot: %s', (_name, midi, target, expected) => {
        // Catches: a fold under BASS.lo (a D#1 below the open E, off the instrument).
        expect(meetRoot(midi, target)).toBe(expected);
        expect(meetRoot(midi, target)).toBeGreaterThanOrEqual(BASS.lo);
    });

    const setting = (symbol: string, into: string | null, tonic: number, minor = false) => ({
        chord: chordOn(symbol),
        into: into ? chordOn(into) : null,
        key: { tonic, minor },
    });

    it.each([
        // chord, into, key tonic, target, midi (the lead-in before folding), expected
        ['B7', 'E', 4, BASS.lo, BASS.lo - 1 + 12, BASS.lo + 2], // F natural: in neither chord nor E's key: F#1
        ['Cdim', null, 0, BASS.lo, BASS.lo - 2 + 12, BASS.lo + 2], // F# is Cdim's own, as F is: kept
        ['D5', 'E5', 4, BASS.lo, BASS.lo - 2 + 12, BASS.lo + 2], // a power chord's pentatonic lacks F#: the key's 2nd keeps it
        ['B7', 'Dm', 4, BASS.lo, BASS.lo - 1 + 12, BASS.lo + 1], // F is the target chord's tone: kept
        ['B7', 'E', 4, BASS.lo + 2, BASS.lo + 2 - 1 + 12, BASS.lo + 1], // above the floor: unchanged
    ] as const)(
        'meetRoot in %s into %s (key %i), target %i: mirror of %i is %i',
        (symbol, into, tonic, target, midi, expected) => {
            // Catches (#2215): the mirror's half step taken whatever the chord (F1 | E1 over B7),
            // a note in neither chord nor key where the scale path plays F#1; and the step
            // overriding a mirror that is a tone of its chord, of the chord it leads into or of
            // the key (funk D5 | E5's F#1).
            expect(meetRoot(midi, target, setting(symbol, into, tonic))).toBe(expected);
        },
    );

    it.each([
        // chord, target, avoid, expected
        // No scale step on the instrument (Dsus4's only step by the open E is the D under it):
        // the whole step above, F#1, the target's 2nd; the fold up an octave was D2, a
        // ten-semitone leap, and the half step an F, a b3 against the sus4.
        ['Dsus4', BASS.lo, null, BASS.lo + 2],
        // One above the floor the scale's E is on the string: unchanged.
        ['Dsus4', BASS.lo + 1, null, BASS.lo],
    ] as const)(
        'approach: a short scale at the floor, %s into %i (avoid %s) is %i',
        (symbol, target, avoid, expected) => {
            // Catches (#2215): the octave fold of the first candidate (D2 into E1), and the
            // half step above in its place.
            expect(approach(target, chordOn(symbol), 'scale', avoid)).toBe(expected);
        },
    );

    it.each([
        // chord, target, the note before, expected
        ['C', 40, null, 38], // D2 under E2, as ever
        ['C', 40, 38, 41], // the note before is D2: F2, the scale step on the other side
        ['C', 38, 36, 40], // C2 before D2: E2 (a scale step) before any half or whole step above
        ['Dsus4', 40, 38, 42], // no other scale step: the whole step above, F#2
        // The chord's own half step above is the note before (F | C/E written, F1 into E1): stands.
        ['F', BASS.lo, BASS.lo + 1, BASS.lo + 1],
    ] as const)(
        'approach: scale into %s %i after %s never repeats it: %i',
        (symbol, target, avoid, expected) => {
            // Catches (#2215): a scale lead-in equal to the note before it (a repeat, not a
            // lead-in), a half or whole step taken ahead of the scale's other side, and a
            // chord's own step above moved off the written walk-down.
            expect(approach(target, chordOn(symbol), 'scale', avoid)).toBe(expected);
        },
    );

    it('meetRoot never returns a note under the floor for any lead-in above a floor target', () => {
        for (let target = BASS.lo; target <= BASS.lo + 12; target++) {
            for (let midi = target + 9; midi <= BASS.hi + 12; midi++) {
                expect(meetRoot(midi, target), `${midi} into ${target}`).toBeGreaterThanOrEqual(
                    BASS.lo,
                );
            }
        }
    });
});

/**
 * #2225 (from #2197, #2215): jazz's mid-song scale approach into a floor target (E1, F1) aims
 * at the octave above, and the next bar's root keeps that octave because the approach promised
 * it (`land`), not because `place` happens to anchor near the note before.
 */
describe('a jazz floor approach promises the octave above to the next bar', () => {
    // Four in the bar (high intensity), the walk that approaches by the beat before the change.
    const jazz = { ...DEFAULT_SETTINGS, style: 'jazz' as const, intensity: 0.8 };
    const bassOf = (events: { lane: string }[], bar: number) =>
        (events as PitchedNote[])
            .filter((e) => e.lane === 'bass' && e.bar === bar)
            .sort((a, b) => a.tick - b.tick);
    const land = (memory: unknown) => (memory as { land?: number | null } | undefined)?.land;
    // The other lanes start fresh; only the bass remembers where it was.
    const resume = (bass: unknown): PassMemory => ({
        ...performPass(compileTimeline(score([{ label: 'A', bars: 'C' }])), jazz, {
            pass: 0,
            looping: true,
        }).snapshots[0],
        bass,
    });

    it('the next bar plays the promised octave where place would choose the floor', () => {
        const timeline = compileTimeline(score([{ label: 'A', bars: 'E | E | E | E' }]));
        // `place` puts E beside a line sitting on G1 (31) on the floor: E1 is nearer than E2.
        const arrival = (bass: unknown) =>
            bassOf(
                performPass(
                    timeline,
                    { ...jazz, seed: 'a' },
                    { pass: 0, looping: true, memory: resume(bass) },
                ).events,
                0,
            )[0].midi;
        expect(arrival({ last: 31, land: null })).toBe(BASS.lo);
        expect(arrival({ last: 31, land: BASS.lo + 12 })).toBe(BASS.lo + 12);
        // A promise for another pitch class is not this chord's: it places as before.
        expect(arrival({ last: 31, land: BASS.lo + 1 + 12 })).toBe(BASS.lo);
    });

    it('a mid-song scale approach into a floor target writes the promise, and only then', () => {
        // F1 then E: the line sits low, so E's place is the floor (and F's scale has the D
        // under it that is off the instrument) and the approach goes to the octave above.
        const timeline = compileTimeline(score([{ label: 'A', bars: 'F | E | E | E' }]));
        let promised = 0;
        for (let s = 0; s < 80; s++) {
            const { events, snapshots } = performPass(
                timeline,
                { ...jazz, seed: `s${s}` },
                {
                    pass: 0,
                    looping: true,
                    memory: resume({ last: 30, land: null }),
                },
            );
            const promise = land(snapshots[1].bass);
            const [arrival] = bassOf(events, 1);
            const into = bassOf(events, 0).at(-1);
            if (promise === null || promise === undefined) {
                continue;
            }
            promised++;
            expect(promise).toBe(BASS.lo + 12);
            expect(arrival.midi).toBe(promise);
            // The note before it is the scale step under the octave (D2 or D#2), not a leap.
            expect(Math.abs((into?.midi ?? 0) - promise)).toBeLessThanOrEqual(2);
            // The promise is consumed by one bar: the bar after the arrival carries none.
            expect(land(snapshots[2].bass) ?? null).toBe(null);
        }
        expect(promised).toBeGreaterThan(0);
    });
});
