// The planner. Turns an expanded chart, a style, and options into a Plan:
// which bars are played, how hard, where the fills and arrivals fall, and how
// the performance ends.

import { runsOf } from "../chart/expand.ts";
import type { ArrangementLine } from "../chart/model.ts";
import type {
  ChartChord,
  ChordSpan,
  ExpandedChart,
  FlatBar,
  Meter,
  SourceRange,
} from "../chart/types.ts";
import { PPQ } from "../chart/types.ts";
import { tempoPulse } from "../perform/meter.ts";
import { createRng } from "../rng.ts";
import { tempoRange } from "../style/meters.ts";
import type { Seat, StylePack } from "../style/types.ts";
import { LEVEL_ENERGY, SEATS, TIER_HIGH, TIER_MID, tierOf } from "../style/types.ts";
import { chordFamily, chordToString, makeQuality } from "../theory/chord.ts";
import type { Key } from "../theory/pitch.ts";
import { pitchClass } from "../theory/pitch.ts";
import type { ArcPosition } from "./arc.ts";
import { arcOffset, defaultClimax } from "./arc.ts";
import { arcHighest, barQuarters, breatheAmount, breaths } from "./tempo.ts";
import type { EndingMark, FillMark, Plan, PlanBar, PlanOptions, SoloMark } from "./types.ts";

/** A timed jam with no stated length. */
const DEFAULT_MINUTES = 3;
/** A single section shorter than this that just goes round is a vamp, not a form. */
const VAMP_BARS = 8;
/** A vamp's chorus is the fewest laps, doubled until they make this many bars. */
const VAMP_CHORUS = 12;

/** One time through one section: the unit that phrases, fills and held choices hang on. */
interface Run {
  readonly bars: readonly FlatBar[];
  readonly pass: number;
  readonly part: "intro" | "body" | "ending";
  /** On a vamp's chorus, the bars in one lap of it. */
  readonly lap?: number;
}

