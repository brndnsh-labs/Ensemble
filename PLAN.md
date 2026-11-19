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

State on 2026-11-16: **stages 1 to 5 are built and their gates passed.** **Stage 6 (the app) is under way: parts 1 to 4 are built and on the test site, and all five of part 5's styles (rock, disco, neo-soul, reggae, acoustic) are built, on the test site, and heard and passed by Brandon.** Acoustic plays a steel-string guitar, with the nylon as a choice. **The electric bass was "a little harsh"; he chose its touch and tone from a study** (`DECISIONS.md`, "every style heard; the electric bass is harsh", "the electric bass, by Brandon's ear"): a softer touch in neo-soul, funk and (unheard, by inference) disco, a much softer touch with the tone down in reggae; rock as it was. On the test site. **Part 5 is done.**

**The interface pass is under way** (2026-11-16; Brandon: "let's make this look nice! :)"). Agreed with him: a Stop button that stops at once beside a smaller Finish; the Band buttons muting live while playing; home as Recent, then his charts with their actions, then the built-in library behind search and a style filter ("home order sounds good"); a serif on the chart; tapping a bar to edit it ("tapping a bar to edit was really nice, we should implement something like that here"); iReal Pro import "isn't super important right now".
- **First half is built, merged and on the test site** (`DECISIONS.md`, "the interface pass, first half", and "... checked and merged; the chart in a serif, set larger"): Stop at once with Finish beside it and the space bar; the Band row under the chart, live as mutes while playing ("next time" for a seat that was out); home as Recent, Your charts (More: edit, rename, duplicate, export, delete), Built-in charts behind a search and a style filter; a chart's takes on its own screen; Export MIDI on the play screen; one set of controls.
- **The chart is in Roboto Serif, set larger, every chord on a page one size, and a long form scrolls a line at a time with the band** (Brandon's choices; BRIEF 11's "no scrolling during play" is lifted by his word). Waiting on his eye on the phone.
- Not done from what was proposed: the setup collapsed to one line before Play (the first half already made it two rows of fields; see whether he still wants more).
- **Second half is built, merged and on the test site** (`DECISIONS.md`, "the interface pass, second half: an editor you tap", "the editor you tap: checked and merged"): the editor opens on the chart (Chart | Text | Arrangement); press a bar and type its chords (a dock over the phone's keyboard with the bar before and after, Done, the format's keys, twelve chord endings, bar actions; on a laptop a field over the bar with Tab, Enter, Escape); bar lines typed spread over the bars after; a section's name opens rename, duplicate, add after, delete; Undo and Redo in the header; a new chart is four empty bars. Every tap is a rewrite of the text (`edit/rewrite.ts`), one section at a time in `fmt`'s layout. **Waiting on Brandon's phone**: nobody has seen the dock over a real keyboard.
- **Brandon tried the pass on his iPhone (2026-11-16): "works great on iphone, awesome job"**, the editor's dock included. Then: "seems difficult to navigate though - we should work on that. the audio we've cooked up is genuinely impressive, and i want the app to look and feel visually impressive as well. welcoming vibes, fun place to practice, but still snappy and responsive".
- **He said where he got lost**: "i opened a genre, then opened a chart, and when leaving the chart, i couldn't navigate back home". A stopgap is on the test site (`DECISIONS.md`, "a style opened on home has a way back").
- **He chose the poster wall** (direction A of the study, `prompts/app-look-study.md`; "reminds me of metro ui in the best way") and asked for one library with a style as a tag (`DECISIONS.md`, "the poster wall is chosen; one library, a style is a mark"). **Part 1 is built, merged and on the test site** (`prompts/app-poster-wall-1.md`; `DECISIONS.md`, "the poster wall, part 1" and "... checked and merged"): the look, home (the last thing played as a poster, the wall, his charts), the one library (`#/charts`, `#/charts/yours`, `#/charts/<style>`, search), the row of places that is the way back (`Trail.tsx`, `address.ts`). Waiting on his phone. **Part 2 is built, merged and on the test site** (`prompts/app-poster-wall-2.md`, an Opus build; `DECISIONS.md`, "the poster wall, part 2" and "... checked and merged"): the chart's screen as the study drew it. The setup is a sentence whose parts open sheets (`play/Sheet.tsx`); More holds the chord spelling, Focus, the instruments, kept takes, exports, and a chart's own actions; the dock floods with the ink of the style being played; the players' blocks light on their notes (`play/lamps.ts`); a style the chart was not written for plays at its own usual tempo unless he set one (`tempoFor`); a kept take's screen is the same screen. **He tried parts 1 and 2 on his phone (2026-11-16): "it seems really solid during playback, nice job!"**, and of the band: "seriously so much livelier and more musical compared to the previous version". He asked to keep building, mostly with Opus, a couple of builders at a time ("if something really requires fable, i trust your judgment"). **Part 3 is built, merged and on the test site** (`prompts/app-poster-wall-3.md`, an Opus build; `DECISIONS.md`, "the poster wall, part 3" and "... checked and merged"): Edit is a mode of the chart's screen. Edit becomes Done and nothing else moves; the chart is pressed as the editor's chart was; the dock holds Undo, Redo and Chart, Text, Arrangement in the band's place; Play puts the pencil down and starts the band on the chart as saved; a built-in's "Edit a copy" opens the copy in the mode. The editor is a hook of the chart's screen (`edit/useEditor.tsx`); `#/edit/<id>` is the mode's address. **Waiting on his phone**: that a tap on a bar still raises the keyboard, and the dock on it. **The library is pruned, renamed and has twelve standards; merged and on the test site** (`prompts/library-standards.md`, an Opus build; `DECISIONS.md`, "the library: pruned, renamed, and given standards" and "the library's standards: checked and merged"): six charts cut, no key in any title, `standard-*.chart` for the tunes (jazz plays each twice on a push; the full run hands every style every chart). 57 charts, then 53: four near-duplicate vamps were cut on his word (`DECISIONS.md`, "four vamps cut; ..."). Left from it, each its own piece of work: five standards respelt through a far key as text (a format decision), jazz's Dm7 voiced E F A C after D7b5 on Take the "A" Train (a property first). **The band plays in six and twelve; merged and on the test site** (`prompts/meters-design.md`, a Fable design and build; `DECISIONS.md`, "the band in six and twelve" and "... checked and merged"): a seat writes its bar again under a meter's name (`meters: { "12/8": ... }` on drums, bass, chords and soloist); jazz is written for 6/4 and the blues for 12/8; everything else keeps the fit. **The tempo counts the felt pulse** (the dotted quarter in 6/8, 9/8, 12/8; `Plan.tempo` is the figure, `Plan.quarters` times a tick). All Blues and Footprints (6/4) and a slow blues in 12/8 are in the library: 56 charts. **He has listened** (`out/meter-study-2/`: "done listening - great job so far"). A style may say its tempo range for a meter (`tempoRange`; the blues in 12/8 is 40 to 150; unsaid, a dotted-pulse meter gets two thirds of the style's range), and the setup sentence says a meter that is not 4/4. **Rock in 12/8 and acoustic in 6/8 are built, merged and on the test site** (`prompts/meter-rock-12-8.md`, `prompts/meter-acoustic-6-8.md`, Opus builds; `DECISIONS.md`, "rock in twelve", "acoustic in 6/8" and each "checked and merged"): each style's four seats written under `meters`, one chart each (`rock-slow-dance-eb`, `acoustic-folk-six-em`), 58 charts. The lead-in property now leaves a figure's own root and fifth alone (the neo-soul golden plays that motion). **He has heard both** ("great work"). **The push suite is at 17.8 s of 20**: the next addition of takes must consolidate. Left: funk, disco, reggae and neo-soul keep the fit in compound time; jazz's Dm7 voicing on "A" Train; five standards respelt through far keys; the soloist sparse in slow compound bars. The first smoke run after each of these two releases failed on a 5 s wait for the band (the edge had not kept the new build yet); against a served site the journeys now wait 15 s (`playwright.config.ts`). The test site serves `de02e96`. The study's pages, both directions, are kept in `out/look-study/` (not committed).
- **The instruments are fetched faster** (`DECISIONS.md`, "the instruments, fetched faster"; he had found a fresh browser slow): the background save went from 50 s to 5 to 12 s on the test site (24 files at once, and a recording's marked address may be kept by the edge). On the test site at `2f96f11`.
- **Gate 6 has begun** (2026-11-16, his word: "i'd say the week has already started ... it seriously sounds incredible"). Collect what he trips on. **Done during it, all merged and on the test site** (each has its `DECISIONS.md` section and a "checked and merged" one): the jazz piano's ninth under the third; small things in the app; **every style written in compound time** (funk, disco, reggae and neo-soul in 6/8 and 12/8, pages in `out/meter-study-4-<style>/`; neo-soul heard, "it might drag a little", its late four now a sixteenth late there; funk, disco and reggae waiting on his ear); **the poster wall in motion** (a study of ten switches, his choice "everything else looks wonderful" but the live tiles; titles fitted whole on a phone by his note; `packages/app/src/motion.ts`). 66 charts. **Both suites are near their time**: `pnpm check` 19.6 s of 20, `pnpm test:full` 55.3 s of 60 on a quiet machine, with the push suite already sampling the other meters; settle that before anything adds takes. **Next, not started**: the other compound meter for jazz (6/8, 12/8), the blues and rock (6/8) and acoustic (12/8); the soloist reading a bar's length where it should read pulses (sparse in a fast bar of six, `solo.cost` high in slow twelve); a soloist's major seventh over a dominant tonic in six. **Later, a Fable design**: every style in every meter (5/4, 7/8, 9/8 ...) worked out by the band, not written part by part (`DECISIONS.md`, "gate 6 has begun ...").
- **Under way, 2026-11-17** (his words that day: the soloist "a little sparse ... makes sense to ramp things up"; "a slider to configure soloist density easily up front"; "an option to let the soloist enter immediately"; then, of what the soloist lacks, "thinking about pick-up notes in particular"; the order is the main thread's, "there's no rush"):
  1. **A busier soloist, `soloDensity`, `soloFromTop`, tempo felt in pulses, and the two settings in the app: merged and on the test site** (`DECISIONS.md`, "a busier soloist, and a setting for it" and its "checked and merged"). **Heard and passed** (2026-11-17: "i agree with your defaults, the range seems really good"). Still for his hands: the Solo block beside Play on his iPhone. The solo builds less than it did (logged); double time would cure it and is not owed for the slider's range.
  3. **Pickups are merged and on the test site** (`DECISIONS.md`, "the soloist's pickups" and its "checked and merged"): every style, into the top of a chorus and a solo, up to half a bar. **Waiting on his ear**: the page `out/solo-pickups/` (served on 8765 while he listens; stop it when he says). For him: reggae is led in almost never; a pickup into a chorus top makes that phrase open on the one; the solo builds less again in rock and disco.
  4. **Every style now writes 4/4, 6/8 and 12/8 (jazz 6/4 too): all merged and on the test site** (`DECISIONS.md`, "the blues in six", "rock in six", "jazz in six and twelve", "acoustic in twelve" and their merge sections). **Waiting on his ear**: `out/meter-study-5-blues/`, `-rock/`, `-jazz/`, `-acoustic/` and `out/solo-pickups/` (all served on 8765; stop it when he says). Quiet timings with everything in: `pnpm check` 25.1 s of 26, `pnpm test:full` 69.7 s of 78, `pnpm score` 63.2 s of 120. **The push suite has a second of room**: before anything else adds takes, look where `DECISIONS.md`, "where the push suite's time goes", points. No builder is running.
  5. **The alto shakes, scoops and falls** (`prompts/horn-moves.md`, merged 2026-11-18): he chose the study's ninth clip (`out/horn-study/`), "most varied and natural of the bunch". A shake on a phrase's last note, a scoop seldom, a fall rarely and dying away as it drops (`WrittenNote.fade`, new; his word: "i trust your judgment on the fade"). Guitars and vibes unchanged. **Waiting on his ear**: `out/horn-moves/` (before and after by style, half and double the chances in jazz and the blues, the fall fading and not). To ask him: are the shakes too many in the slower styles. `pnpm check` is at 25.3 s of 26: find time before the next property.
  6. **The app has its icon** (2026-11-18): he chose B1 of the second page ("b1 is my pick ... feel free to refine"): four tiles as four bars, E7 and three repeat-the-bar marks. `scripts/icons.ts` draws every file in `packages/app/public/`. Waiting on his eye on the phone (remove the home-screen app and add it again to see it). **The old version is being replaced** (2026-11-18, `DECISIONS.md` "replacing the old version"): this repo is `main` of github.com/brndnsh-labs/Ensemble (public; the old code is `legacy`), every commit under his noreply address; `.github/workflows/ci.yml` checks, builds and releases every push to the test site (first run green, test site serving it); production is by hand (`gh workflow run ci -f production=true`). **Production is the new app since 2026-11-18** (his word: "let's do prod"; smoke 5 of 5 against it; the old image is `sha-06c97d8…`, named in `DECISIONS.md`). To ask him: does his phone's home-screen app show the new one. **Cleaned up the same day** ("go ahead with the cleanup"): the account API is out of both recipes, Caddy and the nightly dump (its databases, dumps and env files are kept on the box; `~/code/homelab-maintenance` commit `30f7314`, not pushed); `pnpm deploy:test` is retired. Left for him: push the homelab commit; the firewall's rules for 8092 and 8093 (needs his grant on the host); whether to delete the API's data.
  6. **What the soloist still lacks, in the order proposed to him**: a horn's scoop, fall and vibrato (the alto plays every note plain); grace notes and slides; an idea said again a beat early or late; double-time bursts at the busy end of the slider.

### Stage 6: where it stands

- **Part 1 is built, reviewed, and on the test site**: https://ensembletest.brndn.zip serves it (`DECISIONS.md`, "stage 6 begins", "the app is on the test site", "the app's first part, reviewed"). Brandon, from his phone: "works great, nice job". `packages/app`: library, play screen with the chart sized to fit, playhead, status strip, names and numerals, focus mode, band setup, Play/Finish/Stop, open-ended jams, credits; installable, offline; smoke journeys 1, 2 and 4.
- **Run it**: `pnpm app --host 0.0.0.0` for development (port 8766). A push to `main` releases to the test site through CI; production is by hand (`CLAUDE.md`, Commands).
- **Not yet answered by Brandon** (no complaint so far, so the choices stand): the join when Finish is pressed mid-pass, by ear; the chord symbols (triangle, circle, raised qualities); one button for Play, Finish and Stop.
- **His to decide**: the durable recipe for the test stack in homelab-maintenance (one service, the API and its route retired), and stopping the old repo's CI from releasing over it.
- **Part 2, the editor, is built, on the test site, and passed by Brandon** on his iPhone: the key row sits right above the keyboard, Export downloads, and a long line scrolling sideways "is okay for now".
- **Part 3, takes and export, is built and on the test site** (`DECISIONS.md`, "a take, as it is kept", "takes and export"): Keep beside the transport, a Takes shelf, a screen for each take (`#/take/<id>`) that plays it again by its seed, Export MIDI, Export take (the file `ensemble replay` reads); smoke journey 5. A jam told to finish partway is kept as heard (`TakeOptions.toldAt`). **Waiting on Brandon**: Export MIDI on the iPhone, and whether a replayed take is the one he remembers.
- **The interface is a draft, by Brandon's word** (2026-11-15, after exporting a take on his phone: "export works, but the way to get there was pretty confusing. we'll want to make the interface much more intuitive at some point, and that goes for everything"). The parts are being built to work; a pass over the whole app for how it is found and used comes after them, before gate 6. Do not polish screen by screen until then; do write down what he trips on.
- **Part 4, song mode and the arrangement grid, is built and on the test site** (`DECISIONS.md`, "the arrangement block, read and played", "song mode and the arrangement grid"): the block is one line for each section the song plays (`docs/CHART_FORMAT.md` section 11); the play screen's Length has "The song, once through"; the editor has Chords and Arrangement, the second a grid of sections by players. Not yet seen by Brandon.
- **Part 5, the remaining styles, has begun: rock is built and on the test site** (`DECISIONS.md`, "rock", "rock, checked and merged"; brief in `prompts/style-rock.md`, an Opus build from the notes). Piano on chords; the soloist is the lead guitar. Brandon on the first hearing, with the alto: "sounds good so far!".
- **The engine suite's budget grows with the styles** (10 s with three, 2 more for each after; `docs/TESTING.md`): 10.5 s of 12 with four. Brandon left the call to the main thread (`DECISIONS.md`, "the lead guitar's drive, the soloist's level, and the suite's budget").
- **A lead guitar exists**: `driven-guitar`, the clean guitar through an amplifier at three times drive, chosen by Brandon's ear. The soloist is about a decibel under the band in every style (`pnpm levels`; the guitar reads 1.6 dB under rock's band).
- **The lead guitar bends and shakes** (`DECISIONS.md`, "the lead guitar bends and shakes"; brief `prompts/solo-pitch-moves.md`, a Fable build, merged and on the test site). The two movements Brandon chose from the nine in `scripts/pitch-study.ts`: a quick bend into a note a phrase lands on, and a wide vibrato on held notes. About one bent note a chorus, the solo's top note always; a shaken note every bar or two. Blues bends on the guitar too; jazz and funk only shake. The alto and vibraphone are unchanged to the byte. **Heard and passed** (2026-11-15: "it all sounds really tasteful, and the soloist comes alive on guitar now"); the numbers stand. Later, if he wants them: slides stepped by frets.
- **Disco is built and on the test site** (`DECISIONS.md`, "disco", "disco, checked and merged"; brief `prompts/style-disco.md`, an Opus build): four on the floor, the octave pump, the clean guitar's chuck, alto as the soloist; six charts, one an arranged song with a break. Four small optional engine fields. Level with funk and rock (`pnpm levels disco`: -17.0 LUFS with everyone). **Heard and passed** (2026-11-16).
- **Neo-soul is built and on the test site** (`DECISIONS.md`, "neo-soul", "neo-soul, checked and merged"; brief `prompts/style-neosoul.md`, an Opus build): a swung-sixteenth loop with ghosts and the late four, a deep bass behind the beat, the Rhodes in two-handed spreads that close under the soloist, a clean guitar as the soloist (new in `SOLO_INSTRUMENTS`); six charts, one an arranged song. -17.7 LUFS with everyone. **Heard and passed** (2026-11-16).
- **The app opens each chart on its style's own soloist** (the choice is kept with the chart). Before this, every chart opened on the vibraphone.
- **Reggae is built and on the test site** (`DECISIONS.md`, "reggae", "reggae, checked and merged"; brief `prompts/style-reggae.md`, an Opus build): the one drop, a bass riff that keeps its hole on the One, the guitar's skank, alto as the soloist; six charts in the slow count, one an arranged song with a drum and bass breakdown. -17.2 LUFS with everyone. **Heard and passed** (2026-11-16).
- **The suite**: 14.2 s of 18 with seven styles; `test:full` 34.9 s of 60. 79 musical properties.
- **Acoustic is built and on the test site** (`DECISIONS.md`, "acoustic, and a guitar that picks", "acoustic, checked and merged; two older faults fixed"; brief `prompts/style-acoustic.md`, a Fable build): a guitar in open position that fingerpicks when the band is quiet and strums when it is not (a stroke of the rhythm book can be plucked; with no bassist the thumb alternates basses), an upright on roots and fifths, a quiet kit; the nylon guitar on chords and as the soloist until the steel pack is cut; six charts, one an arranged song that opens on the guitar alone. -18.2 LUFS with everyone. The add9 and picking in 3/4 are not built. **Heard and passed** (2026-11-16).
- **The suite**: 16.0 s of 20 with eight styles; `test:full` 45 s of 60; `score` 56 s of 120. 81 musical properties. `pnpm test:full` now hands every style every chart written for another (once each), so it is the every-style-on-every-chart probe; the standards (`standard-*.chart`) are played by the jazz band in every kind on half the seeds there. Played in every kind on every seed by every style, three cases fail and are left for a decision (`DECISIONS.md`, "the library: pruned, renamed, and given standards").
- **Acoustic's guitar is the steel-string, and the nylon is a choice** (`DECISIONS.md`, "the acoustic guitar is a steel-string archtop", "the steel-string guitar is cut and acoustic plays it; a seat's instrument can be chosen"): pack `steel-guitar` (Karoryfer's Shinyguitar through a microphone, CC0; 4.6 MB, 78 MB decoded) on chords and as the soloist. A style may list more than one instrument for a seat (`SoundStyle.choices`, each with its level); the play screen shows a picker under Band only where there is a choice; the choice is kept with the chart and in a kept take (`TakeOptions.instruments`). Only acoustic offers one. On the test site (commit `70b2646`). **Heard and passed** (2026-11-16).
- **Packs, as the shelf grows** (no manager is planned): the app saves every pack for offline use up front (29 MB for eleven); if that grows past what a phone should fetch unasked, save a style's packs when it is first played. The credits page lists packs by itself.
- **The background save of packs** waits for a band being loaded and fetches shared instruments first (`DECISIONS.md`, "the first visit, timed"). Brandon does not want more than that built: "i don't think we need to over-engineer it yet".
- **After every builder**: look for shells it left running (`ps` for children of the session; a `pgrep -f` wait loop matches itself and never ends) and stop them by process ID. The briefs since acoustic's say not to leave any.
- **Then**: the pass over the whole interface for how things are found and used (collect what Brandon trips on), then gate 6.
- **Left out of part 5, for later if wanted**: slides stepped by frets, a horn's scoops and falls, a head for the soloist, the keyboard books for disco, reggae and acoustic, an organ (FreePats' drawbar emulation is CC0 and does not loop), reggae's fast count and its drop in 3/4, a lead-in decision made once for a section, a push the whole band makes together, acoustic's add9 and its picking in 3/4, the chosen instrument's program in an exported MIDI file.
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
