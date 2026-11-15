# Plan: stages 1 to 3

Written at kickoff. `DECISIONS.md` records each choice and every later departure; this file is the map.

## Packages

```
packages/engine    pure: chart, theory, style types, planner, players, feel, critic, MIDI bytes
packages/styles    style packs as typed data (blues first); imports engine types only
packages/cli       parse, fmt, render, score; the only place that touches files
library/           .chart files, plain text
test/              the whole suite: corpus, properties, goldens (public API only)
out/gate-N/        audition MIDI and GATE_REPORT.md, committed
```

`audio` and `app` arrive at stages 5 and 6. The engine has no dependencies and cannot see DOM or Node types; lint rejects ambient randomness, clock reads, and imports that leave the package.

## The pipeline, concretely

```
text ──parse──▶ Chart ──expand──▶ bars
bars + StylePack + options + seed ──plan──▶ Plan
Plan + StylePack + seed ──perform──▶ Event[]
Event[] ──toMidi──▶ bytes
```

`render(text, style, options)` runs all of it and returns a `Take` (chart, diagnostics, plan, events).

## Core types

**Chart** (`chart/`). The parsed text, preserving how it was written. `expand` flattens it to `FlatBar`s: one per bar as played, with chord spans in ticks, the section's key and meter, and its role (intro, body, ending).

**StylePack** (`style/`). Plain data, no functions, so a pack could be JSON. Sections:

- `feel`: which note value swings and by how much; a lean per seat in milliseconds against the drums; humanize amount.
- `arc`: base energy by section name, the per-pass lift for open jams, the timed-jam arc offsets, and whether lifts may cross the high-tier line.
- `drums`, `bass`, `chords`, `solo`: each seat's vocabulary per energy tier (low, mid, high), with weighted alternatives and, for each choice, how long it is held (bar, phrase, pass, section, song).
- `ending`: the final chord's color by tonic family, the gesture (hold, stop, soft, button, hits), whether the bar before sets it up, each seat's last bar, how long the last chord rings.
- `critic`: metric weights (stage 2 onward).
- `instruments`: default sound per seat, as General MIDI programs for export.

**Plan** (`plan/`). A flat list of `PlanBar`s from count-in to the last ringing bar. Each bar has its harmony as it will be played (the ending bar already resolved), its place (section, pass, phrase, bar in each), and its controls. Song mode and jam mode both produce this type; nothing downstream knows which made it.

