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

// ── in six ──────────────────────────────────────────────────────────────────
// A bar of 6/4, six beats in two threes: twenty-four sixteenths, grouped by
// beat. The comp of a waltz in six is built on its two strong beats, 1 and 4,
// and the eighth before each (the "and" of 3, the "and" of 6), with the
// waltz's own dotted-quarter cell (1 and the "and" of 2) for colour: one to
// four chords a bar, most of them on a strong beat or leaning into one
// (AU-94; the old band struck four bars in five on sixteenths, "thick mush").
// None of this comes from the notes, which have no book for six: it is the
// 4/4 book's cells laid over two threes.

const rhythmInSix: RhythmBook = {
  tiers: {
    // Quiet: the chord laid in and held, on one strong beat or both.
    low: {
      draw: "quiet",
      articulation: STAB,
      figures: [
        { name: "one, held", weight: 3, grid: "x--- ---- ---- ---- ---- ----" },
        { name: "one and four, held", weight: 3, grid: "x--- ---- ---- x--- ---- ----" },
        // Beat 1, then the second three pushed: the "and" of 3, held.
        { name: "one, and four pushed", weight: 2, grid: "x... .... ..X- ---- ---- ----" },
      ],
      answers: [
        // A bar left to the bass and the cymbal (ST-jazz-28).
        { name: "rest", weight: 3, grid: ".... .... .... .... .... ...." },
        { name: "four, held", weight: 2, grid: ".... .... .... x--- ---- ----" },
        { name: "one, short", weight: 1, grid: "x... .... .... .... .... ...." },
      ],
      busy: { from: 1, to: 1.5 },
      arrival: { level: 74, steps: 24 },
    },

    // The working level: two or three stabs, on the strong beats and around them.
    mid: {
      draw: "working",
      articulation: STAB,
      figures: [
        // The waltz's cell and the second strong beat: 1, the "and" of 2, 4 held.
        { name: "waltz, and four", weight: 3, grid: "x... ..X. .... x--- ---- ...." },
        // The two strong beats.
        { name: "one and four", weight: 3, grid: "x... .... .... X... .... ...." },
        // Beat 1, and the second three pushed and held.
        { name: "one, and four pushed", weight: 2, grid: "x... .... ..X- ---- ---- ...." },
        // Round the strong beats: the "and" of 1, beat 3, and the "and" of 4 held.
        { name: "round the beats", weight: 1, grid: "..X. .... x... ..X- ---- ...." },
      ],
      answers: [
        { name: "four, held", weight: 3, grid: ".... .... .... x--- ---- ----" },
        { name: "one, held", weight: 2, grid: "x--- ---- ---- ---- ---- ----" },
        // The waltz's cell alone, the "and" of 2 held through the bar's middle.
        { name: "waltz, held", weight: 2, grid: "x... ..X- ---- ---- .... ...." },
        // Both strong beats pushed.
        { name: "both pushed", weight: 1, grid: ".... .... ..X. .... .... ..X." },
      ],
      busy: { from: 2, to: 3 },
      arrival: { level: 78, steps: 4 },
    },

    // Hot, with the band to itself: the same cells with one more stab, leaning into a
    // strong beat.
    high: {
      draw: "working",
      articulation: { ...STAB, o: { level: 84, steps: 1.5 } },
      figures: [
        { name: "waltz, and four", weight: 3, grid: "x... ..X. .... x... .... ..o." },
        { name: "one and four", weight: 3, grid: "x... .... ..o. X... .... ...." },
        { name: "one, and four pushed", weight: 2, grid: "x... .... ..X- ---- ..o. ...." },
        { name: "round the beats", weight: 1, grid: "..X. .... x... ..X. .... x..." },
      ],
      answers: [
        { name: "four, and its waltz", weight: 3, grid: ".... .... .... x... ..X. ...." },
        { name: "waltz, held", weight: 2, grid: "x... ..X- ---- ---- .... ...." },
        { name: "one held, and four pushed", weight: 2, grid: "x--- ---- ..o. .... .... ...." },
        { name: "both pushed", weight: 1, grid: ".... .... ..X. .... .... ..X." },
      ],
      busy: { from: 2.5, to: 3.5 },
      arrival: { level: 80, steps: 4 },
    },
  },
  hold: rhythm.hold,
  forms: rhythm.forms,
  candidates: rhythm.candidates,
};

