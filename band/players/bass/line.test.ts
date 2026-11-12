import { DEFAULT_SETTINGS, type PitchedNote } from '../../core/types.js';
import { compileTimeline } from '../../form/timeline.js';
import { performPass } from '../../perform.js';
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
