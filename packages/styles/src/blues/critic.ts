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
  },
  weights: {},
};