// ── in twelve and in six-eight ──────────────────────────────────────────────
// A bar of dotted pulses: twenty-four sixteenths to a bar of twelve, twelve
// to a bar of six, grouped by pulse, a pulse's eighths its first, third and
// fifth characters. Nothing swings, and nothing is struck between the eighths.
// The cells are four's said in pulses (AU-97): a beat is a pulse and an "and"
// the pulse's last eighth, the eighth that leans into the next pulse. So the
// Charleston in twelve is 1 and the last eighth of 2, pushed into 3; and the
// eighth before a change still plays the chord coming. The comp of a waltz in
// six is the bar's model for six-eight (AU-94: one to four chords a bar, most
// on a pulse or the eighth before one).

/** Four's book said in pulses: twelve, the ballad. A tier's figures, then its answers. */
const rhythmInTwelve: RhythmBook = {
  tiers: {
    // Quiet: half the chords laid in and held, and a bar whose chord is held over may be left
    // alone (ST-jazz-27, ST-jazz-28).
    low: {
      draw: "quiet",
      articulation: STAB,
      figures: [
        { name: "charleston, held", weight: 4, grid: "x..... ....X- ------ ------" },
        { name: "one, held", weight: 3, grid: "x----- ------ ------ ------" },
        { name: "and of two, held", weight: 2, grid: "...... ....X- ------ ------" },
        { name: "reverse charleston, held", weight: 2, grid: "....X. ...... x----- ------" },
      ],
      answers: [
        { name: "rest", weight: 3, grid: "...... ...... ...... ......" },
        { name: "charleston", weight: 2, grid: "x..... ....X. ...... ......" },
        { name: "and of two", weight: 2, grid: "...... ....X. ...... ......" },
      ],
      busy: { from: 1, to: 1.5 },
      arrival: { level: 74, steps: 24 },
    },
    // The working level: stabs round the pulses, a quarter of them held (ST-jazz-26, 27), and
    // one answer of the ballad's own, the triplet leaning into the One.
    mid: {
      draw: "working",
      articulation: STAB,
      figures: [
        { name: "charleston", weight: 4, grid: "x..... ....X. ...... ......" },
        { name: "reverse charleston", weight: 2, grid: "....X. ...... x----- ------" },
        { name: "two and the and of three", weight: 2, grid: "...... x..... ....X- ------" },
        { name: "the ands of two and four", weight: 2, grid: "...... ....X. ...... ....X." },
      ],
      answers: [
        { name: "and of two", weight: 3, grid: "...... ....X- ------ ------" },
        { name: "charleston, held", weight: 3, grid: "x..... ....X- ------ ------" },
        { name: "one, held", weight: 2, grid: "x----- ------ ------ ------" },
        { name: "and of two, short", weight: 1, grid: "...... ....X. ...... ......" },
        { name: "the ands of one and two", weight: 1, grid: "....X. ....X. ...... ......" },
        { name: "the triplet into the One", weight: 1, grid: "x----- ------ ...... ..x.X." },
      ],
      busy: { from: 2.1, to: 2.6 },
      arrival: { level: 78, steps: 6 },
    },
    // Hot, with the band to itself: the same cells, and in many bars one more stab leaning into
    // 4 or into the One (ST-jazz-27).
    high: {
      draw: "working",
      articulation: { ...STAB, o: { level: 84, steps: 1.5 } },
      figures: [
        { name: "charleston", weight: 4, grid: "x..... ....X. ...... ....o." },
        { name: "reverse charleston", weight: 2, grid: "....X. ...... x..... ....o." },
        { name: "two and the and of three", weight: 2, grid: "...... x..... ....X. ......" },
        { name: "the ands of two and four", weight: 2, grid: "...... ....X. ...... ....X." },
      ],
      answers: [
        { name: "and of two, and of three", weight: 3, grid: "...... ....X. ....o. ......" },
        { name: "charleston, held", weight: 2, grid: "x..... ....X- ------ ------" },
        { name: "one held, and a stab", weight: 2, grid: "x----- ------ ....o. ......" },
        { name: "the ands of one and two", weight: 1, grid: "....X. ....X. ...... ....o." },
        { name: "the triplet into three", weight: 1, grid: "x..... ..o.X. ...... ......" },
      ],
      busy: { from: 2.4, to: 3 },
      arrival: { level: 80, steps: 6 },
    },
  },
  hold: rhythm.hold,
  forms: rhythm.forms,
  candidates: rhythm.candidates,
};

