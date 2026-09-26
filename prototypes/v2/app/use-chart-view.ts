import { TIME_SIGNATURES } from '@engine/config';
import { buildLeadSheetSections } from '@engine/song/lead-sheet-model';
import { useMemo } from 'react';
import type { ChartBlock } from '../lib/lead-sheet';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';

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
    return { blocks, displayActive, activeEvent, totalBars, writtenBars, writtenSections };
}
