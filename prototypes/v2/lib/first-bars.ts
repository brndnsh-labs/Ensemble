import { resolveScoreMeasureEvents } from '@engine/songbook/score-measure-events';
import { chordNames } from './band-chart';
import type { ChartDocument } from './documents';

/**
 * The chart's first `count` written bars as chord text, for the Continue card (#1441) — the
 * song's own chords, never a sample. A measure chart (schemaVersion 2) is read in written order
 * with `%` repeats resolved to the chords they stand for and each symbol named the way the chart
 * sheet's letter notation names it (`chordNames`); a hold reads `/` and no-chord `N.C.`, as they do
 * on the stand. A measure-less chart is its first section texts split at bar lines.
 */
export function firstBars(document: ChartDocument, count: number): string[] {
    if (document.schemaVersion === 2) {
        const score = document.chart.score;
        const events = resolveScoreMeasureEvents(score);
        const bars: string[] = [];
        score.sections.forEach((section, s) => {
            let key = section.key ?? score.key;
            let isMinor = section.isMinor ?? score.isMinor;
            section.measures.forEach((measure, m) => {
                key = measure.key ?? key;
                isMinor = measure.isMinor ?? isMinor;
                if (bars.length >= count) {
                    return;
                }
                bars.push(
                    events[s][m]
                        .map((event) =>
                            event.kind === 'chord'
                                ? chordNames(event.symbol, key, isMinor).absName
                                : event.kind === 'hold'
                                  ? '/'
                                  : 'N.C.',
                        )
                        .join(' '),
                );
            });
        });
        return bars;
    }
    return document.chart.arrangement.sections
        .flatMap((section) => section.value.split(/[|\n]/))
        .map((bar) => bar.trim())
        .filter((bar) => bar.length > 0)
        .slice(0, count);
}
