// What a pianist would say about the rhythm of a comping part: how busy it
// is, whether it sits with the drummer, how often it leans into a change, and
// the question the old band never asked: does the rhythm have a shape over a
// phrase, or is it a loop, or a scatter? (ME-29, Q-48.)
//
// Everything is read from the notes played. Bars are compared as rhythms by
// `alike`, the same test the comper applies to the plans it weighs.

import type { ChartChord } from "../../chart/types.ts";
import { PPQ } from "../../chart/types.ts";
import { energyGain } from "../../perform/feel.ts";
import { arrivals, sameChord } from "../../perform/harmony.ts";
import type { PlanBar } from "../../plan/types.ts";
import { fingering, fretsOf } from "../../players/chords/guitar.ts";
import type { BarRhythm } from "../../players/chords/rhythm.ts";
import { alike, barRhythm, samePhrase } from "../../players/chords/rhythm.ts";
import { MUTED, PICKED } from "../../players/chords/strike.ts";
import { GHOST_BELOW } from "../../players/drums/kit.ts";
import type { StylePack, Tier } from "../../style/types.ts";
import { tierOf } from "../../style/types.ts";
import type { Take } from "../../take.ts";
import { chordTones } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import { mean, notesOf, share } from "../read.ts";
import type { Measure, Measurement } from "../types.ts";

export const EIGHTH = PPQ / 2;
/** Slack, in ticks, for "still sounding at the change": the pocket moves a note's end a little. */
export const POCKET = 10;

/**
 * Whether these notes say this chord: its third (or suspension) and its seventh
 * (or sixth) are among them. It is what tells a chord played early from the
 * chord before it struck late.
 */
export function states(chord: ChartChord, pitches: readonly number[]): boolean {
  const classes = new Set(pitches.map((pitch) => mod12(pitch)));
  return chordTones(chord.quality)
    .filter((tone) => ["third", "sus", "seventh", "sixth"].includes(tone.role))
    .every((tone) => classes.has(mod12(pitchClass(chord.root) + tone.interval)));
}

/** One time the hand comes down: where on the grid, and when it stops sounding. */
interface Hit {
  readonly tick: number;
  readonly ends: number;
  /** How long it sounds, as played. */
  readonly length: number;
  readonly pitches: readonly number[];
  /** A scratch: the stroke with the notes deadened. It keeps the time and states no chord. */
  readonly muted: boolean;
  /** A plucked string (or two): one note of the grip, not a chord struck. */
  readonly picked: boolean;
  /** Strummed upward: the highest string sounds first. */
  readonly up: boolean;
  /** How hard, as played: the loudest of its notes. */
  readonly level: number;
}

/** One phrase of comping as it was played: its bars and their rhythms. */
interface Phrase {
  readonly bars: readonly PlanBar[];
  readonly rhythm: readonly BarRhythm[];
}

interface Reading {
  /** The bars the piano comps in: 4/4, playing, short of the ending bar. */
  readonly bars: readonly PlanBar[];
  /** The chords struck in each bar. A scratch is not one of them, nor a plucked string. */
  readonly hits: ReadonlyMap<number, readonly Hit[]>;
  /** Every stroke of the hand in each bar, scratches too. On a keyboard these are the hits. */
  readonly strokes: ReadonlyMap<number, readonly Hit[]>;
  /** Each bar as a rhythm of chords struck. */
  readonly rhythm: ReadonlyMap<number, BarRhythm>;
  /** Phrases the piano comps every bar of, in the order played. */
  readonly phrases: readonly Phrase[];
}

const readings = new WeakMap<Take, Reading>();

