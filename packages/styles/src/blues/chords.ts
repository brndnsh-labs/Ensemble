// The blues piano: one hand, rootless, in the middle of the keyboard. The
// bass has the root, so the hand plays the 3rd and b7 that say what the chord
// is, with the 9th and 13th that make it a blues piano and not a rock one
// (ST-blues-29, CH-06).

import type { Articulation, ChordStyle, RhythmBook, VoicingKind } from "@ensemble/engine";

/**
 * Four notes in one hand, without the root (CH-06, CH-07). The two standard
 * shapes, 3rd on the bottom or 7th on the bottom, fall out of where the hand
 * is led; nothing here says which inversion.
 */
const rootless: VoicingKind = {
  position: "close",
  recipes: [
    // A diminished seventh is its four chord tones in every voicing kind.
    { when: { family: ["diminished"] }, voices: ["R", "3", "5", "7"] },
    // Half-diminished: flat 3rd, 11th, flat 5th, flat 7th. No root, no 9th (its scale's
    // 9th is a flat 9, an avoid note).
    { when: { family: ["half-diminished"] }, voices: ["3", "11", "5", "7"] },
    // A dominant: 3rd, b7, 9th, 13th, each taken as written or as its scale implies, so
    // a V going to a minor chord plays b9 and b13 (X-B-11). A sus chord's 4th stands in
    // for the 3rd. This is the whole sound of blues piano on a 7th chord.
    { when: { family: ["dominant"] }, voices: ["3", "7", "9", "13"] },
    { when: { family: ["power"] }, voices: ["R", "5"] },
    // A triad with no 7th or 6th written: the triad with its 9th on top of it.
    { when: { lacks: ["7"] }, voices: ["R", "3", "5", "9"] },
    // A minor 7th whose scale has no 9th (the iii in a major key, Phrygian): the 11th
    // takes the 9th's seat (CH-07).
    { when: { family: ["minor"], lacks: ["9"] }, voices: ["3", "5", "7", "11"] },
    // Major and minor 7ths and 6ths: 3rd, 7th (or 6th), 9th, and the 5th, unless the chart
    // writes a 13th, #11 or 11 to sit in its place.
    { voices: ["3", "7", "9", ["T", "5"]] },
  ],
};

/**
 * Close position with the root: plain triads, 6ths and 7ths (CH-03). The
 * blues piano switches to this when it pumps eighths (ST-blues-32): hammering
 * rootless 9ths in eighths mixes idioms. One written tension takes the 5th's
 * seat on a 7th chord, or joins a triad.
 */
const close: VoicingKind = {
  position: "close",
  recipes: [
    { when: { family: ["power"] }, voices: ["R", "5"] },
    { when: { lacks: ["7"] }, voices: ["R", "3", "5", "T"] },
    { voices: ["R", "3", ["T", "5"], "7"] },
  ],
};

// ── the rhythm book ─────────────────────────────────────────────────────────
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. The band
// swings eighths into a hard triplet, so the third character of a beat is the
// swung "and" and the second and fourth are never played. A letter is a
// strike, `-` holds the chord on, `.` is silence.
//
// The figures marked ST-blues-30 are the ones the old band played and the
// owner heard. The answers under them are new here: each is one of those
// figures with a strike moved or left out, so that a bar that answers is
// still made of the section's own material.

/** The pad: laid in on a beat (`x`), leaned on a little off it (`X`) (ST-blues-31). */
const PAD: Articulation = { x: { level: 74, steps: 2 }, X: { level: 80, steps: 2 } };
/**
 * Stabs, a beat and a half of a triplet long: plain on beats 1 and 3 (`x`),
 * harder on an off-beat or a chop on 2 or 4 (`X`) (ST-blues-31).
 */
const STAB: Articulation = { x: { level: 78, steps: 1.5 }, X: { level: 90, steps: 1.5 } };
/** The pump's long-short, the same as the bass's lope: long on the beat, short and light on the "and". */
const PUMP: Articulation = { x: { level: 84, steps: 1.5 }, o: { level: 66, steps: 1 } };

