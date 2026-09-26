/**
 * The performance cycle: what each time through the song is for once the lead plays, decided
 * from where a bar sits in the performance. The arrangement plan carries the answer to every
 * lane (`BarPlan.lead`), so the lead, the drummer and the rhythm section agree on it.
 *
 * The first time through, the lead plays the head. Looping, it solos for three choruses and
 * brings the head back on the fourth: head, solo, solo, solo, head… A style that trades fours
 * plays the fours before the head comes back: one chorus of them, or two when the chorus has
 * an odd number of phrases (a 12-bar blues trades across 24 bars), so the horn always takes
 * the first four and the drummer the last.
 */
import type { Bar, Timeline } from '../form/timeline.js';

export type LeadRole =
    | { kind: 'rest' }
    | { kind: 'head' }
    | {
          kind: 'solo';
          /** Which chorus of the solo arc, 1–3. */
          chorus: 1 | 2 | 3;
          /** The fours come next: the third chorus hands on to them instead of winding down. */
          toFours?: boolean;
      }
    | {
          kind: 'trade';
          /** Whose turn this phrase is: the lead's, or the drummer's (the band lays out). */
          turn: 'lead' | 'drums';
      };

/** How many passes one head-and-solos cycle lasts, without fours. */
export const CYCLE = 4;

const isIntro = (bar: Bar) => /^intro/i.test(bar.visit.label.trim());

/** The lead's phrase slots in one time through the song (the band's intro isn't one). */
function slotCount(timeline: Timeline): number {
    return timeline.bars.filter((bar) => bar.phrase.bar === 0 && !isIntro(bar)).length;
}

/** How many choruses of fours a style that trades plays: enough for an even number of fours. */
function fourChoruses(timeline: Timeline): number {
    return slotCount(timeline) % 2 === 0 ? 1 : 2;
}

/** The cycle's length in passes: head, three solo choruses, and the fours if `trades`. */
export function cycleLength(timeline: Timeline, trades: boolean): number {
    return trades ? CYCLE + fourChoruses(timeline) : CYCLE;
}

/**
 * The lead's job at bar `index` on `pass`. `trades` adds the fours to the cycle. Every bar
 * of a phrase slot gets the same answer, so any barline can resume it.
 */
export function leadRole(
    timeline: Timeline,
    index: number,
    pass: number,
    trades: boolean,
): LeadRole {
    const bar = timeline.bars[index];
    // An intro is the band's; the lead comes in after it.
    if (isIntro(bar)) {
        return { kind: 'rest' };
    }
    const cycle = pass % cycleLength(timeline, trades);
    if (cycle >= CYCLE) {
        return { kind: 'trade', turn: tradeTurn(timeline, index, cycle - CYCLE) };
    }
    const chorus = (cycle === 0 ? 1 : cycle) as 1 | 2 | 3;
    const solo = {
        kind: 'solo' as const,
        chorus,
        ...(trades && cycle === 3 ? { toFours: true } : {}),
    };
    // A section written as a solo is one, even the first time through.
    if (/^solo/i.test(bar.visit.label.trim())) {
        return solo;
    }
    return cycle === 0 ? { kind: 'head' } : solo;
}

/**
 * Whose four it is: the slots alternate through the fours, the horn first. There is always
 * an even number of them, so the drummer takes the last and sets up the head.
 */
function tradeTurn(timeline: Timeline, index: number, chorus: number): 'lead' | 'drums' {
    let slot = chorus * slotCount(timeline) - 1;
    for (let i = 0; i <= index; i++) {
        const bar = timeline.bars[i];
        if (bar.phrase.bar === 0 && !isIntro(bar)) {
            slot++;
        }
    }
    return slot % 2 === 0 ? 'lead' : 'drums';
}