export function planBars(
  expanded: ExpandedChart,
  chartTempo: number | null,
  /** The chart's own meter: the tempo counts its pulse. */
  meter: Meter,
  style: StylePack,
  options: PlanOptions,
  /** The chart has an arrangement block of its own: nobody is laid out but as it says. */
  ownArrangement = false,
): Plan {
  const tempo = clampTempo(options.tempo ?? chartTempo ?? tempoRange(style, meter).default);
  // How busy the soloist is goes on the plan only where the player set it.
  const density =
    options.soloDensity !== undefined && Number.isFinite(options.soloDensity)
      ? { soloDensity: clamp01(options.soloDensity) }
      : {};
  // A tick is a fraction of a quarter note, so time is kept in quarter notes a minute.
  const quarters = tempo * tempoPulse(meter);
  // Only a jam's arc moves the tempo: a song, and a level the player set, keep the tempo as set.
  const amount =
    options.breathe === true && options.mode === "jam" ? breatheAmount(style, meter, tempo) : 0;
  const breathes = amount > 0;
  // The jam as it set out: how many passes, or none in particular. The arc and the solos are
  // shaped by this even when the band is told to finish early, so that what was played stands.
  const open = options.mode === "jam" && options.open === true;
  const planned = countPasses(expanded, quarters, options);
  const told =
    options.mode === "jam" &&
    options.endAfter !== undefined &&
    Number.isFinite(options.endAfter) &&
    (open || options.endAfter < planned - 1)
      ? Math.max(0, Math.floor(options.endAfter))
      : undefined;
  /** The passes that are played. */
  const passes = told === undefined ? planned : told + 1;
  /** The performance comes to an end: everything but an open jam nobody has told to finish. */
  const ends = !open || told !== undefined;

  const runs = layOut(expanded, options, passes, !ends);
  const played = runs.filter((run) => ends || run.pass < passes);
  const playedBars = played.reduce((sum, run) => sum + run.bars.length, 0);
  if (playedBars === 0) {
    return {
      mode: options.mode,
      tempo,
      quarters,
      bars: [],
      lookahead: [],
      passes: 0,
      open: !ends,
      ticks: 0,
      ...density,
    };
  }

  const oneSection = runs.filter((run) => run.part === "body" && run.pass === 0).length === 1;
  const without = new Set<Seat>(options.without ?? []);
  const bodyBarsPerPass = Math.max(
    1,
    options.mode === "jam" ? chorusOf(expanded, options).bars.length : 1,
  );

  // The soloist has the lead from the first pass, where the player asked for it in a jam, and
  // where the chart does not say where it solos itself, in a section named for it.
  const top =
    options.mode === "jam" &&
    options.soloFromTop === true &&
    !runs.some((run) => sectionIdentity(run.bars[0]!.sectionLabel).startsWith("solo"));
  const climax = soloClimax(options, planned, open, top);
  const breath = climax === undefined ? undefined : soloBreath(climax, planned, open, top);
  const rise = (pass: number) =>
    climax === undefined ? undefined : soloRise(pass, climax, planned, open, top);

  // First the music, bar by bar, without marks that depend on a neighbour.
  const drafts: Draft[] = [];
  let occurrence = 0;
  const bridges = bridgeRuns(runs, style);
  // A song with an arrangement is played as arranged: one line for each run.
  const arranged = options.mode === "song" ? expanded.arrangement : null;
  for (const [runIndex, run] of runs.entries()) {
    const first = run.bars[0]!;
    const line = arranged?.[runIndex];
    const level =
      line?.energy != null
        ? LEVEL_ENERGY[line.energy]
        : sectionLevel(bridges.has(run) ? BRIDGE : first.sectionLabel, style);
    const phrases =
      run.lap === undefined
        ? phraseLengths(run.bars.length)
        : vampPhrases(run.lap, run.bars.length);
    const barInPassBase = run.part === "body" ? passOffset(runs, run) : 0;
    let phraseIndex = 0;
    let barInPhrase = 0;
    run.bars.forEach((bar, i) => {
      const phraseLength = phrases[phraseIndex]!;
      const barInPass = barInPassBase + i;
      // Energy steps at phrase tops, never mid-phrase: read the arc at the phrase's middle,
      // and in the last pass at the phrase's end so the closing phrase is at full level.
      const phraseStart = barInPass - barInPhrase;
      const position: ArcPosition = {
        pass: run.pass,
        passes: planned,
        open,
        part: run.part,
        phraseStart: phraseStart / bodyBarsPerPass,
        phraseEnd: Math.min(1, (phraseStart + phraseLength) / bodyBarsPerPass),
        ...(climax === undefined ? {} : { climax }),
        ...(breath === undefined ? {} : { breath }),
        ...(rise(run.pass) === undefined ? {} : { rise: rise(run.pass)! }),
      };
      const offset =
        options.mode === "jam"
          ? arcOffset(style.arc, told === undefined ? position : { ...position, told })
          : 0;
      // The tempo follows the pass's level on the arc as the jam set out, before anyone told it to
      // finish (a jam told to finish keeps the time of what was played, wherever it is told), read
      // at the pass's middle so no phrase inside it moves the tempo. A written ending is its last
      // pass's.
      const arcAsSet =
        breathes && options.energy === undefined
          ? arcOffset(style.arc, {
              ...position,
              part: run.part === "ending" ? "body" : run.part,
              phraseStart: 0.5,
              phraseEnd: 0.5,
            }) * style.arc.depth
          : 0;
      // A level the player set is held: the band must not drift away from it (CO-05, CO-06).
      const base =
        options.energy === undefined
          ? level
          : options.energy + (level - style.arc.defaultLevel) / 2;
      drafts.push({
        flat: bar,
        run,
        line,
        occurrence,
        level,
        base,
        energy: options.energy === undefined ? level + offset * style.arc.depth : base,
        arc: arcAsSet,
        barInSection: i,
        barInPass,
        phrase: { index: phraseIndex, bar: barInPhrase, length: phraseLength },
        lastOfRun: i === run.bars.length - 1,
      });
      barInPhrase++;
      if (barInPhrase === phraseLength) {
        phraseIndex++;
        barInPhrase = 0;
      }
    });
    occurrence++;
  }

  const asSet = soloMarks(drafts, options, planned, open, top);
  const solos = asSet.map((mark, i) =>
    // A solo under way when the band is told to finish makes this chorus its last (SO-05).
    mark && told !== undefined && drafts[i]!.run.pass === told
      ? { chorus: mark.chorus, of: mark.chorus + 1 }
      : mark,
  );

  // Who is in: now and then a seat sits out a section or a pass at a low point of the arc.
  const { outs, enters } =
    options.mode === "jam" && !ownArrangement
      ? // The solos as the jam set out: one cut short by the word is not where a seat was to sit out.
        layOuts(drafts, asSet, style, options, {
          planned,
          passes,
          open,
          ends,
          without,
          ...(told === undefined ? {} : { told }),
          ...(climax === undefined ? {} : { climax }),
          ...(breath === undefined ? {} : { breath }),
          rise,
        })
      : { outs: drafts.map(() => null), enters: drafts.map(() => null) };

  // The one-bar build into a bigger section, then the rule about the high-tier line.
  const energies = drafts.map((draft, i) => {
    const next = drafts[i + 1];
    const builds = draft.lastOfRun && next !== undefined && next.level > draft.level + 0.05;
    // The build is a swell, not a new part: it never carries its one bar across a tier line,
    // or the groove would change for a single bar before the fill.
    const lifted = builds ? withinTier(draft.energy, style.arc.build) : draft.energy;
    return clamp01(holdTierLine(lifted, draft.base, style));
  });

  const endingIndex = ends ? playedBars - 1 : -1;
  const ending =
    endingIndex >= 0
      ? resolveEnding(
          drafts[endingIndex]!.flat,
          expanded,
          style,
          drafts[endingIndex]!.run.part === "ending",
        )
      : null;

  const countIn = options.countIn !== false;
  const firstMeterTicks = drafts[0]!.flat.ticks;
  let tick = countIn ? firstMeterTicks : 0;
  const offsetIndex = countIn ? 1 : 0;

  // One tempo a bar, in the order the bars are played: each its own pass's level against the
  // opening pass's, scaled so the arc's highest pass asks for the whole amount. The opening pass
  // (its intro too) is at the tempo as set.
  const opening = drafts.find((draft) => draft.run.part === "body" && draft.run.pass === 0)?.arc;
  const span = arcHighest(style.arc, open) - (opening ?? 0);
  const shares =
    breathes && opening !== undefined && span > 0
      ? breaths(
          drafts.map((draft) =>
            draft.run.pass === 0
              ? 0
              : amount * Math.max(-1, Math.min(1, (draft.arc - opening) / span)),
          ),
        )
      : drafts.map(() => 0);
  const bars: PlanBar[] = [];
  drafts.forEach((draft, i) => {
    const next = drafts[i + 1];
    const previous = drafts[i - 1];
    const energy = energies[i]!;
    const isEnding = i === endingIndex;
    const isSetup = i === endingIndex - 1;

    let fill: FillMark | null = null;
    let crash = false;
    if (!isEnding) {
      const nextEnergy = next ? energies[i + 1]! : energy;
      const tier = tierOf(Math.max(energy, nextEnergy));
      const lastOfPhrase = draft.phrase.bar === draft.phrase.length - 1;
      if (draft.lastOfRun) {
        const newPass = next !== undefined && next.run.pass !== draft.run.pass;
        // "Is the next section bigger" is asked of the levels the band will actually play.
        // The one-bar build stays inside its tier, so it cannot hide the step it leads into.
        const bigger = next !== undefined && tierRank(nextEnergy) > tierRank(energy);
        // On a one-section form every turnaround is the top of the form. The biggest fill is
        // kept for where the band steps up, or it is the only fill the turnaround ever gets.
        fill = { boundary: "section", top: bigger || (newPass && !oneSection), tier };
      } else if (lastOfPhrase && draft.phrase.index % 2 === 1) {
        fill = { boundary: "phrase", top: false, tier };
      }
      if (isSetup) {
        // A quiet tune still rolls into its last hit; a style that ends softly plays time into it.
        // Nobody rolls into a bar of written silence.
        fill =
          style.ending.setupFill && !ending?.silent
            ? { boundary: "section", top: true, tier: "high" }
            : null;
      }
    }
    if (previous && !isEnding && energy >= (style.drums.crashFrom ?? 0)) {
      const previousFill = bars[bars.length - 1]?.fill ?? null;
      const newSection = draft.barInSection === 0;
      if (newSection) {
        crash = true;
      } else {
        crash = previousFill?.boundary === "phrase" && energy >= 0.5;
      }
    }

    const flat = draft.flat;
    // A last bar that is all rest is the chart's own silence: no final hit, and everyone is out.
    const silent = isEnding && ending?.silent === true;
    const endingMark = isEnding && ending && !silent ? ending.mark(flat.ticks, style) : null;
    bars.push({
      index: i + offsetIndex,
      start: tick,
      ticks: flat.ticks,
      meter: flat.meter,
      key: flat.key,
      kind: "music",
      spans: isEnding && ending ? ending.spans : seamSpans(flat, previous?.flat),
      section: {
        index: flat.sectionIndex,
        label: flat.sectionLabel,
        identity: sectionIdentity(flat.sectionLabel),
        role: flat.role,
        occurrence: draft.occurrence,
        bars: draft.run.bars.length,
      },
      pass: draft.run.pass,
      barInSection: draft.barInSection,
      barInPass: draft.barInPass,
      phrase: draft.phrase,
      quarters: barQuarters(quarters, shares[i]!),
      energy,
      level: draft.level,
      seats: silent
        ? seatEnergies(energy, new Set(SEATS))
        : seatEnergies(
            energy,
            new Set([
              ...without,
              ...(solos[i] ? [] : ["solo" as const]),
              ...(outs[i] ? [outs[i]] : []),
            ]),
            draft.line,
          ),
      solo: silent || without.has("solo") ? null : solos[i]!,
      fill,
      crash,
      lastPass: ends && options.mode === "jam" && draft.run.pass === passes - 1,
      ending: endingMark,
      source: flat.source,
      ...(enters[i] ? { enters: [enters[i]] } : {}),
    });
    tick += flat.ticks;
  });

  const playedPlanBars = bars.slice(0, playedBars);
  const lookahead = bars.slice(playedBars);
  const result: PlanBar[] = [];
  if (countIn) result.push(countInBar(playedPlanBars[0]!));
  result.push(...playedPlanBars);
  if (ending) {
    const last = playedPlanBars[playedPlanBars.length - 1]!;
    for (let t = 0; t < ending.tailBars; t++) {
      result.push(
        tailBar(last, result.length, last.start + last.ticks * (t + 1), ending.finalSpan),
      );
    }
  }
  const lastBar = result[result.length - 1]!;
  return {
    mode: options.mode,
    tempo,
    quarters,
    bars: result,
    lookahead,
    passes: options.mode === "jam" ? passes : 1,
    open: !ends,
    ticks: lastBar.start + lastBar.ticks,
    ...density,
  };
}

