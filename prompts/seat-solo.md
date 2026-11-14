# Prompt: build the soloist (stage 3)

A brief for a subagent. Sibling of `prompts/seat-drums.md`, `prompts/seat-bass.md` and `prompts/seat-chords.md`.

---

Build the soloist of a generative backing band: a player that improvises a solo in phrases, with motif memory, target notes, and an arc, choosing each phrase from candidates with the critic; the blues data it plays; and the critic's measures for it. The project is at the repo root (Ensemble: a ground-up rewrite, TypeScript, stage 3 of 6). Drums, bass and the chord seat exist and are worth reading as models of how a seat is built here; the chord seat's phrase chooser (`players/chords/phrase.ts`, `critique.ts`) is the nearest relative of what you are building.

Nobody on this project can hear the output except the owner, who will audition ten seeds of a blues in Logic Pro, **including the three lowest-scoring ones**, and ask:

- Does the solo repeat and develop ideas?
- Do phrases relate to each other, and do they breathe?
- Are the worst takes still acceptable?
- Does comping leave room? (The comper's side of that is another session's work; yours is to leave room worth leaving.)

The gate's own title is "is the aimlessness gone?". In the previous version the soloist was the weakest part, with high variance: sometimes excellent, sometimes aimless wandering or phrases that felt out of place. **The floor matters more than the ceiling.** The owner uses it as a practice partner that plays interesting melodies over the changes and occasionally throws him off. Three soloists were built before this one, and the notes record what each got wrong and what was learned; read those sections as the most valuable part of your reading.

## Read first

Project rules and design: `CLAUDE.md`, `PLAN.md`, `DECISIONS.md` (the newest sections: the chord seat, and "who is featured"), `docs/MUSIC_NOTES.md`, and sections 4 to 7 of `docs/BRIEF.md` (5.3 is your seat; 6 is the critic).

The musical knowledge (domain knowledge, not a design to copy; cite rule IDs in comments where a rule explains a choice):

- `docs/music-notes/b-comping-soloist.md`: "Cross-cutting rules"; all of "Soloist"; under "Known failures and things tried" the three soloist sections (the first band, the intermediate "phrase-first" soloist, the last band); under "What separates a good phrase or voicing from a bad one" the three soloist sections and "Not measured by the old band; implied by its failures" (Q-43 to Q-47 are things nobody measured and you should); and "Surprises".
- `docs/music-notes/c-styles.md`: "How to read the grids", and in "Style: blues" the soloist entries (from ST-blues-35 or so to ST-blues-45) with tempo and feel. Skim the jazz and funk soloist entries to see what the data format must later express.
- `docs/music-notes/d-audit-history-sounds.md`: "Measuring quality", ME-01 to ME-29, before writing any measure. ME-22 to ME-29 are about the soloist. Its lessons are requirements: measure at the musical event, choose the denominator a musician would, know the chance level, never report a rate without its number of cases, report shapes where an average would hide a split.
- `docs/music-notes/a-rhythm-section.md`: the endings notes that mention the soloist (SO-59 points there).

The code you build on, all in `packages/engine/src/`:

- `plan/types.ts`: `PlanBar.solo` (a `SoloMark`: which chorus of its solo this bar is in, and how many the solo has) and `PlanBar.seats.solo` (the energy, or null where the soloist lays out). The plan decides where you play; `plan/plan.ts`, `soloMarks`, is how. `PlanOptions.solo` turns the soloist on (CLI: `--solo`).
- `perform/notes.ts` (`WrittenNote`, `Player`, `PlayerContext` with `heard.drums` and `heard.bass`; `heldRng`), `perform/harmony.ts` (arrivals, `contextOf`), `perform/grid.ts`, `perform/meter.ts`, `perform/feel.ts`, `perform/perform.ts` (where players are registered; the order is drums, bass, solo, chords, so you hear drums and bass and the comper hears you).
- `theory/chord.ts` (`chordTones` with roles), `theory/scale.ts` (`chordScale` by quality and function), `theory/pitch.ts`.
- `critic/types.ts`, `critic/choose.ts` (`score`, `choose`), `critic/read.ts`, `critic/measures/` (models: `comping.ts` and `chords.ts`), `critic/scorecard.ts`.
- `players/chords/` for how a seat with candidates and selection is laid out, and `packages/styles/src/blues/` for how its data is written.

## Deliver

