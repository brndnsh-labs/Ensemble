# Ensemble: project brief

## 1. What this is

Ensemble is a backing band in a browser. You give it chord changes and a style, and a rhythm section plays them: drums, bass, a chord instrument, and optionally a soloist. It is a personal tool for one musician (Brandon, who plays bass and guitar) to practice, improvise, and sketch songs.

This is a ground-up rewrite. A previous version exists and works, but it grew out of experiments and its structure reflects that history. There are no users to migrate and nothing in the old design is binding. The old code is deliberately absent from this folder. What carries over is musical knowledge, in `docs/MUSIC_NOTES.md`.

## 2. The three use cases

In priority order:

1. **Jam.** Pick up an instrument, choose a progression and a style, and play over a looping band. This is most sessions. It must take seconds to start. A jam can have a loose time limit, and the band lands a real ending when the time is up.
2. **Write.** Enter a song quickly by typing chords, then shape it: which instruments play in which sections, and how intense each section is.
3. **Export.** Send the band's performance to Logic Pro as editable MIDI tracks, to get past the blank-project problem. Drums, bass, and chords are required. The soloist comes along because it is produced the same way.

## 3. Core concepts

| Concept | Meaning |
|---|---|
| **Chart** | A song's harmony and form: sections, bars, chords, key, meter. Stored as plain text (`docs/CHART_FORMAT.md`). Layer one. |
| **Arrangement** | Who plays in each section and how hard. A grid of sections by players. Layer two. Optional. |
| **Style pack** | Data describing how a band plays a genre: grooves, voicing rules, bass behavior, anticipation habits, endings, default arrangement arc, mix preset. |
| **Plan** | The complete roadmap of one performance: an ordered list of section passes, each with arrangement values, from count-in to final chord. |
| **Player** | A generator for one seat in the band. Reads the plan and what other players have written, emits events. |
| **Event** | A note or marker with a musical time. The only thing players produce. |
| **Critic** | Scoring functions that judge musical material. Used to choose among candidates and to report quality over many seeds. |
| **Take** | One performance, fully determined by chart, style, plan options, and a seed. |

## 4. The pipeline

```
chart text
   -> parse            -> Chart (+ diagnostics)
   -> plan             -> Plan        (inputs: Chart, style, mode, options, seed)
   -> players          -> Event[]     (drums, bass, soloist, chords; full lookahead)
   -> consumers:
        MIDI file writer   (export, CLI)
        audio scheduler    (browser playback)
        chart view         (playhead, jam status)
```

Everything up to `Event[]` lives in the engine and is pure. This is the central design decision. It makes export and playback two views of the same performance, it makes the music checkable without audio, and it lets players look ahead and at each other.

### 4.1 Two modes, one plan

- **Song mode.** The plan follows the chart's sections in order, with an authored arrangement if one exists.
- **Jam mode.** The planner writes the plan. It loops the form and shapes an arc across the passes: ease in, build, feature the soloist, pull back, peak, end.

Both produce the same Plan type. Nothing downstream knows which mode made it.

### 4.2 Timed jams

A jam may have a loose time limit. The planner converts it to a whole number of passes through the form, choosing the count closest to the limit, minimum one. It never cuts mid-form. Example: a 32-bar form in 4/4 at 120 bpm takes 64 seconds, so a 10-minute limit yields 9 passes plus the ending.

The last pass ends on a resolution. Ending strategies belong to the style pack (a tag, a ritard, a held final chord, a turnaround that resolves instead of cycling). The chart's key tells the band where home is. If the chart has an `Outro` section, that replaces the generated ending.

An untimed jam loops until stopped. Stopping requests an ending at the end of the current pass, so the band still lands. The planner must support extending a plan (generating further passes) without changing passes already played.

### 4.3 Determinism

- All randomness comes from a seeded generator passed in explicitly. No `Math.random`, no time, no global state.
- Same chart, style, options, and seed produce byte-identical events.
- A take the user likes can be saved by its seed, replayed, and exported exactly as heard.

### 4.4 Events

- Time is musical: ticks at a fixed resolution (480 per quarter note is a reasonable default), not seconds. Tempo is applied by consumers.
- Each note carries its grid position and a separate microtiming offset. Feel (swing ratio, playing behind the beat, pushes) is expressed through the offset and through placement chosen by the style, so it stays inspectable as data. Design this in from the start; neo-soul and swing depend on it.
- Each note has pitch, duration, velocity, and a player id.
- Marker events carry section boundaries, chord changes, and plan landmarks ("last pass", "ending"), so the chart view and the MIDI file can both show them.

### 4.5 Player order and lookahead

Because the plan exists before any notes do, players are not real-time. They generate phrase by phrase with full knowledge of what is coming. The proposed order:

1. Drums and bass lay the foundation from the plan.
2. The soloist writes its phrases.
3. The chord player comps last, around both: filling the gaps the soloist leaves and locking with kick and snare.
4. Optionally, a light final pass lets drums add fills or accents that respond to phrases.

This order is a starting point. If a different one produces better scores, change it and log why.

