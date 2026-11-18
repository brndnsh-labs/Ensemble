// The blues bass: a two-feel when the band is quiet, the boogie box when it is
// not. Everything is written on straight eighths; the style's swing turns each
// written "and" into the last note of a triplet, which is what makes the lope
// a shuffle.

import type { BassStyle, LineShape } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

/**
 * The boogie box, one tone a beat, two bars to a box: up in the bar the chord
 * arrives, down in the next, then up again (BA-29, ST-blues-22). The 6th steps
 * up to the b7, and the 3rd that ends the down bar sits a half step under the
 * IV, which is why the box walks a blues by itself.
 *
 * The box is fitted to the chord (BA-30): the first shape the chord meets wins.
 * The chords a blues lives on have other ways to be played as well. The box is
 * the home of most sections, so most takes start from the sound already
 * approved at gate 1; the others are answers a chorus may play on a chord, and
 * now and then a section's home. Which shape plays where is the critic's choice,
 * phrase by phrase.
 */
const box: Line["tones"] = [
  // A slash chord: stand on the slash note. A pedal, not a box.
  { when: { slash: true }, bars: [["R", "R", "R", "R"]] },
  // A power chord: the Chuck Berry figure, rocking between the 5th and the 6th.
  {
    when: { family: ["power"] },
    bars: [
      ["R", "5", "6", "5"],
      ["8", "6", "5", "6"],
    ],
  },
  // A minor chord with no major 6th in its scale (the i of a minor blues): the minor
  // pentatonic box. A half-diminished chord plays the same shape on its own flat 5th.
  {
    when: { family: ["minor", "half-diminished"], lacks: ["6"] },
    name: "minor box",
    home: 4,
    answer: 1,
    bars: [
      ["R", "3", "4", "5"],
      ["b7", "5", "4", "3"],
    ],
    others: [
      // New here: up the pentatonic to the octave, then down the box. The line opens out
      // where the box turns back at the 5th.
      {
        name: "minor box to the octave",
        home: 1,
        answer: 2,
        bars: [
          ["R", "5", "b7", "8"],
          ["b7", "5", "4", "3"],
        ],
      },
      // New here: through the blues scale's flat 5th, both ways. The flat 5th passes
      // between the 4th and the 5th, on the weak beats.
      {
        name: "minor blues scale",
        home: 0,
        answer: 2,
        bars: [
          ["R", "3", "4", "#4"],
          ["5", "#4", "4", "3"],
        ],
      },
    ],
  },
  // Any other chord whose scale has no major 6th: a dominant on its way to a minor chord
  // (A7 to Dm), an altered or augmented one. It turns at the b7 instead, or the bass plants
  // an F# against the piano's F natural (ST-blues-23).
  {
    when: { lacks: ["6"] },
    bars: [
      ["R", "3", "5", "b7"],
      ["b7", "5", "3", "5"],
    ],
    others: [
      // New here: the octave figure, for a bar or two. No 6th in it, so it fits here too.
      { name: "octave figure", home: 0, answer: 1, bars: [["R", "8", "b7", "5"]] },
    ],
  },
  // A chord with no flat 7th (a plain major triad on the I, a 6th, a major 7th, a
  // diminished 7th): the down bar starts from the octave.
  {
    when: { lacks: ["b7"] },
    bars: [
      ["R", "3", "5", "6"],
      ["8", "6", "5", "3"],
    ],
  },
  // Everything else, which in a blues is nearly everything: a dominant 7th, or a minor
  // chord with a major 6th (its own 3rd is the flat one). A sus chord's 4th or 2nd
  // stands where the 3rd would.
  {
    name: "box",
    home: 5,
    answer: 1,
    bars: [
      ["R", "3", "5", "6"],
      ["b7", "6", "5", "3"],
    ],
    others: [
      // From the notes, where it is the box of a chord with no b7 (BA-30). On a dominant it
      // is a choice: the top of the box opens to the octave instead of leaning on the b7.
      {
        name: "box to the octave",
        home: 1,
        answer: 2,
        bars: [
          ["R", "3", "5", "6"],
          ["8", "6", "5", "3"],
        ],
      },
      // New here: the walk through the fourth, up to the 5th and back. The #4 passes between
      // the 4th and the 5th on the weak beats.
      {
        name: "walk through the fourth",
        home: 1,
        answer: 2,
        bars: [
          ["R", "3", "4", "#4"],
          ["5", "#4", "4", "3"],
        ],
      },
      // From the notes' power-chord figure (BA-30), on a seventh chord: rocking on the 5th
      // and the 6th, the b7 at the top of the second bar.
      {
        name: "root, fifth, sixth",
        home: 1,
        answer: 1,
        bars: [
          ["R", "5", "6", "5"],
          ["b7", "5", "6", "5"],
        ],
      },
      // New here: the octave figure, a bar long, so a stay of two bars plays it twice. Up
      // the neck on a high root, so only ever an answer.
      { name: "octave figure", home: 0, answer: 1, bars: [["R", "8", "b7", "5"]] },
    ],
  },
];

