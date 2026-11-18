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

import type { DrumStyle, DrumTime } from "@ensemble/engine";

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

// ── in twelve ───────────────────────────────────────────────────────────────
// The slow blues. A bar of 12/8 is four slow beats of three eighths each:
// twenty-four sixteenths, written in sixes, a beat to a group, and only its
// three eighths (the first, third and fifth character) are ever struck.
// Nothing swings: the three eighths are the triplet the shuffle swings to.
//
// What the shuffle cannot say is the triplet's middle note, and that is the
// slow blues: the cymbal plays all three eighths of every beat, the beat
// leaned on. The kick is still on 1 and 3 and the backbeat on 2 and 4 (the
// same rule as in four, said in beats: AU-97). Quiet, the cymbal goes back to
// the shuffle's two notes a beat and the drums thin out (AU-96); the kick and
// the snare are never on the eighths between the beats, but for the kick's
// push into the One and ghosts.

/** One and three. */
const TWELVE_KICK_PLAIN = { kick: "x..... ...... x..... ......" };
/** One and three, and a soft kick on the last eighth, into the next bar. */
const TWELVE_KICK_PUSHED = { kick: "x..... ...... x..... ....o." };
/** Two and four, cracked. */
const TWELVE_BACKBEAT = { snare: "...... X..... ...... X....." };
/** The triplets: every eighth, the beat leaned on. */
const TRIPLETS = "x.o.o. x.o.o. x.o.o. x.o.o.";

const TWELVE_BREATH = {
  bars: { phraseBars: [2, 4, 6], playing: "closedHat" },
  open: { openHat: "...... ...... ...... ....o." },
} as const;

// Fills in twelve. A pickup is the bar's last eighth, as in four. A beat's worth is its
// three eighths; two beats go down the kit. Each ends on the last eighth, its loudest.

/** "DA-da-DA": the triplet on 4. */
const TWELVE_TRIPLET = { snare: "x.o.X." };
/** "Four, AND": the backbeat, then the last eighth harder. */
const TWELVE_FOUR_AND = { snare: "x...X." };
/** "Crack, boom": the backbeat, then the floor tom. */
const TWELVE_CRACK_BOOM = { snare: "x.....", lowTom: "....X." };
/** "DA-da-BOOM". */
const TWELVE_TRIPLET_BOOM = { snare: "x.o...", lowTom: "....X." };
/** The backbeat, then both hands on the last eighth. */
const TWELVE_FOUR_AND_BOTH = { snare: "x...X.", lowTom: "....X." };

/** The kick on beats 3 and 4 under a two-beat fill (DR-19). */
const TWELVE_KICK_UNDER = "x..... x.....";
/** Down the kit a triplet a beat: snare-snare-high, mid-mid-floor. */
const TWELVE_RUN_TRIPLETS = {
  snare: "x.o... ......",
  highTom: "....o. ......",
  midTom: "...... x.o...",
  lowTom: "...... ....X.",
  kick: TWELVE_KICK_UNDER,
};
/** The same run in the shuffle's eighths: snare, high, mid, floor. */
const TWELVE_RUN = {
  snare: "x..... ......",
  highTom: "....o. ......",
  midTom: "...... x.....",
  lowTom: "...... ....X.",
  kick: TWELVE_KICK_UNDER,
};
/** Two beats of snare triplets, growing. The feet keep the groove. */
const TWELVE_SNARE_TRIPLETS = { snare: "o.o.x. x.x.X.", kick: TWELVE_KICK_UNDER };
/** The snare on the beat and its last eighth, twice, growing. */
const TWELVE_SNARE_SHUFFLE = { snare: "x...o. x...X." };
/** Six notes round the kit. */
const TWELVE_ROUND_THE_KIT = {
  snare: "x.o... ......",
  highTom: "....x. ......",
  midTom: "...... x.....",
  lowTom: "...... ..x.X.",
  kick: TWELVE_KICK_UNDER,
};
/** Both hands flat on snare and floor tom. */
const TWELVE_FLAT_HANDED = {
  snare: "o...x. x...X.",
  lowTom: "o...x. x...X.",
  kick: TWELVE_KICK_UNDER,
};
/** Snare triplets that land on the floor tom. */
const TWELVE_TRIPLETS_TO_FLOOR = {
  snare: "o.o.x. x.x...",
  lowTom: "...... ....X.",
  kick: TWELVE_KICK_UNDER,
};

