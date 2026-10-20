/**
 * The neck view's follow logic (#1587), on real band charts (`bandChart` over a compiled
 * timeline): which grip sounds at a performed slot, which comes next in performance order, and
 * the headline and finger detail between them.
 */
import { compileTimeline } from '@band/index';
import type { ScoreEvent, ScoreMeasure, SemanticScore } from '@core/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { bandChart } from '../lib/band-chart';
import { GUITAR, type NeckPrefs, UKULELE, voiceBandChart } from '../lib/voicings';
import {
    changePosition,
    chordChanges,
    endsRun,
    fingersLine,
    firstVoicedSlot,
    neckModel,
    nextVoicedSlot,
    prevVoicedSlot,
    soundingSlot,
} from './use-neck-view';

const chord = (symbol: string, n: number): ScoreEvent => ({
    kind: 'chord',
    symbol,
    duration: [n, 1],
});
const hold: ScoreEvent = { kind: 'hold', duration: [4, 1] };
const noChord: ScoreEvent = { kind: 'no-chord', duration: [4, 1] };
const bar = (id: string, events: ScoreEvent[]): ScoreMeasure => ({
    id,
    content: { kind: 'events', events },
});
const view = (sections: SemanticScore['sections'], key = 'C') => {
    const score: SemanticScore = {
        notation: 'name',
        key,
        isMinor: false,
        meter: '4/4',
        grouping: null,
        sections,
    };
    return bandChart(score, compileTimeline(score));
};

describe('nextVoicedSlot', () => {
    it('counts a second chord inside the same bar (the hand changes for it)', () => {
        const band = view([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [
                    bar('m1', [chord('Dm7', 2), chord('G7', 2)]),
                    bar('m2', [chord('C', 4)]),
                ],
            },
        ]);
        expect(band.slots.map((s) => s.display)).toEqual([0, 1, 2]);
        expect(nextVoicedSlot(band, 0)).toBe(1);
        expect(nextVoicedSlot(band, 1)).toBe(2);
    });

    it('wraps a repeat back to its top, and the end of the form to the start', () => {
        const band = view([
            {
                id: 'a',
                label: 'A',
                repeat: 2,
                measures: [bar('m1', [chord('C', 4)]), bar('m2', [chord('F', 4)])],
            },
            { id: 'b', label: 'B', repeat: 1, measures: [bar('m3', [chord('G7', 4)])] },
        ]);
        expect(band.slots.map((s) => s.display)).toEqual([0, 1, 0, 1, 2]);
        // F on the first pass goes back to C (the repeat), on the second pass on to G7.
        expect(nextVoicedSlot(band, 1)).toBe(2);
        expect(nextVoicedSlot(band, 3)).toBe(4);
        // The form loops: after G7 comes the top.
        expect(nextVoicedSlot(band, 4)).toBe(0);
    });

    it('skips holds and N.C., and the same written chord performed again', () => {
        const band = view([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [
                    bar('m1', [chord('Dm7', 4)]),
                    bar('m2', [hold]),
                    bar('m3', [noChord]),
                    bar('m4', [chord('G7', 4)]),
                ],
            },
        ]);
        expect(nextVoicedSlot(band, 0)).toBe(3);
        // Under the hold and the N.C. the Dm7 grip is still the one on the neck.
        expect(soundingSlot(band, 1)).toBe(0);
        expect(soundingSlot(band, 2)).toBe(0);
        expect(nextVoicedSlot(band, 2)).toBe(3);
        // A one-chord vamp has nothing to change to.
        const vamp = view([
            { id: 'a', label: 'A', repeat: 4, measures: [bar('m1', [chord('F7', 4)])] },
        ]);
        expect(nextVoicedSlot(vamp, 0)).toBeNull();
        // Two written bars of one chord keep one grip: the next change is the chord after them.
        const twice = view([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [
                    bar('m1', [chord('C', 4)]),
                    bar('m2', [chord('C', 4)]),
                    bar('m3', [chord('F', 4)]),
                ],
            },
        ]);
        expect(nextVoicedSlot(twice, 0)).toBe(2);
    });

    it('finds no first grip in a chart of N.C. alone', () => {
        const band = view([{ id: 'a', label: 'A', repeat: 1, measures: [bar('m1', [noChord])] }]);
        expect(firstVoicedSlot(band)).toBeNull();
    });
});

describe('endsRun (#1590)', () => {
    const bars = (...measures: ScoreEvent[][]) =>
        view([
            { id: 'a', label: 'A', repeat: 1, measures: measures.map((m, i) => bar(`m${i}`, m)) },
        ]);
    const runEnds = (band: ReturnType<typeof view>) => band.slots.map((_, k) => endsRun(band, k));

    it('is the last slot of a chord’s run, not each bar of it', () => {
        // `| C | C | F |`: the hand moves at the end of bar 2, and from F back to the top.
        expect(runEnds(bars([chord('C', 4)], [chord('C', 4)], [chord('F', 4)]))).toEqual([
            false,
            true,
            true,
        ]);
    });

    it('counts a hold and an N.C. into the run they ring under', () => {
        expect(runEnds(bars([chord('Dm7', 4)], [hold], [chord('G7', 4)]))).toEqual([
            false,
            true,
            true,
        ]);
        expect(runEnds(bars([chord('Dm7', 4)], [noChord], [chord('G7', 4)]))).toEqual([
            false,
            true,
            true,
        ]);
    });

    it('carries a run across the loop point when the form ends on its first chord', () => {
        // `| C | F | C |`: the last bar's C runs on into bar 1, which is where it gives way.
        expect(runEnds(bars([chord('C', 4)], [chord('F', 4)], [chord('C', 4)]))).toEqual([
            true,
            true,
            false,
        ]);
    });

    it('still ends a run inside a bar', () => {
        expect(runEnds(bars([chord('Dm7', 2), chord('G7', 2)], [chord('C', 4)]))).toEqual([
            true,
            true,
            true,
        ]);
    });

    it('is never true when nothing else is played', () => {
        expect(runEnds(bars([chord('G7', 4)], [chord('G7', 4)]))).toEqual([false, false]);
        expect(runEnds(bars([chord('G7', 4)]))).toEqual([false]);
    });
});

