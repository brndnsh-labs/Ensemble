// What the critic expects of a funk band, and what its players' choices cost.
// An `intent` bound is true whatever the band currently plays; a `measured` bound
// sits a margin from what it delivers today.
//
// PLACEHOLDER weights: each seat's weights are the blues seat's until that seat is
// written. Replace a seat's weights with its own, and add its targets under its heading.

import type { CriticStyle } from "@ensemble/engine";
import { bluesCritic } from "../blues/critic.ts";

export const funkCritic: CriticStyle = {
  targets: {
    // ── drums ──
    // The One and the backbeat in every bar of time (ST-funk-14: 95% and 90%).
    "drums.kick-on-one": { min: 0.95, kind: "intent" },
    "drums.backbeat": { min: 0.9, kind: "intent" },
    // A section keeps one groove (X-A-29); the answer bars are compared with their own kind.
    "drums.same-groove": { min: 0.75, kind: "intent", minCases: 8 },
    "drums.fills-that-repeat": { max: 0.1, kind: "intent", minCases: 4 },
    "drums.cymbal-under-backbeat": { min: 0.95, kind: "intent", minCases: 8 },
    // One to five ghosts in a bar of time from mid up (ST-funk-14, DR-48).
    "drums.ghosts": { min: 0.9, kind: "intent", minCases: 8 },
    // At least half the answer bars audibly differ from the bar before; a section turns round
    // the same way in at least 86% of its answer bars (ST-funk-14, DR-06).
    "drums.answer-bars": { min: 0.5, kind: "intent", minCases: 4 },
    "drums.turn-held": { min: 0.86, kind: "intent", minCases: 4 },
    // ── bass ──
    // ── chords ──
    // ── solo ──
    // ── band ──
  },
  weights: {
    ...bluesCritic.weights,
  },
};
