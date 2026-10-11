/**
 * The neck view's follow logic (#1587), on real band charts (`bandChart` over a compiled
 * timeline): which grip sounds at a performed slot, which comes next in performance order, and
 * the headline and finger detail between them.
 */
import { compileTimeline } from '@band/index';
import type { ScoreEvent, ScoreMeasure, SemanticScore } from '@engine/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { bandChart } from '../lib/band-chart';
import { GUITAR, voiceBandChart } from '../lib/voicings';
import {
    changePosition,
    chordChanges,
    endsRun,
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
const view = (sections: SemanticScore['sections']) => {
    const score: SemanticScore = {
        notation: 'name',
        key: 'C',
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
            'Starts on Dm7 · then G7: root up a 4th, over to the 6th string, 2 frets lower',
        );
        expect(model.fingers).toBe(
            'Finger 2 stays down; finger 1 goes down on the 6th string, fret 3; ' +
                'finger 3 moves to the 3rd string, fret 4.',
        );
    });

    it('playing, names the next chord and the root move', () => {
        const model = neckModel(band, voiced, 0, GUITAR)!;
        expect(model.headline).toBe(
            'Next: G7 · root up a 4th, over to the 6th string, 2 frets lower',
        );
        expect(model.fingers).not.toMatch(/lifts off/);
        const second = neckModel(band, voiced, 1, GUITAR)!;
        expect(second.headline).toBe('Next: Cmaj7#5 · root up a 4th, same fret, one string over');
        expect(second.fingers).toBe(
            'Finger 3 stays down; finger 2 moves to the 5th string, fret 3; ' +
                'finger 4 goes down on the 2nd string, fret 5.',
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
            'Finger 1 stays down; finger 2 goes down on the 2nd string, fret 6.',
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
