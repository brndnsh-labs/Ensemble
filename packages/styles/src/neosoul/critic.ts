// What the critic expects of a neo-soul band, and what its players' choices
// cost. An `intent` bound is true whatever the band currently plays; a
// `measured` bound sits a margin from what it delivers today.

import type { CriticStyle } from "@ensemble/engine";

export const neosoulCritic: CriticStyle = {
  targets: {
    // Everyone stays in (docs/decisions/styles.md, who is in).
    "band.takes-thinned": { max: 0, kind: "intent" },
    "drums.laid-out": { max: 0, kind: "intent" },
    "bass.laid-out": { max: 0, kind: "intent" },
    "chords.laid-out": { max: 0, kind: "intent" },
    // ── drums ──
    // A section keeps its kick in at least 90% of bars (ST-neosoul-12).
    "drums.kick-on-one": { min: 0.9, kind: "intent" },
    // The backbeat on 2 and 4, but for the second bar of each pair in a section that moves its
    // four a sixteenth late (ST-neosoul-08): at the least every other bar.
    "drums.backbeat": { min: 0.5, kind: "intent" },
    "drums.same-groove": { min: 0.75, kind: "intent", minCases: 8 },
    "drums.cymbal-under-backbeat": { min: 0.95, kind: "intent", minCases: 8 },
    // 2.5 to 4.5 ghosts a bar from the working level up (ST-neosoul-12). The notes' own hot
    // sets have five each (ST-neosoul-07), so a take that is hot throughout reads 5: the
    // ceiling is the grids', not the metric's.
    "drums.ghosts-per-bar": { min: 2.5, max: 5, kind: "intent", minCases: 8 },
    // 5% to 30% of bars have the late four (ST-neosoul-12), over everything. It is a section's
    // choice, made for every second bar, so a take of one section has it in none of its bars
    // or in half of them: by take, never more than every second bar.
    "drums.late-four": { max: 0.5, kind: "intent", minCases: 16 },
    // ── bass ──
    "bass.changes-stated": { min: 0.95, kind: "intent" },
    "bass.on-the-one": { min: 0.95, kind: "intent", minCases: 8 },
    // 25% to 60% on the sixteenths between the eighths; 15% to 45% of the bar silent; 60% to
    // 95% of half-step approaches from below (ST-neosoul-18).
    "bass.syncopated-sixteenths": { min: 0.25, max: 0.6, kind: "intent", minCases: 40 },
    "bass.silence": { min: 0.15, max: 0.45, kind: "intent", minCases: 64 },
    // By take, a handful of approaches are often all from below: the ceiling is over everything.
    "bass.approaches-from-below": { min: 0.6, kind: "intent", minCases: 5 },
    "bass.lead-ins-that-leap": { max: 0.05, kind: "intent", minCases: 5 },
    // Deep, and fixed for the song: mean pitch 31 to 38 (ST-neosoul-15).
    "bass.register": { min: 31, max: 38, kind: "intent" },
    // ── band ──
    "band.backbeat-level": { min: 60, max: 108, kind: "intent" },
    "band.notes-near-the-top": { max: 0.02, kind: "intent" },
    // ── chords ──
    "chords.top-leaps": { max: 0.22, kind: "intent", minCases: 8 },
    "chords.top-movement": { max: 3.5, kind: "intent", minCases: 8 },
    "chords.floor-clearance": { min: 0, kind: "intent" },
    "chords.closest-to-bass": { min: 1, kind: "intent" },
    "chords.crowds-the-bass": { max: 0.05, kind: "intent", minCases: 8 },
    // The left hand reaches down to C3: mean lowest note 50 to 56.5 (ST-neosoul-20).
    "chords.lowest-note": { min: 50, max: 56.5, kind: "intent", minCases: 8 },
    // The richest colour the chord's scale allows (ST-neosoul-19).
    "chords.colour": { min: 0.6, max: 1, kind: "intent", minCases: 8 },
    "chords.written-tensions": { min: 0.9, kind: "intent", minCases: 5 },
    "chords.voicing-faults": { max: 0.02, kind: "intent", minCases: 8 },
    "chords.width-jumps": { max: 0.01, kind: "intent", minCases: 8 },
    // Held for beats, not stabbed (ST-neosoul-22): the share of strikes ringing longer than a
    // beat. The hot figures re-strike every three or four sixteenths, so a hot take holds few.
    "chords.held": { min: 0.2, kind: "measured", minCases: 20 },
    "chords.held-quiet": { min: 0.8, kind: "intent", minCases: 20 },
    "chords.on-the-soloists-note": { max: 0.15, kind: "intent", minCases: 20 },
    "chords.top-leaps-under-the-solo": { max: 0.05, kind: "intent", minCases: 20 },
    "chords.answers-louder": { min: 1, max: 12, kind: "intent", minCases: 4 },
    // ── solo ──
    "solo.changes-on-chord-tones": { min: 1, kind: "intent" },
    "solo.beats-on-chord-tones": { min: 0.72, kind: "intent", minCases: 20 },
    "solo.phrase-ends-on-chord-tones": { min: 0.85, kind: "intent", minCases: 6 },
    "solo.long-breaths": { max: 0.12, kind: "intent", minCases: 8 },
    "solo.breath": { min: 0.4, kind: "intent", minCases: 4 },
    "solo.phrases-breathe": { min: 1, kind: "intent", minCases: 4 },
    "solo.builds": { min: 1.3, max: 4, kind: "intent" },
    "solo.top-in-last-chorus": { min: 0.85, kind: "intent" },
    "solo.wide-leaps": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.trills": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.barlines-tied": { max: 0, kind: "intent" },
    // A neo-soul line enters late, seldom early: 9% of a take's phrases on the mean today.
    "solo.entered-early": { max: 0.3, kind: "intent", minCases: 6 },
  },
  weights: {
    // The jazz pianist's costs: the top led smoothly where the style aims it, and kept off the
    // soloist's note and out of its register.
    voicing: {
      "outside-register": 40,
      "top-from-target": 0.35,
      "top-out-of-reach": 4,
      "hand-movement": 0.5,
      "top-movement": 0.6,
      "minor-ninths": 12,
      "minor-seconds": 8,
      "minor-seconds-thin": 24,
      "sharp-nine-under-third": 20,
      "low-intervals": 10,
      "on-the-soloists-note": 34,
      "on-the-soloists-octave": 7,
      "in-the-soloists-register": 3,
      "top-leap": 20,
      "crowds-the-bass-under-the-line": 4,
    },
    // The jazz comper's, around the soloist.
    comping: {
      "off-the-drums": 2,
      "under-the-soloist": 9,
      thinned: 4,
      "breaths-unanswered": 0.5,
      "breaths-left-empty": 1.5,
      "steps-on-the-entrance": 1,
      "off-the-energy": 1,
      "one-bar": 0.5,
      "no-return": 1,
      "same-as-last": 0.25,
      "same-as-last-time": 0.3,
    },
    // The disco soloist's costs, over the pentatonic on each chord's root.
    solo: {
      "lost-the-thread": 2,
      "off-the-density": 3,
      "off-the-register": 0.15,
      "peak-thrown-away": 0.5,
      "leaps-left-hanging": 0.75,
      rocks: 3,
      "doubles-the-bass": 0.3,
      "rests-where-the-last-did": 0.5,
      "runs-on": 0.3,
      "bars-in-a-row": 0.75,
      "changes-down-the-list": 0.5,
      "beats-off-the-chord": 1,
    },
  },
};
