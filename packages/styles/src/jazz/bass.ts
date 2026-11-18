// The jazz bass: in two when the band is quiet, walking when it is not. The
// head sits in the low tier (the arc puts it there), so the head is in two and
// the blowing walks, with the last bar of the head already walking into it
// (BA-23 to BA-25, ST-jazz-18 to ST-jazz-21).
//
// The walk is not written here. It is made, four quarter notes to the bar,
// from where the harmony is and where it is going; what is written here is how
// each note is weighed (BA-19) and how the approach into a chord is chosen
// (BA-04). Several walks are drawn for every phrase and the critic picks the
// line: `critic.weights.bass` in `critic.ts` says what it listens for.

import type { BassStyle } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

/** D2: the middle of the instrument, where the line comes home to (ST-jazz-18, X-A-03). */
const HOME = 38;

/**
 * In four. One note a beat, nearly full length; a chord's arrival leaned on a
 * little, 2 and 4 over 3 (BA-17). The tone sequence is only what a walk falls
 * back on with nowhere to go at all: the root.
 */
const walking: Line = {
  tones: [{ bars: [["R"]] }],
  figures: { hold: "song", options: [{ weight: 1, grid: "x--- x--- x--- x---" }] },
  walked: {
    // Each note within a fourth of the last; the note before the approach within a major
    // third of it (BA-19, BA-20).
    reach: 5,
    intoApproach: 4,
    // Chord tones on 1 and 3, passing tones on 2 and 4; each divided by the size of the
    // move, so steps beat leaps (BA-19).
    weights: { chord: { strong: 3, weak: 1.6 }, scale: { strong: 0.5, weak: 1.4 } },
    // Twice as likely toward the approach as not; six tenths as likely away from it.
    toward: 2,
    away: 0.6,
    // New here: a line keeps going the way it is going, and does not rock back to the note
    // it has just left. With only the notes' weights the nearest chord tone wins every
    // beat, and that is the root's own neighbour and then the root again (C B C).
    onward: 2,
    back: 0.15,
    // New here, from the ska walk's rule (BA-74): the next root is not given away on the
    // way to it (F Bb Ab F into Bb).
    early: 0.3,
    // New here: about one root in three is offered in its other octave, so that among the
    // walks weighed for a phrase some climb to the next root where the rest fall to it.
    otherOctave: 0.3,
  },
  // In three, five or seven the walk is one note to a pulse (ST-jazz-07).
  otherMeters: "pulses",
  // G3: the line may climb above its highest root to make a shape, and no further.
  ceiling: 55,
  length: { note: 0.92, long: 0.92, short: 0.4 },
  // 98 where a chord lands, 90 on 2 and 4, 86 on 3 and on a downbeat the chord only
  // carries through (BA-17). The approach is beat 4, at beat 4's weight.
  velocity: { arrival: 98, strong: 86, weak: 90, restrike: 70, approach: 90 },
};

// ── in six ──────────────────────────────────────────────────────────────────
// A bar of 6/4, six beats in two threes. A waltz bass does not walk every
// beat: it plays the two strong beats, 1 and 4, and a pickup or two, and only
// a hot band has it nearly walking (AU-93: about three notes a bar up to the
// hot level, about five in it; a note on every beat all night is running).
// The pitches are walked as in four: the chord's bass note where it lands,
// chord tones on the strong beats and on any note held a half note, an
// approach on the last beat where the figure has a note there.

/** The lilt of a waltz in each half: long, short. Beats 1, 3, 4 and 6, or three of them. */
const lilt: Line = {
  ...walking,
  figures: {
    hold: "section",
    options: [
      { name: "long-short twice", weight: 3, grid: "x--- ---- x--- x--- ---- x---" },
      { name: "long-short, long", weight: 2, grid: "x--- ---- x--- x--- ---- ----" },
      { name: "long, long-short", weight: 2, grid: "x--- ---- ---- x--- ---- x---" },
    ],
  },
  // Leaned on where a chord lands and on the strong beats; the pickups lighter.
  velocity: { arrival: 98, strong: 92, weak: 86, restrike: 70, approach: 88 },
};

