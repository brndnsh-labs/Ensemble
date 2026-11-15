// What the critic expects of a funk band, and what its players' choices cost.
// An `intent` bound is true whatever the band currently plays; a `measured` bound
// sits a margin from what it delivers today.
//
// PLACEHOLDER weights: each seat's weights are the blues seat's until that seat is
// written. Replace a seat's weights with its own, and add its targets under its heading.
// The soloist's weights and targets are its own.

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
    // Measured over 200 takes of the six funk charts, each also played taking the first
    // candidate every time and a candidate at random (ME-10).
    "solo.changes-on-chord-tones": { min: 1, kind: "intent" },
    // Roots and fifths on 45% to 80% of changes (ST-funk-35): 56% over everything. By take
    // it runs from 35% to 70% (a vamp of two chords has few changes to count).
    "solo.roots-and-fifths-on-changes": { min: 0.3, max: 0.85, kind: "measured", minCases: 8 },
    // 72% or more of the notes on a beat are chord tones (Q-22). Delivers 93%.
    "solo.beats-on-chord-tones": { min: 0.72, kind: "intent", minCases: 20 },
    "solo.phrase-ends-on-chord-tones": { min: 0.85, kind: "intent", minCases: 6 },
    // 79% of phrases are related to an earlier one of their solo (two funk phrases from
    // different takes, 8%; a candidate at random, 72%).
    "solo.phrases-related": { min: 0.4, kind: "measured", minCases: 6 },
    // A phrase is the phrase before it again 26% of the time (unchosen 18%, at random
    // 11%): the riff said again is the form's second phrase. Past a half it is a loop.
    "solo.phrase-same-as-last": { max: 0.5, kind: "measured", minCases: 6 },
    // A bar's rhythm comes back inside its phrase in 79% of line bars (Q-43). Unchosen 66%.
    "solo.bars-that-rhyme": { min: 0.5, kind: "measured", minCases: 6 },
    // 20% of bars are empty (10% to 29% by take).
    "solo.empty-bars": { min: 0.05, max: 0.3, kind: "measured", minCases: 12 },
    "solo.long-breaths": { max: 0.12, kind: "intent", minCases: 8 },
    "solo.breath": { min: 0.4, kind: "intent", minCases: 4 },
    "solo.phrases-breathe": { min: 1, kind: "intent", minCases: 4 },
    // The last chorus has 1.5 to 4 times the notes of the first (SO-02). Delivers 2.0, and
    // under 1.5 in about one take in eight.
    "solo.builds": { min: 1.5, max: 4, kind: "intent" },
    "solo.rises": { min: 2, kind: "measured" },
    "solo.top-in-last-chorus": { min: 0.85, kind: "intent" },
    // A phrase's high point is on a beat or held: 72% (unchosen 66%, at random 61%). Lower
    // than in a line style on purpose: a riff's top is often a stab on a sixteenth.
    "solo.high-points-deserved": { min: 0.4, kind: "measured", minCases: 6 },
    "solo.range": { min: 10, max: 26, kind: "intent" },
    // Under 5% leaps (ST-funk-35). Delivers 0.2%.
    "solo.wide-leaps": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.trills": { max: 0.05, kind: "intent", minCases: 20 },
    // 8% to 20% of moves strike the same note again (ST-funk-35, Q-28: too few is as wrong
    // as too many): 15% over everything. A stabbed figure comes back with its riff, so by
    // take it runs from 2% to 31%.
    "solo.repeated-notes": { min: 0.02, max: 0.32, kind: "measured", minCases: 20 },
    // At least four notes in five are short (ST-funk-35). Delivers 90%, never under 82%.
    "solo.short-notes": { min: 0.8, kind: "intent", minCases: 20 },
    // 40% to 85% of the sixteenths in a bar that is played in are silent (ST-funk-35,
    // Q-33). Delivers 58% (50% to 72% by take).
    "solo.silent-sixteenths": { min: 0.4, max: 0.85, kind: "intent", minCases: 32 },
    // No pickups and no ties over the barline (ST-funk-33). True by construction: tripwires.
    "solo.barlines-tied": { max: 0, kind: "intent" },
    "solo.entered-early": { max: 0, kind: "intent" },
    // Not a target for the music: a ceiling one take in ten sits above today, so that the
    // scorecard names the worst solos, which are the ones to go and listen to.
    "solo.cost": { max: 2.4, kind: "measured" },
    // ── band ──
  },
  weights: {
    ...bluesCritic.weights,
    // What a phrase of the solo costs. Each was set to zero in turn over 120 takes (ME-10);
    // what it moved is beside it. "stuck" has no weight here: it counts a repeated note as
    // going nowhere, and a stabbed figure repeats its note on purpose; "rocks" is the half
    // of it that still applies. "runs-on" moved nothing and has none either.
    solo: {
      // At zero, phrases related to an earlier one 79% to 67%, and the phrase before again
      // 26% to 9%: this is what keeps the riff.
      "lost-the-thread": 2.5,
      // At zero, the build from first chorus to last 2.01 to 1.61.
      "off-the-density": 3,
      "off-the-register": 0.15,
      // Lighter than in a line style. At zero, high points on a beat or held 71% to 60%.
      "peak-thrown-away": 0.3,
      "leaps-left-hanging": 0.75,
      // Rocking between two notes (a-b-a-b). Rare either way (0.6% of moves, 0.9% at zero):
      // kept as the guard "stuck" is in the other styles.
      rocks: 3,
      // Mild: funk lands on roots and fifths, which is where the bass is.
      "doubles-the-bass": 0.3,
      "rests-where-the-last-did": 0.25,
      // At zero, bars that rhyme inside their phrase 79% to 60%.
      "bars-in-a-row": 1,
      // A riff means to be said again, so this is light: enough that the third time in a
      // row something moves. At zero, the phrase before again 26% to 29%.
      "note-for-note": 0.75,
      // At zero, chord tones on the beat 93% to 88%.
      "beats-off-the-chord": 1,
      // The style's own list of where a change lands: 5th, 3rd, 7th, root.
      "changes-down-the-list": 0.5,
    },
  },
};