interface Draft {
  readonly flat: FlatBar;
  readonly run: Run;
  /** How the arrangement asks for this bar's section to be played, when there is one. */
  readonly line: ArrangementLine | undefined;
  readonly occurrence: number;
  readonly level: number;
  /**
   * The level the bar is asked for before any build, arc or lift: the section's, or the one the
   * player set. The high-tier line is held against what is added to it, never against this.
   */
  readonly base: number;
  readonly energy: number;
  /** Its pass's level on the arc as the jam set out, read at the pass's middle: what the tempo breathes with, 0 where it does not. */
  readonly arc: number;
  readonly barInSection: number;
  readonly barInPass: number;
  readonly phrase: { readonly index: number; readonly bar: number; readonly length: number };
  readonly lastOfRun: boolean;
}

// ── layout ──────────────────────────────────────────────────────────────────

/** The form that loops. A chart with nothing but an intro or an ending loops what it has. */
function bodyOf(expanded: ExpandedChart): readonly FlatBar[] {
  return expanded.body.length > 0 ? expanded.body : expanded.song;
}

function layOut(
  expanded: ExpandedChart,
  options: PlanOptions,
  passes: number,
  open: boolean,
): Run[] {
  if (options.mode === "song") return sectionRuns(expanded.song, 0, "body");
  const hasBody = expanded.body.length > 0;
  const runs: Run[] = hasBody ? sectionRuns(expanded.intro, 0, "intro") : [];
  // An open jam is planned one pass further than it is played, as look-ahead.
  const total = open ? passes + 1 : passes;
  const chorus = chorusOf(expanded, options);
  for (let pass = 0; pass < total; pass++) {
    if (chorus.lap === undefined) runs.push(...sectionRuns(chorus.bars, pass, "body"));
    else runs.push({ bars: chorus.bars, pass, part: "body", lap: chorus.lap });
  }
  if (!open && hasBody) runs.push(...sectionRuns(expanded.ending, passes - 1, "ending"));
  return runs;
}

