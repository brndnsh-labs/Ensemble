// The planner. Turns an expanded chart, a style, and options into a Plan:
// which bars are played, how hard, where the fills and arrivals fall, and how
// the performance ends.

import type { ChartChord, ChordSpan, ExpandedChart, FlatBar, SourceRange } from "../chart/types.ts";
import { PPQ } from "../chart/types.ts";
import type { Seat, StylePack } from "../style/types.ts";
import { SEATS, TIER_HIGH, TIER_MID, tierOf } from "../style/types.ts";
import { chordFamily, chordToString, makeQuality } from "../theory/chord.ts";
import type { Key } from "../theory/pitch.ts";
import { pitchClass } from "../theory/pitch.ts";
import { arcOffset, defaultClimax } from "./arc.ts";
import type { EndingMark, FillMark, Plan, PlanBar, PlanOptions, SoloMark } from "./types.ts";

/** A timed jam with no stated length. */
const DEFAULT_MINUTES = 3;
/** A single section shorter than this that just goes round is a vamp, not a form. */
const VAMP_BARS = 8;

/** One time through one section: the unit that phrases, fills and held choices hang on. */
interface Run {
  readonly bars: readonly FlatBar[];
  readonly pass: number;
  readonly part: "intro" | "body" | "ending";
}

export function planBars(
  expanded: ExpandedChart,
  chartTempo: number | null,
  style: StylePack,
  options: PlanOptions,
): Plan {
  const tempo = clampTempo(options.tempo ?? chartTempo ?? style.tempo.default);
  const open = options.mode === "jam" && options.open === true;
  const passes = countPasses(expanded, tempo, options);

  const runs = layOut(expanded, options, passes, open);
  const played = runs.filter((run) => !open || run.pass < passes);
  const playedBars = played.reduce((sum, run) => sum + run.bars.length, 0);
  if (playedBars === 0) {
    return { mode: options.mode, tempo, bars: [], lookahead: [], passes: 0, open, ticks: 0 };
  }

  const vamp = isVamp(expanded, options);
  const oneSection = runs.filter((run) => run.part === "body" && run.pass === 0).length === 1;
  const without = new Set<Seat>(options.without ?? []);
  const bodyBarsPerPass = Math.max(1, options.mode === "jam" ? bodyOf(expanded).length : 1);

  const climax = soloClimax(options, passes, open);

  // First the music, bar by bar, without marks that depend on a neighbour.
  const drafts: Draft[] = [];
  let occurrence = 0;
  let lapBars = 0;
  for (const run of runs) {
    const first = run.bars[0]!;
    const level = sectionLevel(first.sectionLabel, style);
    const phrases = phraseLengths(run.bars.length);
    const barInPassBase = run.part === "body" ? passOffset(runs, run) : 0;
    const before = lapBars;
    if (run.part === "body") lapBars += run.bars.length;
    let phraseIndex = 0;
    let barInPhrase = 0;
    run.bars.forEach((bar, i) => {
      const phraseLength = phrases[phraseIndex]!;
      const barInPass = barInPassBase + i;
      // Energy steps at phrase tops, never mid-phrase: read the arc at the phrase's middle,
      // and in the last pass at the phrase's end so the closing phrase is at full level.
      const phraseStart = barInPass - barInPhrase;
      const offset =
        options.mode === "jam"
          ? arcOffset(style.arc, {
              pass: run.pass,
              passes,
              open,
              part: run.part,
              phraseStart: phraseStart / bodyBarsPerPass,
              phraseEnd: Math.min(1, (phraseStart + phraseLength) / bodyBarsPerPass),
              ...(climax === undefined ? {} : { climax }),
            })
          : 0;
      drafts.push({
        flat: bar,
        run,
        occurrence,
        level,
        // A level the player set is held: the band must not drift away from it (CO-05, CO-06).
        energy:
          options.energy === undefined
            ? level + offset * style.arc.depth
            : options.energy + (level - style.arc.defaultLevel) / 2,
        barInSection: i,
        barInPass,
        phrase: { index: phraseIndex, bar: barInPhrase, length: phraseLength },
        lastOfRun: i === run.bars.length - 1,
        lapBarsBefore: before,
        lapBarsAfter: lapBars,
      });
      barInPhrase++;
      if (barInPhrase === phraseLength) {
        phraseIndex++;
        barInPhrase = 0;
      }
    });
    occurrence++;
  }

  const solos = soloMarks(drafts, options, passes, open);

  // The one-bar build into a bigger section, then the rule about the high-tier line.
  const energies = drafts.map((draft, i) => {
    const next = drafts[i + 1];
    const builds = draft.lastOfRun && next !== undefined && next.level > draft.level + 0.05;
    // The build is a swell, not a new part: it never carries its one bar across a tier line,
    // or the groove would change for a single bar before the fill.
    const lifted = builds ? withinTier(draft.energy, style.arc.build) : draft.energy;
    return clamp01(holdTierLine(lifted, draft.level, style));
  });

  const endingIndex = open ? -1 : playedBars - 1;
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
      if (vamp && draft.run.part === "body") {
        // A short vamp is not filled every lap: count bars toward 8- and 16-bar lines.
        if (draft.lastOfRun) {
          const line16 = Math.floor(draft.lapBarsAfter / 16);
          const line8 = Math.floor(draft.lapBarsAfter / 8);
          if (line16 > Math.floor(draft.lapBarsBefore / 16)) {
            fill = { boundary: "section", top: true, tier, half: line16 % 2 === 1 };
          } else if (line8 > Math.floor(draft.lapBarsBefore / 8)) {
            fill = { boundary: "phrase", top: false, tier, half: ((line8 - 1) / 2) % 2 === 0 };
          }
        }
      } else if (draft.lastOfRun) {
        const newPass = next !== undefined && next.run.pass !== draft.run.pass;
        // "Is the next section bigger" is asked of the levels the band will actually play.
        // The one-bar build stays inside its tier, so it cannot hide the step it leads into.
        const bigger = next !== undefined && tierRank(nextEnergy) > tierRank(energy);
        // On a one-section form every turnaround is the top of the form. The biggest fill is
        // kept for where the band steps up, or it is the only fill the turnaround ever gets.
        fill = { boundary: "section", top: bigger || (newPass && !oneSection), tier, half: false };
      } else if (lastOfPhrase && draft.phrase.index % 2 === 1) {
        fill = { boundary: "phrase", top: false, tier, half: false };
      }
      if (isSetup) {
        // A quiet tune still rolls into its last hit; a style that ends softly plays time into it.
        // Nobody rolls into a bar of written silence.
        fill =
          style.ending.setupFill && !ending?.silent
            ? { boundary: "section", top: true, tier: "high", half: false }
            : null;
      }
    }
    if (previous && !isEnding) {
      const previousFill = bars[bars.length - 1]?.fill ?? null;
      const newSection = draft.barInSection === 0;
      if (vamp && draft.run.part === "body" && previous.run.part === "body") {
        crash = previousFill?.boundary === "section";
      } else if (newSection) {
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
      energy,
      level: draft.level,
      seats: silent
        ? seatEnergies(energy, new Set(SEATS))
        : seatEnergies(energy, solos[i] ? without : new Set([...without, "solo" as const])),
      solo: silent || without.has("solo") ? null : solos[i]!,
      // What a choice held "per pass" is held for. A lap of a short vamp is too short to be a
      // pass: there it is the 16 bars between the vamp's own section lines.
      stretch:
        vamp && draft.run.part === "body"
          ? Math.floor((draft.lapBarsBefore + draft.barInSection) / 16)
          : draft.occurrence,
      fill,
      crash,
      lastPass: !open && options.mode === "jam" && draft.run.pass === passes - 1,
      ending: endingMark,
      source: flat.source,
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
    bars: result,
    lookahead,
    passes: options.mode === "jam" ? passes : 1,
    open,
    ticks: lastBar.start + lastBar.ticks,
  };
}

