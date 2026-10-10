import { TIME_SIGNATURES } from '@engine/config';
import { buildLeadSheetSections } from '@engine/song/lead-sheet-model';
import { useMemo } from 'react';
import type { BandChart } from '../lib/band-chart';
import { type ChartBlock, measureOfGlobalIndex } from '../lib/lead-sheet';
import { legacyBandChart } from '../lib/legacy-band-chart';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';

/**
 * The next performed item whose PERFORMED BAR differs from `active`'s (#1458's next-bar cue) —
 * walking forward past every further chord still inside that same bar, not just `active + 1`,
 * which a bar holding more than one chord would otherwise point the cue at itself with (P1-1).
 * Wraps to item 0 once none remain (the band loops the whole form at the end, so after the
 * last bar comes the top).
 *
 * `barOf` identifies "performed bar", which is deliberately NOT "written measure": a `||: F7 :||
 * x4` repeat performs the SAME written bar four times, and each of those four is its own
 * performed bar — comparing by WRITTEN identity (a patch review P2-1 regression) would skip all
 * four as "the same bar" and point the cue at whatever follows the repeat for the entire time,
 * not just its last pass. `barOf` is `(slot) => slot.bar` for the band's slots (schemaVersion 2)
 * and `(_, index) => measureOfGlobalIndex(...).get(index)` for the old engine's `stepMap` (a
 * measure-less chart, where the two notions coincide — see that function's doc); it takes the
 * item's INDEX too so a caller with no per-item field to read (v1) can pass the raw array
 * straight through instead of copying it into one that has one.
 */
export function nextBarIndex<T extends { start: number }>(
    items: readonly T[],
    active: number,
    barOf: (item: T, index: number) => number,
): number | null {
    if (active < 0 || active >= items.length) {
        return null;
    }
    const activeBar = barOf(items[active], active);
    let i = active + 1;
    while (i < items.length && barOf(items[i], i) === activeBar) {
        i += 1;
    }
    return i < items.length ? i : 0;
}

/**
 * What the chart sheet draws for the open song: lead-sheet blocks, the written bars/sections
 * behind them, and where playback is right now. A score (schemaVersion 2) is drawn from the
 * band's timeline (`lib/band-chart.ts`), and `active` is a slot there; a measure-less chart is
 * the old arranged progression, and `active` its chord index. Null while stopped.
 */
export function useChartView(current: ChartDocument | null, active: number | null) {
    const band = useMemo(
        () => (current?.schemaVersion === 2 ? runtime.bandChartView() : null),
        [current],
    );
    const blocks = useMemo((): ChartBlock[] => {
        if (!current) {
            return [];
        }
        if (current.schemaVersion === 2) {
            return band?.blocks ?? [];
        }
        const a = runtime.state().arranger;
        return buildLeadSheetSections(a.progression, a.sections, TIME_SIGNATURES[a.timeSignature]);
    }, [current, band]);
    // What follows the band (the neck): the score's chart, or a measure-less chart's equivalent
    // built from the old maps. `band` itself stays null there — its truthiness means schema 2.
    const followChart = useMemo(
        (): BandChart | null =>
            band ??
            (blocks.length ? legacyBandChart(blocks, runtime.state().arranger.stepMap) : null),
        [band, blocks],
    );
    const displayIndices = useMemo(() => band?.slots.map((slot) => slot.display) ?? [], [band]);
    const displayActive = active === null ? null : (displayIndices[active] ?? active);
    const measureOf = useMemo(() => measureOfGlobalIndex(blocks), [blocks]);
    /**
     * The next performed bar's display index (#1458's next-bar cue), skipping past any further
     * chords still inside `active`'s own bar, then wrapping across a repeat and the form's own
     * loop back to the top — see `nextBarIndex` above.
     *
     * Read plain, not memoized — same as `displayActive`/`activeEvent` below, which read
     * `runtime.state()` fresh every call: this hook has no render boundary of its own, so it
     * runs again whenever its caller does.
     */
    const displayNext = ((): number | null => {
        if (active === null) {
            return null;
        }
        if (band) {
            const next = nextBarIndex(band.slots, active, (slot) => slot.bar);
            return next === null ? null : band.slots[next].display;
        }
        // No per-item field to read `barOf` off (a measure-less chart's `display` IS its index),
        // so the raw `stepMap` goes straight in — no per-render copy (patch review P3-6).
        const stepMap = runtime.state().arranger.stepMap;
        return nextBarIndex(stepMap, active, (_step, i) => measureOf.get(i) ?? -1);
    })();
    const activeEvent =
        active === null
            ? null
            : band
              ? (band.slots[active] ?? null)
              : runtime.state().arranger.stepMap[active];
    /** The performed bar `active` sits in — `BandSlot.bar` for schemaVersion 2, its own written
     * measure's ordinal for a measure-less chart (the two coincide there — see
     * `measureOfGlobalIndex`'s doc). Null while stopped. Used to de-dupe the jump-ahead by
     * performed bar (patch review P3-2), not by slot index — a chord landing exactly on the last
     * felt pulse changes `active`'s slot without changing its bar, and keying on the slot would
     * let that trigger the jump a second time inside the very same bar. */
    const activeBar =
        active === null
            ? null
            : band
              ? (band.slots[active]?.bar ?? null)
              : (measureOf.get(displayActive ?? -1) ?? null);
    const totalBars = blocks.reduce((n, b) => n + b.measures.length, 0);
    const writtenBars = useMemo(
        () =>
            new Map(
                current?.schemaVersion === 2
                    ? current.chart.score.sections.flatMap((section) =>
                          section.measures.map((bar) => [bar.id, bar] as const),
                      )
                    : [],
            ),
        [current],
    );
    const writtenSections = useMemo(
        () =>
            new Map(
                current?.schemaVersion === 2
                    ? current.chart.score.sections.map((section) => [section.id, section] as const)
                    : [],
            ),
        [current],
    );
    return {
        /** The band's chart (`runtime.bandChartView()`), memoized per document; null for a measure-less chart. */
        band,
        /** The chart the band performs, for either schema (`band`, or `legacyBandChart` for a
         * measure-less chart); null for an empty chart. */
        followChart,
        blocks,
        displayActive,
        displayNext,
        activeEvent,
        activeBar,
        totalBars,
        writtenBars,
        writtenSections,
    };
}