/**
 * Walks into a change, a bar long, at the end of a line. Each starts on the
 * chord's root and steps one way to a half or whole step from the next root.
 * A blues mostly moves by fifths, so that is where its walks are: none of these
 * comes from the notes, which have only country's walk-up (BA-53, BA-54, EN-46).
 * The first two are the brief's own examples.
 */
const walks: BassStyle["walks"] = {
  // How often a plan walks: never in the two-feel, which has two notes a bar; at the end of
  // a line, about half the plans weighed at the working level and more when hot; inside a
  // line, seldom. The critic chooses among them.
  offer: { end: { low: 0, mid: 0.5, high: 0.6 }, inside: { low: 0, mid: 0.15, high: 0.15 } },
  kinds: {
    // I to IV, V to I.
    fallFifth: [
      // Up through the blue third into the IV: A B C C# | D. Beat 4 is the chord's own 3rd
      // and the C passes (BA-54).
      {
        name: "up through the blue third",
        weight: 2,
        toward: "up",
        tones: ["R", "2", "b3"],
        last: "half",
      },
      // Down the scale onto the I from a V above it: E D C# B | A.
      { name: "down the scale", weight: 2, toward: "down", tones: ["R", "b7", "6"], last: "whole" },
      // The same over a V going to a minor chord, whose scale has a minor 6th: E D C B | Am.
      {
        name: "down the minor scale",
        weight: 2,
        when: { lacks: ["6"] },
        toward: "down",
        tones: ["R", "b7", "b6"],
        last: "whole",
      },
      // And on into the minor chord from its flat 2nd: E D C Bb | Am.
      {
        name: "down to the flat second",
        weight: 1,
        when: { lacks: ["6"] },
        toward: "down",
        tones: ["R", "b7", "b6"],
        last: "half",
      },
    ],
    // IV to I, I to V.
    riseFifth: [
      // Down from the IV's 7th, chromatic at the end: D C B Bb | A.
      {
        name: "down from the seventh",
        weight: 2,
        toward: "down",
        tones: ["R", "b7", "6"],
        last: "half",
      },
      // Up through the fourth to the V: A C# D D# | E.
      {
        name: "up through the fourth",
        weight: 2,
        toward: "up",
        tones: ["R", "3", "4"],
        last: "half",
      },
    ],
  },
};

const boxTouch = {
  otherMeters: "pulses",
  // The top of the box: G3, an octave over the highest root. A tone that would pass it is
  // played an octave down.
  ceiling: 55,
  // A plain quarter is detached; a beat that lopes is long-short, "da-DUM" (BA-31, BA-32).
  length: { note: 0.85, long: 0.9, short: 0.4 },
  // 100 where a chord lands, 94 on the other strong beats, 88 on 2 and 4 (ST-blues-26).
  // A lead-in takes beat 4's place at beat 4's weight.
  velocity: { arrival: 100, strong: 94, weak: 88, restrike: 70, approach: 88 },
} as const;

// ── in twelve ───────────────────────────────────────────────────────────────
// The slow blues. A bar of 12/8 is four slow beats of three eighths: a figure
// is twenty-four sixteenths, written in sixes. The line is the box still, a
// tone a beat, each a dotted quarter held nearly full; where it lopes, the
// tone is struck again on the beat's last eighth, the shuffle's "da-DUM" at
// the speed of a slow blues. The walks into a change are the box's own, a step
// a beat. Quiet, it is in two: the bass note and its fifth, a half bar each.

const slowTouch = {
  otherMeters: "pulses",
  ceiling: 55,
  // A slow note is held: nearly its whole beat, and the long half of a lope to its pickup.
  length: { note: 0.9, long: 0.95, short: 0.6 },
  velocity: { arrival: 100, strong: 94, weak: 88, restrike: 72, approach: 88 },
} as const;

