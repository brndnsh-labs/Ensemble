// What the critic expects of a reggae band, and what its players' choices cost.
// An `intent` bound is true whatever the band currently plays; a `measured`
// bound sits a margin from what it delivers today.

import type { CriticStyle } from "@ensemble/engine";

export const reggaeCritic: CriticStyle = {
  targets: {
    // How many jams thin at all, of those that could, on this scorecard's jams, which are mostly
    // short: a jam of eight passes thins about half the time (docs/decisions/styles.md, who is in).
    "band.takes-thinned": { min: 0.06, max: 0.26, kind: "measured" },
    // ── drums ──
    // The drop on 3 in every bar at every level (ST-reggae-05: floor 90%).
    "drums.drop-on-three": { min: 0.9, kind: "intent" },
    // No kick on the One when quiet (ST-reggae-05: ceiling 2% at low).
    "drums.kick-on-one-quiet": { max: 0.02, kind: "intent", minCases: 8 },
    "drums.same-groove": { min: 0.75, kind: "intent", minCases: 8 },
    // A section turns its answer bars one way (ST-reggae-09). No target for how many answer
    // bars turn: the quiet one drop has none (ST-reggae-06), so a quiet take reads 0.
    "drums.turn-held": { min: 0.86, kind: "intent", minCases: 4 },
    // ── bass ──
    // The One in 15% to 75% of bars; 20% to 60% of the bar silent (ST-reggae-17). Both are the
    // band's over many takes: a take of one section plays one riff, which has the One in every
    // bar or in none (but where the kick puts it there), so by take these read 0% or 100%.
    // Over everything the One is 69% and the silence 24%; a quiet take on heavy halves
    // (ST-reggae-12's own riff, three in six when quiet) is 6% silent.
    "bass.on-the-one": { min: 0.15, max: 0.75, kind: "intent", minCases: 8 },
    "bass.silence": { min: 0.2, max: 0.6, kind: "intent", minCases: 64 },
    "bass.lead-ins-that-leap": { max: 0.05, kind: "intent", minCases: 5 },
    // Deep: mean pitch 32 to 42 (ST-reggae-15).
    "bass.register": { min: 32, max: 42, kind: "intent" },
    // ── band ──
    "band.notes-near-the-top": { max: 0.02, kind: "intent" },
    // ── chords ──
    // The chop on 2 and 4 the loudest stroke, 1.15 to 1.4 times the others when hot; nothing on
    // 1 or 3 (ST-reggae-20: ceiling 5%).
    "chords.on-one-and-three": { max: 0.05, kind: "intent", minCases: 8 },
    "chords.chop-loudest": { min: 0.95, kind: "intent", minCases: 8 },
    "chords.chop-over-the-rest": { min: 1.15, max: 1.4, kind: "intent", minCases: 8 },
    // Tight three-note chords, no extensions (ST-reggae-21: ceiling 15%).
    "chords.colour": { max: 0.15, kind: "intent", minCases: 8 },
    // High on the neck, G3 up (ST-reggae-18): a three-string grip topped near C5 bottoms out
    // around E4.
    "chords.lowest-note": { min: 60, max: 70, kind: "intent", minCases: 8 },
    "chords.top-leaps": { max: 0.22, kind: "intent", minCases: 8 },
    "chords.floor-clearance": { min: 0, kind: "intent" },
    "chords.closest-to-bass": { min: 1, kind: "intent" },
    "chords.crowds-the-bass": { max: 0.05, kind: "intent", minCases: 8 },
    "chords.voicing-faults": { max: 0.02, kind: "intent", minCases: 8 },
    "chords.width-jumps": { max: 0.01, kind: "intent", minCases: 8 },
    // No anticipation from the guitar at any energy (ST-reggae-29).
    "chords.changes-anticipated": { max: 0, kind: "intent", minCases: 10 },
    "chords.short-stabs": { min: 0.9, kind: "intent", minCases: 20 },
    "chords.line-kept": { min: 0.95, kind: "intent", minCases: 8 },
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
    // A reggae line starts after the One (ST-reggae-25): it is led into very seldom.
    "solo.entered-early": { max: 0.15, kind: "intent", minCases: 6 },
  },
  weights: {
    // What a grip costs: the funk guitar's, the top held where the style aims it (ST-reggae-18).
    voicing: {
      "outside-register": 40,
      "top-from-target": 0.8,
      "top-out-of-reach": 4,
      "hand-movement": 0.5,
      "top-movement": 0.6,
      "minor-ninths": 12,
      "minor-seconds": 8,
      "minor-seconds-thin": 24,
      "sharp-nine-under-third": 20,
      "low-intervals": 10,
    },
    // A groove: one figure for the section, nothing to choose between.
    comping: {},
    // The disco soloist's costs, with the style's own list of where a change lands, and a
    // note on a beat off the chord costing twice what it does there: in a major key the line
    // runs the whole major scale, and at 1 a take on the one-four in G had 52% of its beats on
    // chord tones (Q-22's floor is 72%); at 2 every take is over it, the lowest 73%.
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
      "beats-off-the-chord": 2,
    },
  },
};
