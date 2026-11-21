// What a soloist would say about a solo, read from the notes played. The
// old band measured notes, bars and changes, and the complaints lived where
// nothing was measured: whether a phrase follows from the one before, whether
// a chorus goes anywhere (ME-29). So these are taken at the phrase, the
// breath and the chorus as well as at the note.
//
// A phrase here is the notes of one slot of the form (a pickup counted with
// the phrase it leads into); a breath is a silence of a beat or more.

import { PPQ } from "../../chart/types.ts";
import { score } from "../../critic/choose.ts";
import { STEP } from "../../perform/grid.ts";
import type { Arrival } from "../../perform/harmony.ts";
import { contextOf } from "../../perform/harmony.ts";
import { onPulse } from "../../perform/meter.ts";
import type { NoteEvent } from "../../perform/notes.ts";
import type { Burst, Heard, SoloCandidate, Sounding } from "../../players/solo/critique.ts";
import {
  bassStruck,
  body,
  burstsIn,
  closest,
  displacedFrom,
  likeness,
  lineBars,
  phrasesOf,
  pickupsOf,
  rhythmsAgain,
  SOLO_FEATURES,
} from "../../players/solo/critique.ts";
import type { World } from "../../players/solo/slots.ts";
import { worldOf } from "../../players/solo/slots.ts";
import type { StylePack } from "../../style/types.ts";
import type { Take } from "../../take.ts";
import { chordTones } from "../../theory/chord.ts";
import { mod12, pitchClass } from "../../theory/pitch.ts";
import { chordScale } from "../../theory/scale.ts";
import { mean, notesOf, share } from "../read.ts";
import type { Measure, Measurement } from "../types.ts";

/** Slack, in ticks, for "still sounding": the pocket moves a note's end a little. */
const POCKET = 10;

interface Reading {
  readonly world: World;
  /** The soloist's notes as they were played, with how each one's pitch moves. */
  readonly events: readonly NoteEvent[];
  readonly notes: readonly Sounding[];
  /** Every phrase slot with its notes, in order. */
  readonly phrases: readonly Heard[];
  /** The phrases of each solo. */
  readonly solos: readonly (readonly Heard[])[];
  /** Each phrase as the critic's candidate, and its cost under the style's weights. */
  readonly costs: readonly number[];
}

const readings = new WeakMap<Take, Reading | null>();

function read(take: Take, style: StylePack): Reading | null {
  if (readings.has(take)) return readings.get(take) ?? null;
  const events = notesOf(take, "solo");
  let reading: Reading | null = null;
  if (events.length > 0) {
    const bass = bassStruck(notesOf(take, "bass"));
    const world = worldOf(take.plan, style, bass, events[0]!.voice);
    let at = 0;
    const bars = take.plan.bars;
    const notes = [...events]
      .sort((a, b) => a.tick - b.tick)
      .map((event): Sounding => {
        while (bars[at + 1] && bars[at + 1]!.start <= event.tick) at++;
        return {
          bar: bars[at]!,
          tick: event.tick,
          ends: event.tick + event.duration,
          pitch: event.pitch,
        };
      });
    const phrases = phrasesOf(world, notes);
    const solos: Heard[][] = [];
    for (const phrase of phrases) {
      solos[phrase.slot.solo] = [...(solos[phrase.slot.solo] ?? []), phrase];
    }
    const candidates = phrases.map((phrase): SoloCandidate => {
      const before = solos[phrase.slot.solo]!;
      return { ...phrase, kind: "", earlier: before.slice(0, before.indexOf(phrase)), world };
    });
    // Costed when a measure asks: most readers of a take want its notes, not its costs.
    let costs: number[] | undefined;
    reading = {
      world,
      events,
      notes,
      phrases,
      solos: solos.filter(Boolean),
      get costs() {
        costs ??= score(candidates, SOLO_FEATURES, style.critic.weights.solo ?? {}).map(
          (scored) => scored.cost,
        );
        return costs;
      },
    };
  }
  readings.set(take, reading);
  return reading;
}