// ── in six ──────────────────────────────────────────────────────────────────
// The blues counted in two. A bar of 6/8 is two slow beats of three eighths:
// a figure is twelve sixteenths, written in sixes. The line is twelve's at the
// same speed, a tone a beat, so a bar of six holds half a bar of the box: the
// box's two bars of four tones are four bars of two (`inTwos`), up in the
// first two bars on a chord and down in the next two. Where it lopes, the tone
// is struck again on the beat's last eighth, as in twelve. Quiet it is in two
// as twelve is, the bass note and its fifth a half bar of twelve each, which in
// six is a bar each. The box's bar-long walks are four notes and a bar of six
// has two, so in six the line leads into a change by its last beat alone.

/** Each bar of a line's tones said in two bars of half as many. */
const halves = (bars: LineShape["bars"]): LineShape["bars"] =>
  bars.flatMap((bar) =>
    bar.length > 1 ? [bar.slice(0, bar.length / 2), bar.slice(bar.length / 2)] : [bar],
  );
const inTwos = (tones: Line["tones"]): Line["tones"] =>
  tones.map((set) => ({
    ...set,
    bars: halves(set.bars),
    ...(set.others
      ? { others: set.others.map((other) => ({ ...other, bars: halves(other.bars) })) }
      : {}),
  }));

const boxInSix = inTwos(box);

