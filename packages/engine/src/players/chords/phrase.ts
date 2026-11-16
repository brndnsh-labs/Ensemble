// Comping by the phrase. A pianist does not choose a rhythm bar by bar: he
// has a figure for the tune, a way of answering it this chorus, and for each
// phrase a plan (state it, state it, answer, come back). Here that is three
// spans of choice:
//
// - the section keeps one figure per level of energy, every time it returns (X-B-14);
// - each time through the section takes two of the tier's other figures as its answers;
// - each phrase is a plan of those three, chosen whole: several plans are
//   drawn from the style's forms, each is played out against the harmony, and
//   the critic picks the one that sits best with what the drummer and the
//   soloist actually played, with the energy, and with the phrase before.
//
// What is carried forward is what a pianist carries: the rhythm of the phrase
// just played, and what he played at this place the last time through. Every
// draw is keyed by its place in the form.

import { cells } from "../../perform/grid.ts";
import type { Arrival } from "../../perform/harmony.ts";
import { sameChord } from "../../perform/harmony.ts";
import type { PlayerContext } from "../../perform/notes.ts";
import { heldRng } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import { planBar } from "../../plan/types.ts";
import type { Tier } from "../../style/types.ts";
import { TIER_HIGH, TIER_MID, tierOf } from "../../style/types.ts";
import { barStrikes, EIGHTH, landing } from "./bar.ts";
import type { Hearing, PhraseHarmony } from "./converse.ts";
import { hear, waysOf } from "./converse.ts";
import type { PhraseCandidate, Pick } from "./critique.ts";
import type { FigureStroke } from "./figure.ts";
import { strokesOf } from "./figure.ts";
import { lineOf } from "./line.ts";
import type { Stretch } from "./plain.ts";
import { stretches } from "./plain.ts";
import type { BarRhythm } from "./rhythm.ts";
import { barRhythm } from "./rhythm.ts";
import type { Strike } from "./strike.ts";
import type { ChordStyle, CompFigure, RhythmTier } from "./style.ts";

/** Whether the seat comps in a bar: music in 4/4 that it plays in, short of the ending bar. */
export function comps(bar: PlanBar | undefined, chords: ChordStyle): bar is PlanBar {
  return (
    bar !== undefined &&
    chords.rhythm !== null &&
    bar.kind === "music" &&
    bar.seats.chords !== null &&
    !bar.ending &&
    bar.meter.beats === 4 &&
    bar.meter.unit === 4
  );
}

/**
 * A four-bar form fitted to a phrase of any length: a longer phrase plays its
 * first bar again at the front, a shorter one keeps its first bar and its end.
 */
export function fit(letters: readonly string[], length: number): string[] {
  const first = letters[0] ?? "a";
  if (length >= letters.length) {
    return [...new Array<string>(length - letters.length).fill(first), ...letters];
  }
  return [first, ...letters.slice(letters.length - (length - 1))].slice(0, length);
}

/** Strikes a bar the hand aims for: the tier's range, read at where the energy sits in the tier. */
function aim(tier: RhythmTier, energy: number): number {
  const [low, high] =
    energy < TIER_MID ? [0, TIER_MID] : energy < TIER_HIGH ? [TIER_MID, TIER_HIGH] : [TIER_HIGH, 1];
  const { from, to } = tier.busy;
  return from + ((energy - low) / (high - low)) * (to - from);
}

/** A question about a bar, asked once. */
function once<T>(of: (bar: PlanBar) => T): (bar: PlanBar) => T {
  const known = new Map<number, T>();
  return (bar) => {
    if (!known.has(bar.index)) known.set(bar.index, of(bar));
    return known.get(bar.index) as T;
  };
}