const isTone = (arrival: Arrival | undefined, pitch: number): boolean => {
  const chord = arrival?.chord;
  if (!chord) return false;
  const root = pitchClass(chord.root);
  return chordTones(chord.quality).some((tone) => mod12(root + tone.interval) === mod12(pitch));
};

/** The chord a note answers to: the one it is struck over, or the one it leans into. */
function chordFor(world: World, note: Sounding): Arrival | undefined {
  const here = world.arrivalAt(note.tick);
  const next = here && world.harmony[here.index + 1];
  const leans = next?.changed && next.tick - note.tick <= PPQ / 2 && note.ends > next.tick + POCKET;
  return leans ? next : here;
}

/** Each note with the note after it, where no breath comes between: the moves of a line. */
function moves(reading: Reading): (readonly [Sounding, Sounding])[] {
  const pairs: (readonly [Sounding, Sounding])[] = [];
  reading.notes.forEach((note, i) => {
    const next = reading.notes[i + 1];
    if (next && next.tick - note.ends < PPQ - POCKET) pairs.push([note, next]);
  });
  return pairs;
}

/** The silences of a beat or more between one note and the next inside a solo, in ticks. */
function breaths(reading: Reading): number[] {
  const lengths: number[] = [];
  for (const solo of reading.solos) {
    const notes = solo.flatMap((phrase) => phrase.notes);
    notes.forEach((note, i) => {
      const next = notes[i + 1];
      if (next && next.tick - note.ends >= PPQ - POCKET) lengths.push(next.tick - note.ends);
    });
  }
  return lengths;
}

/** The solos that ran their whole length, as choruses of notes: for anything about the arc. */
function wholeSolos(reading: Reading): Sounding[][][] {
  const result: Sounding[][][] = [];
  for (const solo of reading.solos) {
    const of = solo[0]!.slot.of;
    const choruses: Sounding[][] = Array.from({ length: of }, () => []);
    const seen = new Set<number>();
    for (const phrase of solo) {
      seen.add(phrase.slot.chorus);
      choruses[phrase.slot.chorus]?.push(...phrase.notes);
    }
    if (seen.size === of) result.push(choruses);
  }
  return result;
}

/** Each phrase of a solo after its first, and the earlier idea it says again a pulse away, if it does. */
export interface DisplacedPhrase {
  readonly phrase: Heard;
  readonly of: Heard | null;
  readonly by: 1 | -1 | null;
  /** The earlier phrase's notes said again, and each as it is said now (`displacedFrom`). */
  readonly source: readonly Sounding[];
  readonly notes: readonly Sounding[];
  /** The line goes the same way too (`Displacement.line`); otherwise the rhythm alone is moved. */
  readonly line: boolean;
  /**
   * The rhythm of some earlier phrase not itself heard as a moved idea is played here a
   * pulse late, whatever its line and whatever else it is like: an answer carrying a moved
   * idea's rhythm on.
   */
  readonly carriesLate: boolean;
}
const displaced = new WeakMap<Reading, DisplacedPhrase[]>();
function displacements(reading: Reading): DisplacedPhrase[] {
  const known = displaced.get(reading);
  if (known) return known;
  const found = reading.solos.flatMap((solo) => {
    const all = solo.flatMap((phrase) => phrase.notes).sort((a, b) => a.tick - b.tick);
    // The phrases already heard as an idea moved: a phrase said where the idea was stated
    // is a pulse from them, and carries nothing on.
    const moved = new Set<Heard>();
    return solo.flatMap((phrase, i): DisplacedPhrase[] => {
      if (i === 0 || body(phrase).length < 3) return [];
      const heard = displacedFrom(phrase, solo.slice(0, i), all);
      if (heard?.line) moved.add(phrase);
      const stated = solo.slice(0, i).filter((other) => !moved.has(other));
      const carriesLate = rhythmsAgain(phrase, stated, all).some((one) => one.by === 1);
      return [
        {
          phrase,
          of: heard?.of ?? null,
          by: heard?.by ?? null,
          source: heard?.source ?? [],
          notes: heard?.notes ?? [],
          line: heard?.line ?? false,
          carriesLate,
        },
      ];
    });
  });
  displaced.set(reading, found);
  return found;
}

