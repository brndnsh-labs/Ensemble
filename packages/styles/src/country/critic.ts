// What the critic expects of a country band, and what its players' choices
// cost. An `intent` bound is true whatever the band currently plays; a
// `measured` bound sits a margin from what it delivers today.

import type { CriticStyle } from "@ensemble/engine";

export const countryCritic: CriticStyle = {
  targets: {
    // Everyone stays in (docs/decisions/styles.md, who is in).
    "band.takes-thinned": { max: 0, kind: "intent" },
    "drums.laid-out": { max: 0, kind: "intent" },
    "bass.laid-out": { max: 0, kind: "intent" },
    "chords.laid-out": { max: 0, kind: "intent" },
    // ── drums ──
    "drums.kick-on-one": { min: 0.95, kind: "intent", minCases: 8 },
    "drums.same-groove": { min: 0.75, kind: "intent", minCases: 8 },
    "drums.turn-held": { min: 0.86, kind: "intent", minCases: 4 },
    // DR-58, DR-59: the two-step in 70% of working sections, the lattice in 60% of hot ones in four.
    "drums.two-step": { min: 0.6, max: 0.8, kind: "intent" },
    "drums.lattice": { min: 0.5, max: 0.7, kind: "intent" },
    // ── bass ──
    // BA-51: root on 1 and fifth on 3 in at least 90% of bars, 0.5 to 0.75 notes a beat.
    "bass.boom-chick": { min: 0.9, kind: "intent", minCases: 8 },
    "bass.notes-per-beat": { min: 0.5, max: 0.75, kind: "intent", minCases: 32 },
    // BA-51: the fifth under the root wherever it fits; ST-country-05: a walk's note on 4 never
    // a half step over a tone of its chord.
    "bass.fifth-under": { min: 0.98, kind: "intent", minCases: 8 },
    "bass.walks-that-rub": { max: 0, kind: "intent", minCases: 4 },
    // BA-53: 20% to 60% of changes walked.
    "bass.changes-walked": { min: 0.2, max: 0.6, kind: "intent", minCases: 8 },
    "bass.lead-ins-that-leap": { max: 0.03, kind: "intent", minCases: 5 },
    "bass.register": { min: 30, max: 40, kind: "measured" },
    // ── band ──
    "band.notes-near-the-top": { max: 0.02, kind: "intent" },
    // ── chords ──
    "chords.top-leaps": { max: 0.1, kind: "intent", minCases: 8 },
    "chords.top-movement": { max: 2, kind: "intent", minCases: 8 },
    // The chick is the top four strings: the hand's lowest note is the D string's, about E3.
    "chords.lowest-note": { min: 48, max: 56, kind: "measured", minCases: 8 },
    "chords.floor-clearance": { min: 0, kind: "intent" },
    "chords.voicing-faults": { max: 0.02, kind: "intent", minCases: 8 },
    "chords.line-kept": { min: 0.95, kind: "intent", minCases: 8 },
    "chords.neck-movement": { max: 2, kind: "measured", minCases: 8 },
    "chords.neck-jumps": { max: 0.05, kind: "measured", minCases: 8 },
    // ── solo ──
    "solo.changes-on-chord-tones": { min: 1, kind: "intent" },
    "solo.thirds-and-sevenths-on-changes": { min: 0.3, kind: "measured", minCases: 8 },
    "solo.beats-on-chord-tones": { min: 0.72, kind: "intent", minCases: 20 },
    "solo.phrase-ends-on-chord-tones": { min: 0.85, kind: "intent", minCases: 6 },
    "solo.long-breaths": { max: 0.12, kind: "intent", minCases: 8 },
    "solo.breath": { min: 0.4, kind: "intent", minCases: 4 },
    "solo.phrases-breathe": { min: 1, kind: "intent", minCases: 4 },
    "solo.builds": { min: 1.3, max: 4, kind: "intent" },
    "solo.top-in-last-chorus": { min: 0.85, kind: "intent" },
    "solo.wide-leaps": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.trills": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.short-notes": { max: 0.8, kind: "measured", minCases: 20 },
    "solo.barlines-tied": { max: 0, kind: "intent" },
    // ST-country-08: the curl into the major third and the steel's whole step both heard, a
    // few a chorus (0.07 a bar today, half of them whole steps); a shake on the half notes.
    "solo.bends": { min: 0.03, max: 0.2, kind: "measured", minCases: 8 },
    "solo.whole-step-bends": { min: 0.2, max: 0.8, kind: "measured", minCases: 4 },
    "solo.shakes": { min: 0.2, max: 0.9, kind: "measured", minCases: 8 },
  },
  weights: {
    // What a grip costs (CH-16, CH-24). Only the top string is led from chord to chord: the
    // rest of an open chord is where the chord is. A string left silent costs what CH-24's
    // rewards add up to for an open one (a sounding string is worth 4 semitones of movement
    // and an open one 6 more, at half a point a semitone), a stopped string the open one's
    // share; a string muted inside the grip costs a little more than the silent string it
    // also is, so B is the barre x24442 and not x21x02 round the open B string.
    voicing: {
      "outside-register": 40,
      "top-from-target": 0.35,
      "top-out-of-reach": 4,
      "top-movement": 1.1,
      "silent-strings": 5,
      "stopped-strings": 3,
      "muted-inside": 3,
      "minor-ninths": 12,
      "minor-seconds": 8,
      "minor-seconds-thin": 24,
      "sharp-nine-under-third": 20,
      "low-intervals": 10,
    },
    // A groove: one figure for the section, nothing to choose between.
    comping: {},
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