/**
 * Six-eight: the strong pulse and its answer, and the eighth before each (the last eighth of
 * the first pulse pushes the second; the last of the bar pushes the One).
 */
const rhythmInSixEight: RhythmBook = {
  tiers: {
    // Quiet: laid in and held, on the One, or pushed into the second pulse.
    low: {
      draw: "quiet",
      articulation: STAB,
      figures: [
        { name: "one, held", weight: 3, grid: "x----- ------" },
        { name: "one, and two pushed", weight: 3, grid: "x..... ....X-" },
        { name: "two pushed, held", weight: 2, grid: "....X- ------" },
      ],
      answers: [
        { name: "rest", weight: 3, grid: "...... ......" },
        { name: "two, held", weight: 2, grid: "...... x-----" },
        { name: "one, short", weight: 1, grid: "x..... ......" },
      ],
      busy: { from: 0.8, to: 1.3 },
      arrival: { level: 74, steps: 12 },
    },
    // The working level: two stabs, on the pulses and round them.
    mid: {
      draw: "working",
      articulation: STAB,
      figures: [
        // The One, and the second pulse pushed: the Charleston of a bar of two.
        { name: "charleston", weight: 4, grid: "x...X. ......" },
        { name: "one and two", weight: 3, grid: "x..... X....." },
        { name: "two, and into the One", weight: 2, grid: "...... x...X." },
        { name: "both pushed", weight: 2, grid: "....X. ....X." },
      ],
      answers: [
        { name: "two pushed, held", weight: 3, grid: "....X- ------" },
        { name: "one, held", weight: 2, grid: "x----- ------" },
        { name: "two, held", weight: 2, grid: "...... x-----" },
        { name: "two pushed, short", weight: 1, grid: "....X. ......" },
      ],
      busy: { from: 1.6, to: 2.2 },
      arrival: { level: 78, steps: 6 },
    },
    // Hot, with the band to itself: one more stab leaning into a pulse.
    high: {
      draw: "working",
      articulation: { ...STAB, o: { level: 84, steps: 1.5 } },
      figures: [
        { name: "charleston", weight: 4, grid: "x...X. ....o." },
        { name: "one and two", weight: 3, grid: "x..... X...o." },
        { name: "two, and into the One", weight: 2, grid: "....o. x...X." },
        { name: "both pushed", weight: 2, grid: "....X. ....X." },
      ],
      answers: [
        { name: "charleston, held", weight: 3, grid: "x...X- ------" },
        { name: "two pushed, and into the One", weight: 2, grid: "....X. ....o." },
        { name: "one held, and a stab", weight: 2, grid: "x----- ....o." },
      ],
      busy: { from: 2, to: 2.8 },
      arrival: { level: 80, steps: 6 },
    },
  },
  hold: rhythm.hold,
  forms: rhythm.forms,
  candidates: rhythm.candidates,
};

// ── in three: the jazz waltz ────────────────────────────────────────────────
// A bar of 3/4: twelve sixteenths grouped by beat, swung as four is, so only a
// beat's first and third characters are struck (ST-jazz-06). Every figure is
// one the study read from a published transcription (`prompts/jazz-waltz-study.md`,
// F1 to F12: Wynton Kelly comping on Miles Davis's "Someday My Prince Will Come",
// 1961, as Pamies Rodríguez transcribed it, 2021; the two off-beats as Josh Walsh
// teaches them). What no source gives (a velocity, a length, a weight) is jazz's
// own touch, carried from its six-eight book (a bar of six eighths too) and from four.
// Behind a soloist the hand leaves beat 1 to the bass more often than it plays it,
// about two strikes a bar (study 1.1, 4.4); the working book is where it stays then
// (`listening.busiest`), sparse under the line and answering in the breaths.