describe('prevVoicedSlot (#1595)', () => {
    it('steps back to the start of the previous chord, wrapping the top to the last change', () => {
        const band = view([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [
                    bar('m1', [chord('Dm7', 2), chord('G7', 2)]),
                    bar('m2', [chord('C', 4)]),
                    bar('m3', [hold]),
                    bar('m4', [noChord]),
                    bar('m5', [chord('A7', 4)]),
                ],
            },
        ]);
        expect(prevVoicedSlot(band, 1)).toBe(0);
        expect(prevVoicedSlot(band, 2)).toBe(1);
        // A7's previous chord is the C under the hold and the N.C., at its own slot.
        expect(prevVoicedSlot(band, 5)).toBe(2);
        // Under the hold the C is still sounding: back from there is the G7.
        expect(prevVoicedSlot(band, 3)).toBe(1);
        // The top wraps to the form's last change.
        expect(prevVoicedSlot(band, 0)).toBe(5);
    });

    it('undoes nextVoicedSlot around the whole loop, repeats and all', () => {
        const band = view([
            {
                id: 'a',
                label: 'A',
                repeat: 2,
                measures: [bar('m1', [chord('C', 4)]), bar('m2', [chord('F', 4)])],
            },
            {
                id: 'b',
                label: 'B',
                repeat: 1,
                measures: [bar('m3', [chord('G7', 4)]), bar('m4', [chord('G7', 4)])],
            },
        ]);
        let slot = firstVoicedSlot(band)!;
        const seen: number[] = [];
        for (let i = 0; i < 6; i += 1) {
            const next = nextVoicedSlot(band, slot)!;
            expect(prevVoicedSlot(band, next)).toBe(slot);
            seen.push(next);
            slot = next;
        }
        expect(seen).toEqual([1, 2, 3, 4, 0, 1]);
    });

    it('a form that ends on the chord it starts on: the run wraps through the top', () => {
        const band = view([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: ['C', 'F', 'G7', 'C'].map((name, i) => bar(`m${i}`, [chord(name, 4)])),
            },
        ]);
        // The last C rings into the top: the band's next change after it is the F.
        expect(nextVoicedSlot(band, 3)).toBe(1);
        expect(prevVoicedSlot(band, 1)).toBe(3);
        expect(prevVoicedSlot(band, 0)).toBe(2);
        // The readout counts the form straight through: the top is 1, the last C is 4.
        const changes = chordChanges(band);
        expect(changes).toEqual([0, 1, 2, 3]);
        expect([0, 1, 2, 3].map((k) => changePosition(changes, k))).toEqual([1, 2, 3, 4]);
    });

    it('finds nothing to step to in a one-chord vamp', () => {
        const vamp = view([
            { id: 'a', label: 'A', repeat: 4, measures: [bar('m1', [chord('F7', 4)])] },
        ]);
        expect(prevVoicedSlot(vamp, 2)).toBeNull();
        expect(chordChanges(vamp)).toEqual([0]);
    });
});

describe('chordChanges (#1595)', () => {
    it('lists each change once, in performance order, skipping holds, N.C. and repeats of a chord', () => {
        const band = view([
            {
                id: 'a',
                label: 'A',
                repeat: 2,
                measures: [
                    bar('m1', [chord('Dm7', 4)]),
                    bar('m2', [hold]),
                    bar('m3', [chord('Dm7', 4)]),
                    bar('m4', [noChord]),
                    bar('m5', [chord('G7', 4)]),
                ],
            },
        ]);
        const changes = chordChanges(band);
        expect(changes).toEqual([0, 4, 5, 9]);
        // A slot inside a run counts as that run's change.
        expect(changePosition(changes, 2)).toBe(1);
        expect(changePosition(changes, 7)).toBe(3);
    });
});

