// The rock piano: plain triads and sevenths with the root, close together in
// the middle of the keyboard. A held chord when the band is quiet, quarter
// notes at the working level, pumped eighths when hot (ST-rock-17, ST-rock-18).
// It never plays a chord early: in rock a push is the whole band's, and a
// keyboard pushing alone puts the next chord over the old bass note (ST-rock-27).

import type { ChordStyle, RhythmBook, VoicingKind } from "@ensemble/engine";

/**
 * Close position with the root (ST-rock-17): the triad, or the 7th chord as
 * written. A written 9th, 11th or 13th takes the 5th's place; a 7#9 is root,
 * 3rd, b7, #9 (the T in the 5th's seat is the #9, the most telling tension).
 */
const close: VoicingKind = {
  position: "close",
  recipes: [
    { when: { family: ["power"] }, voices: ["R", "5"] },
    { when: { lacks: ["7"] }, voices: ["R", "3", ["T", "5"]] },
    { voices: ["R", "3", ["T", "5"], "7"] },
  ],
};

// ── the rhythm book ─────────────────────────────────────────────────────────
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. A letter is
// a strike, `-` holds the chord on, `.` is silence. Straight eighths.

const rhythm: RhythmBook = {
  tiers: {
    // Quiet: one strike where the chord arrives, left to sustain, at 80. A chord carried over
    // a barline is struck again there softly, at 64, to keep it alive (ST-rock-18, CH-48).
    low: {
      draw: "quiet",
      articulation: { x: { level: 80, steps: 16 } },
      figures: [{ name: "held", weight: 1, grid: "x--- ---- ---- ----" }],
      answers: [],
      busy: { from: 1, to: 1.5 },
      arrival: { level: 80, steps: 16 },
      restrike: 64,
    },
    // The working level: quarter notes, each 3.4 sixteenths long, 92 on the beat (ST-rock-18).
    // A groove: the same in every bar, nothing taken out of it under a soloist.
    mid: {
      draw: "working",
      articulation: { x: { level: 92, steps: 3.4 } },
      figures: [{ name: "quarters", weight: 1, grid: "x... x... x... x...", groove: true }],
      answers: [],
      busy: { from: 4, to: 4 },
      arrival: { level: 92, steps: 3.4 },
    },
    // Hot: pumped eighths, 1.7 sixteenths each, 92 on the beat and 76 on the "and".
    high: {
      draw: "hot",
      articulation: { x: { level: 92, steps: 1.7 }, o: { level: 76, steps: 1.7 } },
      figures: [{ name: "pumped eighths", weight: 1, grid: "x.o. x.o. x.o. x.o.", groove: true }],
      answers: [],
      busy: { from: 8, to: 8 },
      arrival: { level: 92, steps: 1.7 },
    },
  },
  // A held chord breathes a little before what follows it.
  hold: 0.95,
  // One figure a tier and no answers: every phrase is the figure (a groove plays it anyway).
  forms: [{ weight: 1, bars: "a a a a" }],
  candidates: 1,
};

// ── in twelve ───────────────────────────────────────────────────────────────
// The rock ballad. A bar of 12/8 is four slow pulses of three eighths: a figure
// is twenty-four sixteenths, written in sixes, and only a pulse's three eighths
// are struck. From the working level up the right hand plays the ballad's
// triplets, the chord on every eighth, the pulse leaned on; quiet, a pad, or a
// chord a pulse. Under a soloist the triplets are a chord a pulse: the hand plays
// no busier than one strike to a pulse, as its quarter notes are in four.

/** A chord a pulse: the triplets under a soloist. */
const PULSES = "x..... x..... x..... x.....";

