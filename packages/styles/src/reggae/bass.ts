// The reggae bass: deep, round and melodic, with holes in it. One riff to a
// section on the sixteenth grid, most of them leaving the One open for the
// drop on 3 to land in. A riff keeps its hole across a change at the barline;
// only where the drummer's kick plays the One does the bass play it with him
// (ST-reggae-12 to ST-reggae-17).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// R the chord's bass note, 8 its octave (the notes' O), 5 the fifth, 3 the
// third (a sus chord's 4th), 6 the scale's sixth as a passing tone, - held,
// a dot silence.

import type { BassStyle, Figure, LeadInPolicy } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

/** The five riffs, with their weights low, mid, high (ST-reggae-12). */
const RIFFS = [
  // Leaves the One open, climbs to the octave on the drop, walks down the arpeggio.
  { name: "up to the drop", grid: "..R- R-.5 8--- 5-3.", weights: [0, 3, 3] },
  // Plays the One, rests through 2, answers.
  { name: "one and answer", grid: "R--- .... R-5- 8-5.", weights: [1, 3, 2] },
  // A hole on 1, a third into the drop, a scale step leading on.
  { name: "third into the drop", grid: "..R- ..3- R--- 5-6-", weights: [0, 2, 2] },
  // Heavy halves with a fifth pickup.
  { name: "heavy halves", grid: "R--- ---- R--- --5-", weights: [3, 1, 0] },
  // Just the drop.
  { name: "the drop", grid: ".... .... R--- ----", weights: [2, 0, 0] },
] as const;

/** A riff drawn for each section at each tier, by that tier's weights. */
const riffs = (tier: 0 | 1 | 2): Line["figures"] => ({
  hold: "section",
  options: RIFFS.map(
    (riff): Figure => ({ name: riff.name, weight: riff.weights[tier], grid: riff.grid }),
  ),
});

const line = (tier: 0 | 1 | 2): Line => ({
  // In any other meter, the root on each pulse with the fifth leading on: the notes give
  // nothing for the bass there (ST-reggae-04).
  tones: [{ bars: [["R", "5"]] }],
  figures: riffs(tier),
  otherMeters: "pulses",
  // Deep (ST-reggae-15): nothing over C3, an octave over the anchor's top. A riff's octave over
  // a root above C2 is played on the root: from D3 or E3 on the drop the line could not get
  // down to a root at the bottom of the register (E1, G1) without leaping more than an octave.
  ceiling: 48,
  // The One only where the drummer's kick plays it, for a beat, and the riff's entry on the
  // "and" of 1 dropped so it does not stutter (ST-reggae-13, BA-47).
  followsKick: "one",
  // A change at the barline keeps the riff's hole on the One; a change inside the bar is
  // stated on its root where it changes (ST-reggae-14).
  keepsHole: true,
  // Round: 92% of the written hold (ST-reggae-15).
  length: { note: 0.92, long: 0.92, short: 0.92 },
  // 104 on beats 1 and 3 and on arrivals, 88 on the pickups (ST-reggae-15).
  velocity: {
    arrival: 104,
    strong: 104,
    weak: 88,
    off: 88,
    restrike: 88,
    approach: 88,
  },
});

/**
 * Into a change: the fifth of the target (3), a scale tone (3), the half step
 * below (2), the half step above (1) (ST-reggae-16).
 */
const INTO = { below: 2, above: 1, fifth: 3, scale: 3 };

const leadIn: LeadInPolicy = {
  // The last note within an eighth of a change becomes the lead-in; no note is added for it.
  at: "eighth",
  pickup: false,
  // 35% of the time, at every level (ST-reggae-16).
  chance: {
    inside: { low: 0.35, mid: 0.35, high: 0.35 },
    intoSection: { low: 0.35, mid: 0.35, high: 0.35 },
    intoEnding: 0.35,
  },
  hold: "pass",
  kinds: {
    fallFifth: INTO,
    riseFifth: INTO,
    stepUp: INTO,
    stepDown: INTO,
    third: INTO,
    tritone: INTO,
    same: { below: 0, above: 0, fifth: 0, scale: 0 },
  },
};

export const reggaeBass: BassStyle = {
  // Deep: every root nearest an anchor drawn for each section between A1 and C2 (ST-reggae-15).
  register: {
    lowest: 28,
    highest: 40,
    anchor: { from: 33, to: 36, hold: "section" },
    pull: 1,
  },
  lines: { low: line(0), mid: line(1), high: line(2) },
  leadIn,
  // The stop: bass and chord hit the One together, the bass at 104 (ST-reggae-32).
  ending: { velocity: 104 },
};
