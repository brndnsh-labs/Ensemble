// The disco bass: the octave pump. The low root on the beat with the kick, its
// octave on the "and" with the open hat, one figure to a section (ST-disco-11
// to ST-disco-15). Every root sits in one octave for the whole song, so the
// octave above is always on the neck and a chord is always the same note.
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// R the root (the slash note under a slash chord), 8 its octave, a dot silence.

import type { BassStyle, Figure } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

const figure = (name: string, weight: number, grid: string): Figure => ({ name, weight, grid });

/** Quiet: quarter roots with the kick, or one octave pickup on the "and" of 4 (ST-disco-11). */
const QUIET: Figure[] = [
  figure("quarters", 3, "R... R... R... R..."),
  figure("quarters, a pickup", 2, "R... R... R... R.8."),
];
/** The working level: the pump, or the octave only on some "and"s (ST-disco-11). */
const WORKING: Figure[] = [
  figure("the pump", 4, "R.8. R.8. R.8. R.8."),
  figure("octaves on 2 and 4", 1, "R.R. R.8. R.R. R.8."),
  figure("the pump in the back half", 1, "R.R. R.R. R.8. R.8."),
];
/** Hot: the pump, or the gallop, a sixteenth root on each "a" (ST-disco-11). */
const HOT: Figure[] = [
  figure("the pump", 2, "R.8. R.8. R.8. R.8."),
  figure("the gallop", 2, "R.8R R.8R R.8R R.8R"),
];

const pump = (options: Figure[], gap: number): Line => ({
  // In any other meter, a root on every pulse (ST-disco-03).
  tones: [{ bars: [["R"]] }],
  figures: { hold: "section", options },
  otherMeters: "pulses",
  // An octave over the highest root: the pump's top is always there.
  ceiling: 52,
  // Bouncing: each note 80% of the gap to the next, the gap counted as two sixteenths at most,
  // three when quiet (ST-disco-13).
  length: { note: 0.8, long: 0.8, short: 0.8, gap },
  // A root on a beat 102, a root off it 78, the octave 94; a lead-in 90 (ST-disco-13, 14).
  velocity: {
    arrival: 102,
    strong: 102,
    weak: 102,
    off: 78,
    octave: 94,
    restrike: 78,
    approach: 90,
  },
});

/** Into every kind of change the same way: the half step below the next root. */
const BELOW = { below: 1, above: 0, fifth: 0, scale: 0 };

export const discoBass: BassStyle = {
  // One octave for the whole song, starting at E1 or F1, chosen once (ST-disco-12): every root
  // goes nearest a home drawn once a song between B1 and C2, which puts it from E1 to D#2 or
  // from F1 to E2.
  register: {
    lowest: 28,
    highest: 40,
    anchor: { from: 34, to: 35, hold: "song" },
    pull: 1,
  },

  lines: {
    low: pump(QUIET, 3),
    mid: pump(WORKING, 2),
    high: pump(HOT, 2),
  },

  // Never when quiet. Otherwise the last bar of a phrase always leads into the next phrase's
  // first chord, and a change inside a phrase is led into 30% of the time at the working
  // level and 60% hot (ST-disco-14): the lead-in replaces the figure's last note within an
  // eighth of the change with the half step below the next root.
  leadIn: {
    at: "eighth",
    pickup: false,
    // A pop that would be followed by a root more than an octave below it folds down.
    throughOctave: true,
    chance: {
      inside: { low: 0, mid: 0.3, high: 0.6 },
      intoPhrase: { low: 0, mid: 1, high: 1 },
      intoSection: { low: 0, mid: 1, high: 1 },
      intoEnding: 1,
    },
    hold: "section",
    kinds: {
      fallFifth: BELOW,
      riseFifth: BELOW,
      stepUp: BELOW,
      stepDown: BELOW,
      third: BELOW,
      tritone: BELOW,
      same: { below: 0, above: 0, fifth: 0, scale: 0 },
    },
  },

  // The last note, everyone on the One and held (ST-disco-31).
  ending: { velocity: 106 },
};
