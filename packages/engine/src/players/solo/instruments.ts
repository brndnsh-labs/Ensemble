// The instruments a soloist can be. Which one plays is the player's choice,
// so they live here and not in a style pack: a style only names its default.

import type { SoloInstrument, SoloStyle } from "./style.ts";

/**
 * A guitarist's slide into a note, as Brandon chose it from the slide study
 * (scripts/slide-study.ts, clips 3 and 7: "short slide sounds pretty good, and the one fret
 * slide is nice"): struck a fret or two away and stepped onto the note a fret at a time.
 * Two frets stand 0.0285 s each (clip 3: a thirty-second note at 132, on pitch at 0.057 s);
 * one fret stands 0.057 s (clip 7 at 132), so a slide of either length is on its note as
 * soon. Every guitar's hand: a slide is as common on steel and nylon strings as on an
 * electric's, and the style says how often. Every guitar's hand also hammers on and pulls
 * off (`hammers`): a note sounded on the string still ringing, without a stroke, as clips 8
 * and 10a drew it.
 */
const SLIDE = { fret: 0.0285, oneFret: 0.057 } as const;

/**
 * The fastest a run in double time may go on each instrument, in notes a second. Nobody here
 * can time a player, and no number is recalled: each is the fastest line the band's own parts
 * already ask of a hand that plays the same way, at the top of the style's tempo range, so a
 * burst never asks more of the player than the band does somewhere already.
 *
 * - The alto: disco's busiest line runs eight sixteenths together (ST-disco-23, `xxxx xxxx`), at
 *   disco's fastest, 136 (`packages/styles/src/disco/index.ts`). Funk's sixteenths at 126 (8.4)
 *   and jazz's eighths at 240 (8) are slower.
 * - A guitar picked with a plectrum: rock's sixteenth bursts (ST-rock-22, `x-x-xxxxx-x-x---`) at
 *   rock's fastest, 160 (`packages/styles/src/rock/index.ts`).
 * - The steel and nylon guitars: acoustic's busiest line has a sixteenth pair (`.xx-`) at
 *   acoustic's fastest, 120: a fingerpicked or flatpicked lead is asked no more than that.
 * - The vibraphone: two mallets by turns, as a drummer's two sticks: the band's fastest single
 *   strokes are rock's tom run in sixteenths (DR-79, `sixteenth run` in ST-rock-09) at 160. The
 *   blues, the vibraphone's own style, asks only 7.5 of it (its triplets at 150).
 */
const FASTEST = {
  alto: (136 / 60) * 4,
  plectrum: (160 / 60) * 4,
  fingers: (120 / 60) * 4,
  mallets: (160 / 60) * 4,
} as const;