describe('neckModel', () => {
    const band = view([
        {
            id: 'a',
            label: 'A',
            repeat: 1,
            measures: [
                bar('m1', [chord('Dm7', 4)]),
                bar('m2', [chord('G7', 4)]),
                // A chord the grips approximate: no shell plays its ♯5.
                bar('m3', [chord('Cmaj7#5', 4)]),
                bar('m4', [hold]),
            ],
        },
    ]);
    const voiced = new Map(
        voiceBandChart(band, { instrument: 'guitar', home: [2, 7], rootStrings: 'all' }).map(
            (v) => [v.globalIndex, v] as const,
        ),
    );

    it('stopped, shows the first grip and heads the change to the second', () => {
        const model = neckModel(band, voiced, null, GUITAR)!;
        expect(model.name).toBe('Dm7');
        expect(model.nextName).toBe('G7');
        expect(model.grip?.symbol).toBe('Dm7');
        expect(model.headline).toBe(
            'Starts on Dm7 · then G7: root moves to the 6th string, 2 frets lower',
        );
        // Dm7 x 5 3 5 x x is 2-1-3, root under the middle finger (#1611). It was 3-2-4, the
        // root under the ring finger so that the middle one could stay on the F ("Finger 2
        // stays down"): a hold no teacher shows. Fingered root first, the 7th slides to G7's 3rd,
        // and the F is said as the note it is (#1618): in both chords, under another finger.
        expect(model.fingers).toBe(
            'F is in both chords: the 3rd becomes the 7th; finger 2 takes it over; ' +
                'finger 1 moves to the 6th string, fret 3; finger 3 slides down 1 fret.',
        );
    });

    it('playing, names the next chord and the root move', () => {
        const model = neckModel(band, voiced, 0, GUITAR)!;
        expect(model.headline).toBe('Next: G7 · root moves to the 6th string, 2 frets lower');
        expect(model.fingers).not.toMatch(/lifts off/);
        const second = neckModel(band, voiced, 1, GUITAR)!;
        expect(second.headline).toBe('Next: Cmaj7#5 · root moves one string over, same fret');
        expect(second.fingers).toBe(
            'Finger 3 stays down on B: the 3rd becomes the 7th; ' +
                'finger 2 moves to the 5th string, fret 3; ' +
                'finger 4 goes down on the 2nd string, fret 5.',
        );
    });

    it('says the same change the same way a tone down, at the 1st fret (#1611)', () => {
        // Cm7 F7 B♭maj7 is the chart above two frets lower. F7 1 x 1 2 x x to B♭maj7
        // x 1 x 2 3 x keeps the ring finger on its note exactly as G7 to Cmaj7 does: a finger
        // that is already down is not lifted so that the index can take the 1st fret.
        const flat = view([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: ['Cm7', 'F7', 'Bbmaj7'].map((name, i) => bar(`m${i}`, [chord(name, 4)])),
            },
        ]);
        const grips = new Map(
            voiceBandChart(flat, {
                instrument: 'guitar',
                home: [1, 6],
                rootStrings: 'classic',
            }).map((v) => [v.globalIndex, v] as const),
        );
        expect(neckModel(flat, grips, 1, GUITAR)!.fingers).toBe(
            'Finger 3 stays down on A: the 3rd becomes the 7th; ' +
                'finger 2 moves to the 5th string, fret 1; ' +
                'finger 4 goes down on the 2nd string, fret 3.',
        );
    });

    it('says when the grip approximates the written chord, and holds it dimmed under a hold', () => {
        const augmented = neckModel(band, voiced, 2, GUITAR)!;
        expect(augmented.name).toBe('Cmaj7#5');
        expect(augmented.grip?.symbol).toBe('Cmaj7');
        expect(augmented.approximatedFrom).toBe('Cmaj7#5');
        expect(augmented.inversion).toBe(0);
        const held = neckModel(band, voiced, 3, GUITAR)!;
        expect(held.held).toBe('hold');
        expect(held.grip).toBe(augmented.grip);
        expect(held.nextName).toBe('Dm7');
    });

    it('a triad is its own grip, and names its inversion (#1588)', () => {
        const pop = view([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: ['C', 'G', 'Am', 'F'].map((name, i) => bar(`m${i}`, [chord(name, 4)])),
            },
        ]);
        const grips = new Map(
            voiceBandChart(pop, { instrument: 'guitar', home: [2, 7], rootStrings: 'all' }).map(
                (v) => [v.globalIndex, v] as const,
            ),
        );
        const models = [0, 1, 2, 3].map((slot) => neckModel(pop, grips, slot, GUITAR)!);
        expect(models.map((m) => m.grip?.symbol)).toEqual(['C', 'G', 'Am', 'F']);
        expect(models.every((m) => m.approximatedFrom === null)).toBe(true);
        // One string set, voice-led (#1597): C x x x 5 5 3 (C E G), G x x x 4 3 3 (B D G),
        // Am x x x 5 5 5 (C E A), F x x x 5 6 5 (C F A) — every voice steps or holds.
        expect(models.map((m) => m.inversion)).toEqual([0, 1, 1, 2]);
        // A barre is one finger (#1594): laid across its strings, then held into the F.
        expect(models[1].fingers).toBe('Finger 1 bars fret 5 on the top three strings.');
        expect(models[2].fingers).toBe(
            'Finger 1 stays down: C becomes the 5th and A the 3rd; ' +
                'finger 2 goes down on the 2nd string, fret 6.',
        );
    });

    it('heads a chart of one chord with its name alone, and says nothing while it plays', () => {
        const one = view([
            { id: 'a', label: 'A', repeat: 1, measures: [bar('m1', [chord('G7', 4)])] },
        ]);
        const grips = new Map(
            voiceBandChart(one, { instrument: 'guitar', home: [2, 7], rootStrings: 'all' }).map(
                (v) => [v.globalIndex, v] as const,
            ),
        );
        expect(neckModel(one, grips, null, GUITAR)).toMatchObject({
            headline: 'Starts on G7',
            fingers: '',
        });
        expect(neckModel(one, grips, 0, GUITAR)).toMatchObject({ headline: '', fingers: '' });
    });
});

