/**
 * A measure-less (schemaVersion 1) chart as a `BandChart` (#1587). The band plays such a chart
 * (the runtime's `scoreForBand` converts it), but `bandChartView()` is null for it, because its
 * chart sheet is drawn from the old engine's maps instead. This builds the same `BandChart` shape
 * `bandChart` builds, from those maps, so whatever follows the band (the neck) can follow a v1
 * chart too.
 *
 * It leans on one correspondence: `arranger.stepMap` is `arranger.progression` mapped 1:1
 * (`updateProgressionCache` in `public/engine/chords-engine.ts`), and `buildLeadSheetSections`
 * gives each progression chord its progression index as `globalIndex`. So `stepMap[i]` performs
 * written chord `i`, and `runtime.playheadSlot` already reports the step-map index as the slot.
 * A v1 chart has no repeat or ending marks, so performance order is written order.
 *
 * This is the interim seam. The structural fix, drawing a v1 chart from
 * `bandChart(scoreForBand(), timeline)` like a score, is filed as #1589.
 */
import { notePc, PPQ, parseChord } from '@band/index';
import type { EnsembleState } from '@engine/types';
import type { BandChart, BandChartChord, BandSlot } from './band-chart';
import { type ChartBlock, measureOfGlobalIndex } from './lead-sheet';

/** One sixteenth in band ticks: the step map's unit. */
const STEP_TICKS = PPQ / 4;

export function legacyBandChart(
    blocks: ChartBlock[],
    stepMap: EnsembleState['arranger']['stepMap'],
): BandChart {
    // A v1 chart plays straight through, so a chord's written measure is its performed bar.
    const measureOf = measureOfGlobalIndex(blocks);
    const written: { chord: BandChartChord; bar: number }[] = blocks
        .flatMap((block) => block.measures.flatMap((measure) => measure.chords))
        // Negative is a bar the form never reaches: nothing to perform or voice.
        .filter((chord) => chord.globalIndex >= 0)
        .map((chord) => ({
            bar: measureOf.get(chord.globalIndex) ?? 0,
            chord: {
                ...chord,
                kind: 'chord',
                fermata: false,
                // Null when the band's parser refuses it: the neck leaves it unvoiced.
                chord: parseChord(chord.absName.replaceAll('♭', 'b').replaceAll('♯', '#'), {
                    tonic: notePc(chord.key),
                    minor: chord.keyIsMinor === true,
                }),
            },
        }));
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