const rhythm: RhythmBook = {
  tiers: {
    // Quiet: a pad that breathes. One chord a bar, mostly; the hand moves when the harmony does.
    low: {
      draw: "quiet",
      articulation: PAD,
      figures: [
        // One chord, left to ring (ST-blues-30).
        { name: "held", weight: 3, grid: "x--- ---- ---- ----" },
        // Held, and struck again on the "and" of 4, leaning into the next bar (ST-blues-30).
        { name: "held and a lean", weight: 2, grid: "x--- ---- ---- --X-" },
        // The Charleston as a pad: beat 1, then the "and" of 2 held to the barline (ST-blues-30).
        { name: "charleston", weight: 1, grid: "x--- --X- ---- ----" },
      ],
      answers: [
        // The pad struck again on 3, with the kick: two half notes.
        { name: "halves", weight: 2, grid: "x--- ---- x--- ----" },
      ],
      busy: { from: 1, to: 1.5 },
      // A chord the pad would pass by is laid in where it arrives and held like the rest.
      arrival: { level: 80, steps: 16 },
    },

    // The working level: chops, short and off the keys at once, with or against the backbeat.
    mid: {
      draw: "working",
      articulation: STAB,
      figures: [
        // Chops on 2 and 4, like a second snare (ST-blues-30).
        { name: "chops", weight: 3, grid: ".... X... .... X..." },
        // Beat 1 and the "and" of 2 (ST-blues-30).
        { name: "charleston", weight: 2, grid: "x... ..X. .... ...." },
        // The chops pushed late: the "and" of 2 and the "and" of 4 (ST-blues-30).
        { name: "ands", weight: 2, grid: ".... ..X. .... ..X." },
        // 2, then the "and"s of 3 and 4 running into the next bar (ST-blues-30).
        { name: "two and the ands", weight: 1, grid: ".... X... ..X. ..X." },
      ],
      answers: [
        // The chop on 2, and the second one late.
        { name: "chop and a late one", weight: 2, grid: ".... X... .... ..X." },
        // The first one late, the second on 4 with the snare.
        { name: "late one and a chop", weight: 2, grid: ".... ..X. .... X..." },
      ],
      busy: { from: 2, to: 3 },
      // One beat, firmly (CH-34).
      arrival: { level: 80, steps: 4 },
    },

    // Hot: the pump, or four stabs a bar around the backbeat.
    high: {
      draw: "hot",
      articulation: STAB,
      figures: [
        // The boogie pump: every swung eighth, long on the beat and short and light on the
        // "and". A groove, not a conversation, and in close position: hammering rootless
        // 9ths and 13ths in eighths mixes idioms (ST-blues-30, ST-blues-32, ST-blues-33).
        {
          name: "pump",
          weight: 2,
          grid: "x.o. x.o. x.o. x.o.",
          articulation: PUMP,
          voicing: "close",
          groove: true,
        },
        // 2, 4 and the "and"s after them (ST-blues-30).
        { name: "backbeats and their ands", weight: 2, grid: ".... X.X. .... X.X." },
        // Beat 1 and three "and"s (ST-blues-30).
        { name: "one and the ands", weight: 1, grid: "x... ..X. ..X. ..X." },
      ],
      answers: [
        // 2 and its "and", then the "and"s of 3 and 4: the two figures above, half and half.
        { name: "two, then the ands", weight: 2, grid: ".... X.X. ..X. ..X." },
        // The other half and half: 1 and the "and" of 2, then 4 and its "and".
        { name: "charleston, then four", weight: 2, grid: "x... ..X. .... X.X." },
        // The backbeats with the last "and" left out: a breath before the next bar.
        { name: "backbeats, one and", weight: 1, grid: ".... X.X. .... X..." },
      ],
      busy: { from: 4, to: 5 },
      arrival: { level: 80, steps: 4 },
    },
  },

  // Held 95% of the way to the next strike (ST-blues-31).
  hold: 0.95,

  // How a four-bar phrase is built: `a` is the section's figure, `b` and `c` the two
  // figures answering it this chorus. A phrase always opens on the figure. A line of a
  // blues is a call of two bars and more, then room for an answer, so the bars that
  // differ mostly come where the line turns: its third bar and its last.
  forms: [
    // State it, state it, answer, come back.
    { weight: 3, bars: "a a b a" },
    // Three times and a turn into the next line.
    { weight: 3, bars: "a a a b" },
    // State it twice, then two bars that move away from it.
    { weight: 2, bars: "a a b c" },
    // State it twice, then the answer twice.
    { weight: 2, bars: "a a b b" },
    // Call and answer by the bar.
    { weight: 1, bars: "a b a b" },
    // Call and answer, and the second answer is a different one.
    { weight: 1, bars: "a b a c" },
    // The figure left alone for a phrase.
    { weight: 1, bars: "a a a a" },
  ],
  candidates: 6,
};

export const bluesChords: ChordStyle = {
  idiom: "keys",
  kinds: { rootless, close },
  // Rootless at every level; the pump's close position is asked for by its figure.
  voicing: { low: "rootless", mid: "rootless", high: "rootless" },
  // One hand, nothing under E3 (ST-blues-29, X-B-02), up to C6, the top of the keyboard
  // comp's slot (X-B-01), the top voice aimed at C5 (CH-16).
  // The hand is led freely within a major third of that and pulled back beyond it.
  register: { floor: 52, ceiling: 84, target: 72, reach: 4 },
  // The pad that breathes: held 95% of the way to the next strike, 74 on a beat and 80
  // off it (ST-blues-31, low). A chord carried into the next bar is struck again at about
  // four fifths of that, as a rock keyboard re-strikes a held chord (CH-48: 64 against 80).
  plain: { length: 0.95, velocity: { beat: 74, offbeat: 80, restrike: 60 } },
  rhythm,
  // The hand leans into a change at the barline three times in ten when quiet, four at the
  // working level, five when hot (ST-blues-46), as a leaned-on strike. A change inside the
  // bar is played early by any strike in the eighth before it (ST-blues-47). Where the hand
  // does not lean in, nothing is struck in that eighth: the old chord is never stabbed
  // just before the new one (ST-blues-48, KF-B-27).
  anticipation: {
    barline: { low: 0.3, mid: 0.4, high: 0.5 },
    midBar: "tie",
    otherwise: "rest",
    stroke: "X",
  },
  // Under a soloist the hand lays out and answers (ST-blues-33, CH-71): a breath is a dotted
  // quarter of silence, an empty one gets a stab an eighth long at 92, and what the figure
  // already plays in a breath is played 8 harder. The pump never converses: it is a groove.
  listening: { breath: 6, answer: { level: 92, steps: 2 }, lift: 8 },
  // The final chord at 92, 72 when the ending is soft, a button 12 harder (CH-74, EN-17).
  ending: { velocity: 92, soft: 72, accent: 12 },
};
