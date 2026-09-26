/**
 * The performance cycle: what each time through the song is for once the lead plays, decided
 * from where a bar sits in the performance. The arrangement plan carries the answer to every
 * lane (`BarPlan.lead`), so the lead, the drummer and the rhythm section agree on it.
 *
 * The first time through, the lead plays the head. Looping, it solos for three choruses and
 * brings the head back on the fourth: head, solo, solo, solo, head… A style that trades fours
 * plays one more chorus before the head, in which the lead and the drummer take turns.
 */
import type { Bar, Timeline } from '../form/timeline.js';

export type LeadRole =
    | { kind: 'rest' }
    | { kind: 'head' }
    | {
          kind: 'solo';
          /** Which chorus of the solo arc, 1–3. */
          chorus: 1 | 2 | 3;
      }
    | {
          kind: 'trade';
          /** Whose turn this phrase is: the lead's, or the drummer's (the band lays out). */
          turn: 'lead' | 'drums';
      };

/** How many passes one head-and-solos cycle lasts. */
export const CYCLE = 4;

/** The cycle of a style that trades: head, three solo choruses, a chorus of fours. */
export function cycleLength(trades: boolean): number {
    return trades ? CYCLE + 1 : CYCLE;
}

const isIntro = (bar: Bar) => /^intro/i.test(bar.visit.label.trim());

/**
 * The lead's job at bar `index` on `pass`. `trades` adds the chorus of fours to the cycle.
 * Every bar of a phrase slot gets the same answer, so any barline can resume it.
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
    const cycle = pass % cycleLength(trades);
    if (cycle === CYCLE) {
        return { kind: 'trade', turn: tradeTurn(timeline, index) };
    }
    // A section written as a solo is one, even the first time through.
    if (/^solo/i.test(bar.visit.label.trim())) {
        return { kind: 'solo', chorus: cycle === 0 ? 1 : (cycle as 1 | 2 | 3) };
    }
    return cycle === 0 ? { kind: 'head' } : { kind: 'solo', chorus: cycle as 1 | 2 | 3 };
}

/**
 * Whose four it is. The chorus's phrase slots alternate, counted back from the last so the
 * drummer always takes the last one and sets up the head (an odd number of slots starts
 * with the drums).
 */
function tradeTurn(timeline: Timeline, index: number): 'lead' | 'drums' {
    let after = 0;
    for (let i = index + 1; i < timeline.bars.length; i++) {
        const bar = timeline.bars[i];
        if (bar.phrase.bar === 0 && !isIntro(bar)) {
            after++;
        }
    }
    return after % 2 === 0 ? 'drums' : 'lead';
}
