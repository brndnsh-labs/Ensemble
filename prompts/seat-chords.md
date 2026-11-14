# Prompt: build the chord seat (stage 2)

A brief for a subagent. Sibling of `prompts/seat-drums.md` and `prompts/seat-bass.md`.

---

Build the chord seat of a generative backing band: a voicing engine, a comping player with a keyboard idiom, the blues piano data it plays, and the critic's measures for comping. The project is at the repo root (Ensemble: a ground-up rewrite, TypeScript, stage 2 of 6). Drums and bass exist and are worth reading as models of how a seat is built here.

Nobody on this project can hear the output except the owner, who will audition MIDI files in Logic Pro and ask three questions of your work:

- Do the voicings sit in a good register, clear of the bass?
- Do chord changes move smoothly, without jumps?
- Is the comping rhythm varied and locked with the drums, or does it sound like a loop?

In the previous version, comping was "acceptable but rhythmically weak, with voicings and register left partly to chance". The voicing side had become good by the end (a penalty-based chooser, described in the notes); the rhythm side never did. The notes record that nothing ever measured "whether the comp's rhythm has a shape over four bars" (ME-29), and that the one attempt at phrase-planned comping (statement, displaced answer, return, settle) was dropped without a listening verdict (KF-B-31). Rhythm is where you are expected to do better than the old band, on purpose.

## Read first

Project rules and design: `CLAUDE.md`, `PLAN.md`, `DECISIONS.md`, `docs/MUSIC_NOTES.md`, and sections 4 to 7 of `docs/BRIEF.md` (5.2 is your seat; 6 is the critic).

The musical knowledge (domain knowledge, not a design to copy; cite rule IDs in comments where a rule explains a choice):

- `docs/music-notes/b-comping-soloist.md`: "Cross-cutting rules" (all of it: register slots, low-interval limits, guide tones, chord scales, chord identity, the eighth-note rule for early notes); all of "Chords (comping)" (voicing vocabulary, keyboard voicing selection with its penalties in CH-15 to CH-18, rhythm, sustain, "With a soloist", endings, known weaknesses; skim "Guitar" to see what a later idiom needs); the comping parts of "Known failures and things tried"; and under "What separates a good phrase or voicing from a bad one": "Voicings" and "Comping rhythm".
- `docs/music-notes/c-styles.md`: "How to read the grids", and in "Style: blues": tempo and feel, chords (piano: ST-blues-29 to ST-blues-33; the guitar and organ entries are for later), anticipation (ST-blues-46 to ST-blues-51), endings. Skim jazz and funk chords to see what the data format must later express.
- `docs/music-notes/d-audit-history-sounds.md`: "Measuring quality", ME-01 to ME-29. Read this before writing any measure. Its lessons are requirements here: measure at the musical event, choose the denominator a musician would, know the chance level, never report a rate without its number of cases, and report shapes where an average would hide a split (ME-11: an average top-note movement of 1.19 semitones hid 65% holds and 14% leaps).

The code you build on, all in `packages/engine/src/`:

- `players/drums/` and `players/bass/`: how a seat is laid out (style type, player, data-fitting, validation), and `packages/styles/src/blues/` for how its data is written.
- `style/types.ts`, `plan/types.ts`, `perform/notes.ts` (`WrittenNote`, `Player`, `PlayerContext` with `heard.drums`, `heard.bass` and, from stage 3, `heard.solo`; `heldRng`), `perform/harmony.ts` (arrivals), `perform/grid.ts`, `perform/meter.ts`, `perform/feel.ts`, `perform/perform.ts` (where players are registered; the order is drums, bass, solo, chords).
- `theory/chord.ts` (`chordTones` with roles, `chordFamily`), `theory/scale.ts` (`chordScale`), `theory/pitch.ts`.
- `critic/types.ts` (`Feature`, `Measure`, `Target`, `CriticStyle`), `critic/choose.ts` (`score`, `choose`: the lowest weighted sum of features wins, ties to the earliest candidate), `critic/read.ts`, `critic/measures/` (the existing drum, bass and band measures, as models), `critic/scorecard.ts`.