/** Split bars into runs, one per time through a section. */
function sectionRuns(bars: readonly FlatBar[], pass: number, part: Run["part"]): Run[] {
  return runsOf(bars).map((run) => ({ bars: run, pass, part }));
}

/** Bars of this pass's body that come before a run. */
function passOffset(runs: readonly Run[], run: Run): number {
  let bars = 0;
  for (const other of runs) {
    if (other === run) break;
    if (other.part === "body" && other.pass === run.pass) bars += other.bars.length;
  }
  return bars;
}

function countPasses(expanded: ExpandedChart, quarters: number, options: PlanOptions): number {
  if (options.mode === "song") return 1;
  if (options.passes !== undefined) return Math.max(1, Math.floor(options.passes));
  if (options.open) return 1;
  const secondsOf = (bars: readonly FlatBar[]) =>
    bars.reduce((sum, bar) => sum + bar.ticks, 0) * (60 / quarters / PPQ);
  const body = secondsOf(chorusOf(expanded, options).bars);
  if (body <= 0) return 1;
  const fixed =
    expanded.body.length > 0 ? secondsOf(expanded.intro) + secondsOf(expanded.ending) : 0;
  const limit = (options.minutes ?? DEFAULT_MINUTES) * 60;
  // The whole number of passes that lands closest to the limit. Never cut mid-form.
  return Math.max(1, Math.round((limit - fixed) / body));
}

/**
 * One time through the form of a jam. A short vamp is not a form a lap at a
 * time: a band plays it in choruses, as it would a twelve-bar blues, so that a
 * phrase, a fill, a solo and the arc of the jam each have something to belong
 * to. Its chorus is one section of 2, 4, 8 or 16 laps: the fewest, doubling,
 * that make twelve bars.
 */
function chorusOf(
  expanded: ExpandedChart,
  options: PlanOptions,
): { readonly bars: readonly FlatBar[]; readonly lap?: number } {
  const body = bodyOf(expanded);
  const vamp =
    options.mode === "jam" &&
    body.length > 0 &&
    body.length < VAMP_BARS &&
    sectionRuns(body, 0, "body").length === 1;
  if (!vamp) return { bars: body };
  let laps = 2;
  while (laps * body.length < VAMP_CHORUS) laps *= 2;
  return { bars: Array.from({ length: laps }, () => body).flat(), lap: body.length };
}

/**
 * A vamp's phrases. A lap of three bars or more is phrased as it is written;
 * a lap of one or two is too short to be a phrase, and is played in fours.
 */
function vampPhrases(lap: number, bars: number): number[] {
  if (lap <= 2) return Array.from({ length: bars / 4 }, () => 4);
  return Array.from({ length: bars / lap }, () => phraseLengths(lap)).flat();
}

/** Four-bar phrases from the top; a leftover of one or two bars joins the last phrase. */
export function phraseLengths(bars: number): number[] {
  if (bars <= 5) return [bars];
  const phrases: number[] = Array.from({ length: Math.floor(bars / 4) }, () => 4);
  const leftover = bars % 4;
  if (leftover === 3) phrases.push(3);
  else if (leftover > 0) phrases[phrases.length - 1]! += leftover;
  return phrases;
}

/**
 * A bar that opens by holding "the chord from the bar before" was written with
 * the file's order in mind. Played order can differ (the top of the form comes
 * after its own last bar on every pass but the first), so the hold stands only
 * when the bar actually played before it ends on that chord; otherwise the
 * chord is struck.
 */
function seamSpans(bar: FlatBar, previous: FlatBar | undefined): readonly ChordSpan[] {
  const first = bar.spans[0];
  if (!first?.tied) return bar.spans;
  const sounding = previous?.spans[previous.spans.length - 1]?.chord ?? null;
  const same =
    previous !== undefined &&
    (first.chord === null || sounding === null
      ? first.chord === sounding
      : chordToString(first.chord) === chordToString(sounding));
  return same ? bar.spans : [{ ...first, tied: false }, ...bar.spans.slice(1)];
}

// ── energy ──────────────────────────────────────────────────────────────────

/** The level a label asks for, or undefined when the style has none for it (A, B, Head). */
function namedLevel(label: string, style: StylePack): number | undefined {
  const name = label.trim().toLowerCase();
  return style.arc.levels.find(([prefix]) => name.startsWith(prefix))?.[1];
}

function sectionLevel(label: string, style: StylePack): number {
  return namedLevel(label, style) ?? style.arc.defaultLevel;
}

/** What a tune's bridge is called when it is called anything. */
const BRIDGE = "bridge";

