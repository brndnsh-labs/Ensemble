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

State on 2026-11-14, after the review fixes. Everything is committed.

**Stage 1 is built and its gate files are written** (`out/gate-1/`, with `GATE_REPORT.md`). Waiting on Brandon's ears. `pnpm check` passes (413 tests, about 4.5 s); `pnpm score` matches its baseline.

**Open from stage 1**

- The review's findings are fixed except the ones that wait for a listening verdict: the wide bass drops (they follow from the register) and the two one-note phrase fills at mid level. Both are in `out/gate-1/GATE_REPORT.md` under "Not yet acted on". The review did not reach 3/4, 6/8, long arcs, or whether the property tests are weaker than their names.
- Gate 1 feedback, when it arrives, becomes a property or a measure first, then a fix.

**Models** (agreed with Brandon to stretch quota): Sonnet for small fixes with a property written first and for mechanical work; Opus for the voicing engine and for adversarial reviews; Fable for comping rhythm, the soloist, and the main thread. The chord seat is built in two parts, in sequence: voicing (Opus), then rhythm (Fable). See "Built in two parts" in `prompts/seat-chords.md`.

**Stage 2, in the order to pick up**

1. The critic framework, `ensemble score`, and the drum, bass, and band measures are done (`packages/engine/src/critic/`, baseline in `scorecard/blues.json`).
2. **Chord seat**: the brief is `prompts/seat-chords.md`, built in two parts (see its last section).
3. When it lands: read rendered takes bar by bar; turn its list of "properties that always hold" into tests in `test/properties.test.ts` (register floor, chord identity, every chord struck, voice leading); have a second agent review it against part B of the notes; then `pnpm goldens`, `score --update`, each with a line in `DECISIONS.md`.
4. Gate 2 files and report: a script like `scripts/gate-1.sh`, with takes that isolate each level, and the scorecard's comping lines in the report.

**Stage 3** follows `PLAN.md` above: soloist by phrase with candidates and critic selection (report selection against first-candidate on the same seeds), comping regenerated around it, a featured-seat control, takes saved and replayed by seed. Read part B's soloist sections and Q-43 to Q-50, and ME-22 to ME-29 in part D, before designing it.

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
