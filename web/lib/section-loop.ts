/**
 * A section loop (#1989): practice one section over and over. It is a derived chart, the way song
 * mode's counted performance is (`song-mode.ts`): a smaller score holding just that section,
 * which the band plays as an ordinary chart that repeats continuously. The band host knows
 * nothing about loops; it plays whatever chart it is handed. Nothing here is saved with the
 * chart: the loop is built for the performance and thrown away.
 *
 * Retired once as host machinery (#1528: laps, releases and lead-ins of its own, five bugs in a
 * week). Built this way, a lap's fills into its own top are just a looping chart's wrap
 * (`planBars`), and leaving the loop is the band carrying on into another chart at a barline
 * (`BandHost.carryOn`), at a bar that plays the same written bar the loop would have.
 */
import { compileTimeline, type Timeline } from '@band/index';
import { resolveScoreMeasureEvents } from '@core/songbook/score-measure-events';
import type { ScoreDirection, SemanticScore } from '@core/songbook/score-types';
import type { BandChart } from './band-chart';

/**
 * The directions a section keeps when it plays on its own: its own repeats and endings. A segno,
 * coda, fine or jump points at the rest of the song, which the loop does not have.
 */
const KEPT: ReadonlySet<ScoreDirection['kind']> = new Set([
    'repeat-start',
    'repeat-end',
    'ending-start',
    'ending-end',
]);

function kept(directions: ScoreDirection[] | undefined): ScoreDirection[] | undefined {
    const left = directions?.filter((direction) => KEPT.has(direction.kind));
    return left?.length ? left : undefined;
}

/**
 * The chart a loop of `sectionId` plays: the song's own settings and just that section, repeating
 * continuously (no chorus count, so the band never ends it). A bar written as a repeat of another
 * bar (`%`) is written out, since the bar it repeats may be in another section. Null when the
 * chart has no such section, or the section cannot be played on its own.
 */
export function loopScore(score: SemanticScore, sectionId: string): SemanticScore | null {
    const index = score.sections.findIndex((section) => section.id === sectionId);
    if (index < 0) {
        return null;
    }
    const section = score.sections[index];
    const events = resolveScoreMeasureEvents(score)[index];
    const loop: SemanticScore = {
        ...score,
        sections: [
            {
                ...section,
                measures: section.measures.map((measure, m) => {
                    const { start, end, ...rest } = measure;
                    const before = kept(start);
                    const after = kept(end);
                    return {
                        ...rest,
                        content: { kind: 'events' as const, events: events[m] },
                        ...(before ? { start: before } : {}),
                        ...(after ? { end: after } : {}),
                    };
                }),
            },
        ],
    };
    delete loop.choruses;
    try {
        compileTimeline(loop);
    } catch {
        return null;
    }
    return loop;
}

/**
 * Where the full chart carries on when the loop is cleared mid-play, for `BandHost.carryOn`: the
 * full chart's bar that plays the same written bar as the loop's bar `bar` (the loop's bar count
 * meaning the top of its next lap). So the bars the band already played know the chord that
 * follows them — a push into the next bar, a fill into a section top — whichever chart the next
 * bar comes from (#1517, #1507). The loop's bars are the section's FIRST performed visit.
 *
 * When the section's bars there are not the loop's bar for bar (its first visit takes an ending
 * the loop does not), only the top of a lap carries on, into the top of that visit; null says
 * "not at this barline".
 */
export function loopEntry(
    full: Timeline,
    loop: Timeline,
    sectionId: string,
): ((bar: number) => number | null) | null {
    const first = full.bars.findIndex((bar) => bar.visit.id === sectionId);
    if (first < 0) {
        return null;
    }
    const n = loop.bars.length;
    const same = loop.bars.every((bar, k) => {
        const there = full.bars[first + k];
        return (
            there?.visit.id === sectionId &&
            there.meter.barTicks === bar.meter.barTicks &&
            there.spans.length === bar.spans.length &&
            there.spans.every(
                (span, s) =>
                    span.end - span.start === bar.spans[s].end - bar.spans[s].start &&
                    span.chord?.symbol === bar.spans[s].chord?.symbol,
            )
        );
    });
    if (same) {
        return (bar) => first + (bar % n);
    }
    return (bar) => (bar % n === 0 ? first : null);
}

/**
 * The stand's view of the loop: its own slots, but pointing at the full chart's written chords
 * and drawn on the full chart's blocks, so the playhead lights the section's bars where the page
 * shows them. Null when the loop's chords are not the section's as the full chart writes them.
 */
export function loopView(full: BandChart, loop: BandChart, sectionId: string): BandChart | null {
    const offset = full.chords.findIndex((chord) => chord.sectionId === sectionId);
    const count = full.chords.filter((chord) => chord.sectionId === sectionId).length;
    if (offset < 0 || count !== loop.chords.length) {
        return null;
    }
    return {
        ...loop,
        blocks: full.blocks,
        chords: full.chords,
        slots: loop.slots.map((slot) => ({ ...slot, display: slot.display + offset })),
    };
}
