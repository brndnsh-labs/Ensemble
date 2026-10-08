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
 *
 * A counted chart's choruses (`SectionVisit.chorus`, #1475) are its times through the song: the
 * plan hands `leadRole` the pass plus the bar's chorus, so the head, solos and trades follow
 * the choruses of one performance exactly as they follow the laps of a looping one — except
 * the last. A counted performance of two or more choruses ends on the out-head: the melody
 * restated, the way a tune is played out (a coda or tag hangs off the head, never off a solo).
 * So its last chorus is the head whatever the cycle has reached, and any trade hands back to
 * the band for it. It keeps the pass it has otherwise (the lift, its seeds): only the lead's
 * job changes. And the chorus before it never brings the head back: a head that returns
 * mid-performance is there to set up more blowing, and right before the out-head it would
 * just be the melody twice. That chorus stays the soloist's — a solo becomes the arc's third,
 * wind-down chorus, whose last phrase comes down and settles so the head can come in; a trade
 * keeps trading, its block running on into the out-head. And it winds down once: where the
 * chorus before that would itself be the third, wind-down chorus, it holds the build as the
 * second instead (…, S2, S2, S3, H), so the solos peak and come down just once into the head.
 */
import { isIntroLabel } from '../../public/songbook/score-form.js';
import type { TradeSettings } from '../core/types.js';
import { type Bar, beforeFinalChorus, inFinalChorus, type Timeline } from '../form/timeline.js';

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

const isIntro = (bar: Bar) => isIntroLabel(bar.visit.label);

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
    // The out-head (above): the last chorus reads as the first time through, untraded.
    const out = inFinalChorus(timeline, index);
    const block = trade?.choruses ? trade.choruses + 1 : null;
    const p = out ? 0 : block ? pass % block : pass;
    // No head twice running at the end (above): where the cycle would bring it back in the
    // chorus before the out-head, the solo winds down instead, or the trade runs on.
    if (beforeFinalChorus(timeline, index) && pass > 0 && (block ? p === 0 : p % CYCLE === 0)) {
        return trade
            ? tradeRole(timeline, index, block ?? pass, trade)
            : { kind: 'solo', chorus: 3 };
    }
    // …and winds down once: the chorus before it, were it the wind-down too, builds instead.
    if (!trade && beforeFinalChorus(timeline, index, 2) && pass > 0 && pass % CYCLE === CYCLE - 1) {
        return { kind: 'solo', chorus: 2 };
    }
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
    /** Each chorus's turns: an intro or an outro played once (#1483) gives some more or fewer. */
    counts: Map<number, number>;
    of: Map<number, { turn: number; from: number; bars: number; at: number }>;
}

const TURNS = new WeakMap<Timeline, Map<number, Turns>>();

/**
 * A chorus cut into turns of `length` bars, counted from the top (the intro is the band's).
 * A turn never spans an intro (a D.C. can replay one mid-form): the bars before it end on a
 * short turn. A chorus that doesn't divide evenly ends on one too. Computed once per chart.
 *
 * A counted chart's timeline holds every chorus (`SectionVisit.chorus`, #1475): each is cut
 * from its own top, exactly as an uncounted chart's one chorus is every time round, so `turn`
 * counts within the bar's chorus and `counts` holds each chorus's turns. They can differ: a
 * last-chorus coda or an outro adds bars to the last, and an intro played only in the first
 * chorus (#1483) can split that one's turns where a D.C. replays it.
 */
function turnsOf(timeline: Timeline, length: number): Turns {
    const byLength = TURNS.get(timeline) ?? new Map<number, Turns>();
    TURNS.set(timeline, byLength);
    const cached = byLength.get(length);
    if (cached) {
        return cached;
    }
    const runs: { chorus: number; bars: number[] }[] = [];
    let current: number[] = [];
    for (const bar of timeline.bars) {
        if (isIntro(bar)) {
            current = [];
            continue;
        }
        const chorus = bar.visit.chorus;
        if (!current.length || current.length === length || runs.at(-1)?.chorus !== chorus) {
            current = [];
            runs.push({ chorus, bars: current });
        }
        current.push(bar.index);
    }
    const of = new Map<number, { turn: number; from: number; bars: number; at: number }>();
    const counts = new Map<number, number>();
    let turn = 0;
    runs.forEach(({ chorus, bars }, i) => {
        turn = i > 0 && runs[i - 1].chorus === chorus ? turn + 1 : 0;
        counts.set(chorus, turn + 1);
        bars.forEach((index, at) => {
            of.set(index, { turn, from: bars[0], bars: bars.length, at });
        });
    });
    const turns = { counts, of };
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
    // The alternation runs over the turns actually played: those of the block's earlier
    // choruses, then this one's. An uncounted chart's one chorus is every earlier lap too.
    const chorus = timeline.bars[index].visit.chorus;
    let turn = place.turn;
    for (let back = 1; back < blockPass; back++) {
        turn += turns.counts.get(chorus - back) ?? turns.counts.get(chorus) ?? 0;
    }
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
