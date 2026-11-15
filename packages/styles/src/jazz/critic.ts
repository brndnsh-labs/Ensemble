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
    // ── bass ──
    // ── chords ──
    // ── solo ──
    // ── band ──
  },
  weights: {
    ...bluesCritic.weights,
  },
};