/** Hot: the first beat held, then walking; or walking through the first three; or all six. */
const nearlyWalking: Line = {
  ...lilt,
  figures: {
    hold: "section",
    options: [
      { name: "one, then three to six", weight: 3, grid: "x--- ---- x--- x--- x--- x---" },
      { name: "one to four, and six", weight: 2, grid: "x--- x--- x--- x--- ---- x---" },
      { name: "all six", weight: 1, grid: "x--- x--- x--- x--- x--- x---" },
    ],
  },
};

// ── in twelve and in six-eight ──────────────────────────────────────────────
// A bar of dotted pulses: twenty-four sixteenths to a bar of twelve and twelve
// to a bar of six, grouped by pulse, a pulse's eighths its first, third and
// fifth characters. The walk is four's said in pulses (AU-97): a note on a
// pulse is a note on a beat, its pitches walked as in four. What compound
// time adds is the triplet's last eighth: the ballad bassist's "ba-DUM", a
// note an eighth before a pulse that leads into it. Never the middle eighth.

/**
 * Twelve, the ballad. Quiet it is four's two-feel in pulses (the low line, below); once the
 * band opens up it walks a note a pulse, and a section may lean into 3 and the One from the
 * pulse before's last eighth. Hot, a pickup into the One in every bar.
 */
const walkingInTwelve: Line = {
  ...walking,
  figures: {
    hold: "section",
    options: [
      { name: "a note a pulse", weight: 3, grid: "x----- x----- x----- x-----" },
      { name: "a pulse, and into the One", weight: 2, grid: "x----- x----- x----- x---x-" },
      { name: "into 3 and into the One", weight: 1, grid: "x----- x---x- x----- x---x-" },
    ],
  },
};

const hotInTwelve: Line = {
  ...walkingInTwelve,
  figures: {
    hold: "section",
    options: [
      { name: "into 3 and into the One", weight: 3, grid: "x----- x---x- x----- x---x-" },
      { name: "into 4 and into the One", weight: 2, grid: "x----- x----- x---x- x---x-" },
      { name: "into every pulse", weight: 1, grid: "x---x- x---x- x---x- x---x-" },
    ],
  },
};

/**
 * Six-eight: one strong pulse and its answer. Quiet in two, a note each pulse. Once the band
 * opens up the line lilts (AU-93's waltz bass, which plays the pulses and a pickup or two):
 * the One held and the second pulse leaning into the next One, or the One leaning into the
 * second pulse. Hot, a pickup into both.
 */
const liltInSix: Line = {
  ...walking,
  figures: {
    hold: "section",
    options: [
      { name: "two, and into the One", weight: 3, grid: "x----- x---x-" },
      { name: "the One, leaning into two", weight: 2, grid: "x---x- x-----" },
      { name: "into both", weight: 1, grid: "x---x- x---x-" },
    ],
  },
  velocity: { arrival: 98, strong: 92, weak: 86, restrike: 70, approach: 88 },
};

const hotInSix: Line = {
  ...liltInSix,
  figures: {
    hold: "section",
    options: [
      { name: "into both", weight: 3, grid: "x---x- x---x-" },
      { name: "two, and into the One", weight: 1, grid: "x----- x---x-" },
    ],
  },
};

/** Quiet in a bar of dotted pulses: four's two-feel, the bass note and its fifth. */
const inTwo = (grid: string): Line => ({
  tones: [{ when: { slash: true }, bars: [["R", "R"]] }, { bars: [["R", "5"]] }],
  figures: { hold: "song", options: [{ weight: 1, grid }] },
  otherMeters: "downbeat",
  ceiling: 45,
  length: { note: 0.92, long: 0.92, short: 0.4 },
  velocity: { arrival: 96, strong: 86, weak: 86, restrike: 70, approach: 84 },
});