/**
 * The phrases of a take's solos that say an earlier one again a beat early or
 * late, read from the notes (`displacedFrom`): what the `solo.displaced`
 * measure counts (`line`), and those that play only its rhythm moved, for a
 * property or a page that wants to find them.
 */
export function displacedPhrases(take: Take, style: StylePack): DisplacedPhrase[] {
  const reading = read(take, style);
  return reading ? displacements(reading).filter((one) => one.by !== null || one.carriesLate) : [];
}

/** A run in double time in a phrase of a solo, and the phrase of the solo before it. */
export interface BurstPhrase {
  readonly phrase: Heard;
  readonly previous: Heard | null;
  readonly burst: Burst;
  /** Every phrase of its solo, in order. */
  readonly solo: readonly Heard[];
}
const bursting = new WeakMap<Reading, BurstPhrase[]>();
function bursts(reading: Reading): BurstPhrase[] {
  const known = bursting.get(reading);
  if (known) return known;
  const found = reading.solos.flatMap((solo) =>
    solo.flatMap((phrase, i) =>
      burstsIn(reading.world, phrase.notes).map((burst) => ({
        phrase,
        previous: solo[i - 1] ?? null,
        burst,
        solo,
      })),
    ),
  );
  bursting.set(reading, found);
  return found;
}

/**
 * The runs in double time in a take's solos, read from the notes (`burstsIn`), each with
 * its phrase and the phrase before it: what `solo.bursts` counts, for a property or a page
 * that wants to find them.
 */
export function burstPhrases(take: Take, style: StylePack): BurstPhrase[] {
  const reading = read(take, style);
  return reading ? bursts(reading) : [];
}

const seconds = (reading: Reading, ticks: number) => ticks / reading.world.ticksPerSecond;
const chorusSeconds = (reading: Reading, solo: readonly Heard[], chorus: number) =>
  seconds(
    reading,
    solo
      .filter((phrase) => phrase.slot.chorus === chorus)
      .flatMap((phrase) => phrase.slot.bars)
      .reduce((sum, bar) => sum + bar.ticks, 0),
  );

/** Notes a second in one chorus of each whole solo of three choruses. */
function pace(reading: Reading, which: "first" | "last"): number[] {
  return reading.solos.flatMap((solo) => {
    const of = solo[0]!.slot.of;
    const chorus = which === "first" ? 0 : of - 1;
    const notes = solo.filter((phrase) => phrase.slot.chorus === chorus);
    const whole = new Set(solo.map((phrase) => phrase.slot.chorus)).size === of;
    if (of < 2 || !whole || notes.length === 0) return [];
    const count = notes.reduce((sum, phrase) => sum + phrase.notes.length, 0);
    return [count / chorusSeconds(reading, solo, chorus)];
  });
}

/** How many of the solo's notes are of a kind, for each bar the soloist has. */
function perSoloBar(reading: Reading, counts: (note: NoteEvent) => boolean): Measurement | null {
  const bars = reading.phrases.reduce((sum, phrase) => sum + phrase.slot.bars.length, 0);
  return bars === 0 ? null : { value: reading.events.filter(counts).length / bars, cases: bars };
}

const measure = (
  id: string,
  unit: Measure["unit"],
  says: string,
  of: (reading: Reading) => Measurement | null,
): Measure => ({
  id: `solo.${id}`,
  seat: "solo",
  says,
  unit,
  of: (take, style) => {
    const reading = read(take, style);
    return reading ? of(reading) : null;
  },
});

/** A measure of one way of playing: on the scorecard only of a style that sets it a target. */
const idiom = (...args: Parameters<typeof measure>): Measure => ({
  ...measure(...args),
  idiom: true,
});