/**
 * The runs that are a tune's bridge without being labelled so (CO-27): in a chorus of three
 * or more sections with no section labelled a bridge, the second-to-last, when it is unlike
 * both the first and the last (the B of AABA, the C of ABCD). ABAC, a two-part tune and a
 * blues have none. A section whose label already asks for a level keeps it.
 */
function bridgeRuns(runs: readonly Run[], style: StylePack): Set<Run> {
  const found = new Set<Run>();
  const said = (run: Run) =>
    run.bars.map((bar) => `${bar.ticks}:${bar.spans.map(spanText).join(" ")}`).join("|");
  for (const [, chorus] of Map.groupBy(
    // Song mode plays every section in one pass: an intro and a written ending are not the tune.
    runs.filter(
      (run) => run.part === "body" && run.lap === undefined && run.bars[0]!.role === "body",
    ),
    (run) => run.pass,
  )) {
    if (chorus.length < 3) continue;
    const label = (run: Run) => run.bars[0]!.sectionLabel.trim().toLowerCase();
    if (chorus.some((run) => label(run).startsWith(BRIDGE))) continue;
    const candidate = chorus[chorus.length - 2]!;
    if (namedLevel(label(candidate), style) !== undefined) continue;
    const unlike = (other: Run) => said(other) !== said(candidate);
    if (unlike(chorus[0]!) && unlike(chorus[chorus.length - 1]!)) found.add(candidate);
  }
  return found;
}

const spanText = (span: ChordSpan): string =>
  `${span.start}=${span.chord === null ? "-" : chordToString(span.chord)}`;

/** A, A2 and A' are one section for every held choice. */
export function sectionIdentity(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s\d'’′]+$/u, "");
}

/**
 * Where the high tier is a different groove, no lift carries a bar across its line: a bar is
 * on the side of it that its base level is, the section's or the player's.
 */
function holdTierLine(lifted: number, level: number, style: StylePack): number {
  if (style.arc.liftsCrossHigh) return lifted;
  if (level < TIER_HIGH) return Math.min(lifted, TIER_HIGH - 0.01);
  return Math.max(lifted, TIER_HIGH);
}

/**
 * Each seat's energy for a bar. A seat that is `without` is out, whatever the
 * arrangement says: the player switched it off. Otherwise the arrangement's
 * line may lay it out or give it a level of its own.
 */
function seatEnergies(
  energy: number,
  without: ReadonlySet<Seat>,
  line?: ArrangementLine,
): Record<Seat, number | null> {
  const seats = {} as Record<Seat, number | null>;
  for (const seat of SEATS) {
    const call = line?.seats[seat] ?? null;
    seats[seat] =
      without.has(seat) || call === "out" ? null : call === null ? energy : LEVEL_ENERGY[call];
  }
  return seats;
}

/** A solo is one arc of at most this many choruses, then the soloist lays out for one (SO-04, SO-05). */
const SOLO_CHORUSES = 3;

/**
 * Where the soloist has the lead, bar by bar. It rests through an intro and a
 * written ending. A section labelled "Solo" is a solo whenever it comes round.
 * Otherwise, in a jam, the band states the form once, then the soloist plays
 * solos of three choruses with a chorus of rest between them; a solo cut short
 * by the end of the jam knows it is shorter, so it still peaks in its last
 * chorus. In a song with no "Solo" section it plays the body through as one
 * chorus. An open jam's solos never depend on how long the jam turns out to be.
 */
function soloMarks(
  drafts: readonly Draft[],
  options: PlanOptions,
  passes: number,
  open: boolean,
  fromTop: boolean,
): (SoloMark | null)[] {
  if (options.solo !== true) return drafts.map(() => null);
  const body = (draft: Draft) => draft.run.part === "body" && draft.flat.role === "body";
  const arc = (index: number, count: number): SoloMark => {
    const chorus = index % SOLO_CHORUSES;
    const of = open ? SOLO_CHORUSES : Math.min(SOLO_CHORUSES, count - (index - chorus));
    return { chorus, of };
  };

  // An arrangement says where the soloist has the lead: each section it is in is a chorus of a solo.
  if (drafts.some((draft) => draft.line)) {
    const leads = (draft: Draft) => draft.line !== undefined && draft.line.seats.solo !== "out";
    const times = [...new Set(drafts.filter(leads).map((draft) => draft.occurrence))];
    return drafts.map((draft) =>
      leads(draft) ? arc(times.indexOf(draft.occurrence), times.length) : null,
    );
  }

  const named = (draft: Draft) => sectionIdentity(draft.flat.sectionLabel).startsWith("solo");
  if (drafts.some(named)) {
    const times = [...new Set(drafts.filter(named).map((draft) => draft.occurrence))];
    return drafts.map((draft) =>
      named(draft) ? arc(times.indexOf(draft.occurrence), times.length) : null,
    );
  }
  if (options.mode === "song") {
    return drafts.map((draft) => (body(draft) ? { chorus: 0, of: 1 } : null));
  }
  return drafts.map((draft) =>
    body(draft) ? soloTurn(draft.run.pass, passes, open, fromTop) : null,
  );
}

/**
 * Whether a pass of a jam is the soloist's, and where in its solo: the band
 * alone first (unless one pass is all there is, or the soloist comes in at the
 * top), then solos of three choruses with a chorus of rest between them.
 */
