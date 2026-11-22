// What the critic expects of a rock band, and what its players' choices cost.
// An `intent` bound is true whatever the band currently plays; a `measured` bound
// sits a margin from what it delivers today.

import type { CriticStyle } from "@ensemble/engine";

export const rockCritic: CriticStyle = {
  targets: {
    // Everyone stays in (docs/decisions/styles.md, who is in).
    "band.takes-thinned": { max: 0, kind: "intent" },
    "drums.laid-out": { max: 0, kind: "intent" },
    "bass.laid-out": { max: 0, kind: "intent" },
    "chords.laid-out": { max: 0, kind: "intent" },
    // ── drums ──
    // Kick on 1 in 95% of bars, the backbeat in 90% (ST-rock-11).
    "drums.kick-on-one": { min: 0.95, kind: "intent" },
    "drums.backbeat": { min: 0.9, kind: "intent" },
    "drums.same-groove": { min: 0.75, kind: "intent", minCases: 8 },
    "drums.fills-that-repeat": { max: 0.1, kind: "intent", minCases: 4 },
    "drums.cymbal-under-backbeat": { min: 0.95, kind: "intent", minCases: 8 },
    // Answer bars differ from the bar before at least half the time, and a section turns them
    // the same way at least 83% of the time (ST-rock-11).
    "drums.answer-bars": { min: 0.5, kind: "intent", minCases: 4 },
    "drums.turn-held": { min: 0.83, kind: "intent", minCases: 4 },
    // ── bass ──
    "bass.changes-stated": { min: 0.95, kind: "intent" },
    "bass.on-the-one": { min: 0.95, kind: "intent", minCases: 8 },
    // No sixteenth syncopation at all: ceiling 5% (ST-rock-16).
    "bass.syncopated-sixteenths": { max: 0.05, kind: "intent", minCases: 40 },
    // Locked to the kick: a root wherever the drummer's foot falls (ST-rock-12).
    "bass.kicks-doubled": { min: 0.9, kind: "intent", minCases: 8 },
    "bass.lead-ins-that-leap": { max: 0.05, kind: "intent", minCases: 5 },
    "bass.half-step-approaches": { max: 0.35, kind: "intent", minCases: 8 },
    // The line lives low: every root sits from E1 to E2, nearest the section's home (C2 to
    // E2), so a tune in A or G is on the open string and the third fret (ST-rock-16). The
    // average note delivers B1 to E2 by take (31.0 to 40.0); 1% of notes are above D3, the
    // high tier's octave pops.
    "bass.register": { min: 30, max: 41, kind: "measured" },
    "bass.high-notes": { max: 0.1, kind: "measured", minCases: 40 },
    // ── band ──
    "band.backbeat-level": { min: 60, max: 108, kind: "intent" },
    "band.notes-near-the-top": { max: 0.02, kind: "intent" },
    // ── chords ──
    "chords.top-leaps": { max: 0.22, kind: "intent", minCases: 8 },
    "chords.top-movement": { max: 3.5, kind: "intent", minCases: 8 },
    "chords.floor-clearance": { min: 0, kind: "intent" },
    "chords.closest-to-bass": { min: 1, kind: "intent" },
    "chords.crowds-the-bass": { max: 0.05, kind: "intent", minCases: 8 },
    // The bottom of the triad: delivers G3 to C4 by take (55.5 to 60.6), the top aimed at G4.
    "chords.lowest-note": { min: 54, max: 63, kind: "measured", minCases: 8 },
    // Under 15% of strikes carry a jazz extension (ST-rock-17).
    "chords.colour": { max: 0.15, kind: "intent", minCases: 8 },
    "chords.written-tensions": { min: 0.9, kind: "intent", minCases: 5 },
    "chords.voicing-faults": { max: 0.02, kind: "intent", minCases: 8 },
    "chords.width-jumps": { max: 0.01, kind: "intent", minCases: 8 },
    // A held chord, quarters, eighths (ST-rock-18).
    "chords.strikes-per-bar-quiet": { min: 1, max: 2, kind: "intent", minCases: 8 },
    "chords.strikes-per-bar-mid": { min: 3.5, max: 4.5, kind: "intent", minCases: 8 },
    "chords.strikes-per-bar-loud": { min: 6, max: 8, kind: "intent", minCases: 8 },
    // At most 35% of strikes off the beat over everything (ST-rock-18): delivers 23%. By take
    // a hot take pumps eighths, half of them on the "and", and nothing else: a take is held
    // at a half.
    "chords.off-the-beat": { max: 0.5, kind: "intent", minCases: 20 },
    // None from the comp, at any energy (ST-rock-27).
    "chords.changes-anticipated": { max: 0, kind: "intent", minCases: 10 },
    "chords.on-the-soloists-note": { max: 0.15, kind: "intent", minCases: 20 },
    "chords.top-leaps-under-the-solo": { max: 0.01, kind: "intent", minCases: 20 },
    "chords.strikes-per-bar-under-a-hot-solo": { max: 4.5, kind: "intent", minCases: 8 },
    // ── solo ──
    "solo.changes-on-chord-tones": { min: 1, kind: "intent" },
    // 5ths and roots on 45% to 80% of changes, the 3rd or 7th on 20% to 55% (ST-rock-26).
    "solo.roots-and-fifths-on-changes": { min: 0.45, max: 0.8, kind: "intent", minCases: 8 },
    "solo.thirds-and-sevenths-on-changes": { min: 0.2, max: 0.55, kind: "intent", minCases: 8 },
    // Under 20% chromatic approaches (ST-rock-26).
    "solo.chromatic-approaches": { max: 0.2, kind: "intent", minCases: 8 },
    // Range 11 to 26 semitones (ST-rock-26).
    "solo.range": { min: 11, max: 26, kind: "intent" },
    "solo.beats-on-chord-tones": { min: 0.72, kind: "intent", minCases: 20 },
    "solo.phrase-ends-on-chord-tones": { min: 0.85, kind: "intent", minCases: 6 },
    "solo.phrases-related": { min: 0.35, kind: "measured", minCases: 6 },
    "solo.phrase-same-as-last": { max: 0.4, kind: "measured", minCases: 6 },
    "solo.bars-that-rhyme": { min: 0.5, kind: "measured", minCases: 6 },
    "solo.empty-bars": { min: 0.05, max: 0.3, kind: "measured", minCases: 12 },
    "solo.long-breaths": { max: 0.12, kind: "intent", minCases: 8 },
    "solo.breath": { min: 0.4, kind: "intent", minCases: 4 },
    "solo.phrases-breathe": { min: 1, kind: "intent", minCases: 4 },
    "solo.builds": { min: 1.5, max: 4, kind: "intent" },
    "solo.rises": { min: 2, kind: "measured" },
    "solo.top-in-last-chorus": { min: 0.85, kind: "intent" },
    "solo.high-points-deserved": { min: 0.6, kind: "measured", minCases: 6 },
    "solo.wide-leaps": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.trills": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.repeated-notes": { max: 0.1, kind: "measured", minCases: 20 },
    // No ties over the barline (ST-rock-24). True by construction: a tripwire.
    "solo.barlines-tied": { max: 0, kind: "intent" },
    // Some phrases are led into, never most of them: leading into every phrase is a
    // mannerism (SO-39). A take's share is 26% on the mean today.
    "solo.entered-early": { max: 0.5, kind: "intent", minCases: 6 },
    // How much the lead guitar bends and shakes, for an ear to move: today a bent note
    // every eight bars of a solo and two shaken notes every three bars. The bands sit a margin
    // outside what is delivered, so the scorecard names a solo with none or with a crowd.
    "solo.bends": { min: 0.02, max: 0.3, kind: "measured" },
    "solo.shakes": { min: 0.3, max: 0.9, kind: "measured" },
    // Not a target for the music: a ceiling one take in ten sat above when it was set, so that
    // the scorecard would name the worst solos. The measure names them by itself now (#2247);
    // the ceiling stays because `score --check` has held the share under it since.
    "solo.cost": { max: 2.45, kind: "measured" },
  },
  weights: {
    // The blues piano's voicing costs: close triads in one hand, led smoothly, kept off the
    // soloist's note.
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
      "on-the-soloists-note": 26,
      "on-the-soloists-octave": 7,
      "in-the-soloists-register": 3,
      "top-leap": 10,
      "crowds-the-bass-under-the-line": 4,
    },
    // The quiet pad is the one figure that is not a groove: under a soloist it may lay out and
    // answer, as the blues pad does, with the blues piano's costs.
    comping: {
      "off-the-drums": 2,
      "under-the-soloist": 6,
      thinned: 2,
      "breaths-unanswered": 0.5,
      "breaths-left-empty": 1.5,
      "steps-on-the-entrance": 1,
      "off-the-energy": 1,
      "one-bar": 0.5,
      "no-return": 1,
      "same-as-last": 0.25,
      "same-as-last-time": 0.3,
    },
    // The blues soloist's costs, with the funk soloist's list of where a change lands.
    solo: {
      "lost-the-thread": 2,
      "off-the-density": 3,
      "off-the-register": 0.15,
      "peak-thrown-away": 0.5,
      "leaps-left-hanging": 0.75,
      stuck: 3,
      "doubles-the-bass": 0.3,
      "rests-where-the-last-did": 0.5,
      "runs-on": 0.3,
      "bars-in-a-row": 0.75,
      "changes-down-the-list": 0.5,
      "beats-off-the-chord": 1,
    },
  },
};