### 4.6 Control inputs

The band takes its direction (energy, density, who is featured) from a small set of control values supplied by the plan. Keep this interface narrow and explicit. A future feature could feed the same inputs from live audio analysis of the user's playing. That feature is a non-goal now, but the seam should exist.

## 5. The players

`docs/MUSIC_NOTES.md` holds the detailed musical rules from the previous version. This section says what each seat must achieve and where the previous version fell short.

### 5.1 Drums and bass

These were the strongest parts before. Preserve that quality. Bass benefits from knowing each chord's function in the key (a V going to a I invites different approach notes than a static vamp), which the chart model provides.

### 5.2 Chords (comping)

Previously acceptable but rhythmically weak, with voicings and register left partly to chance. Requirements:

- **A real voicing engine.** Smooth voice leading from chord to chord. A register floor so nothing muddy sits near the bass. A ceiling that stays under the soloist. Style-appropriate shapes: rootless voicings in jazz, triads and smaller shapes elsewhere.
- **Rhythm as conversation.** Comping reads the soloist's phrases and the drum part, and places itself accordingly.
- **Instrument idioms.** The chord seat is an instrument, not a generic part: keys, electric guitar, acoustic guitar. A strummed acoustic guitar has strum direction, string order, and open voicings. The seat's interface must allow different idioms to produce very different note patterns from the same harmony.

### 5.3 Soloist

The weakest part before, with high variance: sometimes excellent, sometimes aimless wandering or phrases that feel out of place. Brandon uses it as a practice partner that plays interesting melodies over the changes and occasionally throws him off. Requirements:

- **Generate in phrases, not notes.** A motif, a repetition, a variation, an answer, space. Phrases must know about earlier phrases. A solo has an arc of register and density across a pass and across the jam.
- **Target notes.** Phrases aim at strong chord tones on the changes.
- **Candidates and selection.** For each phrase slot, generate several candidates and let the critic choose. The good output already exists in the distribution; selection moves the average toward it.
- **Instrument idiom.** Phrasing fits the instrument. A horn-like voice breathes. A keyboard voice need not.
- **Instrument choice is the user's.** Default to instruments that sample convincingly (piano, electric piano, organ, vibraphone). Do not auto-pick by genre.

### 5.4 Anticipation belongs to the style

Charts notate harmony on the beat. Pushing a chord early is something a rhythm section does because of the style (a swing pianist anticipating by an eighth, a salsa bassist arriving a beat ahead, a funk band pushing the "and" of four). Players apply anticipation according to the style pack. This is what lets one chart play correctly in every style. The chart format can still express unusual composed syncopation explicitly; see the format spec.

## 6. The critic

A set of pure scoring functions over generated material. Two uses:

1. **Selection** inside players (choose the best of N candidate phrases, voicings, fills).
2. **Evaluation** across many seeds, reported as a scorecard by the CLI. This is how progress is measured, since nobody can listen to 200 takes.

Starting metrics, to be refined against `MUSIC_NOTES.md` and feedback from listening gates:

- **Soloist:** chord-tone landing on changes, relatedness of a phrase to recent motifs, contour shape, density against the section's target energy, breathing room, range, repetition without stagnation, resolution of large leaps.
- **Comping:** voice-leading distance, register bounds, overlap with the soloist's rhythm (lower is better), alignment with kick and snare.
- **Bass:** root or strong tone at chord changes, quality of approach notes, range.

Keep metrics individually simple and named for what a musician would say. Weights live in the style pack.

## 7. Styles

Target list: blues, jazz, funk, rock, disco, neo-soul, reggae, acoustic (singer-songwriter feel with a relaxed house band).

**Build order:** blues, jazz, funk first. Together they exercise every axis the engine needs: shuffle and swing versus a straight sixteenth grid, simple versus dense harmony, walking versus syncopated bass, call-and-response phrasing. If the engine and data split is right, the rest are mostly data:

- **Rock:** near blues, straight eighths.
- **Disco:** near funk, four on the floor, octave bass.
- **Neo-soul:** jazz harmony over a behind-the-beat pocket. Depends on microtiming.
- **Reggae:** inverted emphasis (one drop, offbeat skank, melodic bass). A good check for hidden assumptions that beat one is strong.
- **Acoustic:** the difficulty is the strummed guitar idiom, not the theory.

A style pack contains at least: groove vocabulary per player, feel and microtiming, voicing rules, bass behavior, anticipation habits, ending strategies, a default arrangement arc for jam mode, critic weights, default instruments, and a mix preset.

**Hard rule:** adding a style changes data only. Stage 4 exists to prove this.

## 8. Library

A set of built-in charts: blues forms in several flavors, common pop and jazz progressions, and standard forms. They are ordinary `.chart` files in the same format the user writes, stored in the repo. Chord changes and form only: no melodies, no lyrics.

## 9. Export