const bluesDrumsInTwelve: DrumTime = {
  grooves: {
    // Quiet: the shuffle's two notes a beat on a soft hat, a plain backbeat, mostly a plain kick.
    low: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: "o...g. o...g. o...g. o...g." } }],
      },
      {
        id: "kick",
        hold: "section",
        options: [
          { weight: 3, lines: TWELVE_KICK_PLAIN },
          { weight: 1, lines: TWELVE_KICK_PUSHED },
        ],
      },
      {
        id: "snare",
        hold: "section",
        when: { energyFrom: 0.3 },
        options: [{ weight: 1, lines: { snare: "...... x..... ...... x....." } }],
      },
      {
        id: "rim",
        hold: "section",
        when: { energyBelow: 0.3 },
        options: [{ weight: 1, lines: { crossStick: "...... x..... ...... x....." } }],
      },
    ],

    // The working slow blues: the triplets on the hat, the backbeat cracked.
    mid: [
      { id: "time", hold: "section", options: [{ weight: 1, lines: { closedHat: TRIPLETS } }] },
      {
        id: "kick",
        hold: "section",
        options: [
          { weight: 2, lines: TWELVE_KICK_PLAIN },
          { weight: 3, lines: TWELVE_KICK_PUSHED },
        ],
      },
      {
        id: "snare",
        hold: "section",
        options: [
          { weight: 7, lines: TWELVE_BACKBEAT },
          // A ghost on the last eighth, loping into the one.
          { weight: 3, lines: { snare: "...... X..... ...... X...g." } },
        ],
      },
      {
        id: "breath",
        hold: "section",
        when: TWELVE_BREATH.bars,
        options: [
          { weight: 65, lines: {} },
          { weight: 35, lines: TWELVE_BREATH.open },
        ],
      },
    ],

    // Hot: the triplets on the hat or the ride, the kick always pushed, ghosts in the left hand.
    high: [
      {
        id: "time",
        hold: "pass",
        options: [
          { weight: 1, lines: { closedHat: TRIPLETS } },
          { weight: 1, lines: { ride: TRIPLETS, pedalHat: "...... x..... ...... x....." } },
        ],
      },
      { id: "kick", hold: "section", options: [{ weight: 1, lines: TWELVE_KICK_PUSHED }] },
      {
        id: "feather",
        hold: "section",
        options: [
          { weight: 2, lines: {} },
          { weight: 3, lines: { kick: "...... g..... ...... g....." } },
        ],
      },
      {
        id: "snare",
        hold: "section",
        options: [
          { weight: 2, lines: TWELVE_BACKBEAT },
          // Ghosts on the last eighths of 2 and 4, rolling into 3 and 1.
          { weight: 2, lines: { snare: "...... X...g. ...... X...g." } },
          // The triplet ghosted under the backbeat.
          { weight: 1, lines: { snare: "....g. X.g.g. ....g. X.g.g." } },
        ],
      },
      {
        id: "breath",
        hold: "section",
        when: TWELVE_BREATH.bars,
        options: [
          { weight: 2, lines: {} },
          { weight: 3, lines: TWELVE_BREATH.open },
        ],
      },
    ],
  },

  // The lope: the last eighths of 2 and 4 are played lighter, so the bar circles in two.
  touches: [{ voices: ["closedHat", "ride"], steps: [10, 22], scale: 0.8 }],

  fills: {
    // An eighth, a beat, two beats.
    length: {
      phrase: { low: 0, mid: 2, high: 6 },
      section: { low: 2, mid: 6, high: 12 },
    },
    phrase: [
      { weight: 3, lines: PICKUP },
      { weight: 1, lines: PICKUP_FLOOR },
      { weight: 2, lines: TWELVE_FOUR_AND },
      { weight: 3, lines: TWELVE_TRIPLET },
      { weight: 1, lines: TWELVE_CRACK_BOOM },
    ],
    section: [
      { weight: 3, lines: PICKUP },
      { weight: 1, lines: PICKUP_FLOOR },
      { weight: 2, lines: TWELVE_FOUR_AND },
      { weight: 3, lines: TWELVE_TRIPLET },
      { weight: 1, lines: TWELVE_CRACK_BOOM },
      { weight: 1, lines: TWELVE_TRIPLET_BOOM },
      { weight: 1, lines: TWELVE_RUN },
      { weight: 3, lines: TWELVE_RUN_TRIPLETS },
      { weight: 1, lines: TWELVE_SNARE_SHUFFLE },
      { weight: 2, lines: TWELVE_SNARE_TRIPLETS },
    ],
    top: [
      { weight: 2, lines: PICKUP },
      { weight: 2, lines: PICKUP_BOTH },
      { weight: 1, lines: PICKUP_FLOOR },
      { weight: 2, lines: TWELVE_TRIPLET },
      { weight: 2, lines: TWELVE_TRIPLET_BOOM },
      { weight: 1, lines: TWELVE_FOUR_AND_BOTH },
      { weight: 1, lines: TWELVE_FOUR_AND },
      { weight: 2, lines: TWELVE_ROUND_THE_KIT },
      { weight: 2, lines: TWELVE_FLAT_HANDED },
      { weight: 2, lines: TWELVE_TRIPLETS_TO_FLOOR },
    ],
  },
};

