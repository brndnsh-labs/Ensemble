// What a listener would say about the whole band over a take.

import { PPQ } from "../../chart/types.ts";
import { STEP } from "../../perform/grid.ts";
import type { NoteEvent } from "../../perform/notes.ts";
import type { PlanBar } from "../../plan/types.ts";
import { DEAD_VOICE } from "../../players/bass/line.ts";
import { MUTED } from "../../players/chords/strike.ts";
import { tierOf } from "../../style/types.ts";
import type { Take } from "../../take.ts";
import { mod12 } from "../../theory/pitch.ts";
import { mean, musicBars, notesIn, notesOf, share } from "../read.ts";
import type { Measure } from "../types.ts";

/** How many seeds the groove count is read over: the gate 4 review's hundred. */
const GROOVE_SEEDS = 100;

/**
 * A bar of the groove as the three players lay it down, as text: where the kick
 * falls; where the bass plays, each note as its interval over the bar's first
 * note (a dead note marked); where the guitar strokes, each a stab or a scratch.
 * Levels and the exact pitches are left out, so the same riff over another chord
 * reads the same.
 */
function grooveBar(bar: PlanBar, kick: NoteEvent[], bass: NoteEvent[], guitar: NoteEvent[]) {
  const at = (note: NoteEvent) => (note.tick - bar.start) / STEP;
  const first = bass[0]?.pitch ?? 0;
  const strokes = new Map<number, boolean>();
  for (const note of guitar)
    strokes.set(at(note), (strokes.get(at(note)) ?? true) && note.voice === MUTED);
  return [
    kick.map(at).join(","),
    bass
      .map((note) => `${at(note)}${note.voice === DEAD_VOICE ? "m" : mod12(note.pitch - first)}`)
      .join(","),
    [...strokes].map(([step, muted]) => `${step}${muted ? "~" : "x"}`).join(","),
  ].join(" | ");
}

/**
 * The groove a take's first section draws at the working level in four: the
 * kick, the bass riff and the guitar line it holds (X-A-29), as `grooveBar`
 * writes them. Only in four: a style's six and twelve are pools of their own,
 * and a groove in one meter is never one in another, so a take in six would
 * always count as new. Read in the bars where nothing else is laid over them:
 * the three of them at the working level, one chord the whole bar, not an
 * answer bar (the drummer turns it, DR-05), not a phrase's last bar (the bass
 * and the guitar turn it), no fill, not the ending. Of those, the bar the
 * section plays most often, so a lead-in or a lean into the next chord now and
 * then does not count as another groove. Null when the take has no such bar.
 *
 * A take's groove is what its seed drew, and takes on other charts that draw the
 * same kick, riff and line read the same: on one chart (the four-bar vamp in A)
 * 300 seeds read 74 grooves, of the 75 the pool had (five kicks, five riffs,
 * three lines), and the first hundred 57, the gate 4 review's count.
 */
