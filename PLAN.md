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

State on 2026-11-15: **stages 1 to 5 are built and their gates passed.** **Stage 6 (the app) is under way: parts 1 to 4 are built and on the test site, and part 5 has its first style, rock.**

### Stage 6: where it stands

- **Part 1 is built, reviewed, and on the test site**: https://ensembletest.brndn.zip serves it (`DECISIONS.md`, "stage 6 begins", "the app is on the test site", "the app's first part, reviewed"). Brandon, from his phone: "works great, nice job". `packages/app`: library, play screen with the chart sized to fit, playhead, status strip, names and numerals, focus mode, band setup, Play/Finish/Stop, open-ended jams, credits; installable, offline; smoke journeys 1, 2 and 4.
- **Run it**: `pnpm app --host 0.0.0.0` for development (port 8766). `pnpm deploy:test` puts a commit on the test site (docker04 over SSH; Brandon allowed this "for now", for the test stack only). Look at it headless with `node scripts/look.ts`.
- **Not yet answered by Brandon** (no complaint so far, so the choices stand): the join when Finish is pressed mid-pass, by ear; the chord symbols (triangle, circle, raised qualities); one button for Play, Finish and Stop.
- **His to decide**: the durable recipe for the test stack in homelab-maintenance (one service, the API and its route retired), and stopping the old repo's CI from releasing over it.
- **Part 2, the editor, is built, on the test site, and passed by Brandon** on his iPhone: the key row sits right above the keyboard, Export downloads, and a long line scrolling sideways "is okay for now".
- **Part 3, takes and export, is built and on the test site** (`DECISIONS.md`, "a take, as it is kept", "takes and export"): Keep beside the transport, a Takes shelf, a screen for each take (`#/take/<id>`) that plays it again by its seed, Export MIDI, Export take (the file `ensemble replay` reads); smoke journey 5. A jam told to finish partway is kept as heard (`TakeOptions.toldAt`). **Waiting on Brandon**: Export MIDI on the iPhone, and whether a replayed take is the one he remembers.
- **The interface is a draft, by Brandon's word** (2026-11-15, after exporting a take on his phone: "export works, but the way to get there was pretty confusing. we'll want to make the interface much more intuitive at some point, and that goes for everything"). The parts are being built to work; a pass over the whole app for how it is found and used comes after them, before gate 6. Do not polish screen by screen until then; do write down what he trips on.
- **Part 4, song mode and the arrangement grid, is built and on the test site** (`DECISIONS.md`, "the arrangement block, read and played", "song mode and the arrangement grid"): the block is one line for each section the song plays (`docs/CHART_FORMAT.md` section 11); the play screen's Length has "The song, once through"; the editor has Chords and Arrangement, the second a grid of sections by players. Not yet seen by Brandon.
- **Part 5, the remaining styles, has begun: rock is built and on the test site** (`DECISIONS.md`, "rock", "rock, checked and merged"; brief in `prompts/style-rock.md`, an Opus build from the notes). Piano on chords; the soloist is the lead guitar. Brandon on the first hearing, with the alto: "sounds good so far!".
- **The engine suite's budget grows with the styles** (10 s with three, 2 more for each after; `docs/TESTING.md`): 10.5 s of 12 with four. Brandon left the call to the main thread (`DECISIONS.md`, "the lead guitar's drive, the soloist's level, and the suite's budget").
- **A lead guitar exists**: `driven-guitar`, the clean guitar through an amplifier at three times drive, chosen by Brandon's ear. The soloist is about a decibel under the band in every style (`pnpm levels`; the guitar reads 1.6 dB under rock's band).
- **The lead guitar bends and shakes** (`DECISIONS.md`, "the lead guitar bends and shakes"; brief `prompts/solo-pitch-moves.md`, a Fable build, merged and on the test site). The two movements Brandon chose from the nine in `scripts/pitch-study.ts`: a quick bend into a note a phrase lands on, and a wide vibrato on held notes. About one bent note a chorus, the solo's top note always; a shaken note every bar or two. Blues bends on the guitar too; jazz and funk only shake. The alto and vibraphone are unchanged to the byte. **Waiting on Brandon's ear**: how often it bends and shakes (`habits.bend.elsewhere` and `habits.shake` are the numbers), and whether rock's busy last chorus wants more than its top note bent. Later, if he wants them: slides stepped by frets.
- **Next**: disco, neo-soul, reggae, acoustic, one at a time, each after the one before has been heard; `pnpm levels` for each before his ear is asked. What they need that is missing: electric piano and organ packs (the old Rhodes source is non-commercial share-alike), a steel-string guitar and its strummed idiom, a push the whole band makes together. Then the pass over the whole interface, then gate 6.
- **Left open by gate 5**, holding until an ear says otherwise (`DECISIONS.md`, "gate 5 passed"): the mix stays at the measured numbers; packs load every layer; one kit serves all three styles; both soloists stay.

### Stage 5: how it was built

