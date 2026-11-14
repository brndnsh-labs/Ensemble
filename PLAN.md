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

State at the third pause on 2026-11-14 (session quota). Everything is committed; no agent is running.

**Stages 1 and 2 are built and their gate files are written** (`out/gate-1/`, `out/gate-2/`, each with a `GATE_REPORT.md`; `pnpm gate:1`, `pnpm gate:2`). **Stage 3 is partly built.** `pnpm check` passes (431 tests, about 6.7 s of 10); `pnpm score` matches its baseline.

**Feedback so far (gate 1, in Logic)**: sounds good so far, "a little plain"; velocities were slamming. Loudness is done (15% trim, hat under the backbeat, three measures). "Plain" is to be judged again with the piano in. Gate 2 has not been heard yet.

**Open, waiting on Brandon's ear**

- Gate 1: the wide bass drops (they follow from the register) and the two one-note phrase fills at mid level. See `out/gate-1/GATE_REPORT.md`, "Not yet acted on".
- Gate 2: the questions under "What to listen for" in `out/gate-2/GATE_REPORT.md`. The ones most likely to need a change: the piano's level under the drums, the modest lock with the drums, the pump with no variation, the rub in rootless dominants.
- Further feedback becomes a property or a measure first, then a fix.

**Models** (agreed with Brandon to stretch quota): Sonnet for small fixes with a property written first and for mechanical work; Opus for well-specified builds and for adversarial reviews; Fable for the open design problems and the main thread. What things cost, for scale: voicing build (Opus) 270k tokens, rhythm build (Fable) 525k, chord review (Opus) 240k, soloist build (Fable) 630k, CLI save and replay (Sonnet) 50k. Each review so far found audible bugs the builder's own checks missed; keep doing one per seat.

**Stage 3: done so far**

- The plan control: `solo` option (`--solo`), `PlanBar.solo`, the solo schedule, and the band's arc peaking with the solo (`plan/plan.ts`: `soloMarks`, `soloTurn`, `soloClimax`).
- The soloist (`players/solo/`, `packages/styles/src/blues/solo.ts`, `critic/measures/solo.ts`), from `prompts/seat-solo.md`. Its builder's report is summarised in `DECISIONS.md`, "the soloist". Selection against first candidate on the same seeds: mean phrase cost 1.52 against 2.13; worst tenth of takes from 1.77 against 2.53.
- Six soloist properties, a golden take with a solo, and the soloist on in one kind of take across the suite.
- CLI `render --save take.json` and `replay take.json --out take.mid`.

**Stage 3: still to do, in order**

1. **The piano around the soloist** (CH-59 to CH-72, ST-blues-33): keep off the soloist's note and under its register when voicing (CH-59, CH-60, CH-63), lay out under the line and answer its breaths. The vibraphone's home (C5) is the piano's top-voice target, so this matters. Do it by candidates and the critic, not by a coin per strike: add laid-out and answering variants to the phrase plans in `players/chords/phrase.ts` and features to `critique.ts` (`under-the-soloist` is already there). The soloist's report says what the comper can rely on: a breath is a beat or more of silence; `phrasesOf` in `players/solo/critique.ts` sorts solo notes into phrases (not yet exported). Planned as an Opus build with a written brief (`prompts/comp-with-soloist.md`, not yet written), then properties from its report. The stage's "done when" asks for the comping's overlap with the soloist's rhythm to be lower with the soloist present than a naive baseline: report both numbers.
2. **An independent Opus review of the soloist** (read-only, its own charts, as for the chord seat). It can run alongside step 1. Not yet read by anyone but the builder: the alto sax, tempo 60 and 160, quiet and loud levels, song mode, open jams, the test charts. The stop, button and hits endings have never run for the soloist.
3. **Gate 3 files and report** (`scripts/gate-3.sh`, `out/gate-3/`): ten seeds on a blues including the three lowest-scoring by `solo.cost` (the scorecard's worst list names them), each saved with `--save` so a take can be replayed. Report selection against first-candidate, and the comping overlap against its baseline.
4. **The kickoff's closing summary**: where each gate report is, the blues scorecard, the exact render and score commands, and the five things I am least sure of. Do not start stage 4.

Small things noticed and not done: the scorecard's worst-takes list has no lower-is-better flag, so `solo.cost` carries a ceiling target to make its list point the right way; `test/properties.test.ts` is over 1,300 lines and could be split by seat.


**Things learned in this session that the next one should not relearn**

- Seats are delegated whole (style type, player, data, validation) with a written brief in `prompts/`; the main session owns the planner, feel, critic framework, tests, docs, and commits. Agents report "properties I believe always hold", which become the property tests.
- An independent reviewer found real bugs the author's own 341-row corpus missed. Review each seat before its gate.
- Check `git status` after committing: a hidden error from `git add` once left a commit with the wrong contents.

## Open questions from the brief, resolved

See `DECISIONS.md` for the reasoning.

- Event and plan types: as above.
- Arrangement: stays in the chart file, per the provisional spec; not built until stage 6.
- Style packs: typed TypeScript data, validated by the compiler for shape and by `validateStyle` for meaning.
- Jam arc: the shape is fixed per style; the seed varies what is played inside it, not the arc.
- Browser storage: deferred to stage 6.
