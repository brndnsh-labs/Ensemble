// What the critic expects of a jazz band, and what its players' choices cost.
// An `intent` bound is true whatever the band currently plays; a `measured` bound
// sits a margin from what it delivers today.

import type { CriticStyle } from "@ensemble/engine";

export const jazzCritic: CriticStyle = {
  targets: {
    // How many jams thin at all, of those that could (docs/decisions/styles.md, who is in).
    "band.takes-thinned": { min: 0.05, max: 0.25, kind: "intent" },
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
    // Numbers beside a bound are from 200 takes of the library on the same seeds, three
    // basses: as built; the first walk drawn for each phrase, no critic; and the old band's
    // way, one weighted draw a note by the notes' weights alone, no candidates.
    //
    // A chord's arrival is its bass note, every time: the notes' occasional third (BA-22)
    // is not built.
    "bass.changes-stated": { min: 0.95, kind: "intent" },
    // In four past the quiet level, in two under it (ST-jazz-24, BA-23).
    "bass.notes-per-beat-walking": { min: 0.85, max: 1.05, kind: "intent", minCases: 8 },
    // In six (AU-93): two to five notes a bar up to the hot level, three to seven in it,
    // and both strong beats played.
    "bass.notes-per-bar-in-six": { min: 2, max: 5, kind: "intent", minCases: 8 },
    "bass.notes-per-bar-in-six-hot": { min: 3, max: 7, kind: "intent", minCases: 4 },
    "bass.strong-beats-in-six": { min: 0.98, kind: "intent", minCases: 8 },
    // In six (AU-94): one to four chords a bar, seven in ten on a strong beat or the
    // eighth before one.
    "chords.strikes-per-bar-in-six": { min: 1, max: 4, kind: "intent", minCases: 8 },
    "chords.on-the-strong-beats-in-six": { min: 0.7, kind: "intent", minCases: 8 },
    "bass.notes-per-beat-when-quiet": { min: 0.45, max: 0.75, kind: "intent", minCases: 4 },
    // The walk never repeats a pitch, and moves 1.5 to 4.5 semitones on average (BA-20).
    "bass.repeated-notes": { max: 0.02, kind: "intent", minCases: 40 },
    "bass.semitones-per-move-walking": { min: 1.5, max: 4.5, kind: "intent", minCases: 40 },
    // 30% to 80% of the changes a walk makes are approached by a half step (BA-21). It
    // delivers 61% (56% with no critic); one take in ten is under 50% or over 68%.
    "bass.half-steps-into-changes-walking": { min: 0.3, max: 0.8, kind: "intent", minCases: 8 },
    // A held note is a chord tone, and a lead-in sits beside the note it leads to (ST-jazz-22).
    "bass.held-notes-on-the-chord": { min: 0.97, kind: "intent", minCases: 4 },
    "bass.lead-ins-that-leap": { max: 0.05, kind: "intent", minCases: 5 },
    // Chord tones on 1 and 3: 93.5% as built, 91% first walk, 92% the old way; 89.5% with
    // the critic's weight for it at zero.
    "bass.strong-beats-on-the-chord": { min: 0.85, kind: "measured", minCases: 16 },
    // A line with a direction. Moves in a row the same way before it turns: 3.0 as built
    // (one take in ten under 2.7), 2.36 first walk, 2.05 the old way, so the floor is one no
    // take of the old way's reaches and one first walk in five does. Straight back to the
    // note just left: 3.5% of moves as built, 7% first walk, 14% the old way.
    "bass.run-length": { min: 2.5, kind: "measured", minCases: 16 },
    "bass.rocking": { max: 0.08, kind: "measured", minCases: 40 },
    // A walk that repeats is heard at once. The bar before again: 0.2%, two-chord bars
    // whose four notes are forced. The bar at this place last chorus, as a shape: 4% as
    // built, 9% first walk, 13% the old way.
    "bass.bar-same-as-the-bar-before": { max: 0.03, kind: "intent", minCases: 8 },
    "bass.bars-same-as-last-chorus": { max: 0.15, kind: "measured", minCases: 12 },
    "bass.chorus-same-as-last": { max: 0.01, kind: "intent", minCases: 2 },
    // The line lives low (gate 3: "we should sit in a typical bass guitar register"). Its
    // home is D2 (ST-jazz-18) and its average note is within a step of that in every key
    // of the library (Db2 to Eb2); 0.4% of its notes are above D3, 2% on the modal tune.
    "bass.register": { min: 34, max: 42, kind: "intent" },
    "bass.high-notes": { max: 0.05, kind: "intent", minCases: 40 },
    // ── chords ──
    // Measured over 200 takes of the seven jazz charts (`ensemble score --style jazz`), each
    // also played by a piano deaf to the soloist and by one taking the first plan drawn
    // (ME-10). "Deaf" and "first" below are those two.
    //
    // The top of the hand is a line (Q-04, Q-05): it leaps more than a 4th at 0.1% of
    // changes and moves 1.0 semitone on average. Through a ii-V-I it holds a common tone at
    // 46% of changes and steps at 44%, so the floor on steps is lower than the blues'.
    "chords.top-leaps": { max: 0.22, kind: "intent", minCases: 8 },
    "chords.top-movement": { max: 3.5, kind: "intent", minCases: 8 },
    "chords.top-steps": { min: 0.2, kind: "measured", minCases: 8 },
    "chords.top-small-leaps": { max: 0.3, kind: "measured", minCases: 8 },
    "chords.top-holds": { max: 0.65, kind: "measured", minCases: 8 },
    "chords.floor-clearance": { min: 0, kind: "intent" },
    "chords.closest-to-bass": { min: 1, kind: "intent" },
    "chords.crowds-the-bass": { max: 0.05, kind: "intent", minCases: 8 },
    // The bottom of the hand between Bb3 and E4 (ST-jazz-25, CH-19). Delivers 58.9 (deaf
    // 59.4): 59.4 with nobody soloing, 57.6 under the alto, which presses the hand down. Aiming
    // the top a semitone higher puts 86% of takes in the band and the piano on the soloist's
    // note 22% of the time instead of 17%; the soloist's note is the one kept.
    "chords.lowest-note": { min: 58, max: 64, kind: "intent", minCases: 8 },
    // Six strikes in ten or more carry a 9th or a 13th (ST-jazz-25). Delivers 87%: what is
    // missing is the half-diminished and diminished chords, which are their own four notes.
    "chords.colour": { min: 0.6, max: 1, kind: "intent", minCases: 8 },
    "chords.written-tensions": { min: 0.9, kind: "intent", minCases: 5 },
    "chords.voicing-faults": { max: 0.02, kind: "intent", minCases: 8 },
    "chords.width-jumps": { max: 0.01, kind: "intent", minCases: 8 },
    // How busy: about two strikes a bar at every level, the loud band to itself a stab more in
    // some bars (ST-jazz-26, 27). Delivers 1.65 quiet, 1.98 working, 2.30 loud. Under a solo
    // the hand stays at the working level (`chords.strikes-per-bar-under-a-hot-solo`).
    "chords.strikes-per-bar-quiet": { min: 1, max: 2.2, kind: "measured", minCases: 8 },
    "chords.strikes-per-bar-mid": { min: 1.5, max: 2.6, kind: "measured", minCases: 8 },
    "chords.strikes-per-bar-loud": { min: 2, max: 3.2, kind: "measured", minCases: 8 },
    // Mostly stabs, some held to the end of the chord: a quarter of the strikes, half when
    // quiet (ST-jazz-27). Delivers 17% from the working level up (the loud band to itself is
    // the stabbiest) and 59% quiet. Each held chord is written into a figure, not a coin.
    "chords.held": { min: 0.05, max: 0.4, kind: "measured", minCases: 20 },
    "chords.held-quiet": { min: 0.3, max: 0.8, kind: "measured", minCases: 20 },
    // With the drums: the snare comps where the chart moves, so the two meet over chance
    // (+0.08 as built, +0.06 for the first plan). The snare's side of it, ST-jazz-17's 45%,
    // is `drums.snare-with-piano` (46%; first plan 39%).
    "chords.with-the-drums-over-chance": { min: 0, kind: "intent", minCases: 20 },
    "chords.off-the-beat": { min: 0.4, max: 0.85, kind: "measured", minCases: 20 },
    // 25% to 45% of changes anticipated (ST-jazz-46, Q-13): delivers 40% over everything,
    // more as the band gets louder. By take it runs 28% to 54% (one in ten either side), so
    // each take is held to a wider band, as in the blues.
    "chords.changes-anticipated": { min: 0.2, max: 0.6, kind: "intent", minCases: 10 },
    // Does it sound like a loop? Away from a solo, the phrase opens on the section's figure
    // and is mostly answers after it. A bar is the bar before it again 32% of the time (first
    // plan 31%, blues 41%); a phrase the phrase before 6% (first 13%), the phrase at this
    // place last chorus 1% (first 7%); shaped 94% (first 81%), one bar four times 6% (first
    // 9%), unrelated none (first 10%).
    "chords.bar-same-as-last": { min: 0.1, max: 0.6, kind: "measured", minCases: 12 },
    "chords.phrase-same-as-last": { max: 0.3, kind: "measured", minCases: 6 },
    "chords.phrase-same-as-last-chorus": { max: 0.25, kind: "measured", minCases: 4 },
    "chords.phrases-shaped": { min: 0.7, kind: "measured", minCases: 6 },
    "chords.phrases-one-bar": { max: 0.3, kind: "measured", minCases: 6 },
    "chords.phrases-unrelated": { max: 0.1, kind: "measured", minCases: 6 },
    // ── the piano under the soloist ── (built, deaf, first plan)
    // On the soloist's note at most 15% of the time (CH-62): 17.5%, deaf 40%, first 17%. Short
    // of the target for the reason the blues is under the alto: the line lives in the
    // piano's register and lands on the 3rds and 7ths the hand may not give up.
    "chords.on-the-soloists-note": { max: 0.15, kind: "intent", minCases: 20 },
    "chords.in-the-soloists-register": { max: 0.3, kind: "measured", minCases: 40 },
    // Strikes under a sounding note 61%, deaf 70%, first 70%; over chance +0.00, deaf +0.09.
    "chords.overlap": { max: 0.75, kind: "measured", minCases: 20 },
    "chords.overlap-over-chance": { max: 0.07, kind: "measured", minCases: 20 },
    "chords.struck-with-the-soloist": { max: 0.3, kind: "measured", minCases: 20 },
    // Strikes per sixteenth: 0.121 under the line (deaf 0.149; Q-16's 0.10 to 0.155), 0.131
    // in the breaths (deaf 0.116).
    "chords.strikes-under-the-line": { min: 0.09, max: 0.155, kind: "measured", minCases: 20 },
    "chords.strikes-in-breaths": { min: 0.1, max: 0.17, kind: "measured", minCases: 4 },
    // Busier in the breaths than under the line: 1.10 (deaf 0.79, first 0.78), the bottom of
    // CH-72's 1.1 to 2.0. By take 0.92 to 1.40, one in ten either side.
    "chords.breaths-over-the-line": { min: 0.9, max: 2, kind: "measured", minCases: 4 },
    // Breaths with a strike in them: 93% (deaf 87%, first 83%). CH-72's 40% to 70% was the old band's,
    // whose cells were drawn per bar and laid out with a coin; here a section's figure and
    // its answers have a strike every two beats or so, and a breath is a dotted quarter, so
    // most breaths hold one already. A floor only.
    "chords.breaths-answered": { min: 0.6, kind: "measured", minCases: 4 },
    // Louder in the breaths: 4.6 steps (deaf -1.1, first -0.9).
    "chords.answers-louder": { min: 1, max: 12, kind: "intent", minCases: 4 },
    // Bars under a solo with one strike or none: 22% (deaf 12%, first 24%), at CH-70's 21%.
    // By take up to 35% one in ten.
    "chords.thin-bars-under-the-solo": { max: 0.35, kind: "measured", minCases: 12 },
    "chords.top-leaps-under-the-solo": { max: 0.01, kind: "intent", minCases: 20 },
    // Louder is harder, not busier: 1.9 strikes a bar under a hot solo (deaf 2.2).
    "chords.strikes-per-bar-under-a-hot-solo": { max: 3, kind: "intent", minCases: 8 },
    // ── the piano in a waltz (3/4) ── (the study, `prompts/jazz-waltz-study.md`: Kelly behind
    // Davis, 16 bars counted, 31 strikes, 1 to 4 a bar, 6 of the 16 struck on 1, 2 of one strike)
    // Under a solo: as ST-jazz-30 asks of four, under 21% of bars thin (one strike or none).
    "chords.thin-bars-under-the-solo-in-three": { max: 0.21, kind: "intent", minCases: 12 },
    // About two a bar (1.9 counted), one to four.
    "chords.strikes-per-bar-in-three-under-the-solo": {
      min: 1.5,
      max: 2.6,
      kind: "intent",
      minCases: 12,
    },
    // Beat 1 left to the bass more often than it is played (1.1, 4.4).
    "chords.on-one-in-three-under-the-solo": { max: 0.5, kind: "intent", minCases: 12 },
    // With the band to itself, at every level: one to four a bar (AU-94), and not every bar
    // on 1, which is the pad (the quiet level's "and" of 1 and beat 2 held, F5 and F7).
    "chords.strikes-per-bar-in-three": { min: 1, max: 4, kind: "intent", minCases: 12 },
    "chords.on-one-in-three": { max: 0.9, kind: "intent", minCases: 12 },
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
    // Not a target for the music: a ceiling one take in ten sat above when it was set, so that
    // the scorecard would name the worst solos. The measure names them by itself now (#2247);
    // the ceiling stays because `score --check` has held the share under it since.
    "solo.cost": { max: 2.32, kind: "measured" },
    // ── band ──
  },
  weights: {
    // What a voicing costs (CH-16): the blues piano's numbers, which already lead a ii-V-I
    // with almost no motion (Dm9 C E F A, G13 B E F A, Cmaj9 B D E G: one voice moves a half
    // step, then three move a step), except the soloist's note. The alto lives in the piano's
    // register and lands on 3rds and 7ths the hand may not give up; at 26 the piano is on its
    // note 19% of the time, at 34 17.5% (deaf 40%). Bought with the movement costs alone, that
    // makes the top leap past a 4th at 0.5% of strikes under the line (0.2% at 26), so the
    // leap costs twice the blues' 10: back to 0.2%.
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
    // What a phrase of comping costs. The blues numbers, but a comp that converses lays out
    // under the line more and keeps the time harder. Measured over 84 takes of the jazz charts.
    comping: {
      "off-the-drums": 2,
      // At 6 the piano is as busy in the soloist's breaths as under the line (1.06); at 9,
      // 1.10 (deaf 0.78); at 12, 1.12, with more bars thinned.
      "under-the-soloist": 9,
      // With laying out at 9, 21% of bars under a solo have one strike or none at 2, 21% at 4
      // (deaf 12%), CH-70's ceiling; at 2 with laying out at 6, 19%, and the breaths 1.06.
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
    // ── bass ──
    // What a phrase of walking costs. Each is a share of the phrase's moves, notes or
    // bars, so the weights are what makes them count; a phrase in two has no walked notes
    // and costs nothing, so it is played as its lead-ins fall (BA-98). Each was set to
    // zero in turn over 200 takes (ME-10); what it moved is beside it. Three more were
    // tried and dropped because they moved nothing the others did not: leaps as such,
    // the same bar twice running, and the half-step band the blues uses.
    bass: {
      // A line with a direction. At zero, moves in a row one way 3.0 to 2.5.
      "turns-back": 2,
      // At zero, moves straight back to the note just left 3.5% to 6.3%.
      rocking: 3,
      // At zero, leaps of a fourth or more not then filled in 10.0% of moves to 11.6%.
      "leaps-left-hanging": 1,
      // At zero, chord tones on beats 1 and 3 93.5% to 89.5%.
      "strong-beats-off-the-chord": 1,
      // At zero, bars that are the bar at their place last chorus 3.9% to 12.3%.
      "bars-as-last-time": 1,
      // At zero, notes above D3 0.4% to 1.1%. The register keeps the line low already;
      // this is what brings a line that has climbed back down.
      "high-notes": 2,
    },
  },
};