const rhythmInThree: RhythmBook = {
  tiers: {
    // Quiet: one chord laid in and held, on 1, on the "and" of 1, or on 2. A bar may be left
    // to the bass and the ride, as in every jazz book (ST-jazz-28), less often than there: no
    // bar of Kelly's is empty (study 1.1).
    low: {
      draw: "quiet",
      articulation: STAB,
      figures: [
        // F4: one chord laid in and held through the bar (Kelly's bridge and arrivals, 1.3).
        { name: "one, held", weight: 3, grid: "x--- ---- ----" },
        // F5: the "and" of 1, held to the barline (Kelly bars 61-63, the tension released).
        { name: "and of one, held", weight: 3, grid: "..X- ---- ----" },
        // F7: beat 2, held (Kelly bars 76, 78).
        { name: "two, held", weight: 2, grid: ".... x--- ----" },
      ],
      answers: [
        // ST-jazz-28, the style's own: a bar whose chord is held over is not struck again.
        { name: "rest", weight: 2, grid: ".... .... ...." },
      ],
      // Six-eight's: a bar of six eighths.
      busy: { from: 0.8, to: 1.3 },
      arrival: { level: 74, steps: 12 },
    },

    // The working level: the two off-beats and their mixes, 1 and 3, the dotted-quarter cell,
    // beat 2 held, and Kelly's bars that land on 2 and on 3 (80, 81, 83). A section's own figure
    // is a two-strike cell; the one-strike cells are answers. The weights spread the strikes
    // over the bar as Kelly's 16 bars under Davis do (study 1.1: each eighth struck in 31% to
    // 44% of them), measured under a soloist over 320 takes: each eighth in 24% to 46% of the
    // working bars, a bar of one strike or none 22% (Kelly's 4 of 16). The off-beats and the
    // dotted-quarter cell had led, and left beat 2 in 6% of the bars and the "and" of 2 in 68%.
    mid: {
      draw: "working",
      articulation: STAB,
      figures: [
        // F6: the "and" of 1 and the "and" of 2, short (Kelly bar 79; Walsh's two up-beats).
        { name: "the ands of one and two", weight: 3, grid: "..X. ..X. ...." },
        // F2: 1 held a dotted quarter, then the "and" of 2 short (Kelly bars 37, 77, 93-99).
        { name: "the dotted quarter", weight: 2, grid: "x--- --X. ...." },
        // F8: 1 and 3, short (Kelly bars 74, 82).
        { name: "one and three", weight: 4, grid: "x... .... x..." },
        // Kelly bar 81: 2 (accented in the source) and its "and", short.
        { name: "two and its and", weight: 3, grid: ".... x.X. ...." },
      ],
      answers: [
        // F9: the "and" of 2 alone, short (Kelly bar 73; Walsh's second rhythm).
        { name: "and of two", weight: 2, grid: ".... ..X. ...." },
        // F6's mix: the "and" of 1 alone (Walsh: "sometimes hitting the and-of-one, sometimes
        // the and-of-two").
        { name: "and of one", weight: 2, grid: "..X. .... ...." },
        // F7: beat 2, held (Kelly bars 76, 78).
        { name: "two, held", weight: 3, grid: ".... x--- ----" },
        // Kelly bar 80: 1 held a half note, then 3 short.
        { name: "one held, and three", weight: 3, grid: "x--- ---- x..." },
        // Kelly bar 83: the "and" of 1 held to 3, and 3 held.
        { name: "and of one held, and three held", weight: 2, grid: "..X- ---- x---" },
      ],
      // F1, the hemiola: three short chords over two bars, a chord every two beats (Kelly
      // behind the melody of the head's A sections, bars 38-43 and 53-60, 6 to 8 bars at a time,
      // and stopped at the section's end; never under the soloist, study 2.1). A whole phrase
      // now and then: about one in five with the band to itself, the engineer's call (no
      // source gives a rate). Each chord the style's stab.
      twoBars: {
        figures: [
          { name: "the hemiola", weight: 2, groove: true, grid: "x... .... x... .... x... ...." },
          // The other phase (Kelly bars 53-60, starting `. . x . . . | x . . . x .`): the
          // chord on 1 left to the bass in the run's first bar.
          {
            name: "the hemiola, from two",
            weight: 1,
            groove: true,
            grid: ".... x... .... x... .... x...",
          },
        ],
        chance: 0.28,
        // Six to eight bars at a time, released at the section's end (study 2.1).
        longest: 8,
        crossesSections: false,
      },
      // Two a bar through the level (Kelly behind Davis: 1.9 a bar, study 1.1), so that a bar
      // laid out under the line to one strike counts as thinned (the critic's floor is the aim
      // rounded down): six-eight's 1.6 to 2.2 left 45% of the bars under a solo thin.
      busy: { from: 2, to: 2.4 },
      arrival: { level: 78, steps: 4 },
    },

    // Hot, with the band to itself: the working cells grown, the dotted-quarter cell and its
    // variants leading (a draw of its own: the working level's figures are weighted for the
    // bar under a soloist, which hot never reads), and
    // where a phrase ends on the dotted-quarter cell, the denser bar Kelly plays at the end of
    // a phrase (F12, study 4.2: "dense voicings to emphasize the end of the 8 bar phrase").
    high: {
      draw: "hot",
      articulation: STAB,
      figures: [
        // F6 with the "and" of 3 (Kelly bar 72: all three "ands", short).
        { name: "the ands of one, two and three", weight: 4, grid: "..X. ..X. ..X." },
        // F2's variant, the "and" of 3 accented after it (Kelly bar 96).
        {
          name: "the dotted quarter, and the and of three",
          weight: 3,
          grid: "x--- --X. ..X.",
          turn: "..X. x.X. ..X.",
        },
        // F3: two dotted quarters, both held (Kelly bar 98, the peak of the build).
        { name: "two dotted quarters", weight: 2, grid: "x--- --X- ----" },
      ],
      answers: [
        // F2 (Kelly bars 93-99), turned at a phrase's end as above (F12, Kelly bar 75).
        { name: "the dotted quarter", weight: 3, grid: "x--- --X. ....", turn: "..X. x.X. ..X." },
        // F6, F8, F9: the working figures.
        { name: "the ands of one and two", weight: 2, grid: "..X. ..X. ...." },
        { name: "one and three", weight: 2, grid: "x... .... x..." },
        { name: "and of two", weight: 1, grid: ".... ..X. ...." },
      ],
      // Six-eight's.
      busy: { from: 2, to: 2.8 },
      arrival: { level: 80, steps: 4 },
    },
  },
  hold: rhythm.hold,
  forms: rhythm.forms,
  candidates: rhythm.candidates,
};

export const jazzChords: ChordStyle = {
  idiom: "keys",
  kinds: { rootless },
  voicing: { low: "rootless", mid: "rootless", high: "rootless" },
  // One hand in the middle of the keyboard: nothing under E3 (X-B-02), the bottom of the
  // hand around C4 (ST-jazz-25, CH-19: 58 to 64), so the top is aimed at Bb4, a step under
  // the blues piano's C5. Led freely within a major third of that.
  register: { floor: 52, ceiling: 81, target: 70, reach: 4 },
  // The pad, for a meter the book is not written in (CH-54): 5/4, 7/8, 9/8.
  plain: { length: 0.95, velocity: { beat: 74, offbeat: 80, restrike: 60 } },
  rhythm,
  meters: {
    "6/4": rhythmInSix,
    "12/8": rhythmInTwelve,
    "6/8": rhythmInSixEight,
    "3/4": rhythmInThree,
  },
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
