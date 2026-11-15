// What the critic expects of a blues band. An `intent` bound is true whatever
// the band currently plays; a `measured` bound sits a margin from what it
// delivers today, and moving it needs a new measurement (and a reason).

import type { CriticStyle } from "@ensemble/engine";

export const bluesCritic: CriticStyle = {
  targets: {
    // The kick is on 1 and the backbeat on 2 and 4 in every bar of time (ST-blues-08).
    "drums.kick-on-one": { min: 0.95, kind: "intent" },
    "drums.backbeat": { min: 0.95, kind: "intent" },
    // A section keeps one groove (ST-blues-19: consistency floor 75%).
    "drums.same-groove": { min: 0.75, kind: "intent", minCases: 8 },
    // 15% to 50% of fills are the triplet kind (ST-blues-19).
    "drums.triplet-fills": { min: 0.15, max: 0.5, kind: "intent", minCases: 10 },
    "drums.fills-that-repeat": { max: 0.1, kind: "intent", minCases: 4 },

    // The arrival is stated at least four changes in five (BA-01, blues).
    "bass.changes-stated": { min: 0.8, kind: "intent" },
    // 15% to 40% of changes resolve by a half step in actual pitch (ST-blues-28).
    "bass.half-step-approaches": { min: 0.15, max: 0.4, kind: "intent", minCases: 8 },
    // Under 5% of lead-ins leap (ST-blues-28), measured over enough lead-ins to mean something.
    "bass.lead-ins-that-leap": { max: 0.05, kind: "intent", minCases: 5 },
    // 15% to 35% of bass notes on dominant chords are the 6th (ST-blues-28).
    "bass.sixths-on-dominants": { min: 0.15, max: 0.35, kind: "intent", minCases: 20 },
    // In two when quiet: 0.45 to 0.75 notes per beat (ST-blues-28).
    "bass.notes-per-beat-when-quiet": { min: 0.45, max: 0.75, kind: "intent", minCases: 4 },
    // From listening at gate 3: the bass was up the neck, an octave over where a bass
    // guitar plays a blues in A (its average note was B2, and 43% of its notes were at or
    // above C3). The line's average sits between Bb1 and G2 (a blues in C or F, played off
    // the two low strings, averages B1), and little of it is above D3.
    "bass.register": { min: 34, max: 43, kind: "intent" },
    "bass.high-notes": { max: 0.03, kind: "intent", minCases: 40 },

    // From listening at gate 3: "the bass could be a bit more creative". Three basses on the
    // same 200 takes: as built; as it was (one shape for every chord, no walks); and the
    // first plan drawn, with no critic. Bar and two-bar shapes in a chorus at the working
    // level: 7.0 and 5.1 (as it was 6.3 and 4.9, first plan 7.7 and 5.4). A bar is the bar at
    // its place last chorus 42% of the time (as it was 50%, first plan 34%): told again, not
    // pasted, and not a new line every chorus either.
    "bass.bar-shapes-per-chorus": { min: 4.5, max: 10, kind: "measured", minCases: 1 },
    "bass.two-bar-shapes-per-chorus": { min: 3.5, kind: "measured", minCases: 1 },
    "bass.chorus-same-as-last": { max: 0.15, kind: "measured", minCases: 2 },
    "bass.bars-same-as-last-chorus": { min: 0.05, max: 0.8, kind: "measured", minCases: 12 },
    // Walks: 40% of chorus tops past the quiet level (as it was none; first plan 29%), about
    // three quarters of the tops a walk can reach (a last bar of two chords cannot walk); 14% of
    // the lines inside a chorus (first plan 36%); 2% of the changes inside a line, which is
    // what the box itself scores when it happens to climb by step into the next root.
    // Into the top it is reported only: a take with three tops may walk all three.
    "bass.walks-into-a-line": { max: 0.4, kind: "measured", minCases: 6 },
    "bass.walks-inside-lines": { max: 0.1, kind: "intent", minCases: 8 },
    // Most changes are arrived at by a step in the octave played: 67% (as it was 65%). The
    // quiet two-feel leads in by step at a third of its changes or fewer, so the floor is low.
    "bass.changes-by-step": { min: 0.2, kind: "measured", minCases: 8 },

    // How hard the band hits, set by ear at gate 1: a backbeat around 110 slammed through a
    // sampled kit, around 95 did not. The quietest takes sit in the high 60s.
    "band.backbeat-level": { min: 60, max: 108, kind: "intent" },
    "band.notes-near-the-top": { max: 0.02, kind: "intent" },
    "drums.cymbal-under-backbeat": { min: 0.95, kind: "intent", minCases: 8 },

    // The top of the piano's chord is a line: at a change it moves more than a 4th at no
    // more than 22% of changes (Q-05, no soloist) and 3.5 semitones or less on average
    // (Q-04). Today it delivers no leaps at all and about 1.2 semitones.
    "chords.top-leaps": { max: 0.22, kind: "intent", minCases: 8 },
    "chords.top-movement": { max: 3.5, kind: "intent", minCases: 8 },
    // Shape bounds around what it delivers (ME-11): steps 38% to 99% of changes by take,
    // small leaps up to 23%, holds up to 48%. A top note that held at most changes would
    // be the frozen top ME-11 warns of.
    "chords.top-steps": { min: 0.35, kind: "measured", minCases: 8 },
    "chords.top-small-leaps": { max: 0.3, kind: "measured", minCases: 8 },
    "chords.top-holds": { max: 0.6, kind: "measured", minCases: 8 },
    // Nothing under the floor, ever (X-B-02); and the comp never on or under the bass.
    "chords.floor-clearance": { min: 0, kind: "intent" },
    "chords.closest-to-bass": { min: 1, kind: "intent" },
    "chords.crowds-the-bass": { max: 0.05, kind: "intent", minCases: 8 },
    // The bottom of the hand sits around E4 (measured 58 to 68 by take); the notes give no
    // blues number, only jazz piano's 58 to 64 (CH-19).
    "chords.lowest-note": { min: 56, max: 70, kind: "measured", minCases: 8 },
    // Blues piano plays jazz colour: half or more of its chords carry a 9th or 13th (CH-14).
    "chords.colour": { min: 0.5, max: 1, kind: "intent", minCases: 8 },
    // A written tension is heard nine times in ten or more (Q-07, X-B-13).
    "chords.written-tensions": { min: 0.9, kind: "intent", minCases: 5 },
    // A good comp has almost no voicing faults (Q-03); with the rub penalties off, 4%.
    "chords.voicing-faults": { max: 0.02, kind: "intent", minCases: 8 },
    // Hand width stays consistent across neighbours (Q-06, KF-B-28).
    "chords.width-jumps": { max: 0.01, kind: "intent", minCases: 8 },

    // How busy the piano is at each level: a pad, chops, then four stabs or the pump's
    // eight (ST-blues-31, ST-blues-56). Delivers 1.4, 2.2 and 3.1 to 8 by take.
    "chords.strikes-per-bar-quiet": { min: 1, max: 2, kind: "intent", minCases: 8 },
    "chords.strikes-per-bar-mid": { min: 1.5, max: 3.2, kind: "intent", minCases: 8 },
    "chords.strikes-per-bar-loud": { min: 3, max: 8, kind: "intent", minCases: 8 },
    // With the drums: 65% of strikes land with a kick or a backbeat, where a hand placed at
    // random on the eighths would score 59% and the first plan drawn, unchosen, 62%. The
    // target is on the difference, by take. It is not met by every take, and should not be:
    // a section whose own figure is the "and"s sits between the backbeats by design.
    "chords.with-the-drums-over-chance": { min: 0, kind: "intent", minCases: 20 },
    // 30% to 80% of strikes off the beat over everything (CH-52; delivers 48%). By take a
    // section that chops 2 and 4 is nearly all on the beat, so the band by take is wider.
    "chords.off-the-beat": { min: 0.1, max: 0.8, kind: "measured", minCases: 20 },
    // 35% to 60% of changes anticipated over everything, about 25% when quiet and more when
    // hot (ST-blues-51; delivers 44%, 29% quiet, 55% hot). Never pushing is stiff and
    // always pushing is a mannerism (Q-13), so each take is held inside 15% to 80%.
    "chords.changes-anticipated": { min: 0.15, max: 0.8, kind: "intent", minCases: 10 },

    // Does it sound like a loop? Asked of the bars that are a conversation (the pump is
    // meant to be one bar). Three players to compare with, on the same takes: the old
    // band's loop (the section's figure in every bar), a scatter (each bar any of the
    // phrase's three figures), and the first plan drawn with no critic.
    //
    // A bar is the bar before it again 41% of the time. Loop 97%, scatter 43%, first plan 51%.
    "chords.bar-same-as-last": { min: 0.15, max: 0.75, kind: "measured", minCases: 12 },
    // A phrase is the phrase before it again 4% of the time. Loop 85%, scatter 5%, first 10%.
    "chords.phrase-same-as-last": { max: 0.35, kind: "measured", minCases: 6 },
    // A phrase is the one played at this place last chorus 4% of the time. Loop 100%,
    // scatter 4%, first plan 9%.
    "chords.phrase-same-as-last-chorus": { max: 0.4, kind: "measured", minCases: 4 },
    // The opening bar comes back and some bar differs in 99.7% of phrases. Loop 3%,
    // scatter 65%, first plan 86%. The floor sits between the scatter and the first plan.
    "chords.phrases-shaped": { min: 0.8, kind: "measured", minCases: 6 },
    // One bar four times: 0.3% of phrases. Loop 97%, scatter 10%, first plan 14%.
    "chords.phrases-one-bar": { max: 0.15, kind: "measured", minCases: 6 },
    // The opening bar never comes back: none. Loop 0%, scatter 24%, first plan 0.1%.
    "chords.phrases-unrelated": { max: 0.1, kind: "measured", minCases: 6 },

    // ── the piano under the soloist ── counted only where the soloist has the lead, the
    // pump left out. Three pianos on the same 64 takes: as built; deaf (no listening, the
    // soloist weights at zero); and the first plan drawn, as written, with no critic.
    //
    // The piano on the soloist's very note: at most 15% of the time (CH-62). Delivers 10%
    // under the vibraphone (deaf 30%). Under the alto sax, which lives in the piano's
    // register and lands on 3rds and 7ths the hand may not give up, 20% (deaf 37%).
    "chords.on-the-soloists-note": { max: 0.15, kind: "intent", minCases: 20 },
    // Notes at or above the line's lowest: 12% (deaf 29%, worst take 35%).
    "chords.in-the-soloists-register": { max: 0.25, kind: "measured", minCases: 40 },
    // Strikes under a sounding note: 64% (deaf 67%, first plan 69%). By take the line's own
    // density decides most of it, so the bound is loose; read it beside the next one.
    "chords.overlap": { max: 0.78, kind: "measured", minCases: 20 },
    // The same, over what a hand placed at random would catch: +0.04 by take at the middle
    // (deaf +0.08, first plan +0.09). A blues figure's backbeats fall where the line is.
    "chords.overlap-over-chance": { max: 0.09, kind: "measured", minCases: 20 },
    // The soloist's notes with a strike on the same tick: 28% (deaf 30%).
    "chords.struck-with-the-soloist": { max: 0.36, kind: "measured", minCases: 20 },
    // Strikes per sixteenth: 0.148 under the line (deaf 0.163), 0.149 in the breaths (deaf
    // 0.143). Q-16's 0.10 to 0.155 under the line is the jazz piano's; the blues chops more.
    "chords.strikes-under-the-line": { min: 0.08, max: 0.2, kind: "measured", minCases: 20 },
    "chords.strikes-in-breaths": { min: 0.1, max: 0.2, kind: "measured", minCases: 4 },
    // Busier in the breaths than under the line: 1.03 (deaf 0.89, first plan 0.82). Short
    // of Q-16's 1.1 to 2.0 for a comp that converses: what is not struck under the line is
    // left out, and a stab in a breath needs a quarter's room the figure seldom leaves.
    "chords.breaths-over-the-line": { min: 0.8, kind: "measured", minCases: 4 },
    // Breaths holding a strike: 97% (deaf 95%). Q-16's 40% to 70% is for a sparser comp;
    // here the figure itself fills nearly every breath, so this is a floor only.
    "chords.breaths-answered": { min: 0.8, kind: "measured", minCases: 4 },
    // Louder in the breaths by 1 to 12 velocity steps as played (Q-16). Delivers 4.2, every
    // take at least 1 (deaf -1.5: the figure's backbeat accents fall under the line).
    "chords.answers-louder": { min: 1, max: 12, kind: "intent", minCases: 4 },
    // The hand does not flip to get out of the way (CH-65: under 1% with the phrase rule).
    // Delivers 0.1%, deaf none.
    "chords.top-leaps-under-the-solo": { max: 0.01, kind: "intent", minCases: 20 },
    // From listening at gate 3: the piano got busy as the intensity ramped up. Under a hot
    // solo it played 5.2 strikes a bar (the pump's eight in four bars of ten), the same as
    // with nobody soloing, while the soloist was at its own busiest.
    "chords.strikes-per-bar-under-a-hot-solo": { max: 3, kind: "intent", minCases: 8 },

    // ── the soloist ──
    // A note on a change is a chord tone, by rule (X-B-06, Q-21).
    "solo.changes-on-chord-tones": { min: 1, kind: "intent" },
    // A 3rd or 7th on 40% to 85% of changes (ST-blues-45; delivers 72% over everything).
    // By take the band is a little wider: a short solo has few changes.
    "solo.thirds-and-sevenths-on-changes": { min: 0.4, max: 0.9, kind: "intent", minCases: 10 },
    // 72% or more of the notes on a beat are chord tones (Q-22); a note picked blind from
    // the blues pool over a seventh chord would be one 57% of the time. Delivers 82%.
    "solo.beats-on-chord-tones": { min: 0.72, kind: "intent", minCases: 20 },
    // 85% or more of phrases end on a chord tone (Q-24). Delivers 99.6%: by rule at the end
    // of a line; the rest are notes cut short where the chord changed under them.
    "solo.phrase-ends-on-chord-tones": { min: 0.85, kind: "intent", minCases: 6 },
    // Does one phrase follow from another? 67% of phrases are related to an earlier one
    // of their solo. Two phrases from different takes are that alike 12% of the time; a
    // phrase picked at random from the candidates, 60%; with "lost-the-thread" off, 55%.
    // It is not meant to be all of them: a chorus may open on a new idea.
    "solo.phrases-related": { min: 0.35, kind: "measured", minCases: 6 },
    // And not too much: a phrase is the one before it again 10% of the time (by chance,
    // under 1%). Past a third it would be a loop.
    "solo.phrase-same-as-last": { max: 0.35, kind: "measured", minCases: 6 },
    // The rhythm of a bar comes back inside its phrase: 83% of line bars (Q-43). The first
    // phrase made, unchosen, 62%; with "bars-in-a-row" off, 62%.
    "solo.bars-that-rhyme": { min: 0.5, kind: "measured", minCases: 6 },
    // 16% of bars are empty. The old band's 20% to 50% (SO-11) was measured before the
    // rule that a phrase leaves one empty bar at most (SO-10), which caps it near 25%.
    "solo.empty-bars": { min: 0.05, max: 0.3, kind: "measured", minCases: 12 },
    // Breaths of two bars or more are at most 12% of breaths (SO-10). Delivers 1%.
    "solo.long-breaths": { max: 0.12, kind: "intent", minCases: 8 },
    // The usual breath is a real one: 0.4 of a second or more at any tempo (Q-47).
    "solo.breath": { min: 0.4, kind: "intent", minCases: 4 },
    // The breath above is the usual one of a beat or more; this one sees the short ones. Every
    // phrase is followed by half a second of air before the next, a pickup into it included.
    "solo.phrases-breathe": { min: 1, kind: "intent", minCases: 4 },
    // The last chorus has 1.5 to 4 times the notes of the first (SO-02). Delivers 2.1 on
    // average and a little under 1.5 in about one take in seven.
    "solo.builds": { min: 1.5, max: 4, kind: "intent" },
    // And sits higher: 5 semitones on average, 3.6 or more in nine takes of ten.
    "solo.rises": { min: 2, kind: "measured" },
    // The highest note of a solo is in its last chorus (SO-02: 85% or more of solos).
    "solo.top-in-last-chorus": { min: 0.85, kind: "intent" },
    // A phrase's high point is on a beat or held: 90% (Q-45). Unchosen, 80%; with
    // "peak-thrown-away" off, 77%.
    "solo.high-points-deserved": { min: 0.6, kind: "measured", minCases: 6 },
    // A chorus covers 10 to 26 semitones (Q-38). Delivers 13 to 20.
    "solo.range": { min: 10, max: 26, kind: "intent" },
    // Leaps wider than a fifth are 5% of moves or fewer; trills 5% of runs or fewer; a
    // line style repeats a note on 7% of moves or fewer (SO-02, Q-27, Q-28).
    "solo.wide-leaps": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.trills": { max: 0.05, kind: "intent", minCases: 20 },
    "solo.repeated-notes": { max: 0.07, kind: "intent", minCases: 20 },
    // Not a target for the music: a ceiling one take in ten sits above today, so that the
    // scorecard names the worst solos, which are the ones to go and listen to.
    "solo.cost": { max: 1.8, kind: "measured" },
  },
  weights: {
    // What a voicing costs (CH-16), in comparable units: a note out of the slot is
    // worth more than any amount of voice leading; a semitone of the top voice's
    // movement costs 0.6 on top of the 0.5 every voice pays; the pull toward the
    // target is weaker than the pull to stay put, so the top line steps.
    voicing: {
      "outside-register": 40,
      "top-from-target": 0.35,
      // More than a smooth move saves (0.5 a voice and 0.6 for the top is 2.6 a semitone
      // for four voices), so past the reach the hand comes back.
      "top-out-of-reach": 4,
      "hand-movement": 0.5,
      "top-movement": 0.6,
      "minor-ninths": 12,
      "minor-seconds": 8,
      "minor-seconds-thin": 24,
      "sharp-nine-under-third": 20,
      "low-intervals": 10,
      // Under a soloist (CH-59, CH-63). A voice on the soloist's very note costs 26 for the
      // whole of the strike, its octave 7 (the notes' numbers: at 14 the comp still sat on
      // the note, at 30 it leapt to escape). Set to zero, the piano is on the vibraphone's
      // note 16% of the time instead of 10%; without the octave it is on it a little less
      // (8%) but leaps three times as often.
      "on-the-soloists-note": 26,
      "on-the-soloists-octave": 7,
      // A voice in the line's register, judged by the bar. 3 a voice moves the hand under a
      // vibraphone line (19% of notes in its register at zero, 12% at 3) without taking it
      // past its reach; at 6 it gains two points more for a lower hand whose top moves
      // further (1.43 semitones a change against 1.30).
      "in-the-soloists-register": 3,
      // A jump of the top past a fourth: the notes' 26 for sitting on the soloist's note buys
      // an octave with the movement costs alone, and a hand pressed down under a line jumps
      // home when the solo ends. At zero, 0.9% of strikes under a solo leap; at 10, 0.1%.
      // It is asked only around a solo, so with nobody soloing nothing changes.
      "top-leap": 10,
      // The hand pressed down under the line must not sit on the bass (it never does
      // without a soloist). At zero, 5% of takes put the piano on or under the bass once.
      "crowds-the-bass-under-the-line": 4,
    },
    // What a phrase of comping costs. The first three are in comparable units, a share of
    // the phrase's strikes or strikes a bar; the rest are yes or no. Each was set to zero in
    // turn over 200 takes to see what it moves (ME-10).
    comping: {
      // Land with the kick and the backbeat the drummer actually played. Weaker settings
      // that lean reliably were what sounded right in the old band (ME-23): this moves
      // one strike in twenty, not the figure.
      "off-the-drums": 2,
      // Under a soloist (CH-68 to CH-71): each plan is also offered laid out under the line,
      // and answering its breaths, and the critic chooses. Stay out from under the soloist:
      // with this at zero, 67% of strikes under a solo come down under a sounding note; at 3
      // (before the laid-out ways existed) 65%; at 6, 64%, and 59 takes in 64 lower than a
      // deaf piano on the same seeds.
      "under-the-soloist": 6,
      // But keep the time: a bar laid out below what the energy asks (CH-70, KF-B-35). At
      // zero the piano lays out to one strike in 30% of the working-level bars under a solo
      // (11% deaf) and the loud bars fall under three strikes in most takes; at 2, 16%.
      thinned: 2,
      // Speak in the breaths. A blues figure already has a strike in 95% of them (chops two
      // beats apart, breaths most often a bar), so the answer is mostly the lift: at zero the
      // piano plays half a step quieter in the breaths than under the line, at 0.5 four
      // steps louder.
      "breaths-unanswered": 0.5,
      // An empty breath. With the stab's rules (a quarter clear of every strike) a blues
      // figure leaves almost no empty breath that can take one: at zero nothing moves.
      "breaths-left-empty": 1.5,
      // A strike in the eighth before the soloist comes back in: 14% of breaths at zero, 8%
      // at 1, 5% at 3, where the overlap starts to rise.
      "steps-on-the-entrance": 1,
      // As busy as the energy asks: within a tier, a higher bar takes the busier answer.
      "off-the-energy": 1,
      // Not one bar four times, unless everything else about it is better by this much.
      "one-bar": 0.5,
      // The opening bar comes back. The forms see to that on a plain 12-bar; this is for
      // bars of two chords and more, which reshape a figure: on the jazz blues it keeps 2%
      // of phrases from wandering off, on a chart of busy changes one in ten.
      "no-return": 1,
      // Not the last phrase again, and not last chorus's phrase at this place: mild, so that
      // it sometimes is.
      "same-as-last": 0.25,
      "same-as-last-time": 0.3,
    },
    // What a phrase of the bass line costs. Each is yes or no, a share, or the band's energy:
    // comparable units, so the weights are what makes them count. Each was set to zero in turn
    // over 200 takes (ME-10); what it moved is beside it. "same-as-last" moved nothing (a
    // phrase on other chords is seldom the same shapes) and is left uncosted.
    bass: {
      // At zero, walks into a line 14% to 11% and changes by step 67% to 65%.
      "leaps-into-the-next": 1,
      // At zero, takes inside the half-step band 90% to 48% (ST-blues-28).
      "half-steps": 6,
      // At zero, bars as they were last chorus 42% to 45%, choruses repeated 0% to 0.7%.
      "same-as-last-time": 0.5,
      // At zero, choruses at the working level all home shape, no walk: 2 to 60 in 200 takes.
      "a-loop": 1,
      // At zero, answered bars 13% to 27% and bars as last chorus 42% to 35%: the home is lost.
      "away-from-home": 1.2,
      // The register already keeps the line low: at zero, notes above D3 0.1% to 0.2%. Kept as
      // the guard for a register moved up again.
      "high-notes": 4,
      // At zero, walks into a line 14% to 22%, inside one 2% to 4%.
      "walk-out-of-place": 0.6,
      // At zero, walks into the top 40% to 44%, into a line 14% to 19%.
      "walk-when-quiet": 0.6,
      // At zero, walks into the top 40% to 23%.
      "turnaround-unwalked": 0.9,
    },
    // What a phrase of the solo costs. Each feature is in the unit its name says (a share,
    // a count, semitones, seconds), so the weights are what makes them comparable. Each was
    // set to zero in turn over 200 takes to see what it moves (ME-10); all of them move
    // their own feature, and the three that carry the solo's shape are the heavy ones.
    solo: {
      // Made of something already played. The form sees to much of this by what it offers
      // (with the weight off, 55% of phrases relate to an earlier one; with it, 67%); the
      // weight is for which development, and for what a new idea has to beat.
      "lost-the-thread": 2,
      // As busy as the arc asks. This is what makes the last chorus busier than the first:
      // lighter than this, a sparse first idea is carried through the whole solo unchanged
      // (at 1.5 the worst takes were exactly that).
      "off-the-density": 3,
      // A fourth out of place costs as much as a fifth of the notes missing.
      "off-the-register": 0.15,
      "peak-thrown-away": 0.5,
      "leaps-left-hanging": 0.75,
      // Rare, and never worth it: a repeated note or a rocking pair costs like a wrong shape.
      stuck: 3,
      // Mild: the root at a change is a fine place to land, just not every time.
      "doubles-the-bass": 0.5,
      "rests-where-the-last-did": 0.5,
      // A third of a point for every second past the style's patience.
      "runs-on": 0.3,
      "bars-in-a-row": 0.75,
    },
  },
};