describe('fingersLine: a common tone and its change of job (#1618)', () => {
    const grips = (names: string[], prefs: NeckPrefs, key = 'C') => {
        const band = view(
            [
                {
                    id: 'a',
                    label: 'A',
                    repeat: 1,
                    measures: names.map((name, i) => bar(`m${i}`, [chord(name, 4)])),
                },
            ],
            key,
        );
        return voiceBandChart(band, prefs);
    };
    /** The finger line of each change in a chart, in order (the last wraps to the first). */
    const lines = (names: string[], prefs: NeckPrefs, key = 'C'): string[] => {
        const voiced = grips(names, prefs, key);
        const instrument = prefs.instrument === 'uke' ? UKULELE : GUITAR;
        return voiced.map((g, i) => fingersLine(instrument, g, voiced[(i + 1) % voiced.length]));
    };
    const guitar = (home: NeckPrefs['home']): NeckPrefs => ({
        instrument: 'guitar',
        home,
        rootStrings: 'all',
    });
    const uke: NeckPrefs = { instrument: 'uke', home: [1, 6], rootStrings: 'all' };

    it('a ii–V–I: the note that stays is named with both jobs, finger held or not', () => {
        expect(lines(['Dm7', 'G7', 'Cmaj7'], guitar([2, 7]))).toEqual([
            // Dm7 x 5 3 5 x x (2-1-3) to G7 3 x 3 4 x x (1-2-3): no finger stays on the F, so
            // the note is what is said, and "finger 2 takes it over" is finger 2's whole move.
            'F is in both chords: the 3rd becomes the 7th; finger 2 takes it over; ' +
                'finger 1 moves to the 6th string, fret 3; finger 3 slides down 1 fret.',
            // G7 to Cmaj7 x 3 x 4 5 x: the ring finger does stay, and the note it is on is said.
            'Finger 3 stays down on B: the 3rd becomes the 7th; ' +
                'finger 2 moves to the 5th string, fret 3; ' +
                'finger 4 goes down on the 2nd string, fret 5.',
            // Cmaj7 back to Dm7: no note in the same place, so the moves alone, as before.
            'Finger 1 goes down on the 4th string, fret 3; finger 2 slides up 2 frets; ' +
                'finger 3 slides up 1 fret.',
        ]);
    });

    it('a 7sus4 into its own 7 keeps the root and ♭7 fingers, and says so (#1825)', () => {
        // A7sus4 5 5 5 x x x (2-3-4) to A7 5 4 5 x x x (2-1-4): the ring finger lifts off the
        // 4th and the index takes the 3rd a fret below it. It said "finger 2 takes over" A.
        expect(lines(['A7sus4', 'A7'], guitar([1, 6]))[0]).toBe(
            'Fingers 2 and 4 stay down; finger 1 goes down on the 5th string, fret 4.',
        );
        expect(lines(['A7', 'A7sus4'], guitar([1, 6]))[0]).toBe(
            'Fingers 2 and 4 stay down; finger 3 goes down on the 5th string, fret 5.',
        );
    });

    it('D to Dsus4 slides one finger: the little finger stays on the root (#1819)', () => {
        // D x 5 4 2 x x (4-3-1) to Dsus4 x 5 5 2 x x (4-3-1) in frets 2–7: the ring finger slides
        // from the 3rd to the 4th. Dsus4 was 4-4-1, the little finger flat, and both strings
        // changed finger.
        expect(lines(['D', 'Dsus4'], guitar([2, 7]))).toEqual([
            'Fingers 1 and 4 stay down; finger 3 slides up 1 fret.',
            'Fingers 1 and 4 stay down; finger 3 slides down 1 fret.',
        ]);
    });

    it('says no change of job for a note that is the same degree in both chords', () => {
        const [toDominant, , toMinor] = lines(['Cmaj7', 'C7', 'Fmaj7', 'Fm7'], guitar([1, 6]));
        // Cmaj7 to C7: the root stays the root and the 3rd the 3rd.
        expect(toDominant).toBe('Fingers 1 and 3 stay down; finger 2 slides down 1 fret.');
        // Fmaj7 to Fm7: the root stays the root.
        expect(toMinor).toBe(
            'Finger 1 stays down; finger 2 goes down on the 2nd string, fret 4; ' +
                'finger 3 moves to the 1st string, fret 4.',
        );
    });

    it('a 3rd that stays a 3rd a semitone away is no change of job either', () => {
        // Am x 3 2 2 x x to A♭ x 3 1 1 x x: C is the minor 3rd of one and the major 3rd of the
        // other. "The 3rd becomes the 3rd" is nothing a teacher says. No finger stays on it:
        // A♭ is the barre 3-1-1 (#1617), not 2-1-1 with the middle finger two frets from the
        // index, so the note is named and the ring finger takes it.
        expect(lines(['Am', 'Ab'], guitar(null))[0]).toBe(
            'C is in both chords; finger 3 takes it over; finger 1 slides down 1 fret.',
        );
    });

    it('two shared notes: each is named with what it becomes', () => {
        const pop = lines(['C', 'G', 'Am', 'F'], guitar([2, 7]));
        // Am x x x 5 5 5 to F x x x 5 6 5, one barre holding both.
        expect(pop[2]).toBe(
            'Finger 1 stays down: C becomes the 5th and A the 3rd; ' +
                'finger 2 goes down on the 2nd string, fret 6.',
        );
        // F to C x x x 5 5 3: the C stays under a new barre, which says its own strings — so no
        // "finger 3 takes it over" beside it.
        expect(pop[3]).toBe(
            'C is in both chords: the 5th becomes the root; ' +
                'finger 1 moves to the 1st string, fret 3; ' +
                'finger 3 bars fret 5 on the 3rd and 2nd strings.',
        );
        // Two fingers on two notes, on a ukulele: G7 0 2 1 2 to Em7 0 2 0 2.
        expect(lines(['G7', 'Em7'], uke)[0]).toBe(
            'Fingers 2 and 3 stay down: D becomes the 7th and B the 5th; lift finger 1.',
        );
    });

    it('one note held and another re-fingered: each says its own', () => {
        // F7 x x 3 2 4 x to B7 x 2 x 2 4 x, the tritone substitution: 3rd and 7th swap jobs.
        // The chart is in C, so F7's E♭ is B7's D♯ and the line gives both names.
        const sub = lines(['Cmaj7', 'C#7', 'F7', 'B7'], guitar(null));
        expect(sub[2]).toBe(
            'Finger 3 stays down on E♭/D♯: the 7th becomes the 3rd; ' +
                'A is in both chords: the 3rd becomes the 7th; finger 2 takes it over; ' +
                'finger 1 moves to the 5th string, fret 2.',
        );
    });

    it('three shared notes are a list, not a lesson: named, without their jobs', () => {
        // Ukulele Bm7♭5 2 2 1 2 to G7 0 2 1 2 keeps D, F and B.
        expect(lines(['Bm7b5', 'G7'], uke)[0]).toBe(
            'Finger 1 stays down; D and B are in both chords; fingers 2 and 3 take them over.',
        );
        // Dm7 2 2 1 3 is F6 2 2 1 3: nothing moves, and four jobs are not read out.
        expect(lines(['Dm7', 'F6'], uke)[0]).toBe('Fingers 1, 2, 3 and 4 stay down.');
    });

    it('an open string that rings on is not narrated: the line is the fingers’', () => {
        // Ukulele C 0 0 0 3 to Am 2 0 0 0 shares the open C and E strings.
        const [toAm, toF] = lines(['C', 'Am', 'F'], uke);
        expect(toAm).toBe('Finger 2 goes down on the G string, fret 2.');
        // Am to F 2 0 1 0: the fretted A is named; the open strings beside it are not, and
        // there is no finger 0 to take anything over.
        expect(toF).toBe(
            'Finger 2 stays down on A: the root becomes the 3rd; ' +
                'finger 1 goes down on the E string, fret 1.',
        );
        expect([toAm, toF].join(' ')).not.toMatch(/open|finger 0/i);
    });

    it('leaves out a note it has no plain name or job for', () => {
        const dim = lines(['Cdim7', 'B7'], guitar([1, 6]));
        // C°7 x 3 4 2 4 x to B7 x 2 x 2 4 x: the 3rd-string note is C°7's diminished 7th (B♭♭,
        // B7's A) under another finger. No "B♭♭ is in both chords": that finger's move is said
        // as before.
        expect(dim[0]).toBe(
            'Finger 4 stays down; finger 1 moves to the 5th string, fret 2; ' +
                'finger 2 moves to the 3rd string, fret 2.',
        );
        expect(dim.join(' ')).not.toMatch(/♭♭|♯♯|diminished/);
    });

    it('leaves out a note spelled with a double sharp or flat', () => {
        // G7 to Cmaj7 with the G written as F♯♯ (an augmented chord's ♯5 gets there in a real
        // chart): its 3rd is A♯♯, which is no name for the dot. The hold reads as it used to.
        const [, g7, cmaj7] = grips(['Dm7', 'G7', 'Cmaj7'], guitar([2, 7]));
        const respelled = { ...g7, root: { name: 'F♯♯', pc: 7, letter: 3 } };
        expect(fingersLine(GUITAR, respelled, cmaj7)).toBe(
            'Finger 3 stays down; finger 2 moves to the 5th string, fret 3; ' +
                'finger 4 goes down on the 2nd string, fret 5.',
        );
    });

    it('spells the note as the key does', () => {
        // Cm7 x 3 1 3 x x to F7 1 x 1 2 x x in B♭: the shared note is E♭, never D♯.
        const flat = lines(['Cm7', 'F7'], { ...guitar([1, 6]), rootStrings: 'classic' }, 'Bb');
        expect(flat[0]).toBe(
            'E♭ is in both chords: the 3rd becomes the 7th; finger 2 takes it over; ' +
                'finger 1 moves to the 6th string, fret 1; finger 3 slides down 1 fret.',
        );
    });

    it('a barre that takes one of two shared notes: only the other is handed to a finger (#1683)', () => {
        // Dm x 5 3 2 x x (4-2-1) to B♭ x 5 3 3 x x (3-1-1). F goes under the index barre,
        // which says its own fret and strings; D is the one note the ring finger takes. It
        // read "re-finger them with 3".
        const pop = lines(['F', 'C', 'Dm', 'Bb'], guitar(null));
        expect(pop[2]).toBe(
            'F and D are in both chords: F becomes the 5th and D the 3rd; ' +
                'finger 3 takes over D; finger 1 bars fret 3 on the 4th and 3rd strings.',
        );
        // Both notes to a fingertip each, and they are still "them": B♭ back to Dm (x x 3 2 3 x
        // and x x 3 3 3 x since #1827, a fret lower than x 5 3 2 x x and x 5 3 3 x x).
        expect(lines(['Dm', 'Bb'], guitar([1, 6]))[1]).toBe(
            'F and D are in both chords: F becomes the 3rd and D the root; ' +
                'fingers 2 and 3 take them over; finger 1 moves to the 3rd string, fret 2.',
        );
    });

    it('a barre that gives way to one note it was on has not moved (#1683)', () => {
        // G x x x 4 3 3 (2-1-1) to Em x x x 4 5 3 (2-3-1): the index was across the top two
        // strings and stays on the 1st. It read "finger 1 moves to the 1st string, fret 3",
        // and the G it holds went unsaid.
        const [toEm, toC] = lines(['G', 'Em', 'C', 'D'], guitar([2, 7]));
        expect(toEm).toBe(
            'Fingers 1 and 2 stay down: G becomes the 3rd and B the 5th; ' +
                'finger 3 goes down on the 2nd string, fret 5.',
        );
        // Em to C x x x 5 5 3: the index stays again, and the ring finger is a barre now.
        expect(toC).toBe(
            'Finger 1 stays down on G: the 3rd becomes the 5th; ' +
                'finger 3 bars fret 5 on the 3rd and 2nd strings.',
        );
        // Am x 3 2 2 x x (2-1-1) to F x 3 3 2 x x (2-3-1): the index stays on the 3rd string.
        expect(lines(['Am', 'F'], guitar(null))[0]).toBe(
            'Fingers 1 and 2 stay down: A becomes the 3rd and C the 5th; ' +
                'finger 3 goes down on the 4th string, fret 3.',
        );
        // The same on a ukulele: B♭ 3 2 1 1 to Gm 0 2 3 1 leaves the index on the A string.
        expect(lines(['Bb', 'Gm'], uke)[0]).toBe(
            'Fingers 1 and 2 stay down: B♭ becomes the 3rd and D the 5th; ' +
                'finger 3 moves to the E string, fret 3.',
        );
        // A barre that leaves its fret has moved, whatever it lands on: B♭ x 5 3 3 x x back
        // to Dm x 5 3 2 x x.
        expect(lines(['Dm', 'Bb'], guitar([1, 6]))[1]).toContain(
            'finger 1 moves to the 3rd string, fret 2',
        );
    });

    it('a chart that starts on a two-string grip says so before Play (#1809)', () => {
        const band = view([
            {
                id: 'a',
                label: 'A',
                repeat: 1,
                measures: [bar('m1', [chord('B5', 4)]), bar('m2', [chord('E', 4)])],
            },
        ]);
        const prefs: NeckPrefs = { instrument: 'uke', home: [1, 6], rootStrings: 'all' };
        const voiced = new Map(voiceBandChart(band, prefs).map((v) => [v.globalIndex, v] as const));
        const opening = neckModel(band, voiced, null, UKULELE)!;
        expect(opening.fingers.startsWith('On B5, skip the G and C strings. ')).toBe(true);
        // Once a slot is shown (playing, or stepped to), the line is the change's alone.
        expect(neckModel(band, voiced, 0, UKULELE)!.fingers).not.toContain('On B5');
        // A grip on all four strings, or a guitar's, opens with nothing extra.
        const guitar = new Map(
            voiceBandChart(band, { ...prefs, instrument: 'guitar' }).map(
                (v) => [v.globalIndex, v] as const,
            ),
        );
        expect(neckModel(band, guitar, null, GUITAR)!.fingers).not.toContain('skip');
    });

    it('a ukulele grip that leaves strings out says to skip them (#1809)', () => {
        // B 4 3 2 2 to B5 x x 2 2: the open G and C would ring, and C over B5 is a ♭9.
        expect(lines(['B', 'B5'], uke)[0]).toBe(
            'Finger 1 stays down; lift fingers 2 and 3; skip the G and C strings.',
        );
        // F♯ 3 1 2 1 to F♯5 x 1 2 x: the index comes off the A string, which is not strummed.
        expect(lines(['F#', 'F#5'], uke)[0]).toBe(
            'Finger 1 stays down on C♯; finger 2 stays down; lift finger 3; skip the G and A strings.',
        );
        // G5 0 2 3 x leaves out one string.
        expect(lines(['C', 'G5'], uke)[0]).toBe(
            'Finger 1 goes down on the C string, fret 2; finger 2 goes down on the E string, ' +
                'fret 3; skip the A string.',
        );
        // When the strings left out change, all of them are named: B♭5 x x 1 1 to F5 x 0 1 x
        // brings the C string back and leaves the A string out.
        expect(lines(['Bb5', 'F5'], uke)[0]).toContain('skip the G and A strings.');
        // Back on all four after a grip that left some out.
        expect(lines(['F#5', 'F#'], uke)[0]).toContain('strum all four strings.');
        // The same strings left out is no change: B5 x x 2 2 to B♭5.
        expect(lines(['B5', 'Bb5'], uke)).toEqual([
            'Finger 1 slides down 1 fret; finger 2 slides down 1 fret.',
            'Finger 1 slides up 1 fret; finger 2 slides up 1 fret.',
        ]);
        // A guitar grip leaves strings out all the time, muted by the hand: never said.
        for (const line of lines(['C', 'A5', 'E5'], guitar(null))) {
            expect(line).not.toContain('skip');
        }
    });

    it('one note name on two strings: "the other C", "the two D♭s", and which one (#1691)', () => {
        const uke5 = { ...uke, home: [5, 10] as [number, number] };
        const uke2 = { ...uke, home: [2, 7] as [number, number] };
        // F5 5 5 8 8 to C° 5 6 8 6: one C stays under the index and the other changes finger.
        // The held clause names C and its job, so the other is "the other C", not a second
        // "C is in both chords: the 5th becomes the root".
        expect(lines(['Fmaj7', 'F', 'F5', 'Cdim', 'Csus4', 'C', 'C+', 'Ebm'], uke5)[2]).toBe(
            'Finger 1 stays down on C: the 5th becomes the root; finger 4 takes over the other C; ' +
                'finger 2 goes down on the C string, fret 6; finger 3 moves to the A string, fret 6.',
        );
        // Where the held clause names no note, there is no "other" to point back to.
        expect(lines(['C5', 'Csus4', 'C'], uke5)[1]).toBe(
            'Fingers 1 and 2 stay down; C is in both chords; finger 4 takes it over; ' +
                'finger 3 moves to the A string, fret 7.',
        );
        // D♭ 6 5 4 4 to D♭° 6 4 3 4: both D♭s change finger, so "them" has a plural.
        expect(lines(['Db', 'Dbdim'], uke2)[0]).toBe(
            'The two D♭s are in both chords; fingers 3 and 4 take them over; ' +
                'finger 1 slides down 1 fret; finger 2 slides down 1 fret.',
        );
        // D♭° 6 4 3 4 to F♯sus4 6 6 7 4: one D♭ goes under the barre, the other to a
        // fingertip, and the string says which.
        expect(lines(['D+', 'Dbdim', 'F#sus4', 'Csus2', 'Bb6', 'Bm', 'B+', 'Bm'], uke2)[1]).toBe(
            'The two D♭/C♯ notes are in both chords: the root becomes the 5th; ' +
                'finger 1 takes over the D♭/C♯ on the A string; ' +
                'finger 3 bars fret 6 on the G and C strings; finger 4 moves to the E string, fret 7.',
        );
    });

    it('a barre that narrows over strings it lay across stays down, and says where (#1691)', () => {
        // Plain "stays down" where every string it leaves is fretted higher by another finger:
        // Dsus2 x x 2 2 3 x (1-1-3) to Dm x x 3 2 3 x, the 4th string under the middle finger
        // again; the ukulele's B♭m 3 1 1 1 to B♭ 3 2 1 1 the same.
        expect(lines(['Dm', 'Dsus2', 'Dm'], guitar(null))[1]).toBe(
            'Fingers 1 and 3 stay down; finger 2 goes down on the 4th string, fret 3.',
        );
        expect(lines(['Bbm', 'Bb'], uke)[0]).toBe(
            'Fingers 1 and 3 stay down; finger 2 goes down on the C string, fret 2.',
        );
        // Where a string it leaves must ring open, the finger comes off it, so the line says
        // where it stays. Esus4 x 2 2 2 x x to A5 x 0 2 2 x x: the A string rings open. It read
        // "finger 1 bars fret 2 on the 4th and 3rd strings", a new barre.
        // The notes it keeps there still say what they become.
        expect(lines(['Esus4', 'A5'], guitar(null))[0]).toBe(
            'Finger 1 stays down on the 4th and 3rd strings: E becomes the 5th and A the root.',
        );
        // On the note it keeps, where that is one both chords share: A5 to D5 x x 0 2 3 x, the
        // open D under the index's old barre.
        expect(lines(['A5', 'D5'], guitar(null))[0]).toBe(
            'Finger 1 stays down on A: the root becomes the 5th; ' +
                'finger 3 goes down on the 2nd string, fret 3.',
        );
        // The ukulele's B♭7 1 2 1 1 to A7 0 1 0 0: the index was across the C string under the
        // middle finger and the other three ring open. It read "Finger 1 moves to the C string,
        // fret 1".
        expect(lines(['Bb7', 'A7'], uke)[0]).toBe(
            'Finger 1 stays down on the C string; lift finger 2.',
        );
        // Cm 0 3 3 3 to C5 0 0 3 3: the C string's E♭ would ring on under a flat index.
        expect(lines(['Cm', 'C5'], uke)[0]).toBe('Finger 1 stays down on the E and A strings.');
        // The notes a narrowing barre keeps count toward the jobs told: the ukulele's Cmaj7
        // 5 7 7 7 (1-3-3-3) to Am7 5 7 5 7 in frets 5–10 keeps C, G and E, three notes, so none
        // is given its job.
        expect(lines(['Cmaj7', 'Am7'], { ...uke, home: [5, 10] })[0]).toBe(
            'Finger 1 stays down; finger 3 stays down on G; E is in both chords; ' +
                'finger 4 takes it over; finger 2 goes down on the E string, fret 5.',
        );
        // A string another finger frets at the barre's own fret sounds the same with the flat
        // finger under it, so the ring finger plainly stays: Am x 7 7 5 x x (3-3-1) to A
        // x 7 7 6 x x (2-3-1) in frets 5–10, the middle finger on the 5th string's 7th fret.
        // (It was F♯sus2 x 4 4 1 x x to F♯5, until the guitar's little finger stopped lying
        // flat, #1819: F♯sus2 is 3-4-1 and both fingers stay.)
        expect(lines(['A5', 'Am', 'A'], guitar([5, 10]))[1]).toBe(
            'Finger 3 stays down; E is in both chords; finger 2 takes it over; ' +
                'finger 1 slides up 1 fret.',
        );
        // On a guitar a string the next chord leaves out is muted by the finger lying across
        // it, so the barre plainly stays: B°7 to Bsus2 in frets 2–7.
        expect(lines(['Bsus2', 'Bdim7', 'Bsus2'], guitar([2, 7]))[1]).toBe(
            'Finger 1 stays down; finger 2 moves to the 2nd string, fret 7; ' +
                'finger 3 moves to the 1st string, fret 7.',
        );
        // A ukulele string is kept quiet by not strumming it, not by a flat finger: Dsus2
        // 7 9 10 7 to D5 7 9 10 x, the index comes off the A string and the line says to skip
        // it (#1809). Holds are said from finger 1 up.
        expect(lines(['Dsus2', 'D5'], { ...uke, home: [5, 10] })[0]).toBe(
            'Finger 1 stays down on D; fingers 3 and 4 stay down; skip the A string.',
        );
    });

    it('a chord that frets nothing says to lift every finger (#1818)', () => {
        // Uke E7 1 2 0 2 to Am7 0 0 0 0: all lifts, which the line otherwise leaves out.
        expect(lines(['E7', 'Am7'], uke)).toEqual([
            'Lift every finger: all four strings ring open.',
            'Finger 1 goes down on the G string, fret 1; finger 2 goes down on the C string, ' +
                'fret 2; finger 3 goes down on the A string, fret 2.',
        ]);
        // From a grip that skipped strings the skip clause says what to strum: G5 0 2 3 x to
        // C6 0 0 0 0.
        expect(lines(['G5', 'C6'], uke)[0]).toBe('Lift every finger; strum all four strings.');
        // The guitar's open Em7 shell 0 x 0 0 x x, after Am7 x 0 x 0 1 x.
        expect(lines(['Am7', 'Em7'], guitar(null))[0]).toBe('Lift every finger.');
        // Open to open is no move at all.
        expect(lines(['Am7', 'C6'], uke)).toEqual(['', '']);
    });

    it('a change that only lifts names the finger that lifts (#1837)', () => {
        // D x x x 2 3 2 (1-3-2) to Dsus2 x x x 2 3 0: the middle finger comes off the 1st string.
        expect(lines(['D', 'Dsus2'], guitar(null))[0]).toBe(
            'Fingers 1 and 3 stay down; lift finger 2.',
        );
        // Em x 2 2 0 x x (2-3) to G x 2 0 0 x x: the ring finger comes off the 3rd string.
        expect(lines(['Em', 'G'], guitar([1, 6]))[0]).toBe(
            'Finger 2 stays down on B: the 5th becomes the 3rd; lift finger 3.',
        );
        // The ukulele's A 2 1 0 0 (2-1) to Am 2 0 0 0: the index comes off the C string.
        expect(lines(['A', 'Am'], uke)[0]).toBe('Finger 2 stays down; lift finger 1.');
        // Two that lift are "fingers": D 2 2 2 0 (1-2-3) to Am, the index staying on the G
        // string's A; and Wonderwall's Dsus4 x x 5 2 3 x (4-1-2) to A7sus4 x 0 x 0 3 x.
        expect(lines(['D', 'Am'], uke)[0]).toBe(
            'Finger 1 stays down on A: the 5th becomes the root; lift fingers 2 and 3.',
        );
        const song = ['Em7', 'G', 'Dsus4', 'A7sus4', 'C', 'Dsus4', 'A7sus4'];
        expect(lines(song, guitar(null), 'G')[2]).toBe(
            'Finger 2 stays down on D: the root becomes the 4th; lift fingers 1 and 4.',
        );
        // A barre that stays on part of its strings is a finger that stays: the ukulele's B♭7
        // 1 2 1 1 to A7 0 1 0 0.
        expect(lines(['Bb7', 'A7'], uke)[0]).toBe(
            'Finger 1 stays down on the C string; lift finger 2.',
        );
    });

    it('a lift beside a move is still left out (#1837)', () => {
        // G7 3 x 3 4 x x (1-2-3) to Cmaj7 x 3 x 4 5 x: the index lifts, but the hand has
        // somewhere to go, and the line is the moves.
        expect(lines(['Dm7', 'G7', 'Cmaj7'], guitar([2, 7]))[1]).toBe(
            'Finger 3 stays down on B: the 3rd becomes the 7th; ' +
                'finger 2 moves to the 5th string, fret 3; ' +
                'finger 4 goes down on the 2nd string, fret 5.',
        );
        // Nothing stays and nothing moves: not a lift, but "lift every finger" (#1818).
        expect(lines(['E7', 'Am7'], uke)[0]).toBe('Lift every finger: all four strings ring open.');
    });

    it('a lift that changes the strings a ukulele strums: lift first, then skip (#1837)', () => {
        // B 4 3 2 2 (3-2-1-1) to B5 x x 2 2: the hand comes off, then the strum leaves out
        // the G and C strings.
        const [toB5, toB] = lines(['B', 'B5'], uke);
        expect(toB5).toBe('Finger 1 stays down; lift fingers 2 and 3; skip the G and C strings.');
        // And back: fingers go down, so nothing is lifted to say.
        expect(toB).not.toContain('lift');
        expect(toB).toMatch(/; strum all four strings\.$/);
    });

    it('an add9’s added tone is the 9th, not the 2nd (#1820)', () => {
        // Good Riddance on a ukulele: G 0 2 3 2, Cadd9 0 2 0 3, D 2 2 2 0. The C string's D is
        // in all three, the 5th of G, the 9th of Cadd9 and the root of D.
        expect(lines(['G', 'Cadd9', 'D'], uke)).toEqual([
            'D is in both chords: the 5th becomes the 9th; finger 2 takes it over; ' +
                'finger 3 moves to the A string, fret 3.',
            'Finger 2 stays down on D: the 9th becomes the root; ' +
                'finger 1 goes down on the G string, fret 2; ' +
                'finger 3 moves to the E string, fret 2.',
            // D back to G, the line wrapping to the top.
            'D is in both chords: the root becomes the 5th; finger 1 takes it over; ' +
                'finger 2 moves to the A string, fret 2; finger 3 slides up 1 fret.',
        ]);
        // C to Cadd9 adds a finger, the ring finger staying on the A string.
        expect(lines(['C', 'Cadd9'], uke)[0]).toBe(
            'Finger 3 stays down; finger 2 goes down on the C string, fret 2.',
        );
        // Csus2 0 2 3 3 to Cadd9 lifts the middle finger: Cadd9 takes its second book
        // fingering, 0-1-0-3, and the D keeps the index. A change that only lifts says the
        // lift (#1837).
        expect(lines(['Csus2', 'Cadd9', 'C'], uke).slice(0, 2)).toEqual([
            'Fingers 1 and 3 stay down; lift finger 2.',
            'Finger 3 stays down; lift finger 1.',
        ]);
        // Into G the index stays on that D.
        expect(lines(['Cadd9', 'G', 'D', 'Em'], uke)[0]).toBe(
            'Finger 1 stays down on D: the 9th becomes the 5th; ' +
                'finger 2 goes down on the A string, fret 2; ' +
                'finger 3 moves to the E string, fret 3.',
        );
    });

    it('Am6 2 4 2 3 is the index across the G and E strings under the ring finger (#1823)', () => {
        // The barre runs from the G string to the E string at the 2nd fret; the ring finger
        // frets the C string above it, as the charts print it.
        expect(lines(['Am', 'Am6'], uke)[0]).toBe(
            'A is in both chords; finger 1 bars fret 2 on the G, C and E strings; ' +
                'finger 2 moves to the A string, fret 3; ' +
                'finger 3 goes down on the C string, fret 4.',
        );
        // From Am6 to Am the index stays on the G string's A.
        expect(lines(['Am6', 'Am'], uke)[0]).toBe(
            'Finger 1 stays down on A; lift fingers 2 and 3.',
        );
        // Into E7 the index slides out of the barre to the G string's 1st fret.
        expect(lines(['Am6', 'E7'], uke)[0]).toBe(
            'Finger 1 slides down 1 fret; finger 2 moves to the C string, fret 2; ' +
                'finger 3 moves to the A string, fret 2.',
        );
    });

    it('guitar A at the nut: the ring finger on the B string, sliding a fret (#1834)', () => {
        // D x x x 2 3 2 to A x x x 2 2 0 keeps the index on the G string's A, and the ring
        // finger slides down the B string (A 1-3). It was 1-2: "finger 2 moves to the 2nd
        // string, fret 2", the middle finger on the B string.
        expect(lines(['D', 'A'], guitar([1, 6]), 'D')).toEqual([
            'Finger 1 stays down on A: the 5th becomes the root; finger 3 slides down 1 fret.',
            'Finger 1 stays down on A: the root becomes the 5th; ' +
                'finger 2 goes down on the 1st string, fret 2; finger 3 slides up 1 fret.',
        ]);
        // A and Asus4 x x x 2 3 0, in either order: the ring finger slides a fret, the middle
        // finger staying (both 2-3).
        const up = 'Finger 2 stays down; finger 3 slides up 1 fret.';
        const down = 'Finger 2 stays down; finger 3 slides down 1 fret.';
        expect(lines(['A', 'Asus4', 'A'], guitar([1, 6]), 'A').slice(0, 2)).toEqual([up, down]);
        expect(lines(['Asus4', 'A', 'Asus4'], guitar([1, 6]), 'A').slice(0, 2)).toEqual([down, up]);
    });

    it('guitar open C keeps 3-2 and the chord beside it adds or lifts a finger (#1835)', () => {
        // C x 3 2 0 x x was 2-1 beside these, both fingertips a fret past their own: "finger
        // 1 bars fret 2" into Am, "fingers 1 and 2 stay down; finger 3 goes down" into C7.
        // C7 and Cmaj7 are C with the little finger added (3-2-4), Am x 3 2 2 x x C with the
        // index added (3-2-1), and back to C the index lifts.
        expect(lines(['C', 'Am'], guitar(null))).toEqual([
            'Fingers 2 and 3 stay down: E becomes the 5th and C the 3rd; ' +
                'finger 1 goes down on the 3rd string, fret 2.',
            'Fingers 2 and 3 stay down: E becomes the 3rd and C the root; lift finger 1.',
        ]);
        expect(lines(['C', 'C7'], guitar([1, 6]))).toEqual([
            'Fingers 2 and 3 stay down; finger 4 goes down on the 3rd string, fret 3.',
            'Fingers 2 and 3 stay down; lift finger 4.',
        ]);
        expect(lines(['C', 'Cmaj7'], guitar([1, 6]))[0]).toBe(
            'Fingers 2 and 3 stay down; finger 4 goes down on the 3rd string, fret 4.',
        );
    });
});
