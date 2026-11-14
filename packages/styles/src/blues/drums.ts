// The blues drummer: a Chicago shuffle. Kick on 1 and 3, backbeat on 2 and 4,
// and a cymbal playing every swung eighth.
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. The band
// swings eighths into a hard triplet, so in each beat the first character is
// the beat, the second (the "e") is the middle note of the triplet, the third
// is the swung "and", and the fourth (the "a") is never played: it would land
// between triplets and flam (DR-40). The time uses only beats and "and"s; the
// middle of the triplet belongs to the fills.
//
// X accent, x normal, o soft, g ghost.

import type { DrumStyle } from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

/** One and three, nothing else. */
const KICK_PLAIN = { kick: "x... .... x... ...." };
/** One and three, and a soft kick on the "and" of 4 that kicks the band into the next bar. */
const KICK_PUSHED = { kick: "x... .... x... ..o." };

/** Two and four, cracked. */
const BACKBEAT = { snare: ".... X... .... X..." };

/** On the second bar of every pair the hat breathes open on the "and" of 4: the turnaround. */
const BREATH = {
  bars: { phraseBars: [2, 4, 6], playing: "closedHat" },
  open: { openHat: ".... .... .... ..o." },
} as const;

// ── fills ───────────────────────────────────────────────────────────────────
// Whole shapes, written to end on the "and" of 4, the last stroke the loudest
// (DR-18). A fill of a beat or less keeps the backbeat on 4: without it the
// fill sounds like a mistake (DR-46). Shapes with a note on the middle of the
// triplet are the triplet fills; the rest are swung eighths.

/** The smallest fill there is: one snare on the "and" of 4. */
const PICKUP = { snare: "X." };
/** The same pickup, low: one note on the floor tom. */
const PICKUP_FLOOR = { lowTom: "X." };
/** Both hands flat, snare and floor tom together. */
const PICKUP_BOTH = { snare: "X.", lowTom: "X." };

/** "Four, AND": the backbeat, then the "and" harder. */
const FOUR_AND = { snare: "x.X." };
/** "DA-da-DA": a snare triplet on 4. */
const TRIPLET = { snare: "xoX." };
/** "Crack, boom": the backbeat, then the floor tom on the "and". */
const CRACK_BOOM = { snare: "x...", lowTom: "..X." };
/** "DA-da-BOOM": the triplet falls onto the floor tom. */
const TRIPLET_BOOM = { snare: "xo..", lowTom: "..X." };
/** The backbeat, then snare and floor tom together on the "and". */
const FOUR_AND_BOTH = { snare: "x.X.", lowTom: "..X." };

/** Quarter notes on the kick under a two-beat fill, so it never floats (DR-19). */
const KICK_UNDER = "x... x...";

/** Down the kit in swung eighths from 3: snare, high, mid, floor. */
const RUN_EIGHTHS = {
  snare: "x... ....",
  highTom: "..o. ....",
  midTom: ".... x...",
  lowTom: ".... ..X.",
  kick: KICK_UNDER,
};
/** The same run with a triplet at the top of each beat: "da-da-dum, da-da-DUM". */
const RUN_TRIPLETS = {
  snare: "xo.. ....",
  highTom: "..o. ....",
  midTom: ".... xo..",
  lowTom: ".... ..X.",
  kick: KICK_UNDER,
};
/** Swung eighths on the snare from 3, growing: "three-and-four-AND". The feet keep the groove. */
const SNARE_EIGHTHS = { snare: "x.o. x.X." };
/** Two beats of snare triplets, from soft to an accent. */
const SNARE_TRIPLETS = { snare: "oox. xxX.", kick: KICK_UNDER };

/** Six notes round the kit, a triplet a beat: snare-snare-high, mid-floor-FLOOR. */
const ROUND_THE_KIT = {
  snare: "xo.. ....",
  highTom: "..x. ....",
  midTom: ".... x...",
  lowTom: ".... .xX.",
  kick: KICK_UNDER,
};
/** Both hands flat on snare and floor tom, four swung eighths getting louder. */
const FLAT_HANDED = {
  snare: "o.x. x.X.",
  lowTom: "o.x. x.X.",
  kick: KICK_UNDER,
};
/** Off the snare altogether: high, high, mid, floor in swung eighths. */
const TOMS_ONLY = {
  highTom: "x.x. ....",
  midTom: ".... x...",
  lowTom: ".... ..X.",
  kick: KICK_UNDER,
};
/** Snare triplets that build for two beats and land on the floor tom. */
const TRIPLETS_TO_FLOOR = {
  snare: "oox. xx..",
  lowTom: ".... ..X.",
  kick: KICK_UNDER,
};