export const SOLO_INSTRUMENTS: Readonly<Record<string, SoloInstrument>> = {
  // Three octaves from F3. Its solo voice sits an octave over middle C, above the piano's
  // hand; the bars ring by themselves, so it need not breathe. A bar's pitch does not move.
  vibraphone: {
    name: "Vibraphone",
    program: 11,
    range: [53, 89],
    home: 72,
    breath: null,
    bend: null,
    slide: null,
    hammers: false,
    shake: null,
    scoop: null,
    fall: null,
    fastest: FASTEST.mallets,
  },
  // The comfortable solo register, with the ends kept for climaxes (SO-01). It breathes:
  // eight seconds is a long phrase on one breath, and a breath takes half a second (Q-47).
  // What it does with a note's pitch is the clip Brandon chose of thirteen
  // (scripts/horn-study.ts, clip 9, "the player's choice"): the last note before a breath
  // shaken 30 cents either side, 5 times a second, from 0.4 s into the note and growing over
  // 0.6 s, on a note that sounds 0.7 s or more (the study's shortest shaken note, a dotted
  // quarter at 120: a turn and a half of the shake is heard); a note it arrives on scooped
  // from a half step under in 0.06 s; a phrase's last note let fall 6 semitones over half a
  // second (the study's beat at 120) after its full length, dying away as it drops.
  "alto-sax": {
    name: "Alto sax",
    program: 65,
    range: [53, 82],
    home: 67,
    breath: { lungs: 8, takes: 0.5 },
    bend: null,
    slide: null,
    hammers: false,
    shake: { depth: 30, rate: 5, after: 0.4, grows: 0.6, upward: false, on: "last", shortest: 0.7 },
    scoop: { below: 1, takes: 0.06 },
    fall: { semitones: 6, takes: 0.5 },
    fastest: FASTEST.alto,
  },
  // The lead guitar: an overdriven guitar's solo register, G3 to E6, at home on B4 (SO-01).
  // Its hand is the one Brandon's ear chose from nine (scripts/pitch-study.ts, clips 5 and
  // 4): a bend struck flat and pushed up to the note in a tenth of a second, and a wide
  // vibrato, the string pushed 60 cents sharp and let back five and a half times a second,
  // starting a third of a second into the note and growing over as long again.
  "driven-guitar": {
    name: "Overdriven guitar",
    program: 29,
    range: [55, 88],
    home: 71,
    breath: null,
    bend: { takes: 0.1 },
    slide: SLIDE,
    hammers: true,
    shake: { depth: 60, rate: 5.5, after: 0.35, grows: 0.3, upward: true, on: "held" },
    scoop: null,
    fall: null,
    fastest: FASTEST.plectrum,
  },
  // The clean electric guitar's solo register, G3 to D6, at home on A4 (SO-01): a lead behind
  // a singer (ST-neosoul-43). The overdriven guitar's hand: the same string, the same bend
  // and the same shake.
  "clean-guitar": {
    name: "Clean electric guitar",
    program: 27,
    range: [55, 86],
    home: 69,
    breath: null,
    bend: { takes: 0.1 },
    slide: SLIDE,
    hammers: true,
    shake: { depth: 60, rate: 5.5, after: 0.35, grows: 0.3, upward: true, on: "held" },
    scoop: null,
    fall: null,
    fastest: FASTEST.plectrum,
  },
  // The nylon-string guitar as a lead: E3 to A5, at home on F#4 (SO-01), the verse melody's
  // cousin (ST-acoustic-37). Its hand does not bend: a nylon string is not pushed up a whole
  // step (ST-acoustic-28); it slides as every guitar does, as often as the style says. A held note
  // is shaken as a classical hand shakes it, along the string and so either side of the pitch,
  // and narrowly: a fifth of a half step, where the electric guitar's pushed string goes 60
  // cents sharp. The numbers are a hand's, not an ear's: nobody has listened to them.
  "nylon-guitar": {
    name: "Nylon-string guitar",
    program: 24,
    range: [52, 81],
    home: 66,
    breath: null,
    bend: null,
    slide: SLIDE,
    hammers: true,
    shake: { depth: 20, rate: 5, after: 0.35, grows: 0.3, upward: false, on: "held" },
    scoop: null,
    fall: null,
    fastest: FASTEST.fingers,
  },
  // The steel-string acoustic guitar as a lead: the nylon guitar's register and its hand.
  // Heavier strings at higher tension than an electric's are not pushed up a whole step, and
  // the line is sung, not bent (ST-acoustic-28). The shake is the nylon's until an ear says
  // otherwise.
  "steel-guitar": {
    name: "Steel-string guitar",
    program: 25,
    range: [52, 81],
    home: 66,
    breath: null,
    bend: null,
    slide: SLIDE,
    hammers: true,
    shake: { depth: 20, rate: 5, after: 0.35, grows: 0.3, upward: false, on: "held" },
    scoop: null,
    fall: null,
    fastest: FASTEST.fingers,
  },
};

/** The name an instrument is listed under, for a note's `voice`. */
export function soloVoice(solo: SoloStyle): string {
  return solo.instrument in SOLO_INSTRUMENTS ? solo.instrument : Object.keys(SOLO_INSTRUMENTS)[0]!;
}
