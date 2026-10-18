/**
 * Song mode (#1784): "play about three minutes, then the band wraps up". A chart that loops
 * (`SemanticScore.choruses` absent) is played as if it counted its choruses — the band plays `n`
 * of them and stops on the held ending a counted chart already ends on (#1475) — with `n` picked
 * so the whole performance lands nearest a target length. The chart itself is never written:
 * the counted copy is built for one performance and thrown away.
 */
import { compileTimeline, secondsAt, type Timeline } from '@band/index';
import type { SemanticScore } from '@core/songbook/score-types';

/** Song mode never asks for more choruses than this, however short the form. */
export const MAX_SONG_CHORUSES = 16;

/** Float slack when comparing two distances to the target, so an exact tie reads as one. */
const TIE_EPSILON = 1e-9;

/** One planned performance: the counted copy of the score, its timeline, and its length. */
export interface SongPlan {
    choruses: number;
    /** The whole performance at the planned tempo, fermata stretches included. */
    seconds: number;
    score: SemanticScore;
    timeline: Timeline;
}

/**
 * The chorus count `n` (1–{@link MAX_SONG_CHORUSES}) whose performance at `bpm` lands nearest
 * `targetSeconds`, a tie going to the longer one; null when the chart counts its own choruses
 * (its own count wins) or not even one chorus compiles.
 *
 * Each candidate is compiled and measured, never one chorus multiplied by `n`: a counted chart
 * can carry a once-only intro or outro and a last-chorus coda (#1472, #1483), so the length is
 * not linear in `n`. It does grow with `n`, so the walk stops at the first candidate that
 * reaches the target. A candidate that fails to compile (the playback limits in
 * `compileTimeline`) is not eligible, and nor is any larger one.
 */
export function planSong(
    score: SemanticScore,
    bpm: number,
    targetSeconds: number,
): SongPlan | null {
    if (score.choruses !== undefined) {
        return null;
    }
    let shorter: SongPlan | null = null;
    for (let choruses = 1; choruses <= MAX_SONG_CHORUSES; choruses++) {
        const counted: SemanticScore = { ...score, choruses };
        let timeline: Timeline;
        try {
            timeline = compileTimeline(counted);
        } catch {
            break;
        }
        const plan = {
            choruses,
            seconds: secondsAt(timeline, timeline.ticks, bpm),
            score: counted,
            timeline,
        };
        if (plan.seconds >= targetSeconds) {
            const under = shorter ? targetSeconds - shorter.seconds : Infinity;
            const over = plan.seconds - targetSeconds;
            return shorter && under < over - TIE_EPSILON ? shorter : plan;
        }
        shorter = plan;
    }
    return shorter;
}

/** The readout beside the setting: `≈3:12 · 4 choruses`. */
export function songPlanText({ choruses, seconds }: { choruses: number; seconds: number }) {
    const whole = Math.round(seconds);
    const clock = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
    return `≈${clock} · ${choruses} ${choruses === 1 ? 'chorus' : 'choruses'}`;
}
