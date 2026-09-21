import { resolveScoreContext } from '@engine/songbook/score-context';
import {
    addScoreDurations,
    durationToSteps,
    scoreDuration,
    scoreMeter,
} from '@engine/songbook/score-duration';
import type { ScoreDuration, ScoreEvent, SemanticScore } from '@engine/songbook/score-types';

export type SongMeterResult =
    | { kind: 'ok'; score: SemanticScore }
    /** Nothing was changed. `measureId` is the first bar that needs the musician's decision. */
    | { kind: 'blocked'; measureId: string; message: string };

function same(a: Readonly<ScoreDuration>, b: Readonly<ScoreDuration>): boolean {
    return a[0] * b[1] === b[0] * a[1];
}

function countText(length: Readonly<ScoreDuration>, unit: number): string {
    // Quarter units → the meter's own counts, which is what the bar editor's lengths are in.
    const [n, d] = scoreDuration(length[0] * unit, length[1] * 4);
    return d === 1 ? String(n) : `${n}/${d}`;
}

/**
 * The song's own meter (#1371) — `SemanticScore.meter`, which the bar editor's "Meter from this
 * bar" never writes. Returns a changed copy, or the first bar that cannot follow.
 *
 * Only bars whose EFFECTIVE meter changes are touched: a section or bar that wrote its own meter
 * keeps it, and so does everything after that bar within its section. A touched bar is re-fit by
 * the rule the bar editor already applies to typed text — chords with no written lengths share
 * the bar equally — so `C Dm` stays "half each" in 3/4. Unequal lengths are a decision only the
 * musician can make (is 2+1+1 in 3/4 a 1+1+1, or a 2+1 with a chord dropped?), so they block.
 * Nothing is rounded, and an equal split the engine cannot place on its grid blocks too rather
 * than saving a chart that will not play.
 */
export function withSongMeter(source: SemanticScore, meter: string): SongMeterResult {
    const target = scoreMeter(meter);
    if (source.meter === meter) {
        return { kind: 'ok', score: source };
    }
    const score = structuredClone(source);
    score.meter = meter;
    // The same reset `resolveScoreContext` applies to any written meter: an old grouping
    // (3+3+2 in 8/8) is not a statement about the new one.
    score.grouping = null;
    for (const [sectionIndex, section] of score.sections.entries()) {
        let before = resolveScoreContext(source, source.sections[sectionIndex]);
        // A grouping written WITHOUT a meter divides the meter it inherited. Where that is the
        // one being replaced it goes the way the song's own did — the codec refuses a grouping
        // that does not add up to its bar, so keeping it would refuse the whole change.
        if (section.meter === undefined) {
            delete section.grouping;
        }
        let after = resolveScoreContext(score, section);
        for (const [measureIndex, measure] of section.measures.entries()) {
            before = resolveScoreContext(before, measure);
            if (
                measure.meter === undefined &&
                before.meter !== resolveScoreContext(after, measure).meter
            ) {
                delete measure.grouping;
            }
            after = resolveScoreContext(after, measure);
            if (measure.content.kind !== 'events' || before.meter === after.meter) {
                continue;
            }
            const length = scoreMeter(after.meter).length;
            const events = measure.content.events;
            const total = events.reduce<ScoreDuration>(
                (sum, event) => addScoreDurations(sum, event.duration),
                scoreDuration(0),
            );
            // 6/8 ↔ 3/4: the written lengths already fill the new bar exactly.
            if (same(total, length)) {
                continue;
            }
            const label = `${section.label} · bar ${measureIndex + 1}`;
            if (!events.every((event) => same(event.duration, events[0].duration))) {
                return {
                    kind: 'blocked',
                    measureId: measure.id,
                    message: `${label}: its chord lengths add up to ${countText(total, target.unit)}, and a ${meter} bar holds ${target.counts}. Set this bar's lengths for ${meter} (or give it its own meter) and try again. Nothing was changed.`,
                };
            }
            const share = scoreDuration(length[0], length[1] * events.length);
            if (durationToSteps(share) === null) {
                return {
                    kind: 'blocked',
                    measureId: measure.id,
                    message: `${label}: ${events.length} equal chords fall between playback steps in ${meter}. Set this bar's lengths first and try again. Nothing was changed.`,
                };
            }
            measure.content.events = events.map(
                (event): ScoreEvent => ({ ...event, duration: [...share] }),
            );
        }
    }
    return { kind: 'ok', score };
}