1. **`players/solo/style.ts`**: the `SoloStyle` type, plain data with no functions: the rhythm vocabulary, the phrase shapes and their weights by density, the habits and their chances, the arc over a solo's choruses, how much space the style leaves, and whatever else the blues entries need. A jazz or funk soloist must later be expressible as data alone.
2. **The instrument, as data.** Range, home register, and whether it breathes (BRIEF 5.3: "a horn-like voice breathes; a keyboard voice need not"). Build two so the seam is real: a vibraphone (the default for the gate files: it samples convincingly and its pitch and rhythm are easy to hear in an audition) and an alto sax (SO-01), which must breathe. The instrument is the user's choice, not the style's: add `soloInstrument?: string` to `TakeOptions` (in `take.ts`) overriding the style's default, and make the MIDI export use the instrument's General MIDI program (a minimal change in `midi/export.ts`; say what you changed). No pitch bend exists in the event model: scoops, falls, bends and slides are out of scope. Say which rules you could not express without them.
3. **`players/solo/`**: `playSolo: Player`, registered in `perform/perform.ts`. What it must do:
   - **Plan in phrases, never notes** (SO-03, SO-08): a phrase is planned whole before any note is chosen; rhythm before pitch; targets first, then the line between them.
   - **Target notes**: a note struck on a chord change is a chord tone, by rule and never by weighted chance (SO-02, X-B-06). Strong beats lean on chord tones. Passing notes come from the chord's scale (`chordScale`), so the soloist, the comp and the bass read the same harmony.
   - **Motif memory**: a phrase knows the phrases before it. Statement, repetition, variation, answer, and space are things your phrase plan can ask for by name, and a listener should be able to hear an idea come back changed. The notes' Q-43 (rhythmic coherence inside a phrase) and the phrase-to-phrase section say what "related" means; decide what is remembered (a rhythm, a contour, a pitch cell, where the phrase landed) and say so.
   - **An arc** of register and density across a chorus and across the solo (SO-05 to SO-07), read from `bar.solo.chorus` and `bar.solo.of`. A solo of one or two choruses still has a shape and still peaks once, near its end. Energy moves density, not register (SO-06).
   - **Space** (SO-10, SO-11, Q-47): limits on silence as the notes give them, and breath that makes sense in seconds at slow and fast tempos. The breathing instrument must breathe.
   - **Candidates and selection.** For each phrase slot generate several candidate phrases and let the critic choose with `choose()` over exported features, weights from `style.critic.weights.solo`. Candidates should differ in ways that matter (a repetition of the motif, a variation of it, an answer, something new), not be the same recipe with different dice. Features are the place for: landing on a chord tone at the phrase's end and at changes; relatedness to recent motifs, with both too little and too much costing; contour (a shape, a high point that falls on a note that deserves it, Q-45); density against the bar's energy and the arc; breathing room; range and where the phrase sits against the arc's register; large leaps resolved; repeated-note and trill stagnation. Keep each feature simple and named for what a musician would say.
   - **The ending** (SO-59): where the soloist is playing into the final chord, its last note lands on a resting tone of the chord the band holds and rings or stops with the band's gesture.
   - Where `bar.solo` is null: nothing. Count-in and tail: nothing. Nothing pitched under N.C. One voice: each note ends before the next begins. Every note inside the instrument's range.
   - **Not in scope**: the head (SO-04; decided, see `DECISIONS.md`), trading (SO-58), pitch-bend expression. Do not build them, and do not let the phrase planner assume a head exists.
4. **`packages/styles/src/blues/solo.ts`**: the blues soloist as data, from the notes, with comments in a musician's words; the solo weights and targets added to `packages/styles/src/blues/critic.ts`. Wire `solo` into the blues pack and into `StylePack` (one field each).
5. **`critic/measures/solo.ts`**, added to `critic/measures/index.ts`: take-level measures for the scorecard, each with a `says` sentence a soloist would agree with. From BRIEF section 6 and the notes' Q-list, at least: chord tones on changes and at phrase ends; chord tones on beats; phrases that relate to an earlier phrase, and phrases that are the phrase before again; rhythmic coherence inside a phrase (Q-43); the share of empty bars and the shape of breaths (how many are two bars or more, SO-10); notes per second by chorus of the solo (the arc: the last chorus against the first); where the highest note of the solo falls; leaps wider than a fifth and whether they resolve; trills and repeated-note runs; range used. Targets in the blues critic data, each labelled `intent` or `measured`, with `minCases` where a rate needs it. A measure returns null for a take with no soloist.
6. **A per-take "how did this solo go" number**: the mean cost of the chosen phrases under the style's weights, as a reported-only measure (`solo.cost`), so the scorecard's worst-takes list can name the three lowest-scoring seeds for the gate. Say what a bad value of it looks like when you read the take.
7. **`validateSoloStyle(solo): string[]`**, called from `style/validate.ts`.

## Rules of the house