// ── in six ──────────────────────────────────────────────────────────────────
// The blues counted in two, as a gospel blues ballad is. A bar of 6/8 is two
// slow beats of three eighths: twelve sixteenths, written in sixes. It is one
// strong beat and one answering it, not half a bar of twelve: there is no beat
// 3, so the kick has the One and the backbeat the second beat (SU-D-14). The
// cymbal's triplets and the backbeat are twelve's first half (`halfOf`): that
// much of the slow blues is the same bar cut. The kick's push into the One is
// twelve's too, moved to the end of the shorter bar. The fills are written for
// a bar of two: none is longer than a beat, and one of a beat starts on the
// backbeat, so no bar of six loses it (DR-46).

/** The first half of a line written for twelve: the same beat in a bar of six. */
const halfOf = (line: string) => line.split(" ").slice(0, 2).join(" ");

const SIX_KICK_PLAIN = { kick: halfOf(TWELVE_KICK_PLAIN.kick) };
/** The One, and the soft push on the last eighth into the next bar. */
const SIX_KICK_PUSHED = { kick: "x..... ....o." };
const SIX_BACKBEAT = { snare: halfOf(TWELVE_BACKBEAT.snare) };
const SIX_TRIPLETS = halfOf(TRIPLETS);

const SIX_BREATH = {
  bars: TWELVE_BREATH.bars,
  open: { openHat: "...... ....o." },
} as const;

/** The backbeat, then the high tom and the floor: round the kit in one beat. */
const SIX_ROUND = { snare: "x.....", highTom: "..o...", lowTom: "....X." };
/** Both hands on the backbeat's triplet, landing on the floor. */
const SIX_FLAT = { snare: "x.o...", lowTom: "x...X." };

