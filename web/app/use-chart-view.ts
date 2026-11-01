import { useMemo } from 'react';
import type { BandChart } from '../lib/band-chart';
import type { ChartBlock } from '../lib/lead-sheet';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';

/** One empty chart, so a page with no song open hands its readers the same array each render. */
const NO_BLOCKS: ChartBlock[] = [];

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
 * not just its last pass. The chart passes `(slot) => slot.bar` for the band's slots.
 */
export function nextBarIndex<T extends { start: number }>(
    items: readonly T[],
    active: number,
    barOf: (item: T) => number,
): number | null {
    if (active < 0 || active >= items.length) {
        return null;
    }
    const activeBar = barOf(items[active]);
    let i = active + 1;
    while (i < items.length && barOf(items[i]) === activeBar) {
        i += 1;
    }
    return i < items.length ? i : 0;
}

/**
 * What the chart sheet draws for the open song: lead-sheet blocks drawn from the band's timeline
 * (`lib/band-chart.ts`), the written bars/sections behind them, and where playback is right now —
 * `active` is a slot of that timeline, null while stopped.
 */
export function useChartView(
    current: ChartDocument | null,
    active: number | null,
    playing: boolean,
    countInSlot: number | null = null,
    polledView: BandChart | null = null,
) {
    // Read again whenever the open document changes (`runtime.load`/`editScore` rebuild the
    // view), and when playback starts or stops: a song-mode performance (#1784) is drawn from its
    // own counted timeline, so `active` indexes that view's slots only while it plays. And when
    // the playback poll reads a different view in the same paint as `active` (`polledView`): a
    // section loop (#1989) set, or cleared mid-play at the barline the band carries on from.
    // biome-ignore lint/correctness/useExhaustiveDependencies: `playing` and `polledView` are re-read triggers.
    const band = useMemo(
        (): BandChart | null => (current ? runtime.bandChartView() : null),
        [current, playing, polledView],
    );
    const blocks = band?.blocks ?? NO_BLOCKS;
    const displayActive = active === null ? null : (band?.slots[active]?.display ?? active);
    /**
     * The next performed bar's display index (#1458's next-bar cue), skipping past any further
     * chords still inside `active`'s own bar, then wrapping across a repeat and the form's own
     * loop back to the top — see `nextBarIndex` above.
     */
    const displayNext = ((): number | null => {
        if (active === null || !band) {
            return null;
        }
        const next = nextBarIndex(band.slots, active, (slot) => slot.bar);
        return next === null ? null : band.slots[next].display;
    })();
    /** The display index of the bar the count-in leads into (the countdown is drawn on it). */
    const displayCountIn =
        countInSlot === null ? null : (band?.slots[countInSlot]?.display ?? countInSlot);
    const activeEvent = active === null ? null : (band?.slots[active] ?? null);
    /** The performed bar `active` sits in (`BandSlot.bar`); null while stopped. Used to de-dupe
     * the jump-ahead by performed bar (patch review P3-2), not by slot index — a chord landing
     * exactly on the last felt pulse changes `active`'s slot without changing its bar, and keying
     * on the slot would let that trigger the jump a second time inside the very same bar. */
    const activeBar = active === null ? null : (band?.slots[active]?.bar ?? null);
    const totalBars = blocks.reduce((n, b) => n + b.measures.length, 0);
    const writtenBars = useMemo(
        () =>
            new Map(
                current?.chart.score.sections.flatMap((section) =>
                    section.measures.map((bar) => [bar.id, bar] as const),
                ) ?? [],
            ),
        [current],
    );
    const writtenSections = useMemo(
        () =>
            new Map(
                current?.chart.score.sections.map((section) => [section.id, section] as const) ??
                    [],
            ),
        [current],
    );
    return {
        /** The chart the band performs (`runtime.bandChartView()`); null for no chart. */
        followChart: band,
        blocks,
        displayActive,
        displayNext,
        displayCountIn,
        activeEvent,
        activeBar,
        totalBars,
        writtenBars,
        writtenSections,
    };
}
