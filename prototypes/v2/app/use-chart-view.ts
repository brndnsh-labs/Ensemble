import { TIME_SIGNATURES } from '@engine/config';
import { buildLeadSheetSections } from '@engine/song/lead-sheet-model';
import { useMemo } from 'react';
import type { ChartBlock } from '../lib/lead-sheet';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';

/**
 * Every written event's `globalIndex`, bucketed by which WRITTEN MEASURE it belongs to (an
 * ordinal position among every measure in `blocks`, in written order). This is a measure-less
 * (v1) chart's only notion of "performed bar" — v1 has no repeat/ending marks (`ScoreDirection`
 * is a schemaVersion-2 concept only), so its performance is one straight pass and "written
 * measure" and "performed bar" name the exact same thing there. For a schemaVersion-2 chart,
 * `BandSlot.bar` (`lib/band-chart.ts`) is the real performed-bar identity instead — see
 * `nextBarIndex`'s doc for why the two must NOT be conflated.
 */
export function measureOfGlobalIndex(blocks: ChartBlock[]): Map<number, number> {
    const map = new Map<number, number>();
    let m = 0;
    for (const block of blocks) {
        for (const measure of block.measures) {
            for (const chord of measure.chords) {
                map.set(chord.globalIndex, m);
            }
            m += 1;
        }
    }
    return map;
}

/**
 * The next performed item whose PERFORMED BAR differs from `active`'s (#1458's next-bar cue) —
 * walking forward past every further chord still inside that same bar, not just `active + 1`,
 * which a bar holding more than one chord would otherwise point the cue at itself with (P1-1).
 * Wraps to the loop's first item once none remain inside it, or to item 0 when `loop` is null
 * (the band loops the whole form at the end, so after the last bar comes the top).
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
    loop: { start: number; end: number } | null,
    barOf: (item: T, index: number) => number,
): number | null {
    if (active < 0 || active >= items.length) {
        return null;
    }
    const activeBar = barOf(items[active], active);
    const inLoop = (i: number) =>
        i >= 0 &&
        i < items.length &&
        (!loop || (items[i].start >= loop.start && items[i].start < loop.end));
    let i = active + 1;
    while (inLoop(i) && barOf(items[i], i) === activeBar) {
        i += 1;
    }
    if (inLoop(i)) {
        return i;
    }
    if (loop) {
        const start = items.findIndex((item) => item.start >= loop.start && item.start < loop.end);
        return start >= 0 ? start : null;
    }
    return items.length > 0 ? 0 : null;
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
    const displayIndices = useMemo(() => band?.slots.map((slot) => slot.display) ?? [], [band]);
    const displayActive = active === null ? null : (displayIndices[active] ?? active);
    const measureOf = useMemo(() => measureOfGlobalIndex(blocks), [blocks]);
    /**
     * The next performed bar's display index (#1458's next-bar cue), skipping past any further
     * chords still inside `active`'s own bar, then wrapping across a repeat, the form's own loop
     * back to the top, and an active practice loop — see `nextBarIndex` above.
     *
     * Read plain, not memoized — same as `displayActive`/`activeEvent` below, which read
     * `runtime.state()` fresh every call for the same reason: this hook has no render boundary of
     * its own, so it runs again whenever its caller does, including the render `app/ensemble.tsx`
     * makes when ITS `loopedSectionId` state changes (a genuine value change, so React does not
     * bail out of it) — which is what makes arming or clearing a practice loop reach this
     * computation immediately, even on a bar `active` hasn't moved off yet. A `useMemo` keyed on
     * `[active, band]` alone would miss exactly that render.
     */
    const displayNext = ((): number | null => {
        if (active === null) {
            return null;
        }
        const { loopStartStep, loopEndStep } = runtime.state().playback;
        const loop = loopStartStep >= 0 ? { start: loopStartStep, end: loopEndStep } : null;
        if (band) {
            const next = nextBarIndex(band.slots, active, loop, (slot) => slot.bar);
            return next === null ? null : band.slots[next].display;
        }
        // No per-item field to read `barOf` off (a measure-less chart's `display` IS its index),
        // so the raw `stepMap` goes straight in — no per-render copy (patch review P3-6).
        const stepMap = runtime.state().arranger.stepMap;
        return nextBarIndex(stepMap, active, loop, (_step, i) => measureOf.get(i) ?? -1);
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