interface Draft {
  readonly flat: FlatBar;
  readonly run: Run;
  readonly occurrence: number;
  readonly level: number;
  readonly energy: number;
  readonly barInSection: number;
  readonly barInPass: number;
  readonly phrase: { readonly index: number; readonly bar: number; readonly length: number };
  readonly lastOfRun: boolean;
  /** Body bars played before and after this section's run, for counting a vamp's laps. */
  readonly lapBarsBefore: number;
  readonly lapBarsAfter: number;
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
  for (let pass = 0; pass < total; pass++)
    runs.push(...sectionRuns(bodyOf(expanded), pass, "body"));
  if (!open && hasBody) runs.push(...sectionRuns(expanded.ending, passes - 1, "ending"));
  return runs;
}

/** Split bars into runs, one per time through a section. */
function sectionRuns(bars: readonly FlatBar[], pass: number, part: Run["part"]): Run[] {
  const runs: Run[] = [];
  let current: FlatBar[] = [];
  for (const bar of bars) {
    const previous = current[current.length - 1];
    const continues =
      previous !== undefined &&
      previous.sectionIndex === bar.sectionIndex &&
      bar.barInSection === previous.barInSection + 1;
    if (!continues && current.length > 0) {
      runs.push({ bars: current, pass, part });
      current = [];
    }
    current.push(bar);
  }
  if (current.length > 0) runs.push({ bars: current, pass, part });
  return runs;
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

function countPasses(expanded: ExpandedChart, tempo: number, options: PlanOptions): number {
  if (options.mode === "song") return 1;
  if (options.passes !== undefined) return Math.max(1, Math.floor(options.passes));
  if (options.open) return 1;
  const secondsOf = (bars: readonly FlatBar[]) =>
    bars.reduce((sum, bar) => sum + bar.ticks, 0) * (60 / tempo / PPQ);
  const body = secondsOf(bodyOf(expanded));
  if (body <= 0) return 1;
  const fixed =
    expanded.body.length > 0 ? secondsOf(expanded.intro) + secondsOf(expanded.ending) : 0;
  const limit = (options.minutes ?? DEFAULT_MINUTES) * 60;
  // The whole number of passes that lands closest to the limit. Never cut mid-form.
  return Math.max(1, Math.round((limit - fixed) / body));
}

function isVamp(expanded: ExpandedChart, options: PlanOptions): boolean {
  if (options.mode !== "jam") return false;
  const body = bodyOf(expanded);
  return body.length < VAMP_BARS && sectionRuns(body, 0, "body").length === 1;
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

function sectionLevel(label: string, style: StylePack): number {
  const name = label.trim().toLowerCase();
  for (const [prefix, energy] of style.arc.levels) {
    if (name.startsWith(prefix)) return energy;
  }
  return style.arc.defaultLevel;
}

/** A, A2 and A' are one section for every held choice. */
export function sectionIdentity(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s\d'’′]+$/u, "");
}

/** Where the high tier is a different groove, no lift carries a bar across its line. */
function holdTierLine(lifted: number, level: number, style: StylePack): number {
  if (style.arc.liftsCrossHigh) return lifted;
  if (level < TIER_HIGH) return Math.min(lifted, TIER_HIGH - 0.01);
  return Math.max(lifted, TIER_HIGH);
}

function seatEnergies(energy: number, without: ReadonlySet<Seat>): Record<Seat, number | null> {
  const seats = {} as Record<Seat, number | null>;
  for (const seat of SEATS) seats[seat] = without.has(seat) ? null : energy;
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
): (SoloMark | null)[] {
  if (options.solo !== true) return drafts.map(() => null);
  const body = (draft: Draft) => draft.run.part === "body" && draft.flat.role === "body";
  const arc = (index: number, count: number): SoloMark => {
    const chorus = index % SOLO_CHORUSES;
    const of = open ? SOLO_CHORUSES : Math.min(SOLO_CHORUSES, count - (index - chorus));
    return { chorus, of };
  };

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
  return drafts.map((draft) => (body(draft) ? soloTurn(draft.run.pass, passes, open) : null));
}

/**
 * Whether a pass of a jam is the soloist's, and where in its solo: the band
 * alone first (unless one pass is all there is), then solos of three choruses
 * with a chorus of rest between them.
 */
function soloTurn(pass: number, passes: number, open: boolean): SoloMark | null {
  const lead = open || passes > 1 ? 1 : 0;
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
function soloClimax(options: PlanOptions, passes: number, open: boolean): number | undefined {
  if (options.solo !== true || options.mode !== "jam" || open || passes < 3) return undefined;
  const wanted = defaultClimax(passes);
  let best: number | undefined;
  for (let pass = 1; pass < passes; pass++) {
    const turn = soloTurn(pass, passes, open);
    if (!turn || turn.of === 1 || turn.chorus !== turn.of - 1) continue;
    if (best === undefined || Math.abs(pass - wanted) <= Math.abs(best - wanted)) best = pass;
  }
  return best;
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
