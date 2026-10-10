/**
 * The neck's view of a measure-less (schemaVersion 1) chart (#1587). The band plays such a chart
 * (the runtime's `scoreForBand` converts it), but `bandChartView()` is null for it, because its
 * chart sheet is drawn from the old engine's maps instead. This builds the same `BandChart` shape
 * `bandChart` builds, from those maps, so the neck can follow a v1 chart too.
 *
 * It leans on one correspondence: `arranger.stepMap` is `arranger.progression` mapped 1:1
 * (`updateProgressionCache` in `public/engine/chords-engine.ts`), and `buildLeadSheetSections`
 * gives each progression chord its progression index as `globalIndex`. So `stepMap[i]` performs
 * written chord `i`, and `runtime.playheadSlot` already reports the step-map index as the slot.
 * A v1 chart has no repeat or ending marks, so performance order is written order.
 */
import { notePc, PPQ, parseChord } from '@band/index';
import type { EnsembleState } from '@engine/types';
import type { BandChart, BandChartChord, BandSlot } from '../band-chart';
import type { ChartBlock } from '../lead-sheet';

/** One sixteenth in band ticks: the step map's unit. */
const STEP_TICKS = PPQ / 4;

export function legacyBandChart(
    blocks: ChartBlock[],
    stepMap: EnsembleState['arranger']['stepMap'],
): BandChart {
    // Each written chord with its measure's ordinal in written order — a v1 chart's performed
    // bar, since it plays straight through (`measureOfGlobalIndex` in `app/use-chart-view.ts`).
    const written: { chord: BandChartChord; bar: number }[] = [];
    let bar = 0;
    for (const block of blocks) {
        for (const measure of block.measures) {
            for (const chord of measure.chords) {
                // Negative is a bar the form never reaches: nothing to perform or voice.
                if (chord.globalIndex < 0) {
                    continue;
                }
                const symbol = chord.absName.replaceAll('♭', 'b').replaceAll('♯', '#');
                written.push({
                    bar,
                    chord: {
                        ...chord,
                        kind: 'chord',
                        fermata: false,
                        // Null when the band's parser refuses it: the neck leaves it unvoiced.
                        chord: parseChord(symbol, {
                            tonic: notePc(chord.key),
                            minor: chord.keyIsMinor === true,
                        }),
                    },
                });
            }
            bar += 1;
        }
    }
    written.sort((a, b) => a.chord.globalIndex - b.chord.globalIndex);
    // Both maps come from the same progression, so they agree in length; should they ever not,
    // only the slots both describe are performed, rather than a slot pointing at no chord.
    const count = Math.min(written.length, stepMap.length);
    const slots: BandSlot[] = stepMap.slice(0, count).map(({ start, end }, i) => ({
        from: start * STEP_TICKS,
        to: end * STEP_TICKS,
        start,
        end,
        display: i,
        bar: written[i].bar,
    }));
    return { blocks, chords: written.map((w) => w.chord), slots, sections: [] };
}