function read(take: Take): Reading {
  const known = readings.get(take);
  if (known) return known;

  const all = take.plan.bars;
  const bars = all.filter(
    (bar) =>
      bar.kind === "music" &&
      bar.seats.chords !== null &&
      !bar.ending &&
      bar.meter.beats === 4 &&
      bar.meter.unit === 4,
  );
  const byTick = new Map<number, Hit>();
  // Where the lowest and the highest note of each stroke sound, to read which way it rolled.
  const rolled = new Map<number, { low: number; lowAt: number; high: number; highAt: number }>();
  for (const note of notesOf(take, "chords")) {
    const ends = note.tick + note.offset + note.duration;
    const hit = byTick.get(note.tick);
    const roll = rolled.get(note.tick);
    const low = !roll || note.pitch < roll.low;
    const high = !roll || note.pitch > roll.high;
    const across = {
      low: low ? note.pitch : roll.low,
      lowAt: low ? note.offset : roll.lowAt,
      high: high ? note.pitch : roll.high,
      highAt: high ? note.offset : roll.highAt,
    };
    rolled.set(note.tick, across);
    byTick.set(note.tick, {
      tick: note.tick,
      ends: Math.max(hit?.ends ?? 0, ends),
      length: Math.max(hit?.length ?? 0, note.duration),
      pitches: [...(hit?.pitches ?? []), note.pitch],
      muted: note.voice === MUTED,
      picked: note.voice === PICKED,
      up: across.highAt < across.lowAt,
      level: Math.max(hit?.level ?? 0, note.velocity),
    });
  }
  const struck = [...byTick.values()].sort((a, b) => a.tick - b.tick);

  // A change at the barline: the bar opens on a different chord from the one before it ended on.
  const changes = (before: PlanBar | undefined, bar: PlanBar | undefined) => {
    const from = before?.kind === "music" ? before.spans.at(-1)?.chord : null;
    const to = bar?.kind === "music" ? bar.spans[0]?.chord : null;
    return !!from && !!to && !sameChord(from, to);
  };
  const hits = new Map<number, Hit[]>();
  const strokes = new Map<number, Hit[]>();
  const rhythm = new Map<number, BarRhythm>();
  for (const bar of bars) {
    const own = struck.filter((hit) => hit.tick >= bar.start && hit.tick < bar.start + bar.ticks);
    const sounded = own.filter((hit) => !hit.muted && !hit.picked);
    strokes.set(bar.index, own);
    hits.set(bar.index, sounded);
    rhythm.set(
      bar.index,
      barRhythm(
        sounded.map((hit) => hit.tick),
        bar.start,
        changes(all[bar.index - 1], bar),
        changes(bar, all[bar.index + 1]),
      ),
    );
  }

  const groups = new Map<string, PlanBar[]>();
  for (const bar of bars) {
    const place = `${bar.section.occurrence}/${bar.phrase.index}`;
    groups.set(place, [...(groups.get(place) ?? []), bar]);
  }
  const phrases = [...groups.values()]
    .filter((group) => group.length === group[0]!.phrase.length)
    .map((group) => ({ bars: group, rhythm: group.map((bar) => rhythm.get(bar.index)!) }));

  const reading = { bars, hits, strokes, rhythm, phrases };
  readings.set(take, reading);
  return reading;
}

const tierAt = (bar: PlanBar) => tierOf(bar.seats.chords ?? bar.energy);

/**
 * A bar that strikes every eighth is a groove (the boogie pump), not a
 * conversation: it is meant to be the same bar, so the questions about
 * shape are asked of the other bars and the pump has its own.
 */
const hammered = (rhythm: BarRhythm) => rhythm.steps.filter((step) => step % 2 === 0).length >= 7;

/** The bars in which the piano pumps. */
export function pumping(take: Take): Set<number> {
  const { bars, rhythm } = read(take);
  return new Set(bars.filter((bar) => hammered(rhythm.get(bar.index)!)).map((bar) => bar.index));
}

/**
 * The phrases that are a conversation: three bars or more, none of them
 * hammered, and none where the soloist has the lead. Under a solo the hand
 * leaves strikes out and puts answers in around the line, so what is played
 * there is not the plan's shape; the conversation has its own measures.
 */
const spoken = (take: Take) =>
  read(take).phrases.filter(
    (phrase) =>
      phrase.bars.length >= 3 &&
      !phrase.rhythm.some((bar) => hammered(bar)) &&
      phrase.bars.every((bar) => bar.solo === null),
  );

function strikesPerBar(take: Take, tier: Tier, bandOnly = false): Measurement | null {
  const { bars, hits } = read(take);
  return mean(
    bars
      .filter((bar) => tierAt(bar) === tier && !(bandOnly && bar.solo !== null))
      .map((bar) => hits.get(bar.index)!.length),
  );
}