## Deliver

1. **`players/chords/style.ts`**: the `ChordStyle` type, plain data with no functions. It carries, per energy tier where it varies:
   - the **voicing kind**: which tones a chord is voiced with, as a recipe fitted to the chord by conditions (the way the bass fits tones): rootless and close position now (ST-blues-29, ST-blues-32, CH-03, CH-06, CH-07), with room for stabs, shells, spreads, and drop voicings later as data;
   - the **register**: floor, ceiling, and target for the top voice;
   - the **rhythm book**: written figures with weights (ST-blues-30), their articulation (ST-blues-31), and how a phrase of several bars is built from them;
   - **anticipation**: the chance of pushing a barline change per tier and the mode for a mid-bar change (ST-blues-46 to ST-blues-48, CH-36, CH-40, CH-41);
   - the **idiom**: which instrument the seat is being. Only `keys` is built now, but the seat's interface must let a strummed guitar later produce a very different note pattern from the same harmony (strum direction, string order, one grip held until the next chord), so do not let "a list of struck chords with a voicing each" be the only shape a part can have.
2. **`players/chords/`**: `playChords: Player`, registered in `perform/perform.ts` (you may edit that one registry line). It must handle:
   - **Voicing by candidates and selection.** Generate the candidates (CH-15) and choose with `choose()` over features (CH-16: notes outside the slot, distance of the top voice from its target, movement from the previous voicing, movement of the top voice, minor ninths and minor seconds between voices, low-interval limits), weights from `style.critic.weights.voicing`. Features are exported so the scorecard and the gate report can show them. Voicing has no randomness.
   - **Hard rules that are not preferences**: nothing below the floor (X-B-02); chord identity (X-B-13: the third or suspension, the seventh or sixth, and any written alteration always sound; root and fifth are given up first); no pitch class the chord symbol rules out; the bass has the root.
   - **Rhythm by candidates and selection, at the level of the phrase.** For each phrase, build several candidate plans from the style's figures (for example: a figure, itself again, a variation, an answer; or the section's own figure with one bar turned), and let the critic choose with features such as: strikes that land with the kick or snare the drummer actually played; strikes that collide with the soloist's notes (zero when no soloist is heard, so it is ready for stage 3); how busy the phrase is against the bar's energy; whether the phrase has a shape (a bar that returns, a bar that differs) instead of four identical bars or four unrelated ones; and how the plan sits against the previous phrase. Weights from `style.critic.weights.comping`. The section keeps its identity (X-B-14: figures belong to sections), so think about what is held per section and what the phrase is free to vary; say what you chose.
   - **Every chord the chart writes is struck at least once** (CH-34); one hand, one chord (CH-35); nothing pitched under N.C.; the eighth-note rule for early chords (X-B-07); anticipation as the notes describe, including that a pushed chord is not struck again on the beat and the outgoing chord is never stabbed in the eighth before a change (CH-40), with the pump's exception (CH-41).
   - **The ending bar**: one full chord where the final chord lands, in the style's gesture (EN-14 to EN-21 in part A: hold rings for `ending.ring`; stop is an eighth; soft is quieter; button and hits as described), never anticipated.
   - Count-in and tail bars: nothing. A bar where the seat is out: nothing. Meters other than 4/4: something plain and correct.
