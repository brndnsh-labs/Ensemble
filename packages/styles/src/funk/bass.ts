// The funk bass: one one-bar riff to a section, on the sixteenth grid, locked
// to the kick. Roots, octave pops, the fifth, the flat seventh and dead notes,
// in a rhythm that belongs to those notes (BA-38 to BA-42, ST-funk-15 to
// ST-funk-22). The riff does not vary from bar to bar: that is what a riff is.
// What changes is the end of a phrase, where the last beat or two may turn.
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// R the root, 8 its octave, 5 the fifth, 7 the flat seventh (the octave on a
// chord with none), m a dead note on the root, a dot silence.

import type { BassStyle, Figure } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

/** The five riffs, as the band plays them when it is hot (BA-38, ST-funk-15). */
const RIFFS = [
  "R..m R.8. m.R. .78.",
  "R... m.R. 8..R .m5.",
  "R..m ..R8 ..R. .7.m",
  "R.8. m.R. ..R. m.8.",
  "R... ...7 8.R. .5..",
] as const;

/** A riff with some of its strokes left out, written back in beats. */
function thinned(riff: string, keeps: (symbol: string, step: number) => boolean): string {
  const steps = [...riff.replace(/\s+/g, "")].map((symbol, step) =>
    keeps(symbol, step) ? symbol : ".",
  );
  return steps.join("").replace(/(.{4})(?=.)/g, "$1 ");
}

/** At the working level the dead notes on an "a" are left out (BA-39). */
const working = (riff: string) =>
  thinned(riff, (symbol, step) => !(symbol === "m" && step % 4 === 3));
/** Quiet, only the riff's roots are left: no dead notes, no pops (BA-39, X-A-08). */
const quiet = (riff: string) => thinned(riff, (symbol) => symbol === "R");

/**
 * The same five in the same order at every level, drawn under one name: a
 * section's riff when it is quiet is the riff it plays loud, thinned.
 */
const riffs = (at: (riff: string) => string): Line["figures"] => ({
  hold: "section",
  draw: "riff",
  options: RIFFS.map((riff): Figure => ({ weight: 1, grid: at(riff) })),
});

/**
 * Turns, laid over the end of a phrase's last bar. Neither is from the notes,
 * which have no bass turn at all (BA-83). Both are made of the chord's own
 * tones: on a vamp there is no change to lead into, and a chromatic pickup
 * inside a held chord is a stumble (AU-52).
 */
const PICKUP: Figure = { name: "pickup", weight: 2, grid: "..57", under: true };
const OCTAVES: Figure = { name: "octaves", weight: 1, grid: "R.8. R.8." };

const touch = {
  // With no figure to read (any meter but 4/4): the root on the downbeat, and the kick.
  tones: [{ bars: [["R"]] }],
  otherMeters: "downbeat",
  // E3: an octave over the highest root. A pop that would pass it folds down (ST-funk-19).
  ceiling: 52,
  // A root wherever the drummer's kick plays and the riff is silent (BA-13, BA-39).
  followsKick: true,
  // Short: three quarters of the gap to the next note, the gap counted as three sixteenths
  // at most, so never more than two and a quarter (ST-funk-18).
  length: { note: 0.75, long: 0.75, short: 0.5, gap: 3 },
  // 112 on a beat, 94 off it, 52 for a dead note (BA-40).
  velocity: {
    arrival: 112,
    strong: 112,
    weak: 112,
    off: 94,
    dead: 52,
    restrike: 94,
    approach: 94,
  },
} as const;

// ── in twelve and in six ────────────────────────────────────────────────────
// The same bassist handed a chart in 12/8 or 6/8: one riff to a section, made of
// the same notes (roots, octave pops, the fifth, the flat seventh, dead notes),
// locked to the kick, short, and on the eighths, the only places a bar of
// dotted pulses has (nothing swings). The notes have no compound-time bass for
// funk; these are four's riffs said in pulses: four's beat is a pulse, four's
// "and" and "a" (the pushes into the next beat) the pulse's last eighth, four's
// "e" its middle eighth. A riff in twelve turns over all four pulses, the push
// into 3 and the run into the One where four has them. A riff in six is a bar of
// one strong pulse and one answering it, and every one ends on a note on the
// last eighth that pushes back into the One; it is not half of twelve's.
//
// The levels thin as in four: the working level leaves out the dead notes on a
// pulse's last eighth (four's "a"), quiet keeps the roots. The riffs are listed
// in the same order as four's and drawn under the same name, so a section that
// plays four's first riff plays the first here.

/** The five riffs in twelve, hot. */
const RIFFS_IN_TWELVE = [
  "R...m. R...8. m...R. ..7.8.",
  "R..... m...R. 8...R. ..m.5.",
  "R...m. ..R.8. ....R. ..7.m.",
  "R...8. m...R. ....R. m...8.",
  "R..... ....7. 8...R. ..5...",
] as const;

/** The five riffs in six, hot. */
const RIFFS_IN_SIX = [
  "R.m... R...8.",
  "R..... m.R.5.",
  "R.5.m. ..7.8.",
  "R...8. m...R.",
  "R.8... ....R.",
] as const;