- A Standard MIDI File, type 1: one track per player, plus tempo and time signature.
- Drums on channel 10 with General MIDI note mapping, so any drum instrument plays them sensibly.
- Section names and chord symbols written as markers or text events.
- The file contains the performance as played, including anticipation and microtiming.
- The target is "drag into a new Logic Pro project and get usable tracks." Verify what Logic does with markers and tempo at the first gate, and adjust.
- Write the MIDI encoder in the engine or CLI layer with minimal dependencies. The format is small.

## 10. Audio

A separate package that consumes events. It contains no music theory.

- **Sampler** over permissively licensed instrument packs (supplied by Brandon at stage 5; keep each pack's license file alongside it and record sources in the repo).
- **Scheduler** that reads ahead in the event stream against the Web Audio clock. The clock is injected, so timing logic can be checked with fake time.
- **Mixer** that makes separately recorded packs sound like one band:
  - loudness measured once per pack at ingestion and stored as metadata
  - one shared reverb send, so everything sits in the same room
  - high-pass on everything except bass and kick, low end centered
  - light compression and a limiter on the master bus
  - a mix preset per style
- Previous assessment of the sounds: piano, drums, and bass are good; overall mix coherence is the weak point; lead instruments that depend on expressive transitions (sax, trumpet, lead guitar) sound unconvincing from static samples.

## 11. The app

A static, installable PWA that works offline. No server.

**Views:**

- **Library.** Built-in and user charts. Starting a jam from here takes one or two taps.
- **Editor.** Text on one side, the rendered chart on the other, updating as you type, with diagnostics shown in place. On touch devices, a key row above the keyboard supplies the format's special characters (`|`, `.`, `%`, `#`, `b`, `/`, `:`, `[`, `]`).
- **Play.** The chart, plus transport, style, tempo, key, and jam length. Requirements for the chart display:
  - The whole form fits on one screen at any size. No scrolling during play.
  - Four bars per line by default, so phrase structure is visible.
  - Compact chord typography: large root, smaller quality and extensions, one consistent symbol set.
  - A playhead that highlights the current bar and gives the next change slight emphasis.
  - Chord display as names, numerals, or both stacked.
  - A thin status strip: pass N of M, time remaining, a clear "last pass" cue, the energy arc of the plan, and whether the soloist is playing or laying out.
  - On phones, a focus mode showing only the current and next line, large.
- **Arrangement grid** (later stage). Sections as columns, players as rows, each cell off or an intensity level, with a per-section energy value that sets defaults. This is the editor for layer two.
- **Takes.** Save a seed, replay it, export it.

The chart display follows the long-standing lead-sheet grid convention. Give the app its own visual identity; do not imitate another product's look.

**Storage:** charts are stored as text in the browser, with import and export as plain files.

**Input:** laptop first, but everything must work well on a phone, which is the device that sits next to the instrument.

## 12. Stack and repository

Chosen for ease of agent development and verification.

- **TypeScript, strict.** One repo, workspace packages:
  - `packages/engine`: parser, theory, planner, players, critic. Pure. Aim for zero runtime dependencies.
  - `packages/cli`: `parse`, `fmt`, `render`, `score`. Runs in Node.
  - `packages/audio`: sampler, scheduler, mixer on Web Audio.
  - `packages/app`: Vite and React single-page app, PWA.
- **Boundaries enforced by tooling**, not convention (project references, lint rules, or both).
- **No server-rendering framework.** Nothing here needs a server.
- **Styles and library charts are data files** in the repo, loaded by the engine through an explicit interface.
- Package manager, linter, and formatter are the agent's choice. Use current stable versions and verify them; do not rely on memory.

### CLI sketch

```
ensemble parse  <chart>                          diagnostics and the parsed model as JSON
ensemble fmt    <chart>                          canonical printing
ensemble render <chart> --style S --seed N [--minutes M | --passes P] --out take.mid
ensemble score  <chart> --style S --seeds 200    critic scorecard across seeds
```

The CLI is the main feedback loop during the engine stages, and it is a first-class deliverable.

## 13. Non-goals

- Listening to the user's playing (audio or MIDI input) and reacting to it.
- Any server, accounts, sync, or sharing.
- Convincing wind or lead-guitar sounds in the browser.
- Melody or lyric entry.
- Live MIDI output to a DAW. File export only for now.
- Feature parity with the previous version. Thirteen genres existed; eight are planned, three first.
- Notation of hits, stops, and kicks. The format reserves syntax; nothing implements it yet.

## 14. How to work

- Follow `docs/MILESTONES.md`. Each stage ends with audition files and a short report for a human listening gate.
- Follow `docs/TESTING.md`. It is binding.
- Keep `DECISIONS.md` at the repo root: date, decision, one line of why. Include every place you departed from these docs.
- Prefer a small, legible codebase over a clever one. Brandon reads the code.
- When a listening gate produces feedback, restate it as a property or critic metric, confirm the current build fails it, then fix.

## 15. Open questions to resolve and log

- Exact event and plan types.
- Whether the arrangement lives in the chart file or beside it (the format spec sketches the first option).
- How style packs are represented (typed TS data versus JSON) and validated.
- How far the planner's jam arc should vary by seed versus being fixed per style.
- Browser storage mechanism for charts and takes.
