// The jazz piano: one hand in the middle of the keyboard, rootless, comping
// short stabs and the odd held chord around the time the ride keeps. The bass
// has the root and the beat; the piano's job is the colour and the push, and
// under a horn, the holes (ST-jazz-25 to ST-jazz-30, CH-06, CH-43).

import type { Articulation, ChordStyle, RhythmBook, VoicingKind } from "@ensemble/engine";

/**
 * Four notes in one hand, no root (ST-jazz-25, CH-06, CH-07): the 3rd and the
 * 7th that say what the chord is, and two colours. Which inversion, 3rd on the
 * bottom or 7th on the bottom, is where the hand is led from: through a ii-V-I
 * the two forms alternate, because the 3rd of one chord is the 7th of the
 * next and the hand barely moves.
 */
const rootless: VoicingKind = {
  position: "close",
  recipes: [
    // A diminished seventh is its four chord tones.
    { when: { family: ["diminished"] }, voices: ["R", "3", "5", "7"] },
    // Half-diminished is its own four notes: b3, 11, b5, b7. No root, and no 9th: its
    // scale's 9th is a flat 9, an avoid note (ST-jazz-25, CH-06).
    { when: { family: ["half-diminished"] }, voices: ["3", "11", "5", "7"] },
    // A dominant takes the 9th and 13th in place of the root and 5th, each as written or as
    // its scale implies, so a V going to a minor chord plays b9 and b13 (X-B-11). A sus
    // chord's 4th stands in for the 3rd. A dominant whose scale has no 13th of either kind
    // (a 7b9 the engine reads as altered over a natural 5th) keeps four notes with its 5th.
    { when: { family: ["dominant"] }, voices: ["3", "7", "9", ["13", "5"]] },
    { when: { family: ["power"] }, voices: ["R", "5"] },
    // A triad with no 7th or 6th gets its root: root, 3rd, 5th, and the 9th on it
    // (ST-jazz-25). A tonic 6th has its 6th, which is a seventh's seat, and goes below.
    { when: { lacks: ["7"] }, voices: ["R", "3", "5", "9"] },
    // A minor 7th whose scale has no 9th (the iii of a major key, Phrygian): the 11th takes
    // the 9th's seat (CH-07).
    { when: { family: ["minor"], lacks: ["9"] }, voices: ["3", "5", "7", "11"] },
    // Major and minor: the 3rd, the 7th (or 6th), the 9th and the 5th, unless the chart
    // writes a 13th, #11 or 11 to sit in the 5th's place.
    { voices: ["3", "7", "9", ["T", "5"]] },
  ],
};

// ── the rhythm book ─────────────────────────────────────────────────────────
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. The band
// swings eighths, so only the first and third character of a beat are played
// (ST-jazz-06): a sixteenth would land between the swung eighths and flam.
// `x` is a stab on a beat, `X` a stab off it; `-` holds the chord on, and a
// chord held to the barline rings to the end of its own chord and no further.
//
// The figures are the old band's whole-bar cells (ST-jazz-26, CH-43), which
// were drawn fresh for every bar and never added up to a part (CH-75). Here a
// section takes one as its own and each chorus answers it with two others,
// phrase by phrase (X-B-14), and the answers are where most of the variety is.
// A bar of two chords needs no cells of its own: the cell is laid over the
// harmony, and a strike in the eighth before the change plays the new chord
// early, so the Charleston over a ii-V is the ii on 1 and the V pushed on the
// "and" of 2, and the reverse Charleston is the ii on the "and" of 1 and the V
// on 3: the half-bar vocabulary of ST-jazz-26 (on the chord, on its "and").

/**
 * Stabs a dotted sixteenth long, plain on the beat (78) and leaned on off it
 * (88) (ST-jazz-27). Held, a chord rings to the end of its chord.
 */
const STAB: Articulation = { x: { level: 78, steps: 1.5 }, X: { level: 88, steps: 1.5 } };