- **Random draws by position, not sequence.** Every random choice comes from `heldRng(...)` or `rng.fork(...)` keyed by a purpose and a place in the music. Never draw two decisions from one stream in sequence. What may be carried forward in order is what a soloist really carries: what it has played so far in this solo. An open jam extended by one pass must leave every earlier note unchanged, and that is tested; so nothing in a chorus may depend on later passes, and a solo in an open jam always believes it has three choruses (`bar.solo.of` already says so).
- **Straight grid, written levels.** Write on the straight sixteenth grid at written velocities; `feel.ts` swings, leans, humanizes, and scales by energy afterwards. The blues is swung into triplets afterwards: the written "and" is the last note of the triplet, and nothing is written on the "a" (a property tests this for every seat). If the blues soloist needs real triplets (three notes in a beat), say exactly what the grid would need and do not hack around it.
- **Every note starts inside its own bar**; nothing is written into `plan.lookahead` (read it to aim the last phrase of an open pass at what comes next).
- **A phrase is chosen whole.** "Deterministic is not the same as musical": the owner once described chance-placed notes as "not musical, like math.random" (EAR-27).
- The engine is pure and has no dependencies. Strict TypeScript 7 with `erasableSyntaxOnly`, `verbatimModuleSyntax`, `.ts` import extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Prefer a small, legible codebase over a clever one. The owner reads the code. Comments say why, in musical terms.
- **Cost.** The suite renders about 300 takes inside a 10-second budget and is at 6.4 s; the main session will add takes with the soloist on. Keep a take with a solo within about twice the cost of the same take without one. Generate candidates cheaply and score them once.
- **Do not write tests.** The main session owns the suite. `pnpm test` must still pass with your seat registered (with the soloist off by default nothing changes; the main session will turn it on in the suite when you land). Verify your own seat with throwaway scripts and `pnpm -s ensemble score`. Note that `score` renders without a soloist today: to see your measures, make the scorecard's kinds of take include solos, in `packages/cli/src/commands/score.ts` (a minimal change: say what you did), and expect the baseline comparison to report the new measures as new.

## Boundaries

- Yours: `packages/engine/src/players/solo/**`, `packages/engine/src/critic/measures/solo.ts`, `packages/styles/src/blues/solo.ts`, and the registrations named above (`perform/perform.ts`, `style/types.ts`, `style/validate.ts`, `critic/measures/index.ts`, `take.ts` for the instrument option, `midi/export.ts` for the program, `packages/styles/src/blues/index.ts`, `packages/styles/src/blues/critic.ts`, exports in `packages/engine/src/index.ts`, and the kinds of take in `packages/cli/src/commands/score.ts`).
- Not yours: the planner, feel, drums, bass, the chord seat, theory, the test folder, `docs/`, and the rest of the CLI (another session is adding save and replay to `packages/cli` at the same time; do not touch `render.ts` or `main.ts`). If you need a change there, stop short of making it and say exactly what and why.
- The comper will be taught to lay out under you and answer your breaths after you land (CH-59 to CH-72). You do not build that. Do say what the comper can rely on: how to find your phrases and your breaths from your notes alone.
- Do not commit. Do not run `pnpm goldens` or `score --update`.

## Verifying without ears

Write throwaway scripts outside the repo. Render with `render(text, style, { mode: "jam", minutes: 3, seed, solo: true })` (six choruses of the 12-bar: the band alone, a three-chorus solo, a chorus of rest, a one-chorus solo into the ending) and with `passes: 4` (the band, then a three-chorus solo to the end). Print each phrase: the chords, the notes as names with their rhythm on a grid, the phrase's role (statement, repetition, variation, answer), its candidates with their features and costs, and which one was chosen. Read it as a soloist would: can you sing the idea back, does it return, does the line go somewhere, does it breathe, is there one peak.

Then count across many seeds and all library charts, at slow and fast tempos (`tempo: 60`, `tempo: 160`) and at each level: notes on a change that are not chord tones; notes outside the range; overlapping notes; notes under N.C. or where the soloist lays out; the longest silence inside a solo, in bars and in seconds; phrases that rest whole; the highest note and where it falls. Use `pnpm -s ensemble score --seeds 200` to see your measures as distributions, **find your worst takes, and go and read them**. Fix what makes the worst takes bad before polishing what makes the best ones good.

## Report back

Short and factual: the files; the shape of `SoloStyle` and of an instrument in a few lines, and how a jazz bebop line and a funk riff soloist would later be expressed; how a phrase is planned, how candidates differ, what is remembered between phrases; the features and weights you settled on and why.

**Selection against baselines, on the same seeds** (the stage is not done without this): the chosen phrases against the first candidate and against a random candidate, for each feature's mean and for each scorecard measure, as means and as the worst tenth of takes. And the ablation: each weight set to zero in turn, and what moved. A weight that moves nothing should not be there.

Then: every judgment call where the notes were unclear or you departed from them (one line each, with the rule ID); the counts from your checks and the scorecard lines for your measures; what your three worst takes look like when read, and whether you would call them acceptable and why; the musical properties you believe always hold, stated as a musician would (these become property tests); what the comper can rely on; anything you wanted to change outside your boundary; and what you would ask the owner to listen for.