/**
 * The places in a bar a hand could come down: the eighths, or every sixteenth
 * for a hand that strums sixteenths. Chance is counted over these.
 */
function places(style: StylePack): number {
  const idiom = style.chords.idiom;
  return idiom !== "keys" && idiom.strum.grid === "sixteenth" ? 16 : 8;
}

/** The grid ticks in the bars the piano comps where a kick or a backbeat is struck, ghosts apart. */
function drumLandings(take: Take): Set<number> {
  const { bars } = read(take);
  const comped = new Map(bars.map((bar) => [bar.index, bar]));
  const landings = new Set<number>();
  for (const note of notesOf(take, "drums")) {
    if (note.voice !== "kick" && note.voice !== "snare" && note.voice !== "crossStick") continue;
    const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick);
    if (!bar || !comped.has(bar.index)) continue;
    // A feathered kick is felt, not heard: judged by the level it was written at.
    const written = note.velocity / energyGain(bar.seats.drums ?? bar.energy);
    if (written >= GHOST_BELOW) landings.add(note.tick);
  }
  return landings;
}

function phraseShape(take: Take, has: (rhythm: readonly BarRhythm[]) => boolean) {
  const phrases = spoken(take);
  return share(phrases.filter((phrase) => has(phrase.rhythm)).length, phrases.length);
}

const returns = (rhythm: readonly BarRhythm[]) =>
  rhythm.slice(1).some((bar) => alike(bar, rhythm[0]!));
const turns = (rhythm: readonly BarRhythm[]) => rhythm.some((bar) => !alike(bar, rhythm[0]!));

/**
 * The chords struck in each bar of six (6/4) the seat plays, short of the ending bar and
 * from the working level up, as ticks from the barline. The 4/4 reading above does not
 * read these bars.
 */
function strikesInSix(take: Take): number[][] {
  const struck = new Map<number, Set<number>>();
  for (const note of notesOf(take, "chords")) {
    if (note.voice === MUTED || note.voice === PICKED) continue;
    const bar = take.plan.bars.findLast((candidate) => candidate.start <= note.tick);
    if (!bar) continue;
    let ticks = struck.get(bar.index);
    if (!ticks) {
      ticks = new Set();
      struck.set(bar.index, ticks);
    }
    ticks.add(note.tick - bar.start);
  }
  return take.plan.bars
    .filter(
      (bar) =>
        bar.kind === "music" &&
        !bar.ending &&
        bar.meter.beats === 6 &&
        bar.meter.unit === 4 &&
        bar.seats.chords !== null &&
        tierOf(bar.seats.chords) !== "low",
    )
    .map((bar) => [...(struck.get(bar.index) ?? [])]);
}

