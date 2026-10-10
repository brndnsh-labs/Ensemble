/**
 * @vitest-environment happy-dom
 */
/**
 * `legacyBandChart` (#1587): a measure-less (schemaVersion 1) chart, loaded into the runtime the
 * way the stand loads it, becomes the same `BandChart` shape the neck follows for a score —
 * written chords in written order, one slot per step-map entry performing chord `i`.
 */

import { PPQ } from '@band/index';
import { TIME_SIGNATURES } from '@engine/config';
import { buildLeadSheetSections } from '@engine/song/lead-sheet-model';
import type { ChartDocument } from '@engine/songbook/types';
import { describe, expect, it } from 'vitest';
import { firstVoicedSlot, neckModel, nextVoicedSlot } from '../../app/use-neck-view';
import { load, state } from '../runtime';
import { bandForGenre } from '../standards';
import { GUITAR } from './instruments';
import { legacyBandChart } from './legacy-chart';
import { voiceBandChart } from './voice-chart';

function v1Chart(value: string): ChartDocument {
    return {
        schemaVersion: 1,
        id: 'legacy-neck',
        title: 'Legacy neck',
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-01T12:00:00.000Z',
        revision: 0,
        chart: {
            arrangement: {
                sections: [{ id: 'a', label: 'A', value, repeat: 1 }],
                key: 'C',
                timeSignature: '4/4',
                grouping: null,
                isMinor: false,
                notation: 'name',
            },
            performance: { bpm: 120, seed: '', randomizeSeed: false },
            band: bandForGenre('Jazz'),
        },
    };
}

/** Loads a v1 chart and reads the two maps the stand reads for it. */
function loaded(value: string) {
    load(v1Chart(value));
    const a = state().arranger;
    const blocks = buildLeadSheetSections(
        a.progression,
        a.sections,
        TIME_SIGNATURES[a.timeSignature],
    );
    return { blocks, stepMap: a.stepMap };
}

describe('legacyBandChart', () => {
    it('lays a v1 chart out as written chords and 1:1 performed slots', () => {
        const { blocks, stepMap } = loaded('Dm7 | G7 | Cmaj7 C6 | Cmaj7');
        const chart = legacyBandChart(blocks, stepMap);
        expect(chart.chords.map((c) => c.absName)).toEqual(['Dm7', 'G7', 'Cmaj7', 'C6', 'Cmaj7']);
        expect(chart.chords.map((c) => c.globalIndex)).toEqual([0, 1, 2, 3, 4]);
        expect(chart.chords.every((c) => c.kind === 'chord' && c.chord !== null)).toBe(true);
        expect(chart.chords[0].chord?.root).toBe(2);
        expect(chart.slots).toHaveLength(stepMap.length);
        expect(chart.slots.map((s) => s.display)).toEqual([0, 1, 2, 3, 4]);
        // Two chords in bar 3 share its bar; ticks are the step map's sixteenths.
        expect(chart.slots.map((s) => s.bar)).toEqual([0, 1, 2, 2, 3]);
        expect(chart.slots[1]).toMatchObject({ start: 16, end: 32, from: 4 * PPQ, to: 8 * PPQ });
        expect(chart.slots[3]).toMatchObject({ start: 40, end: 48 });
        expect(chart.sections).toEqual([]);
    });

    it('the neck follows it: Dm7 previews G7, and a voiced grip sounds', () => {
        const { blocks, stepMap } = loaded('Dm7 | G7 | Cmaj7 | Cmaj7');
        const chart = legacyBandChart(blocks, stepMap);
        expect(firstVoicedSlot(chart)).toBe(0);
        expect(nextVoicedSlot(chart, 0)).toBe(1);
        // Cmaj7 again is the same grip, so the next change from Cmaj7 wraps to the top.
        expect(nextVoicedSlot(chart, 2)).toBe(0);
        const voiced = new Map(
            voiceBandChart(chart, { instrument: 'guitar', home: [2, 7], rootStrings: 'all' }).map(
                (v) => [v.globalIndex, v] as const,
            ),
        );
        expect(voiced.size).toBe(4);
        const stopped = neckModel(chart, voiced, null, GUITAR);
        expect(stopped).toMatchObject({ name: 'Dm7', nextName: 'G7', held: null });
        expect(stopped?.grip?.symbol).toBe('Dm7');
        expect(neckModel(chart, voiced, 1, GUITAR)).toMatchObject({
            name: 'G7',
            nextName: 'Cmaj7',
        });
    });

    it('keeps only the slots both maps describe if they ever disagree', () => {
        const { blocks, stepMap } = loaded('Dm7 | G7 | Cmaj7');
        const chart = legacyBandChart(blocks, stepMap.slice(0, 2));
        expect(chart.chords).toHaveLength(3);
        expect(chart.slots).toHaveLength(2);
    });
});