function soloTurn(pass: number, passes: number, open: boolean, fromTop: boolean): SoloMark | null {
  const lead = !fromTop && (open || passes > 1) ? 1 : 0;
  const cycle = SOLO_CHORUSES + 1;
  const turn = pass - lead;
  if (turn < 0 || turn % cycle === SOLO_CHORUSES) return null;
  const chorus = turn % cycle;
  return { chorus, of: open ? SOLO_CHORUSES : Math.min(SOLO_CHORUSES, passes - (pass - chorus)) };
}

/**
 * The pass a jam with a soloist peaks on: the last chorus of a solo, the one
 * nearest to where the jam would have peaked anyway. A solo starts low and
 * peaks in its last chorus (SO-05), and the band under it does the same, or the
 * band would be at its loudest while the soloist is still finding its idea.
 */
function soloClimax(
  options: PlanOptions,
  passes: number,
  open: boolean,
  fromTop: boolean,
): number | undefined {
  // A solo of two choruses or more: from the second pass, or from the top.
  if (options.solo !== true || options.mode !== "jam" || open || passes < (fromTop ? 2 : 3)) {
    return undefined;
  }
  const wanted = defaultClimax(passes);
  let best: number | undefined;
  for (let pass = fromTop ? 0 : 1; pass < passes; pass++) {
    const turn = soloTurn(pass, passes, open, fromTop);
    if (!turn || turn.of === 1 || turn.chorus !== turn.of - 1) continue;
    // Of two as near, the later; but not the last pass, which the jam's own closing lift
    // carries from lower down, so that the pass before it would be the louder.
    const [here, there] = [Math.abs(pass - wanted), Math.abs((best ?? pass) - wanted)];
    if (best === undefined || here < there || (here === there && pass < passes - 1)) best = pass;
  }
  return best;
}

/**
 * The pass a jam with a soloist takes its breath on. A band comes down before
 * its last chorus, but never under a solo that is under way: there the breath
 * is the nearest chorus the soloist laid out for, and the band comes back up
 * with the solo. Undefined where the usual place, the pass before the last, is
 * the band's own; -1 where there is no chorus of rest after the peak to take
 * it on.
 */
function soloBreath(
  climax: number,
  passes: number,
  open: boolean,
  fromTop: boolean,
): number | undefined {
  const last = passes - 1;
  if (soloTurn(last - 1, passes, open, fromTop) === null) return undefined;
  for (let pass = last - 1; pass > climax; pass--) {
    if (soloTurn(pass, passes, open, fromTop) === null) return pass;
  }
  return -1;
}

/**
 * How far through its build a solo after the jam's peak is on a pass: 0 on its
 * first chorus, 1 on its last. A long jam has solos after its peak, and the
 * band builds under each of them as it did under the first (SO-05). Undefined
 * for a solo of one chorus, and for one that runs into the last pass, which
 * the jam's own closing lift carries.
 */
function soloRise(
  pass: number,
  climax: number,
  passes: number,
  open: boolean,
  fromTop: boolean,
): number | undefined {
  const turn = soloTurn(pass, passes, open, fromTop);
  if (!turn || turn.of < 2 || pass <= climax) return undefined;
  if (pass - turn.chorus + turn.of - 1 >= passes - 1) return undefined;
  return turn.chorus / (turn.of - 1);
}

// ── who is in ───────────────────────────────────────────────────────────────

/** The fewest band seats a jam may lay one out of: a band of two keeps both. */
const LAY_OUT_BAND = 3;
/** The first pass a seat may sit out: the band states the tune, then gets going, before it thins. */
const LAY_OUT_FROM = 2;
/** Nor before this many bars of music, however short the form. */
const LAY_OUT_FIRST_BAR = 16;
/** After a lay-out, everyone is in for at least this many whole passes... */
const LAY_OUT_PASSES_BETWEEN = 3;
/** ...and at least this many bars, however short the form, before another starts. */
const LAY_OUT_BARS_BETWEEN = 64;
/**
 * In an open jam every pass from the third may thin, where a jam of a set length offers a low
 * pass or two in its few minutes: there a pass draws this share of the style's chance, so that
 * a long open jam thins now and then and not every few minutes.
 */
const LAY_OUT_OPEN = 0.25;

interface Shape {
  readonly planned: number;
  readonly passes: number;
  readonly open: boolean;
  readonly ends: boolean;
  readonly without: ReadonlySet<Seat>;
  /** The pass the band was told to finish on. */
  readonly told?: number;
  readonly climax?: number;
  readonly breath?: number;
  readonly rise: (pass: number) => number | undefined;
}

/**
 * The seat each bar of a jam lays out by the style's own say (`ArcStyle.layOut`), or null. A
 * seat goes out at the top of a section or a pass and is back at the top of the next.
 *
 * Where: in a jam of a set length, a pass no higher on the arc as the jam set out than `below`
 * of the way from its opening pass to its peak, read at the pass's middle: the breath, a pass
 * settled after the peak, and a building pass short of the top (the pass just before the peak
 * among them: a drop before everyone comes in for the top). Never the peak, the last pass, the
 * first two passes or the first 16 bars. Under the soloist, never the last chorus of a solo
 * (its peak, SO-05), so never a solo of one chorus. An open jam has no arc to be low on (its
 * lift only climbs to a cap) and no peak: there it is the spacing and the chance alone.
 *
 * How often: after a lay-out, everyone is in for three whole passes and 64 bars at least, and
 * each pass draws its chance. Never a level the player holds, a band of two seats, or the
 * soloist. A jam planned shorter than four passes lays nobody out by these rules alone.
 *
 * Each pass draws from the seed by its own number, and only what the passes before it drew can
 * stop it, so a jam made longer keeps every lay-out it had. The pass it is told to finish on is
 * its last, and everyone is in for it.
 */