export const compingMeasures: readonly Measure[] = [
  {
    id: "chords.strikes-per-bar-in-six",
    seat: "chords",
    idiom: true,
    says: "In six, from the working level up, the piano strikes one to four chords a bar: about two or three (AU-94).",
    unit: "per bar",
    of: (take) => mean(strikesInSix(take).map((ticks) => ticks.length)),
  },
  {
    id: "chords.on-the-strong-beats-in-six",
    seat: "chords",
    idiom: true,
    says: "In six most of the piano's chords are on a strong beat, 1 or 4, or on the eighth before one (AU-94).",
    unit: "share",
    of(take) {
      const ticks = strikesInSix(take).flat();
      // Beats 1 and 4, and the "and"s of 3 and 6.
      const strong = [0, 3 * PPQ, 2.5 * PPQ, 5.5 * PPQ];
      return share(ticks.filter((tick) => strong.includes(tick)).length, ticks.length);
    },
  },
  // How busy a comp is at each level is one way of playing: these three say what a blues
  // piano does, and a strummed part has its own below (`chords.strokes-per-bar`).
  {
    id: "chords.strikes-per-bar-quiet",
    seat: "chords",
    idiom: true,
    says: "When the band is quiet the piano is a pad: about one chord a bar.",
    unit: "per bar",
    of: (take) => strikesPerBar(take, "low"),
  },
  {
    id: "chords.strikes-per-bar-mid",
    seat: "chords",
    idiom: true,
    says: "At the working level the piano chops: two or three strikes a bar, with room between them.",
    unit: "per bar",
    of: (take) => strikesPerBar(take, "mid"),
  },
  {
    id: "chords.strikes-per-bar-loud",
    seat: "chords",
    idiom: true,
    says: "When the band is hot and has the tune to itself the piano is busy: four stabs a bar, or the pump's eight. Under a soloist a style may hold the hand back (chords.strikes-per-bar-under-a-hot-solo).",
    unit: "per bar",
    of: (take) => strikesPerBar(take, "high", true),
  },
  // Stabs and held chords (ST-jazz-27, CH-53): a jazz piano mostly stabs and holds a chord
  // to the end now and then, half the time when the band is quiet. Held is longer than a beat:
  // a stab, a push and a chord laid in where it arrives are all a beat or less.
  {
    id: "chords.held",
    seat: "chords",
    idiom: true,
    says: "From the working level up, some of the chords are held on, most are stabs: the share of strikes that ring longer than a beat.",
    unit: "share",
    of: (take) => heldShare(take, (tier) => tier !== "low"),
  },
  {
    id: "chords.held-quiet",
    seat: "chords",
    idiom: true,
    says: "When the band is quiet the hand holds more of its chords: the share of strikes that ring longer than a beat.",
    unit: "share",
    of: (take) => heldShare(take, (tier) => tier === "low"),
  },
  {
    id: "chords.with-the-drums",
    seat: "chords",
    says: "More of the piano's strikes land with a kick or a backbeat than a hand placed at random would (read it against chords.drums-by-chance).",
    unit: "share",
    of(take) {
      const landings = drumLandings(take);
      const struck = [...read(take).hits.values()].flat();
      return share(struck.filter((hit) => landings.has(hit.tick)).length, struck.length);
    },
  },
  {
    id: "chords.drums-by-chance",
    seat: "chords",
    says: "The share of eighth-note places in the piano's bars that carry a kick or a backbeat: what a hand placed at random would score with the drums.",
    unit: "share",
    of(take, style) {
      const landings = drumLandings(take);
      const { bars } = read(take);
      const grid = (4 * PPQ) / places(style);
      const onGrid = [...landings].filter((tick) => tick % grid === 0).length;
      return share(onGrid, bars.length * places(style));
    },
  },
  {
    id: "chords.with-the-drums-over-chance",
    seat: "chords",
    says: "The piano lands with the kick and the backbeat more often than a hand placed at random on the eighths would: above zero it is locking with the drummer, below it is sitting between his strokes.",
    unit: "share",
    of(take, style) {
      // The two measures above, as one number a target can hold: a floor on the share alone
      // sits under chance and cannot fail (ME-09).
      const landings = drumLandings(take);
      const { bars, hits } = read(take);
      const struck = [...hits.values()].flat();
      if (struck.length === 0 || bars.length === 0) return null;
      const withDrums = struck.filter((hit) => landings.has(hit.tick)).length / struck.length;
      const grid = (4 * PPQ) / places(style);
      const chance =
        [...landings].filter((tick) => tick % grid === 0).length / (bars.length * places(style));
      return { value: withDrums - chance, cases: struck.length };
    },
  },
  {
    id: "chords.off-the-beat",
    seat: "chords",
    says: "A good part of the chords the hand strikes are off the beat, and a good part are on it: syncopated, not floating. A scratch is not a chord.",
    unit: "share",
    of(take) {
      const struck = [...read(take).hits.values()].flat();
      return share(struck.filter((hit) => hit.tick % PPQ !== 0).length, struck.length);
    },
  },
  {
    id: "chords.changes-anticipated",
    seat: "chords",
    says: "The hand leans into some changes and lets others land: the share of changes where the new chord is struck an eighth early and is still sounding when it arrives.",
    unit: "share",
    of(take) {
      const { bars, hits } = read(take);
      const comped = new Set(bars.map((bar) => bar.index));
      const harmony = arrivals(take.plan);
      let changes = 0;
      let early = 0;
      for (const arrival of harmony) {
        const before = harmony[arrival.index - 1];
        // A change the piano plays into: from a chord to a different chord, both in bars it comps.
        if (!arrival.changed || !arrival.chord || !before?.chord) continue;
        if (!comped.has(arrival.bar) || !comped.has(before.bar)) continue;
        changes++;
        const leaning = [...(hits.get(before.bar) ?? []), ...(hits.get(arrival.bar) ?? [])];
        const pushed = leaning.some(
          (hit) =>
            hit.tick >= arrival.tick - EIGHTH &&
            hit.tick < arrival.tick &&
            hit.ends >= arrival.tick - POCKET &&
            // And it is the chord coming: a groove's stab on the last sixteenth stops at
            // the barline too, and is the old chord.
            states(arrival.chord!, hit.pitches),
        );
        if (pushed) early++;
      }
      return share(early, changes);
    },
  },
  {
    id: "chords.bar-same-as-last",
    seat: "chords",
    idiom: true,
    says: "About half the time a bar's rhythm is the bar before it again: the figure is there to be heard, and it does not go round like a loop. Away from a solo.",
    unit: "share",
    of(take) {
      const { bars, rhythm } = read(take);
      let pairs = 0;
      let same = 0;
      for (const bar of bars) {
        const now = rhythm.get(bar.index)!;
        const before = rhythm.get(bar.index - 1);
        const last = take.plan.bars[bar.index - 1];
        if (!before || last?.section.occurrence !== bar.section.occurrence) continue;
        if (hammered(now) || hammered(before)) continue;
        if (bar.solo !== null || last.solo !== null) continue;
        pairs++;
        if (alike(now, before)) same++;
      }
      return share(same, pairs);
    },
  },
  {
    id: "chords.phrase-same-as-last",
    seat: "chords",
    idiom: true,
    says: "Now and then a phrase is the phrase before it again, bar for bar; mostly it is not. Away from a solo.",
    unit: "share",
    of(take) {
      const phrases = spoken(take);
      let pairs = 0;
      let same = 0;
      for (let i = 1; i < phrases.length; i++) {
        const [before, now] = [phrases[i - 1]!, phrases[i]!];
        if (before.bars.length !== now.bars.length) continue;
        pairs++;
        if (samePhrase(before.rhythm, now.rhythm)) same++;
      }
      return share(same, pairs);
    },
  },
  {
    id: "chords.phrase-same-as-last-chorus",
    seat: "chords",
    idiom: true,
    says: "A phrase is seldom the very phrase that was played at this place the last time through at this level: the choruses are not copies. Away from a solo.",
    unit: "share",
    of(take) {
      // The same figure coming back in the same place is the honest count of repetition (ME-22).
      const last = new Map<string, { tier: Tier; rhythm: readonly BarRhythm[] }>();
      let pairs = 0;
      let same = 0;
      for (const phrase of spoken(take)) {
        const first = phrase.bars[0]!;
        const place = `${first.section.identity}/${first.phrase.index}`;
        const tier = tierAt(first);
        const before = last.get(place);
        if (before && before.tier === tier) {
          pairs++;
          if (samePhrase(before.rhythm, phrase.rhythm)) same++;
        }
        last.set(place, { tier, rhythm: phrase.rhythm });
      }
      return share(same, pairs);
    },
  },
  {
    id: "chords.phrases-shaped",
    seat: "chords",
    idiom: true,
    says: "Most phrases have a shape: the bar that opens the phrase comes back in it, and some bar answers or turns. Away from a solo.",
    unit: "share",
    of: (take) => phraseShape(take, (rhythm) => returns(rhythm) && turns(rhythm)),
  },
  {
    id: "chords.phrases-one-bar",
    seat: "chords",
    idiom: true,
    says: "Few phrases are one bar played over and over: that is a loop. Away from a solo.",
    unit: "share",
    of: (take) => phraseShape(take, (rhythm) => !turns(rhythm)),
  },
  {
    id: "chords.phrases-unrelated",
    seat: "chords",
    idiom: true,
    says: "Few phrases never come back to the bar they opened with: that is bars in a row, not a phrase. Away from a solo.",
    unit: "share",
    of: (take) => phraseShape(take, (rhythm) => !returns(rhythm)),
  },

  // ── a strumming hand ──
  // A groove on a guitar: the hand never stops, and the part is which strokes sound the
  // chord and which are scratches (CH-47, CH-52, Q-17). These are one way of playing, and
  // are on the scorecard of a style that sets them targets.
  {
    id: "chords.strokes-per-bar",
    seat: "chords",
    idiom: true,
    says: "From the working level up the strumming hand never stops: eight to sixteen strokes a bar, chords and scratches together.",
    unit: "per bar",
    of: (take) => strokesPerBar(take, (tier) => tier !== "low"),
  },
  {
    id: "chords.strokes-per-bar-quiet",
    seat: "chords",
    idiom: true,
    says: "When the band is quiet the hand plays only the stabs of its line, six or seven a bar: the scratches wait for the band to come up.",
    unit: "per bar",
    of: (take) => strokesPerBar(take, (tier) => tier === "low"),
  },
  {
    id: "chords.strokes-per-bar-hot",
    seat: "chords",
    idiom: true,
    says: "When the band is hot every sixteenth is a stroke: sixteen a bar, less only where a chord played early is left to ring.",
    unit: "per bar",
    of: (take) => strokesPerBar(take, (tier) => tier === "high"),
  },
  {
    id: "chords.scratches",
    seat: "chords",
    idiom: true,
    says: "From the working level up, between a third and four fifths of the strokes are scratches: more chick than chord, but the chord is there.",
    unit: "share",
    of(take) {
      const all = strokesAt(take, (tier) => tier !== "low");
      return share(all.filter((stroke) => stroke.muted).length, all.length);
    },
  },
  {
    id: "chords.scratches-quiet",
    seat: "chords",
    idiom: true,
    says: "When the band is quiet the hand does not scratch.",
    unit: "share",
    of(take) {
      const all = strokesAt(take, (tier) => tier === "low");
      return share(all.filter((stroke) => stroke.muted).length, all.length);
    },
  },
  // ── a hand that picks ──
  // A guitar that fingerpicks when the band is quiet and strums when it is not: the level
  // chooses the right hand, and a section keeps its choice (CH-32, ST-acoustic-17).
  {
    id: "chords.picked-quiet",
    seat: "chords",
    idiom: true,
    says: "When the band is quiet the guitar fingerpicks: the share of its bars in which every stroke is a plucked string.",
    unit: "share",
    of: (take) => pickedBars(take, (tier) => tier === "low"),
  },
  {
    id: "chords.picked-working",
    seat: "chords",
    idiom: true,
    says: "At the working level some sections are picked and more are strummed: the share of the guitar's bars in which every stroke is a plucked string.",
    unit: "share",
    of: (take) => pickedBars(take, (tier) => tier === "mid"),
  },
  {
    id: "chords.picked-hot",
    seat: "chords",
    idiom: true,
    says: "When the band is hot the guitar strums: hardly a bar is picked.",
    unit: "share",
    of: (take) => pickedBars(take, (tier) => tier === "high"),
  },
  {
    id: "chords.upstrokes",
    seat: "chords",
    idiom: true,
    says: "A strummed part breathes down and up: between a third and a half of its strums come up, catching the top of the chord.",
    unit: "share",
    of(take) {
      const strums = strokesAt(take, () => true).filter(
        (stroke) => !stroke.picked && !stroke.muted && stroke.pitches.length > 1,
      );
      return share(strums.filter((stroke) => stroke.up).length, strums.length);
    },
  },
  {
    id: "chords.open-strings",
    seat: "chords",
    idiom: true,
    says: "An open-position guitar rings: a downstroke sounds an open string or two with the fretted ones, on average.",
    unit: "ratio",
    of(take, style) {
      const guitar = style.chords.idiom;
      if (guitar === "keys") return null;
      const open = new Map<string, number>();
      const counts: number[] = [];
      for (const stroke of strokesAt(take, () => true)) {
        if (stroke.picked || stroke.muted || stroke.up || stroke.pitches.length < 2) continue;
        const pitches = [...stroke.pitches].sort((a, b) => a - b);
        const key = pitches.join(" ");
        let count = open.get(key);
        if (count === undefined) {
          const strings = fingering(guitar, pitches);
          count = strings ? fretsOf(strings, pitches).filter((fret) => fret === 0).length : 0;
          open.set(key, count);
        }
        counts.push(count);
      }
      return mean(counts);
    },
  },
  {
    id: "chords.short-stabs",
    seat: "chords",
    idiom: true,
    says: "Nearly every chord is clipped: an eighth or shorter, damped at once. The few that ring are chords played early and held over the barline.",
    unit: "share",
    of(take) {
      const struck = [...read(take).hits.values()].flat();
      return share(struck.filter((hit) => hit.length <= EIGHTH + POCKET).length, struck.length);
    },
  },
  {
    id: "chords.line-kept",
    seat: "chords",
    idiom: true,
    says: "A section's line is the line it had the last time: each bar has the same stabs and the same scratches as that bar of the section did the time before at that level (around a change of chord the harmony decides, and that is left out).",
    unit: "share",
    of(take) {
      const { bars, strokes, rhythm } = read(take);
      const last = new Map<string, Line>();
      let pairs = 0;
      let same = 0;
      for (const bar of bars) {
        const place = `${bar.section.identity}/${bar.barInSection}/${tierAt(bar)}`;
        const now = { strokes: strokes.get(bar.index)!, bar, rhythm: rhythm.get(bar.index)! };
        const before = last.get(place);
        if (before) {
          pairs++;
          if (sameLine(before, now)) same++;
        }
        last.set(place, now);
      }
      return share(same, pairs);
    },
  },
  {
    id: "chords.bars-on-the-line",
    seat: "chords",
    idiom: true,
    says: "Most bars are the section's line exactly, and not all of them: about one bar in four turns its end at the close of a phrase.",
    unit: "share",
    of(take) {
      const { bars, strokes, rhythm } = read(take);
      const groups = new Map<string, Line[]>();
      for (const bar of bars) {
        const group = `${bar.section.identity}/${tierAt(bar)}`;
        const line = { strokes: strokes.get(bar.index)!, bar, rhythm: rhythm.get(bar.index)! };
        groups.set(group, [...(groups.get(group) ?? []), line]);
      }
      let cases = 0;
      let on = 0;
      for (const lines of groups.values()) {
        if (lines.length < 4) continue;
        // The section's usual bar: the one most of its bars are, counted among the bars
        // the harmony leaves alone where there are any.
        const settled = lines.filter((line) => !line.rhythm.arrives && !line.rhythm.leaves);
        const pool = settled.length > 0 ? settled : lines;
        const count = (line: Line) => pool.filter((other) => sameLine(line, other)).length;
        const usual = pool.reduce((best, line) => (count(line) > count(best) ? line : best));
        cases += lines.length;
        on += lines.filter((line) => sameLine(usual, line)).length;
      }
      return share(on, cases);
    },
  },
  // An offbeat comp: the skank chops 2 and 4, is loudest there, and leaves 1 and 3 alone
  // (ST-reggae-20). One way of playing, on the scorecard of a style that sets it targets.
  {
    id: "chords.on-one-and-three",
    seat: "chords",
    idiom: true,
    says: "Nothing is played on 1 or 3: those beats are the bass's and the drop's, and the hand is off them.",
    unit: "share",
    of(take) {
      const { bars, strokes } = read(take);
      const all = bars.flatMap((bar) =>
        strokes.get(bar.index)!.map((stroke) => stroke.tick - bar.start),
      );
      return share(all.filter((at) => at === 0 || at === 2 * PPQ).length, all.length);
    },
  },
  {
    id: "chords.chop-loudest",
    seat: "chords",
    idiom: true,
    says: "The chop on 2 and 4 is the loudest stroke in the hand: in a bar with other strokes, every one of them is softer than both chops.",
    unit: "share",
    of(take) {
      const loudest = chopsAgainstTheRest(take, () => true).filter(
        ({ chops, rest }) => Math.min(...chops) > Math.max(...rest),
      );
      return share(loudest.length, chopsAgainstTheRest(take, () => true).length);
    },
  },
  {
    id: "chords.chop-over-the-rest",
    seat: "chords",
    idiom: true,
    says: "When the band is hot the chop on 2 and 4 stands over the hand's other strokes by a clear margin, not a shout: its level over theirs, on average.",
    unit: "ratio",
    of(take) {
      const bars = chopsAgainstTheRest(take, (tier) => tier === "high");
      const average = (levels: readonly number[]) =>
        levels.reduce((sum, level) => sum + level, 0) / levels.length;
      return mean(bars.map(({ chops, rest }) => average(chops) / average(rest)));
    },
  },
];

