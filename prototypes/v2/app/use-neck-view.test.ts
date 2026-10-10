/**
 * The neck view's follow logic (#1587), on real band charts (`bandChart` over a compiled
 * timeline): which grip sounds at a performed slot, which comes next in performance order, and
 * the narration between them.
 */
import { compileTimeline } from '@band/index';
import type { ScoreEvent, ScoreMeasure, SemanticScore } from '@engine/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { bandChart } from '../lib/band-chart';
import { GUITAR, voiceBandChart } from '../lib/shells';
import {
    firstVoicedSlot,
    neckModel,
    nextVoicedSlot,
    soundingSlot,
    writtenName,
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

describe('neckModel', () => {
    const band = view([
        {
            id: 'a',
            label: 'A',
            repeat: 1,
            measures: [
                bar('m1', [chord('Dm7', 4)]),
                bar('m2', [chord('G7', 4)]),
                bar('m3', [chord('C', 4)]),
                bar('m4', [hold]),
            ],
        },
    ]);
    const voiced = new Map(
        voiceBandChart(band, { instrument: 'guitar', home: [2, 7], rootStrings: 'all' }).map(
            (v) => [v.globalIndex, v] as const,
        ),
    );

    it('stopped, shows the first grip and narrates the change to the second', () => {
        const model = neckModel(band, voiced, null, GUITAR)!;
        expect(model.name).toBe('Dm7');
        expect(model.nextName).toBe('G7');
        expect(model.grip?.symbol).toBe('Dm7');
        expect(model.narration).toMatch(/^Starts on Dm7\. Then G7: root up a 4th/);
    });

    it('playing, names the next chord and the root move', () => {
        const model = neckModel(band, voiced, 0, GUITAR)!;
        expect(model.narration).toMatch(/^Next: G7\. Root up a 4th/);
        expect(model.narration).not.toMatch(/lifts off/);
    });

    it('says when the grip approximates the written chord, and holds it dimmed under a hold', () => {
        const triad = neckModel(band, voiced, 2, GUITAR)!;
        expect(triad.name).toBe('C');
        expect(triad.grip?.symbol).toBe('Cmaj7');
        expect(triad.approximatedFrom).toBe('C');
        const held = neckModel(band, voiced, 3, GUITAR)!;
        expect(held.held).toBe('hold');
        expect(held.grip).toBe(triad.grip);
        expect(held.nextName).toBe('Dm7');
    });

    it('writes chord names in letters, as the chart prints them', () => {
        expect(band.chords.map(writtenName)).toEqual(['Dm7', 'G7', 'C', expect.any(String)]);
    });
});
