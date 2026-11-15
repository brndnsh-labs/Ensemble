// What the critic expects of a jazz band, and what its players' choices cost.
// An `intent` bound is true whatever the band currently plays; a `measured` bound
// sits a margin from what it delivers today.
//
// PLACEHOLDER weights: each seat's weights are the blues seat's until that seat is
// written. Replace a seat's weights with its own, and add its targets under its heading.

import type { CriticStyle } from "@ensemble/engine";
import { bluesCritic } from "../blues/critic.ts";

export const jazzCritic: CriticStyle = {
  targets: {
    // ── drums ──
    // The ride on every beat once the band has opened up (ST-jazz-17, DR-39: 90%).
    "drums.ride-every-beat": { min: 0.9, kind: "intent", minCases: 8 },
    // Some phrase ends get the shot, not all: 46% to 67% (ST-jazz-17, DR-36). Delivers 59%
    // over everything; a take has a dozen phrase ends or so, so by take it spreads wide.
    "drums.phrase-end-shot": { min: 0.46, max: 0.67, kind: "measured", minCases: 8 },
    // Swung eighths only: nothing on an "e" or an "a" (ST-jazz-06, DR-34).
    "drums.on-the-eighths": { min: 1, kind: "intent" },
    // At two and four steps a swung set-up has two places to strike, so the written shapes
    // come out alike (the eighths and the two-shot are one figure at four steps) and the shot
    // is the idiom. Delivers 15% over everything, 40% at the take one in ten is above.
    "drums.fills-that-repeat": { max: 0.45, kind: "measured", minCases: 4 },
    // ── bass ──
    // ── chords ──
    // ── solo ──
    // ── band ──
  },
  weights: {
    ...bluesCritic.weights,
  },
};
