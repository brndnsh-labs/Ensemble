// The blues piano: one hand, rootless, in the middle of the keyboard. The
// bass has the root, so the hand plays the 3rd and b7 that say what the chord
// is, with the 9th and 13th that make it a blues piano and not a rock one
// (ST-blues-29, CH-06).

import type { ChordStyle, VoicingKind } from "@ensemble/engine";

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

export const bluesChords: ChordStyle = {
  idiom: "keys",
  kinds: { rootless, close },
  // Rootless at every level; the pump's close position is asked for by the rhythm.
  voicing: { low: "rootless", mid: "rootless", high: "rootless" },
  // One hand, nothing under E3 (ST-blues-29, X-B-02), up to C6, the top of the keyboard
  // comp's slot (X-B-01), the top voice aimed at C5 (CH-16).
  register: { floor: 52, ceiling: 84, target: 72 },
  // The pad that breathes: held 95% of the way to the next strike, 74 on a beat and 80
  // off it (ST-blues-31, low). A chord carried into the next bar is struck again at about
  // four fifths of that, as a rock keyboard re-strikes a held chord (CH-48: 64 against 80).
  plain: { length: 0.95, velocity: { beat: 74, offbeat: 80, restrike: 60 } },
  // The final chord at 92, 72 when the ending is soft, a button 12 harder (CH-74, EN-17).
  ending: { velocity: 92, soft: 72, accent: 12 },
};