- **Sources** are pinned in `scripts/packs/sources.ts` and fetched into `.sources/` (not in git; about 5 GB) by `scripts/packs/fetch.ts`.
- **The pack format** is the type in `packages/audio/src/pack.ts`. Packs go in `assets/packs/<id>/` with `pack.json` and the source's `LICENCE`.
- **Order**: the jazz and blues quartet first (drum kit, upright bass, grand piano, alto sax, vibraphone; brief in `prompts/cut-packs.md`), then the audio package (timeline in seconds, scheduler with its fake-time property, sampler, mixer), a bare page and a render to WAV, then funk's two packs (electric bass with a dead note, clean guitar with a muted stroke), mix presets, gate 5.
- **Built so far**: the scheduler and its three fake-clock properties (`test/audio.test.ts`); the sampler, mixer and live player (`packages/audio`); the audition page (`pnpm audition`, then `/tools/audition/`) with a fader for each seat; `pnpm render:audio` (a take to a WAV in headless Chrome, or `live=1` to count late notes); `scripts/check-timing.ts`. The first five packs are cut and measured (`DECISIONS.md`, "the first five packs, checked"). Funk's two are briefed in `prompts/cut-funk-packs.md`.
- **Gate 5 passed** (2026-11-15): sixteen files and the report in `out/gate-5/` (`pnpm gate:5` renders them again; the audio is not in git). Safari on his iPhone 17 decodes the Opus packs and the tap unlocks audio. A ten-minute live take ran with no late or dropped note.

- Gate reports: `out/gate-1/GATE_REPORT.md` to `out/gate-5/GATE_REPORT.md`. Rewrite the files with `pnpm gate:1` to `gate:5`.
- `pnpm check` passes with three styles in about 8.8 s of 10. `pnpm score` matches its baselines (`scorecard/blues.json`, `funk.json`, `jazz.json`).

### Stage 4: how it is being built

Done on the main thread (`DECISIONS.md`, "stage 4 begins" and "a library for three styles"):

- A short vamp is a chorus of several laps (planner); the head is an offset in the arc (`ArcStyle.head`).
- `packages/styles/src/funk/` and `jazz/` exist with their own feel, tempo, arc and ending, and **placeholder seats** (the blues seat under another name) that each seat build replaces. They began in `UNFINISHED` and joined `STYLES` when every seat was their own.
- Thirteen new library charts. Each style is held to its own charts in full and to the others in one take.

Seat builds, each from a brief in `prompts/`, each in its own clone under the session's scratch folder, committed there on a branch and merged here after the main thread has read the diff and the printed takes:

| Round | Brief | Model | State |
|---|---|---|---|
| 1 | `drums-jazz-funk.md` | Opus | merged; six properties in `test/drums.test.ts` |
| 1 | `solo-jazz-funk.md` | Fable | merged; the passing tone that resolves and `outgrown.thin` finished on the main thread |
| 2 | `bass-jazz-funk.md` (the walk; the riff, dead notes, the kick) | Fable | merged; three properties in `test/bass.test.ts`; all three styles pass every property |
| 2 | `chords-funk-guitar.md` (the guitar idiom) | Fable | merged; three guitar properties in `test/piano.test.ts` |
| 2 | `chords-jazz-piano.md` | Opus | merged; one property in `test/piano.test.ts`, and the swung-eighths property now covers the whole band |
| 3 | `review-style.md`: an independent review of each new style, in its own clone | Opus | both done. Jazz: the unlabelled bridge fixed; the rest are listening questions. Funk: nothing changed; the gate script spreads its seeds |

**One subagent at a time** (Brandon, 2026-11-15, after the usage limit was hit twice). Round 2 starts when round 1 is merged (the funk bass follows the kick; the jazz piano hears the soloist and the snare). After each merge: turn the builder's "properties that always hold" into tests, break each on purpose once, and keep the blues goldens and scorecard unmoved.

Done since (`DECISIONS.md`, "funk and jazz ship"): funk and jazz are in `STYLES`; two golden takes each; `scorecard/funk.json` and `jazz.json`; `pnpm score` checks all three. `pnpm check` 8.8 s of 10 with three styles, `pnpm test:full` 19.5 s.

Gate 4 is written: 35 takes from `pnpm gate:4` and `out/gate-4/GATE_REPORT.md` (the two questions, what to listen for in each band, every engine change of the stage and why it was a missing concept, the sixteen tests added). `pnpm check` 8.8 s of 10 with 78 properties, `pnpm test:full` 19 s, `pnpm score` no movement in any style, `out/gate-3` byte for byte unchanged.

Left open by gate 4 (none blocks stage 5; each wants a property or a measure first when taken up):

- The listening questions in `out/gate-4/GATE_REPORT.md` that Brandon has not spoken to: his verdict was short and positive, which closes the gate, not each question.
- **The funk pool is small** (three kicks, about six riffs, four strums at the working level): widen it as data, with a measure first (distinct grooves in 100 seeds: 57 today).
- **The app picks a fresh seed for each jam** (stage 6). At one seed, every chart with an `[A]` draws the same held choices; that is by design, since draws are keyed by position so an edit stays local. An engine change for it was considered and withdrawn (`DECISIONS.md`, "the groove does not follow the chart after all").
- If the band is heard guessing at a change (jazz drums against the piano's push; the funk guitar's push against the bass): the concept is a push marked in the plan that every seat reads.

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
- For later, from the jazz review (2026-11-15): **the jazz waltz comp**. The piano in 3/4 is one held chord a bar because a rhythm book is written in 4/4 only. Brandon: "we should think about what some of the greats do as they're comping waltzes". The concept missing is a book per meter; the 3/4 book should be written from a study of how the great pianists comp a waltz, and wants a measure first (single-strike bars under a soloist, ST-jazz-30).

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