/**
 * The bars at the levels asked for that chop on both 2 and 4 and have other
 * strokes besides: the chops' levels and the rest's.
 */
function chopsAgainstTheRest(
  take: Take,
  at: (tier: Tier) => boolean,
): { chops: number[]; rest: number[] }[] {
  const { bars, strokes } = read(take);
  const result: { chops: number[]; rest: number[] }[] = [];
  for (const bar of bars) {
    if (!at(tierAt(bar))) continue;
    const own = strokes.get(bar.index)!;
    const isChop = (stroke: Hit) =>
      stroke.tick - bar.start === PPQ || stroke.tick - bar.start === 3 * PPQ;
    const chops = own.filter(isChop).map((stroke) => stroke.level);
    const rest = own.filter((stroke) => !isChop(stroke)).map((stroke) => stroke.level);
    if (chops.length === 2 && rest.length > 0) result.push({ chops, rest });
  }
  return result;
}

/** A bar of a strummed line: its strokes, and what the harmony does at its barlines. */
interface Line {
  readonly bar: PlanBar;
  readonly strokes: readonly Hit[];
  readonly rhythm: BarRhythm;
}

/**
 * Whether two bars are the same line: the same strokes in the same places,
 * chord for chord and scratch for scratch. As with `alike`, the first eighth
 * after a change at the barline and the last beat before one are left out,
 * where the harmony decides what the hand does.
 */