function layOuts(
  drafts: readonly Draft[],
  solos: readonly (SoloMark | null)[],
  style: StylePack,
  options: PlanOptions,
  shape: Shape,
): { outs: (Seat | null)[]; enters: (Seat | null)[] } {
  const outs: (Seat | null)[] = drafts.map(() => null);
  const enters: (Seat | null)[] = drafts.map(() => null);
  const none = { outs, enters };
  const data = style.arc.layOut;
  if (!data || options.seed === undefined || options.energy !== undefined) return none;
  const band = (["drums", "bass", "chords"] as const).filter((seat) => !shape.without.has(seat));
  const seats = data.seats.filter((seat) => !shape.without.has(seat));
  if (band.length < LAY_OUT_BAND || seats.length === 0) return none;

  const byPass = Map.groupBy(
    drafts.flatMap((draft, i) => (draft.run.part === "body" ? [i] : [])),
    (i) => drafts[i]!.run.pass,
  );
  const timed = style.arc.timed;
  const ceiling = timed.first + data.below * (timed.climax - timed.first);
  const peak = shape.open ? undefined : (shape.climax ?? defaultClimax(shape.planned));
  const rng = createRng(options.seed);
  // The last lay-out: its pass, and the bar after it (bars counted from the first of the music).
  let lastPass = Number.NEGATIVE_INFINITY;
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const [pass, bars] of byPass) {
    if (pass < LAY_OUT_FROM || pass === peak) continue;
    if (pass - lastPass <= LAY_OUT_PASSES_BETWEEN) continue;
    const toldHere = pass === shape.told;
    if (shape.ends && pass === shape.passes - 1 && !toldHere) continue;
    const soloing = (i: number) => solos[i] !== null && !shape.without.has("solo");
    if (data.under === "solo") {
      if (!bars.every(soloing)) continue;
      // Never the last chorus of a solo: it is the solo's peak, and the band is all in for it.
      if (bars.some((i) => solos[i]!.chorus === solos[i]!.of - 1)) continue;
    } else if (bars.some(soloing)) continue;
    if (!shape.open) {
      const rise = shape.rise(pass);
      const height = arcOffset(style.arc, {
        pass,
        passes: shape.planned,
        open: false,
        part: "body",
        phraseStart: 0.5,
        phraseEnd: 0.5,
        ...(shape.climax === undefined ? {} : { climax: shape.climax }),
        ...(shape.breath === undefined ? {} : { breath: shape.breath }),
        ...(rise === undefined ? {} : { rise }),
      });
      if (height > ceiling) continue;
    }
    const draw = rng.fork("lay-out", style.id, pass);
    if (!draw.chance(shape.open ? data.chance * LAY_OUT_OPEN : data.chance)) continue;
    const seat = draw.pick(seats);
    // A section: the pass's lowest, by its own level; of several as low, one drawn.
    const levels = new Map(bars.map((i) => [drafts[i]!.run, drafts[i]!.level]));
    const lowest = Math.min(...levels.values());
    const chosen =
      data.span === "pass"
        ? new Set(levels.keys())
        : new Set([
            draw.pick([...levels].filter(([, level]) => level === lowest).map(([run]) => run)),
          ]);
    const out = bars.filter((i) => chosen.has(drafts[i]!.run));
    if (out[0]! < LAY_OUT_FIRST_BAR || out[0]! - lastEnd < LAY_OUT_BARS_BETWEEN) continue;
    if (toldHere) {
      // Told to finish on a pass the seat was to sit out from its top: everyone is in for it,
      // but the seat was not going to play its first bar, so it comes in there as it comes back
      // from any lay-out, and nobody leans into it from the bar before, which is played as the
      // jam as planned played it.
      if (out[0] === bars[0]) enters[out[0]!] = seat;
      continue;
    }
    for (const i of out) outs[i] = seat;
    lastPass = pass;
    lastEnd = out.at(-1)! + 1;
  }
  return none;
}

/** Add a lift without leaving the tier the bar is in. */
function withinTier(energy: number, lift: number): number {
  const ceiling = energy < TIER_MID ? TIER_MID : energy < TIER_HIGH ? TIER_HIGH : 1;
  return Math.max(energy, Math.min(energy + lift, ceiling - 0.01));
}

const tierRank = (energy: number): number => ["low", "mid", "high"].indexOf(tierOf(energy));
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const clampTempo = (bpm: number): number =>
  Number.isFinite(bpm) ? Math.min(400, Math.max(20, bpm)) : 120;

// ── the ending ──────────────────────────────────────────────────────────────

interface Ending {
  readonly spans: readonly ChordSpan[];
  readonly finalSpan: ChordSpan;
  /** The last bar is all rest: there is no final chord to play. */
  readonly silent: boolean;
  readonly tailBars: number;
  mark(barTicks: number, style: StylePack): EndingMark;
}

/**
 * Decide the last bar's harmony. If the bar comes to rest on a home chord, it
 * is played as written and the final gesture starts where home lands. If it
 * does not (a turnaround, written to send the form round again), the band does
 * not play it: the whole bar becomes the tonic in the style's colour.
 */