const rhythm: RhythmBook = {
  tiers: {
    // Quiet: the head and a ballad. Half the chords are laid in and held, and a bar whose
    // chord is held over from the bar before may be left alone (ST-jazz-27, ST-jazz-28).
    low: {
      draw: "quiet",
      articulation: STAB,
      figures: [
        // The Charleston with its second chord held: 1, then the "and" of 2 left to ring.
        { name: "charleston, held", weight: 4, grid: "x... ..X- ---- ----" },
        // The chord laid in on 1 and held.
        { name: "one, held", weight: 3, grid: "x--- ---- ---- ----" },
        // The "and" of 2 alone, held (ST-jazz-26).
        { name: "and of two, held", weight: 2, grid: ".... ..X- ---- ----" },
        // The reverse Charleston, the second held.
        { name: "reverse charleston, held", weight: 2, grid: "..X. .... x--- ----" },
      ],
      answers: [
        // A bar left to the bass and the ride: the chord held over is not struck again
        // (ST-jazz-28). A chord that changes is still laid in where it arrives (CH-34).
        { name: "rest", weight: 3, grid: ".... .... .... ...." },
        // The Charleston as stabs.
        { name: "charleston", weight: 2, grid: "x... ..X. .... ...." },
        // The "and" of 2 alone, short.
        { name: "and of two", weight: 2, grid: ".... ..X. .... ...." },
      ],
      busy: { from: 1, to: 1.5 },
      // A chord the figure passes by is laid in where it arrives and held.
      arrival: { level: 74, steps: 16 },
    },

    // The working level: stabs around the ride, a quarter of them held (ST-jazz-26, 27).
    mid: {
      draw: "working",
      articulation: STAB,
      // A section's own figure is one of the two-strike cells: it is what the tune's comp is
      // heard as, every phrase opens on it, and under a horn a bar of one strike is thin
      // (CH-70). The one-strike cells (the "and" of 2 alone, beat 1 alone) are answers: a bar
      // that breathes.
      figures: [
        // Beat 1 and the "and" of 2 (ST-jazz-26 weight 4).
        { name: "charleston", weight: 4, grid: "x... ..X. .... ...." },
        // The "and" of 1 and beat 3 (2), beat 3 held to the end of its chord.
        { name: "reverse charleston", weight: 2, grid: "..X. .... x--- ----" },
        // Beat 2 and the "and" of 3 (2), the "and" of 3 held.
        { name: "two and the and of three", weight: 2, grid: ".... x... ..X- ----" },
        // The "and" of 2 and the "and" of 4 (2).
        { name: "the ands of two and four", weight: 2, grid: ".... ..X. .... ..X." },
      ],
      answers: [
        // The "and" of 2 alone (ST-jazz-26 weight 3), held: over a ii-V, the V pushed and
        // left to ring.
        { name: "and of two", weight: 3, grid: ".... ..X- ---- ----" },
        // The Charleston with the "and" of 2 held to the end of its chord.
        { name: "charleston, held", weight: 3, grid: "x... ..X- ---- ----" },
        // Beat 1 alone, laid in and held (ST-jazz-26 weight 2, held as ST-jazz-27 asks).
        { name: "one, held", weight: 2, grid: "x--- ---- ---- ----" },
        // The "and" of 2 alone, short.
        { name: "and of two, short", weight: 1, grid: ".... ..X. .... ...." },
        // The "and" of 1 and the "and" of 2 (ST-jazz-26 weight 1).
        { name: "the ands of one and two", weight: 1, grid: "..X. ..X. .... ...." },
      ],
      busy: { from: 2.1, to: 2.6 },
      // One beat, firmly (CH-34).
      arrival: { level: 78, steps: 4 },
    },

    // Hot, with the band to itself: the same cells, a section's figure the same cell it is at
    // the working level (the tiers share the draw), and in many bars one more stab on the
    // "and" of 3 or of 4 (ST-jazz-27: 40% of bars, at 84).
    high: {
      draw: "working",
      articulation: { ...STAB, o: { level: 84, steps: 1.5 } },
      figures: [
        { name: "charleston", weight: 4, grid: "x... ..X. .... ..o." },
        { name: "reverse charleston", weight: 2, grid: "..X. .... x... ..o." },
        { name: "two and the and of three", weight: 2, grid: ".... x... ..X. ...." },
        { name: "the ands of two and four", weight: 2, grid: ".... ..X. .... ..X." },
      ],
      answers: [
        { name: "and of two, and of three", weight: 3, grid: ".... ..X. ..o. ...." },
        { name: "charleston, held", weight: 2, grid: "x... ..X- ---- ----" },
        { name: "one held, and a stab", weight: 2, grid: "x--- ---- ..o. ...." },
        { name: "the ands of one and two", weight: 1, grid: "..X. ..X. .... ..o." },
      ],
      busy: { from: 2.4, to: 3 },
      arrival: { level: 80, steps: 4 },
    },
  },

  // A held chord breathes a little before the next.
  hold: 0.95,

  // How a phrase is built: `a` is the section's figure, `b` and `c` this chorus's answers.
  // A jazz pianist is the least loop-like comper there is: the phrase opens on the
  // section's figure and is mostly answers after it, turning more often than a blues does.
  forms: [
    { weight: 3, bars: "a b a c" },
    { weight: 3, bars: "a b c a" },
    { weight: 2, bars: "a b c b" },
    { weight: 2, bars: "a a b c" },
    { weight: 2, bars: "a b a b" },
    { weight: 1, bars: "a b b a" },
    { weight: 1, bars: "a a b a" },
  ],
  candidates: 8,
};

export const jazzChords: ChordStyle = {
  idiom: "keys",
  kinds: { rootless },
  voicing: { low: "rootless", mid: "rootless", high: "rootless" },
  // One hand in the middle of the keyboard: nothing under E3 (X-B-02), the bottom of the
  // hand around C4 (ST-jazz-25, CH-19: 58 to 64), so the top is aimed at Bb4, a step under
  // the blues piano's C5. Led freely within a major third of that.
  register: { floor: 52, ceiling: 81, target: 70, reach: 4 },
  // The pad, for a meter the book is not written in (CH-54): the jazz waltz.
  plain: { length: 0.95, velocity: { beat: 74, offbeat: 80, restrike: 60 } },
  rhythm,
  // The hand leans into a change at the barline a quarter of the time when quiet, more as the
  // band gets louder (ST-jazz-41, CH-39: the added "and" of 4 at 25%, 40%, 45%). A change
  // inside the bar is always played early by a strike in the eighth before it, which ties
  // over and is not struck again on the beat (ST-jazz-42, CH-40). Where the hand does not
  // lean in, nothing is struck in that eighth (KF-B-27).
  anticipation: {
    barline: { low: 0.25, mid: 0.35, high: 0.45 },
    midBar: "tie",
    otherwise: "rest",
    stroke: "X",
    // A chord held on is still held when it is the V pushed on the "and" of 2 (CH-40: a
    // held chord stays held).
    held: true,
  },
  // Under a soloist: a breath is a dotted quarter, an empty one gets a stab an eighth long at
  // 92, what the figure already plays in a breath is 8 harder (ST-jazz-29, CH-71, X-C-41).
  // The hand stays in its working book however hot the band gets: louder is harder, not
  // busier, under a horn (gate 3, `listening.busiest`).
  listening: { breath: 6, answer: { level: 92, steps: 2 }, lift: 8, busiest: "mid" },
  // The final chord at 92, the button 12 harder (ST-jazz-48, X-C-40).
  ending: { velocity: 92, soft: 72, accent: 12 },
};