/** A cost: less is better, and the scorecard names the takes with the most of it. */
const cost = (...args: Parameters<typeof measure>): Measure => ({
  ...measure(...args),
  lowerIsBetter: true,
});

export const soloMeasures: readonly Measure[] = [
  measure(
    "changes-on-chord-tones",
    "share",
    "A note struck on a chord change, or held across one, is a tone of the new chord. Always.",
    (reading) => {
      const { world, notes } = reading;
      let cases = 0;
      let good = 0;
      for (const note of notes) {
        const here = world.arrivalAt(note.tick);
        const struck = here?.tick === note.tick && here.changed && here.chord !== null;
        const next = here && world.harmony[here.index + 1];
        const across = next?.changed && next.chord !== null && note.ends > next.tick + POCKET;
        if (!struck && !across) continue;
        cases++;
        if ((!struck || isTone(here, note.pitch)) && (!across || isTone(next, note.pitch))) good++;
      }
      return share(good, cases);
    },
  ),
  measure(
    "thirds-and-sevenths-on-changes",
    "share",
    "The share of changes landed on the new chord's 3rd or 7th, the notes that say the chord moved: most of them where the line spells the changes, around half in a blues.",
    (reading) => {
      const landings = reading.notes.filter((note) => {
        const here = reading.world.arrivalAt(note.tick);
        return here?.tick === note.tick && here.changed && here.chord !== null;
      });
      const guide = landings.filter((note) => {
        const chord = reading.world.arrivalAt(note.tick)!.chord!;
        const root = pitchClass(chord.root);
        return chordTones(chord.quality).some(
          (tone) =>
            ["third", "seventh", "sixth", "sus"].includes(tone.role) &&
            mod12(root + tone.interval) === mod12(note.pitch),
        );
      });
      return share(guide.length, landings.length);
    },
  ),
  measure(
    "beats-on-chord-tones",
    "share",
    "Most notes on a beat are chord tones (a note picked blind from this pool would be one about half the time).",
    (reading) => {
      const on = reading.notes.filter((note) =>
        onPulse(note.bar.meter, note.tick - note.bar.start),
      );
      const tones = on.filter((note) => isTone(reading.world.arrivalAt(note.tick), note.pitch));
      return share(tones.length, on.length);
    },
  ),
  measure(
    "phrase-ends-on-chord-tones",
    "share",
    "The last note before a breath is a tone of its chord: a phrase lands somewhere.",
    (reading) => {
      const ends = reading.notes.filter((note, i) => {
        const next = reading.notes[i + 1];
        return !next || next.tick - note.ends >= PPQ - POCKET;
      });
      const tones = ends.filter((note) => isTone(chordFor(reading.world, note), note.pitch));
      return share(tones.length, ends.length);
    },
  ),
  measure(
    "phrases-related",
    "share",
    "Most phrases are made of something already played in the solo: the same rhythm with the line going the same way, or most of it.",
    (reading) => {
      const scores = reading.solos.flatMap((solo) =>
        solo.flatMap((phrase, i) =>
          i === 0 || phrase.notes.length === 0 ? [] : [closest(phrase, solo.slice(0, i))!],
        ),
      );
      const { related } = reading.world.solo.likeness;
      return share(scores.filter((value) => value >= related).length, scores.length);
    },
  ),
  measure(
    "phrase-likeness",
    "ratio",
    "How alike a phrase is to the earlier phrase most like it, from 0 (nothing shared) to 1 (the same phrase): around the middle is an idea coming back changed.",
    (reading) =>
      mean(
        reading.solos.flatMap((solo) =>
          solo.flatMap((phrase, i) =>
            i === 0 || phrase.notes.length === 0 ? [] : [closest(phrase, solo.slice(0, i))!],
          ),
        ),
      ),
  ),
  measure(
    "phrase-same-as-last",
    "share",
    "Sometimes a phrase is the phrase before it again, note for note in rhythm and shape; mostly it has changed.",
    (reading) => {
      const scores = reading.solos.flatMap((solo) =>
        solo.flatMap((phrase, i) =>
          i === 0 || phrase.notes.length === 0 ? [] : [likeness(phrase, solo[i - 1]!)],
        ),
      );
      const { same } = reading.world.solo.likeness;
      return share(scores.filter((value) => value >= same).length, scores.length);
    },
  ),
  measure(
    "displaced",
    "share",
    "Sometimes an idea comes back a beat early or a beat late, the same rhythm and contour falling across the bar differently: the share of phrases (of three notes or more, after a solo's first) that say an earlier phrase of the solo again moved by one of the bar's pulses.",
    (reading) => {
      const phrases = displacements(reading);
      return share(phrases.filter((one) => one.line).length, phrases.length);
    },
  ),
  measure(
    "bursts",
    "share",
    "Late in a solo, now and then, the line runs in double time for half a bar to two bars and lands: the share of a solo's phrases (with any note) that have a run in double time.",
    (reading) => {
      const phrases = reading.phrases.filter((phrase) => phrase.notes.length > 0);
      const burst = new Set(bursts(reading).map((one) => one.phrase));
      return share(burst.size, phrases.length);
    },
  ),
  measure(
    "displaced-early",
    "share",
    "Of the ideas said again a beat away (solo.displaced), the share said a beat early: an idea that opens on the one cannot go early without crossing the barline, which is a pickup's ground, so most go late.",
    (reading) => {
      const moved = displacements(reading).filter((one) => one.line);
      return share(moved.filter((one) => one.by === -1).length, moved.length);
    },
  ),
  measure(
    "bars-that-rhyme",
    "share",
    "Inside a phrase the rhythm of a bar comes back: of the bars that carry a line, the share whose rhythm another bar of the phrase also plays (Q-43).",
    (reading) => {
      let bars = 0;
      let rhyming = 0;
      for (const phrase of reading.phrases) {
        const lines = lineBars(phrase);
        if (lines.length < 2) continue;
        bars += lines.length;
        rhyming += lines.filter((bar, i) =>
          lines.some((other, j) => j !== i && other === bar),
        ).length;
      }
      return share(rhyming, bars);
    },
  ),
  measure(
    "empty-bars",
    "share",
    "Some of a solo is air: bars with no note struck in them (a pickup, or a note in the last beat, is the next bar's).",
    (reading) => {
      const bars = reading.phrases.flatMap((phrase) => phrase.slot.bars);
      const leads = pickupsOf(reading.world, reading.notes);
      const struck = new Set(
        reading.notes
          .filter((note) => note.tick - note.bar.start < note.bar.ticks - PPQ && !leads.has(note))
          .map((note) => note.bar.index),
      );
      // A note tied over the barline is playing in the bar it is held into.
      for (const note of reading.notes) {
        if (note.ends > note.bar.start + note.bar.ticks + PPQ / 4) struck.add(note.bar.index + 1);
      }
      return share(bars.filter((bar) => !struck.has(bar.index)).length, bars.length);
    },
  ),
  measure(
    "long-breaths",
    "share",
    "Few breaths are two bars or longer: that is dropping out, not phrasing.",
    (reading) => {
      const all = breaths(reading);
      const bar = reading.phrases[0]?.slot.bars[0]?.ticks ?? PPQ * 4;
      return share(all.filter((ticks) => ticks >= 2 * bar - POCKET).length, all.length);
    },
  ),
  measure(
    "breath",
    "seconds",
    "The usual breath, in seconds: long enough to be one at a fast tempo, short enough not to be a hole at a slow one.",
    (reading) => {
      const all = breaths(reading).sort((a, b) => a - b);
      const middle = all[Math.floor(all.length / 2)];
      return middle === undefined ? null : { value: seconds(reading, middle), cases: all.length };
    },
  ),
  measure(
    "phrases-breathe",
    "share",
    "A phrase is followed by air before the next one starts, a pickup into it included: the style's breath, in seconds, less a tenth for the player's own timing. Two phrases run together are one long phrase.",
    (reading) => {
      const owed = reading.world.solo.space.breath * 0.9 * reading.world.ticksPerSecond;
      let joins = 0;
      let aired = 0;
      for (const solo of reading.solos) {
        const played = solo.filter((phrase) => phrase.notes.length > 0);
        played.forEach((phrase, i) => {
          const next = played[i + 1];
          if (!next) return;
          joins++;
          const ends = Math.max(...phrase.notes.map((note) => note.ends));
          if (next.notes[0]!.tick - ends >= owed) aired++;
        });
      }
      return share(aired, joins);
    },
  ),
  measure(
    "longest-silence",
    "seconds",
    "The longest the soloist goes without a note inside a solo, in seconds.",
    (reading) => {
      const all = breaths(reading);
      return all.length === 0
        ? null
        : { value: seconds(reading, Math.max(...all)), cases: all.length };
    },
  ),
  measure(
    "notes-per-second-first",
    "per second",
    "The first chorus of a solo is sparse: a note or two a second.",
    (reading) => mean(pace(reading, "first")),
  ),
  measure(
    "notes-per-second-last",
    "per second",
    "The last chorus is where the playing is.",
    (reading) => mean(pace(reading, "last")),
  ),
  measure(
    "builds",
    "ratio",
    "The last chorus of a solo has one and a half to four times the notes of the first (SO-02).",
    (reading) => {
      const [first, last] = [pace(reading, "first"), pace(reading, "last")];
      return mean(first.flatMap((value, i) => (last[i] === undefined ? [] : [last[i]! / value])));
    },
  ),
  measure(
    "rises",
    "semitones",
    "The last chorus of a solo sits higher than the first: the middle of its notes is some semitones up.",
    (reading) =>
      mean(
        wholeSolos(reading)
          .filter((choruses) => choruses.length >= 2 && choruses[0]!.length > 0)
          .map((choruses) => {
            const middle = (notes: readonly Sounding[]) =>
              notes.reduce((sum, note) => sum + note.pitch, 0) / Math.max(1, notes.length);
            return middle(choruses.at(-1)!) - middle(choruses[0]!);
          }),
      ),
  ),
  measure(
    "top-in-last-chorus",
    "share",
    "The highest note of a solo is in its last chorus.",
    (reading) => {
      const solos = wholeSolos(reading).filter((choruses) => choruses.length >= 2);
      const high = (notes: readonly Sounding[]) => Math.max(0, ...notes.map((note) => note.pitch));
      const late = solos.filter(
        (choruses) => high(choruses.at(-1)!) > Math.max(...choruses.slice(0, -1).map(high)),
      );
      return share(late.length, solos.length);
    },
  ),
  measure(
    "top-falls",
    "ratio",
    "Where the highest note of a solo falls, from 0 at its first note to 1 at its last: near the end, not at it.",
    (reading) =>
      mean(
        wholeSolos(reading).flatMap((choruses) => {
          const notes = choruses.flat();
          if (notes.length < 2) return [];
          const top = notes.reduce((high, note) => (note.pitch > high.pitch ? note : high));
          const [first, last] = [notes[0]!, notes.at(-1)!];
          return [(top.tick - first.tick) / Math.max(1, last.tick - first.tick)];
        }),
      ),
  ),
  measure(
    "high-points-deserved",
    "share",
    "A phrase's highest note is one a listener can hear as its high point: on a beat, or held (Q-45).",
    (reading) => {
      const phrases = reading.phrases.filter((phrase) => body(phrase).length >= 3);
      const deserved = phrases.filter((phrase) => {
        const notes = body(phrase);
        const top = notes.reduce((high, note) => (note.pitch > high.pitch ? note : high));
        return (
          onPulse(top.bar.meter, top.tick - top.bar.start) || top.ends - top.tick >= PPQ * 0.75
        );
      });
      return share(deserved.length, phrases.length);
    },
  ),
  measure(
    "range",
    "semitones",
    "A chorus covers an octave or so: more than a box, less than the whole instrument.",
    (reading) =>
      mean(
        wholeSolos(reading).flatMap((choruses) =>
          choruses
            .filter((notes) => notes.length > 1)
            .map((notes) => {
              const pitches = notes.map((note) => note.pitch);
              return Math.max(...pitches) - Math.min(...pitches);
            }),
        ),
      ),
  ),
  measure(
    "steps",
    "share",
    "Most moves inside a line are a step of the scale the style plays: a minor third or less in a blues scale, a whole step or less where the line runs the chord's own.",
    (reading) => {
      const all = moves(reading);
      const { step } = reading.world.solo.line;
      return share(all.filter(([a, b]) => Math.abs(b.pitch - a.pitch) <= step).length, all.length);
    },
  ),
  measure("wide-leaps", "share", "Leaps wider than a fifth are rare inside a line.", (reading) => {
    const all = moves(reading);
    return share(all.filter(([a, b]) => Math.abs(b.pitch - a.pitch) > 7).length, all.length);
  }),
  measure(
    "leaps-resolved",
    "share",
    "A wide leap is followed by a step or a third back the other way.",
    (reading) => {
      const { notes } = reading;
      let leaps = 0;
      let resolved = 0;
      notes.forEach((note, i) => {
        const [next, after] = [notes[i + 1], notes[i + 2]];
        if (!next || next.tick - note.ends >= PPQ - POCKET) return;
        const leap = next.pitch - note.pitch;
        if (Math.abs(leap) <= 7) return;
        leaps++;
        const back = after && after.tick - next.ends < PPQ - POCKET ? after.pitch - next.pitch : 0;
        if (back !== 0 && Math.sign(back) !== Math.sign(leap) && Math.abs(back) <= 4) resolved++;
      });
      return share(resolved, leaps);
    },
  ),
  measure(
    "trills",
    "share",
    "Almost no run of four notes rocks between two pitches (a-b-a-b).",
    (reading) => {
      const pitches = reading.notes.map((note) => note.pitch);
      let runs = 0;
      let trills = 0;
      for (let i = 3; i < pitches.length; i++) {
        runs++;
        const [a, b, c, d] = [pitches[i - 3]!, pitches[i - 2]!, pitches[i - 1]!, pitches[i]!];
        if (a === c && b === d && a !== b) trills++;
      }
      return share(trills, runs);
    },
  ),
  measure(
    "repeated-notes",
    "share",
    "The share of a line's moves that strike the same note again: few where the style is a line, some where it stabs a figure on one note.",
    (reading) => {
      const all = moves(reading);
      return share(all.filter(([a, b]) => a.pitch === b.pitch).length, all.length);
    },
  ),
  idiom(
    "roots-and-fifths-on-changes",
    "share",
    "The share of changes landed on the new chord's root or 5th: most of them where the soloist is a horn section riffing, few where the line spells the changes.",
    (reading) => {
      const landings = reading.notes.filter((note) => {
        const here = reading.world.arrivalAt(note.tick);
        return here?.tick === note.tick && here.changed && here.chord !== null;
      });
      const plain = landings.filter((note) => {
        const chord = reading.world.arrivalAt(note.tick)!.chord!;
        const root = pitchClass(chord.root);
        return chordTones(chord.quality).some(
          (tone) =>
            (tone.role === "root" || tone.role === "fifth") &&
            mod12(root + tone.interval) === mod12(note.pitch),
        );
      });
      return share(plain.length, landings.length);
    },
  ),
  idiom(
    "chromatic-approaches",
    "share",
    "The share of changes landed on from a half step away, by a note the new chord's scale does not have: the bebop approach, measured where it happens (Q-29).",
    (reading) => {
      const { world, notes } = reading;
      let landings = 0;
      let chromatic = 0;
      notes.forEach((note, i) => {
        const here = world.arrivalAt(note.tick);
        const before = notes[i - 1];
        if (here?.tick !== note.tick || !here.changed || !here.chord) return;
        if (!before || note.tick - before.ends >= PPQ - POCKET) return;
        landings++;
        if (Math.abs(note.pitch - before.pitch) !== 1) return;
        const root = pitchClass(here.chord.root);
        const scale = chordScale(here.chord, contextOf(world.harmony, here));
        const inScale = scale.intervals.some(
          (interval) => mod12(root + interval) === mod12(before.pitch),
        );
        if (!inScale) chromatic++;
      });
      return share(chromatic, landings);
    },
  ),
  idiom(
    "short-notes",
    "share",
    "The share of notes that are an eighth or shorter as heard: most of a bebop line, nearly all of a funk riff (Q-34).",
    (reading) =>
      share(
        reading.notes.filter((note) => note.ends - note.tick < PPQ * 0.75).length,
        reading.notes.length,
      ),
  ),
  idiom(
    "silent-sixteenths",
    "share",
    "Inside the bars the soloist plays in, the share of sixteenths with nothing sounding: the holes in a riff (Q-33).",
    (reading) => {
      const sounding = new Set<number>();
      const played = new Map<number, Sounding["bar"]>();
      for (const note of reading.notes) {
        played.set(note.bar.index, note.bar);
        const steps = Math.max(1, Math.round((note.ends - note.tick) / STEP));
        for (let k = 0; k < steps; k++) sounding.add(Math.round(note.tick / STEP) + k);
      }
      let all = 0;
      let silent = 0;
      for (const bar of played.values()) {
        for (let tick = bar.start; tick < bar.start + bar.ticks; tick += STEP) {
          all++;
          if (!sounding.has(Math.round(tick / STEP))) silent++;
        }
      }
      return share(silent, all);
    },
  ),
  idiom(
    "barlines-tied",
    "share",
    "Of the barlines a run crosses (a note on the last eighth of the bar, running straight on), the share where that note is held over the barline and the downbeat is not struck: a line that does not treat the barline as a wall (SO-38).",
    (reading) => {
      let crossed = 0;
      let tied = 0;
      reading.notes.forEach((note, i) => {
        const end = note.bar.start + note.bar.ticks;
        if (note.tick !== end - PPQ / 2) return;
        const next = reading.notes[i + 1];
        const over = note.ends > end + PPQ / 4;
        if (!over && next?.tick !== end) return;
        crossed++;
        if (over) tied++;
      });
      return share(tied, crossed);
    },
  ),
  idiom(
    "bends",
    "per bar",
    "How often a string is pushed up into a note, in bent notes for each bar of the solo: a few to a chorus, more where the solo peaks, and never so many that they stop meaning anything (KF-B-10, EAR-02).",
    // A bend's glide is two points, from under the note to it; a slide's stands on each fret
    // and jumps to the next, and is not a bend.
    (reading) => perSoloBar(reading, (note) => note.move?.glide?.length === 2),
  ),
  idiom(
    "shakes",
    "per bar",
    "How often a held note is shaken, in notes with vibrato for each bar of the solo: the long notes, not the line (SO-52).",
    (reading) => perSoloBar(reading, (note) => note.move?.vibrato !== undefined),
  ),
  measure(
    "entered-early",
    "share",
    "Some phrases are led into from the bar before, and some start on the one: neither every time. The solo's first phrase is counted too, since it may be led into from the band's bar.",
    (reading) => {
      const phrases = reading.phrases.filter((phrase) => phrase.notes.length > 0);
      const early = phrases.filter((phrase) => phrase.notes[0]!.tick < phrase.slot.bars[0]!.start);
      return share(early.length, phrases.length);
    },
  ),
  cost(
    "cost",
    "cost",
    "How the solo went by the critic's own lights: the mean cost of its phrases under the style's weights. Lower is better; it is for finding the worst takes, not a target.",
    (reading) => mean(reading.costs.filter((_, i) => reading.phrases[i]!.notes.length > 0)),
  ),
  cost("worst-phrase", "cost", "The cost of the solo's worst phrase.", (reading) => {
    const costs = reading.costs.filter((_, i) => reading.phrases[i]!.notes.length > 0);
    return costs.length === 0 ? null : { value: Math.max(...costs), cases: costs.length };
  }),
];
