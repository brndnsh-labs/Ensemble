// What the critic expects of a blues band. An `intent` bound is true whatever
// the band currently plays; a `measured` bound sits a margin from what it
// delivers today, and moving it needs a new measurement (and a reason).

import type { CriticStyle } from "@ensemble/engine";

export const bluesCritic: CriticStyle = {
  targets: {
    // The kick is on 1 and the backbeat on 2 and 4 in every bar of time (ST-blues-08).
    "drums.kick-on-one": { min: 0.95, kind: "intent" },
    "drums.backbeat": { min: 0.95, kind: "intent" },
    // A section keeps one groove (ST-blues-19: consistency floor 75%).
    "drums.same-groove": { min: 0.75, kind: "intent", minCases: 8 },
    // 15% to 50% of fills are the triplet kind (ST-blues-19).
    "drums.triplet-fills": { min: 0.15, max: 0.5, kind: "intent", minCases: 10 },
    "drums.fills-that-repeat": { max: 0.1, kind: "intent", minCases: 4 },

    // The arrival is stated at least four changes in five (BA-01, blues).
    "bass.changes-stated": { min: 0.8, kind: "intent" },
    // 15% to 40% of changes resolve by a half step in actual pitch (ST-blues-28).
    "bass.half-step-approaches": { min: 0.15, max: 0.4, kind: "intent", minCases: 8 },
    // Under 5% of lead-ins leap (ST-blues-28), measured over enough lead-ins to mean something.
    "bass.lead-ins-that-leap": { max: 0.05, kind: "intent", minCases: 5 },
    // 15% to 35% of bass notes on dominant chords are the 6th (ST-blues-28).
    "bass.sixths-on-dominants": { min: 0.15, max: 0.35, kind: "intent", minCases: 20 },
    // In two when quiet: 0.45 to 0.75 notes per beat (ST-blues-28).
    "bass.notes-per-beat-when-quiet": { min: 0.45, max: 0.75, kind: "intent", minCases: 4 },

    // How hard the band hits, set by ear at gate 1: a backbeat around 110 slammed through a
    // sampled kit, around 95 did not. The quietest takes sit in the high 60s.
    "band.backbeat-level": { min: 60, max: 108, kind: "intent" },
    "band.notes-near-the-top": { max: 0.02, kind: "intent" },
    "drums.cymbal-under-backbeat": { min: 0.95, kind: "intent", minCases: 8 },

    // The top of the piano's chord is a line: at a change it moves more than a 4th at no
    // more than 22% of changes (Q-05, no soloist) and 3.5 semitones or less on average
    // (Q-04). Today it delivers no leaps at all and about 1.2 semitones.
    "chords.top-leaps": { max: 0.22, kind: "intent", minCases: 8 },
    "chords.top-movement": { max: 3.5, kind: "intent", minCases: 8 },
    // Shape bounds around what it delivers (ME-11): steps 38% to 99% of changes by take,
    // small leaps up to 23%, holds up to 48%. A top note that held at most changes would
    // be the frozen top ME-11 warns of.
    "chords.top-steps": { min: 0.35, kind: "measured", minCases: 8 },
    "chords.top-small-leaps": { max: 0.3, kind: "measured", minCases: 8 },
    "chords.top-holds": { max: 0.6, kind: "measured", minCases: 8 },
    // Nothing under the floor, ever (X-B-02); and the comp never on or under the bass.
    "chords.floor-clearance": { min: 0, kind: "intent" },
    "chords.closest-to-bass": { min: 1, kind: "intent" },
    "chords.crowds-the-bass": { max: 0.05, kind: "intent", minCases: 8 },
    // The bottom of the hand sits around E4 (measured 58 to 68 by take); the notes give no
    // blues number, only jazz piano's 58 to 64 (CH-19).
    "chords.lowest-note": { min: 56, max: 70, kind: "measured", minCases: 8 },
    // Blues piano plays jazz colour: half or more of its chords carry a 9th or 13th (CH-14).
    "chords.colour": { min: 0.5, max: 1, kind: "intent", minCases: 8 },
    // A written tension is heard nine times in ten or more (Q-07, X-B-13).
    "chords.written-tensions": { min: 0.9, kind: "intent", minCases: 5 },
    // A good comp has almost no voicing faults (Q-03); with the rub penalties off, 4%.
    "chords.voicing-faults": { max: 0.02, kind: "intent", minCases: 8 },
    // Hand width stays consistent across neighbours (Q-06, KF-B-28).
    "chords.width-jumps": { max: 0.01, kind: "intent", minCases: 8 },
  },
  weights: {
    // What a voicing costs (CH-16), in comparable units: a note out of the slot is
    // worth more than any amount of voice leading; a semitone of the top voice's
    // movement costs 0.6 on top of the 0.5 every voice pays; the pull toward the
    // target is weaker than the pull to stay put, so the top line steps.
    voicing: {
      "outside-register": 40,
      "top-from-target": 0.35,
      "hand-movement": 0.5,
      "top-movement": 0.6,
      "minor-ninths": 12,
      "minor-seconds": 8,
      "minor-seconds-thin": 24,
      "sharp-nine-under-third": 20,
      "low-intervals": 10,
    },
  },
};
