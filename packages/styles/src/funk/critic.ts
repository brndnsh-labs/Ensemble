// What the critic expects of a funk band, and what its players' choices cost.
// An `intent` bound is true whatever the band currently plays; a `measured` bound
// sits a margin from what it delivers today.

import type { CriticStyle } from "@ensemble/engine";

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
    // Numbers beside a bound are from 200 takes of the library.
    //
    // A chord's arrival always gets its root, whatever the riff says there (ST-funk-17).
    "bass.changes-stated": { min: 0.95, kind: "intent" },
    // The One is always there.
    "bass.on-the-one": { min: 0.95, kind: "intent", minCases: 8 },
    // 10% to 60% of notes on the sixteenths between the eighths (ST-funk-22): 33%.
    "bass.syncopated-sixteenths": { min: 0.1, max: 0.6, kind: "intent", minCases: 40 },
    // Locked to the kick. The old band's floor was 35% of kicks doubled (ST-funk-22); here a
    // root goes wherever the kick plays and the riff is silent (BA-39), so every kick has
    // the bass on it.
    "bass.kicks-doubled": { min: 0.9, kind: "intent", minCases: 8 },
    // The riff is the same riff in every bar (X-A-29): the front half of the bar, where
    // no turn, fill or lead-in reaches, keeps its rhythm in every bar of every take.
    "bass.riff-held": { min: 0.95, kind: "intent", minCases: 8 },
    // Short notes: never more than two and a quarter sixteenths (ST-funk-18); 1.4 on average.
    "bass.note-length": { max: 2.25, kind: "intent", minCases: 40 },
    // Dead notes past the quiet level: 15% of notes over everything, none in a section
    // whose riff has none, 26% in the take with the most.
    "bass.dead-notes": { max: 0.3, kind: "measured", minCases: 40 },
    // Into a change, the riff's last sixteenth leans in three times in ten at most (BA-41):
    // 11% of all changes, since most riffs have no note there.
    "bass.half-step-approaches": { max: 0.35, kind: "intent", minCases: 8 },
    "bass.lead-ins-that-leap": { max: 0.05, kind: "intent", minCases: 5 },
    // The line lives low (gate 3). Every root has one place, F1 to E2, so the average note
    // is B1 to D2 in every key of the library but E, where the root is E2 and the pops are
    // on E3: G2 on the one-chord vamp, with 16% of its notes above D3 (none are in C or D
    // minor, 1% in A, 5% on the verse and bridge in E). That is where a riff in E is
    // fingered; if it reads high, `register` in bass.ts is the one line that puts E on the
    // open string.
    "bass.register": { min: 33, max: 45, kind: "measured" },
    "bass.high-notes": { max: 0.25, kind: "measured", minCases: 40 },
    // ── chords ──
    // The grip (ST-funk-26). The top of it is a line: it holds or steps, and seldom jumps
    // more than a fourth (CH-17; 2% of changes delivered).
    "chords.top-leaps": { max: 0.22, kind: "intent", minCases: 8 },
    "chords.top-movement": { max: 3.5, kind: "intent", minCases: 8 },
    // Inside its window and clear of the bass (X-B-03).
    "chords.floor-clearance": { min: 0, kind: "intent" },
    "chords.closest-to-bass": { min: 1, kind: "intent" },
    "chords.crowds-the-bass": { max: 0.05, kind: "intent", minCases: 8 },
    // The bottom string of the grip: delivers G#3 to B3 (56.0 to 58.7), by chart.
    "chords.lowest-note": { min: 53, max: 62, kind: "measured", minCases: 8 },
    // The 9th or 13th on every dominant and major chord (CH-14: a half and up). A minor 7th
    // is played plain here, so a minor-key chart sits near a half: delivers 42% at the lowest.
    "chords.colour": { min: 0.35, max: 1, kind: "measured", minCases: 8 },
    // What the chart writes is heard (X-B-13), all but one tone: the 9th of a 13 chord, which
    // a three-string stab gives up for the 13th (CH-08). Delivers 85% on the chart with a G13.
    "chords.written-tensions": { min: 0.8, kind: "measured", minCases: 5 },
    "chords.voicing-faults": { max: 0.02, kind: "intent", minCases: 8 },
    "chords.width-jumps": { max: 0.01, kind: "intent", minCases: 8 },
    // The hand stays in one position (ST-funk-26): delivers 1.2 frets a change on average,
    // 1.8 at the most, and never a shift past a hand's width.
    "chords.neck-movement": { max: 2.5, kind: "measured", minCases: 8 },
    "chords.neck-jumps": { max: 0.05, kind: "measured", minCases: 8 },
    // The hand never stops (ST-funk-28, CH-52): 8 to 16 strokes a bar from the working level
    // up, 30% to 80% of them scratches; every sixteenth when hot; the stabs alone when quiet.
    "chords.strokes-per-bar": { min: 8, max: 16, kind: "intent", minCases: 8 },
    "chords.strokes-per-bar-hot": { min: 14, max: 16, kind: "intent", minCases: 8 },
    "chords.strokes-per-bar-quiet": { min: 4, max: 8, kind: "intent", minCases: 8 },
    "chords.scratches": { min: 0.3, max: 0.8, kind: "intent", minCases: 20 },
    "chords.scratches-quiet": { max: 0, kind: "intent", minCases: 20 },
    // At least 60% of the stabs off the beat, at least 90% of them short (ST-funk-28).
    "chords.off-the-beat": { min: 0.6, kind: "intent", minCases: 20 },
    "chords.short-stabs": { min: 0.9, kind: "intent", minCases: 20 },
    // It leans into a change now and then, never most of the time (ST-funk-38: one in ten,
    // one in five when hot; a loud take of few changes has reached 36%).
    "chords.changes-anticipated": { max: 0.4, kind: "intent", minCases: 10 },
    // A section's line is its line every time it comes round (Q-18, X-B-14), and most bars
    // are that line untouched (ME-27); the rest are the turn at a phrase's end. Delivers 76%
    // on a vamp with no changes, where every turn shows, and more where a change hides it.
    "chords.line-kept": { min: 0.95, kind: "intent", minCases: 8 },
    "chords.bars-on-the-line": { min: 0.6, kind: "measured", minCases: 8 },
    // A groove does not react to a soloist: about as busy in the breaths as under the line,
    // where a comp that converses is busier in them (CH-72). Counting stabs only (a scratch
    // is not a strike) it delivers 0.87, and by take 0.66 to 1.24: where the breaths happen
    // to fall against the line's stabs, not the hand answering.
    "chords.breaths-over-the-line": { min: 0.6, max: 1.3, kind: "measured", minCases: 4 },
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
    // What a grip costs (CH-16, CH-21): the piano's penalties with a stronger pull on the top
    // note, 0.8 a semitone against the piano's 0.35, so the hand stays where the style aims
    // it (CH-22, ST-funk-26).
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
    // A groove: one line for the section and one way to play a phrase of it, so the critic
    // has nothing to choose between.
    comping: {},
    // ── bass ──
    // What a phrase of the riff costs. The riff itself is not a choice; what is weighed is
    // whether the phrase's last bar turns (a turn is counted where a walk is), and which
    // of the last-sixteenth notes lean into a change. Each was set to zero in turn over
    // 200 takes (ME-10); what it moved is beside it. As built, three chorus tops in four
    // are turned into (681 of 894) and one line end in eight inside a chorus (213 of 1,708).
    bass: {
      // Not the phrase before again: at zero, no line inside a chorus ever turns.
      "same-as-last": 0.5,
      // The top of a chorus is where a turn belongs: at zero, tops turned into 76% to 28%.
      "turnaround-unwalked": 1,
      // And inside a chorus it costs: at zero, line ends turned 12% to 26%.
      "walk-out-of-place": 0.5,
    },
  },
};
