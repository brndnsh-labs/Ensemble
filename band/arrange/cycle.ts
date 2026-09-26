/**
 * The performance cycle: what each time through the song is for, decided from where a bar
 * sits in the performance. The arrangement plan carries the answer to every lane
 * (`BarPlan.lead`), so the lead, the drummer and the rhythm section agree on it.
 *
 * The first time through, the lead plays the head. Looping, it solos for three choruses and
 * brings the head back on the fourth: head, solo, solo, solo, head…
 *
 * When the player trades (`BandSettings.trade`), the pass after the head is traded instead:
 * the band and the player take turns, a fixed number of bars each — the soloist trades band
 * first, the drummer trades you first (jazz convention: you play, the drummer answers). With
 * `trade.choruses` set, the head returns after that many traded passes and the cycle repeats
 * (pass 0 = head, passes 1..N traded, pass N+1 = head, …), the alternation restarting fresh at
 * the top of each block. `null`/`0` choruses keeps trading forever, running the turns on
 * across every pass instead — the original behavior.
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
          /** The turn's first bar (a bar index), its length in bars, and this bar's place in it. */
          from: number;
          bars: number;
          at: number;
      };

/** How many passes one head-and-solos cycle lasts. */
export const CYCLE = 4;

const isIntro = (bar: Bar) => /^intro/i.test(bar.visit.label.trim());

/**
 * The lead's job at bar `index` on `pass`. With `trade`, a finite `choruses` wraps `pass` into
 * blocks of `choruses + 1` passes — block-relative pass 0 (which includes the very first pass,
 * and every block boundary after it) falls through to the head/solo cycle below exactly as a
 * non-trading pass would; the rest of the block trades. `null`/`0` choruses never wraps, so
 * every pass after the first stays a turn. Every bar of a slot or a turn gets the same answer,
 * so any barline can resume it.
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
    const block = trade?.choruses ? trade.choruses + 1 : null;
    const p = block ? pass % block : pass;
    if (trade && p > 0) {
        return tradeRole(timeline, index, p, trade);
    }
    // p === 0: either the real pass 0, or (with a finite chorus count) a block boundary where
    // the head returns — both read the same way a non-trading pass would, using `p` in place
    // of `pass` so a block boundary always lands on cycle 0 (head) rather than wherever the
    // raw pass number happens to fall in the old head/solo-three rotation.
    const cycle = p % CYCLE;
    // A section written as a solo is one, even the first time through.
    if (/^solo/i.test(bar.visit.label.trim())) {
        return { kind: 'solo', chorus: cycle === 0 ? 1 : (cycle as 1 | 2 | 3) };
    }
    return cycle === 0 ? { kind: 'head' } : { kind: 'solo', chorus: cycle as 1 | 2 | 3 };
}

/** One chorus's turns, as runs of bar indices; and, for each bar, its turn and place in it. */
interface Turns {
    count: number;
    of: Map<number, { turn: number; from: number; bars: number; at: number }>;
}

const TURNS = new WeakMap<Timeline, Map<number, Turns>>();

/**
 * A chorus cut into turns of `length` bars, counted from the top (the intro is the band's).
 * A turn never spans an intro (a D.C. can replay one mid-form): the bars before it end on a
 * short turn. A chorus that doesn't divide evenly ends on one too. Computed once per chart.
 */
function turnsOf(timeline: Timeline, length: number): Turns {
    const byLength = TURNS.get(timeline) ?? new Map<number, Turns>();
    TURNS.set(timeline, byLength);
    const cached = byLength.get(length);
    if (cached) {
        return cached;
    }
    const runs: number[][] = [];
    let current: number[] = [];
    for (const bar of timeline.bars) {
        if (isIntro(bar)) {
            current = [];
            continue;
        }
        if (!current.length || current.length === length) {
            current = [];
            runs.push(current);
        }
        current.push(bar.index);
    }
    const of = new Map<number, { turn: number; from: number; bars: number; at: number }>();
    runs.forEach((bars, turn) => {
        bars.forEach((index, at) => {
            of.set(index, { turn, from: bars[0], bars: bars.length, at });
        });
    });
    const turns = { count: runs.length, of };
    byLength.set(length, turns);
    return turns;
}

/**
 * The turn bar `index` falls in. `blockPass` is 1 at the first traded pass of a trading block
 * (block-relative with a finite chorus count, the raw pass with keep-trading) — the alternation
 * runs on from there across the block's choruses, restarting at the top of the next block.
 * The soloist trades band first (a phrase to answer); the drummer trades you first, jazz
 * convention: you play your turn, the drummer answers.
 */
function tradeRole(
    timeline: Timeline,
    index: number,
    blockPass: number,
    trade: TradeSettings,
): LeadRole {
    const turns = turnsOf(timeline, trade.bars);
    const place = turns.of.get(index);
    if (!place) {
        return { kind: 'rest' };
    }
    const turn = (blockPass - 1) * turns.count + place.turn;
    const bandFirst = trade.with !== 'drums';
    const isBandTurn = bandFirst ? turn % 2 === 0 : turn % 2 === 1;
    return {
        kind: 'trade',
        with: trade.with,
        turn: isBandTurn ? 'band' : 'you',
        from: place.from,
        bars: place.bars,
        at: place.at,
    };
}