export const bluesBass: BassStyle = {
  // The line lives where a bass guitar's does: roots from the open E up to G2, the third
  // fret of the top two strings' octave, so a blues in A is played from the open A string
  // and its box tops out at A2. Each section has a home between A1 and D2; a root goes
  // nearest the note before it, pulled 30% of the way back home. Nearest home alone made
  // the line fall over an octave after the box had climbed (BA-33, BA-90).
  //
  // Roots went up to A2 with a home from C2 to E2 until gate 3, where the owner heard the
  // line as an octave high: in A the I sat on A2 and the box reached G3.
  register: {
    lowest: 28,
    highest: 40,
    anchor: { from: 33, to: 38, hold: "section" },
    pull: 0.3,
  },

  lines: {
    // Quiet: a two-feel. The bass note where the chord lands, its 5th on beat 3, both
    // nearly full length (BA-28). The 5th goes under the root when above would leave A2.
    low: {
      tones: [{ when: { slash: true }, bars: [["R", "R"]] }, { bars: [["R", "5"]] }],
      figures: { hold: "song", options: [{ weight: 1, grid: "x--- ---- x--- ----" }] },
      // In three there is no room for a two-feel: one root a bar.
      otherMeters: "downbeat",
      ceiling: 45,
      length: { note: 0.92, long: 0.92, short: 0.4 },
      velocity: { arrival: 98, strong: 88, weak: 88, restrike: 70, approach: 84 },
    },

    // Mid: the box in quarter notes. Each section chooses how much it lopes and keeps it:
    // not at all, beat 4 only, or beats 2 and 4 (BA-32).
    mid: {
      tones: box,
      figures: {
        hold: "section",
        options: [
          { weight: 2, grid: "x--- x--- x--- x---" },
          { weight: 2, grid: "x--- x--- x--- x-o-" },
          { weight: 1, grid: "x--- x-o- x--- x-o-" },
        ],
      },
      ...boxTouch,
    },

    // High: every beat lopes. The box is the same box.
    high: {
      tones: box,
      figures: { hold: "song", options: [{ weight: 1, grid: "x-o- x-o- x-o- x-o-" }] },
      ...boxTouch,
    },
  },

  meters: {
    "12/8": {
      // Quiet: in two, the bass note and its fifth, each half the bar.
      low: {
        tones: [{ when: { slash: true }, bars: [["R", "R"]] }, { bars: [["R", "5"]] }],
        figures: {
          hold: "song",
          options: [{ weight: 1, grid: "x----- ------ x----- ------" }],
        },
        otherMeters: "downbeat",
        ceiling: 45,
        length: { note: 0.92, long: 0.92, short: 0.4 },
        velocity: { arrival: 98, strong: 88, weak: 88, restrike: 70, approach: 84 },
      },
      // The box, a tone a beat. A section chooses how much it lopes and keeps it: not at
      // all, into the One only, or into 3 and the One.
      mid: {
        tones: box,
        figures: {
          hold: "section",
          options: [
            { weight: 2, grid: "x----- x----- x----- x-----" },
            { weight: 3, grid: "x----- x----- x----- x---o-" },
            { weight: 2, grid: "x----- x---o- x----- x---o-" },
          ],
        },
        ...slowTouch,
      },
      // Hot: every beat lopes.
      high: {
        tones: box,
        figures: { hold: "song", options: [{ weight: 1, grid: "x---o- x---o- x---o- x---o-" }] },
        ...slowTouch,
      },
    },
    "6/8": {
      // Quiet: in two, the bass note held a bar and its fifth the next bar on the chord.
      low: {
        tones: [{ when: { slash: true }, bars: [["R"]] }, { bars: [["R"], ["5"]] }],
        figures: { hold: "song", options: [{ weight: 1, grid: "x----- ------" }] },
        otherMeters: "downbeat",
        ceiling: 45,
        length: { note: 0.92, long: 0.92, short: 0.4 },
        velocity: { arrival: 98, strong: 88, weak: 88, restrike: 70, approach: 84 },
      },
      // The box, a tone a beat. A section chooses how much it lopes and keeps it: not at all,
      // into the One, or into the backbeat.
      mid: {
        tones: boxInSix,
        figures: {
          hold: "section",
          options: [
            { weight: 2, grid: "x----- x-----" },
            { weight: 3, grid: "x----- x---o-" },
            { weight: 2, grid: "x---o- x-----" },
          ],
        },
        ...slowTouch,
      },
      // Hot: both beats lope.
      high: {
        tones: boxInSix,
        figures: { hold: "song", options: [{ weight: 1, grid: "x---o- x---o-" }] },
        ...slowTouch,
      },
    },
  },

  // The box leads into many changes by itself: its last note is often a step from the
  // next root, and then it is simply kept. These are for the changes where it is not:
  // sometimes the last beat becomes a lead-in instead. A louder band leads in more, and
  // any band leads in more at the top of a chorus than inside one.
  leadIn: {
    // On the last beat before the change.
    at: "beat",
    chance: {
      // Low is the two-feel's own figure: a quarter-note approach on beat 4 about one
      // change in three (BA-28). Mid and high are chosen here; the old box had none.
      inside: { low: 0.35, mid: 0.3, high: 0.5 },
      intoSection: { low: 0.5, mid: 0.6, high: 0.8 },
      // A bassist who hears the last turnaround coming walks into the final chord (EN-04).
      intoEnding: 1,
    },
    // Each chorus has its own lead-ins; the rhythm figure is what a section keeps.
    hold: "pass",
    kinds: {
      // V to I, I to IV. The half step below is the third of the chord being left (B under
      // C from G7), the strongest way in. From above is the blue note falling (Gb into F).
      // The whole step above is the old chord's 5th. The target's own 5th is the root the
      // line is already on, so it is rare.
      fallFifth: { below: 4, above: 2, fifth: 1, scale: 2 },
      // IV to I, I to V. No chord tone leans into the new root, so the plain choices lead:
      // a scale step, or the new root's 5th (G into C over F7). The band's default weights.
      riseFifth: { below: 2, above: 1, fifth: 3, scale: 3 },
      // IV to V: the note between the two roots, from below (F, F#, G).
      stepUp: { below: 4, above: 1, fifth: 2, scale: 1 },
      // V to IV: the note between the two roots, from above (G, Gb, F).
      stepDown: { below: 2, above: 4, fifth: 1, scale: 1 },
      third: { below: 2, above: 1, fifth: 3, scale: 3 },
      tritone: { below: 2, above: 1, fifth: 3, scale: 3 },
      // The bass note is not moving: there is nothing to approach (BA-11).
      same: { below: 0, above: 0, fifth: 0, scale: 0 },
    },
  },

  walks,

  // A phrase is weighed in six plans. In a plan, a stay on a chord after the phrase's first
  // plays its answer a little over a time in three; the critic decides which plan sounds.
  // About one change in four arrived at by a half step: the middle of ST-blues-28's 15% to
  // 40%, aimed at in each phrase so that a whole chorus lands inside it.
  phrase: { candidates: 6, answers: 0.35, halfSteps: { min: 0.2, max: 0.25 } },

  // The last note: the lowest root on the instrument, as hard as a downbeat (EN-19, EN-27).
  ending: { velocity: 100 },
};