3. **`packages/styles/src/blues/chords.ts`**: the blues piano as data, from the notes, with comments in a musician's words; and the comping and voicing weights and targets added to `packages/styles/src/blues/critic.ts`. Wire `chords` into the blues pack in `packages/styles/src/blues/index.ts` and into `StylePack` in `style/types.ts` (one field each; say so in your report).
4. **`critic/measures/chords.ts`**, added to `critic/measures/index.ts`: take-level measures for the scorecard, each with a `says` sentence a pianist would agree with. At least: how the top voice moves at a change (as shares of holds, steps, and leaps, not only a mean); the lowest note against the floor and against the bass; how many strikes a bar by tier; the share of strikes that land with a kick or snare; the share of changes anticipated (ST-blues-51 gives the band the old piano was held to); the share of chords carrying a ninth or thirteenth (CH-14); how often a bar's rhythm is the bar before it again, and how often a phrase's is the phrase before it again (the "does it sound like a loop" question, asked both ways: too much repetition and too little are both failures). Put targets in the blues critic data, each labelled `intent` or `measured`, with `minCases` where a rate needs it.
5. **`validateChordStyle(chords): string[]`**, called from `style/validate.ts` (one line there).

## Rules of the house

- **Random draws by position, not sequence.** Every random choice comes from `heldRng(...)` or `rng.fork(...)` keyed by a purpose and a place in the music. Never draw two decisions from one stream in sequence. What may be carried forward in order is what a pianist really carries: the previous voicing, the previous phrase's rhythm. Nothing in a pass may depend on later passes beyond `plan.lookahead`; an open jam extended by one pass must leave every earlier note unchanged, and that is tested.
- **Straight grid, written levels.** Write on the straight sixteenth grid at written velocities; `feel.ts` swings, leans, humanizes, and scales by energy afterwards. The blues grid is swung into triplets afterwards: the written "and" is the last note of the triplet, and nothing is written on the "a".
- **Every note starts inside its own bar**; nothing is written into `plan.lookahead`.
- **A figure is chosen whole**, never strike by strike (X-A-31). "Deterministic is not the same as musical": the owner once described chance-placed offbeat strums as "not musical, like math.random" (EAR-27).
- The engine is pure and has no dependencies. Strict TypeScript 7 with `erasableSyntaxOnly`, `verbatimModuleSyntax`, `.ts` import extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Prefer a small, legible codebase over a clever one. The owner reads the code. Comments say why, in musical terms.
- **Do not write tests.** The main session owns the suite. `pnpm test` must still pass with your seat playing (it runs properties over every seat: determinism, plan extension, nothing past the end, nothing under N.C., a valid MIDI file). If one fails because of your work, fix your work; if you believe the test is wrong, say so and leave it. Verify your own seat with a throwaway script and `pnpm -s ensemble score`.

## Boundaries

- Yours: `packages/engine/src/players/chords/**`, `packages/engine/src/critic/measures/chords.ts`, `packages/styles/src/blues/chords.ts`, and the single-line registrations named above (`perform/perform.ts`, `style/types.ts`, `style/validate.ts`, `critic/measures/index.ts`, `packages/styles/src/blues/index.ts`, `packages/styles/src/blues/critic.ts`, and exports in `packages/engine/src/index.ts`).
- Not yours: the planner, feel, drums, bass, theory, the test folder, `docs/`. If you need a change there, stop short of making it and say exactly what and why. Another session may be editing the planner, drums, or bass at the same time in response to a review.
- Do not commit. Do not run `pnpm goldens` or `score --update`: the golden takes and the baseline will change because a new seat is playing, and the main session accepts those.

## Verifying without ears

Write throwaway scripts outside the repo. Render library charts (`render` from the engine, the blues pack from `@ensemble/styles`) across seeds, levels (`energy: 0.3`, `0.55`, `0.85`) and a timed jam, and print each bar: the chord, the voicing as note names low to high, the rhythm as a grid, with the kick and snare underneath it. Read it as a pianist would. Then count across many seeds and all library charts: the lowest note ever played; the largest top-voice leap and how often it exceeds a fourth; chords with a missing third or seventh; a chord tone the symbol rules out; changes with no strike; strikes under N.C.; how many distinct rhythm bars a chorus has; how often consecutive phrases are identical. Use `pnpm -s ensemble score --seeds 200` to see your measures as distributions and find your worst takes, then go and read those takes.

## Report back

