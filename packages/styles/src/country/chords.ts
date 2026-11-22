// The country guitar: a steel-string guitar in open position, the "chick" of
// the boom-chick. It holds the open shape and strikes its top four strings:
// held with the bass in half notes when the band is quiet, a chick on 2 and 4
// choked after an eighth at the working level, the "boom-chicka" when hot.
// With no bassist the pick plays the boom itself on the shape's low strings,
// the root on 1 and the alternate bass on 3. A plain major I or IV rings its
// added 6th, the pedal steel's colour; a V never does. The comp anticipates
// nothing: the boom states the chord on the One (ST-country-06, ST-country-07,
// ST-country-09).

import type {
  Articulation,
  ChordStyle,
  CompFigure,
  RhythmBook,
  VoicingKind,
} from "@ensemble/engine";

/**
 * The chord as written, standing on its root, at the nut where it has a shape
 * there. A plain major triad on the I or the IV of a major key takes the major
 * 6th (C6 is x32210, G6 320000 on the top four strings, D6 xx0202); on the V, a
 * minor chord, a seventh chord or anything with no degree in the key it stays a
 * triad (ST-country-06).
 */
const open: VoicingKind = {
  position: "close",
  recipes: [
    { when: { family: ["power"] }, voices: ["R", "5"] },
    {
      when: { family: ["major"], lacks: ["7"], degrees: ["I", "IV"], mode: "major" },
      voices: ["R", "3", "5", "13"],
    },
    { when: { lacks: ["7"] }, voices: ["R", "3", "5", "T"] },
    { voices: ["R", "3", ["T", "5"], "7"] },
  ],
};

// ── the right hand ──────────────────────────────────────────────────────────
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. The hand
// swings down on every beat and up on every "and"; the guitar idiom reads the
// direction from the place, and an upstroke catches the top three strings.
//
//   h  the top four strings, held          c  the chick: the top four, choked after an eighth
//   C  the chick, leaned on                .  the hand passes
//   B  the pick on the shape's root        v  the pick on the alternate bass, the chord's fifth

const HAND: Articulation = {
  // Quiet: the top four strings, let ring with the bass's half notes.
  h: { level: 76, steps: 8, top: 4 },
  // The chick on 2 and 4 (ST-country-07): the top four strings, choked after an eighth.
  c: { level: 84, steps: 2, top: 4 },
  C: { level: 94, steps: 2, top: 4 },
  // With no bassist the pick takes the boom on the low strings (ST-country-07), as the
  // upright would: 100 then 92 (BA-51).
  B: { level: 92, steps: 4, pluck: ["bass"] },
  v: { level: 86, steps: 4, pluck: ["fifth"] },
};

/** A groove: one figure for the section, the same in every bar, and the same with no bassist but for the boom. */
const groove = (name: string, weight: number, grid: string, alone: string): CompFigure => ({
  name,
  weight,
  grid,
  alone,
  groove: true,
});

const rhythm: RhythmBook = {
  tiers: {
    // Quiet: held in half notes with the bass (ST-country-06).
    low: {
      draw: "quiet",
      articulation: HAND,
      // Under a soloist each is let ring a beat, not two: a hand that does not listen holds
      // nothing long under the line, where it could sit on the soloist's note.
      figures: [
        {
          ...groove("half notes", 1, "h------- h-------", "B---h--- v---h---"),
          soloing: "h---.... h---....",
        },
      ],
      answers: [],
      busy: { from: 2, to: 2 },
      arrival: { level: 76, steps: 8, top: 4 },
    },
    // The working level: the chick on 2 and 4, now and then a lighter lift on the "and" of 4
    // (ST-country-06, the piano's, carried over).
    mid: {
      draw: "working",
      articulation: HAND,
      figures: [
        groove("chick", 3, ".... C... .... C...", "B... C... v... C..."),
        groove("chick and lift", 1, ".... C... .... C.c.", "B... C... v... C.c."),
      ],
      answers: [],
      busy: { from: 2, to: 3 },
      arrival: { level: 84, steps: 2, top: 4 },
    },
    // Hot: the boom-chicka, the ands up and 2 and 4 leaned on (ST-country-06).
    high: {
      draw: "hot",
      articulation: HAND,
      figures: [groove("boom-chicka", 1, "..c. C.c. ..c. C.c.", "B.c. C.c. v.c. C.c.")],
      answers: [],
      busy: { from: 6, to: 6 },
      arrival: { level: 84, steps: 2, top: 4 },
    },
  },
  // A held chord rings nearly its whole length; a chick is choked by its own length.
  hold: 0.95,
  forms: [{ weight: 1, bars: "a a a a" }],
  candidates: 1,
};

export const countryChords: ChordStyle = {
  // Open position (CH-24), up to six strings, open strings on, every fretted note at or below
  // the 4th fret where the chord has such a shape, standing on its root. The strums take its
  // top four strings; the pick takes its low ones. An eighth pendulum; an upstroke catches
  // the top three strings and is 14 lighter (CH-27); steel strings roll 6 ms apart (CH-29).
  idiom: {
    instrument: "guitar",
    strings: 6,
    position: 1,
    skip: true,
    open: true,
    rootOnBottom: true,
    openPosition: 4,
    strum: { grid: "eighth", up: 3, lighter: 14, roll: 6 },
  },
  kinds: { open },
  voicing: { low: "open", mid: "open", high: "open" },
  // The guitar's low E to C5, the top aimed at E4.
  register: { floor: 40, ceiling: 72, target: 64, reach: 4 },
  // Any meter but 4/4: the chick on every pulse but the first, which is the bass's (the
  // waltz's boom-chick-chick is its own build).
  plain: { length: 0.5, pulse: "offbeats", velocity: { beat: 84, offbeat: 84, restrike: 84 } },
  rhythm,
  // None from the comp: the boom states the chord on the One (ST-country-09).
  anticipation: {
    barline: { low: 0, mid: 0, high: 0 },
    midBar: "wait",
    otherwise: "stay",
    stroke: "c",
  },
  // A groove keeps its figure under a soloist (CH-68): the hand plays as if nobody were
  // soloing, so its strokes are short there (the quiet half notes, below).
  listening: null,
  ending: { velocity: 92, soft: 72, accent: 12 },
};
