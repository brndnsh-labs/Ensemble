import { TIME_SIGNATURES } from '@engine/config';
import { buildLeadSheetSections } from '@engine/song/lead-sheet-model';
import { useMemo } from 'react';
import type { ChartBlock } from '../lib/lead-sheet';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';

/**
 * A `{ start }`-shaped item's index right after `active`, wrapping to the loop's first item
 * once `active` is the last one inside it (or to item 0 when `loop` is null — the band loops
 * the whole form at the end, so after the last slot comes the top). Shared by the band's slots
 * (schemaVersion 2) and the old engine's `stepMap` (a measure-less chart) — both are performed
 * order already, so the wrap is the only thing that differs from "the next item."
 */
function nextIndex(
    items: readonly { start: number }[],
    active: number,
    loop: { start: number; end: number } | null,
): number | null {
    if (active < 0 || active >= items.length) {
        return null;
    }
    const inRange = (i: number) =>
        i >= 0 &&
        i < items.length &&
        (!loop || (items[i].start >= loop.start && items[i].start < loop.end));
    if (inRange(active + 1)) {
        return active + 1;
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
    /**
     * The next performed bar's display index (#1458's next-bar cue), wrapping across a repeat,
     * the form's own loop back to the top, and an active practice loop — see `nextIndex` above.
     * Read plain, like `displayActive`/`activeEvent` below: this hook already re-runs on every
     * render while playing (the 60ms poll in `app/ensemble.tsx`), so a fresh `playback` read here
     * costs nothing and needs no memo — one that only kept `active`/`band` as deps would miss a
     * loop arming or clearing on a bar that hasn't advanced off yet.
     */
    const displayNext = ((): number | null => {
        if (active === null) {
            return null;
        }
        const { loopStartStep, loopEndStep } = runtime.state().playback;
        const loop = loopStartStep >= 0 ? { start: loopStartStep, end: loopEndStep } : null;
        if (band) {
            const next = nextIndex(band.slots, active, loop);
            return next === null ? null : band.slots[next].display;
        }
        return nextIndex(runtime.state().arranger.stepMap, active, loop);
    })();
    const activeEvent =
        active === null
            ? null
            : band
              ? (band.slots[active] ?? null)
              : runtime.state().arranger.stepMap[active];
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
        totalBars,
        writtenBars,
        writtenSections,
    };
}
