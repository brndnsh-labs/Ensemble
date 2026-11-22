# Milestones

Six stages. Stages 1 through 4 are headless: no browser, no audio. Each stage ends with a human listening gate, because passing checks say nothing about whether the music feels good.

## How a stage ends

At the end of every stage the agent:

1. Writes audition files to `out/gate-N/` (MIDI in stages 1 to 4).
2. Writes `out/gate-N/GATE_REPORT.md`: what was built, the scorecard, known weaknesses, decisions made, and exactly what to listen for.
3. Commits.

Brandon auditions the files in Logic Pro and replies with what he heard. Feedback becomes a property or a critic metric first, then a fix.

During a multi-stage push, the agent does not wait at a gate. It writes the gate files and continues, and feedback is applied when it arrives.

---

## Stage 1: Foundation, drums, and bass (blues)

**Build**

- Repo scaffold, package boundaries, CI with the budgets from `docs/TESTING.md`.
- Chart parser, diagnostics, canonical printer, per `docs/CHART_FORMAT.md` (the arrangement block and `!` annotations are parsed-and-ignored as specified).
- Chord model with names, numerals, and transposition.
- Seeded random generator, event model with microtiming, plan types.
- Planner: song mode and jam mode, timed jams, endings.
- Style pack format, and the blues pack.
- Drums and bass players.
- MIDI file writer. CLI: `parse`, `fmt`, `render`.
- Starter library: at least six blues charts (several keys, quick-change, minor blues, a jazz blues).

**Done when**

- Every example in the format spec parses as described, and the corpus round-trips.
- `render` produces a valid MIDI file for every library chart.
- Determinism and timed-jam properties pass.
- Engine suite is inside its time budget.

**Gate 1: does it groove?**

Audition a 12-bar blues at three tempos, a minor blues, and a 3-minute timed jam, a few seeds each.

- Does the shuffle feel like a shuffle?
- Is the bass choosing good notes and approaching chord changes well?
- Does the timed jam build and then land a convincing ending?
- Does the file open cleanly in Logic: separate tracks, correct tempo, sensible drum mapping? Do markers come through?

---

## Stage 2: Comping

**Build**

- Voicing engine: voice leading, register floor and ceiling, style-specific shapes.
- Chord player with a keys idiom, generated with awareness of drums and bass.
- Critic metrics for comping and bass, wired into selection.
- CLI: `score`.

**Done when**

- Register and voice-leading properties pass across the library.
- The scorecard reports comping metrics, and a baseline is committed.

**Gate 2: voicings and rhythm**

- Do the voicings sit in a good register, clear of the bass?
- Do chord changes move smoothly, without jumps?
- Is the comping rhythm varied and locked with the drums, or does it sound like a loop?

---

## Stage 3: Soloist and critic

**Build**

- Phrase-level soloist with motif memory, target notes, and an arc across a pass and across the jam.
- Candidate generation with critic selection.
- Comping regenerated around the soloist.
- Plan control for who is featured, so the soloist lays out and returns.
- A way to save and replay takes by seed from the CLI.

**Done when**

- Soloist metrics are on the scorecard across 200 seeds.
- Selection measurably beats taking the first candidate on the same seeds. Report both numbers.
- Comping overlap with the soloist's rhythm is lower with the soloist present than a naive baseline.

**Gate 3: is the aimlessness gone?**

Audition ten seeds on a blues, including the three lowest-scoring ones.

- Does the solo repeat and develop ideas?
- Do phrases relate to each other, and do they breathe?
- Are the worst takes still acceptable? The previous version failed on variance, so the floor matters more than the ceiling.
- Does comping leave room?

---

## Stage 4: Jazz and funk as data

**Build**

- Jazz and funk style packs. Walking bass, swing, rootless voicings; sixteenth-note grooves, syncopated bass, sparse comping.
- An electric guitar idiom for the chord seat, used in funk.
- Whatever engine concepts turn out to be missing, added as general concepts.
- Library: jazz and funk charts, including standard forms and common progressions.

**Done when**

- All three styles pass every property.
- The stage report lists each engine change made during this stage and why it was a missing concept and not a style special case.
- Golden takes exist for all three styles.

**Gate 4: three different bands**

- Does each style sound like its genre, and unlike the others, on the same chart?
- Did the blues get worse?

---

## Stage 5: Audio

Needs the instrument packs in `assets/packs/` with their license files.

**Build**

- Sampler, scheduler with an injected clock, mixer bus with shared reverb and master processing.
- Pack ingestion with loudness metadata. Mix preset per style.
- A minimal page that plays a take in the browser. No app design yet.

**Done when**

- A rendered take plays in the browser in time, from start to ending, with no dropped or late notes over ten minutes.
- Scheduler timing logic is verified with fake time in the engine suite's style (a property, not a browser test).

**Gate 5: one band**

- Do the instruments sound like they are in the same room?
- Is anything too loud, too quiet, or muddy?
- Which soloist instruments are worth keeping?

---

## Stage 6: The app

Build in this order, with a short gate after each part.

1. **Play view and library.** Chart display per the brief, transport, jam length, status strip, names and numerals toggle, phone focus mode. PWA install and offline.
2. **Editor.** Text with live chart rendering and in-place diagnostics. Touch key row.
3. **Takes and export.** Save a seed, replay, export MIDI from the browser.
4. **Arrangement grid.** Finalize the arrangement block design, then build the grid editor for song mode.
5. **Remaining styles.** Rock, disco, neo-soul, reggae, acoustic, with the acoustic guitar idiom.

**Done when**

- The six smoke journeys in `docs/TESTING.md` pass inside their budget.
- From a cold start on a phone, a jam is playing within a few taps.

**Gate 6: play over it**

The real test. Pick up an instrument and use it for a week.

---

## Rules across all stages

- Do not start a stage's browser or audio work early. The engine stages exist to get the music right first.
- If a stage reveals that an earlier decision was wrong, fix it at the root and log it. A rewrite that preserves its own early mistakes has missed the point.
- Keep the library growing as styles are added. Charts are cheap, and they are test material.
