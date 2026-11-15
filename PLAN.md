# Plan: stages 1 to 4

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

State on 2026-11-14: **stages 1, 2 and 3 are built and their gates passed. Stage 4 (jazz and funk as data) is under way.** Brandon said "go ahead" after answering the open questions below.

- Gate reports: `out/gate-1/GATE_REPORT.md`, `out/gate-2/GATE_REPORT.md`, `out/gate-3/GATE_REPORT.md`. Rewrite the files with `pnpm gate:1`, `gate:2`, `gate:3`.
- `pnpm check` passes: 442 tests in about 8.8 s of 10. `pnpm score` matches its baseline (`scorecard/blues.json`).

### Stage 4: how it is being built

Done on the main thread (`DECISIONS.md`, "stage 4 begins" and "a library for three styles"):

- A short vamp is a chorus of several laps (planner); the head is an offset in the arc (`ArcStyle.head`).
- `packages/styles/src/funk/` and `jazz/` exist with their own feel, tempo, arc and ending, and **placeholder seats** (the blues seat under another name) that each seat build replaces. They are in `UNFINISHED`, not `STYLES`; `ENSEMBLE_STYLES=funk,jazz node --test test/` holds them to the properties.
- Thirteen new library charts. Each style is held to its own charts in full and to the others in one take.

Seat builds, each from a brief in `prompts/`, each in its own clone under the session's scratch folder, committed there on a branch and merged here after the main thread has read the diff and the printed takes:

| Round | Brief | Model | State |
|---|---|---|---|
| 1 | `drums-jazz-funk.md` | Opus | merged; six properties in `test/drums.test.ts` |
| 1 | `solo-jazz-funk.md` | Fable | merged; the passing tone that resolves and `outgrown.thin` finished on the main thread |
| 2 | `bass-jazz-funk.md` (the walk; the riff, dead notes, the kick) | Fable | launched (clone `build-bass-jazz-funk`) |
| 2 | `chords-funk-guitar.md` (the guitar idiom) | Fable | merged; three guitar properties in `test/piano.test.ts` |
| 2 | `chords-jazz-piano.md` | Opus | brief written; the soloist is merged, so it can start when a slot is free |
| 3 | `review-style.md`: an independent review of each new style, in its own clone | Opus | brief written; runs when all four seats of a style are merged |

Round 2 starts when round 1 is merged (the funk bass follows the kick; the jazz piano hears the soloist and the snare). After each merge: turn the builder's "properties that always hold" into tests, break each on purpose once, and keep the blues goldens and scorecard unmoved.

Then, on the main thread: move funk and jazz into `STYLES` (the suite must stay inside 10 s. Measured with placeholder seats: three styles take about 24 s, a style alone 12 to 15 s of CPU. The levers: the determinism property renders every take twice and a sample would do; six seeds could be four, which `docs/TESTING.md` allows; jazz forms are long, so its jams could be a pass shorter. Measure again once the real bass and chord seats are in, on a quiet machine); golden takes for both; `scorecard/funk.json` and `jazz.json`; `scripts/gate-4.sh` (written, not yet run: the same chart in three styles, each style on its own charts, and the blues again for "did the blues get worse"; also run `pnpm gate:3` and check `git status out/gate-3` is clean, which says the blues takes he passed are byte for byte what they were); `out/gate-4/GATE_REPORT.md`, which must list every engine change made in this stage and why each was a missing concept.

Known and not yet handled in stage 4: the head out is not played light; in compound meters the soloist's "beat" is still a quarter note; funk's chord seat is the guitar only (the clavinet book is data for later).

**Feedback so far**

- Gate 1 (in Logic): sounds good so far, "a little plain"; velocities were slamming. Loudness is done (15% trim, by ear). "Plain" was to be judged again with the piano in.
- Gate 2: "so far so good". Nothing asked to change.
- Gate 3, first listen: the solos are "sounding pretty good, definitely intentional melodies that work well"; the piano got busy as the intensity ramped up; the bass was an octave high and could be more creative. All three were measured, changed, and the gate files rewritten (`DECISIONS.md`, "gate 3 feedback" and "a bass that varies its line"). 
- Gate 3, second listen (the rewritten files, a few more seeds): "seems pretty good from what i can tell. nice job!" Nothing asked to change. **Gate 3 is passed; stage 4 waits for Brandon's word to start.**
- Feedback becomes a property or a measure first, then a fix.

**Brandon's answers to the open questions (2026-11-14, asked one by one)**

- Settled, keep as built: the piano under a hot solo (2.0 strikes a bar, "right as it is"); the bass's depth in C and F (roots stop at E2, "fine as it is"); the amount of bass variety ("right amount"); the three worst solos of 200 ("acceptable").
- Not noticed, left as it is: the walk through the fourth (`R 3 4 #4 | 5 #4 4 3`). If the bass is ever called noodly, look here first.
- For later, not now: the wide bass drops ("okay for now, maybe we can revisit in the future"; about 6% of changes reached by a fall of a sixth or more into the lead-in); the two one-note drum fills at bar 8 at the mid level ("another one for long term improvement"; more phrase fills are style data). Neither blocks stage 4. Each wants a measure first when it is taken up.

**Models** (agreed with Brandon to stretch quota): Sonnet for mechanical work and small fixes with a property written first; Opus for well-specified builds and for adversarial reviews; Fable for open design problems and the main thread. What things cost, for scale: voicing build (Opus) 270k tokens, rhythm build (Fable) 525k, chord review (Opus) 240k, soloist build (Fable) 630k, piano around the soloist (Opus) 445k, soloist review (Opus) 270k, test-file split (Sonnet) 65k, bass variety (Opus) 445k. Every independent review found audible bugs the builder's own checks missed: keep doing one per seat, and give the reviewer its own copy of the repo (`git clone` the local repo into the scratch folder, `pnpm install --offline` twice) so it can run while a build is under way.

Small things noticed and not done: the scorecard's worst-takes list has no lower-is-better flag, so `solo.cost` carries a ceiling target to make its list point the right way; the suite is at about 7.6 s of 10 since the bass began choosing by the phrase; `test/band.test.ts` is still the slowest file (its first test renders and replays the whole library), and the bass's own cost per take (four times what it was) is the place to look if the budget tightens.

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
