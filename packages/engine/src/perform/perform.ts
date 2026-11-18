// One performance: every seat plays the plan in turn, each hearing the ones
// before it, and the shared passes turn what they wrote into events.

import type { Plan } from "../plan/types.ts";
import { planBar } from "../plan/types.ts";
import { playBass } from "../players/bass/play.ts";
import { playChords } from "../players/chords/play.ts";
import { playDrums } from "../players/drums/play.ts";
import { playSolo } from "../players/solo/play.ts";
import { createRng } from "../rng.ts";
import type { Seat, StylePack } from "../style/types.ts";
import { SEATS } from "../style/types.ts";
import { chordToString } from "../theory/chord.ts";
import { applyFeel } from "./feel.ts";
import type { Heard, MarkerEvent, PerformanceEvent, Player, WrittenNote } from "./notes.ts";
import { byBar } from "./notes.ts";

/** Drums and bass lay the foundation; the soloist writes over it; the chords comp around all three. */
const PLAYERS: Readonly<Partial<Record<Seat, Player>>> = {
  drums: playDrums,
  bass: playBass,
  solo: playSolo,
  chords: playChords,
};

export function perform(plan: Plan, style: StylePack, seed: number | string): PerformanceEvent[] {
  const rng = createRng(seed);
  const heard: Partial<Record<Seat, WrittenNote[][]>> = {};
  const written: WrittenNote[] = [];
  const barCount = plan.bars.length + plan.lookahead.length;

  for (const seat of SEATS) {
    const player = PLAYERS[seat];
    if (!player) continue;
    const part = player({ plan, style, rng: rng.fork("seat", seat), heard: heard as Heard });
    // A seat that is out for a bar plays nothing in it, whatever its player wrote, but a
    // note leading into a bar it plays; and the look-ahead pass is read but never played.
    // (The bar a note leads into may be the look-ahead's.)
    const plays = (index: number) => {
      const bar = planBar(plan, index);
      return bar !== undefined && bar.seats[seat] !== null;
    };
    const sounding = part.filter(
      (note) =>
        note.seat === seat &&
        plan.bars[note.bar] !== undefined &&
        (plays(note.bar) || (note.leadsIn === true && plays(note.bar + 1))),
    );
    heard[seat] = byBar(sounding, barCount);
    written.push(...sounding);
  }

  const notes = applyFeel(written, plan, style, rng.fork("feel"));
  const events: PerformanceEvent[] = [...markers(plan), ...notes];
  const time = (e: PerformanceEvent) => (e.kind === "note" ? e.tick + e.offset : e.tick);
  const rank = (e: PerformanceEvent) => (e.kind === "marker" ? -1 : SEATS.indexOf(e.seat));
  const pitch = (e: PerformanceEvent) => (e.kind === "note" ? e.pitch : 0);
  return events
    .map((event, index) => ({ event, index }))
    .sort(
      (a, b) =>
        time(a.event) - time(b.event) ||
        rank(a.event) - rank(b.event) ||
        pitch(a.event) - pitch(b.event) ||
        a.index - b.index,
    )
    .map(({ event }) => event);
}

function markers(plan: Plan): MarkerEvent[] {
  const result: MarkerEvent[] = [];
  let lastChord = "";
  let lastPass = -1;
  let announcedLast = false;
  for (const bar of plan.bars) {
    if (bar.kind !== "music") continue;
    if (bar.barInSection === 0) {
      result.push({ kind: "marker", tick: bar.start, marker: "section", text: bar.section.label });
    }
    if (plan.mode === "jam" && bar.section.role === "body" && bar.pass !== lastPass) {
      lastPass = bar.pass;
      const text = plan.open ? `${bar.pass + 1}` : `${bar.pass + 1}/${plan.passes}`;
      result.push({ kind: "marker", tick: bar.start, marker: "pass", text });
    }
    if (bar.lastPass && !announcedLast) {
      announcedLast = true;
      result.push({ kind: "marker", tick: bar.start, marker: "last-pass", text: "Last pass" });
    }
    for (const span of bar.spans) {
      if (span.tied) continue;
      const text = span.chord ? chordToString(span.chord) : "N.C.";
      if (text === lastChord && span.start !== 0) continue;
      if (text !== lastChord) {
        result.push({ kind: "marker", tick: bar.start + span.start, marker: "chord", text });
      }
      lastChord = text;
    }
    if (bar.ending) {
      result.push({
        kind: "marker",
        tick: bar.start + bar.ending.at,
        marker: "ending",
        text: "Ending",
      });
    }
  }
  return result;
}