/** The strikes of every bar the seat comps in, phrase by phrase. */
export function compStrikes(
  context: PlayerContext,
  harmony: readonly Arrival[],
  pick: Pick,
): Strike[] {
  const { plan, style, rng, heard } = context;
  const chords = style.chords;
  const book = chords.rhythm;
  if (!book) return [];

  // The level the hand reads its book at: the band's, but under a soloist no higher than
  // the style lets a listening hand go.
  const cap = chords.listening?.busiest;
  const top = cap === "low" ? TIER_MID : cap === "mid" ? TIER_HIGH : Number.POSITIVE_INFINITY;
  const levelAt = (bar: PlanBar) => {
    const energy = bar.seats.chords ?? bar.energy;
    return bar.solo !== null && energy >= top ? top - 0.001 : energy;
  };
  const tierAt = (bar: PlanBar) => tierOf(levelAt(bar));
  const own = once((bar) => stretches(bar, harmony, 0));

  // The book is read once: each figure's strokes, each form's letters.
  const read = new Map<string, FigureStroke[]>();
  const strokes = (figure: CompFigure, tier: Tier) => {
    const key = `${tier}/${figure.name}`;
    let known = read.get(key);
    if (!known) {
      known = strokesOf(figure, book.tiers[tier], book);
      read.set(key, known);
    }
    return known;
  };
  const forms = book.forms.map((form) => ({ weight: form.weight, letters: cells(form.bars) }));

  // The section's own figure at this level: the same every time the section returns.
  const home = once((bar): CompFigure => {
    const tier = book.tiers[tierAt(bar)];
    return heldRng(rng, `figure:${tier.draw}`, "section", bar).weighted(
      tier.figures,
      (figure) => figure.weight,
    );
  });

  // The two figures that answer it, this time through the section. A groove has none.
  const answers = once((bar): readonly CompFigure[] => {
    const tier = book.tiers[tierAt(bar)];
    const pool = [...tier.figures, ...tier.answers].filter(
      (figure) => figure !== home(bar) && !figure.groove && figure.weight > 0,
    );
    if (home(bar).groove || pool.length === 0) return [];
    const held = heldRng(rng, "answers", "pass", bar);
    const first = held.fork("first").weighted(pool, (figure) => figure.weight);
    const rest = pool.filter((figure) => figure !== first);
    if (rest.length === 0) return [first, first];
    return [first, held.fork("second").weighted(rest, (figure) => figure.weight)];
  });

  // A figure written a second way for a bar with no bassist is played that way there: the
  // plan says who is playing (CH-26).
  const unaccompanied = new Map<CompFigure, CompFigure>();
  const asPlayed = (bar: PlanBar, figure: CompFigure): CompFigure => {
    if (figure.alone === undefined || bar.seats.bass !== null) return figure;
    let known = unaccompanied.get(figure);
    if (!known) {
      known = { ...figure, name: `${figure.name}, alone`, grid: figure.alone };
      unaccompanied.set(figure, known);
    }
    return known;
  };

  // The chord the next bar opens on, where that is a change the piano plays into.
  const changeAfter = once((bar): Stretch | null => {
    const next = planBar(plan, bar.index + 1);
    if (next?.kind !== "music") return null;
    const last = own(bar).at(-1);
    const first = own(next)[0];
    if (!last?.chord || !first?.chord || sameChord(last.chord, first.chord)) return null;
    return first;
  });

  // Whether the hand leans into the next bar: one decision per barline, each time through
  // (CH-36). Never into the ending bar, a bar the seat sits out, or a rest.
  const pushAfter = once((bar): boolean => {
    if (!changeAfter(bar) || !comps(planBar(plan, bar.index + 1), chords)) return false;
    const last = own(bar).at(-1)!;
    const figure = asPlayed(bar, home(bar));
    const tier = tierAt(bar);
    const reach = bar.ticks - EIGHTH;
    // A chord written for an eighth or less is played where it is written, never leaned past.
    // A groove is played as written: it leans in only on a stroke it already has, and never on
    // a scratch or a plucked string.
    const able =
      last.end - last.start > EIGHTH &&
      (!figure.groove ||
        strokes(figure, tier).some(
          (stroke) => stroke.at >= reach && !stroke.muted && !stroke.pluck,
        ));
    return able && heldRng(rng, "push", "bar", bar).chance(chords.anticipation.barline[tier]);
  });
  const pushedInto = (bar: PlanBar) => {
    const before = plan.bars[bar.index - 1];
    return comps(before, chords) && pushAfter(before);
  };
  // Whether the bar opens on the chord the hand was holding as the bar before ended, in a bar
  // it comped: that chord has been struck, and is owed nothing more (CH-34).
  const heldOver = once((bar): boolean => {
    const before = plan.bars[bar.index - 1];
    const last = before && comps(before, chords) ? own(before).at(-1) : undefined;
    const first = own(bar)[0];
    return (
      !!last?.chord &&
      !!first?.chord &&
      first.start === bar.start &&
      last.end === before!.start + before!.ticks &&
      sameChord(last.chord, first.chord)
    );
  });

  /**
   * A plan played out: each bar's figure laid over its harmony. Plans for one phrase
   * mostly share their bars, so a bar is laid out once for each figure tried in it.
   */
  const laid = new Map<string, Strike[]>();
  const realise = (
    bars: readonly PlanBar[],
    tier: Tier,
    figures: readonly CompFigure[],
  ): Strike[] =>
    bars.flatMap((bar) => {
      const figure = asPlayed(bar, figures[bar.phrase.bar]!);
      const next = planBar(plan, bar.index + 1);
      const to = changeAfter(bar);
      let carry = 0;
      if (to && next && pushAfter(bar)) {
        // The next phrase always opens on its section's figure, so what a push lands on is
        // known before that phrase is chosen.
        const top = next.phrase.bar === 0;
        const into = asPlayed(next, top ? home(next) : figures[next.phrase.bar]!);
        carry = landing(book, into, strokes(into, top ? tierAt(next) : tier), to);
      }
      const key = `${bar.index} ${figure.name} ${carry}`;
      let strikes = laid.get(key);
      if (!strikes) {
        strikes = barStrikes(chords, book, {
          bar,
          tier,
          figure,
          strokes: strokes(figure, tier),
          own: own(bar),
          pushedInto: pushedInto(bar),
          ahead: to && { arrival: to.arrival, push: pushAfter(bar), carry },
          heldOver: heldOver(bar),
        });
        laid.set(key, strikes);
      }
      return strikes;
    });

  // A figure with a turn of its own plays it in the last bar of a phrase. The phrase still
  // opens on the figure as written, so a phrase of one bar is not turned.
  const turns = new Map<CompFigure, CompFigure>();
  const turned = (figure: CompFigure): CompFigure => {
    if (figure.turn === undefined) return figure;
    let known = turns.get(figure);
    if (!known) {
      known = { ...figure, name: `${figure.name}, turned`, grid: figure.turn };
      turns.set(figure, known);
    }
    return known;
  };
  const ended = (figures: CompFigure[]): CompFigure[] =>
    figures.map((figure, i) => (i > 0 && i === figures.length - 1 ? turned(figure) : figure));

  /** The plans the comper weighs for a phrase: a figure for each of its bars. */
  const plans = (first: PlanBar): CompFigure[][] => {
    const a = home(first);
    const [b, c] = answers(first);
    const length = first.phrase.length;
    if (!b || !c) return [ended(new Array<CompFigure>(length).fill(a))];
    // Every form, with either answer in the first answer's seat.
    const written = new Map<string, { weight: number; figures: CompFigure[] }>();
    for (const form of forms) {
      for (const [x, y] of [
        [b, c],
        [c, b],
      ] as const) {
        const figures = ended(
          fit(form.letters, length).map((l) => (l === "a" ? a : l === "b" ? x : y)),
        );
        const key = figures.map((figure) => figure.name).join(" ");
        if (!written.has(key)) written.set(key, { weight: form.weight, figures });
      }
    }
    // Drawn by weight without putting back, each draw from its own place.
    const left = [...written.values()];
    const drawn: CompFigure[][] = [];
    const held = heldRng(rng, "plans", "phrase", first);
    while (drawn.length < book.candidates && left.length > 0) {
      const next = held.fork(drawn.length).weighted(left, (option) => option.weight);
      left.splice(left.indexOf(next), 1);
      drawn.push(next.figures);
    }
    return drawn;
  };

  const rhythmOf = (bars: readonly PlanBar[], played: readonly Strike[]): BarRhythm[] =>
    bars.map((bar) => {
      const before = plan.bars[bar.index - 1];
      return barRhythm(
        played.filter((strike) => strike.bar === bar.index).map((strike) => strike.tick),
        bar.start,
        before !== undefined && changeAfter(before) !== null,
        changeAfter(bar) !== null,
      );
    });

  // Phrase by phrase, in the order they are played.
  const phrases: PlanBar[][] = [];
  let place = "";
  for (const bar of plan.bars) {
    if (!comps(bar, chords)) continue;
    const here = `${bar.section.occurrence}/${bar.phrase.index}`;
    if (here !== place) phrases.push([]);
    place = here;
    phrases.at(-1)!.push(bar);
  }

  // Around a soloist: where it has the lead in a phrase, and the section's figure is a
  // conversation and not a groove, each plan is also offered played around the line.
  const listening = chords.listening;
  const line = listening ? lineOf(heard) : [];
  const harmonyOf: PhraseHarmony = {
    own,
    changesAfter: (bar) => changeAfter(bar) !== null,
    hold: book.hold,
    kind: (bar) => chords.voicing[tierAt(bar)],
  };
  const hearing = (bars: readonly PlanBar[], played: readonly Strike[]): Hearing | null =>
    listening && line.length > 0 && bars.some((bar) => bar.solo !== null) && !home(bars[0]!).groove
      ? hear(bars, plan.bars, line, listening, played)
      : null;

  const strikes: Strike[] = [];
  let before: readonly BarRhythm[] | null = null;
  const played = new Map<string, readonly BarRhythm[]>();
  for (const bars of phrases) {
    const tier = tierAt(bars[0]!);
    const place = `${bars[0]!.section.identity}/${bars[0]!.phrase.index}`;
    const heardHere = hearing(bars, strikes);
    const candidates = plans(bars[0]!).flatMap((figures): PhraseCandidate[] => {
      const struck = realise(bars, tier, figures);
      const plan = {
        bars,
        figures: bars.map((bar) => figures[bar.phrase.bar]!),
        rhythm: rhythmOf(bars, struck),
        before,
        lastTime: played.get(place) ?? null,
        busy: bars.map((bar) => aim(book.tiers[tier], levelAt(bar))),
        heard,
        hearing: heardHere,
      };
      return waysOf(struck, bars, heardHere, listening, harmonyOf).map((way) => ({
        ...plan,
        way: way.name,
        strikes: way.strikes,
      }));
    });
    const chosen = pick(candidates);
    strikes.push(...chosen.strikes);
    before = chosen.rhythm;
    played.set(place, chosen.rhythm);
  }
  return strikes;
}