**Controls** are the narrow interface the brief asks for. Per bar: `energy` (0 to 1, after lifts), `level` (the section's own energy before lifts, for "is the next section bigger"), and per seat either an energy or "out". Marks the planner sets for everyone: phrase or section fill, arrival crash, last pass, ending gesture. A future listener could drive the same values.

**Event** (`perform/`). A note has seat, grid tick, microtiming offset in ticks, duration, pitch, velocity, and an optional voice name (drum piece, articulation). Markers carry sections, chords, passes, and landmarks. Players write on the straight grid with written velocities; two shared passes then apply dynamics (energy to velocity) and feel (swing, lean, humanize) so no player has a private timing trick and the feel is inspectable in the `offset` field.

**Critic** (`critic/`, stage 2). Named pure functions from material plus context to a number in 0 to 1, where higher is better. Used two ways: players score candidates with a style-weighted sum; `score` reports each metric's distribution across seeds.

## How the players work

Order: drums, bass, soloist, chords. Each hears the notes of those before it. A player is a pure function of (plan, style, what it heard, a seeded generator).

Every random choice is drawn from a generator forked by its place in the music (seat, purpose, section or pass or bar), never from a shared stream. That gives three things at once: a section sounds like itself every time it returns, changing one decision does not disturb the others, and extending an open jam leaves earlier passes untouched.

An open jam of k passes is planned as k passes plus one look-ahead pass that players may read and never play, so the last bar of pass k leads into the top of the form exactly as it will when pass k+1 exists.

## Build order

**Stage 1**

1. Scaffold, lint boundaries, test budget. (done)
2. Theory: note names, keys, degrees, chord qualities and tones. (done) Chord scales by function.
3. Chart: parser, printer, expander, transposition, corpus. (done)
4. Seeded generator, MIDI file writer. (done)
5. Style pack types; plan types; planner: song mode, jam mode, timed jams, energy arc, phrases, fills and crashes, ending resolution.
6. Perform skeleton: grid notation, dynamics pass, feel pass, markers.
7. Drums seat and bass seat, each with its part of the blues pack.
8. MIDI export, CLI `render`, properties, goldens, blues library, gate 1 files.

**Stage 2**

9. Critic framework and `score`; bass metrics.
10. Voicing engine (candidates, penalties, voice leading, register floor and ceiling); keys idiom; comping rhythm aware of kick and snare.
11. Comping metrics wired into selection; scorecard baseline; gate 2 files.

**Stage 3**

12. Soloist: phrase plan per pass (motif, repeat, vary, answer, space), target notes, register and density arc, instrument idiom.
13. Candidates per phrase slot with critic selection; first-candidate baseline on the same seeds.
14. Comping regenerated around the soloist; featured-seat control so the soloist lays out and returns.
15. Takes saved and replayed by seed from the CLI; gate 3 files.

## Resume here

State on 2026-11-14: **stages 1, 2 and 3 are built, each with gate files and a report. Stage 4 has not been started**, as the kickoff asks. Everything is committed; no agent is running.

- Gate reports: `out/gate-1/GATE_REPORT.md`, `out/gate-2/GATE_REPORT.md`, `out/gate-3/GATE_REPORT.md`. Rewrite the files with `pnpm gate:1`, `gate:2`, `gate:3`.
- `pnpm check` passes: 437 tests in about 6 s of 10. `pnpm score` matches its baseline (`scorecard/blues.json`).
- The numbers gate 3 quotes: `node scripts/gate-3-numbers.ts`.

**Feedback so far**

- Gate 1 (in Logic): sounds good so far, "a little plain"; velocities were slamming. Loudness is done (15% trim, by ear). "Plain" was to be judged again with the piano in.
- Gate 2: "so far so good". Nothing asked to change.
- Gate 3: not heard yet. Its questions are in its report under "What to listen for".
- Feedback becomes a property or a measure first, then a fix.

**Waiting on Brandon's ear**

- Gate 1: the wide bass drops and the two one-note phrase fills at mid level (`out/gate-1/GATE_REPORT.md`, "Not yet acted on").
- Gate 3, most likely to need a change: whether the piano gives way enough under the soloist (two weights move it: `under-the-soloist` and `thinned` in `packages/styles/src/blues/critic.ts`); whether the pump should react to a soloist at all; whether the lower hand under a solo is muddy; whether the worst three solos are acceptable.

**Before or at the start of stage 4** (each is logged in `DECISIONS.md`, "after the soloist's review")

1. **Short vamps.** On a form of one to seven bars the plan's phrase is the lap, so the soloist's choruses and both players' phrases are a bar or two long. It is one planner concept (a vamp's phrases and choruses run across laps, as its drum fills already do) with several readers: the comper (`players/chords/phrase.ts`), the soloist (`players/solo/slots.ts`), the measures. Funk makes it central. Properties first: a solo chorus is at least eight bars; a comping phrase is four.
2. **Blues assumptions in the soloist's engine code** that jazz and funk must be able to change as data: solos of three choruses and one of rest (`plan/plan.ts`), the kinds of candidate for each role and their contours (`players/solo/phrases.ts`), the peak phrase's shape and place, the thresholds for "related".
3. **The piano's answering stab is unexercised** in the blues (its figures fill nearly every breath). Jazz will be the first style to use it: read its output then.
4. In compound meters the soloist's "beat" is still a quarter note.

**Models** (agreed with Brandon to stretch quota): Sonnet for mechanical work and small fixes with a property written first; Opus for well-specified builds and for adversarial reviews; Fable for open design problems and the main thread. What things cost, for scale: voicing build (Opus) 270k tokens, rhythm build (Fable) 525k, chord review (Opus) 240k, soloist build (Fable) 630k, piano around the soloist (Opus) 445k, soloist review (Opus) 270k, test-file split (Sonnet) 65k. Every independent review found audible bugs the builder's own checks missed: keep doing one per seat, and give the reviewer its own copy of the repo (`git clone` the local repo into the scratch folder, `pnpm install --offline` twice) so it can run while a build is under way.

Small things noticed and not done: the scorecard's worst-takes list has no lower-is-better flag, so `solo.cost` carries a ceiling target to make its list point the right way; `test/band.test.ts` is the slowest test file (about 4.7 s) and is the one to split next if the budget tightens.

**Things learned that the next session should not relearn**

- Seats are delegated whole (style type, player, data, validation) with a written brief in `prompts/`; the main session owns the planner, feel, critic framework, tests, docs, and commits. Agents report "properties I believe always hold", which become the property tests, and each new property is checked by breaking the rule on purpose.
- A brief can over-specify. "Bars where the soloist lays out must be note for note what they were" was mine, and it produced a hand that jumped home when the solo ended. Ask for the musical property, not the byte identity, unless the identity is the point.
- A bug found on one kind of take usually lives outside the suite's kinds. The soloist's bugs were all outside four-pass jams at the stock tempo; `soloistTakes` in `test/takes.ts` is the wider set.
- Check `git status` after committing: a hidden error from `git add` once left a commit with the wrong contents.

## Open questions from the brief, resolved

See `DECISIONS.md` for the reasoning.

- Event and plan types: as above.
- Arrangement: stays in the chart file, per the provisional spec; not built until stage 6.
- Style packs: typed TypeScript data, validated by the compiler for shape and by `validateStyle` for meaning.
- Jam arc: the shape is fixed per style; the seed varies what is played inside it, not the arc.
- Browser storage: deferred to stage 6.
