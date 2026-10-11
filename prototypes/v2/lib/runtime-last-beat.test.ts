/**
 * @vitest-environment happy-dom
 */
/**
 * The neck's cue, read through the runtime (#1590): the last felt pulse before the slot under
 * the playhead ends, for a score and for a measure-less (v1) chart, while the chart sheet's
 * next-bar cue (`inLastBeat`) stays on the barline. Both are pure reads of a song tick, so
 * nothing here plays: an export hands the band host the chart's timeline, as Play would.
 */

import { PPQ } from '@band/index';
import type { ChartDocumentV2, ScoreEvent } from '@engine/songbook/score-types';
import type { ChartDocument } from '@engine/songbook/types';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./band-export', () => ({
    downloadExportResult: vi.fn(),
    renderBandMixToWav: vi.fn(),
    renderBandStemsToWav: vi.fn(),
}));

const chord = (symbol: string, quarters: number): ScoreEvent => ({
    kind: 'chord',
    symbol,
    duration: [quarters, 1],
});

/** The runtime with `document` open and its timeline on the band host. */
async function opened(build: (standard: ChartDocumentV2) => ChartDocument | ChartDocumentV2) {
    vi.resetModules();
    const [runtime, { buildStandardDocument, STANDARDS }] = await Promise.all([
        import('./runtime'),
        import('./standards'),
    ]);
    runtime.load(build(buildStandardDocument(STANDARDS[0])) as ChartDocument);
    await runtime.exportMidi('cue');
    /** The neck's cue and the chart's, as the stand reads them in one paint at `tick`. */
    const at = (tick: number) => ({
        slot: runtime.playheadSlot(tick),
        change: runtime.inLastBeatOfSlot(tick, runtime.playheadSlot(tick)),
        bar: runtime.inLastBeat(tick),
    });
    return { runtime, at };
}

/** `| Dm7 G7 | Cmaj7 |` as a score: the change to G7 is on beat 3 of bar 1. */
const twoChordBar = (standard: ChartDocumentV2): ChartDocumentV2 => ({
    ...standard,
    chart: {
        ...standard.chart,
        score: {
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
                        {
                            id: 'm1',
                            content: { kind: 'events', events: [chord('Dm7', 2), chord('G7', 2)] },
                        },
                        { id: 'm2', content: { kind: 'events', events: [chord('Cmaj7', 4)] } },
                    ],
                },
            ],
        },
    },
});

/** The same changes as a v1 chord list, which the old maps draw and `legacyBandChart` follows. */
const twoChordBarV1 = (standard: ChartDocumentV2): ChartDocument => ({
    schemaVersion: 1,
    id: 'v1-cue',
    title: 'v1 cue',
    createdAt: standard.createdAt,
    updatedAt: standard.updatedAt,
    revision: 0,
    chart: {
        arrangement: {
            sections: [{ id: 'a', label: 'A', value: 'Dm7 G7 | Cmaj7' }],
            key: 'C',
            timeSignature: '4/4',
            grouping: null,
            isMinor: false,
            notation: 'name',
        },
        performance: standard.chart.performance,
        band: standard.chart.band,
    },
});

describe('the neck’s last beat before the change (#1590)', () => {
    for (const [name, build] of [
        ['a score', twoChordBar],
        ['a measure-less (v1) chart', twoChordBarV1],
    ] as const) {
        it(`fires in the last beat of each chord of a two-chord bar: ${name}`, async () => {
            const { at } = await opened(build);
            // The host's 120 bpm: a beat is 500ms, under the 600ms floor, so each cue opens
            // 1.2 beats before its change (`BandHost.inLastPulseBefore`).
            const LEAD = PPQ + PPQ / 5;
            // Dm7, beats 1–2: quiet, then the cue before beat 3 — mid-bar, where the chart's
            // own next-bar cue has nothing to say.
            expect(at(0)).toEqual({ slot: 0, change: false, bar: false });
            expect(at(2 * PPQ - LEAD - 1)).toEqual({ slot: 0, change: false, bar: false });
            expect(at(2 * PPQ - LEAD)).toEqual({ slot: 0, change: true, bar: false });
            expect(at(2 * PPQ - 1)).toEqual({ slot: 0, change: true, bar: false });
            // G7, beats 3–4: quiet again at the change, then both cues before the barline.
            expect(at(2 * PPQ)).toEqual({ slot: 1, change: false, bar: false });
            expect(at(4 * PPQ - LEAD - 1)).toEqual({ slot: 1, change: false, bar: false });
            expect(at(4 * PPQ - LEAD)).toEqual({ slot: 1, change: true, bar: true });
            // Cmaj7, a whole bar: the end of it only.
            expect(at(4 * PPQ)).toEqual({ slot: 2, change: false, bar: false });
            expect(at(8 * PPQ - LEAD - 1)).toEqual({ slot: 2, change: false, bar: false });
            expect(at(8 * PPQ - LEAD)).toEqual({ slot: 2, change: true, bar: true });
        });
    }

    it('is false with no tick, off any slot, and for a slot the chart does not have', async () => {
        const { runtime } = await opened(twoChordBar);
        expect(runtime.inLastBeatOfSlot(null, 0)).toBe(false);
        expect(runtime.inLastBeatOfSlot(PPQ, -1)).toBe(false);
        expect(runtime.inLastBeatOfSlot(PPQ, 99)).toBe(false);
    });
});
