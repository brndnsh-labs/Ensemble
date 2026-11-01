import type { ChartNotation } from '@core/songbook/types';
import type { BandChart } from '../lib/band-chart';
import type { ChartChord } from '../lib/lead-sheet';
import { eventText } from './chord-text';

// The chart row under the neck (#1995): the chart's own line of bars (four, as the sheet sets
// them) that holds the bar sounding now, so the learner keeps their place — section letter, bar
// numbers, the playing bar — while the board shows the grip. It is drawn with the sheet's own
// `.bars`/`.bar` classes, so the playing bar looks exactly as it does on the chart.

/** Bars per row: the chart sheet's grid. */
const ROW_BARS = 4;

export interface NeckChartRow {
    label: string;
    /** 1-based number of each bar, as the sheet numbers them across the whole chart. */
    bars: { number: number; chords: ChartChord[]; playing: boolean }[];
}

/**
 * The row of the chart holding the written event `display` (a `BandSlot.display`), or the first
 * row when none is sounding or chosen. A row never crosses a section: it is the sheet's line.
 */
export function chartRowAt(band: BandChart, display: number | null): NeckChartRow | null {
    let before = 0;
    let found: { block: number; index: number; before: number } | null = null;
    for (const [b, block] of band.blocks.entries()) {
        const index =
            display === null
                ? -1
                : block.measures.findIndex((m) => m.chords.some((c) => c.globalIndex === display));
        if (index >= 0) {
            found = { block: b, index, before };
            break;
        }
        before += block.measures.length;
    }
    // Nothing sounding: the first section that has a bar (an empty first section has no row).
    const firstFilled = band.blocks.findIndex((b) => b.measures.length > 0);
    const at =
        found ??
        (firstFilled < 0
            ? { block: 0, index: 0, before: 0 }
            : { block: firstFilled, index: 0, before: 0 });
    const block = band.blocks[at.block];
    if (!block || block.measures.length === 0) {
        return null;
    }
    const first = Math.floor(at.index / ROW_BARS) * ROW_BARS;
    return {
        label: block.label || 'A',
        bars: block.measures.slice(first, first + ROW_BARS).map((measure, i) => ({
            number: at.before + first + i + 1,
            chords: measure.chords,
            playing: found !== null && measure.chords.some((c) => c.globalIndex === display),
        })),
    };
}

interface NeckChartRowViewProps {
    band: BandChart;
    notation: ChartNotation;
    /** The performed slot shown (the playhead, or the step-through's cursor), or null. */
    slot: number | null;
}

export function NeckChartRowView({ band, notation, slot }: NeckChartRowViewProps) {
    const row = chartRowAt(band, slot === null ? null : (band.slots[slot]?.display ?? slot));
    if (!row) {
        return null;
    }
    return (
        <div className="neck-chart" role="group" aria-label="Chart row" data-testid="neck-chart">
            <span className="section-letter neck-chart-letter">{row.label}</span>
            <div className="bars">
                {row.bars.map((bar) => (
                    <div
                        key={bar.number}
                        className={`bar${bar.playing ? ' active' : ''}`}
                        data-active={bar.playing}
                        aria-current={bar.playing ? 'true' : undefined}
                    >
                        <span className="bar-number">{bar.number}</span>
                        {bar.chords.map((c) => (
                            <span className="chord" key={c.globalIndex}>
                                {eventText(c, notation)}
                            </span>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