Short and factual: the files; the shape of `ChordStyle` in a few lines, and how a funk stab part and a strummed acoustic guitar would later be expressed; how a phrase of comping is built and chosen, with the features and the weights you settled on and why; every judgment call where the notes were unclear or you departed from them (one line each, with the rule ID); the counts from your checks and the scorecard lines for your measures; the musical properties you believe always hold, stated as a musician would (these become property tests); anything you wanted to change outside your boundary; and what you would ask the owner to listen for.

---

## Built in two parts

The seat is built by two agents in sequence, so that the rhythm, which is the hard design problem, gets a session to itself. Everything above is the specification for the whole seat; this section says who builds what and where the two parts meet.

### The seam

A comping part is made in three steps, and each step is its own module:

1. **Rhythm** decides where the hand strikes: a list of strikes, each with its bar, tick, length, written level, the chord arrival it plays (for a push, the chord that is coming), and the voicing kind it asks for (a pump bar asks for close position, ST-blues-32).
2. **Voicing** decides which pitches a strike gets: the kind's recipe fitted to the chord, then candidates and `choose()`, led from the previous strike's voicing. It knows nothing about rhythm.
3. **Idiom** turns a strike and its voicing into written notes. For `keys` that is every pitch at once. A strummed guitar would later answer the same call with one grip rolled across its strings, held from strike to strike, with direction read from the grid; that is why the idiom, not the player, owns both "what a voicing candidate is" and "how a strike becomes notes".

`play.ts` runs the three in order and owns nothing musical itself.

### Part 1: voicing (built first)

- `style.ts` with everything except the rhythm book and anticipation: voicing kinds as recipes (rootless and close now), register, idiom, and the ending levels (CH-74). Leave a clearly marked place for part 2's fields.
- The voicing engine as specified under "Voicing by candidates and selection" and "Hard rules", with exported features; weights from `style.critic.weights.voicing`.
- The `keys` idiom.
- A **plain rhythm** in place of the rhythm book: one strike on every chord arrival, held most of the way to the next (the blues "pad", ST-blues-31 low), nothing under N.C., nothing in count-in, tail, or a bar the seat sits out. This stays in the finished seat as what a meter other than 4/4 gets, and it makes a voicing-only audition possible: Brandon can hear register and voice leading with no rhythm in the way.
- The ending bar (one full chord where the final chord lands, in the style's gesture, never anticipated).
- `packages/styles/src/blues/chords.ts` (voicing, register, idiom, ending), the voicing weights in the blues critic data, `validateChordStyle`, and all the single-line registrations.
- In `critic/measures/chords.ts`, the voicing measures: how the top voice moves at a change (shares of holds, steps, small leaps, leaps over a fourth; Q-04, Q-05, ME-11); the lowest note against the floor and against the highest bass note sounding with it; the mean lowest note (Q-09, CH-19); the share of chords carrying a ninth or thirteenth (CH-14, Q-08); written tensions actually sounded (Q-07); voicings with a fault from Q-03; hand width against neighbours (Q-06). Targets in the blues critic data.
- Not in part 1: the rhythm book, phrase planning, anticipation, the comping features and weights, the rhythm measures. Do not sketch them.

### Part 2: rhythm (built second, on top of part 1)

- The rhythm book, its articulation, and anticipation in `style.ts` and the blues data.
- "Rhythm by candidates and selection, at the level of the phrase" as specified, replacing the plain rhythm in 4/4, with exported features and weights from `style.critic.weights.comping`.
- Every rule in the "Every chord the chart writes is struck" paragraph, including the pump's switch to close position and its exception to the anticipation rule.
- The rhythm measures: strikes a bar by tier; the share of strikes landing with a kick or snare; the share of changes anticipated; how often a bar's rhythm is the bar before it again, and a phrase's the phrase before it; and whether a phrase has a shape (ME-29).
- Part 2 may change part 1's `play.ts` and the strike type where the rhythm needs it, and must leave the voicing engine's behaviour alone: for the same sequence of strikes it gives the same voicings.