function resolveEnding(
  last: FlatBar,
  expanded: ExpandedChart,
  style: StylePack,
  written: boolean,
): Ending {
  // The final chord is the last chord written, not the last span: a rest written after it is
  // honoured, and the chord sounds only up to the rest.
  const finalIndex = last.spans.findLastIndex((span) => span.chord !== null);
  const finalWritten = last.spans[finalIndex];
  const rest = last.spans.slice(finalIndex + 1);
  const restStart = rest[0]?.start ?? last.ticks;

  let spans: readonly ChordSpan[];
  // A written ending (an Outro, a Tag) is the chart's own: it is played as written, wherever
  // it stops (EN-05). Only the form's own last bar is resolved for it.
  if (written || !finalWritten?.chord || isHome(finalWritten.chord, last.key)) {
    spans = last.spans;
  } else {
    const family = tonicFamily(expanded, last.key);
    const chord = tonicChord(last.key, style.ending.finalChord[family], last.source);
    spans = [{ chord, start: 0, duration: restStart, tied: false }, ...rest];
  }
  // The gesture starts where the final chord begins. A bar that is all rest has no final chord:
  // the chart wrote its own silence, and the band keeps it.
  const lastChorded = spans.findLastIndex((span) => span.chord !== null);
  const silent = lastChorded < 0;
  // Home written twice in the bar (or held with a dot) has sounded since its first span:
  // the band's hit is where the final chord first lands.
  let landing = Math.max(0, lastChorded);
  while (landing > 0 && sameHarmony(spans[landing - 1]!, spans[landing]!)) landing--;
  const finalSpan = spans[landing]!;
  const gesture = style.ending.gesture;
  const rings = gesture.kind !== "stop" && rest.length === 0 && finalSpan.chord !== null;
  const tailBars = rings ? Math.max(0, Math.floor(style.ending.tailBars)) : 0;
  return {
    spans,
    finalSpan,
    silent,
    tailBars,
    mark: (barTicks) => ({
      gesture,
      at: finalSpan.start,
      ring: rings
        ? barTicks - finalSpan.start + tailBars * barTicks
        : Math.min(gesture.kind === "stop" ? PPQ / 2 : barTicks, restStart - finalSpan.start),
    }),
  };
}

function sameHarmony(a: ChordSpan, b: ChordSpan): boolean {
  if (b.tied) return true;
  return a.chord !== null && b.chord !== null && chordToString(a.chord) === chordToString(b.chord);
}

/** Home: rooted on the tonic, with the tonic in the bass, in a family that can rest. */
function isHome(chord: ChartChord, key: Key): boolean {
  if (pitchClass(chord.root) !== pitchClass(key.tonic)) return false;
  if (chord.bass && pitchClass(chord.bass) !== pitchClass(chord.root)) return false;
  const family = chordFamily(chord.quality);
  return family === "major" || family === "minor" || family === "dominant" || family === "power";
}

/**
 * What kind of tonic the chart has, weighed by how long it rests on each kind.
 * Dominant only when no major-seventh tonic appears and dominant tonics
 * out-rest the plain ones: a blues with one plain I is still a blues.
 */
function tonicFamily(expanded: ExpandedChart, key: Key): "major" | "minor" | "dominant" {
  let minor = 0;
  let dominant = 0;
  let plain = 0;
  let majorSeventh = 0;
  for (const bar of bodyOf(expanded)) {
    for (const span of bar.spans) {
      const chord = span.chord;
      if (!chord || pitchClass(chord.root) !== pitchClass(bar.key.tonic)) continue;
      const family = chordFamily(chord.quality);
      if (family === "minor") minor += span.duration;
      else if (family === "dominant") dominant += span.duration;
      else if (family === "major") {
        if (/^maj/.test(chord.quality.base)) majorSeventh += span.duration;
        else plain += span.duration;
      }
    }
  }
  const majorThird = dominant + plain + majorSeventh;
  if (minor > majorThird || (minor === majorThird && key.mode === "minor")) return "minor";
  if (majorSeventh === 0 && dominant > plain) return "dominant";
  return "major";
}

function tonicChord(
  key: Key,
  quality: StylePack["ending"]["finalChord"]["major"],
  source: SourceRange,
): ChartChord {
  const chord = { root: key.tonic, quality: makeQuality(quality), bass: null };
  return {
    ...chord,
    degree: { step: 1, accidental: 0 },
    bassDegree: null,
    written: "name",
    secondary: null,
    text: chordToString(chord),
    range: source,
  };
}

// ── bars that are not the chart's ───────────────────────────────────────────

function countInBar(first: PlanBar): PlanBar {
  return {
    ...first,
    index: 0,
    start: 0,
    kind: "count-in",
    spans: [{ chord: null, start: 0, duration: first.ticks, tied: false }],
    section: { ...first.section, label: "Count-in", identity: "count-in", occurrence: -1, bars: 1 },
    barInSection: 0,
    barInPass: -1,
    phrase: { index: 0, bar: 0, length: 1 },
    // The count belongs to the band even when its drummer is the person playing along.
    seats: { drums: first.energy, bass: null, chords: null, solo: null },
    solo: null,
    fill: null,
    crash: false,
    ending: null,
    source: null,
  };
}

function tailBar(last: PlanBar, index: number, start: number, finalSpan: ChordSpan): PlanBar {
  return {
    ...last,
    index,
    start,
    kind: "tail",
    spans: [{ chord: finalSpan.chord, start: 0, duration: last.ticks, tied: true }],
    barInSection: last.barInSection + (index - last.index),
    barInPass: last.barInPass + (index - last.index),
    seats: { drums: null, bass: null, chords: null, solo: null },
    solo: null,
    fill: null,
    crash: false,
    ending: null,
    source: null,
  };
}