const rhythmInTwelve: RhythmBook = {
  tiers: {
    // Quiet: the held chord where it arrives, struck again softly over a barline, or a chord
    // on each pulse, held to the next.
    low: {
      draw: "quiet",
      articulation: { x: { level: 80, steps: 24 } },
      figures: [
        { name: "held", weight: 1, grid: "x----- ------ ------ ------" },
        { name: "a chord a pulse", weight: 1, grid: "x----- x----- x----- x-----" },
      ],
      answers: [],
      busy: { from: 1, to: 4 },
      arrival: { level: 80, steps: 24 },
      restrike: 64,
    },
    // The working level: the triplets, each eighth let go before the next, 88 on the pulse
    // and 70 between. A groove.
    mid: {
      draw: "working",
      articulation: { x: { level: 88, steps: 1.7 }, o: { level: 70, steps: 1.7 } },
      figures: [
        {
          name: "triplets",
          weight: 1,
          grid: "x.o.o. x.o.o. x.o.o. x.o.o.",
          groove: true,
          soloing: PULSES,
        },
      ],
      answers: [],
      busy: { from: 12, to: 12 },
      arrival: { level: 88, steps: 1.7 },
    },
    // Hot: the same triplets, harder, at the pump's 92 and 76.
    high: {
      draw: "hot",
      articulation: { x: { level: 92, steps: 1.7 }, o: { level: 76, steps: 1.7 } },
      figures: [
        {
          name: "triplets",
          weight: 1,
          grid: "x.o.o. x.o.o. x.o.o. x.o.o.",
          groove: true,
          soloing: PULSES,
        },
      ],
      answers: [],
      busy: { from: 12, to: 12 },
      arrival: { level: 92, steps: 1.7 },
    },
  },
  hold: rhythm.hold,
  forms: rhythm.forms,
  candidates: rhythm.candidates,
};

// ── in six ──────────────────────────────────────────────────────────────────
// The rock ballad in six-eight: twelve's book for a bar of two. The triplets
// and the chord a pulse are twelve's first half; the held chord rings the bar.

const rhythmInSix: RhythmBook = {
  tiers: {
    low: {
      ...rhythmInTwelve.tiers.low,
      figures: [
        { name: "held", weight: 1, grid: "x----- ------" },
        { name: "a chord a pulse", weight: 1, grid: "x----- x-----" },
      ],
      busy: { from: 1, to: 2 },
      arrival: { level: 80, steps: 12 },
    },
    mid: {
      ...rhythmInTwelve.tiers.mid,
      figures: [
        {
          name: "triplets",
          weight: 1,
          grid: "x.o.o. x.o.o.",
          groove: true,
          soloing: "x..... x.....",
        },
      ],
      busy: { from: 6, to: 6 },
    },
    high: {
      ...rhythmInTwelve.tiers.high,
      figures: [
        {
          name: "triplets",
          weight: 1,
          grid: "x.o.o. x.o.o.",
          groove: true,
          soloing: "x..... x.....",
        },
      ],
      busy: { from: 6, to: 6 },
    },
  },
  hold: rhythm.hold,
  forms: rhythm.forms,
  candidates: rhythm.candidates,
};

export const rockChords: ChordStyle = {
  meters: { "12/8": rhythmInTwelve, "6/8": rhythmInSix },
  idiom: "keys",
  kinds: { close },
  voicing: { low: "close", mid: "close", high: "close" },
  // The middle of the keyboard: nothing under E3 (X-B-02), the top aimed at G4, where the rock
  // guitar's grips are aimed (ST-rock-19), and kept there.
  register: { floor: 52, ceiling: 79, target: 67, reach: 4 },
  // Any meter but 4/4: a strike on every pulse, as the guitar strums once a pulse
  // (ST-rock-03); a chord carried over a barline at the re-strike's 64.
  plain: { length: 0.85, pulse: true, velocity: { beat: 92, offbeat: 76, restrike: 64 } },
  rhythm,
  // No anticipation from the comp, at any energy (ST-rock-27). A strike in the eighth before
  // a change plays the old chord: the figure is the figure. A change inside the bar waits
  // for its beat.
  anticipation: {
    barline: { low: 0, mid: 0, high: 0 },
    midBar: "wait",
    otherwise: "stay",
    stroke: "x",
  },
  // The voicings keep off the soloist's note; the figures are grooves and do not converse.
  // Under a soloist the hand plays no busier than quarter notes, as the blues piano was
  // brought down to after gate 3.
  listening: { breath: 6, answer: { level: 84, steps: 2 }, lift: 0, busiest: "mid" },
  // Everyone hits beat 1 and the chord rings out, the comp at 92 (ST-rock-30).
  ending: { velocity: 92, soft: 72, accent: 12 },
};
