// What the critic expects of a disco band, and what its players' choices cost.
// An `intent` bound is true whatever the band currently plays; a `measured` bound
// sits a margin from what it delivers today.

import type { CriticStyle } from "@ensemble/engine";

export const discoCritic: CriticStyle = {
  targets: {
    // ── drums ──
    // The kick on every beat is the property (ST-disco-04); the One and the backbeat in every
    // bar of time follow from it.
    "drums.kick-on-one": { min: 0.98, kind: "intent" },
    "drums.backbeat": { min: 0.9, kind: "intent" },
    "drums.same-groove": { min: 0.75, kind: "intent", minCases: 8 },
    // No target for fills that repeat: the notes give one fill to each length and tier (the bark
    // at the end of every phrase), and a disco drummer plays it every time.
    "drums.cymbal-under-backbeat": { min: 0.95, kind: "intent", minCases: 8 },
    // ── bass ──
    "bass.changes-stated": { min: 0.95, kind: "intent" },
    "bass.on-the-one": { min: 0.95, kind: "intent", minCases: 8 },
    "bass.kicks-doubled": { min: 0.9, kind: "intent", minCases: 8 },
    "bass.lead-ins-that-leap": { max: 0.05, kind: "intent", minCases: 5 },
    // Bouncing: 80% of a gap of two sixteenths at most, three when quiet (ST-disco-13), so never
    // more than 2.4 sixteenths; a quiet take's average is that, give or take the feel. Delivers
    // 1.6 over everything.
    "bass.note-length": { max: 2.45, kind: "intent", minCases: 40 },
    // The one octave for the whole song (ST-disco-12): mean pitch 34 to 42. Delivers 37.8; a
    // quiet take in a low key, with no octaves on top of its quarter roots, reads under 34 (32.5
    // at the least, the falling fifths in E minor), which is the 4% out of target.
    "bass.register": { min: 34, max: 42, kind: "intent" },
    // ── band ──
    "band.backbeat-level": { min: 60, max: 108, kind: "intent" },
    "band.notes-near-the-top": { max: 0.02, kind: "intent" },
    // ── chords ──
    "chords.top-leaps": { max: 0.22, kind: "intent", minCases: 8 },
    // A small step on average. The major groove in D moves four semitones at every change and
    // cannot do less: from Dmaj9 (E4 F#4 C#5) the nearest Gmaj9 a four-fret hand can hold is
    // B3 F#4 A4, since F#4 A4 B4 spans five frets. Delivers 1.7 over everything.
    "chords.top-movement": { max: 4, kind: "measured", minCases: 8 },
    "chords.floor-clearance": { min: 0, kind: "intent" },
    "chords.closest-to-bass": { min: 1, kind: "intent" },
    "chords.crowds-the-bass": { max: 0.05, kind: "intent", minCases: 8 },
    // Small and bright, high on the neck: mean lowest note 60 to 68 (ST-disco-16).
    "chords.lowest-note": { min: 60, max: 68, kind: "intent", minCases: 8 },
    "chords.voicing-faults": { max: 0.02, kind: "intent", minCases: 8 },
    "chords.width-jumps": { max: 0.01, kind: "intent", minCases: 8 },
    "chords.neck-movement": { max: 2.5, kind: "measured", minCases: 8 },
    "chords.neck-jumps": { max: 0.05, kind: "measured", minCases: 8 },
    // Every sixteenth a stroke from the working level up; eighths when quiet (ST-disco-17).
    "chords.strokes-per-bar": { min: 8, max: 16, kind: "intent", minCases: 8 },
    "chords.strokes-per-bar-hot": { min: 14, max: 16, kind: "intent", minCases: 8 },
    "chords.strokes-per-bar-quiet": { min: 7, max: 9, kind: "intent", minCases: 8 },
    "chords.off-the-beat": { min: 0.6, kind: "intent", minCases: 20 },
    "chords.short-stabs": { min: 0.9, kind: "intent", minCases: 20 },
    // Disco changes land on the One: only the hot chop on the "and" of 4 leans in, 15%
    // (ST-disco-28).
    "chords.changes-anticipated": { max: 0.35, kind: "intent", minCases: 10 },
    "chords.line-kept": { min: 0.95, kind: "intent", minCases: 8 },
    // ── solo ──
    "solo.changes-on-chord-tones": { min: 1, kind: "intent" },
    // Changes land on the 3rd or the 7th (ST-disco-21): the landing is the best of the chord's
    // tones near where the line is, so not every one. Delivers 78%, 70% or more in nine takes of
    // ten, 50% at the least.
    "solo.thirds-and-sevenths-on-changes": { min: 0.6, kind: "measured", minCases: 8 },
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
    // Range 11 to 24 semitones (ST-disco-27).
    "solo.range": { min: 11, max: 24, kind: "intent" },
    "solo.wide-leaps": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.trills": { max: 0.05, kind: "intent", minCases: 20 },
    // 60% to 90% short notes; 10% to 35% rests (ST-disco-27).
    "solo.short-notes": { min: 0.6, max: 0.9, kind: "intent", minCases: 20 },
    "solo.silent-sixteenths": { min: 0.1, max: 0.35, kind: "intent", minCases: 32 },
    "solo.barlines-tied": { max: 0, kind: "intent" },
    // Some phrases are led into, few: 14% of a take's on the mean today (SO-39's ceiling).
    "solo.entered-early": { max: 0.4, kind: "intent", minCases: 6 },
    "solo.cost": { max: 2.45, kind: "measured" },
  },
  weights: {
    // What a grip costs: the funk guitar's, the top held where the style aims it (ST-disco-16).
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
    // A groove: one line for the section, nothing to choose between.
    comping: {},
    // The rock soloist's costs, with the style's own list of where a change lands.
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