export function grooveOf(take: Take): string | null {
  const notes = (seat: "drums" | "bass" | "chords") => notesOf(take, seat);
  const kicks = notes("drums").filter((note) => note.voice === "kick");
  const bass = notes("bass");
  const guitar = notes("chords");
  const working = (energy: number | null) => energy !== null && tierOf(energy) === "mid";
  const plain = musicBars(take).filter(
    (bar) =>
      working(bar.seats.drums) &&
      working(bar.seats.bass) &&
      working(bar.seats.chords) &&
      bar.meter.beats === 4 &&
      bar.meter.unit === 4 &&
      bar.spans.length === 1 &&
      bar.spans[0]!.chord !== null &&
      bar.phrase.bar % 2 === 0 &&
      bar.phrase.bar !== bar.phrase.length - 1 &&
      !bar.fill &&
      !bar.ending,
  );
  const section = plain[0]?.section.identity;
  const counts = new Map<string, number>();
  for (const bar of plain) {
    if (bar.section.identity !== section) continue;
    const groove = grooveBar(bar, notesIn(kicks, bar), notesIn(bass, bar), notesIn(guitar, bar));
    counts.set(groove, (counts.get(groove) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [groove, count] of counts)
    if (best === null || count > counts.get(best)!) best = groove;
  return best;
}

/**
 * The share of a jam's bars where a seat is laid out while the band plays on (#2240): the
 * bars of music with any of the band in them, and of those the ones without this seat. A
 * song is played as arranged and is not measured; a seat that plays in no bar of the take
 * was left out by the player, not laid out, and is not measured either.
 */
const laidOut = (seat: "drums" | "bass" | "chords"): Measure => ({
  id: `${seat}.laid-out`,
  seat,
  says: `How much of a jam ${seat === "chords" ? "the comp sits" : `the ${seat} sit${seat === "bass" ? "s" : ""}`} out while the rest of the band plays: rarely, for a section or a pass at a low point of the arc, and never at all in a style that keeps everyone in.`,
  unit: "share",
  of(take) {
    if (take.plan.mode !== "jam") return null;
    const band = musicBars(take).filter(
      (bar) => bar.seats.drums !== null || bar.seats.bass !== null || bar.seats.chords !== null,
    );
    if (!band.some((bar) => bar.seats[seat] !== null)) return null;
    return share(band.filter((bar) => bar.seats[seat] === null).length, band.length);
  },
});

export const bandMeasures: readonly Measure[] = [
  laidOut("drums"),
  laidOut("bass"),
  laidOut("chords"),
  {
    id: "band.new-grooves",
    idiom: true,
    seat: "band",
    says: "Seed after seed the band finds another groove: of a hundred takes in four, each its first section's kick, bass riff and guitar line at the working level, most are a groove no take before it played.",
    unit: "share",
    of: () => null,
    across(takes) {
      const heard = new Set<string>();
      let read = 0;
      for (const take of takes) {
        if (read === GROOVE_SEEDS) break;
        const groove = grooveOf(take);
        if (groove === null) continue;
        read++;
        heard.add(groove);
      }
      // Fewer takes read fewer repeats: the share is only comparable over the full hundred.
      return read < GROOVE_SEEDS ? null : share(heard.size, read);
    },
  },
  {
    id: "band.backbeat-swell",
    seat: "band",
    says: "A jam with an arc has dynamics: the backbeat in its loudest time through is clearly harder than in its quietest.",
    unit: "velocity",
    of(take) {
      // Measured on one comparable event, the snare on 2 and 4, because a mean over every
      // note falls when a louder band adds ghost notes.
      const drums = notesOf(take, "drums").filter((note) => note.voice === "snare");
      const byPass = new Map<number, { energy: number[]; level: number[] }>();
      for (const bar of musicBars(take)) {
        if (bar.section.role !== "body" || bar.ending || bar.fill) continue;
        const pass = byPass.get(bar.pass) ?? { energy: [], level: [] };
        pass.energy.push(bar.energy);
        for (const note of notesIn(drums, bar)) {
          const beat = (note.tick - bar.start) / PPQ;
          if (beat === 1 || beat === 3) pass.level.push(note.velocity);
        }
        byPass.set(bar.pass, pass);
      }
      const passes = [...byPass.values()].filter((pass) => pass.level.length > 0);
      const energies = passes.map((pass) => mean(pass.energy)?.value ?? 0);
      // A take held at one level has no arc to measure.
      if (passes.length < 2 || Math.max(...energies) - Math.min(...energies) < 0.05) return null;
      const levels = passes.map((pass) => mean(pass.level)?.value ?? 0);
      return { value: Math.max(...levels) - Math.min(...levels), cases: passes.length };
    },
  },
  {
    id: "band.backbeat-level",
    seat: "band",
    says: "The backbeat is played firmly, not slammed: there is room above it for the loudest chorus and the last hit.",
    unit: "velocity",
    of(take) {
      // The backbeat is the band's loudest steady event, so its level is how hard the band is
      // hitting. Heard at gate 1: around 110 slams through a sampled kit; around 95 does not.
      const snare = notesOf(take, "drums").filter((note) => note.voice === "snare");
      const levels: number[] = [];
      for (const bar of musicBars(take)) {
        if (bar.ending || bar.fill) continue;
        for (const note of notesIn(snare, bar)) {
          const beat = (note.tick - bar.start) / PPQ;
          if (beat === 1 || beat === 3) levels.push(note.velocity);
        }
      }
      return mean(levels);
    },
  },
  {
    id: "band.notes-near-the-top",
    seat: "band",
    says: "Almost nothing is played at the very top of the range: the hardest strokes are saved for where they mean something.",
    unit: "share",
    of(take) {
      const notes = take.events.filter((event) => event.kind === "note");
      return share(notes.filter((note) => note.velocity >= 115).length, notes.length);
    },
  },
];
