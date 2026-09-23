import { TIME_SIGNATURES } from '@engine/config';
import { buildLeadSheetSections } from '@engine/song/lead-sheet-model';
import { useMemo } from 'react';
import { type ChartBlock, scoreDisplayIndices, scoreLeadSheet } from '../lib/lead-sheet';
import type { ChartDocument } from '../lib/runtime';
import * as runtime from '../lib/runtime';

/**
 * What the chart sheet draws for the open song: the engine's arranged progression laid out as
 * lead-sheet blocks, the written bars/sections behind them, and where playback is right now.
 * `active` is the engine's sounding chord index, or null while stopped. On the band engine a
 * score is drawn from its timeline instead (`lib/band-chart.ts`), and `active` is a slot there.
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
        if (band) {
            return band.blocks;
        }
        const a = runtime.state().arranger;
        if (current.schemaVersion === 2) {
            const writtenCount = current.chart.score.sections.reduce(
                (n, section) => n + section.measures.length,
                0,
            );
            const visitedCount = new Set(a.progression.map((chord) => chord.measureId)).size;
            return scoreLeadSheet(
                a,
                current.chart.score,
                visitedCount < writtenCount ? runtime.writtenChart() : undefined,
            );
        }
        return buildLeadSheetSections(a.progression, a.sections, TIME_SIGNATURES[a.timeSignature]);
    }, [current, band]);
    const displayIndices = useMemo(
        () =>
            band
                ? band.slots.map((slot) => slot.display)
                : current?.schemaVersion === 2
                  ? scoreDisplayIndices(runtime.state().arranger)
                  : [],
        [current, band],
    );
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