const bluesDrumsInSix: DrumTime = {
  grooves: {
    low: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: halfOf("o...g. o...g. o...g. o...g.") } }],
      },
      {
        id: "kick",
        hold: "section",
        options: [
          { weight: 3, lines: SIX_KICK_PLAIN },
          { weight: 1, lines: SIX_KICK_PUSHED },
        ],
      },
      {
        id: "snare",
        hold: "section",
        when: { energyFrom: 0.3 },
        options: [{ weight: 1, lines: { snare: "...... x....." } }],
      },
      {
        id: "rim",
        hold: "section",
        when: { energyBelow: 0.3 },
        options: [{ weight: 1, lines: { crossStick: "...... x....." } }],
      },
    ],

    mid: [
      { id: "time", hold: "section", options: [{ weight: 1, lines: { closedHat: SIX_TRIPLETS } }] },
      {
        id: "kick",
        hold: "section",
        options: [
          { weight: 2, lines: SIX_KICK_PLAIN },
          { weight: 3, lines: SIX_KICK_PUSHED },
        ],
      },
      {
        id: "snare",
        hold: "section",
        options: [
          { weight: 7, lines: SIX_BACKBEAT },
          // A ghost on the last eighth, loping into the One.
          { weight: 3, lines: { snare: "...... X...g." } },
        ],
      },
      {
        id: "breath",
        hold: "section",
        when: SIX_BREATH.bars,
        options: [
          { weight: 65, lines: {} },
          { weight: 35, lines: SIX_BREATH.open },
        ],
      },
    ],

    high: [
      {
        id: "time",
        hold: "pass",
        options: [
          { weight: 1, lines: { closedHat: SIX_TRIPLETS } },
          { weight: 1, lines: { ride: SIX_TRIPLETS, pedalHat: "...... x....." } },
        ],
      },
      { id: "kick", hold: "section", options: [{ weight: 1, lines: SIX_KICK_PUSHED }] },
      {
        id: "feather",
        hold: "section",
        options: [
          { weight: 2, lines: {} },
          { weight: 3, lines: { kick: "...... g....." } },
        ],
      },
      {
        id: "snare",
        hold: "section",
        options: [
          { weight: 2, lines: SIX_BACKBEAT },
          { weight: 2, lines: { snare: "...... X...g." } },
          // The triplet ghosted round the backbeat.
          { weight: 1, lines: { snare: "....g. X.g.g." } },
        ],
      },
      {
        id: "breath",
        hold: "section",
        when: SIX_BREATH.bars,
        options: [
          { weight: 2, lines: {} },
          { weight: 3, lines: SIX_BREATH.open },
        ],
      },
    ],
  },

  // The lope: the backbeat's last eighth is played lighter, so the bar circles in two.
  touches: [{ voices: ["closedHat", "ride"], steps: [10], scale: 0.8 }],

  fills: {
    // An eighth, or a beat: the backbeat and what follows it.
    length: {
      phrase: { low: 0, mid: 2, high: 6 },
      section: { low: 2, mid: 6, high: 6 },
    },
    phrase: [
      { weight: 3, lines: PICKUP },
      { weight: 1, lines: PICKUP_FLOOR },
      { weight: 2, lines: TWELVE_FOUR_AND },
      { weight: 3, lines: TWELVE_TRIPLET },
      { weight: 1, lines: TWELVE_CRACK_BOOM },
    ],
    section: [
      { weight: 3, lines: PICKUP },
      { weight: 1, lines: PICKUP_FLOOR },
      { weight: 2, lines: TWELVE_FOUR_AND },
      { weight: 3, lines: TWELVE_TRIPLET },
      { weight: 1, lines: TWELVE_CRACK_BOOM },
      { weight: 2, lines: TWELVE_TRIPLET_BOOM },
      { weight: 2, lines: SIX_ROUND },
    ],
    top: [
      { weight: 2, lines: PICKUP },
      { weight: 2, lines: PICKUP_BOTH },
      { weight: 1, lines: PICKUP_FLOOR },
      { weight: 2, lines: TWELVE_TRIPLET },
      { weight: 2, lines: TWELVE_TRIPLET_BOOM },
      { weight: 1, lines: TWELVE_FOUR_AND_BOTH },
      { weight: 2, lines: SIX_ROUND },
      { weight: 2, lines: SIX_FLAT },
    ],
  },
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

    // Hot: the kick always pushed, and the left hand and the foot fill in. The hat stays at its
    // working level: accented as hard as the backbeat it slammed (heard at gate 1).
    high: [
      // Hat or ride, chosen for one time through the section, so a hot chorus commits to its
      // cymbal and some hot choruses ride (DR-45, DR-109). On the ride the foot closes the hat
      // on 2 and 4.
      {
        id: "time",
        hold: "pass",
        options: [
          { weight: 1, lines: { closedHat: "x.o. x.o. x.o. x.o." } },
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

  // The slow blues in twelve-eight, written above.
  meters: { "12/8": bluesDrumsInTwelve, "6/8": bluesDrumsInSix },

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
