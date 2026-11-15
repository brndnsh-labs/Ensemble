// What the critic expects of a jazz band, and what its players' choices cost.
// An `intent` bound is true whatever the band currently plays; a `measured` bound
// sits a margin from what it delivers today.
//
// PLACEHOLDER weights: each seat's weights are the blues seat's until that seat is
// written. Replace a seat's weights with its own, and add its targets under its heading.
// The soloist's weights and targets are its own.

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
    // Measured over 200 takes of the seven jazz charts, each also played taking the first
    // candidate every time and a candidate at random (ME-10).
    // A note on a change is a chord tone, by rule (X-B-06, Q-21).
    "solo.changes-on-chord-tones": { min: 1, kind: "intent" },
    // A guide tone on 60% of changes or more (ST-jazz-40). Delivers 85%; unchosen, 78%.
    "solo.thirds-and-sevenths-on-changes": { min: 0.6, kind: "intent", minCases: 10 },
    // 72% or more of the notes on a beat are chord tones (Q-22). Delivers 94% (unchosen
    // 89%): the passing tone of the bebop scale is doing its job.
    "solo.beats-on-chord-tones": { min: 0.72, kind: "intent", minCases: 20 },
    "solo.phrase-ends-on-chord-tones": { min: 0.85, kind: "intent", minCases: 6 },
    // 79% of phrases are related to an earlier one of their solo (two phrases from
    // different takes, 8%; a candidate at random, 70%). Not all of them: a chorus opens on
    // a new idea and a bridge is something else, which is a quarter of a 32-bar chorus.
    "solo.phrases-related": { min: 0.4, kind: "measured", minCases: 6 },
    // 7% to 22% of phrases restate the one before (ST-jazz-40). Delivers 6% over
    // everything, 0% to 17% by take: a line is not pasted.
    "solo.phrase-same-as-last": { max: 0.25, kind: "measured", minCases: 6 },
    // The rhythm of a bar comes back inside its phrase in 67% of line bars (Q-43), where
    // the old band's jazz was 8% (SO-62). Unchosen, 45%.
    "solo.bars-that-rhyme": { min: 0.3, kind: "measured", minCases: 6 },
    // 13% of bars are empty, none in a ballad, where a phrase is two bars and every bar
    // plays. The notes' 20% to 50% (ST-jazz-40) predates the rule that a phrase leaves one
    // empty bar at most (SO-10), as in the blues.
    "solo.empty-bars": { max: 0.3, kind: "measured", minCases: 12 },
    "solo.long-breaths": { max: 0.12, kind: "intent", minCases: 8 },
    "solo.breath": { min: 0.4, kind: "intent", minCases: 4 },
    "solo.phrases-breathe": { min: 1, kind: "intent", minCases: 4 },
    // The last chorus has 1.5 to 4 times the notes of the first (SO-02). Delivers 2.1,
    // and under 1.5 in about one take in eight.
    "solo.builds": { min: 1.5, max: 4, kind: "intent" },
    "solo.rises": { min: 2, kind: "measured" },
    "solo.top-in-last-chorus": { min: 0.85, kind: "intent" },
    // A phrase's high point is on a beat or held: 90% (Q-45). Unchosen, 77%.
    "solo.high-points-deserved": { min: 0.6, kind: "measured", minCases: 6 },
    // A chorus covers 10 to 24 semitones (ST-jazz-40). Delivers 15 to 20.
    "solo.range": { min: 10, max: 24, kind: "intent" },
    // 55% to 90% of moves are a whole step or less (ST-jazz-40). Delivers 71%.
    "solo.steps": { min: 0.55, max: 0.9, kind: "intent", minCases: 20 },
    "solo.wide-leaps": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.trills": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.repeated-notes": { max: 0.07, kind: "intent", minCases: 20 },
    // 18% to 60% of changes are landed on from an out-of-scale half step (ST-jazz-40):
    // 28% over everything. By take it runs from 10% to 42%, so each take is held to a
    // wider band than the population.
    "solo.chromatic-approaches": { min: 0.08, max: 0.6, kind: "measured", minCases: 12 },
    // 60% to 95% of notes are an eighth or shorter (ST-jazz-40). Delivers 76%.
    "solo.short-notes": { min: 0.6, max: 0.95, kind: "intent", minCases: 20 },
    // Of the barlines a run crosses, 10% to 20% are tied over (Q-35): 18% over everything.
    // An idea carries its ties with it, so by take it is none to half; a take that ties at
    // most barlines would be a mannerism.
    "solo.barlines-tied": { max: 0.5, kind: "measured", minCases: 10 },
    // 20% to 30% of phrases are led in from the beat before (SO-39): 19% over everything.
    // The ceiling is the point: leading into every phrase is a mannerism.
    "solo.entered-early": { max: 0.5, kind: "intent", minCases: 6 },
    // Not a target for the music: a ceiling one take in ten sits above today, so that the
    // scorecard names the worst solos, which are the ones to go and listen to.
    "solo.cost": { max: 2.32, kind: "measured" },
    // ── band ──
  },
  weights: {
    ...bluesCritic.weights,
    // What a phrase of the solo costs. Each was set to zero in turn over 105 takes (ME-10);
    // what it moved is beside it. "runs-on" moved nothing (a phrase here is never longer
    // than the style's patience) and has no weight.
    solo: {
      // At zero, phrases related to an earlier one 78% to 72%, bars that rhyme 69% to 64%.
      "lost-the-thread": 2,
      // At zero, empty bars 13% to 17% and the build from first chorus to last 2.03 to 1.97.
      "off-the-density": 3,
      "off-the-register": 0.15,
      // At zero, high points on a beat or held 89% to 79%.
      "peak-thrown-away": 0.5,
      // At zero, leaps resolved 83% to 39%.
      "leaps-left-hanging": 0.75,
      // A long line moved along its scale can fold into a rocking pair where the chord
      // changes under it; heavier than in the blues, because there is more line to fold.
      stuck: 5,
      "doubles-the-bass": 0.5,
      "rests-where-the-last-did": 0.5,
      // Lighter than in the blues: a bebop line is through-composed. At zero, bars that
      // rhyme 69% to 55%.
      "bars-in-a-row": 0.5,
      // The idea come back two phrases later over the same changes is the idea changed, not
      // pasted. At zero, the phrase before again 6% to 8%, and the notes that are note for
      // note an earlier phrase's 15% to 23%.
      "note-for-note": 2,
      // At zero, chord tones on the beat 94% to 89%.
      "beats-off-the-chord": 2,
      // The style's own list of where a change lands: 3rd, 7th, 9th, 5th, root. At zero,
      // guide tones on the changes 85% to 80%.
      "changes-down-the-list": 1,
    },
  },
};