export const bluesDrums: DrumStyle = {
  grooves: {
    // Quiet: a soft hat with the "and"s at half weight, a plain backbeat, mostly a plain kick.
    low: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: "o.g. o.g. o.g. o.g." } }],
      },
      {
        id: "kick",
        hold: "section",
        options: [
          { weight: 3, lines: KICK_PLAIN },
          { weight: 1, lines: KICK_PUSHED },
        ],
      },
      // A very quiet backbeat changes instrument, not just level (DR-107).
      {
        id: "snare",
        hold: "section",
        when: { energyFrom: 0.3 },
        options: [{ weight: 1, lines: { snare: ".... x... .... x..." } }],
      },
      {
        id: "rim",
        hold: "section",
        when: { energyBelow: 0.3 },
        options: [{ weight: 1, lines: { crossStick: ".... x... .... x..." } }],
      },
    ],

    // The working shuffle: a firm hat, the backbeat cracked, the kick more often pushed than not.
    mid: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: "x.o. x.o. x.o. x.o." } }],
      },
      {
        id: "kick",
        hold: "section",
        options: [
          { weight: 2, lines: KICK_PLAIN },
          { weight: 3, lines: KICK_PUSHED },
        ],
      },
      {
        id: "snare",
        hold: "section",
        options: [
          { weight: 7, lines: BACKBEAT },
          // A ghost on the "and" of 4, loping into the one.
          { weight: 3, lines: { snare: ".... X... .... X.g." } },
        ],
      },
      {
        id: "breath",
        hold: "section",
        when: BREATH.bars,
        options: [
          { weight: 65, lines: {} },
          { weight: 35, lines: BREATH.open },
        ],
      },
    ],

    // Hot: the beats accented, the kick always pushed, and the left hand and the foot fill in.
    high: [
      // Hat or ride, chosen for one time through the section, so a hot chorus commits to its
      // cymbal and some hot choruses ride (DR-45, DR-109). On the ride the foot closes the hat
      // on 2 and 4.
      {
        id: "time",
        hold: "pass",
        options: [
          { weight: 1, lines: { closedHat: "X.o. X.o. X.o. X.o." } },
          { weight: 1, lines: { ride: "x.o. x.o. x.o. x.o.", pedalHat: ".... x... .... x..." } },
        ],
      },
      { id: "kick", hold: "section", options: [{ weight: 1, lines: KICK_PUSHED }] },
      // Feathered 2 and 4: a four-on-the-floor that is felt, not heard.
      {
        id: "feather",
        hold: "section",
        options: [
          { weight: 2, lines: {} },
          { weight: 3, lines: { kick: ".... g... .... g..." } },
        ],
      },
      {
        id: "snare",
        hold: "section",
        options: [
          { weight: 2, lines: BACKBEAT },
          // Ghosts on the "and"s of 2 and 4, rolling into 3 and 1.
          { weight: 2, lines: { snare: ".... X.g. .... X.g." } },
          // Texas shuffle: a light snare on every swung "and" under the backbeat.
          { weight: 1, lines: { snare: "..g. X.g. ..g. X.g." } },
        ],
      },
      {
        id: "breath",
        hold: "section",
        when: BREATH.bars,
        options: [
          { weight: 2, lines: {} },
          { weight: 3, lines: BREATH.open },
        ],
      },
    ],
  },

  // The shuffle is carried on the hat or the ride; a crash on an arrival takes that hand.
  timekeepers: ["closedHat", "ride"],

  // The lope: the cymbal's "and" of 2 and "and" of 4 are played lighter, so the shuffle
  // circles in two beats instead of ticking evenly (DR-43).
  touches: [{ voices: ["closedHat", "ride"], steps: [6, 14], scale: 0.8 }],

  fills: {
    // A quiet blues plays straight through its phrase ends.
    length: {
      phrase: { low: 0, mid: 2, high: 4 },
      section: { low: 2, mid: 4, high: 8 },
    },
    // Inside a section the drummer only speaks up: the snare, or one note on the floor tom.
    phrase: [
      { weight: 3, lines: PICKUP },
      { weight: 1, lines: PICKUP_FLOOR },
      { weight: 2, lines: FOUR_AND },
      { weight: 2, lines: TRIPLET },
      { weight: 1, lines: CRACK_BOOM },
    ],
    // At the end of a section he may leave the snare, and with two beats he goes down the kit.
    section: [
      { weight: 3, lines: PICKUP },
      { weight: 1, lines: PICKUP_FLOOR },
      { weight: 2, lines: FOUR_AND },
      { weight: 2, lines: TRIPLET },
      { weight: 1, lines: CRACK_BOOM },
      { weight: 1, lines: TRIPLET_BOOM },
      { weight: 2, lines: RUN_EIGHTHS },
      { weight: 2, lines: RUN_TRIPLETS },
      { weight: 1, lines: SNARE_EIGHTHS },
      { weight: 1, lines: SNARE_TRIPLETS },
    ],
    // Into a new chorus, a bigger section, or the last hit: both hands, the floor tom, the whole kit.
    top: [
      { weight: 2, lines: PICKUP },
      { weight: 2, lines: PICKUP_BOTH },
      { weight: 1, lines: PICKUP_FLOOR },
      { weight: 2, lines: TRIPLET },
      { weight: 2, lines: TRIPLET_BOOM },
      { weight: 1, lines: FOUR_AND_BOTH },
      { weight: 1, lines: FOUR_AND },
      { weight: 2, lines: ROUND_THE_KIT },
      { weight: 2, lines: FLAT_HANDED },
      { weight: 1, lines: TOMS_ONLY },
      { weight: 1, lines: TRIPLETS_TO_FLOOR },
    ],
  },

  // Crash and kick together where the last chord lands, both accented, and no snare.
  ending: { strike: { crash: "X", kick: "X" } },
};
