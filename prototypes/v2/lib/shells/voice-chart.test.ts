/**
 * `voiceBandChart` (#1585) on a real `BandChart`: written chords voice in written order, holds
 * and N.C. are skipped, and each voicing keeps the index of the written event it came from.
 */
import { compileTimeline } from '@band/index';
import type { ScoreEvent, SemanticScore } from '@engine/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { bandChart } from '../band-chart';
import { voiceBandChart } from './voice-chart';
import { inHome } from './voicing';

const chord = (symbol: string): ScoreEvent => ({ kind: 'chord', symbol, duration: [4, 1] });

/** Dm7 | G7 | Cmaj7 | hold | N.C. */
const twoFiveOne: SemanticScore = {
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter: '4/4',
    grouping: null,
    sections: [
        {
            id: 'a',
            label: 'A',
            repeat: 1,
            measures: [
                [chord('Dm7')],
                [chord('G7')],
                [chord('Cmaj7')],
                [{ kind: 'hold', duration: [4, 1] } as ScoreEvent],
                [{ kind: 'no-chord', duration: [4, 1] } as ScoreEvent],
            ].map((events, i) => ({ id: `m${i}`, content: { kind: 'events', events } })),
        },
    ],
};

describe('voiceBandChart', () => {
    it('voices a ii–V–I in frets 2–7 and skips the hold and the N.C.', () => {
        const chart = bandChart(twoFiveOne, compileTimeline(twoFiveOne));
        expect(chart.chords.map((c) => c.kind)).toEqual([
            'chord',
            'chord',
            'chord',
            'hold',
            'no-chord',
        ]);
        const voiced = voiceBandChart(chart, {
            instrument: 'guitar',
            home: [2, 7],
            rootStrings: 'all',
        });
        expect(voiced.map((v) => v.symbol)).toEqual(['Dm7', 'G7', 'Cmaj7']);
        expect(voiced.map((v) => v.globalIndex)).toEqual([0, 1, 2]);
        expect(voiced.map((v) => v.approximation)).toEqual([null, null, null]);
        expect(voiced.every((v) => inHome(v, [2, 7]))).toBe(true);
    });

    it('classic root strings keep guitar roots on the 6th and 5th; a uke ignores them', () => {
        const chart = bandChart(twoFiveOne, compileTimeline(twoFiveOne));
        const classic = voiceBandChart(chart, {
            instrument: 'guitar',
            home: [2, 7],
            rootStrings: 'classic',
        });
        expect(classic.every((v) => [6, 5].includes(v.shape.rootString))).toBe(true);
        const uke = voiceBandChart(chart, {
            instrument: 'uke-low-g',
            home: null,
            rootStrings: 'classic',
        });
        expect(uke).toHaveLength(3);
    });
});