function sameLine(a: Line, b: Line): boolean {
  const from = a.rhythm.arrives || b.rhythm.arrives ? EIGHTH : 0;
  const to = a.rhythm.leaves || b.rhythm.leaves ? 3 * PPQ : 4 * PPQ;
  const body = (line: Line) =>
    line.strokes
      .map((stroke) => ({ at: stroke.tick - line.bar.start, muted: stroke.muted }))
      .filter((stroke) => stroke.at >= from && stroke.at < to)
      .map((stroke) => `${stroke.at}${stroke.muted ? "~" : "x"}`)
      .join(" ");
  return body(a) === body(b);
}

/** Of the bars at the levels asked for that the hand plays in, the share where it only plucks. */
function pickedBars(take: Take, at: (tier: Tier) => boolean): Measurement | null {
  const { bars, strokes } = read(take);
  const played = bars
    .filter((bar) => at(tierAt(bar)))
    .map((bar) => strokes.get(bar.index)!)
    .filter((own) => own.length > 0);
  return share(played.filter((own) => own.every((stroke) => stroke.picked)).length, played.length);
}

/** Every stroke of the hand in the bars at the levels asked for. */
function strokesAt(take: Take, at: (tier: Tier) => boolean): Hit[] {
  const { bars, strokes } = read(take);
  return bars.filter((bar) => at(tierAt(bar))).flatMap((bar) => strokes.get(bar.index)!);
}

function strokesPerBar(take: Take, at: (tier: Tier) => boolean): Measurement | null {
  const { bars, strokes } = read(take);
  return mean(bars.filter((bar) => at(tierAt(bar))).map((bar) => strokes.get(bar.index)!.length));
}

/** The share of chords struck at the levels asked for that ring longer than a beat. */
function heldShare(take: Take, at: (tier: Tier) => boolean): Measurement | null {
  const { bars, hits } = read(take);
  const struck = bars.filter((bar) => at(tierAt(bar))).flatMap((bar) => hits.get(bar.index)!);
  return share(struck.filter((hit) => hit.length > PPQ + POCKET).length, struck.length);
}
