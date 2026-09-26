/**
 * The performance cycle: what each time through the song is for, decided from where a bar
 * sits in the performance. The arrangement plan carries the answer to every lane
 * (`BarPlan.lead`), so the lead, the drummer and the rhythm section agree on it.
 *
 * The first time through, the lead plays the head. Looping, it solos for three choruses and
 * brings the head back on the fourth: head, solo, solo, solo, head…
 *
 * When the player trades (`BandSettings.trade`), every time through after the head is traded
 * instead: the band and the player take turns, a fixed number of bars each, the band first so
 * the player has a phrase to answer. The turns run on across the choruses.
 */
import type { TradeSettings } from '../core/types.js';
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
          /** Who the player trades with. */
          with: TradeSettings['with'];
          /** Whose turn it is: the band's (the soloist's, or the drummer's alone) or yours. */
          turn: 'band' | 'you';
          /** The turn's first bar (a bar index) and its length in bars. */
          from: number;
          bars: number;
      };

/** How many passes one head-and-solos cycle lasts. */
export const CYCLE = 4;

const isIntro = (bar: Bar) => /^intro/i.test(bar.visit.label.trim());

/**
 * The lead's job at bar `index` on `pass`. With `trade`, every pass after the first is traded.
 * Every bar of a slot or a turn gets the same answer, so any barline can resume it.
 */
export function leadRole(
    timeline: Timeline,
    index: number,
    pass: number,
    trade: TradeSettings | null,
): LeadRole {
    const bar = timeline.bars[index];
    // An intro is the band's; the lead comes in after it.
    if (isIntro(bar)) {
        return { kind: 'rest' };
    }
    if (trade && pass > 0) {
        return tradeRole(timeline, index, pass, trade);
    }
    const cycle = pass % CYCLE;
    // A section written as a solo is one, even the first time through.
    if (/^solo/i.test(bar.visit.label.trim())) {
        return { kind: 'solo', chorus: cycle === 0 ? 1 : (cycle as 1 | 2 | 3) };
    }
    return cycle === 0 ? { kind: 'head' } : { kind: 'solo', chorus: cycle as 1 | 2 | 3 };
}

/**
 * The turn bar `index` falls in. Turns are counted in bars from the top of each chorus (the
 * intro is the band's), so they sit on the form: fours start on bars 1, 5, 9… A chorus that
 * doesn't divide evenly ends on a short turn. The alternation runs on across choruses, the
 * band taking the first turn after the head.
 */
function tradeRole(
    timeline: Timeline,
    index: number,
    pass: number,
    trade: TradeSettings,
): LeadRole {
    const playing = timeline.bars.filter((bar) => !isIntro(bar)).map((bar) => bar.index);
    const at = playing.indexOf(index);
    const turnInChorus = Math.floor(at / trade.bars);
    const turnsPerChorus = Math.ceil(playing.length / trade.bars);
    const turn = (pass - 1) * turnsPerChorus + turnInChorus;
    const first = turnInChorus * trade.bars;
    return {
        kind: 'trade',
        with: trade.with,
        turn: turn % 2 === 0 ? 'band' : 'you',
        from: playing[first],
        bars: Math.min(trade.bars, playing.length - first),
    };
}