/** A riff in sixes with some of its strokes left out. */
function thinnedInSixes(riff: string, keeps: (symbol: string, step: number) => boolean): string {
  const steps = [...riff.replace(/\s+/g, "")].map((symbol, step) =>
    keeps(symbol, step) ? symbol : ".",
  );
  return steps.join("").replace(/(.{6})(?=.)/g, "$1 ");
}

const compoundRiffs = (list: readonly string[], at: (riff: string) => string): Line["figures"] => ({
  hold: "section",
  draw: "riff",
  options: list.map((riff): Figure => ({ weight: 1, grid: at(riff) })),
});

/** The working level leaves out the dead notes on a pulse's last eighth (four's "a", BA-39). */
const workingInSixes = (riff: string) =>
  thinnedInSixes(riff, (symbol, step) => !(symbol === "m" && step % 6 === 4));
/** Quiet, the roots alone (BA-39, X-A-08). */
const quietInSixes = (riff: string) => thinnedInSixes(riff, (symbol) => symbol === "R");

/** Four's turns said in pulses: the fifth and the seventh into the One, under the root; the octaves for two pulses. */
const PICKUP_IN_TWELVE: Figure = { name: "pickup", weight: 2, grid: "..5.7.", under: true };
const OCTAVES_IN_TWELVE: Figure = { name: "octaves", weight: 1, grid: "R...8. R...8." };
/**
 * In six a turn of a pulse is half the bar, and comes straight after the riff's first pulse,
 * which may end on its pop: the pickup's fifth is taken over the root, where under it the line
 * would fall more than an octave from the pop. Two pulses are the whole bar: the octaves are
 * one pulse's.
 */
const PICKUP_IN_SIX: Figure = { name: "pickup", weight: 2, grid: "..5.7." };
const OCTAVES_IN_SIX: Figure = { name: "octaves", weight: 1, grid: "R...8." };

function compoundLines(
  list: readonly string[],
  pickup: Figure,
  octaves: Figure,
): BassStyle["lines"] {
  return {
    low: { ...touch, figures: compoundRiffs(list, quietInSixes) },
    mid: {
      ...touch,
      figures: compoundRiffs(list, workingInSixes),
      turns: { offer: 0.2, hold: "section", options: [pickup] },
    },
    high: {
      ...touch,
      figures: compoundRiffs(list, (riff) => riff),
      turns: { offer: 0.2, hold: "section", options: [pickup, octaves] },
    },
  };
}

export const funkBass: BassStyle = {
  // The same bassist in twelve-eight and six-eight, written above.
  meters: {
    "12/8": compoundLines(RIFFS_IN_TWELVE, PICKUP_IN_TWELVE, OCTAVES_IN_TWELVE),
    "6/8": compoundLines(RIFFS_IN_SIX, PICKUP_IN_SIX, OCTAVES_IN_SIX),
  },

  // Every root has one place, from F1 up to E2, so a riff keeps its octave from bar to bar
  // and from section to section, and its pop tops out at E3. The notes anchor each section
  // somewhere from C2 to E2 (ST-funk-19), which puts a vamp in A on A2 with its pops on A3
  // in about half its sections: the octave the owner heard as too high in the blues.
  register: {
    lowest: 29,
    highest: 40,
    anchor: { from: 34, to: 34, hold: "section" },
    pull: 1,
  },

  lines: {
    // Quiet: roots only, where the riff has its roots and where the kick falls.
    low: { ...touch, figures: riffs(quiet) },
    // The riff, less the dead notes on an "a"; the last bar of a phrase may end on the pickup.
    mid: {
      ...touch,
      figures: riffs(working),
      turns: { offer: 0.2, hold: "section", options: [PICKUP] },
    },
    // All of it, and either turn.
    high: {
      ...touch,
      figures: riffs((riff) => riff),
      turns: { offer: 0.2, hold: "section", options: [PICKUP, OCTAVES] },
    },
  },

  // A riff note on the last sixteenth before a change becomes the half step under the next
  // root about three times in ten (BA-41, ST-funk-21). Never when quiet; never a note the
  // riff did not have.
  leadIn: {
    at: "sixteenth",
    // In six and twelve the line is all eighths: the step into the next root is its last one.
    inDotted: "eighth",
    pickup: false,
    // A pop that would be followed by a root more than an octave below it folds down.
    throughOctave: true,
    chance: {
      inside: { low: 0, mid: 0.3, high: 0.3 },
      intoSection: { low: 0, mid: 0.3, high: 0.3 },
      intoEnding: 0.3,
    },
    hold: "pass",
    kinds: {
      fallFifth: { below: 1, above: 0, fifth: 0, scale: 0 },
      riseFifth: { below: 1, above: 0, fifth: 0, scale: 0 },
      stepUp: { below: 1, above: 0, fifth: 0, scale: 0 },
      stepDown: { below: 1, above: 0, fifth: 0, scale: 0 },
      third: { below: 1, above: 0, fifth: 0, scale: 0 },
      tritone: { below: 1, above: 0, fifth: 0, scale: 0 },
      same: { below: 0, above: 0, fifth: 0, scale: 0 },
    },
  },

  // Four plans to a phrase: to turn or not, and which of the last-sixteenth notes lean.
  phrase: { candidates: 4, answers: 0, halfSteps: { min: 0, max: 0.3 } },

  // The dead stop, harder than a downbeat would allow were it not the last (ST-funk-41).
  ending: { velocity: 108 },
};