export const jazzBass: BassStyle = {
  // E1 up to A2 for a root, home on D2: each root goes nearest the line, pulled 35% of the
  // way back home (ST-jazz-18). The notes let a root sit as high as E3; a line that started
  // from there would spend its bar above the staff, and the owner asked at gate 3 for a
  // bass that lives low. The walk may still climb to G3 on its way somewhere.
  register: {
    lowest: 28,
    highest: 45,
    anchor: { from: HOME, to: HOME, hold: "song" },
    pull: 0.35,
  },

  lines: {
    // Quiet, and under the head: in two. The bass note where the chord lands and its
    // fifth on 3, each nearly a half note; the fifth goes under the root where above
    // would leave the register, and gives way to the third when it is the next chord's
    // root (BA-23, BA-34). Beat 4 becomes an approach when the lead-in's coin says so.
    low: {
      tones: [{ when: { slash: true }, bars: [["R", "R"]] }, { bars: [["R", "5"]] }],
      figures: { hold: "song", options: [{ weight: 1, grid: "x--- ---- x--- ----" }] },
      // The two-feel is 4/4 only (ST-jazz-07): in three, one root a bar.
      otherMeters: "downbeat",
      // A2: a fifth that would sit above it is played under the root.
      ceiling: 45,
      length: { note: 0.92, long: 0.92, short: 0.4 },
      velocity: { arrival: 96, strong: 86, weak: 86, restrike: 70, approach: 84 },
    },
    mid: walking,
    high: walking,
  },

  meters: {
    "6/4": {
      // Quiet, and under the head: in two, a dotted half on each strong beat, the bass note
      // and its fifth. Beat 6 becomes an approach when the lead-in's coin says so.
      low: {
        tones: [{ when: { slash: true }, bars: [["R", "R"]] }, { bars: [["R", "5"]] }],
        figures: { hold: "song", options: [{ weight: 1, grid: "x--- ---- ---- x--- ---- ----" }] },
        otherMeters: "downbeat",
        ceiling: 45,
        length: { note: 0.92, long: 0.92, short: 0.4 },
        velocity: { arrival: 96, strong: 88, weak: 86, restrike: 70, approach: 84 },
      },
      mid: lilt,
      high: nearlyWalking,
    },
    // Quiet in two: in twelve the bass note on 1 and its fifth on 3, pulse 4 an approach when
    // the lead-in's coin says so; in six one on each pulse. The rest is written above.
    "12/8": { low: inTwo("x----- ------ x----- ------"), mid: walkingInTwelve, high: hotInTwelve },
    "6/8": { low: inTwo("x----- x-----"), mid: liltInSix, high: hotInSix },
  },

  leadIn: {
    at: "beat",
    chance: {
      // The two-feel splits its second half note with an approach on 4 in about a third
      // of the bars that lead to a new chord (BA-23). A walk always approaches: its last
      // note is the approach, and no coin is asked.
      inside: { low: 0.35, mid: 1, high: 1 },
      intoSection: { low: 0.35, mid: 1, high: 1 },
      intoEnding: 1,
    },
    // Keyed to the bar's place in its section, so a repeated A splits in the same bars
    // (BA-98).
    hold: "section",
    // The same whatever the root does. The notes weigh the half step below 4, the half
    // step above 3, a scale step 3 and the target's fifth 2 (BA-04, ST-jazz-21). With those,
    // three of a walk's changes in four came in by a half step, more on two-beat chords
    // where the fifth is the root already under the hand; chromatic approaches are
    // seasoning (BA-75), so the scale step and the fifth are weighed up here. As written,
    // 61% of a walk's changes are approached by a half step.
    kinds: {
      fallFifth: { below: 3, above: 2, fifth: 3, scale: 5 },
      riseFifth: { below: 3, above: 2, fifth: 3, scale: 5 },
      stepUp: { below: 3, above: 2, fifth: 3, scale: 5 },
      stepDown: { below: 3, above: 2, fifth: 3, scale: 5 },
      third: { below: 3, above: 2, fifth: 3, scale: 5 },
      tritone: { below: 3, above: 2, fifth: 3, scale: 5 },
      // Back to the same bass note (the top of a modal tune): walked home to by a scale
      // step or from its fifth, never by a manufactured half step (BA-75).
      same: { below: 0, above: 0, fifth: 2, scale: 3 },
    },
  },

  // Six walks are weighed for a phrase: with one, a line runs 2.4 moves one way before
  // it turns; with four, 2.75; with six, 3.0; with twelve, 3.1, at half as much again to
  // render. The half-step band is the notes' 30% to 80% (BA-21); the jazz critic gives it
  // no weight, since the weights above already land inside it.
  phrase: { candidates: 6, answers: 0, halfSteps: { min: 0.3, max: 0.8 } },

  // The last bar before the band opens up already walks (BA-25, ST-jazz-20).
  stepsUpEarly: true,

  // The button is twelve harder than this (ST-jazz-48).
  ending: { velocity: 96 },
};
